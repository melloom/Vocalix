-- Fix device duplication when accounts are linked
-- When a device is linked to a new account via magic link, we need to:
-- 1. Clean up the old profile's device_id reference
-- 2. Ensure get_user_devices uses DISTINCT to avoid duplicates

-- Update redeem_magic_login_link to clean up old profile references
CREATE OR REPLACE FUNCTION public.redeem_magic_login_link(link_token TEXT)
RETURNS TABLE (profile_id UUID, handle TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_headers JSON;
  request_device_id TEXT;
  hashed_token TEXT;
  link_record public.magic_login_links%ROWTYPE;
  linked_profile public.profiles%ROWTYPE;
  current_device_profile_id UUID;
  linked_profile_has_admin BOOLEAN;
BEGIN
  request_headers := current_setting('request.headers', true)::json;
  request_device_id := NULLIF(trim(request_headers->>'x-device-id'), '');

  IF request_device_id IS NULL THEN
    RAISE EXCEPTION 'Missing x-device-id header';
  END IF;

  IF link_token IS NULL OR length(trim(link_token)) = 0 THEN
    RAISE EXCEPTION 'Invalid login token';
  END IF;

  hashed_token := encode(digest(trim(link_token), 'sha256'), 'hex');

  SELECT *
  INTO link_record
  FROM public.magic_login_links
  WHERE token_hash = hashed_token
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Login link not found';
  END IF;

  IF link_record.redeemed_at IS NOT NULL THEN
    RAISE EXCEPTION 'This login link has already been used';
  END IF;

  IF link_record.expires_at < now() THEN
    RAISE EXCEPTION 'This login link has expired';
  END IF;

  SELECT *
  INTO linked_profile
  FROM public.profiles
  WHERE id = link_record.profile_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for login link';
  END IF;

  -- Check if the profile that generated the QR code has admin rights
  SELECT EXISTS(
    SELECT 1
    FROM public.admins a
    WHERE a.profile_id = linked_profile.id
  ) INTO linked_profile_has_admin;

  -- Get the current device's profile (if any) - for cleanup purposes
  SELECT p.id
  INTO current_device_profile_id
  FROM public.profiles p
  WHERE p.device_id = request_device_id
  LIMIT 1;

  -- If no profile found in profiles table, check devices table
  IF current_device_profile_id IS NULL THEN
    SELECT d.profile_id
    INTO current_device_profile_id
    FROM public.devices d
    WHERE d.device_id = request_device_id
      AND d.profile_id IS NOT NULL
    LIMIT 1;
  END IF;

  -- IMPORTANT: Clean up old profile's device_id reference if it exists
  -- This prevents the device from appearing under multiple profiles
  IF current_device_profile_id IS NOT NULL AND current_device_profile_id != linked_profile.id THEN
    -- Clear device_id from the old profile to prevent duplication
    UPDATE public.profiles
    SET device_id = NULL
    WHERE id = current_device_profile_id
      AND device_id = request_device_id;
  END IF;

  -- Link the device to the profile from the magic link
  -- This is the key step: the device will be linked to the profile that generated the QR code
  INSERT INTO public.devices (device_id, profile_id)
  VALUES (request_device_id, linked_profile.id)
  ON CONFLICT (device_id)
  DO UPDATE SET
    profile_id = EXCLUDED.profile_id,
    updated_at = now();

  -- Update the magic login link as redeemed
  UPDATE public.magic_login_links
  SET redeemed_at = now(),
      redeemed_device_id = request_device_id
  WHERE id = link_record.id;

  -- Note: If linked_profile_has_admin is true, the device will automatically have admin
  -- because it's now linked to an admin profile. No need to transfer admin rights.

  RETURN QUERY
  SELECT linked_profile.id, linked_profile.handle;
END;
$$;

-- Fix get_user_devices to use DISTINCT on device_id to prevent duplicates
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
      -- Profiles linked via devices table
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
  -- Use DISTINCT ON (device_id) to prevent duplicates when a device is linked to multiple profiles
  RETURN QUERY
  SELECT DISTINCT ON (d.device_id)
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
    d.device_id,
    -- Prefer current device's profile_id if it matches
    CASE WHEN d.device_id = current_device_id AND d.profile_id = ANY(user_profile_ids) THEN 0 ELSE 1 END,
    -- Then by most recent
    d.last_seen_at DESC NULLS LAST;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.redeem_magic_login_link(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_magic_login_link(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_user_devices() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_devices() TO anon;

COMMENT ON FUNCTION public.redeem_magic_login_link IS 
'Redeems a magic login link and links the device to the target profile. Cleans up old profile references to prevent device duplication.';

COMMENT ON FUNCTION public.get_user_devices IS 
'Returns all devices associated with the current user profile(s). Uses DISTINCT ON to prevent duplicate devices when accounts are linked.';

