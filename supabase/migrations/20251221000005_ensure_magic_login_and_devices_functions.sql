-- ============================================================================
-- Ensure create_magic_login_link and get_user_devices functions exist
-- ============================================================================
-- This migration ensures both functions are properly created and accessible

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

  SELECT id
  INTO requester_profile_id
  FROM public.profile_ids_for_request(request_device_id)
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

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.create_magic_login_link(TEXT, TEXT, INTEGER) TO authenticated, anon;

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
    SELECT ARRAY_AGG(DISTINCT id) INTO user_profile_ids
    FROM (
      -- Profiles with matching device_id
      SELECT id FROM public.profiles WHERE device_id = current_device_id
      UNION
      -- Profiles linked via devices table
      SELECT profile_id FROM public.devices WHERE device_id = current_device_id AND profile_id IS NOT NULL
      UNION
      -- Also get from profile_ids_for_request for magic login links
      SELECT id FROM public.profile_ids_for_request()
    ) all_profiles;
  EXCEPTION
    WHEN OTHERS THEN
      -- If profile_ids_for_request doesn't exist or failed, just use the other sources
      SELECT ARRAY_AGG(DISTINCT id) INTO user_profile_ids
      FROM (
        SELECT id FROM public.profiles WHERE device_id = current_device_id
        UNION
        SELECT profile_id FROM public.devices WHERE device_id = current_device_id AND profile_id IS NOT NULL
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

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_user_devices() TO authenticated, anon, service_role;

