-- Merge accounts when admin links with another account
-- When an admin account links with a regular account, merge all data from the regular account into the admin account
-- This ensures admins can consolidate accounts while preserving all user data

-- Step 1: Update redeem_magic_login_link to merge accounts when admin links
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
  current_profile_has_admin BOOLEAN;
BEGIN
  request_headers := current_setting('request.headers', true)::json;
  request_device_id := NULLIF(trim(request_headers->>'x-device-id'), '');

  IF request_device_id IS NULL THEN
    RAISE EXCEPTION 'Missing x-device-id header';
  END IF;

  IF link_token IS NULL OR length(trim(link_token)) = 0 THEN
    RAISE EXCEPTION 'Invalid login token';
  END IF;

  -- Use md5() instead of digest() - no pgcrypto needed!
  hashed_token := md5(trim(link_token));

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

  -- Check if current profile has admin rights
  IF current_device_profile_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1
      FROM public.admins a
      WHERE a.profile_id = current_device_profile_id
    ) INTO current_profile_has_admin;
  END IF;

  -- MERGE ACCOUNTS: If either profile is an admin and they're different, merge them
  IF current_device_profile_id IS NOT NULL 
     AND current_device_profile_id != linked_profile.id 
     AND (linked_profile_has_admin OR current_profile_has_admin) THEN
    
    DECLARE
      admin_profile_id UUID;
      regular_profile_id UUID;
    BEGIN
      -- Determine which is the admin profile (keep the admin one)
      IF linked_profile_has_admin THEN
        admin_profile_id := linked_profile.id;
        regular_profile_id := current_device_profile_id;
      ELSE
        admin_profile_id := current_device_profile_id;
        regular_profile_id := linked_profile.id;
      END IF;

      -- Transfer all clips from regular profile to admin profile
      UPDATE public.clips
      SET profile_id = admin_profile_id
      WHERE profile_id = regular_profile_id;

      -- Transfer all listens from regular profile to admin profile
      UPDATE public.listens
      SET profile_id = admin_profile_id
      WHERE profile_id = regular_profile_id;

      -- Transfer all clip reactions from regular profile to admin profile
      UPDATE public.clip_reactions
      SET profile_id = admin_profile_id
      WHERE profile_id = regular_profile_id;

      -- Transfer all clip replies from regular profile to admin profile
      UPDATE public.clip_replies
      SET profile_id = admin_profile_id
      WHERE profile_id = regular_profile_id;

      -- Transfer all community memberships from regular profile to admin profile
      UPDATE public.community_members
      SET profile_id = admin_profile_id
      WHERE profile_id = regular_profile_id;

      -- Transfer all community moderators from regular profile to admin profile
      UPDATE public.community_moderators
      SET profile_id = admin_profile_id
      WHERE profile_id = regular_profile_id;

      -- Transfer all blocked users relationships
      UPDATE public.blocked_users
      SET blocker_id = admin_profile_id
      WHERE blocker_id = regular_profile_id;

      UPDATE public.blocked_users
      SET blocked_id = admin_profile_id
      WHERE blocked_id = regular_profile_id;

      -- Transfer all follows relationships
      UPDATE public.follows
      SET follower_id = admin_profile_id
      WHERE follower_id = regular_profile_id;

      UPDATE public.follows
      SET following_id = admin_profile_id
      WHERE following_id = regular_profile_id;

      -- Transfer all account link PINs
      UPDATE public.account_link_pins
      SET profile_id = admin_profile_id
      WHERE profile_id = regular_profile_id;

      -- Transfer all magic login links
      UPDATE public.magic_login_links
      SET profile_id = admin_profile_id
      WHERE profile_id = regular_profile_id;

      -- Transfer all devices to admin profile
      UPDATE public.devices
      SET profile_id = admin_profile_id
      WHERE profile_id = regular_profile_id;

      -- Delete the regular profile (admin profile is kept)
      DELETE FROM public.profiles
      WHERE id = regular_profile_id;

      -- Set the result to the admin profile
      linked_profile.id := admin_profile_id;
    END;
  ELSE
    -- Normal linking: just link the device to the profile
    -- IMPORTANT: Clean up old profile's device_id reference if it exists
    IF current_device_profile_id IS NOT NULL AND current_device_profile_id != linked_profile.id THEN
      UPDATE public.profiles
      SET device_id = NULL
      WHERE id = current_device_profile_id
        AND device_id = request_device_id;
    END IF;

    -- Link the device to the profile from the magic link
    INSERT INTO public.devices (device_id, profile_id)
    VALUES (request_device_id, linked_profile.id)
    ON CONFLICT (device_id)
    DO UPDATE SET
      profile_id = EXCLUDED.profile_id,
      updated_at = now();
  END IF;

  -- Update the magic login link as redeemed
  UPDATE public.magic_login_links
  SET redeemed_at = now(),
      redeemed_device_id = request_device_id
  WHERE id = link_record.id;

  RETURN QUERY
  SELECT linked_profile.id, linked_profile.handle;
END;
$$;

-- Step 2: Update redeem_account_link_pin to merge accounts when admin links
CREATE OR REPLACE FUNCTION public.redeem_account_link_pin(
  p_pin_code TEXT
)
RETURNS TABLE (
  profile_id UUID,
  handle TEXT,
  success BOOLEAN,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_headers JSON;
  request_device_id TEXT;
  pin_hash TEXT;
  pin_record public.account_link_pins%ROWTYPE;
  linked_profile public.profiles%ROWTYPE;
  current_device_profile_id UUID;
  linked_profile_has_admin BOOLEAN;
  current_profile_has_admin BOOLEAN;
BEGIN
  request_headers := current_setting('request.headers', true)::json;
  request_device_id := NULLIF(trim(request_headers->>'x-device-id'), '');

  IF request_device_id IS NULL THEN
    RAISE EXCEPTION 'Missing x-device-id header';
  END IF;

  IF p_pin_code IS NULL OR length(trim(p_pin_code)) != 4 THEN
    RETURN QUERY
    SELECT NULL::UUID, NULL::TEXT, false AS success, 'PIN must be 4 digits'::TEXT;
    RETURN;
  END IF;

  -- Hash the provided PIN using md5() (matching generate function)
  pin_hash := md5(trim(p_pin_code));

  -- Find the PIN
  SELECT *
  INTO pin_record
  FROM public.account_link_pins
  WHERE pin_hash = pin_hash
    AND is_active = true
    AND redeemed_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT NULL::UUID, NULL::TEXT, false AS success, 'Invalid or expired PIN'::TEXT;
    RETURN;
  END IF;

  -- Check if PIN is expired
  IF pin_record.expires_at < now() THEN
    UPDATE public.account_link_pins
    SET is_active = false
    WHERE id = pin_record.id;
    
    RETURN QUERY
    SELECT NULL::UUID, NULL::TEXT, false AS success, 'PIN has expired'::TEXT;
    RETURN;
  END IF;

  -- Get the profile
  SELECT *
  INTO linked_profile
  FROM public.profiles
  WHERE id = pin_record.profile_id;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT NULL::UUID, NULL::TEXT, false AS success, 'Profile not found'::TEXT;
    RETURN;
  END IF;

  -- Check if the profile that generated the PIN has admin rights
  SELECT EXISTS(
    SELECT 1
    FROM public.admins a
    WHERE a.profile_id = linked_profile.id
  ) INTO linked_profile_has_admin;

  -- Get current device's profile (if any) - for cleanup
  SELECT p.id
  INTO current_device_profile_id
  FROM public.profiles p
  WHERE p.device_id = request_device_id
  LIMIT 1;

  IF current_device_profile_id IS NULL THEN
    SELECT d.profile_id
    INTO current_device_profile_id
    FROM public.devices d
    WHERE d.device_id = request_device_id
      AND d.profile_id IS NOT NULL
    LIMIT 1;
  END IF;

  -- Check if current profile has admin rights
  IF current_device_profile_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1
      FROM public.admins a
      WHERE a.profile_id = current_device_profile_id
    ) INTO current_profile_has_admin;
  END IF;

  -- MERGE ACCOUNTS: If either profile is an admin and they're different, merge them
  IF current_device_profile_id IS NOT NULL 
     AND current_device_profile_id != linked_profile.id 
     AND (linked_profile_has_admin OR current_profile_has_admin) THEN
    
    DECLARE
      admin_profile_id UUID;
      regular_profile_id UUID;
    BEGIN
      -- Determine which is the admin profile (keep the admin one)
      IF linked_profile_has_admin THEN
        admin_profile_id := linked_profile.id;
        regular_profile_id := current_device_profile_id;
      ELSE
        admin_profile_id := current_device_profile_id;
        regular_profile_id := linked_profile.id;
      END IF;

      -- Transfer all clips from regular profile to admin profile
      UPDATE public.clips
      SET profile_id = admin_profile_id
      WHERE profile_id = regular_profile_id;

      -- Transfer all listens from regular profile to admin profile
      UPDATE public.listens
      SET profile_id = admin_profile_id
      WHERE profile_id = regular_profile_id;

      -- Transfer all clip reactions from regular profile to admin profile
      UPDATE public.clip_reactions
      SET profile_id = admin_profile_id
      WHERE profile_id = regular_profile_id;

      -- Transfer all clip replies from regular profile to admin profile
      UPDATE public.clip_replies
      SET profile_id = admin_profile_id
      WHERE profile_id = regular_profile_id;

      -- Transfer all community memberships from regular profile to admin profile
      UPDATE public.community_members
      SET profile_id = admin_profile_id
      WHERE profile_id = regular_profile_id;

      -- Transfer all community moderators from regular profile to admin profile
      UPDATE public.community_moderators
      SET profile_id = admin_profile_id
      WHERE profile_id = regular_profile_id;

      -- Transfer all blocked users relationships
      UPDATE public.blocked_users
      SET blocker_id = admin_profile_id
      WHERE blocker_id = regular_profile_id;

      UPDATE public.blocked_users
      SET blocked_id = admin_profile_id
      WHERE blocked_id = regular_profile_id;

      -- Transfer all follows relationships
      UPDATE public.follows
      SET follower_id = admin_profile_id
      WHERE follower_id = regular_profile_id;

      UPDATE public.follows
      SET following_id = admin_profile_id
      WHERE following_id = regular_profile_id;

      -- Transfer all account link PINs
      UPDATE public.account_link_pins
      SET profile_id = admin_profile_id
      WHERE profile_id = regular_profile_id;

      -- Transfer all magic login links
      UPDATE public.magic_login_links
      SET profile_id = admin_profile_id
      WHERE profile_id = regular_profile_id;

      -- Transfer all devices to admin profile
      UPDATE public.devices
      SET profile_id = admin_profile_id
      WHERE profile_id = regular_profile_id;

      -- Delete the regular profile (admin profile is kept)
      DELETE FROM public.profiles
      WHERE id = regular_profile_id;

      -- Set the result to the admin profile
      linked_profile.id := admin_profile_id;
    END;
  ELSE
    -- Normal linking: just link the device to the profile
    -- Clean up old profile's device_id reference if different
    IF current_device_profile_id IS NOT NULL AND current_device_profile_id != linked_profile.id THEN
      UPDATE public.profiles
      SET device_id = NULL
      WHERE id = current_device_profile_id
        AND device_id = request_device_id;
    END IF;

    -- Link the device to the profile from the PIN
    INSERT INTO public.devices (device_id, profile_id)
    VALUES (request_device_id, linked_profile.id)
    ON CONFLICT (device_id)
    DO UPDATE SET
      profile_id = EXCLUDED.profile_id,
      updated_at = now();
  END IF;

  -- Mark PIN as redeemed
  UPDATE public.account_link_pins
  SET redeemed_at = now(),
      redeemed_device_id = request_device_id,
      is_active = false
  WHERE id = pin_record.id;

  -- Return success
  RETURN QUERY
  SELECT linked_profile.id, linked_profile.handle, true AS success, 'Device linked successfully'::TEXT;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.redeem_magic_login_link(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_magic_login_link(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.redeem_account_link_pin(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_account_link_pin(TEXT) TO anon;

-- Comments
COMMENT ON FUNCTION public.redeem_magic_login_link(TEXT) IS 
'Redeems a magic login link. If an admin account links with a regular account, merges all data from the regular account into the admin account.';

COMMENT ON FUNCTION public.redeem_account_link_pin(TEXT) IS 
'Validates and redeems a 4-digit PIN to link a device to an account. If an admin account links with a regular account, merges all data from the regular account into the admin account.';

