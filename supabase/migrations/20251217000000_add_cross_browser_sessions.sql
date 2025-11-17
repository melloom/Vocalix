-- ============================================================================
-- Cross-Browser Session Management
-- ============================================================================
-- This migration adds server-side session management with HTTP-only cookies
-- to enable cross-browser login functionality.
-- ============================================================================

-- ============================================================================
-- PART 1: Create Sessions Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL UNIQUE,
  token_hash TEXT NOT NULL UNIQUE, -- SHA-256 hash of token
  device_id TEXT, -- Optional: track original device
  user_agent TEXT,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS sessions_token_hash_idx ON public.sessions (token_hash) 
WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS sessions_profile_id_idx ON public.sessions (profile_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON public.sessions (expires_at) 
WHERE revoked_at IS NULL;

-- Enable RLS
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Note: These policies will be created after we update profile_ids_for_request function
DROP POLICY IF EXISTS "Users can view their own sessions" ON public.sessions;

-- No direct insert/update/delete - use RPC functions only
DROP POLICY IF EXISTS "No direct access to sessions" ON public.sessions;
CREATE POLICY "No direct access to sessions"
ON public.sessions FOR ALL
USING (false)
WITH CHECK (false);

-- ============================================================================
-- PART 2: Session Management Functions
-- ============================================================================

-- Create a new session
CREATE OR REPLACE FUNCTION public.create_session(
  p_profile_id UUID,
  p_device_id TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_duration_hours INTEGER DEFAULT 720 -- 30 days default
)
RETURNS TABLE (session_token TEXT, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_token TEXT;
  v_token_hash TEXT;
  v_expires_at TIMESTAMPTZ;
  v_request_ip INET;
BEGIN
  -- Validate profile exists
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_profile_id) THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  -- Generate secure session token (UUID + random bytes)
  v_session_token := gen_random_uuid()::text || encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(digest(v_session_token, 'sha256'), 'hex');
  v_expires_at := now() + (p_duration_hours || ' hours')::interval;

  -- Get request IP if available
  BEGIN
    v_request_ip := inet(current_setting('request.headers', true)::json->>'x-forwarded-for');
  EXCEPTION WHEN OTHERS THEN
    v_request_ip := NULL;
  END;

  -- Insert session
  INSERT INTO public.sessions (
    profile_id,
    session_token,
    token_hash,
    device_id,
    user_agent,
    ip_address,
    expires_at
  )
  VALUES (
    p_profile_id,
    v_session_token,
    v_token_hash,
    p_device_id,
    p_user_agent,
    v_request_ip,
    v_expires_at
  );

  -- Clean up expired sessions for this profile (keep last 10 active sessions)
  DELETE FROM public.sessions
  WHERE profile_id = p_profile_id
    AND id NOT IN (
      SELECT id FROM public.sessions
      WHERE profile_id = p_profile_id
        AND revoked_at IS NULL
        AND expires_at > now()
      ORDER BY last_accessed_at DESC
      LIMIT 10
    )
    AND (expires_at < now() OR revoked_at IS NOT NULL);

  RETURN QUERY
  SELECT v_session_token, v_expires_at;
END;
$$;

-- Validate session token
CREATE OR REPLACE FUNCTION public.validate_session(p_token_hash TEXT)
RETURNS TABLE (
  profile_id UUID,
  session_id UUID,
  is_valid BOOLEAN,
  reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.sessions%ROWTYPE;
BEGIN
  -- Find session
  SELECT * INTO v_session
  FROM public.sessions
  WHERE token_hash = p_token_hash
    AND revoked_at IS NULL
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, false, 'Session not found'::TEXT;
    RETURN;
  END IF;

  -- Check expiration
  IF v_session.expires_at < now() THEN
    -- Auto-revoke expired session
    UPDATE public.sessions
    SET revoked_at = now()
    WHERE id = v_session.id;

    RETURN QUERY SELECT NULL::UUID, NULL::UUID, false, 'Session expired'::TEXT;
    RETURN;
  END IF;

  -- Update last accessed
  UPDATE public.sessions
  SET last_accessed_at = now()
  WHERE id = v_session.id;

  RETURN QUERY
  SELECT v_session.profile_id, v_session.id, true, 'Valid'::TEXT;
END;
$$;

-- Get current session profile
CREATE OR REPLACE FUNCTION public.get_session_profile()
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_headers JSON;
  v_token_hash TEXT;
  v_session_profile_id UUID;
  v_profile public.profiles%ROWTYPE;
BEGIN
  -- Get token from header (set by middleware/client)
  v_request_headers := current_setting('request.headers', true)::json;
  v_token_hash := v_request_headers->>'x-session-token-hash';

  IF v_token_hash IS NULL OR length(trim(v_token_hash)) = 0 THEN
    RAISE EXCEPTION 'No session token provided';
  END IF;

  -- Validate session
  SELECT s.profile_id INTO v_session_profile_id
  FROM public.sessions s
  WHERE s.token_hash = v_token_hash
    AND s.revoked_at IS NULL
    AND s.expires_at > now()
  LIMIT 1;

  IF v_session_profile_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired session';
  END IF;

  -- Get profile
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = v_session_profile_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for session';
  END IF;

  RETURN v_profile;
END;
$$;

-- Revoke session by token hash
CREATE OR REPLACE FUNCTION public.revoke_session(p_token_hash TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.sessions
  SET revoked_at = now()
  WHERE token_hash = p_token_hash
    AND revoked_at IS NULL;

  RETURN FOUND;
END;
$$;

-- Revoke session by session ID
CREATE OR REPLACE FUNCTION public.revoke_session_by_id(p_session_id UUID)
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
  WHERE id = p_session_id
    AND revoked_at IS NULL;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Verify the requester owns this session
  -- Note: This will use the updated profile_ids_for_request function
  BEGIN
    v_request_profile_id := (SELECT id FROM public.profile_ids_for_request(NULL, NULL) LIMIT 1);
  EXCEPTION WHEN OTHERS THEN
    RETURN false;
  END;

  IF v_request_profile_id IS NULL OR v_request_profile_id != v_profile_id THEN
    RAISE EXCEPTION 'You can only revoke your own sessions';
  END IF;

  -- Revoke the session
  UPDATE public.sessions
  SET revoked_at = now()
  WHERE id = p_session_id
    AND revoked_at IS NULL;

  RETURN FOUND;
END;
$$;

-- Revoke all sessions for a profile
CREATE OR REPLACE FUNCTION public.revoke_all_sessions(p_profile_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.sessions
  SET revoked_at = now()
  WHERE profile_id = p_profile_id
    AND revoked_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Get active sessions for a profile
CREATE OR REPLACE FUNCTION public.get_active_sessions(p_profile_id UUID)
RETURNS TABLE (
  id UUID,
  device_id TEXT,
  user_agent TEXT,
  ip_address INET,
  created_at TIMESTAMPTZ,
  last_accessed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    s.device_id,
    s.user_agent,
    s.ip_address,
    s.created_at,
    s.last_accessed_at,
    s.expires_at
  FROM public.sessions s
  WHERE s.profile_id = p_profile_id
    AND s.revoked_at IS NULL
    AND s.expires_at > now()
  ORDER BY s.last_accessed_at DESC;
END;
$$;

-- ============================================================================
-- PART 3: Update Profile Lookup Function to Support Sessions
-- ============================================================================

-- Drop ALL overloaded versions of the function to avoid ambiguity
-- This will also drop dependent RLS policies, which we'll recreate after
-- The old function has signature: profile_ids_for_request(request_device_id TEXT DEFAULT NULL)
-- We need to drop it with CASCADE to handle all dependencies, then recreate policies
DROP FUNCTION IF EXISTS public.profile_ids_for_request(TEXT) CASCADE;

-- Update to support both session-based and device-based auth
CREATE OR REPLACE FUNCTION public.profile_ids_for_request(
  request_device_id TEXT DEFAULT NULL,
  request_session_token_hash TEXT DEFAULT NULL
)
RETURNS TABLE (id UUID)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH resolved_device AS (
    SELECT NULLIF(trim(
      COALESCE(
        request_device_id,
        (current_setting('request.headers', true)::json ->> 'x-device-id')
      )
    ), '') AS device_id
  )
  -- Try session-based auth first
  SELECT p.id
  FROM public.sessions s
  JOIN public.profiles p ON p.id = s.profile_id
  WHERE s.token_hash = COALESCE(
    request_session_token_hash,
    (current_setting('request.headers', true)::json ->> 'x-session-token-hash')
  )
    AND s.revoked_at IS NULL
    AND s.expires_at > now()
  
  UNION
  
  -- Fall back to device-based auth (backward compatibility)
  SELECT p.id
  FROM resolved_device r
  JOIN public.profiles p ON p.device_id = r.device_id
  WHERE r.device_id IS NOT NULL
  
  UNION
  
  SELECT d.profile_id
  FROM resolved_device r
  JOIN public.devices d ON d.device_id = r.device_id
  WHERE r.device_id IS NOT NULL
    AND d.profile_id IS NOT NULL;
$$;

-- ============================================================================
-- PART 4: Recreate RLS Policies that were dropped with CASCADE
-- ============================================================================
-- These policies were dropped when we dropped the old profile_ids_for_request function
-- We need to recreate them to use the new function signature

-- Sessions table policy
CREATE POLICY "Users can view their own sessions"
ON public.sessions FOR SELECT
USING (
  profile_id IN (SELECT id FROM public.profile_ids_for_request())
);

-- Profiles policies
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
USING (
  id IN (SELECT id FROM public.profile_ids_for_request())
)
WITH CHECK (
  id IN (SELECT id FROM public.profile_ids_for_request())
);

DROP POLICY IF EXISTS "Users can delete their own profile" ON public.profiles;
CREATE POLICY "Users can delete their own profile"
ON public.profiles FOR DELETE
USING (
  id IN (SELECT id FROM public.profile_ids_for_request())
);

-- Clips policies
DROP POLICY IF EXISTS "Owners view their clips" ON public.clips;
CREATE POLICY "Owners view their clips"
ON public.clips FOR SELECT
USING (
  profile_id IN (SELECT id FROM public.profile_ids_for_request())
);

DROP POLICY IF EXISTS "Owners update their clips" ON public.clips;
CREATE POLICY "Owners update their clips"
ON public.clips FOR UPDATE
USING (
  profile_id IN (SELECT id FROM public.profile_ids_for_request())
)
WITH CHECK (
  profile_id IN (SELECT id FROM public.profile_ids_for_request())
);

DROP POLICY IF EXISTS "Owners delete their clips" ON public.clips;
CREATE POLICY "Owners delete their clips"
ON public.clips FOR DELETE
USING (
  profile_id IN (SELECT id FROM public.profile_ids_for_request())
);

DROP POLICY IF EXISTS "Users can insert their own clips" ON public.clips;
CREATE POLICY "Users can insert their own clips"
ON public.clips FOR INSERT
WITH CHECK (
  profile_id IN (SELECT id FROM public.profile_ids_for_request())
);

DROP POLICY IF EXISTS "Admins view all clips" ON public.clips;
CREATE POLICY "Admins view all clips"
ON public.clips FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.admins a
    WHERE a.profile_id IN (SELECT id FROM public.profile_ids_for_request())
  )
);

DROP POLICY IF EXISTS "Admins update clips" ON public.clips;
CREATE POLICY "Admins update clips"
ON public.clips FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.admins a
    WHERE a.profile_id IN (SELECT id FROM public.profile_ids_for_request())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.admins a
    WHERE a.profile_id IN (SELECT id FROM public.profile_ids_for_request())
  )
);

-- Reports policies
DROP POLICY IF EXISTS "Reports insertable by reporters" ON public.reports;
CREATE POLICY "Reports insertable by reporters"
ON public.reports FOR INSERT
WITH CHECK (
  reporter_profile_id IN (SELECT id FROM public.profile_ids_for_request())
);

DROP POLICY IF EXISTS "Reports viewable by admins" ON public.reports;
CREATE POLICY "Reports viewable by admins"
ON public.reports FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.admins a
    WHERE a.profile_id IN (SELECT id FROM public.profile_ids_for_request())
  )
);

DROP POLICY IF EXISTS "Reports updatable by admins" ON public.reports;
CREATE POLICY "Reports updatable by admins"
ON public.reports FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.admins a
    WHERE a.profile_id IN (SELECT id FROM public.profile_ids_for_request())
  )
);

-- Moderation flags policies
DROP POLICY IF EXISTS "Moderation flags updatable by admins" ON public.moderation_flags;
CREATE POLICY "Moderation flags updatable by admins"
ON public.moderation_flags FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.admins a
    WHERE a.profile_id IN (SELECT id FROM public.profile_ids_for_request())
  )
);

DROP POLICY IF EXISTS "Moderation flags viewable by admins" ON public.moderation_flags;
CREATE POLICY "Moderation flags viewable by admins"
ON public.moderation_flags FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.admins a
    WHERE a.profile_id IN (SELECT id FROM public.profile_ids_for_request())
  )
);

-- Admins policies
DROP POLICY IF EXISTS "Admins can view admin assignments" ON public.admins;
CREATE POLICY "Admins can view admin assignments"
ON public.admins FOR SELECT
USING (
  profile_id IN (SELECT id FROM public.profile_ids_for_request())
  OR EXISTS (
    SELECT 1
    FROM public.admins a
    WHERE a.profile_id IN (SELECT id FROM public.profile_ids_for_request())
  )
);

-- Devices policies
DROP POLICY IF EXISTS "Users can view their own device" ON public.devices;
CREATE POLICY "Users can view their own device"
ON public.devices FOR SELECT
USING (
  profile_id IN (SELECT id FROM public.profile_ids_for_request())
);

DROP POLICY IF EXISTS "Users can manage their own device" ON public.devices;
CREATE POLICY "Users can manage their own device"
ON public.devices FOR ALL
USING (
  profile_id IN (SELECT id FROM public.profile_ids_for_request())
)
WITH CHECK (
  profile_id IN (SELECT id FROM public.profile_ids_for_request())
);

-- Additional policies that were dropped (recreate if tables exist)
-- Listens policies (only if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'listens') THEN
    DROP POLICY IF EXISTS "Users can view their own listens" ON public.listens;
    CREATE POLICY "Users can view their own listens"
    ON public.listens FOR SELECT
    USING (
      profile_id IN (SELECT id FROM public.profile_ids_for_request())
    );
  END IF;
END $$;

-- Comments policies (only if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'comments') THEN
    DROP POLICY IF EXISTS "Users can insert their own comments" ON public.comments;
    CREATE POLICY "Users can insert their own comments"
    ON public.comments FOR INSERT
    WITH CHECK (
      profile_id IN (SELECT id FROM public.profile_ids_for_request())
    );

    DROP POLICY IF EXISTS "Users can update their own comments" ON public.comments;
    CREATE POLICY "Users can update their own comments"
    ON public.comments FOR UPDATE
    USING (
      profile_id IN (SELECT id FROM public.profile_ids_for_request())
    )
    WITH CHECK (
      profile_id IN (SELECT id FROM public.profile_ids_for_request())
    );

    DROP POLICY IF EXISTS "Users can delete their own comments" ON public.comments;
    CREATE POLICY "Users can delete their own comments"
    ON public.comments FOR DELETE
    USING (
      profile_id IN (SELECT id FROM public.profile_ids_for_request())
    );

    DROP POLICY IF EXISTS "Clip creators can delete comments on their clips" ON public.comments;
    CREATE POLICY "Clip creators can delete comments on their clips"
    ON public.comments FOR DELETE
    USING (
      EXISTS (
        SELECT 1
        FROM public.clips c
        WHERE c.id = comments.clip_id
          AND c.profile_id IN (SELECT id FROM public.profile_ids_for_request())
      )
    );
  END IF;
END $$;

-- Saved clips policies (only if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'saved_clips') THEN
    DROP POLICY IF EXISTS "Users can view their saved clips" ON public.saved_clips;
    CREATE POLICY "Users can view their saved clips"
    ON public.saved_clips FOR SELECT
    USING (
      profile_id IN (SELECT id FROM public.profile_ids_for_request())
    );

    DROP POLICY IF EXISTS "Users can save clips" ON public.saved_clips;
    CREATE POLICY "Users can save clips"
    ON public.saved_clips FOR INSERT
    WITH CHECK (
      profile_id IN (SELECT id FROM public.profile_ids_for_request())
    );

    DROP POLICY IF EXISTS "Users can unsave clips" ON public.saved_clips;
    CREATE POLICY "Users can unsave clips"
    ON public.saved_clips FOR DELETE
    USING (
      profile_id IN (SELECT id FROM public.profile_ids_for_request())
    );
  END IF;
END $$;

-- Comment reactions policies (only if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'comment_reactions') THEN
    DROP POLICY IF EXISTS "Comment reactions insertable by owner" ON public.comment_reactions;
    CREATE POLICY "Comment reactions insertable by owner"
    ON public.comment_reactions FOR INSERT
    WITH CHECK (
      profile_id IN (SELECT id FROM public.profile_ids_for_request())
    );

    DROP POLICY IF EXISTS "Comment reactions deletable by owner" ON public.comment_reactions;
    CREATE POLICY "Comment reactions deletable by owner"
    ON public.comment_reactions FOR DELETE
    USING (
      profile_id IN (SELECT id FROM public.profile_ids_for_request())
    );
  END IF;
END $$;

-- Comment voice reactions policies (only if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'comment_voice_reactions') THEN
    DROP POLICY IF EXISTS "Comment voice reactions insertable by owner" ON public.comment_voice_reactions;
    CREATE POLICY "Comment voice reactions insertable by owner"
    ON public.comment_voice_reactions FOR INSERT
    WITH CHECK (
      profile_id IN (SELECT id FROM public.profile_ids_for_request())
    );

    DROP POLICY IF EXISTS "Comment voice reactions deletable by owner" ON public.comment_voice_reactions;
    CREATE POLICY "Comment voice reactions deletable by owner"
    ON public.comment_voice_reactions FOR DELETE
    USING (
      profile_id IN (SELECT id FROM public.profile_ids_for_request())
    );
  END IF;
END $$;

-- Additional clip policies (only create if tables exist)
-- Followers can view follower-only clips (if follows table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'follows') THEN
    DROP POLICY IF EXISTS "Followers can view follower-only clips" ON public.clips;
    CREATE POLICY "Followers can view follower-only clips"
    ON public.clips FOR SELECT
    USING (
      EXISTS (
        SELECT 1
        FROM public.follows f
        WHERE f.follower_id IN (SELECT id FROM public.profile_ids_for_request())
          AND f.following_id = clips.profile_id
      )
    );
  END IF;
END $$;

-- Allowed viewers can view private clips (if clip_allowed_viewers table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clip_allowed_viewers') THEN
    DROP POLICY IF EXISTS "Allowed viewers can view private clips" ON public.clips;
    CREATE POLICY "Allowed viewers can view private clips"
    ON public.clips FOR SELECT
    USING (
      EXISTS (
        SELECT 1
        FROM public.clip_allowed_viewers av
        WHERE av.clip_id = clips.id
          AND av.viewer_id IN (SELECT id FROM public.profile_ids_for_request())
      )
    );
  END IF;
END $$;

-- Drop and recreate get_request_profile to support sessions
DROP FUNCTION IF EXISTS public.get_request_profile();

-- Update get_request_profile to support sessions
CREATE OR REPLACE FUNCTION public.get_request_profile()
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_headers JSON;
  request_device_id TEXT;
  request_session_token_hash TEXT;
  requester_profile public.profiles%ROWTYPE;
BEGIN
  request_headers := current_setting('request.headers', true)::json;
  request_session_token_hash := request_headers->>'x-session-token-hash';
  request_device_id := NULLIF(trim(request_headers->>'x-device-id'), '');

  -- Try session-based auth first
  IF request_session_token_hash IS NOT NULL AND length(trim(request_session_token_hash)) > 0 THEN
    BEGIN
      SELECT p.*
      INTO requester_profile
      FROM public.sessions s
      JOIN public.profiles p ON p.id = s.profile_id
      WHERE s.token_hash = request_session_token_hash
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
      LIMIT 1;

      IF FOUND THEN
        RETURN requester_profile;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Fall through to device-based auth
    END;
  END IF;

  -- Fall back to device-based auth
  IF request_device_id IS NULL THEN
    RAISE EXCEPTION 'Missing x-device-id header or x-session-token-hash';
  END IF;

  SELECT p.*
  INTO requester_profile
  FROM public.profiles p
  WHERE p.id IN (SELECT id FROM public.profile_ids_for_request(request_device_id, NULL))
  ORDER BY p.joined_at NULLS LAST, p.created_at
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for supplied device or session';
  END IF;

  RETURN requester_profile;
END;
$$;

-- ============================================================================
-- PART 5: Grant Permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.create_session(UUID, TEXT, TEXT, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.validate_session(TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_session_profile() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.revoke_session(TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.revoke_session_by_id(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.revoke_all_sessions(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_active_sessions(UUID) TO authenticated, anon;

-- ============================================================================
-- PART 6: Cleanup Job for Expired Sessions
-- ============================================================================

-- Function to clean up expired sessions (can be called by cron)
CREATE OR REPLACE FUNCTION public.cleanup_expired_sessions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.sessions
  SET revoked_at = now()
  WHERE expires_at < now()
    AND revoked_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  
  -- Also delete very old revoked sessions (older than 90 days)
  DELETE FROM public.sessions
  WHERE revoked_at IS NOT NULL
    AND revoked_at < now() - interval '90 days';

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_expired_sessions() TO authenticated, anon;

