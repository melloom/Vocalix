-- ============================================================================
-- Personal Login PIN Support (Handle + PIN Login)
-- ============================================================================
-- This migration adds a per-account login PIN that users can set/change
-- and then use (with their handle) to sign in from any device.
--
-- Design:
-- - PIN is numeric-only, 4-8 digits (validated server-side).
-- - Stored as SHA-256 hash of (salt || PIN); raw PIN is never stored.
-- - Per-profile salt so identical PINs on different accounts hash differently.
-- - Basic lockout after repeated failed attempts to slow brute force:
--     * Track failed attempts and an optional locked_until timestamp.
-- - Two main RPC functions:
--     * set_login_pin(p_current_pin, p_new_pin)
--         - Authenticated/device/session-based, uses get_request_profile()
--         - If a PIN already exists, p_current_pin must match to change it
--     * login_with_pin(p_handle, p_pin_code, p_device_id, p_user_agent, p_duration_hours)
--         - Public (anon/auth) - uses handle + PIN to find profile
--         - Applies lockout rules and, on success, creates a session via create_session()
-- ============================================================================

-- ============================================================================
-- PART 1: Add Columns to Profiles
-- ============================================================================

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS login_pin_hash TEXT,
ADD COLUMN IF NOT EXISTS login_pin_salt TEXT,
ADD COLUMN IF NOT EXISTS login_pin_set_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS login_pin_failed_attempts INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS login_pin_locked_until TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.login_pin_hash IS 'SHA-256 hash of (salt || numeric PIN) used for handle+PIN login';
COMMENT ON COLUMN public.profiles.login_pin_salt IS 'Random per-profile salt for login PIN hashing';
COMMENT ON COLUMN public.profiles.login_pin_set_at IS 'Timestamp when the current login PIN was last set/changed';
COMMENT ON COLUMN public.profiles.login_pin_failed_attempts IS 'Consecutive failed login PIN attempts counter';
COMMENT ON COLUMN public.profiles.login_pin_locked_until IS 'Until when PIN login is locked after too many failures';

-- Index to quickly find locked accounts
CREATE INDEX IF NOT EXISTS idx_profiles_login_pin_locked_until
ON public.profiles(login_pin_locked_until)
WHERE login_pin_locked_until IS NOT NULL;

-- ============================================================================
-- PART 2: Helper to Hash PIN with Salt
-- ============================================================================

CREATE OR REPLACE FUNCTION public.hash_login_pin(p_salt TEXT, p_pin TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT encode(digest(p_salt || p_pin, 'sha256'), 'hex');
$$;

COMMENT ON FUNCTION public.hash_login_pin(TEXT, TEXT) IS
'Helper to compute SHA-256 hash for login PIN using per-profile salt.';

-- ============================================================================
-- PART 3: Set / Change Login PIN
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_login_pin(
  p_current_pin TEXT,
  p_new_pin TEXT
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requester_profile public.profiles%ROWTYPE;
  v_salt TEXT;
  v_new_hash TEXT;
  v_current_hash TEXT;
  v_has_existing_pin BOOLEAN;
BEGIN
  -- Identify the current profile using existing auth/device/session logic
  requester_profile := public.get_request_profile();

  -- Basic validation on new PIN: must be 4-8 digits
  IF p_new_pin IS NULL OR length(trim(p_new_pin)) < 4 OR length(trim(p_new_pin)) > 8 OR NOT trim(p_new_pin) ~ '^[0-9]+$' THEN
    RETURN QUERY SELECT false, 'PIN must be 4-8 digits.'::TEXT;
    RETURN;
  END IF;

  v_has_existing_pin := requester_profile.login_pin_hash IS NOT NULL
                        AND requester_profile.login_pin_salt IS NOT NULL;

  -- If a PIN already exists, require correct current PIN
  IF v_has_existing_pin THEN
    IF p_current_pin IS NULL OR length(trim(p_current_pin)) = 0 THEN
      RETURN QUERY SELECT false, 'Current PIN is required to change your PIN.'::TEXT;
      RETURN;
    END IF;

    v_current_hash := public.hash_login_pin(requester_profile.login_pin_salt, trim(p_current_pin));

    IF v_current_hash <> requester_profile.login_pin_hash THEN
      RETURN QUERY SELECT false, 'Current PIN is incorrect.'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- Generate new salt
  v_salt := encode(gen_random_bytes(16), 'hex');
  v_new_hash := public.hash_login_pin(v_salt, trim(p_new_pin));

  -- Update profile with new PIN, reset counters
  UPDATE public.profiles
  SET
    login_pin_salt = v_salt,
    login_pin_hash = v_new_hash,
    login_pin_set_at = now(),
    login_pin_failed_attempts = 0,
    login_pin_locked_until = NULL
  WHERE id = requester_profile.id;

  RETURN QUERY SELECT true, 'Login PIN updated successfully.'::TEXT;
END;
$$;

COMMENT ON FUNCTION public.set_login_pin(TEXT, TEXT) IS
'Sets or changes the caller''s personal login PIN. Requires current PIN if one is already set.';

-- ============================================================================
-- PART 4: Handle + PIN Login Function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.login_with_pin(
  p_handle TEXT,
  p_pin_code TEXT,
  p_device_id TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_duration_hours INTEGER DEFAULT 720
)
RETURNS TABLE (
  profile_id UUID,
  handle TEXT,
  session_token TEXT,
  expires_at TIMESTAMPTZ,
  success BOOLEAN,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_pin_hash TEXT;
  v_now TIMESTAMPTZ := now();
  v_expires_at TIMESTAMPTZ;
  v_session_token TEXT;
  v_session_record RECORD;
  v_failed_attempts INTEGER;
  v_locked_until TIMESTAMPTZ;
  v_normalized_handle TEXT;
BEGIN
  -- Normalize and validate input
  v_normalized_handle := trim(BOTH '@' FROM COALESCE(p_handle, ''));

  IF v_normalized_handle IS NULL OR length(v_normalized_handle) = 0 THEN
    RETURN QUERY SELECT NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ, false, 'Handle is required.'::TEXT;
    RETURN;
  END IF;

  IF p_pin_code IS NULL OR length(trim(p_pin_code)) < 4 OR length(trim(p_pin_code)) > 8 OR NOT trim(p_pin_code) ~ '^[0-9]+$' THEN
    RETURN QUERY SELECT NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ, false, 'PIN must be 4-8 digits.'::TEXT;
    RETURN;
  END IF;

  -- Look up profile by handle
  SELECT *
  INTO v_profile
  FROM public.profiles
  WHERE handle = v_normalized_handle
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ, false, 'We could not find an account with that handle.'::TEXT;
    RETURN;
  END IF;

  -- Check if PIN is configured
  IF v_profile.login_pin_hash IS NULL OR v_profile.login_pin_salt IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ, false, 'This account does not have a login PIN set yet.'::TEXT;
    RETURN;
  END IF;

  v_failed_attempts := COALESCE(v_profile.login_pin_failed_attempts, 0);
  v_locked_until := v_profile.login_pin_locked_until;

  -- Check lockout
  IF v_locked_until IS NOT NULL AND v_locked_until > v_now THEN
    RETURN QUERY SELECT NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ, false,
      format('PIN login is temporarily locked. Try again after %s.', to_char(v_locked_until, 'YYYY-MM-DD HH24:MI:SS TZ'))::TEXT;
    RETURN;
  END IF;

  -- Verify PIN
  v_pin_hash := public.hash_login_pin(v_profile.login_pin_salt, trim(p_pin_code));

  IF v_pin_hash <> v_profile.login_pin_hash THEN
    -- Increment failed attempts and maybe lock the account
    v_failed_attempts := v_failed_attempts + 1;

    IF v_failed_attempts >= 5 THEN
      -- Lock for 15 minutes after 5 consecutive failures
      UPDATE public.profiles
      SET
        login_pin_failed_attempts = v_failed_attempts,
        login_pin_locked_until = v_now + interval '15 minutes'
      WHERE id = v_profile.id;

      RETURN QUERY SELECT NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ, false,
        'Too many incorrect PIN attempts. Login with PIN is locked for 15 minutes.'::TEXT;
      RETURN;
    ELSE
      UPDATE public.profiles
      SET login_pin_failed_attempts = v_failed_attempts
      WHERE id = v_profile.id;

      RETURN QUERY SELECT NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ, false,
        'Incorrect PIN. Please try again.'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- PIN is correct: reset failure counters
  UPDATE public.profiles
  SET
    login_pin_failed_attempts = 0,
    login_pin_locked_until = NULL
  WHERE id = v_profile.id;

  -- Create a session using existing session function
  BEGIN
    SELECT session_token, expires_at
    INTO v_session_token, v_expires_at
    FROM public.create_session(
      v_profile.id,
      p_device_id,
      p_user_agent,
      COALESCE(p_duration_hours, 720)
    );
  EXCEPTION WHEN OTHERS THEN
    -- If session creation fails, still return success=false and message
    RETURN QUERY SELECT NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ, false,
      'PIN verified, but we could not create a session. Please try again.'::TEXT;
    RETURN;
  END;

  RETURN QUERY
  SELECT
    v_profile.id,
    v_profile.handle,
    v_session_token,
    v_expires_at,
    true,
    'Login successful.'::TEXT;
END;
$$;

COMMENT ON FUNCTION public.login_with_pin(TEXT, TEXT, TEXT, TEXT, INTEGER) IS
'Logs a user in using handle + personal PIN, applying lockout rules and creating a session.';

-- ============================================================================
-- PART 5: Permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.set_login_pin(TEXT, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.login_with_pin(TEXT, TEXT, TEXT, TEXT, INTEGER) TO authenticated, anon;


