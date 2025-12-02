-- ============================================================================
-- Ensure create_magic_login_link, get_user_devices, and get_active_sessions functions exist
-- ============================================================================
-- This migration ensures all functions are properly created and accessible

-- ============================================================================
-- PART 1: Ensure create_magic_login_link exists
-- ============================================================================

-- Drop all existing versions to avoid conflicts
DROP FUNCTION IF EXISTS public.create_magic_login_link(TEXT);
DROP FUNCTION IF EXISTS public.create_magic_login_link(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.create_magic_login_link(TEXT, TEXT, INTEGER);

-- Recreate with correct signature
CREATE OR REPLACE FUNCTION public.create_magic_login_link(
  target_email TEXT DEFAULT NULL,
  p_link_type TEXT DEFAULT 'standard',
  p_duration_hours INTEGER DEFAULT NULL
)
RETURNS TABLE (token TEXT, expires_at TIMESTAMPTZ, link_type TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_headers JSON;
  request_device_id TEXT;
  requester_profile_id UUID;
  raw_token UUID;
  token_expiry TIMESTAMPTZ;
  calculated_duration_hours INTEGER;
BEGIN
  request_headers := current_setting('request.headers', true)::json;
  request_device_id := NULLIF(trim(request_headers->>'x-device-id'), '');

  IF request_device_id IS NULL THEN
    RAISE EXCEPTION 'Missing x-device-id header';
  END IF;

  -- Validate link type
  IF p_link_type NOT IN ('standard', 'extended', 'one_time') THEN
    p_link_type := 'standard';
  END IF;

  SELECT pfr.id
  INTO requester_profile_id
  FROM public.profile_ids_for_request(request_device_id) pfr
  LIMIT 1;

  IF requester_profile_id IS NULL THEN
    RAISE EXCEPTION 'Profile not found for supplied device';
  END IF;

  -- Determine duration based on link type or provided duration
  IF p_duration_hours IS NOT NULL THEN
    -- Use provided duration, but cap at 168 hours (7 days)
    calculated_duration_hours := LEAST(p_duration_hours, 168);
  ELSE
    CASE p_link_type
      WHEN 'one_time' THEN
        calculated_duration_hours := 1; -- 1 hour for quick sharing
      WHEN 'extended' THEN
        calculated_duration_hours := 168; -- 7 days
      ELSE
        calculated_duration_hours := 168; -- 7 days default
    END CASE;
  END IF;

  -- Clean up expired links for this profile (older than 30 days)
  DELETE FROM public.magic_login_links ml
  WHERE ml.profile_id = requester_profile_id
    AND (ml.expires_at < now() - interval '30 days' OR ml.redeemed_at IS NOT NULL);

  raw_token := gen_random_uuid();
  token_expiry := now() + (calculated_duration_hours || ' hours')::interval;

  INSERT INTO public.magic_login_links (
    profile_id,
    token_hash,
    email,
    created_device_id,
    expires_at,
    link_type,
    duration_hours
  )
  VALUES (
    requester_profile_id,
    encode(digest(raw_token::text, 'sha256'), 'hex'),
    NULLIF(trim(target_email), ''),
    request_device_id,
    token_expiry,
    p_link_type,
    calculated_duration_hours
  );

  RETURN QUERY
  SELECT raw_token::text AS token, token_expiry AS expires_at, p_link_type AS link_type;
END;
$$;

-- Grant execute permission to all roles that need it
GRANT EXECUTE ON FUNCTION public.create_magic_login_link(TEXT, TEXT, INTEGER) TO authenticated, anon, service_role;

-- Add comment to help with visibility
COMMENT ON FUNCTION public.create_magic_login_link(TEXT, TEXT, INTEGER) IS 
'Creates a magic login link for cross-device authentication. Returns token, expires_at, and link_type.';

-- ============================================================================
-- PART 2: Ensure get_user_devices exists
-- ============================================================================

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS public.get_user_devices();

-- Recreate with correct signature
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
  BEGIN
    current_device_id := NULLIF(trim(
      (current_setting('request.headers', true)::json ->> 'x-device-id')
    ), '');
  EXCEPTION WHEN OTHERS THEN
    current_device_id := NULL;
  END;
  
  -- If no device ID, return empty
  IF current_device_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Get all profile IDs associated with the current device
  BEGIN
    SELECT ARRAY_AGG(DISTINCT all_profiles.id) INTO user_profile_ids
    FROM (
      -- Profiles with matching device_id
      SELECT p.id FROM public.profiles p WHERE p.device_id = current_device_id
      UNION
      -- Profiles linked via devices table (alias profile_id as id to avoid ambiguity)
      SELECT d.profile_id AS id FROM public.devices d WHERE d.device_id = current_device_id AND d.profile_id IS NOT NULL
      UNION
      -- Also get from profile_ids_for_request for magic login links
      SELECT pfr.id FROM public.profile_ids_for_request(current_device_id, NULL) pfr
    ) all_profiles;
  EXCEPTION
    WHEN OTHERS THEN
      -- If profile_ids_for_request doesn't exist or failed, just use the other sources
      SELECT ARRAY_AGG(DISTINCT all_profiles.id) INTO user_profile_ids
      FROM (
        SELECT p.id FROM public.profiles p WHERE p.device_id = current_device_id
        UNION
        SELECT d.profile_id AS id FROM public.devices d WHERE d.device_id = current_device_id AND d.profile_id IS NOT NULL
      ) all_profiles;
  END;
  
  -- If no profiles found, return empty
  IF user_profile_ids IS NULL OR array_length(user_profile_ids, 1) = 0 THEN
    RETURN;
  END IF;
  
  -- Return all devices linked to any of the user's profiles
  RETURN QUERY
  SELECT 
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
    -- Always return current device if it exists
    (current_device_id IS NOT NULL AND d.device_id = current_device_id)
    -- OR devices linked to any of the user's profiles
    OR (user_profile_ids IS NOT NULL AND array_length(user_profile_ids, 1) > 0 AND d.profile_id = ANY(user_profile_ids))
  )
  ORDER BY 
    -- Current device first
    CASE WHEN d.device_id = current_device_id THEN 0 ELSE 1 END,
    d.last_seen_at DESC NULLS LAST;
END;
$$;

-- Grant execute permission to all roles that need it
GRANT EXECUTE ON FUNCTION public.get_user_devices() TO authenticated, anon, service_role;

-- Add comment to help with visibility
COMMENT ON FUNCTION public.get_user_devices() IS 
'Returns all devices associated with the current user profile(s).';

-- ============================================================================
-- PART 3: Ensure get_active_sessions exists
-- ============================================================================

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS public.get_active_sessions(UUID);

-- Recreate with correct signature (matching the one from 20251221000004)
CREATE OR REPLACE FUNCTION public.get_active_sessions(p_profile_id UUID)
RETURNS TABLE (
  id UUID,
  device_id TEXT,
  user_agent TEXT,
  ip_address INET,
  created_at TIMESTAMPTZ,
  last_accessed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_current_session BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_device_id TEXT;
  v_request_session_token_hash TEXT;
  v_session_count INTEGER;
BEGIN
  -- Get current device_id and session token from request headers
  BEGIN
    v_request_device_id := NULLIF(trim(
      (current_setting('request.headers', true)::json ->> 'x-device-id')
    ), '');
    v_request_session_token_hash := NULLIF(trim(
      (current_setting('request.headers', true)::json ->> 'x-session-token-hash')
    ), '');
  EXCEPTION WHEN OTHERS THEN
    v_request_device_id := NULL;
    v_request_session_token_hash := NULL;
  END;

  -- Check if we have any sessions first
  SELECT COUNT(*) INTO v_session_count
  FROM public.sessions s
  WHERE s.profile_id = p_profile_id
    AND s.revoked_at IS NULL
    AND s.expires_at > now();
  
  -- Return sessions from sessions table
  RETURN QUERY
  SELECT 
    s.id,
    s.device_id,
    s.user_agent,
    s.ip_address,
    s.created_at,
    s.last_accessed_at,
    s.expires_at,
    -- Mark as current if device_id or session token matches
    (s.device_id = v_request_device_id OR s.token_hash = v_request_session_token_hash) AS is_current_session
  FROM public.sessions s
  WHERE s.profile_id = p_profile_id
    AND s.revoked_at IS NULL
    AND s.expires_at > now()
  ORDER BY 
    -- Put current session first
    CASE WHEN (s.device_id = v_request_device_id OR s.token_hash = v_request_session_token_hash) THEN 0 ELSE 1 END,
    s.last_accessed_at DESC;

  -- If no sessions found but we have a device_id, create a synthetic entry for current device
  -- This ensures the current device always appears
  IF v_session_count = 0 AND v_request_device_id IS NOT NULL THEN
    -- Check if device is linked to this profile
    IF EXISTS (
      SELECT 1 
      FROM public.devices d
      WHERE d.device_id = v_request_device_id
        AND d.profile_id = p_profile_id
    ) OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = p_profile_id
        AND p.device_id = v_request_device_id
    ) THEN
      -- Return synthetic session entry for current device
      RETURN QUERY
      SELECT 
        gen_random_uuid() AS id, -- Synthetic ID
        v_request_device_id AS device_id,
        COALESCE(
          (SELECT user_agent FROM public.devices WHERE device_id = v_request_device_id LIMIT 1),
          'Unknown'
        ) AS user_agent,
        NULL::INET AS ip_address,
        COALESCE(
          (SELECT first_seen_at FROM public.devices WHERE device_id = v_request_device_id LIMIT 1),
          now()
        ) AS created_at,
        COALESCE(
          (SELECT last_seen_at FROM public.devices WHERE device_id = v_request_device_id LIMIT 1),
          now()
        ) AS last_accessed_at,
        now() + interval '30 days' AS expires_at,
        true AS is_current_session; -- Always true for synthetic entry
    END IF;
  END IF;
END;
$$;

-- Grant execute permission to all roles that need it
GRANT EXECUTE ON FUNCTION public.get_active_sessions(UUID) TO authenticated, anon, service_role;

-- Add comment to help with visibility
COMMENT ON FUNCTION public.get_active_sessions(UUID) IS 
'Returns all active sessions for a profile, including the current session.';

-- ============================================================================
-- VERIFICATION: Verify functions exist and are accessible
-- ============================================================================

-- This query will help verify the functions were created successfully
-- Run this after the migration to confirm:
DO $$
BEGIN
  -- Check if functions exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' 
      AND p.proname = 'create_magic_login_link'
      AND pg_get_function_identity_arguments(p.oid) = 'target_email text DEFAULT NULL::text, p_link_type text DEFAULT ''standard''::text, p_duration_hours integer DEFAULT NULL::integer'
  ) THEN
    RAISE WARNING 'create_magic_login_link function not found!';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' 
      AND p.proname = 'get_user_devices'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    RAISE WARNING 'get_user_devices function not found!';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' 
      AND p.proname = 'get_active_sessions'
      AND pg_get_function_identity_arguments(p.oid) = 'p_profile_id uuid'
  ) THEN
    RAISE WARNING 'get_active_sessions function not found!';
  END IF;
END $$;

