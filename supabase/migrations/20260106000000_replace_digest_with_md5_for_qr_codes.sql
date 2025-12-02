-- Replace digest() with md5() for QR code functions (like we did for PIN)
-- This removes the dependency on pgcrypto extension and uses PostgreSQL's built-in md5() function

-- Step 1: Update create_magic_login_link to use md5() instead of digest()
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
  -- Get request headers
  BEGIN
    request_headers := current_setting('request.headers', true)::json;
    request_device_id := NULLIF(trim(request_headers->>'x-device-id'), '');
  EXCEPTION WHEN OTHERS THEN
    request_device_id := NULL;
  END;

  IF request_device_id IS NULL THEN
    RAISE EXCEPTION 'Missing x-device-id header';
  END IF;

  -- Validate link type
  IF p_link_type NOT IN ('standard', 'extended', 'one_time') THEN
    p_link_type := 'standard';
  END IF;

  -- Get profile ID from device
  BEGIN
    SELECT id
    INTO requester_profile_id
    FROM public.profile_ids_for_request(request_device_id)
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    requester_profile_id := NULL;
  END;

  IF requester_profile_id IS NULL THEN
    RAISE EXCEPTION 'Profile not found for supplied device';
  END IF;

  -- Determine duration based on link type or provided duration
  IF p_duration_hours IS NOT NULL THEN
    calculated_duration_hours := LEAST(p_duration_hours, 168);
  ELSE
    CASE p_link_type
      WHEN 'one_time' THEN
        calculated_duration_hours := 1;
      WHEN 'extended' THEN
        calculated_duration_hours := 168;
      ELSE
        calculated_duration_hours := 168;
    END CASE;
  END IF;

  -- Clean up expired links for this profile
  DELETE FROM public.magic_login_links ml
  WHERE ml.profile_id = requester_profile_id
    AND (ml.expires_at < now() - interval '30 days' OR ml.redeemed_at IS NOT NULL);

  -- Generate token and expiry
  raw_token := gen_random_uuid();
  token_expiry := now() + (calculated_duration_hours || ' hours')::interval;

  -- Insert new magic login link
  -- Use md5() instead of digest() - no pgcrypto needed!
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
    md5(raw_token::text),
    NULLIF(trim(target_email), ''),
    request_device_id,
    token_expiry,
    p_link_type,
    calculated_duration_hours
  );

  -- Return result
  RETURN QUERY
  SELECT raw_token::text AS token, token_expiry AS expires_at, p_link_type AS link_type;
END;
$$;

-- Step 2: Update preview_magic_login_link to use md5() instead of digest()
CREATE OR REPLACE FUNCTION public.preview_magic_login_link(link_token TEXT)
RETURNS TABLE (
  profile_id UUID,
  handle TEXT,
  expires_at TIMESTAMPTZ,
  is_expired BOOLEAN,
  is_redeemed BOOLEAN,
  link_valid BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hashed_token TEXT;
  link_record public.magic_login_links%ROWTYPE;
  linked_profile public.profiles%ROWTYPE;
  link_is_expired BOOLEAN;
  link_is_redeemed BOOLEAN;
  link_is_valid BOOLEAN;
BEGIN
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
    -- Return null values to indicate link not found
    RETURN QUERY
    SELECT 
      NULL::UUID AS profile_id,
      NULL::TEXT AS handle,
      NULL::TIMESTAMPTZ AS expires_at,
      true AS is_expired,
      true AS is_redeemed,
      false AS link_valid;
    RETURN;
  END IF;

  -- Check if link is expired or redeemed
  link_is_expired := link_record.expires_at < now();
  link_is_redeemed := link_record.redeemed_at IS NOT NULL;
  link_is_valid := NOT link_is_expired AND NOT link_is_redeemed;

  -- Get profile information
  SELECT *
  INTO linked_profile
  FROM public.profiles
  WHERE id = link_record.profile_id;

  IF NOT FOUND THEN
    -- Profile not found
    RETURN QUERY
    SELECT 
      NULL::UUID AS profile_id,
      NULL::TEXT AS handle,
      link_record.expires_at AS expires_at,
      link_is_expired AS is_expired,
      link_is_redeemed AS is_redeemed,
      false AS link_valid;
    RETURN;
  END IF;

  -- Return link info
  RETURN QUERY
  SELECT 
    linked_profile.id AS profile_id,
    linked_profile.handle AS handle,
    link_record.expires_at AS expires_at,
    link_is_expired AS is_expired,
    link_is_redeemed AS is_redeemed,
    link_is_valid AS link_valid;
END;
$$;

-- Step 3: Update redeem_magic_login_link to use md5() instead of digest()
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

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.create_magic_login_link(TEXT, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_magic_login_link(TEXT, TEXT, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION public.create_magic_login_link(TEXT, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.preview_magic_login_link(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_magic_login_link(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.redeem_magic_login_link(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_magic_login_link(TEXT) TO anon;

-- Add comments
COMMENT ON FUNCTION public.create_magic_login_link(TEXT, TEXT, INTEGER) IS 
'Creates a magic login link for cross-device authentication. Uses md5() for hashing (no pgcrypto needed).';

COMMENT ON FUNCTION public.preview_magic_login_link(TEXT) IS 
'Previews magic login link info without redeeming. Uses md5() for hashing (no pgcrypto needed).';

COMMENT ON FUNCTION public.redeem_magic_login_link(TEXT) IS 
'Redeems a magic login link and links the device to the target profile. Uses md5() for hashing (no pgcrypto needed).';

