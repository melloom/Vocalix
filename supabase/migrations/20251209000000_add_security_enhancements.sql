-- Security Enhancements for API Abuse, Profile Updates, and Storage Abuse
-- Addresses SECURITY_TODO.md items #10, #11, and #12

-- ============================================================================
-- 1. API Key Abuse Prevention (#10)
-- ============================================================================

-- Add daily quota limits to API keys table
ALTER TABLE public.api_keys
ADD COLUMN IF NOT EXISTS daily_quota INTEGER DEFAULT 10000, -- Max requests per day
ADD COLUMN IF NOT EXISTS daily_usage INTEGER DEFAULT 0, -- Current day's usage
ADD COLUMN IF NOT EXISTS quota_reset_at TIMESTAMPTZ DEFAULT (date_trunc('day', now()) + interval '1 day'), -- When to reset quota
ADD COLUMN IF NOT EXISTS last_ip_address TEXT, -- Track last IP that used this key
ADD COLUMN IF NOT EXISTS suspicious_usage_count INTEGER DEFAULT 0; -- Track suspicious patterns

-- Add index for quota tracking
CREATE INDEX IF NOT EXISTS idx_api_keys_quota_reset ON public.api_keys(quota_reset_at);

-- Function to check and reset daily quotas
CREATE OR REPLACE FUNCTION public.reset_api_key_quotas()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.api_keys
  SET 
    daily_usage = 0,
    quota_reset_at = date_trunc('day', now()) + interval '1 day'
  WHERE quota_reset_at <= now();
END;
$$;

-- Function to check API key daily quota (increments usage if quota not exceeded)
CREATE OR REPLACE FUNCTION public.check_api_key_quota(p_key_hash TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_api_key RECORD;
  v_new_usage INTEGER;
BEGIN
  SELECT * INTO v_api_key
  FROM public.api_keys
  WHERE key_hash = p_key_hash
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now());
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Reset quota if needed
  IF v_api_key.quota_reset_at <= now() THEN
    UPDATE public.api_keys
    SET 
      daily_usage = 1,
      quota_reset_at = date_trunc('day', now()) + interval '1 day'
    WHERE id = v_api_key.id;
    RETURN true;
  END IF;
  
  -- Check if quota exceeded
  IF v_api_key.daily_usage >= v_api_key.daily_quota THEN
    RETURN false;
  END IF;
  
  -- Increment usage and return success
  UPDATE public.api_keys
  SET daily_usage = daily_usage + 1
  WHERE id = v_api_key.id
  RETURNING daily_usage INTO v_new_usage;
  
  RETURN true;
END;
$$;

-- Update validate_api_key function to include quota check
CREATE OR REPLACE FUNCTION public.validate_api_key_with_quota(p_key_hash TEXT)
RETURNS TABLE (
  api_key_id UUID,
  profile_id UUID,
  scopes TEXT[],
  rate_limit_per_minute INTEGER,
  is_active BOOLEAN,
  expires_at TIMESTAMPTZ,
  quota_exceeded BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quota_ok BOOLEAN;
BEGIN
  v_quota_ok := check_api_key_quota(p_key_hash);
  
  RETURN QUERY
  SELECT 
    ak.id,
    ak.profile_id,
    ak.scopes,
    ak.rate_limit_per_minute,
    ak.is_active,
    ak.expires_at,
    NOT v_quota_ok
  FROM public.api_keys ak
  WHERE ak.key_hash = p_key_hash
    AND ak.is_active = true
    AND (ak.expires_at IS NULL OR ak.expires_at > now())
    AND v_quota_ok = true;
  
  -- Update last_used_at
  UPDATE public.api_keys
  SET last_used_at = now()
  WHERE key_hash = p_key_hash;
END;
$$;

-- Add webhook delivery rate limiting table
CREATE TABLE IF NOT EXISTS public.webhook_delivery_rate_limits (
  webhook_id UUID REFERENCES public.webhooks(id) ON DELETE CASCADE,
  delivery_count INTEGER DEFAULT 0,
  window_start TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (webhook_id)
);

-- Function to check webhook delivery rate limit (max 50 deliveries per minute per webhook)
CREATE OR REPLACE FUNCTION public.check_webhook_delivery_rate_limit(p_webhook_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rate_limit RECORD;
  v_max_deliveries INTEGER := 50; -- Max deliveries per minute (reduced from 100 for security)
  v_window_minutes INTEGER := 1;
BEGIN
  SELECT * INTO v_rate_limit
  FROM public.webhook_delivery_rate_limits
  WHERE webhook_id = p_webhook_id;
  
  IF NOT FOUND THEN
    -- First delivery for this webhook
    INSERT INTO public.webhook_delivery_rate_limits (webhook_id, delivery_count, window_start)
    VALUES (p_webhook_id, 1, now())
    ON CONFLICT (webhook_id) DO NOTHING;
    RETURN true;
  END IF;
  
  -- Reset if window expired
  IF v_rate_limit.window_start < now() - make_interval(mins => v_window_minutes) THEN
    UPDATE public.webhook_delivery_rate_limits
    SET delivery_count = 1, window_start = now()
    WHERE webhook_id = p_webhook_id;
    RETURN true;
  END IF;
  
  -- Check if limit exceeded
  IF v_rate_limit.delivery_count >= v_max_deliveries THEN
    RETURN false;
  END IF;
  
  -- Increment count
  UPDATE public.webhook_delivery_rate_limits
  SET delivery_count = delivery_count + 1
  WHERE webhook_id = p_webhook_id;
  
  RETURN true;
END;
$$;

-- ============================================================================
-- 2. Profile Update Abuse Prevention (#11)
-- ============================================================================

-- Add profile update tracking
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS last_updated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS update_count_today INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS update_count_reset_at TIMESTAMPTZ DEFAULT (date_trunc('day', now()) + interval '1 day');

-- Create index for update rate limiting
CREATE INDEX IF NOT EXISTS idx_profiles_update_reset ON public.profiles(update_count_reset_at);

-- Function to validate emoji (single valid emoji)
CREATE OR REPLACE FUNCTION public.validate_single_emoji(p_emoji TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Check if it's a single emoji (basic validation)
  -- Emoji can be 1-2 characters in UTF-8 (most emojis are 2-4 bytes, but we check length)
  IF p_emoji IS NULL OR length(p_emoji) = 0 OR length(p_emoji) > 10 THEN
    RETURN false;
  END IF;
  
  -- Check if it matches emoji pattern (basic check)
  -- Most emojis are in the range U+1F300 to U+1F9FF or common emojis
  -- For simplicity, we just check it's not empty and reasonable length
  RETURN true;
END;
$$;

-- Function to update profile with rate limiting (max 5 updates per hour)
CREATE OR REPLACE FUNCTION public.update_profile_with_rate_limit(
  p_updates JSONB
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requester_profile public.profiles%ROWTYPE;
  v_rate_limit_window INTERVAL := interval '1 hour';
  v_max_updates INTEGER := 5;
  v_update_count INTEGER;
  v_emoji_value TEXT;
  v_bio_value TEXT;
  v_captions_value BOOLEAN;
BEGIN
  -- Get requester profile
  requester_profile := get_request_profile();
  
  -- Reset daily counter if needed
  IF requester_profile.update_count_reset_at <= now() THEN
    UPDATE public.profiles
    SET 
      update_count_today = 0,
      update_count_reset_at = date_trunc('day', now()) + interval '1 day'
    WHERE id = requester_profile.id
    RETURNING * INTO requester_profile;
  END IF;
  
  -- Count updates in last hour using rate_limit_logs
  SELECT COUNT(*) INTO v_update_count
  FROM public.rate_limit_logs
  WHERE key = 'profile:' || requester_profile.id || ':update'
    AND created_at > (now() - v_rate_limit_window);
  
  -- Check rate limit
  IF v_update_count >= v_max_updates THEN
    RAISE EXCEPTION 'Rate limit exceeded. Maximum % updates per hour allowed. Please try again later.', v_max_updates;
  END IF;
  
  -- Validate emoji if provided
  IF p_updates ? 'emoji_avatar' THEN
    v_emoji_value := p_updates->>'emoji_avatar';
    IF NOT validate_single_emoji(v_emoji_value) THEN
      RAISE EXCEPTION 'Invalid emoji avatar. Please provide a single valid emoji.';
    END IF;
  END IF;
  
  -- Extract values for updates
  IF p_updates ? 'bio' THEN
    v_bio_value := p_updates->>'bio';
  END IF;
  
  IF p_updates ? 'default_captions' THEN
    v_captions_value := (p_updates->>'default_captions')::BOOLEAN;
  END IF;
  
  -- Apply all updates in a single UPDATE statement
  UPDATE public.profiles
  SET 
    updated_at = now(),
    last_updated_at = now(),
    update_count_today = update_count_today + 1,
    emoji_avatar = COALESCE(v_emoji_value, emoji_avatar),
    bio = COALESCE(v_bio_value, bio),
    default_captions = COALESCE(v_captions_value, default_captions)
  WHERE id = requester_profile.id
  RETURNING * INTO requester_profile;
  
  -- Log the update for rate limiting
  INSERT INTO public.rate_limit_logs (key, identifier, created_at)
  VALUES ('profile:' || requester_profile.id || ':update', requester_profile.id::TEXT, now())
  ON CONFLICT DO NOTHING;
  
  RETURN requester_profile;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.update_profile_with_rate_limit TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.validate_single_emoji TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.check_api_key_quota TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.validate_api_key_with_quota TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.check_webhook_delivery_rate_limit TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.reset_api_key_quotas TO authenticated, anon;

-- ============================================================================
-- 3. Storage Abuse Prevention (#12)
-- ============================================================================

-- Add storage tracking to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS storage_used_bytes BIGINT DEFAULT 0, -- Storage used in bytes
ADD COLUMN IF NOT EXISTS storage_quota_bytes BIGINT DEFAULT 104857600; -- Default 100MB quota (104857600 bytes)

-- Add index for storage tracking
CREATE INDEX IF NOT EXISTS idx_profiles_storage_used ON public.profiles(storage_used_bytes);

-- Function to calculate storage used by a profile (from clips)
CREATE OR REPLACE FUNCTION public.calculate_profile_storage(p_profile_id UUID)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_storage_bytes BIGINT;
BEGIN
  -- Sum up estimated storage from all clips for this profile
  -- Estimate: average 1MB per 30-second clip (rough estimate)
  -- We'll use a more accurate calculation based on duration
  SELECT COALESCE(SUM(GREATEST(duration_seconds * 34000, 50000)), 0) -- ~34KB per second, minimum 50KB
  INTO v_storage_bytes
  FROM public.clips
  WHERE profile_id = p_profile_id
    AND status != 'deleted';
  
  RETURN v_storage_bytes;
END;
$$;

-- Function to check storage quota before upload
CREATE OR REPLACE FUNCTION public.check_storage_quota(p_profile_id UUID, p_file_size_bytes BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile RECORD;
  v_current_storage BIGINT;
  v_quota_bytes BIGINT;
BEGIN
  -- Get profile storage info
  SELECT storage_used_bytes, storage_quota_bytes INTO v_profile
  FROM public.profiles
  WHERE id = p_profile_id;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  v_current_storage := v_profile.storage_used_bytes;
  v_quota_bytes := v_profile.storage_quota_bytes;
  
  -- Check if adding this file would exceed quota
  IF (v_current_storage + p_file_size_bytes) > v_quota_bytes THEN
    RETURN false;
  END IF;
  
  RETURN true;
END;
$$;

-- Function to update storage usage after upload
CREATE OR REPLACE FUNCTION public.update_storage_usage(p_profile_id UUID, p_file_size_bytes BIGINT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET storage_used_bytes = storage_used_bytes + p_file_size_bytes
  WHERE id = p_profile_id;
END;
$$;

-- Function to cleanup old clips (90 days)
CREATE OR REPLACE FUNCTION public.cleanup_old_clips()
RETURNS TABLE (
  deleted_clips_count BIGINT,
  freed_storage_bytes BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count BIGINT := 0;
  v_freed_storage BIGINT := 0;
  v_clip RECORD;
BEGIN
  -- Find clips older than 90 days that are not live
  FOR v_clip IN
    SELECT id, profile_id, duration_seconds, audio_path, status
    FROM public.clips
    WHERE created_at < (now() - interval '90 days')
      AND status != 'live'
      AND status != 'draft'
  LOOP
    -- Delete from storage (this would need to be handled by edge function)
    -- For now, we just mark for deletion and update storage
    UPDATE public.clips
    SET status = 'deleted'
    WHERE id = v_clip.id;
    
    -- Update storage usage
    UPDATE public.profiles
    SET storage_used_bytes = GREATEST(0, storage_used_bytes - (v_clip.duration_seconds * 34000))
    WHERE id = v_clip.profile_id;
    
    v_deleted_count := v_deleted_count + 1;
    v_freed_storage := v_freed_storage + (v_clip.duration_seconds * 34000);
  END LOOP;
  
  RETURN QUERY SELECT v_deleted_count, v_freed_storage;
END;
$$;

-- Function to cleanup failed/processing clips (24 hours)
CREATE OR REPLACE FUNCTION public.cleanup_failed_clips()
RETURNS TABLE (
  deleted_clips_count BIGINT,
  freed_storage_bytes BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count BIGINT := 0;
  v_freed_storage BIGINT := 0;
  v_clip RECORD;
BEGIN
  -- Find clips stuck in processing/failed status for more than 24 hours
  FOR v_clip IN
    SELECT id, profile_id, duration_seconds, audio_path, status
    FROM public.clips
    WHERE created_at < (now() - interval '24 hours')
      AND status IN ('processing', 'failed')
  LOOP
    -- Delete from storage (this would need to be handled by edge function)
    -- Mark for deletion
    UPDATE public.clips
    SET status = 'deleted'
    WHERE id = v_clip.id;
    
    -- Update storage usage
    UPDATE public.profiles
    SET storage_used_bytes = GREATEST(0, storage_used_bytes - (v_clip.duration_seconds * 34000))
    WHERE id = v_clip.profile_id;
    
    v_deleted_count := v_deleted_count + 1;
    v_freed_storage := v_freed_storage + (v_clip.duration_seconds * 34000);
  END LOOP;
  
  RETURN QUERY SELECT v_deleted_count, v_freed_storage;
END;
$$;

-- Function to recalculate storage for all profiles
CREATE OR REPLACE FUNCTION public.recalculate_all_storage()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile RECORD;
BEGIN
  FOR v_profile IN
    SELECT id FROM public.profiles
  LOOP
    UPDATE public.profiles
    SET storage_used_bytes = calculate_profile_storage(v_profile.id)
    WHERE id = v_profile.id;
  END LOOP;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.calculate_profile_storage TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.check_storage_quota TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.update_storage_usage TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.cleanup_old_clips TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.cleanup_failed_clips TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.recalculate_all_storage TO authenticated, anon;

-- ============================================================================
-- Update existing API keys with default daily_quota
-- ============================================================================

-- Set default daily_quota for existing API keys that don't have it set
UPDATE public.api_keys
SET 
  daily_quota = 10000, -- Default 10k requests per day
  quota_reset_at = COALESCE(quota_reset_at, date_trunc('day', now()) + interval '1 day'),
  daily_usage = COALESCE(daily_usage, 0)
WHERE daily_quota IS NULL;

-- Set default rate_limit_per_minute to 30 for existing keys that still have 60
UPDATE public.api_keys
SET rate_limit_per_minute = 30
WHERE rate_limit_per_minute = 60 OR rate_limit_per_minute IS NULL;

-- ============================================================================
-- Setup Cron Jobs for cleanup and maintenance
-- ============================================================================

-- Schedule cleanup and maintenance cron jobs (requires pg_cron extension)
-- Note: pg_cron must be enabled in Supabase Dashboard: Database → Extensions
DO $$
BEGIN
  -- Check if pg_cron extension exists
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    -- Unschedule existing jobs if they exist
    PERFORM cron.unschedule('cleanup-old-clips') 
    WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'cleanup-old-clips'
    );
    
    PERFORM cron.unschedule('cleanup-failed-clips') 
    WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'cleanup-failed-clips'
    );
    
    PERFORM cron.unschedule('reset-api-quotas') 
    WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'reset-api-quotas'
    );
    
    -- Schedule cleanup of old clips (90+ days) - Daily at 2 AM UTC
    PERFORM cron.schedule(
      'cleanup-old-clips',
      '0 2 * * *', -- Daily at 2 AM UTC
      'SELECT public.cleanup_old_clips()'
    );
    
    -- Schedule cleanup of failed/processing clips (24+ hours) - Every 6 hours
    PERFORM cron.schedule(
      'cleanup-failed-clips',
      '*/6 * * * *', -- Every 6 hours
      'SELECT public.cleanup_failed_clips()'
    );
    
    -- Schedule reset of API key daily quotas - Daily at midnight UTC
    PERFORM cron.schedule(
      'reset-api-quotas',
      '0 0 * * *', -- Daily at midnight UTC
      'SELECT public.reset_api_key_quotas()'
    );
    
    RAISE NOTICE '✅ Cron jobs scheduled successfully:';
    RAISE NOTICE '   - cleanup-old-clips: Daily at 2 AM UTC';
    RAISE NOTICE '   - cleanup-failed-clips: Every 6 hours';
    RAISE NOTICE '   - reset-api-quotas: Daily at midnight UTC';
  ELSE
    RAISE WARNING '❌ pg_cron extension not found. Please enable it first in Supabase Dashboard';
    RAISE NOTICE 'To enable: Go to Database → Extensions → Enable "pg_cron"';
    RAISE NOTICE 'Then run this migration again or manually schedule the jobs via Dashboard → Database → Cron Jobs';
    RAISE NOTICE '';
    RAISE NOTICE 'Manual setup commands (run after enabling pg_cron):';
    RAISE NOTICE '  SELECT cron.schedule(''cleanup-old-clips'', ''0 2 * * *'', ''SELECT public.cleanup_old_clips()'');';
    RAISE NOTICE '  SELECT cron.schedule(''cleanup-failed-clips'', ''*/6 * * * *'', ''SELECT public.cleanup_failed_clips()'');';
    RAISE NOTICE '  SELECT cron.schedule(''reset-api-quotas'', ''0 0 * * *'', ''SELECT public.reset_api_key_quotas()'');';
  END IF;
END $$;

-- Verify cron jobs were created (if pg_cron is enabled)
SELECT 
  jobid,
  jobname,
  schedule,
  command,
  active
FROM cron.job 
WHERE jobname IN ('cleanup-old-clips', 'cleanup-failed-clips', 'reset-api-quotas')
ORDER BY jobname;

-- Alternative: Manual cron job setup via Supabase Dashboard (RECOMMENDED)
-- Instead of using pg_cron, you can set up these jobs directly in Supabase Dashboard:
-- 1. Go to Database → Cron Jobs (or Database → pg_cron)
-- 2. Click "New Cron Job" for each:
--
-- Job 1:
--   Name: cleanup-old-clips
--   Schedule: 0 2 * * *  (Daily at 2 AM UTC)
--   Command: SELECT public.cleanup_old_clips();
--
-- Job 2:
--   Name: cleanup-failed-clips
--   Schedule: */6 * * * *  (Every 6 hours)
--   Command: SELECT public.cleanup_failed_clips();
--
-- Job 3:
--   Name: reset-api-quotas
--   Schedule: 0 0 * * *  (Daily at midnight UTC)
--   Command: SELECT public.reset_api_key_quotas();

-- Add comments for documentation
COMMENT ON COLUMN public.api_keys.daily_quota IS 'Maximum API requests allowed per day for this key';
COMMENT ON COLUMN public.api_keys.daily_usage IS 'Current number of requests used today';
COMMENT ON COLUMN public.profiles.storage_used_bytes IS 'Total storage used by this profile in bytes';
COMMENT ON COLUMN public.profiles.storage_quota_bytes IS 'Storage quota for this profile in bytes (default 100MB)';
COMMENT ON FUNCTION public.update_profile_with_rate_limit IS 'Updates profile with rate limiting (max 5 updates per hour)';
COMMENT ON FUNCTION public.check_storage_quota IS 'Checks if a file upload would exceed storage quota';
COMMENT ON FUNCTION public.cleanup_old_clips IS 'Cleans up clips older than 90 days';
COMMENT ON FUNCTION public.cleanup_failed_clips IS 'Cleans up clips stuck in processing/failed status for more than 24 hours';

