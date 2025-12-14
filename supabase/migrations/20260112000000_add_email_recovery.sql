-- ============================================================================
-- Email Recovery for Login PIN Reset
-- ============================================================================
-- This migration adds email recovery functionality so users can reset their
-- login PIN via email if they forget it.
-- ============================================================================

-- Add recovery_email column to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS recovery_email TEXT;

-- Add PIN reset token fields
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS pin_reset_token TEXT,
ADD COLUMN IF NOT EXISTS pin_reset_token_expires_at TIMESTAMPTZ;

-- Add index for recovery email lookups
CREATE INDEX IF NOT EXISTS idx_profiles_recovery_email 
ON public.profiles(recovery_email) 
WHERE recovery_email IS NOT NULL AND trim(recovery_email) != '';

-- Add comment
COMMENT ON COLUMN public.profiles.recovery_email IS 'Email address for account recovery (PIN reset)';
COMMENT ON COLUMN public.profiles.pin_reset_token IS 'Temporary token for PIN reset via email';
COMMENT ON COLUMN public.profiles.pin_reset_token_expires_at IS 'Expiration time for PIN reset token';

-- ============================================================================
-- Function: Generate PIN Reset Token
-- ============================================================================
CREATE OR REPLACE FUNCTION public.generate_pin_reset_token(p_handle TEXT, p_recovery_email TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile RECORD;
  v_token TEXT;
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
  
  -- Check if user has a login PIN set
  IF v_profile.login_pin_hash IS NULL THEN
    -- User doesn't have a PIN set, can't reset
    RETURN NULL;
  END IF;
  
  -- Generate secure random token (base64 encoded, 32 bytes = 44 chars)
  v_token := encode(gen_random_bytes(32), 'base64');
  v_expires_at := now() + interval '1 hour'; -- Token expires in 1 hour
  
  -- Store token in profile
  UPDATE public.profiles
  SET 
    pin_reset_token = v_token,
    pin_reset_token_expires_at = v_expires_at
  WHERE id = v_profile.id;
  
  RETURN v_token;
END;
$$;

-- ============================================================================
-- Function: Verify PIN Reset Token
-- ============================================================================
CREATE OR REPLACE FUNCTION public.verify_pin_reset_token(p_handle TEXT, p_token TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id UUID;
BEGIN
  -- Find profile by handle and valid token
  SELECT id INTO v_profile_id
  FROM public.profiles
  WHERE handle = p_handle
    AND pin_reset_token = p_token
    AND pin_reset_token_expires_at > now();
  
  IF v_profile_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Clear the token (one-time use)
  UPDATE public.profiles
  SET 
    pin_reset_token = NULL,
    pin_reset_token_expires_at = NULL
  WHERE id = v_profile_id;
  
  RETURN v_profile_id;
END;
$$;

-- ============================================================================
-- Function: Reset PIN Using Token
-- ============================================================================
CREATE OR REPLACE FUNCTION public.reset_pin_with_token(
  p_profile_id UUID,
  p_token TEXT,
  p_new_pin TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile RECORD;
  v_salt TEXT;
  v_pin_hash TEXT;
  v_token_valid BOOLEAN := false;
BEGIN
  -- Get profile
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = p_profile_id;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Verify token
  IF v_profile.pin_reset_token = p_token 
     AND v_profile.pin_reset_token_expires_at > now() THEN
    v_token_valid := true;
  END IF;
  
  IF NOT v_token_valid THEN
    RETURN false;
  END IF;
  
  -- Validate PIN (4-8 digits)
  IF length(p_new_pin) < 4 OR length(p_new_pin) > 8 OR p_new_pin !~ '^[0-9]+$' THEN
    RETURN false;
  END IF;
  
  -- Generate new salt if needed
  IF v_profile.login_pin_salt IS NULL THEN
    v_salt := encode(gen_random_bytes(16), 'base64');
  ELSE
    v_salt := v_profile.login_pin_salt;
  END IF;
  
  -- Hash the new PIN
  v_pin_hash := public.hash_login_pin(v_salt, p_new_pin);
  
  -- Update profile with new PIN and clear token
  UPDATE public.profiles
  SET 
    login_pin_hash = v_pin_hash,
    login_pin_salt = v_salt,
    login_pin_set_at = now(),
    login_pin_failed_attempts = 0,
    login_pin_locked_until = NULL,
    pin_reset_token = NULL,
    pin_reset_token_expires_at = NULL
  WHERE id = p_profile_id;
  
  RETURN true;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.generate_pin_reset_token(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_pin_reset_token(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_pin_with_token(UUID, TEXT, TEXT) TO anon, authenticated;

