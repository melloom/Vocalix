-- ============================================================================
-- Add function to deactivate/delete a magic login link
-- ============================================================================

CREATE OR REPLACE FUNCTION public.deactivate_magic_login_link(p_link_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requester_profile public.profiles%ROWTYPE;
  requester_profile_id UUID;
  link_record public.magic_login_links%ROWTYPE;
BEGIN
  -- Get the requester profile (handles both device-based and session-based auth)
  requester_profile := get_request_profile();
  requester_profile_id := requester_profile.id;

  -- Check if link exists and belongs to the requester
  SELECT * INTO link_record
  FROM public.magic_login_links
  WHERE id = p_link_id
    AND profile_id = requester_profile_id;

  -- If link doesn't exist or doesn't belong to user, return false
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Delete the link (deactivate it)
  DELETE FROM public.magic_login_links
  WHERE id = p_link_id
    AND profile_id = requester_profile_id;

  RETURN true;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.deactivate_magic_login_link(UUID) TO authenticated, anon;

COMMENT ON FUNCTION public.deactivate_magic_login_link(UUID) IS 
'Deactivate/delete a magic login link by ID. Only the owner of the link can deactivate it.';








