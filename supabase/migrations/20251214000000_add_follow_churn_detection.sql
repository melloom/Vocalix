-- Follow/Unfollow Churn Detection System
-- Implements audit logging and churn detection to prevent follow/unfollow spam
-- Addresses SECURITY_TODO.md Task #15

-- ============================================================================
-- 1. CREATE AUDIT LOG TABLE
-- ============================================================================

-- Table to track all follow/unfollow actions with timestamps
CREATE TABLE IF NOT EXISTS public.follow_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('follow', 'unfollow')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address INET,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for efficient churn detection queries
CREATE INDEX IF NOT EXISTS idx_follow_audit_log_profile_target 
ON public.follow_audit_log(profile_id, target_profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_follow_audit_log_profile_created 
ON public.follow_audit_log(profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_follow_audit_log_target_created 
ON public.follow_audit_log(target_profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_follow_audit_log_action_created 
ON public.follow_audit_log(action_type, created_at DESC);

-- RLS for audit log (only service role can access)
ALTER TABLE public.follow_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only" ON public.follow_audit_log;
CREATE POLICY "Service role only"
ON public.follow_audit_log
FOR ALL
USING (false)
WITH CHECK (false);

-- ============================================================================
-- 2. TRIGGERS TO LOG FOLLOW/UNFOLLOW ACTIONS
-- ============================================================================

-- Function to log follow actions
CREATE OR REPLACE FUNCTION public.log_follow_action()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_headers JSON;
  request_ip INET;
  forwarded_for TEXT;
  user_agent_text TEXT;
BEGIN
  -- Try to get IP from request headers
  BEGIN
    request_headers := current_setting('request.headers', true)::json;
    
    -- Try x-forwarded-for first
    forwarded_for := request_headers->>'x-forwarded-for';
    IF forwarded_for IS NOT NULL THEN
      forwarded_for := split_part(forwarded_for, ',', 1);
      forwarded_for := trim(forwarded_for);
      request_ip := forwarded_for::INET;
    END IF;
    
    -- Fallback to x-real-ip
    IF request_ip IS NULL THEN
      request_ip := (request_headers->>'x-real-ip')::INET;
    END IF;
    
    -- Fallback to cf-connecting-ip (Cloudflare)
    IF request_ip IS NULL THEN
      request_ip := (request_headers->>'cf-connecting-ip')::INET;
    END IF;
    
    -- Get user agent
    user_agent_text := request_headers->>'user-agent';
  EXCEPTION
    WHEN OTHERS THEN
      request_ip := NULL;
      user_agent_text := NULL;
  END;

  -- Log the follow action
  INSERT INTO public.follow_audit_log (
    profile_id,
    target_profile_id,
    action_type,
    ip_address,
    user_agent,
    metadata
  )
  VALUES (
    NEW.follower_id,
    NEW.following_id,
    'follow',
    request_ip,
    user_agent_text,
    jsonb_build_object('follow_id', NEW.id)
  );

  RETURN NEW;
END;
$$;

-- Function to log unfollow actions
CREATE OR REPLACE FUNCTION public.log_unfollow_action()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_headers JSON;
  request_ip INET;
  forwarded_for TEXT;
  user_agent_text TEXT;
BEGIN
  -- Try to get IP from request headers
  BEGIN
    request_headers := current_setting('request.headers', true)::json;
    
    -- Try x-forwarded-for first
    forwarded_for := request_headers->>'x-forwarded-for';
    IF forwarded_for IS NOT NULL THEN
      forwarded_for := split_part(forwarded_for, ',', 1);
      forwarded_for := trim(forwarded_for);
      request_ip := forwarded_for::INET;
    END IF;
    
    -- Fallback to x-real-ip
    IF request_ip IS NULL THEN
      request_ip := (request_headers->>'x-real-ip')::INET;
    END IF;
    
    -- Fallback to cf-connecting-ip (Cloudflare)
    IF request_ip IS NULL THEN
      request_ip := (request_headers->>'cf-connecting-ip')::INET;
    END IF;
    
    -- Get user agent
    user_agent_text := request_headers->>'user-agent';
  EXCEPTION
    WHEN OTHERS THEN
      request_ip := NULL;
      user_agent_text := NULL;
  END;

  -- Log the unfollow action
  INSERT INTO public.follow_audit_log (
    profile_id,
    target_profile_id,
    action_type,
    ip_address,
    user_agent,
    metadata
  )
  VALUES (
    OLD.follower_id,
    OLD.following_id,
    'unfollow',
    request_ip,
    user_agent_text,
    jsonb_build_object('follow_id', OLD.id)
  );

  RETURN OLD;
END;
$$;

-- Create triggers
DROP TRIGGER IF EXISTS trigger_log_follow_action ON public.follows;
CREATE TRIGGER trigger_log_follow_action
  AFTER INSERT ON public.follows
  FOR EACH ROW
  EXECUTE FUNCTION public.log_follow_action();

DROP TRIGGER IF EXISTS trigger_log_unfollow_action ON public.follows;
CREATE TRIGGER trigger_log_unfollow_action
  AFTER DELETE ON public.follows
  FOR EACH ROW
  EXECUTE FUNCTION public.log_unfollow_action();

-- ============================================================================
-- 3. CHURN DETECTION FUNCTION
-- ============================================================================

-- Function to detect follow/unfollow churn patterns
-- Returns true if user has followed/unfollowed same profile multiple times in short period
CREATE OR REPLACE FUNCTION public.detect_follow_churn(
  p_profile_id UUID,
  p_target_profile_id UUID,
  p_time_window_hours INTEGER DEFAULT 24,
  p_churn_threshold INTEGER DEFAULT 3
)
RETURNS TABLE (
  is_churn BOOLEAN,
  churn_count INTEGER,
  last_action_at TIMESTAMPTZ,
  pattern_details JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_churn_count INTEGER;
  v_last_action TIMESTAMPTZ;
  v_window_start TIMESTAMPTZ;
  v_action_sequence TEXT[];
  v_pattern_details JSONB;
BEGIN
  v_window_start := now() - (p_time_window_hours || ' hours')::interval;
  
  -- Count total follow/unfollow actions for this profile pair in time window
  SELECT 
    COUNT(*),
    MAX(created_at),
    array_agg(action_type ORDER BY created_at)
  INTO 
    v_churn_count,
    v_last_action,
    v_action_sequence
  FROM public.follow_audit_log
  WHERE profile_id = p_profile_id
    AND target_profile_id = p_target_profile_id
    AND created_at > v_window_start;
  
  -- If churn count exceeds threshold, it's suspicious
  IF v_churn_count >= p_churn_threshold THEN
    v_pattern_details := jsonb_build_object(
      'churn_count', v_churn_count,
      'time_window_hours', p_time_window_hours,
      'threshold', p_churn_threshold,
      'action_sequence', v_action_sequence,
      'last_action_at', v_last_action
    );
    
    RETURN QUERY SELECT 
      true,
      v_churn_count,
      v_last_action,
      v_pattern_details;
    RETURN;
  END IF;
  
  -- Not churn
  RETURN QUERY SELECT 
    false,
    COALESCE(v_churn_count, 0),
    v_last_action,
    jsonb_build_object('churn_count', COALESCE(v_churn_count, 0));
END;
$$;

-- Function to get churn statistics for a profile
CREATE OR REPLACE FUNCTION public.get_profile_churn_stats(
  p_profile_id UUID,
  p_time_window_hours INTEGER DEFAULT 24
)
RETURNS TABLE (
  total_churn_actions INTEGER,
  unique_targets INTEGER,
  churn_targets_count INTEGER,
  churn_severity TEXT,
  details JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_total_actions INTEGER;
  v_unique_targets INTEGER;
  v_churn_targets INTEGER;
  v_severity TEXT;
  v_details JSONB;
BEGIN
  v_window_start := now() - (p_time_window_hours || ' hours')::interval;
  
  -- Count total actions and unique targets
  SELECT 
    COUNT(*),
    COUNT(DISTINCT target_profile_id)
  INTO 
    v_total_actions,
    v_unique_targets
  FROM public.follow_audit_log
  WHERE profile_id = p_profile_id
    AND created_at > v_window_start;
  
  -- Count targets with churn (3+ actions)
  SELECT COUNT(DISTINCT target_profile_id)
  INTO v_churn_targets
  FROM public.follow_audit_log
  WHERE profile_id = p_profile_id
    AND created_at > v_window_start
  GROUP BY target_profile_id
  HAVING COUNT(*) >= 3;
  
  -- Determine severity
  IF v_churn_targets >= 10 THEN
    v_severity := 'critical';
  ELSIF v_churn_targets >= 5 THEN
    v_severity := 'high';
  ELSIF v_churn_targets >= 2 THEN
    v_severity := 'medium';
  ELSIF v_churn_targets >= 1 THEN
    v_severity := 'low';
  ELSE
    v_severity := 'none';
  END IF;
  
  v_details := jsonb_build_object(
    'time_window_hours', p_time_window_hours,
    'total_actions', v_total_actions,
    'unique_targets', v_unique_targets,
    'churn_targets', v_churn_targets
  );
  
  RETURN QUERY SELECT 
    v_total_actions,
    v_unique_targets,
    v_churn_targets,
    v_severity,
    v_details;
END;
$$;

-- ============================================================================
-- 4. UPDATE can_follow_profile TO CHECK FOR CHURN
-- ============================================================================

-- Enhanced can_follow_profile function with churn detection
CREATE OR REPLACE FUNCTION public.can_follow_profile(
  follower_id_param UUID,
  following_id_param UUID
)
RETURNS TABLE(
  can_follow BOOLEAN,
  reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  follows_last_hour INTEGER;
  follows_today INTEGER;
  last_follow_at TIMESTAMPTZ;
  max_follows_per_hour INTEGER := 200;
  max_follows_per_day INTEGER := 1000;
  cooldown_seconds INTEGER := 1;
  v_churn_check RECORD;
  v_churn_cooldown_hours INTEGER := 24; -- Cooldown period if churn detected
  v_last_churn_action TIMESTAMPTZ;
BEGIN
  -- Check for follow/unfollow churn (same profile repeatedly)
  SELECT * INTO v_churn_check
  FROM public.detect_follow_churn(
    follower_id_param,
    following_id_param,
    24, -- 24 hour window
    3   -- 3+ actions = churn
  );
  
  -- If churn detected, check if cooldown period has passed
  IF v_churn_check.is_churn THEN
    -- Check if last churn action was within cooldown period
    IF v_churn_check.last_action_at > (now() - (v_churn_cooldown_hours || ' hours')::interval) THEN
      RETURN QUERY SELECT false, 
        format('Follow/unfollow churn detected. Please wait before following this profile again. (Last action: %s)', 
          to_char(v_churn_check.last_action_at, 'YYYY-MM-DD HH24:MI:SS'))::TEXT;
      RETURN;
    END IF;
  END IF;
  
  -- Check hourly limit
  SELECT COUNT(*)
  INTO follows_last_hour
  FROM public.follows
  WHERE follower_id = follower_id_param
    AND created_at >= NOW() - INTERVAL '1 hour';

  IF follows_last_hour >= max_follows_per_hour THEN
    RETURN QUERY SELECT false, format('Maximum %s follows per hour allowed', max_follows_per_hour)::TEXT;
    RETURN;
  END IF;

  -- Check daily limit
  SELECT COUNT(*)
  INTO follows_today
  FROM public.follows
  WHERE follower_id = follower_id_param
    AND created_at >= CURRENT_DATE;

  IF follows_today >= max_follows_per_day THEN
    RETURN QUERY SELECT false, format('Maximum %s follows per day allowed', max_follows_per_day)::TEXT;
    RETURN;
  END IF;

  -- Check cooldown (minimal - just prevents rapid-fire clicking)
  SELECT MAX(created_at)
  INTO last_follow_at
  FROM public.follows
  WHERE follower_id = follower_id_param;

  IF last_follow_at IS NOT NULL AND 
     EXTRACT(EPOCH FROM (NOW() - last_follow_at)) < cooldown_seconds THEN
    RETURN QUERY SELECT false, format('Please wait %s second between follow actions', cooldown_seconds)::TEXT;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, 'OK'::TEXT;
END;
$$;

-- ============================================================================
-- 5. FLAG ACCOUNTS FOR MANUAL REVIEW
-- ============================================================================

-- Table to track accounts flagged for churn review
CREATE TABLE IF NOT EXISTS public.churn_review_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  churn_targets_count INTEGER NOT NULL DEFAULT 0,
  total_churn_actions INTEGER NOT NULL DEFAULT 0,
  flagged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  review_status TEXT DEFAULT 'pending' CHECK (review_status IN ('pending', 'reviewed', 'dismissed', 'actioned')),
  review_notes TEXT,
  stats_snapshot JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_churn_review_flags_profile ON public.churn_review_flags(profile_id, flagged_at DESC);
CREATE INDEX IF NOT EXISTS idx_churn_review_flags_status ON public.churn_review_flags(review_status, severity, flagged_at DESC);

-- RLS for churn review flags (only service role can access)
ALTER TABLE public.churn_review_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only" ON public.churn_review_flags;
CREATE POLICY "Service role only"
ON public.churn_review_flags
FOR ALL
USING (false)
WITH CHECK (false);

-- Function to flag accounts with excessive churn for manual review
CREATE OR REPLACE FUNCTION public.flag_churn_accounts_for_review(
  p_time_window_hours INTEGER DEFAULT 24,
  p_min_churn_targets INTEGER DEFAULT 5
)
RETURNS TABLE (
  flagged_count INTEGER,
  flagged_profile_ids UUID[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile RECORD;
  v_stats RECORD;
  v_flagged_count INTEGER := 0;
  v_flagged_ids UUID[] := ARRAY[]::UUID[];
BEGIN
  -- Find profiles with excessive churn
  FOR v_profile IN
    SELECT DISTINCT fal1.profile_id
    FROM public.follow_audit_log fal1
    WHERE fal1.created_at > (now() - (p_time_window_hours || ' hours')::interval)
      AND EXISTS (
        SELECT 1
        FROM public.follow_audit_log fal2
        WHERE fal2.profile_id = fal1.profile_id
          AND fal2.target_profile_id = fal1.target_profile_id
          AND fal2.created_at > (now() - (p_time_window_hours || ' hours')::interval)
        GROUP BY fal2.target_profile_id
        HAVING COUNT(*) >= 3
      )
    GROUP BY fal1.profile_id
    HAVING COUNT(DISTINCT fal1.target_profile_id) >= p_min_churn_targets
  LOOP
    -- Get churn stats for this profile
    SELECT * INTO v_stats
    FROM public.get_profile_churn_stats(v_profile.profile_id, p_time_window_hours);
    
    -- Check if already flagged (pending review)
    IF NOT EXISTS (
      SELECT 1 FROM public.churn_review_flags
      WHERE profile_id = v_profile.profile_id
        AND review_status = 'pending'
    ) THEN
      -- Flag for review
      INSERT INTO public.churn_review_flags (
        profile_id,
        severity,
        churn_targets_count,
        total_churn_actions,
        stats_snapshot
      )
      VALUES (
        v_profile.profile_id,
        v_stats.churn_severity,
        v_stats.churn_targets_count,
        v_stats.total_churn_actions,
        v_stats.details
      );
      
      v_flagged_count := v_flagged_count + 1;
      v_flagged_ids := array_append(v_flagged_ids, v_profile.profile_id);
    END IF;
  END LOOP;
  
  RETURN QUERY SELECT v_flagged_count, v_flagged_ids;
END;
$$;

-- ============================================================================
-- 6. GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.detect_follow_churn(UUID, UUID, INTEGER, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_profile_churn_stats(UUID, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.flag_churn_accounts_for_review(INTEGER, INTEGER) TO authenticated, anon;

-- ============================================================================
-- 7. COMMENTS
-- ============================================================================

COMMENT ON TABLE public.follow_audit_log IS 'Audit log for all follow/unfollow actions to detect churn patterns';
COMMENT ON FUNCTION public.detect_follow_churn IS 'Detects if a user has followed/unfollowed the same profile multiple times (churn)';
COMMENT ON FUNCTION public.get_profile_churn_stats IS 'Gets churn statistics for a profile to assess abuse patterns';
COMMENT ON FUNCTION public.flag_churn_accounts_for_review IS 'Flags accounts with excessive churn patterns for manual admin review';
COMMENT ON TABLE public.churn_review_flags IS 'Tracks accounts flagged for churn review by admins';

