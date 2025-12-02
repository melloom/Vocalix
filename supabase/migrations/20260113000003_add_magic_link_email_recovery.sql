-- ============================================================================
-- Magic Login Link Email Recovery
-- ============================================================================
-- This migration adds the ability to send magic login links via email
-- for users who forgot their login method but have a recovery email set.
-- ============================================================================

-- Function: Generate and send magic login link via email (by handle + recovery email)
CREATE OR REPLACE FUNCTION public.generate_magic_link_for_recovery(
  p_handle TEXT,
  p_recovery_email TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile RECORD;
  v_token UUID;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- Find profile by handle and recovery email
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE handle = p_handle
    AND recovery_email = p_recovery_email
    AND recovery_email IS NOT NULL
    AND trim(recovery_email) != '';
  
  IF NOT FOUND THEN
    -- Don't reveal if handle or email is wrong (security)
    RETURN NULL;
  END IF;
  
  -- Generate secure random token
  v_token := gen_random_uuid();
  v_expires_at := now() + interval '1 hour'; -- Link expires in 1 hour
  
  -- Store magic login link
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
    v_profile.id,
    md5(v_token::text),
    v_token::text,
    p_recovery_email,
    NULL, -- No device ID for recovery links
    v_expires_at,
    'one_time', -- Recovery links are one-time use
    1 -- 1 hour duration
  );
  
  RETURN v_token::text;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.generate_magic_link_for_recovery(TEXT, TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.generate_magic_link_for_recovery(TEXT, TEXT) IS 
'Generates a magic login link for account recovery. Returns token if handle and recovery email match, NULL otherwise.';

