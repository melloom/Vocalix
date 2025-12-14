-- ============================================================================
-- Cross-Browser Device Detection
-- ============================================================================
-- This migration adds functionality to detect when a device ID is found
-- on another browser and prompt the user to sign in.
-- ============================================================================

-- Function to check for cross-browser sessions
-- Returns sessions from other browsers (different user agents) for the same profile
CREATE OR REPLACE FUNCTION public.check_cross_browser_sessions(
  p_profile_id UUID,
  p_current_user_agent TEXT DEFAULT NULL,
  p_current_device_id TEXT DEFAULT NULL
)
RETURNS TABLE (
  session_id UUID,
  device_id TEXT,
  user_agent TEXT,
  browser_name TEXT,
  created_at TIMESTAMPTZ,
  last_accessed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_user_agent TEXT;
BEGIN
  -- Get current user agent from headers if not provided
  IF p_current_user_agent IS NULL THEN
    BEGIN
      v_current_user_agent := current_setting('request.headers', true)::json->>'user-agent';
      IF v_current_user_agent IS NULL OR v_current_user_agent = '' THEN
        v_current_user_agent := current_setting('request.headers', true)::json->>'x-user-agent';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      BEGIN
        v_current_user_agent := current_setting('request.headers', true)::json->>'x-user-agent';
      EXCEPTION WHEN OTHERS THEN
        v_current_user_agent := NULL;
      END;
    END;
  ELSE
    v_current_user_agent := p_current_user_agent;
  END IF;

  -- Return active sessions from other browsers (different user agents)
  -- Exclude the current device if provided
  RETURN QUERY
  SELECT DISTINCT
    s.id AS session_id,
    s.device_id,
    s.user_agent,
    CASE
      WHEN s.user_agent ILIKE '%Safari%' AND s.user_agent NOT ILIKE '%Chrome%' THEN 'Safari'
      WHEN s.user_agent ILIKE '%Firefox%' THEN 'Firefox'
      WHEN s.user_agent ILIKE '%Chrome%' THEN 'Chrome'
      WHEN s.user_agent ILIKE '%Edge%' THEN 'Edge'
      WHEN s.user_agent ILIKE '%Opera%' THEN 'Opera'
      ELSE 'Unknown'
    END AS browser_name,
    s.created_at,
    s.last_accessed_at
  FROM public.sessions s
  WHERE s.profile_id = p_profile_id
    AND s.revoked_at IS NULL
    AND s.expires_at > now()
    -- Exclude current session (different user agent or different device)
    AND (
      (v_current_user_agent IS NOT NULL AND s.user_agent IS NOT NULL AND s.user_agent <> v_current_user_agent)
      OR (p_current_device_id IS NOT NULL AND s.device_id IS NOT NULL AND s.device_id <> p_current_device_id)
      OR (v_current_user_agent IS NULL AND p_current_device_id IS NULL)
    )
  ORDER BY s.last_accessed_at DESC
  LIMIT 5; -- Limit to most recent 5 cross-browser sessions
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.check_cross_browser_sessions(UUID, TEXT, TEXT) TO authenticated, anon;

-- Function to check if device_id exists in sessions from other browsers
-- This is the main function that will be called when signing in
CREATE OR REPLACE FUNCTION public.check_device_on_other_browser(
  p_device_id TEXT,
  p_current_user_agent TEXT DEFAULT NULL
)
RETURNS TABLE (
  profile_id UUID,
  handle TEXT,
  session_count INTEGER,
  browsers TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_user_agent TEXT;
  v_profile_record RECORD;
BEGIN
  -- Get current user agent from headers if not provided
  IF p_current_user_agent IS NULL THEN
    BEGIN
      v_current_user_agent := current_setting('request.headers', true)::json->>'user-agent';
      IF v_current_user_agent IS NULL OR v_current_user_agent = '' THEN
        v_current_user_agent := current_setting('request.headers', true)::json->>'x-user-agent';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      BEGIN
        v_current_user_agent := current_setting('request.headers', true)::json->>'x-user-agent';
      EXCEPTION WHEN OTHERS THEN
        v_current_user_agent := NULL;
      END;
    END;
  ELSE
    v_current_user_agent := p_current_user_agent;
  END IF;

  -- Find profiles that have sessions with this device_id but different user agents
  FOR v_profile_record IN
    SELECT DISTINCT
      p.id AS profile_id,
      p.handle,
      COUNT(DISTINCT s.id) AS session_count,
      ARRAY_AGG(DISTINCT 
        CASE
          WHEN s.user_agent ILIKE '%Safari%' AND s.user_agent NOT ILIKE '%Chrome%' THEN 'Safari'
          WHEN s.user_agent ILIKE '%Firefox%' THEN 'Firefox'
          WHEN s.user_agent ILIKE '%Chrome%' THEN 'Chrome'
          WHEN s.user_agent ILIKE '%Edge%' THEN 'Edge'
          WHEN s.user_agent ILIKE '%Opera%' THEN 'Opera'
          ELSE 'Unknown'
        END
      ) FILTER (WHERE s.user_agent IS NOT NULL) AS browsers
    FROM public.profiles p
    INNER JOIN public.sessions s ON s.profile_id = p.id
    WHERE s.device_id = p_device_id
      AND s.revoked_at IS NULL
      AND s.expires_at > now()
      -- Only return if there are sessions from different browsers
      AND (
        v_current_user_agent IS NULL 
        OR s.user_agent IS NULL 
        OR s.user_agent <> v_current_user_agent
      )
    GROUP BY p.id, p.handle
    HAVING COUNT(DISTINCT s.id) > 0
  LOOP
    RETURN QUERY
    SELECT 
      v_profile_record.profile_id,
      v_profile_record.handle,
      v_profile_record.session_count::INTEGER,
      v_profile_record.browsers;
  END LOOP;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.check_device_on_other_browser(TEXT, TEXT) TO authenticated, anon;

