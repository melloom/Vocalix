-- ============================================================================
-- Fix get_active_sessions to include current device/session
-- ============================================================================
-- The function should always show the current session, even if it's device-based
-- and not in the sessions table yet.

-- Drop the existing function first to allow return type change
DROP FUNCTION IF EXISTS public.get_active_sessions(UUID);

-- Recreate with new return type that includes is_current_session
CREATE FUNCTION public.get_active_sessions(p_profile_id UUID)
RETURNS TABLE (
  id UUID,
  device_id TEXT,
  user_agent TEXT,
  ip_address INET,
  created_at TIMESTAMPTZ,
  last_accessed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_current_session BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_device_id TEXT;
  v_request_session_token_hash TEXT;
  v_session_count INTEGER;
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

  -- Check if we have any sessions first
  SELECT COUNT(*) INTO v_session_count
  FROM public.sessions s
  WHERE s.profile_id = p_profile_id
    AND s.revoked_at IS NULL
    AND s.expires_at > now();
  
  -- Return sessions from sessions table
  RETURN QUERY
  SELECT 
    s.id,
    s.device_id,
    s.user_agent,
    s.ip_address,
    s.created_at,
    s.last_accessed_at,
    s.expires_at,
    -- Mark as current if device_id or session token matches
    (s.device_id = v_request_device_id OR s.token_hash = v_request_session_token_hash) AS is_current_session
  FROM public.sessions s
  WHERE s.profile_id = p_profile_id
    AND s.revoked_at IS NULL
    AND s.expires_at > now()
  ORDER BY 
    -- Put current session first
    CASE WHEN (s.device_id = v_request_device_id OR s.token_hash = v_request_session_token_hash) THEN 0 ELSE 1 END,
    s.last_accessed_at DESC;

  -- If no sessions found but we have a device_id, create a synthetic entry for current device
  -- This ensures the current device always appears
  IF v_session_count = 0 AND v_request_device_id IS NOT NULL THEN
    -- Check if device is linked to this profile
    IF EXISTS (
      SELECT 1 
      FROM public.devices d
      WHERE d.device_id = v_request_device_id
        AND d.profile_id = p_profile_id
    ) OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = p_profile_id
        AND p.device_id = v_request_device_id
    ) THEN
      -- Return synthetic session entry for current device
      RETURN QUERY
      SELECT 
        gen_random_uuid() AS id, -- Synthetic ID
        v_request_device_id AS device_id,
        COALESCE(
          (SELECT user_agent FROM public.devices WHERE device_id = v_request_device_id LIMIT 1),
          'Unknown'
        ) AS user_agent,
        NULL::INET AS ip_address,
        COALESCE(
          (SELECT first_seen_at FROM public.devices WHERE device_id = v_request_device_id LIMIT 1),
          now()
        ) AS created_at,
        COALESCE(
          (SELECT last_seen_at FROM public.devices WHERE device_id = v_request_device_id LIMIT 1),
          now()
        ) AS last_accessed_at,
        now() + interval '30 days' AS expires_at,
        true AS is_current_session; -- Always true for synthetic entry
    END IF;
  END IF;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_active_sessions(UUID) TO authenticated, anon;

