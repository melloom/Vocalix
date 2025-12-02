-- ============================================================================
-- Add functions to get revoked sessions and unrevoke sessions/devices
-- ============================================================================

-- Get revoked sessions for a profile
CREATE OR REPLACE FUNCTION public.get_revoked_sessions(p_profile_id UUID)
RETURNS TABLE (
  id UUID,
  device_id TEXT,
  user_agent TEXT,
  ip_address INET,
  created_at TIMESTAMPTZ,
  last_accessed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  is_current_session BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_device_id TEXT;
  v_request_session_token_hash TEXT;
BEGIN
  -- Get current device_id and session token from request headers
  BEGIN
    v_request_device_id := NULLIF(trim(
      (current_setting('request.headers', true)::json ->> 'x-device-id')
    ), '');
    v_request_session_token_hash := NULLIF(trim(
      (current_setting('request.headers', true)::json ->> 'x-session-token-hash')
    ), '');
  EXCEPTION WHEN OTHERS THEN
    v_request_device_id := NULL;
    v_request_session_token_hash := NULL;
  END;

  RETURN QUERY
  SELECT 
    s.id,
    s.device_id,
    s.user_agent,
    s.ip_address,
    s.created_at,
    s.last_accessed_at,
    s.expires_at,
    s.revoked_at,
    -- Mark as current if device_id or session token matches (even if revoked)
    (s.device_id = v_request_device_id OR s.token_hash = v_request_session_token_hash) AS is_current_session
  FROM public.sessions s
  WHERE s.profile_id = p_profile_id
    AND s.revoked_at IS NOT NULL
  ORDER BY s.revoked_at DESC;
END;
$$;

-- Unrevoke a session
CREATE OR REPLACE FUNCTION public.unrevoke_session(p_session_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id UUID;
  v_request_profile_id UUID;
BEGIN
  -- Get profile ID from session
  SELECT profile_id INTO v_profile_id
  FROM public.sessions
  WHERE id = p_session_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Verify the requester owns this session
  BEGIN
    v_request_profile_id := (SELECT id FROM public.profile_ids_for_request(NULL, NULL) LIMIT 1);
  EXCEPTION WHEN OTHERS THEN
    RETURN false;
  END;

  IF v_request_profile_id IS NULL OR v_request_profile_id != v_profile_id THEN
    RAISE EXCEPTION 'You can only unrevoke your own sessions';
  END IF;

  -- Unrevoke the session (set revoked_at to NULL and extend expires_at if needed)
  UPDATE public.sessions
  SET revoked_at = NULL,
      expires_at = GREATEST(expires_at, now() + interval '30 days')
  WHERE id = p_session_id
    AND revoked_at IS NOT NULL;

  RETURN FOUND;
END;
$$;

-- Unrevoke a device
CREATE OR REPLACE FUNCTION public.unrevoke_device(p_device_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id UUID;
  v_request_profile_id UUID;
BEGIN
  -- Get profile ID from device
  SELECT profile_id INTO v_profile_id
  FROM public.devices
  WHERE device_id = p_device_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Verify the requester owns this device
  BEGIN
    v_request_profile_id := (SELECT id FROM public.profile_ids_for_request(NULL, NULL) LIMIT 1);
  EXCEPTION WHEN OTHERS THEN
    RETURN false;
  END;

  IF v_request_profile_id IS NULL OR v_request_profile_id != v_profile_id THEN
    RAISE EXCEPTION 'You can only unrevoke your own devices';
  END IF;

  -- Unrevoke the device
  UPDATE public.devices
  SET is_revoked = false,
      revoked_at = NULL
  WHERE device_id = p_device_id
    AND is_revoked = true;

  RETURN FOUND;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_revoked_sessions(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.unrevoke_session(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.unrevoke_device(TEXT) TO authenticated, anon;

