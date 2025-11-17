-- Transfer admin rights when magic link is redeemed
-- When a device redeems a magic link, if the device's current profile has admin rights,
-- those admin rights are transferred to the profile from the magic link

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
  has_admin_rights BOOLEAN;
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

  -- Check if the current device has a profile with admin rights
  -- Get the current device's profile (if any)
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

  -- Check if current device's profile has admin rights
  IF current_device_profile_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1
      FROM public.admins a
      WHERE a.profile_id = current_device_profile_id
    ) INTO has_admin_rights;

    -- If current device's profile has admin rights, transfer them to the linked profile
    IF has_admin_rights THEN
      -- Remove admin rights from current device's profile
      DELETE FROM public.admins
      WHERE profile_id = current_device_profile_id;

      -- Add admin rights to the linked profile (if not already admin)
      INSERT INTO public.admins (profile_id, role, created_at)
      VALUES (linked_profile.id, 'admin', now())
      ON CONFLICT (profile_id) DO UPDATE 
      SET role = 'admin', created_at = now();
    END IF;
  END IF;

  -- Link the device to the profile from the magic link
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

  RETURN QUERY
  SELECT linked_profile.id, linked_profile.handle;
END;
$$;

