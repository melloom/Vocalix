-- ============================================================================
-- Fix Ambiguous Column References in Magic Login Link Functions
-- ============================================================================
-- Fixes: column reference "expires_at" is ambiguous error
-- The issue occurs when RETURNS TABLE has columns with the same name as table columns

-- Fix extend_magic_login_link function
CREATE OR REPLACE FUNCTION public.extend_magic_login_link(
  link_token TEXT,
  additional_hours INTEGER DEFAULT 24
)
RETURNS TABLE (expires_at TIMESTAMPTZ, success BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_headers JSON;
  request_device_id TEXT;
  requester_profile_id UUID;
  hashed_token TEXT;
  link_record public.magic_login_links%ROWTYPE;
  new_expiry TIMESTAMPTZ;
BEGIN
  request_headers := current_setting('request.headers', true)::json;
  request_device_id := NULLIF(trim(request_headers->>'x-device-id'), '');

  IF request_device_id IS NULL THEN
    RAISE EXCEPTION 'Missing x-device-id header';
  END IF;

  SELECT id
  INTO requester_profile_id
  FROM public.profile_ids_for_request(request_device_id)
  LIMIT 1;

  IF requester_profile_id IS NULL THEN
    RAISE EXCEPTION 'Profile not found for supplied device';
  END IF;

  IF link_token IS NULL OR length(trim(link_token)) = 0 THEN
    RAISE EXCEPTION 'Invalid login token';
  END IF;

  -- Cap additional hours at 168 (7 days) and ensure positive
  additional_hours := LEAST(GREATEST(additional_hours, 1), 168);

  hashed_token := encode(digest(trim(link_token), 'sha256'), 'hex');

  SELECT *
  INTO link_record
  FROM public.magic_login_links
  WHERE token_hash = hashed_token
    AND profile_id = requester_profile_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Login link not found or you do not have permission to extend it';
  END IF;

  IF link_record.redeemed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot extend a link that has already been used';
  END IF;

  IF link_record.expires_at < now() THEN
    RAISE EXCEPTION 'Cannot extend an expired link';
  END IF;

  -- Calculate new expiry (cap at 168 hours from now maximum)
  new_expiry := LEAST(
    link_record.expires_at + (additional_hours || ' hours')::interval,
    now() + interval '168 hours'
  );

  -- Qualify all column references with table alias to avoid ambiguity
  UPDATE public.magic_login_links ml
  SET expires_at = new_expiry,
      duration_hours = EXTRACT(EPOCH FROM (new_expiry - ml.created_at)) / 3600
  WHERE ml.id = link_record.id;

  RETURN QUERY
  SELECT new_expiry AS expires_at, true AS success;
END;
$$;

-- Fix create_magic_login_link function to ensure no ambiguity
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
        calculated_duration_hours := 168; -- 7 days default (changed from 0.5 hours)
    END CASE;
  END IF;

  -- Clean up expired links for this profile (older than 30 days)
  -- Qualify expires_at with table alias to avoid ambiguity
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

-- Grant permissions (re-grant in case they were dropped)
GRANT EXECUTE ON FUNCTION public.create_magic_login_link(TEXT, TEXT, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.extend_magic_login_link(TEXT, INTEGER) TO authenticated, anon;

