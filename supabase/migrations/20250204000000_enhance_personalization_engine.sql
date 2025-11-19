-- Migration: Enhance Personalization Engine
-- Adds comprehensive personalization features including:
-- - Skip tracking (learn what users don't like)
-- - Listening patterns (when users listen)
-- - User preferences (duration, voice characteristics, content types)
-- - Time-aware and context-aware feed adjustments
-- - Personalization controls

-- ============================================
-- 1. SKIP TRACKING TABLE
-- ============================================
-- Track when users skip clips to learn what they don't like
CREATE TABLE IF NOT EXISTS public.clip_skips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE NOT NULL,
  skipped_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  skip_reason TEXT, -- 'too_long', 'not_interested', 'already_heard', 'poor_quality', etc.
  listen_duration_seconds DECIMAL(5, 2), -- How long they listened before skipping
  device_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(profile_id, clip_id)
);

ALTER TABLE public.clip_skips ENABLE ROW LEVEL SECURITY;

-- Users can view their own skips
CREATE POLICY "Clip skips readable by owner"
ON public.clip_skips FOR SELECT
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Users can insert their own skips
CREATE POLICY "Clip skips insertable by owner"
ON public.clip_skips FOR INSERT
WITH CHECK (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Indexes for skip tracking
CREATE INDEX IF NOT EXISTS idx_clip_skips_profile_id ON public.clip_skips(profile_id);
CREATE INDEX IF NOT EXISTS idx_clip_skips_clip_id ON public.clip_skips(clip_id);
CREATE INDEX IF NOT EXISTS idx_clip_skips_skipped_at ON public.clip_skips(skipped_at DESC);
CREATE INDEX IF NOT EXISTS idx_clip_skips_profile_skip_reason ON public.clip_skips(profile_id, skip_reason);

-- ============================================
-- 2. LISTENING PATTERNS TABLE
-- ============================================
-- Track when users listen to learn their patterns
CREATE TABLE IF NOT EXISTS public.listening_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  listen_date DATE NOT NULL,
  listen_hour INTEGER NOT NULL CHECK (listen_hour >= 0 AND listen_hour < 24),
  listen_count INTEGER DEFAULT 1 NOT NULL,
  total_duration_seconds DECIMAL(10, 2) DEFAULT 0 NOT NULL,
  device_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(profile_id, listen_date, listen_hour, device_type)
);

ALTER TABLE public.listening_patterns ENABLE ROW LEVEL SECURITY;

-- Users can view their own listening patterns
CREATE POLICY "Listening patterns readable by owner"
ON public.listening_patterns FOR SELECT
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Users can insert/update their own listening patterns
CREATE POLICY "Listening patterns insertable by owner"
ON public.listening_patterns FOR INSERT
WITH CHECK (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

CREATE POLICY "Listening patterns updatable by owner"
ON public.listening_patterns FOR UPDATE
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Indexes for listening patterns
CREATE INDEX IF NOT EXISTS idx_listening_patterns_profile_date ON public.listening_patterns(profile_id, listen_date DESC);
CREATE INDEX IF NOT EXISTS idx_listening_patterns_profile_hour ON public.listening_patterns(profile_id, listen_hour);

-- ============================================
-- 3. USER PREFERENCES TABLE
-- ============================================
-- Store user preferences for personalization
CREATE TABLE IF NOT EXISTS public.user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
  
  -- Content preferences
  preferred_duration_min INTEGER DEFAULT 15, -- Preferred minimum duration in seconds
  preferred_duration_max INTEGER DEFAULT 30, -- Preferred maximum duration in seconds
  preferred_topics UUID[], -- Array of preferred topic IDs
  preferred_creators UUID[], -- Array of preferred creator IDs
  
  -- Voice preferences (stored as JSONB for flexibility)
  voice_preferences JSONB DEFAULT '{
    "preferred_pitch": null,
    "preferred_speed": null,
    "preferred_accent": null,
    "preferred_gender": null
  }'::jsonb,
  
  -- Time-based preferences (when to show what)
  time_preferences JSONB DEFAULT '{
    "morning": {"topics": [], "duration": null},
    "afternoon": {"topics": [], "duration": null},
    "evening": {"topics": [], "duration": null},
    "night": {"topics": [], "duration": null}
  }'::jsonb,
  
  -- Feed customization
  feed_algorithm_preferences JSONB DEFAULT '{
    "trending_weight": 0.4,
    "topic_follow_weight": 0.3,
    "creator_follow_weight": 0.2,
    "completion_weight": 0.2,
    "time_aware": true,
    "context_aware": true,
    "skip_penalty": 0.3
  }'::jsonb,
  
  -- Privacy controls
  privacy_preferences JSONB DEFAULT '{
    "use_listening_patterns": true,
    "use_location": false,
    "use_device_type": true,
    "use_skip_data": true
  }'::jsonb,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- Users can view their own preferences
CREATE POLICY "User preferences readable by owner"
ON public.user_preferences FOR SELECT
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Users can insert their own preferences
CREATE POLICY "User preferences insertable by owner"
ON public.user_preferences FOR INSERT
WITH CHECK (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Users can update their own preferences
CREATE POLICY "User preferences updatable by owner"
ON public.user_preferences FOR UPDATE
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Index for preferences
CREATE INDEX IF NOT EXISTS idx_user_preferences_profile_id ON public.user_preferences(profile_id);

-- ============================================
-- 4. ENHANCED PERSONALIZATION FUNCTIONS
-- ============================================

-- Function to get user's preferred listening hours
CREATE OR REPLACE FUNCTION public.get_user_listening_hours(
  p_profile_id UUID,
  p_days_back INTEGER DEFAULT 30
)
RETURNS TABLE (
  hour INTEGER,
  listen_count INTEGER,
  avg_duration_seconds DECIMAL(10, 2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    lp.listen_hour,
    SUM(lp.listen_count)::INTEGER as listen_count,
    AVG(lp.total_duration_seconds / NULLIF(lp.listen_count, 0)) as avg_duration_seconds
  FROM public.listening_patterns lp
  WHERE lp.profile_id = p_profile_id
    AND lp.listen_date >= CURRENT_DATE - (p_days_back || ' days')::INTERVAL
  GROUP BY lp.listen_hour
  ORDER BY listen_count DESC;
END;
$$;

-- Function to check if user typically skips clips from a creator/topic
CREATE OR REPLACE FUNCTION public.get_user_skip_rate(
  p_profile_id UUID,
  p_creator_id UUID DEFAULT NULL,
  p_topic_id UUID DEFAULT NULL,
  p_days_back INTEGER DEFAULT 30
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_skip_count INTEGER := 0;
  v_total_clips INTEGER := 0;
  v_skip_rate NUMERIC := 0;
BEGIN
  -- Count skips
  SELECT COUNT(*)
  INTO v_skip_count
  FROM public.clip_skips cs
  INNER JOIN public.clips c ON c.id = cs.clip_id
  WHERE cs.profile_id = p_profile_id
    AND cs.skipped_at >= NOW() - (p_days_back || ' days')::INTERVAL
    AND (p_creator_id IS NULL OR c.profile_id = p_creator_id)
    AND (p_topic_id IS NULL OR c.topic_id = p_topic_id);
  
  -- Count total clips seen (listens + skips)
  SELECT COUNT(DISTINCT l.clip_id) + COUNT(DISTINCT cs.clip_id)
  INTO v_total_clips
  FROM public.listens l
  FULL OUTER JOIN public.clip_skips cs ON cs.profile_id = l.profile_id AND cs.clip_id = l.clip_id
  INNER JOIN public.clips c ON c.id = COALESCE(l.clip_id, cs.clip_id)
  WHERE COALESCE(l.profile_id, cs.profile_id) = p_profile_id
    AND COALESCE(l.listened_at, cs.skipped_at) >= NOW() - (p_days_back || ' days')::INTERVAL
    AND (p_creator_id IS NULL OR c.profile_id = p_creator_id)
    AND (p_topic_id IS NULL OR c.topic_id = p_topic_id);
  
  -- Calculate skip rate
  IF v_total_clips > 0 THEN
    v_skip_rate := (v_skip_count::NUMERIC / v_total_clips::NUMERIC) * 100;
  END IF;
  
  RETURN v_skip_rate;
END;
$$;

-- Enhanced personalized relevance calculation with all new factors
CREATE OR REPLACE FUNCTION public.calculate_enhanced_personalized_relevance(
  p_clip_id UUID,
  p_profile_id UUID,
  p_current_hour INTEGER DEFAULT NULL,
  p_device_type TEXT DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_relevance_score NUMERIC := 0;
  v_trending_score NUMERIC := 0;
  v_topic_follow_bonus NUMERIC := 0;
  v_creator_follow_bonus NUMERIC := 0;
  v_completion_bonus NUMERIC := 0;
  v_similar_creator_bonus NUMERIC := 0;
  v_duration_bonus NUMERIC := 0;
  v_time_bonus NUMERIC := 0;
  v_skip_penalty NUMERIC := 0;
  v_clip_record RECORD;
  v_user_prefs RECORD;
  v_skip_rate NUMERIC := 0;
  v_clip_duration INTEGER := 0;
  v_current_hour INTEGER;
  v_clip_was_skipped BOOLEAN := false;
  v_avg_completion_rate NUMERIC := 0;
  v_user_completion_rate NUMERIC := 0;
BEGIN
  -- Get current hour if not provided
  v_current_hour := COALESCE(p_current_hour, EXTRACT(HOUR FROM NOW())::INTEGER);
  
  -- Get clip data
  SELECT 
    c.id,
    c.profile_id,
    c.topic_id,
    c.duration_seconds,
    COALESCE(c.trending_score, 0) as trending_score,
    COALESCE(
      (SELECT AVG(l.completion_percentage) 
       FROM public.listens l 
       WHERE l.clip_id = c.id 
       AND l.completion_percentage IS NOT NULL),
      0
    ) as completion_rate,
    c.created_at
  INTO v_clip_record
  FROM public.clips c
  WHERE c.id = p_clip_id AND c.status = 'live';
  
  -- If clip doesn't exist or isn't live, return 0
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  v_clip_duration := v_clip_record.duration_seconds;
  
  -- Get user preferences
  SELECT * INTO v_user_prefs
  FROM public.user_preferences
  WHERE profile_id = p_profile_id;
  
  -- Base score: trending score (normalized to 0-1 range, then scaled)
  v_trending_score := COALESCE(v_clip_record.trending_score, 0) / 1000.0;
  
  -- Use custom weights from preferences if available, otherwise defaults
  DECLARE
    v_trending_weight NUMERIC := 0.4;
    v_topic_weight NUMERIC := 0.3;
    v_creator_weight NUMERIC := 0.2;
    v_completion_weight NUMERIC := 0.2;
    v_skip_penalty_weight NUMERIC := 0.3;
  BEGIN
    IF v_user_prefs IS NOT NULL AND v_user_prefs.feed_algorithm_preferences IS NOT NULL THEN
      v_trending_weight := COALESCE((v_user_prefs.feed_algorithm_preferences->>'trending_weight')::NUMERIC, 0.4);
      v_topic_weight := COALESCE((v_user_prefs.feed_algorithm_preferences->>'topic_follow_weight')::NUMERIC, 0.3);
      v_creator_weight := COALESCE((v_user_prefs.feed_algorithm_preferences->>'creator_follow_weight')::NUMERIC, 0.2);
      v_completion_weight := COALESCE((v_user_prefs.feed_algorithm_preferences->>'completion_weight')::NUMERIC, 0.2);
      v_skip_penalty_weight := COALESCE((v_user_prefs.feed_algorithm_preferences->>'skip_penalty')::NUMERIC, 0.3);
    END IF;
    
    v_relevance_score := v_trending_score * v_trending_weight;
  END;
  
  -- If no profile_id provided, return base trending score
  IF p_profile_id IS NULL THEN
    RETURN v_relevance_score;
  END IF;
  
  -- Check privacy preferences
  DECLARE
    v_use_skip_data BOOLEAN := true;
    v_use_listening_patterns BOOLEAN := true;
    v_use_device_type BOOLEAN := true;
  BEGIN
    IF v_user_prefs IS NOT NULL AND v_user_prefs.privacy_preferences IS NOT NULL THEN
      v_use_skip_data := COALESCE((v_user_prefs.privacy_preferences->>'use_skip_data')::BOOLEAN, true);
      v_use_listening_patterns := COALESCE((v_user_prefs.privacy_preferences->>'use_listening_patterns')::BOOLEAN, true);
      v_use_device_type := COALESCE((v_user_prefs.privacy_preferences->>'use_device_type')::BOOLEAN, true);
    END IF;
    
    -- 1. TOPIC FOLLOW BONUS
    IF v_clip_record.topic_id IS NOT NULL THEN
      SELECT EXISTS(
        SELECT 1 
        FROM public.topic_subscriptions ts
        WHERE ts.profile_id = p_profile_id 
        AND ts.topic_id = v_clip_record.topic_id
      ) INTO v_topic_follow_bonus;
      
      IF v_topic_follow_bonus THEN
        v_topic_follow_bonus := v_topic_weight;
      ELSE
        v_topic_follow_bonus := 0;
      END IF;
    END IF;
    
    -- 2. CREATOR FOLLOW BONUS
    IF v_clip_record.profile_id IS NOT NULL THEN
      SELECT EXISTS(
        SELECT 1 
        FROM public.follows f
        WHERE f.follower_id = p_profile_id 
        AND f.following_id = v_clip_record.profile_id
      ) INTO v_creator_follow_bonus;
      
      IF v_creator_follow_bonus THEN
        v_creator_follow_bonus := v_creator_weight;
      ELSE
        v_creator_follow_bonus := 0;
      END IF;
    END IF;
    
    -- 3. COMPLETION RATE BONUS
    SELECT 
      COALESCE(AVG(completion_percentage), 0)
    INTO v_user_completion_rate
    FROM public.listens l
    WHERE l.clip_id = p_clip_id 
    AND l.profile_id = p_profile_id
    AND l.completion_percentage IS NOT NULL;
    
    IF v_user_completion_rate > 70 THEN
      v_completion_bonus := v_completion_weight * (v_user_completion_rate / 100.0);
    END IF;
    
    -- Similar creator bonus
    IF v_clip_record.profile_id IS NOT NULL THEN
      SELECT 
        COALESCE(AVG(l.completion_percentage), 0)
      INTO v_avg_completion_rate
      FROM public.listens l
      INNER JOIN public.clips c ON c.id = l.clip_id
      WHERE c.profile_id = v_clip_record.profile_id
      AND l.profile_id = p_profile_id
      AND l.completion_percentage IS NOT NULL
      AND l.listened_at > NOW() - INTERVAL '30 days';
      
      IF v_avg_completion_rate > 70 THEN
        v_similar_creator_bonus := 0.1 * (v_avg_completion_rate / 100.0);
      END IF;
    END IF;
    
    -- 4. DURATION PREFERENCE BONUS
    IF v_user_prefs IS NOT NULL THEN
      IF v_clip_duration >= v_user_prefs.preferred_duration_min 
         AND v_clip_duration <= v_user_prefs.preferred_duration_max THEN
        v_duration_bonus := 0.15; -- 15% boost for preferred duration
      ELSIF v_clip_duration < v_user_prefs.preferred_duration_min THEN
        v_duration_bonus := 0.05; -- Small boost for shorter clips
      ELSIF v_clip_duration > v_user_prefs.preferred_duration_max THEN
        v_duration_bonus := -0.1; -- Penalty for longer clips
      END IF;
    END IF;
    
    -- 5. TIME-AWARE BONUS (if enabled)
    IF v_use_listening_patterns AND v_user_prefs IS NOT NULL 
       AND COALESCE((v_user_prefs.feed_algorithm_preferences->>'time_aware')::BOOLEAN, true) THEN
      -- Check if this is a preferred listening hour
      SELECT COUNT(*) > 0 INTO v_time_bonus
      FROM public.listening_patterns lp
      WHERE lp.profile_id = p_profile_id
        AND lp.listen_hour = v_current_hour
        AND lp.listen_date >= CURRENT_DATE - INTERVAL '30 days';
      
      IF v_time_bonus THEN
        v_time_bonus := 0.1; -- 10% boost for preferred listening time
      END IF;
      
      -- Check time-based topic preferences
      DECLARE
        v_time_period TEXT;
        v_time_topics JSONB;
      BEGIN
        IF v_current_hour >= 5 AND v_current_hour < 12 THEN
          v_time_period := 'morning';
        ELSIF v_current_hour >= 12 AND v_current_hour < 17 THEN
          v_time_period := 'afternoon';
        ELSIF v_current_hour >= 17 AND v_current_hour < 22 THEN
          v_time_period := 'evening';
        ELSE
          v_time_period := 'night';
        END IF;
        
        v_time_topics := v_user_prefs.time_preferences->v_time_period->'topics';
        IF v_time_topics IS NOT NULL AND jsonb_array_length(v_time_topics) > 0 THEN
          IF v_clip_record.topic_id IS NOT NULL AND 
             v_time_topics ? v_clip_record.topic_id::TEXT THEN
            v_time_bonus := v_time_bonus + 0.15; -- Additional 15% for time-based topic preference
          END IF;
        END IF;
      END;
    END IF;
    
    -- 6. SKIP PENALTY (if enabled)
    IF v_use_skip_data AND COALESCE((v_user_prefs.feed_algorithm_preferences->>'skip_penalty')::NUMERIC, 0.3) > 0 THEN
      -- Check skip rate for this creator
      IF v_clip_record.profile_id IS NOT NULL THEN
        v_skip_rate := public.get_user_skip_rate(p_profile_id, v_clip_record.profile_id, NULL, 30);
        IF v_skip_rate > 50 THEN -- If user skips >50% of clips from this creator
          v_skip_penalty := -v_skip_penalty_weight * (v_skip_rate / 100.0);
        END IF;
      END IF;
      
      -- Check skip rate for this topic
      IF v_clip_record.topic_id IS NOT NULL THEN
        v_skip_rate := public.get_user_skip_rate(p_profile_id, NULL, v_clip_record.topic_id, 30);
        IF v_skip_rate > 50 THEN -- If user skips >50% of clips from this topic
          v_skip_penalty := v_skip_penalty - (v_skip_penalty_weight * 0.5) * (v_skip_rate / 100.0);
        END IF;
      END IF;
      
      -- Check if this specific clip was skipped
      SELECT EXISTS(
        SELECT 1 FROM public.clip_skips cs
        WHERE cs.profile_id = p_profile_id AND cs.clip_id = p_clip_id
      ) INTO v_clip_was_skipped;
      
      IF v_clip_was_skipped THEN
        v_skip_penalty := v_skip_penalty - 0.5; -- Strong penalty for previously skipped clip
      END IF;
    END IF;
  END;
  
  -- Calculate final relevance score
  v_relevance_score := v_relevance_score + v_topic_follow_bonus + v_creator_follow_bonus + 
                       v_completion_bonus + v_similar_creator_bonus + v_duration_bonus + 
                       v_time_bonus + v_skip_penalty;
  
  -- Ensure score is not negative
  IF v_relevance_score < 0 THEN
    v_relevance_score := 0;
  END IF;
  
  RETURN v_relevance_score;
END;
$$;

-- Enhanced "For You" feed function with all personalization features
CREATE OR REPLACE FUNCTION public.get_enhanced_for_you_feed(
  p_profile_id UUID,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0,
  p_current_hour INTEGER DEFAULT NULL,
  p_device_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  clip_id UUID,
  relevance_score NUMERIC,
  clip_data JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_hour INTEGER;
BEGIN
  -- Get current hour if not provided
  v_current_hour := COALESCE(p_current_hour, EXTRACT(HOUR FROM NOW())::INTEGER);
  
  RETURN QUERY
  WITH scored_clips AS (
    SELECT 
      c.id,
      public.calculate_enhanced_personalized_relevance(
        c.id, 
        p_profile_id, 
        v_current_hour, 
        p_device_type
      ) as relevance,
      COALESCE(
        (SELECT AVG(l.completion_percentage) 
         FROM public.listens l 
         WHERE l.clip_id = c.id 
         AND l.completion_percentage IS NOT NULL),
        0
      ) as calculated_completion_rate,
      jsonb_build_object(
        'id', c.id,
        'profile_id', c.profile_id,
        'audio_path', c.audio_path,
        'duration_seconds', c.duration_seconds,
        'title', c.title,
        'captions', c.captions,
        'summary', c.summary,
        'tags', c.tags,
        'mood_emoji', c.mood_emoji,
        'status', c.status,
        'listens_count', c.listens_count,
        'reactions', c.reactions,
        'created_at', c.created_at,
        'topic_id', c.topic_id,
        'completion_rate', COALESCE(
          (SELECT AVG(l.completion_percentage) 
           FROM public.listens l 
           WHERE l.clip_id = c.id 
           AND l.completion_percentage IS NOT NULL),
          0
        ),
        'trending_score', c.trending_score,
        'city', c.city,
        'parent_clip_id', c.parent_clip_id,
        'reply_count', c.reply_count,
        'remix_of_clip_id', c.remix_of_clip_id,
        'remix_count', c.remix_count,
        'chain_id', c.chain_id,
        'challenge_id', c.challenge_id,
        'is_podcast', c.is_podcast
      ) as clip_data
    FROM public.clips c
    WHERE c.status = 'live'
    -- Pre-filter: only calculate relevance for clips that might be relevant
    AND (c.created_at > NOW() - INTERVAL '30 days' OR c.trending_score > 100)
    ORDER BY c.trending_score DESC NULLS LAST, c.created_at DESC
    LIMIT (p_limit + p_offset) * 3 -- Get more candidates to score, then filter
  )
  SELECT 
    sc.id as clip_id,
    sc.relevance as relevance_score,
    sc.clip_data
  FROM scored_clips sc
  WHERE sc.relevance > 0 -- Only return clips with some relevance
  ORDER BY sc.relevance DESC, (sc.clip_data->>'created_at')::TIMESTAMPTZ DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Function to update listening pattern when user listens
CREATE OR REPLACE FUNCTION public.update_listening_pattern(
  p_profile_id UUID,
  p_duration_seconds DECIMAL(10, 2),
  p_device_type TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_hour INTEGER;
  v_current_date DATE;
BEGIN
  v_current_hour := EXTRACT(HOUR FROM NOW())::INTEGER;
  v_current_date := CURRENT_DATE;
  
  INSERT INTO public.listening_patterns (
    profile_id,
    listen_date,
    listen_hour,
    listen_count,
    total_duration_seconds,
    device_type
  )
  VALUES (
    p_profile_id,
    v_current_date,
    v_current_hour,
    1,
    p_duration_seconds,
    p_device_type
  )
  ON CONFLICT (profile_id, listen_date, listen_hour, device_type)
  DO UPDATE SET
    listen_count = listening_patterns.listen_count + 1,
    total_duration_seconds = listening_patterns.total_duration_seconds + p_duration_seconds,
    updated_at = NOW();
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_user_listening_hours(UUID, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_user_skip_rate(UUID, UUID, UUID, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.calculate_enhanced_personalized_relevance(UUID, UUID, INTEGER, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_enhanced_for_you_feed(UUID, INTEGER, INTEGER, INTEGER, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.update_listening_pattern(UUID, DECIMAL, TEXT) TO authenticated, anon;

-- Comments for documentation
COMMENT ON TABLE public.clip_skips IS 'Tracks when users skip clips to learn preferences and improve recommendations';
COMMENT ON TABLE public.listening_patterns IS 'Tracks when users listen to learn their listening patterns for time-aware recommendations';
COMMENT ON TABLE public.user_preferences IS 'Stores user preferences for personalization including duration, voice, time-based, and feed algorithm preferences';
COMMENT ON FUNCTION public.calculate_enhanced_personalized_relevance IS 'Enhanced personalized relevance calculation that considers skips, duration preferences, time-aware patterns, and user preferences';
COMMENT ON FUNCTION public.get_enhanced_for_you_feed IS 'Enhanced personalized feed that uses all personalization features including time-aware, context-aware, and skip-based learning';

