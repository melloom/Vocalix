-- Clip Upload Rate Limiting
-- This migration adds rate limiting for clip uploads per profile and IP address

-- ============================================================================
-- Clip Upload Tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.clip_upload_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE,
  ip_address INET,
  device_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  file_size_bytes BIGINT,
  duration_seconds INTEGER
);

-- Indexes for clip upload logs
CREATE INDEX IF NOT EXISTS idx_clip_upload_logs_profile ON public.clip_upload_logs(profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clip_upload_logs_ip ON public.clip_upload_logs(ip_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clip_upload_logs_device ON public.clip_upload_logs(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clip_upload_logs_created ON public.clip_upload_logs(created_at);

-- RLS for clip upload logs (only service role can access)
ALTER TABLE public.clip_upload_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only" ON public.clip_upload_logs;
CREATE POLICY "Service role only"
ON public.clip_upload_logs
FOR ALL
USING (false) -- Deny all public access
WITH CHECK (false);

-- ============================================================================
-- Functions for Clip Upload Rate Limiting
-- ============================================================================

-- Function to check clip upload rate limits
CREATE OR REPLACE FUNCTION public.check_clip_upload_rate_limit(
  p_profile_id UUID,
  p_ip_address INET DEFAULT NULL,
  p_max_per_hour INTEGER DEFAULT 10,
  p_max_per_day INTEGER DEFAULT 50,
  p_max_per_ip_per_hour INTEGER DEFAULT 20
)
RETURNS TABLE (
  allowed BOOLEAN,
  reason TEXT,
  retry_after TIMESTAMPTZ,
  clips_uploaded_last_hour INTEGER,
  clips_uploaded_last_day INTEGER,
  clips_uploaded_last_hour_by_ip INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clips_last_hour INTEGER := 0;
  v_clips_last_day INTEGER := 0;
  v_clips_last_hour_by_ip INTEGER := 0;
  v_last_upload TIMESTAMPTZ;
BEGIN
  -- Count clips uploaded by profile in last hour
  SELECT COUNT(*), MAX(created_at)
  INTO v_clips_last_hour, v_last_upload
  FROM public.clip_upload_logs
  WHERE profile_id = p_profile_id
    AND created_at > now() - interval '1 hour';
  
  -- Count clips uploaded by profile in last day
  SELECT COUNT(*)
  INTO v_clips_last_day
  FROM public.clip_upload_logs
  WHERE profile_id = p_profile_id
    AND created_at > now() - interval '24 hours';
  
  -- Count clips uploaded by IP in last hour (if IP provided)
  IF p_ip_address IS NOT NULL THEN
    SELECT COUNT(*)
    INTO v_clips_last_hour_by_ip
    FROM public.clip_upload_logs
    WHERE ip_address = p_ip_address
      AND created_at > now() - interval '1 hour';
  END IF;
  
  -- Check profile hourly limit
  IF v_clips_last_hour >= p_max_per_hour THEN
    RETURN QUERY SELECT
      false,
      format('Upload rate limit exceeded. Maximum %s clips per hour allowed. Please wait before uploading again.', p_max_per_hour),
      (SELECT MAX(created_at) + interval '1 hour' FROM public.clip_upload_logs WHERE profile_id = p_profile_id AND created_at > now() - interval '1 hour'),
      v_clips_last_hour,
      v_clips_last_day,
      v_clips_last_hour_by_ip;
    RETURN;
  END IF;
  
  -- Check profile daily limit
  IF v_clips_last_day >= p_max_per_day THEN
    RETURN QUERY SELECT
      false,
      format('Upload rate limit exceeded. Maximum %s clips per day allowed. Please try again tomorrow.', p_max_per_day),
      (SELECT MAX(created_at) + interval '24 hours' FROM public.clip_upload_logs WHERE profile_id = p_profile_id AND created_at > now() - interval '24 hours'),
      v_clips_last_hour,
      v_clips_last_day,
      v_clips_last_hour_by_ip;
    RETURN;
  END IF;
  
  -- Check IP hourly limit (if IP provided)
  IF p_ip_address IS NOT NULL AND v_clips_last_hour_by_ip >= p_max_per_ip_per_hour THEN
    RETURN QUERY SELECT
      false,
      format('Upload rate limit exceeded. Maximum %s clips per hour per IP address allowed.', p_max_per_ip_per_hour),
      (SELECT MAX(created_at) + interval '1 hour' FROM public.clip_upload_logs WHERE ip_address = p_ip_address AND created_at > now() - interval '1 hour'),
      v_clips_last_hour,
      v_clips_last_day,
      v_clips_last_hour_by_ip;
    RETURN;
  END IF;
  
  -- Allowed
  RETURN QUERY SELECT
    true,
    NULL::TEXT,
    NULL::TIMESTAMPTZ,
    v_clips_last_hour,
    v_clips_last_day,
    v_clips_last_hour_by_ip;
END;
$$;

-- Function to log clip upload
CREATE OR REPLACE FUNCTION public.log_clip_upload(
  p_profile_id UUID,
  p_clip_id UUID,
  p_ip_address INET DEFAULT NULL,
  p_device_id TEXT DEFAULT NULL,
  p_file_size_bytes BIGINT DEFAULT NULL,
  p_duration_seconds INTEGER DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO public.clip_upload_logs (
    profile_id,
    clip_id,
    ip_address,
    device_id,
    file_size_bytes,
    duration_seconds
  )
  VALUES (
    p_profile_id,
    p_clip_id,
    p_ip_address,
    p_device_id,
    p_file_size_bytes,
    p_duration_seconds
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;

-- Function to check cooldown period (30 seconds between uploads)
CREATE OR REPLACE FUNCTION public.check_clip_upload_cooldown(
  p_profile_id UUID,
  p_cooldown_seconds INTEGER DEFAULT 30
)
RETURNS TABLE (
  allowed BOOLEAN,
  reason TEXT,
  retry_after TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_upload TIMESTAMPTZ;
  v_cooldown_ends TIMESTAMPTZ;
BEGIN
  -- Get last upload time
  SELECT MAX(created_at)
  INTO v_last_upload
  FROM public.clip_upload_logs
  WHERE profile_id = p_profile_id;
  
  -- If no previous upload, allow
  IF v_last_upload IS NULL THEN
    RETURN QUERY SELECT true, NULL::TEXT, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;
  
  -- Check if cooldown period has passed
  v_cooldown_ends := v_last_upload + (p_cooldown_seconds || ' seconds')::interval;
  
  IF now() < v_cooldown_ends THEN
    RETURN QUERY SELECT
      false,
      format('Please wait %s seconds between uploads.', p_cooldown_seconds),
      v_cooldown_ends;
    RETURN;
  END IF;
  
  -- Allowed
  RETURN QUERY SELECT true, NULL::TEXT, NULL::TIMESTAMPTZ;
END;
$$;

-- ============================================================================
-- Cleanup Function for Old Logs
-- ============================================================================

-- Function to clean up old clip upload logs (older than 30 days)
CREATE OR REPLACE FUNCTION public.cleanup_clip_upload_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.clip_upload_logs
  WHERE created_at < now() - interval '30 days';
END;
$$;

-- ============================================================================
-- Trigger to Auto-Log Clip Uploads
-- ============================================================================

-- Function to automatically log clip uploads when clip is created
CREATE OR REPLACE FUNCTION public.trigger_log_clip_upload()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_device_id TEXT;
  v_ip_address INET;
BEGIN
  -- Try to get device_id and IP from request headers (if available)
  BEGIN
    v_device_id := current_setting('request.headers', true)::json->>'x-device-id';
    v_ip_address := (current_setting('request.headers', true)::json->>'x-forwarded-for')::INET;
  EXCEPTION
    WHEN OTHERS THEN
      v_device_id := NULL;
      v_ip_address := NULL;
  END;
  
  -- Log the upload (non-blocking)
  BEGIN
    PERFORM public.log_clip_upload(
      NEW.profile_id,
      NEW.id,
      v_ip_address,
      v_device_id,
      NULL, -- file_size_bytes (not available in trigger)
      NEW.duration_seconds
    );
  EXCEPTION
    WHEN OTHERS THEN
      -- Log error but don't fail the insert
      RAISE WARNING 'Failed to log clip upload: %', SQLERRM;
  END;
  
  RETURN NEW;
END;
$$;

-- Drop trigger if exists
DROP TRIGGER IF EXISTS trigger_log_clip_upload_on_clips ON public.clips;

-- Create trigger to log clip uploads
CREATE TRIGGER trigger_log_clip_upload_on_clips
AFTER INSERT ON public.clips
FOR EACH ROW
EXECUTE FUNCTION public.trigger_log_clip_upload();

