-- Fix get_active_magic_links to return proper metadata without trying to decode token hash
-- We can't return the original token for security, but we can return link metadata

-- Drop the existing function first since we're changing the return type
DROP FUNCTION IF EXISTS public.get_active_magic_links();

-- Create the new version with updated return type
CREATE FUNCTION public.get_active_magic_links()
RETURNS TABLE (
  id UUID,
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
  request_headers JSON;
  request_device_id TEXT;
  requester_profile_id UUID;
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

  -- Return all links (active and inactive) with status flags
  RETURN QUERY
  SELECT 
    ml.id,
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
GRANT EXECUTE ON FUNCTION public.get_active_magic_links() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_magic_links() TO anon;

COMMENT ON FUNCTION public.get_active_magic_links IS 
'Get all magic login links for the current user with status information. Returns active and inactive links.';

