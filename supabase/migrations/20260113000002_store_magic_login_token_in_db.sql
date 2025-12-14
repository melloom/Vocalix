-- ============================================================================
-- Store Original Token in Database for Cross-Device Access
-- ============================================================================
-- This migration adds a token column to store the original token so that
-- login links can be accessed across all devices, not just the one that
-- generated them.
-- ============================================================================

-- Add token column to magic_login_links table
ALTER TABLE public.magic_login_links
ADD COLUMN IF NOT EXISTS token TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_magic_login_links_token 
ON public.magic_login_links(token) 
WHERE token IS NOT NULL;

-- Add comment
COMMENT ON COLUMN public.magic_login_links.token IS 
'Original token for the login link. Stored so links can be accessed across devices.';

-- ============================================================================
-- Update create_magic_login_link to store the token
-- ============================================================================
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
  DELETE FROM public.magic_login_links
  WHERE profile_id = requester_profile_id
    AND (expires_at < now() - interval '30 days' OR redeemed_at IS NOT NULL);

  raw_token := gen_random_uuid();
  token_expiry := now() + (calculated_duration_hours || ' hours')::interval;

  -- Insert new magic login link with token stored
  -- Use md5() instead of digest() - no pgcrypto needed!
  INSERT INTO public.magic_login_links (
    profile_id,
    token_hash,
    token,
    email,
    created_device_id,
    expires_at,
    link_type,
    duration_hours
  )
  VALUES (
    requester_profile_id,
    md5(raw_token::text),
    raw_token::text, -- Store original token
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

-- ============================================================================
-- Update get_active_magic_links to return the token
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_active_magic_links()
RETURNS TABLE (
  id UUID,
  token TEXT,
  expires_at TIMESTAMPTZ,
  link_type TEXT,
  duration_hours INTEGER,
  created_at TIMESTAMPTZ,
  redeemed_at TIMESTAMPTZ,
  email TEXT,
  is_expired BOOLEAN,
  is_redeemed BOOLEAN,
  is_active BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requester_profile public.profiles%ROWTYPE;
  requester_profile_id UUID;
BEGIN
  -- Get the requester profile (handles both device-based and session-based auth)
  requester_profile := get_request_profile();
  requester_profile_id := requester_profile.id;

  -- Return all links (active and inactive) with status flags and token
  RETURN QUERY
  SELECT 
    ml.id,
    ml.token, -- Return the original token
    ml.expires_at,
    ml.link_type,
    ml.duration_hours,
    ml.created_at,
    ml.redeemed_at,
    ml.email,
    (ml.expires_at < now()) AS is_expired,
    (ml.redeemed_at IS NOT NULL) AS is_redeemed,
    (ml.redeemed_at IS NULL AND ml.expires_at > now()) AS is_active
  FROM public.magic_login_links ml
  WHERE ml.profile_id = requester_profile_id
  ORDER BY ml.created_at DESC
  LIMIT 50; -- Limit to most recent 50 links
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_active_magic_links() TO authenticated, anon;

COMMENT ON FUNCTION public.get_active_magic_links() IS 
'Get all magic login links for the current user with status information and original tokens. Returns active and inactive links.';

