-- Enhance Magic Login Links System
-- Add longer expiration times, link types, and better management

-- Add new columns to magic_login_links table
ALTER TABLE public.magic_login_links
ADD COLUMN IF NOT EXISTS link_type TEXT DEFAULT 'standard' CHECK (link_type IN ('standard', 'extended', 'one_time')),
ADD COLUMN IF NOT EXISTS duration_hours INTEGER DEFAULT 7 CHECK (duration_hours > 0 AND duration_hours <= 168); -- Max 7 days

-- Update default expiration to 7 days instead of 30 minutes
ALTER TABLE public.magic_login_links
ALTER COLUMN expires_at DROP DEFAULT;

-- Add comment
COMMENT ON COLUMN public.magic_login_links.link_type IS 
'Type of link: standard (7 days), extended (7 days), one_time (1 hour for quick sharing)';

COMMENT ON COLUMN public.magic_login_links.duration_hours IS 
'Duration in hours before link expires. Max 7 days (168 hours).';

-- Drop all versions of create_magic_login_link to avoid ambiguity
-- Drop old version (1 parameter)
DROP FUNCTION IF EXISTS public.create_magic_login_link(TEXT);

-- Drop new version if it already exists (3 parameters)
DROP FUNCTION IF EXISTS public.create_magic_login_link(TEXT, TEXT, INTEGER);

-- Update create_magic_login_link function to support custom durations
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
  DELETE FROM public.magic_login_links
  WHERE profile_id = requester_profile_id
    AND (expires_at < now() - interval '30 days' OR redeemed_at IS NOT NULL);

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
  SELECT raw_token::text AS token, token_expiry, p_link_type;
END;
$$;

-- Create function to extend expiration of existing link
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

  UPDATE public.magic_login_links
  SET expires_at = new_expiry,
      duration_hours = EXTRACT(EPOCH FROM (new_expiry - created_at)) / 3600
  WHERE id = link_record.id;

  RETURN QUERY
  SELECT new_expiry, true;
END;
$$;

-- Create function to get active links for current user
CREATE OR REPLACE FUNCTION public.get_active_magic_links()
RETURNS TABLE (
  token TEXT,
  expires_at TIMESTAMPTZ,
  link_type TEXT,
  duration_hours INTEGER,
  created_at TIMESTAMPTZ,
  redeemed_at TIMESTAMPTZ,
  email TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_headers JSON;
  request_device_id TEXT;
  requester_profile_id UUID;
  hashed_token TEXT;
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

  -- Return active (non-redeemed, non-expired) links
  RETURN QUERY
  SELECT 
    encode(digest(ml.token_hash, 'hex'), 'hex') AS token, -- Note: This won't match original token, but shows status
    ml.expires_at,
    ml.link_type,
    ml.duration_hours,
    ml.created_at,
    ml.redeemed_at,
    ml.email
  FROM public.magic_login_links ml
  WHERE ml.profile_id = requester_profile_id
    AND ml.redeemed_at IS NULL
    AND ml.expires_at > now()
  ORDER BY ml.created_at DESC;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.create_magic_login_link(TEXT, TEXT, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.extend_magic_login_link(TEXT, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_active_magic_links() TO authenticated, anon;

-- Update index to include new columns
CREATE INDEX IF NOT EXISTS magic_login_links_type_expires_idx 
ON public.magic_login_links (profile_id, link_type, expires_at DESC) 
WHERE redeemed_at IS NULL;

COMMENT ON FUNCTION public.create_magic_login_link(TEXT, TEXT, INTEGER) IS 
'Create a magic login link with configurable duration. Types: standard/extended (7 days), one_time (1 hour).';

COMMENT ON FUNCTION public.extend_magic_login_link IS 
'Extend the expiration time of an existing magic login link.';

COMMENT ON FUNCTION public.get_active_magic_links IS 
'Get all active (non-redeemed, non-expired) magic login links for the current user.';

