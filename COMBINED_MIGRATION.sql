-- ============================================
-- Device Security & Rate Limiting Migrations
-- ============================================
-- Run this in Supabase Dashboard > SQL Editor
-- https://supabase.com/dashboard/project/xgblxtopsapvacyaurcr/sql/new
-- 
-- This migration adds:
-- 1. Devices table (if not exists)
-- 2. Rate limiting infrastructure
-- 3. Device security tracking
-- 4. Security audit logging
-- 5. Device management functions
-- ============================================

-- ============================================
-- 20251120000000_create_devices_table.sql
-- ============================================

-- Create devices table for multi-device support
-- This table tracks devices associated with user profiles

CREATE TABLE IF NOT EXISTS public.devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT UNIQUE NOT NULL,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS devices_device_id_idx ON public.devices(device_id);
CREATE INDEX IF NOT EXISTS devices_profile_id_idx ON public.devices(profile_id);

-- Initial policy: deny all access (will be updated by later migrations)
DROP POLICY IF EXISTS "Devices service role only" ON public.devices;
CREATE POLICY "Devices service role only"
ON public.devices
FOR ALL
USING (false)
WITH CHECK (false);


-- ============================================
-- 20251120000001_add_rate_limiting.sql
-- ============================================

-- Rate limiting infrastructure
-- This table tracks rate limit requests for persistent rate limiting across Edge Functions

CREATE TABLE IF NOT EXISTS public.rate_limit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,
  identifier TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS rate_limit_logs_key_created_idx 
ON public.rate_limit_logs(key, created_at DESC);

-- Index for cleanup operations
CREATE INDEX IF NOT EXISTS rate_limit_logs_created_idx 
ON public.rate_limit_logs(created_at);

-- Enable RLS (only Edge Functions with service role can access)
ALTER TABLE public.rate_limit_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Only service role can access (Edge Functions use service role)
DROP POLICY IF EXISTS "Service role only" ON public.rate_limit_logs;
CREATE POLICY "Service role only"
ON public.rate_limit_logs
FOR ALL
USING (false) -- Deny all public access
WITH CHECK (false);

-- Function to clean up old rate limit logs (run periodically)
CREATE OR REPLACE FUNCTION public.cleanup_rate_limit_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete logs older than 24 hours
  DELETE FROM public.rate_limit_logs
  WHERE created_at < now() - interval '24 hours';
END;
$$;

-- Add rate limiting to profile updates (prevent handle spam)
CREATE OR REPLACE FUNCTION public.check_profile_update_rate_limit(profile_id_param UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  recent_updates INTEGER;
  max_updates INTEGER := 5;
  window_minutes INTEGER := 60;
BEGIN
  SELECT COUNT(*)
  INTO recent_updates
  FROM public.profiles
  WHERE id = profile_id_param
    AND updated_at > now() - (window_minutes || ' minutes')::interval;
  
  RETURN recent_updates < max_updates;
END;
$$;




-- ============================================
-- 20251120000002_device_security.sql
-- ============================================

-- Enhanced device security and tracking

-- Add security metadata to devices table
ALTER TABLE public.devices
ADD COLUMN IF NOT EXISTS ip_address INET,
ADD COLUMN IF NOT EXISTS user_agent TEXT,
ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT now(),
ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ DEFAULT now(),
ADD COLUMN IF NOT EXISTS is_suspicious BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS is_revoked BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS revoked_reason TEXT,
ADD COLUMN IF NOT EXISTS request_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS failed_auth_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_failed_auth_at TIMESTAMPTZ;

-- Create index for security queries
CREATE INDEX IF NOT EXISTS devices_profile_id_idx ON public.devices(profile_id);
CREATE INDEX IF NOT EXISTS devices_last_seen_idx ON public.devices(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS devices_suspicious_idx ON public.devices(is_suspicious) WHERE is_suspicious = true;
CREATE INDEX IF NOT EXISTS devices_revoked_idx ON public.devices(is_revoked) WHERE is_revoked = true;

-- Security audit log table
CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id BIGSERIAL PRIMARY KEY,
  device_id TEXT,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  event_details JSONB DEFAULT '{}'::jsonb,
  ip_address INET,
  user_agent TEXT,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS security_audit_device_idx ON public.security_audit_log(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS security_audit_profile_idx ON public.security_audit_log(profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS security_audit_type_idx ON public.security_audit_log(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS security_audit_severity_idx ON public.security_audit_log(severity, created_at DESC) WHERE severity IN ('error', 'critical');

ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

-- Only service role can access audit logs
DROP POLICY IF EXISTS "Audit logs service role only" ON public.security_audit_log;
CREATE POLICY "Audit logs service role only"
ON public.security_audit_log
FOR ALL
USING (false)
WITH CHECK (false);

-- Function to update device last seen and track activity
CREATE OR REPLACE FUNCTION public.update_device_activity(
  p_device_id TEXT,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.devices
  SET 
    last_seen_at = now(),
    request_count = request_count + 1,
    ip_address = COALESCE(p_ip_address, ip_address),
    user_agent = COALESCE(p_user_agent, user_agent)
  WHERE device_id = p_device_id;
  
  -- If device doesn't exist, create it
  IF NOT FOUND THEN
    INSERT INTO public.devices (device_id, ip_address, user_agent, first_seen_at, last_seen_at, request_count)
    VALUES (p_device_id, p_ip_address, p_user_agent, now(), now(), 1)
    ON CONFLICT (device_id) DO UPDATE SET
      last_seen_at = now(),
      request_count = devices.request_count + 1,
      ip_address = COALESCE(EXCLUDED.ip_address, devices.ip_address),
      user_agent = COALESCE(EXCLUDED.user_agent, devices.user_agent);
  END IF;
END;
$$;

-- Function to log security events
CREATE OR REPLACE FUNCTION public.log_security_event(
  p_device_id TEXT,
  p_event_type TEXT,
  p_profile_id UUID DEFAULT NULL,
  p_event_details JSONB DEFAULT '{}'::jsonb,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_severity TEXT DEFAULT 'info'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.security_audit_log (
    device_id,
    profile_id,
    event_type,
    event_details,
    ip_address,
    user_agent,
    severity
  )
  VALUES (
    p_device_id,
    p_profile_id,
    p_event_type,
    p_event_details,
    p_ip_address,
    p_user_agent,
    p_severity
  );
END;
$$;

-- Function to detect suspicious device activity
CREATE OR REPLACE FUNCTION public.check_device_suspicious(
  p_device_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  device_record public.devices%ROWTYPE;
  is_suspicious_flag BOOLEAN := false;
BEGIN
  SELECT * INTO device_record
  FROM public.devices
  WHERE device_id = p_device_id;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Check if device is revoked
  IF device_record.is_revoked THEN
    RETURN true;
  END IF;
  
  -- Check for too many failed auth attempts (5+ in last hour)
  IF device_record.failed_auth_count >= 5 AND 
     device_record.last_failed_auth_at > now() - interval '1 hour' THEN
    is_suspicious_flag := true;
  END IF;
  
  -- Check for unusual request patterns (1000+ requests in last hour)
  IF device_record.request_count > 1000 AND
     device_record.last_seen_at > now() - interval '1 hour' THEN
    is_suspicious_flag := true;
  END IF;
  
  -- Update suspicious flag
  IF is_suspicious_flag != device_record.is_suspicious THEN
    UPDATE public.devices
    SET is_suspicious = is_suspicious_flag
    WHERE device_id = p_device_id;
    
    -- Log the suspicious activity
    IF is_suspicious_flag THEN
      PERFORM public.log_security_event(
        p_device_id,
        'device_marked_suspicious',
        device_record.profile_id,
        jsonb_build_object(
          'failed_auth_count', device_record.failed_auth_count,
          'request_count', device_record.request_count
        ),
        NULL,
        NULL,
        'warning'
      );
    END IF;
  END IF;
  
  RETURN is_suspicious_flag;
END;
$$;

-- Function to record failed authentication
CREATE OR REPLACE FUNCTION public.record_failed_auth(
  p_device_id TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.devices
  SET 
    failed_auth_count = failed_auth_count + 1,
    last_failed_auth_at = now()
  WHERE device_id = p_device_id;
  
  -- Log the failed auth attempt
  PERFORM public.log_security_event(
    p_device_id,
    'failed_authentication',
    NULL,
    jsonb_build_object('reason', p_reason),
    NULL,
    NULL,
    'warning'
  );
  
  -- Check if device should be marked suspicious
  PERFORM public.check_device_suspicious(p_device_id);
END;
$$;

-- Function to revoke a device
CREATE OR REPLACE FUNCTION public.revoke_device(
  p_device_id TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  device_profile_id UUID;
BEGIN
  SELECT profile_id INTO device_profile_id
  FROM public.devices
  WHERE device_id = p_device_id;
  
  UPDATE public.devices
  SET 
    is_revoked = true,
    revoked_at = now(),
    revoked_reason = p_reason
  WHERE device_id = p_device_id;
  
  -- Log the revocation
  PERFORM public.log_security_event(
    p_device_id,
    'device_revoked',
    device_profile_id,
    jsonb_build_object('reason', p_reason),
    NULL,
    NULL,
    'critical'
  );
END;
$$;

-- Function to get device security status
CREATE OR REPLACE FUNCTION public.get_device_security_status(
  p_device_id TEXT
)
RETURNS TABLE (
  is_revoked BOOLEAN,
  is_suspicious BOOLEAN,
  failed_auth_count INTEGER,
  request_count INTEGER,
  last_seen_at TIMESTAMPTZ,
  revoked_reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    d.is_revoked,
    d.is_suspicious,
    d.failed_auth_count,
    d.request_count,
    d.last_seen_at,
    d.revoked_reason
  FROM public.devices d
  WHERE d.device_id = p_device_id;
END;
$$;

-- Trigger to update last_seen_at on device access
CREATE OR REPLACE FUNCTION public.update_device_last_seen()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  device_id_from_header TEXT;
BEGIN
  device_id_from_header := current_setting('request.headers', true)::json->>'x-device-id';
  
  IF device_id_from_header IS NOT NULL THEN
    UPDATE public.devices
    SET last_seen_at = now()
    WHERE device_id = device_id_from_header;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Enhanced profile_ids_for_request with security checks
CREATE OR REPLACE FUNCTION public.profile_ids_for_request_secure(request_device_id TEXT DEFAULT NULL)
RETURNS TABLE (id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved_device_id TEXT;
  device_is_revoked BOOLEAN;
  device_is_suspicious BOOLEAN;
BEGIN
  resolved_device_id := NULLIF(trim(
    COALESCE(
      request_device_id,
      (current_setting('request.headers', true)::json ->> 'x-device-id')
    )
  ), '');
  
  IF resolved_device_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Check if device is revoked
  SELECT is_revoked, is_suspicious
  INTO device_is_revoked, device_is_suspicious
  FROM public.devices
  WHERE device_id = resolved_device_id;
  
  -- If device is revoked, don't return any profile IDs
  IF device_is_revoked THEN
    PERFORM public.log_security_event(
      resolved_device_id,
      'revoked_device_access_attempt',
      NULL,
      '{}'::jsonb,
      NULL,
      NULL,
      'error'
    );
    RETURN;
  END IF;
  
  -- Check for suspicious activity
  IF device_is_suspicious OR public.check_device_suspicious(resolved_device_id) THEN
    PERFORM public.log_security_event(
      resolved_device_id,
      'suspicious_device_access',
      NULL,
      '{}'::jsonb,
      NULL,
      NULL,
      'warning'
    );
  END IF;
  
  -- Update device activity
  PERFORM public.update_device_activity(resolved_device_id);
  
  -- Return profile IDs (existing logic)
  RETURN QUERY
  SELECT p.id
  FROM public.profiles p
  WHERE p.device_id = resolved_device_id
  UNION
  SELECT d.profile_id
  FROM public.devices d
  WHERE d.device_id = resolved_device_id
    AND d.profile_id IS NOT NULL;
END;
$$;




-- ============================================
-- 20251120000003_device_view_policy.sql
-- ============================================

-- Allow users to view devices associated with their profile
-- This is needed for the device activity section in settings

-- Drop the restrictive policy first
DROP POLICY IF EXISTS "Devices service role only" ON public.devices;

DROP POLICY IF EXISTS "Users can view their profile devices" ON public.devices;
CREATE POLICY "Users can view their profile devices"
ON public.devices FOR SELECT
USING (
  -- Allow viewing the current device itself (most important - should always work)
  device_id = COALESCE(
    current_setting('request.headers', true)::json->>'x-device-id',
    ''
  )
  -- Allow viewing devices linked to profiles via device_id
  OR profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = COALESCE(
      current_setting('request.headers', true)::json->>'x-device-id',
      ''
    )
  )
  -- Allow viewing devices linked via devices table (for magic login multi-device)
  OR profile_id IN (
    SELECT profile_id FROM public.devices
    WHERE device_id = COALESCE(
      current_setting('request.headers', true)::json->>'x-device-id',
      ''
    )
    AND profile_id IS NOT NULL
  )
);

-- Allow users to insert/update their own device
DROP POLICY IF EXISTS "Users can manage their devices" ON public.devices;
CREATE POLICY "Users can manage their devices"
ON public.devices FOR ALL
USING (
  device_id = current_setting('request.headers', true)::json->>'x-device-id'
  OR profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
)
WITH CHECK (
  device_id = current_setting('request.headers', true)::json->>'x-device-id'
  OR profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);




-- ============================================
-- 20251120000004_get_user_devices_rpc.sql
-- ============================================

-- RPC function to get all devices for the current user
-- This allows users to see all devices associated with their profile

CREATE OR REPLACE FUNCTION public.get_user_devices()
RETURNS TABLE (
  id UUID,
  device_id TEXT,
  profile_id UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ,
  user_agent TEXT,
  ip_address INET,
  is_revoked BOOLEAN,
  is_suspicious BOOLEAN,
  request_count INTEGER,
  failed_auth_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_profile_ids UUID[];
  current_device_id TEXT;
BEGIN
  -- Get the current device ID from headers
  current_device_id := NULLIF(trim(
    (current_setting('request.headers', true)::json ->> 'x-device-id')
  ), '');
  
  -- If no device ID, return empty
  IF current_device_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Get all profile IDs associated with the current device
  -- This includes profiles with matching device_id and profiles linked via devices table
  BEGIN
    SELECT ARRAY_AGG(DISTINCT id) INTO user_profile_ids
    FROM (
      -- Profiles with matching device_id
      SELECT id FROM public.profiles WHERE device_id = current_device_id
      UNION
      -- Profiles linked via devices table
      SELECT profile_id FROM public.devices WHERE device_id = current_device_id AND profile_id IS NOT NULL
      UNION
      -- Also get from profile_ids_for_request for magic login links (if function exists)
      SELECT id FROM public.profile_ids_for_request()
    ) all_profiles;
  EXCEPTION
    WHEN OTHERS THEN
      -- If profile_ids_for_request doesn't exist, just use the other sources
      SELECT ARRAY_AGG(DISTINCT id) INTO user_profile_ids
      FROM (
        SELECT id FROM public.profiles WHERE device_id = current_device_id
        UNION
        SELECT profile_id FROM public.devices WHERE device_id = current_device_id AND profile_id IS NOT NULL
      ) all_profiles;
  END;
  
  -- Ensure current device exists in devices table (create if missing)
  -- Use SECURITY DEFINER to bypass RLS for this operation
  IF current_device_id IS NOT NULL THEN
    -- Upsert device (create if missing, update if exists)
    INSERT INTO public.devices (device_id, profile_id, first_seen_at, last_seen_at, request_count)
    VALUES (
      current_device_id,
      COALESCE((SELECT id FROM public.profiles WHERE device_id = current_device_id LIMIT 1), NULL),
      now(),
      now(),
      1
    )
    ON CONFLICT (device_id) DO UPDATE SET
      last_seen_at = now(),
      request_count = COALESCE(devices.request_count, 0) + 1,
      profile_id = COALESCE(
        devices.profile_id,
        EXCLUDED.profile_id,
        (SELECT id FROM public.profiles WHERE device_id = current_device_id LIMIT 1)
      );
  END IF;
  
  -- Return all devices for these profiles, or devices matching the current device_id
  -- SECURITY DEFINER bypasses RLS, so we can read all matching devices
  -- Use DISTINCT to avoid duplicates
  RETURN QUERY
  SELECT DISTINCT
    d.id,
    d.device_id,
    d.profile_id,
    d.created_at,
    d.updated_at,
    d.last_seen_at,
    d.first_seen_at,
    d.user_agent,
    d.ip_address,
    COALESCE(d.is_revoked, false) as is_revoked,
    COALESCE(d.is_suspicious, false) as is_suspicious,
    COALESCE(d.request_count, 0) as request_count,
    COALESCE(d.failed_auth_count, 0) as failed_auth_count
  FROM public.devices d
  WHERE (
    -- Always return current device if it exists (this should always match)
    (current_device_id IS NOT NULL AND d.device_id = current_device_id)
    -- OR devices linked to any of the user's profiles (for multi-device support via magic links)
    OR (user_profile_ids IS NOT NULL AND array_length(user_profile_ids, 1) > 0 AND d.profile_id = ANY(user_profile_ids))
  )
  ORDER BY 
    -- Current device first
    CASE WHEN d.device_id = current_device_id THEN 0 ELSE 1 END,
    d.last_seen_at DESC NULLS LAST;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_user_devices() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_devices() TO anon;
GRANT EXECUTE ON FUNCTION public.get_user_devices() TO service_role;

-- Also grant execute on other device functions
GRANT EXECUTE ON FUNCTION public.update_device_activity(TEXT, INET, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_device_activity(TEXT, INET, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.update_device_activity(TEXT, INET, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_device(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_device(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.revoke_device(TEXT, TEXT) TO service_role;

-- Ensure function owner can bypass RLS (functions owned by postgres should already have this)
ALTER FUNCTION public.get_user_devices() OWNER TO postgres;
ALTER FUNCTION public.update_device_activity(TEXT, INET, TEXT) OWNER TO postgres;
ALTER FUNCTION public.revoke_device(TEXT, TEXT) OWNER TO postgres;

-- ============================================
-- Create trigger to auto-create device when profile is created
-- ============================================

-- Function to create device entry when profile is created
CREATE OR REPLACE FUNCTION public.create_device_for_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Create device entry if it doesn't exist
  INSERT INTO public.devices (device_id, profile_id, first_seen_at, last_seen_at, request_count)
  VALUES (NEW.device_id, NEW.id, now(), now(), 0)
  ON CONFLICT (device_id) DO UPDATE SET
    profile_id = NEW.id,
    last_seen_at = now();
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS create_device_on_profile_insert ON public.profiles;
CREATE TRIGGER create_device_on_profile_insert
AFTER INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.create_device_for_profile();

-- Also update existing profiles to create device entries
INSERT INTO public.devices (device_id, profile_id, first_seen_at, last_seen_at, request_count)
SELECT 
  p.device_id,
  p.id,
  COALESCE(p.created_at, now()),
  now(),
  0
FROM public.profiles p
WHERE p.device_id IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM public.devices d WHERE d.device_id = p.device_id
)
ON CONFLICT (device_id) DO UPDATE SET
  profile_id = EXCLUDED.profile_id,
  last_seen_at = now();



