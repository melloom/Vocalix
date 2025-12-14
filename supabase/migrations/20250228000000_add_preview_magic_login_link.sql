-- Add function to preview magic login link info without redeeming
-- This allows the frontend to show account information in the confirmation dialog

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

  hashed_token := encode(digest(trim(link_token), 'sha256'), 'hex');

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

-- Grant execute permission to authenticated and anon users
GRANT EXECUTE ON FUNCTION public.preview_magic_login_link(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_magic_login_link(TEXT) TO anon;

