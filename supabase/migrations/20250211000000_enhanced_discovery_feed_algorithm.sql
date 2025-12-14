-- Enhanced Discovery & Feed Algorithm
-- Implements PRIORITY 1: Enhanced Discovery & Feed Algorithm
-- Features:
-- 1. Multi-Signal Ranking Algorithm (engagement velocity, diversity, topic activity, creator reputation)
-- 2. Feed Filters (Best, Rising, Controversial, Top by Topic, From Your City, From Followed Creators, Unheard)
-- 3. Mute Topics/Creators functionality
-- 4. Enhanced personalization with diversity signals

-- ============================================
-- 1. ENGAGEMENT VELOCITY TRACKING
-- ============================================
-- Track engagement velocity (reactions per hour) for clips
CREATE TABLE IF NOT EXISTS public.clip_engagement_velocity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE NOT NULL,
  hour_since_creation INTEGER NOT NULL, -- Hours since clip was created (0, 1, 2, ...)
  reactions_count INTEGER DEFAULT 0,
  listens_count INTEGER DEFAULT 0,
  replies_count INTEGER DEFAULT 0,
  remixes_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(clip_id, hour_since_creation)
);

CREATE INDEX IF NOT EXISTS idx_clip_engagement_velocity_clip_id ON public.clip_engagement_velocity(clip_id, hour_since_creation);
CREATE INDEX IF NOT EXISTS idx_clip_engagement_velocity_updated_at ON public.clip_engagement_velocity(updated_at DESC);

ALTER TABLE public.clip_engagement_velocity ENABLE ROW LEVEL SECURITY;

-- Allow service role and authenticated users to read engagement velocity
DROP POLICY IF EXISTS "Engagement velocity readable by all" ON public.clip_engagement_velocity;
CREATE POLICY "Engagement velocity readable by all"
ON public.clip_engagement_velocity FOR SELECT
USING (true);

-- Function to calculate engagement velocity for a clip
CREATE OR REPLACE FUNCTION public.calculate_engagement_velocity(
  p_clip_id UUID,
  p_hours_back INTEGER DEFAULT 24
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_velocity NUMERIC := 0;
  v_reactions_per_hour NUMERIC := 0;
  v_listens_per_hour NUMERIC := 0;
  v_replies_per_hour NUMERIC := 0;
  v_remixes_per_hour NUMERIC := 0;
  v_clip_created_at TIMESTAMPTZ;
  v_hours_old NUMERIC;
BEGIN
  -- Get clip creation time
  SELECT created_at INTO v_clip_created_at
  FROM public.clips
  WHERE id = p_clip_id;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  v_hours_old := EXTRACT(EPOCH FROM (NOW() - v_clip_created_at)) / 3600.0;
  
  -- If clip is too old, return 0
  IF v_hours_old > p_hours_back THEN
    RETURN 0;
  END IF;
  
  -- Calculate reactions per hour (weighted by recency)
  SELECT COALESCE(SUM(reactions_count), 0) / GREATEST(v_hours_old, 1)
  INTO v_reactions_per_hour
  FROM public.clip_engagement_velocity
  WHERE clip_id = p_clip_id
    AND hour_since_creation <= LEAST(p_hours_back, v_hours_old);
  
  -- Calculate listens per hour
  SELECT COALESCE(SUM(listens_count), 0) / GREATEST(v_hours_old, 1)
  INTO v_listens_per_hour
  FROM public.clip_engagement_velocity
  WHERE clip_id = p_clip_id
    AND hour_since_creation <= LEAST(p_hours_back, v_hours_old);
  
  -- Calculate replies per hour
  SELECT COALESCE(SUM(replies_count), 0) / GREATEST(v_hours_old, 1)
  INTO v_replies_per_hour
  FROM public.clip_engagement_velocity
  WHERE clip_id = p_clip_id
    AND hour_since_creation <= LEAST(p_hours_back, v_hours_old);
  
  -- Calculate remixes per hour
  SELECT COALESCE(SUM(remixes_count), 0) / GREATEST(v_hours_old, 1)
  INTO v_remixes_per_hour
  FROM public.clip_engagement_velocity
  WHERE clip_id = p_clip_id
    AND hour_since_creation <= LEAST(p_hours_back, v_hours_old);
  
  -- Weighted velocity score (reactions are most important, then replies, then remixes, then listens)
  v_velocity := (v_reactions_per_hour * 3.0) + 
                (v_replies_per_hour * 2.0) + 
                (v_remixes_per_hour * 2.0) + 
                (v_listens_per_hour * 0.5);
  
  RETURN v_velocity;
END;
$$;

-- Function to update engagement velocity (should be called periodically)
CREATE OR REPLACE FUNCTION public.update_clip_engagement_velocity(
  p_clip_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clip_created_at TIMESTAMPTZ;
  v_current_hour INTEGER;
  v_reactions_count INTEGER;
  v_listens_count INTEGER;
  v_replies_count INTEGER;
  v_remixes_count INTEGER;
BEGIN
  -- Get clip creation time
  SELECT created_at INTO v_clip_created_at
  FROM public.clips
  WHERE id = p_clip_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Calculate current hour since creation
  v_current_hour := FLOOR(EXTRACT(EPOCH FROM (NOW() - v_clip_created_at)) / 3600.0)::INTEGER;
  
  -- Get current engagement counts
  SELECT 
    COALESCE((SELECT SUM(value::INTEGER) FROM jsonb_each_text(reactions)), 0)::INTEGER,
    COALESCE(listens_count, 0),
    COALESCE(reply_count, 0),
    COALESCE(remix_count, 0)
  INTO v_reactions_count, v_listens_count, v_replies_count, v_remixes_count
  FROM public.clips
  WHERE id = p_clip_id;
  
  -- Upsert engagement velocity for current hour
  INSERT INTO public.clip_engagement_velocity (
    clip_id,
    hour_since_creation,
    reactions_count,
    listens_count,
    replies_count,
    remixes_count
  )
  VALUES (
    p_clip_id,
    v_current_hour,
    v_reactions_count,
    v_listens_count,
    v_replies_count,
    v_remixes_count
  )
  ON CONFLICT (clip_id, hour_since_creation)
  DO UPDATE SET
    reactions_count = EXCLUDED.reactions_count,
    listens_count = EXCLUDED.listens_count,
    replies_count = EXCLUDED.replies_count,
    remixes_count = EXCLUDED.remixes_count,
    updated_at = NOW();
END;
$$;

-- ============================================
-- 2. MUTE TOPICS/CREATORS
-- ============================================
-- Table to track muted topics
CREATE TABLE IF NOT EXISTS public.muted_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  topic_id UUID REFERENCES public.topics(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(profile_id, topic_id)
);

CREATE INDEX IF NOT EXISTS idx_muted_topics_profile_id ON public.muted_topics(profile_id);
CREATE INDEX IF NOT EXISTS idx_muted_topics_topic_id ON public.muted_topics(topic_id);

ALTER TABLE public.muted_topics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Muted topics readable by owner" ON public.muted_topics;
CREATE POLICY "Muted topics readable by owner"
ON public.muted_topics FOR SELECT
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

DROP POLICY IF EXISTS "Muted topics insertable by owner" ON public.muted_topics;
CREATE POLICY "Muted topics insertable by owner"
ON public.muted_topics FOR INSERT
WITH CHECK (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

DROP POLICY IF EXISTS "Muted topics deletable by owner" ON public.muted_topics;
CREATE POLICY "Muted topics deletable by owner"
ON public.muted_topics FOR DELETE
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Table to track muted creators (separate from blocks - mute is just for feed filtering)
CREATE TABLE IF NOT EXISTS public.muted_creators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  creator_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(profile_id, creator_id),
  CHECK (profile_id != creator_id)
);

CREATE INDEX IF NOT EXISTS idx_muted_creators_profile_id ON public.muted_creators(profile_id);
CREATE INDEX IF NOT EXISTS idx_muted_creators_creator_id ON public.muted_creators(creator_id);

ALTER TABLE public.muted_creators ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Muted creators readable by owner" ON public.muted_creators;
CREATE POLICY "Muted creators readable by owner"
ON public.muted_creators FOR SELECT
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

DROP POLICY IF EXISTS "Muted creators insertable by owner" ON public.muted_creators;
CREATE POLICY "Muted creators insertable by owner"
ON public.muted_creators FOR INSERT
WITH CHECK (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

DROP POLICY IF EXISTS "Muted creators deletable by owner" ON public.muted_creators;
CREATE POLICY "Muted creators deletable by owner"
ON public.muted_creators FOR DELETE
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- ============================================
-- 3. ENHANCED RELEVANCE CALCULATION
-- ============================================
-- Enhanced function that includes engagement velocity, diversity, topic activity, creator reputation
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
  v_engagement_velocity_bonus NUMERIC := 0;
  v_creator_reputation_bonus NUMERIC := 0;
  v_topic_activity_bonus NUMERIC := 0;
  v_diversity_bonus NUMERIC := 0;
  v_clip_record RECORD;
  v_user_prefs RECORD;
  v_skip_rate NUMERIC := 0;
  v_clip_duration INTEGER := 0;
  v_current_hour INTEGER;
  v_clip_was_skipped BOOLEAN := false;
  v_avg_completion_rate NUMERIC := 0;
  v_user_completion_rate NUMERIC := 0;
  v_creator_reputation INTEGER := 0;
  v_topic_clips_count INTEGER := 0;
  v_recent_topic_clips INTEGER := 0;
  v_user_recent_topics UUID[];
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
    v_trending_weight NUMERIC := 0.3;
    v_topic_weight NUMERIC := 0.25;
    v_creator_weight NUMERIC := 0.15;
    v_completion_weight NUMERIC := 0.15;
    v_skip_penalty_weight NUMERIC := 0.3;
    v_velocity_weight NUMERIC := 0.1;
    v_reputation_weight NUMERIC := 0.05;
    v_topic_activity_weight NUMERIC := 0.05;
    v_diversity_weight NUMERIC := 0.05;
  BEGIN
    IF v_user_prefs IS NOT NULL AND v_user_prefs.feed_algorithm_preferences IS NOT NULL THEN
      v_trending_weight := COALESCE((v_user_prefs.feed_algorithm_preferences->>'trending_weight')::NUMERIC, 0.3);
      v_topic_weight := COALESCE((v_user_prefs.feed_algorithm_preferences->>'topic_follow_weight')::NUMERIC, 0.25);
      v_creator_weight := COALESCE((v_user_prefs.feed_algorithm_preferences->>'creator_follow_weight')::NUMERIC, 0.15);
      v_completion_weight := COALESCE((v_user_prefs.feed_algorithm_preferences->>'completion_weight')::NUMERIC, 0.15);
      v_skip_penalty_weight := COALESCE((v_user_prefs.feed_algorithm_preferences->>'skip_penalty')::NUMERIC, 0.3);
      v_velocity_weight := COALESCE((v_user_prefs.feed_algorithm_preferences->>'velocity_weight')::NUMERIC, 0.1);
      v_reputation_weight := COALESCE((v_user_prefs.feed_algorithm_preferences->>'reputation_weight')::NUMERIC, 0.05);
      v_topic_activity_weight := COALESCE((v_user_prefs.feed_algorithm_preferences->>'topic_activity_weight')::NUMERIC, 0.05);
      v_diversity_weight := COALESCE((v_user_prefs.feed_algorithm_preferences->>'diversity_weight')::NUMERIC, 0.05);
    END IF;
    
    v_relevance_score := v_trending_score * v_trending_weight;
  END;
  
  -- If no profile_id provided, return base trending score
  IF p_profile_id IS NULL THEN
    RETURN v_relevance_score;
  END IF;
  
  -- Check if topic or creator is muted
  IF EXISTS (SELECT 1 FROM public.muted_topics WHERE profile_id = p_profile_id AND topic_id = v_clip_record.topic_id) THEN
    RETURN -1; -- Strong penalty for muted topics
  END IF;
  
  IF EXISTS (SELECT 1 FROM public.muted_creators WHERE profile_id = p_profile_id AND creator_id = v_clip_record.profile_id) THEN
    RETURN -1; -- Strong penalty for muted creators
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
    
    -- 7. ENGAGEMENT VELOCITY BONUS (NEW)
    v_engagement_velocity_bonus := public.calculate_engagement_velocity(p_clip_id, 24);
    -- Normalize velocity (divide by 10 to get 0-1 range, then scale by weight)
    v_engagement_velocity_bonus := LEAST(1.0, v_engagement_velocity_bonus / 10.0) * v_velocity_weight;
    
    -- 8. CREATOR REPUTATION BONUS (NEW)
    IF v_clip_record.profile_id IS NOT NULL THEN
      SELECT COALESCE(reputation, 0) INTO v_creator_reputation
      FROM public.profiles
      WHERE id = v_clip_record.profile_id;
      
      -- Normalize reputation (0-1000 range, then scale)
      v_creator_reputation_bonus := LEAST(1.0, v_creator_reputation / 1000.0) * v_reputation_weight;
    END IF;
    
    -- 9. TOPIC ACTIVITY BONUS (NEW)
    IF v_clip_record.topic_id IS NOT NULL THEN
      SELECT 
        COUNT(*)::INTEGER,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::INTEGER
      INTO v_topic_clips_count, v_recent_topic_clips
      FROM public.clips
      WHERE topic_id = v_clip_record.topic_id
        AND status = 'live';
      
      -- Boost for active topics (more clips = more active)
      IF v_topic_clips_count > 0 THEN
        v_topic_activity_bonus := LEAST(1.0, LN(v_topic_clips_count + 1) / LN(100)) * v_topic_activity_weight;
        -- Additional boost for recent activity
        IF v_recent_topic_clips > 0 THEN
          v_topic_activity_bonus := v_topic_activity_bonus + (LEAST(1.0, v_recent_topic_clips / 10.0) * v_topic_activity_weight * 0.5);
        END IF;
      END IF;
    END IF;
    
    -- 10. DIVERSITY BONUS (NEW) - Avoid echo chambers
    -- Get user's recent topics (last 20 clips they've seen)
    SELECT ARRAY_AGG(DISTINCT topic_id) INTO v_user_recent_topics
    FROM (
      SELECT DISTINCT c.topic_id
      FROM public.listens l
      INNER JOIN public.clips c ON c.id = l.clip_id
      WHERE l.profile_id = p_profile_id
        AND l.listened_at > NOW() - INTERVAL '7 days'
        AND c.topic_id IS NOT NULL
      LIMIT 20
    ) recent;
    
    -- If user has seen many clips from this topic recently, reduce diversity bonus
    IF v_user_recent_topics IS NOT NULL AND v_clip_record.topic_id IS NOT NULL THEN
      IF v_clip_record.topic_id = ANY(v_user_recent_topics) THEN
        -- Topic already seen recently, small diversity penalty
        v_diversity_bonus := -0.05 * v_diversity_weight;
      ELSE
        -- New topic, diversity bonus
        v_diversity_bonus := 0.1 * v_diversity_weight;
      END IF;
    ELSE
      -- No recent history, neutral
      v_diversity_bonus := 0;
    END IF;
  END;
  
  -- Calculate final relevance score
  v_relevance_score := v_relevance_score + v_topic_follow_bonus + v_creator_follow_bonus + 
                       v_completion_bonus + v_similar_creator_bonus + v_duration_bonus + 
                       v_time_bonus + v_skip_penalty + v_engagement_velocity_bonus +
                       v_creator_reputation_bonus + v_topic_activity_bonus + v_diversity_bonus;
  
  -- Ensure score is not negative (unless muted)
  IF v_relevance_score < 0 AND v_relevance_score > -1 THEN
    v_relevance_score := 0;
  END IF;
  
  RETURN v_relevance_score;
END;
$$;

-- ============================================
-- 4. FEED FILTER FUNCTIONS
-- ============================================

-- Drop existing functions if they exist (to allow return type changes)
DROP FUNCTION IF EXISTS public.get_best_clips(UUID, TEXT, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.get_rising_clips(UUID, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.get_controversial_clips(UUID, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.get_top_clips_by_topic(UUID, UUID, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.get_clips_from_city(UUID, TEXT, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.get_clips_from_followed_creators(UUID, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.get_unheard_clips(UUID, INTEGER, INTEGER);

-- Function: Get "Best of [Time Period]" clips
CREATE OR REPLACE FUNCTION public.get_best_clips(
  p_profile_id UUID,
  p_time_period TEXT DEFAULT 'day', -- 'hour', 'day', 'week', 'month', 'year', 'all'
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  clip_id UUID,
  score NUMERIC,
  clip_data JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_time TIMESTAMPTZ;
BEGIN
  -- Determine start time based on period
  CASE p_time_period
    WHEN 'hour' THEN v_start_time := NOW() - INTERVAL '1 hour';
    WHEN 'day' THEN v_start_time := NOW() - INTERVAL '1 day';
    WHEN 'week' THEN v_start_time := NOW() - INTERVAL '7 days';
    WHEN 'month' THEN v_start_time := NOW() - INTERVAL '30 days';
    WHEN 'year' THEN v_start_time := NOW() - INTERVAL '365 days';
    ELSE v_start_time := '1970-01-01'::TIMESTAMPTZ; -- All time
  END CASE;
  
  RETURN QUERY
  WITH scored_clips AS (
    SELECT 
      c.id,
      COALESCE(c.trending_score, 0) as score,
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
        'reply_count', COALESCE(public.get_reply_count(c.id), 0),
        'remix_of_clip_id', c.remix_of_clip_id,
        'remix_count', COALESCE(public.get_remix_count(c.id), 0),
        'chain_id', c.chain_id,
        'challenge_id', c.challenge_id,
        'is_podcast', c.is_podcast
      ) as clip_data
    FROM public.clips c
    WHERE c.status = 'live'
      AND c.created_at >= v_start_time
      -- Exclude muted topics/creators if profile_id provided
      AND (p_profile_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.muted_topics mt 
        WHERE mt.profile_id = p_profile_id AND mt.topic_id = c.topic_id
      ))
      AND (p_profile_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.muted_creators mc 
        WHERE mc.profile_id = p_profile_id AND mc.creator_id = c.profile_id
      ))
      AND (p_profile_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.user_blocks ub 
        WHERE ub.blocker_id = p_profile_id AND ub.blocked_id = c.profile_id
      ))
    ORDER BY c.trending_score DESC NULLS LAST, c.created_at DESC
    LIMIT (p_limit + p_offset) * 2
  )
  SELECT 
    sc.id as clip_id,
    sc.score,
    sc.clip_data
  FROM scored_clips sc
  ORDER BY sc.score DESC, (sc.clip_data->>'created_at')::TIMESTAMPTZ DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Function: Get "Rising" clips (gaining traction)
CREATE OR REPLACE FUNCTION public.get_rising_clips(
  p_profile_id UUID,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  clip_id UUID,
  velocity_score NUMERIC,
  clip_data JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH scored_clips AS (
    SELECT 
      c.id,
      public.calculate_engagement_velocity(c.id, 24) as velocity_score,
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
        'reply_count', COALESCE(public.get_reply_count(c.id), 0),
        'remix_of_clip_id', c.remix_of_clip_id,
        'remix_count', COALESCE(public.get_remix_count(c.id), 0),
        'chain_id', c.chain_id,
        'challenge_id', c.challenge_id,
        'is_podcast', c.is_podcast
      ) as clip_data
    FROM public.clips c
    WHERE c.status = 'live'
      AND c.created_at > NOW() - INTERVAL '48 hours' -- Only recent clips
      -- Exclude muted topics/creators if profile_id provided
      AND (p_profile_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.muted_topics mt 
        WHERE mt.profile_id = p_profile_id AND mt.topic_id = c.topic_id
      ))
      AND (p_profile_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.muted_creators mc 
        WHERE mc.profile_id = p_profile_id AND mc.creator_id = c.profile_id
      ))
      AND (p_profile_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.user_blocks ub 
        WHERE ub.blocker_id = p_profile_id AND ub.blocked_id = c.profile_id
      ))
    ORDER BY c.created_at DESC
    LIMIT (p_limit + p_offset) * 3
  )
  SELECT 
    sc.id as clip_id,
    sc.velocity_score,
    sc.clip_data
  FROM scored_clips sc
  WHERE sc.velocity_score > 0 -- Only clips with some engagement
  ORDER BY sc.velocity_score DESC, (sc.clip_data->>'created_at')::TIMESTAMPTZ DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Function: Get "Controversial" clips (high engagement with mixed reactions)
CREATE OR REPLACE FUNCTION public.get_controversial_clips(
  p_profile_id UUID,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  clip_id UUID,
  controversy_score NUMERIC,
  clip_data JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH scored_clips AS (
    SELECT 
      c.id,
      -- Controversy score: high engagement but mixed reactions
      -- Formula: (total_reactions / (1 + reaction_variance)) * engagement_ratio
      (
        COALESCE((SELECT SUM(value::INTEGER) FROM jsonb_each_text(c.reactions)), 0)::NUMERIC /
        GREATEST(1, 
          -- Calculate variance in reactions (more variance = more controversial)
          (SELECT STDDEV(value::NUMERIC) FROM jsonb_each_text(c.reactions))
        )
      ) * 
      (COALESCE(c.listens_count, 0)::NUMERIC / GREATEST(1, 
        EXTRACT(EPOCH FROM (NOW() - c.created_at)) / 3600.0
      )) as controversy_score,
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
        'reply_count', COALESCE(public.get_reply_count(c.id), 0),
        'remix_of_clip_id', c.remix_of_clip_id,
        'remix_count', COALESCE(public.get_remix_count(c.id), 0),
        'chain_id', c.chain_id,
        'challenge_id', c.challenge_id,
        'is_podcast', c.is_podcast
      ) as clip_data
    FROM public.clips c
    WHERE c.status = 'live'
      AND c.created_at > NOW() - INTERVAL '7 days' -- Only recent clips
      AND COALESCE((SELECT SUM(value::INTEGER) FROM jsonb_each_text(c.reactions)), 0) > 5 -- Minimum engagement
      -- Exclude muted topics/creators if profile_id provided
      AND (p_profile_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.muted_topics mt 
        WHERE mt.profile_id = p_profile_id AND mt.topic_id = c.topic_id
      ))
      AND (p_profile_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.muted_creators mc 
        WHERE mc.profile_id = p_profile_id AND mc.creator_id = c.profile_id
      ))
      AND (p_profile_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.user_blocks ub 
        WHERE ub.blocker_id = p_profile_id AND ub.blocked_id = c.profile_id
      ))
    ORDER BY c.created_at DESC
    LIMIT (p_limit + p_offset) * 3
  )
  SELECT 
    sc.id as clip_id,
    sc.controversy_score,
    sc.clip_data
  FROM scored_clips sc
  WHERE sc.controversy_score > 0
  ORDER BY sc.controversy_score DESC, (sc.clip_data->>'created_at')::TIMESTAMPTZ DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Function: Get "Top by Topic" clips
CREATE OR REPLACE FUNCTION public.get_top_clips_by_topic(
  p_profile_id UUID,
  p_topic_id UUID,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  clip_id UUID,
  score NUMERIC,
  clip_data JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH scored_clips AS (
    SELECT 
      c.id,
      COALESCE(c.trending_score, 0) as score,
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
        'reply_count', COALESCE(public.get_reply_count(c.id), 0),
        'remix_of_clip_id', c.remix_of_clip_id,
        'remix_count', COALESCE(public.get_remix_count(c.id), 0),
        'chain_id', c.chain_id,
        'challenge_id', c.challenge_id,
        'is_podcast', c.is_podcast
      ) as clip_data
    FROM public.clips c
    WHERE c.status = 'live'
      AND c.topic_id = p_topic_id
      -- Exclude muted creators if profile_id provided
      AND (p_profile_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.muted_creators mc 
        WHERE mc.profile_id = p_profile_id AND mc.creator_id = c.profile_id
      ))
      AND (p_profile_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.user_blocks ub 
        WHERE ub.blocker_id = p_profile_id AND ub.blocked_id = c.profile_id
      ))
    ORDER BY c.trending_score DESC NULLS LAST, c.created_at DESC
    LIMIT (p_limit + p_offset) * 2
  )
  SELECT 
    sc.id as clip_id,
    sc.score,
    sc.clip_data
  FROM scored_clips sc
  ORDER BY sc.score DESC, (sc.clip_data->>'created_at')::TIMESTAMPTZ DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Function: Get "From Your City" clips
CREATE OR REPLACE FUNCTION public.get_clips_from_city(
  p_profile_id UUID,
  p_city TEXT,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  clip_id UUID,
  score NUMERIC,
  clip_data JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH scored_clips AS (
    SELECT 
      c.id,
      COALESCE(c.trending_score, 0) as score,
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
        'reply_count', COALESCE(public.get_reply_count(c.id), 0),
        'remix_of_clip_id', c.remix_of_clip_id,
        'remix_count', COALESCE(public.get_remix_count(c.id), 0),
        'chain_id', c.chain_id,
        'challenge_id', c.challenge_id,
        'is_podcast', c.is_podcast
      ) as clip_data
    FROM public.clips c
    WHERE c.status = 'live'
      AND c.city = p_city
      -- Exclude muted topics/creators if profile_id provided
      AND (p_profile_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.muted_topics mt 
        WHERE mt.profile_id = p_profile_id AND mt.topic_id = c.topic_id
      ))
      AND (p_profile_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.muted_creators mc 
        WHERE mc.profile_id = p_profile_id AND mc.creator_id = c.profile_id
      ))
      AND (p_profile_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.user_blocks ub 
        WHERE ub.blocker_id = p_profile_id AND ub.blocked_id = c.profile_id
      ))
    ORDER BY c.trending_score DESC NULLS LAST, c.created_at DESC
    LIMIT (p_limit + p_offset) * 2
  )
  SELECT 
    sc.id as clip_id,
    sc.score,
    sc.clip_data
  FROM scored_clips sc
  ORDER BY sc.score DESC, (sc.clip_data->>'created_at')::TIMESTAMPTZ DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Function: Get "From Followed Creators" clips
CREATE OR REPLACE FUNCTION public.get_clips_from_followed_creators(
  p_profile_id UUID,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  clip_id UUID,
  score NUMERIC,
  clip_data JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH scored_clips AS (
    SELECT 
      c.id,
      COALESCE(c.trending_score, 0) as score,
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
        'reply_count', COALESCE(public.get_reply_count(c.id), 0),
        'remix_of_clip_id', c.remix_of_clip_id,
        'remix_count', COALESCE(public.get_remix_count(c.id), 0),
        'chain_id', c.chain_id,
        'challenge_id', c.challenge_id,
        'is_podcast', c.is_podcast
      ) as clip_data
    FROM public.clips c
    INNER JOIN public.follows f ON f.following_id = c.profile_id
    WHERE c.status = 'live'
      AND f.follower_id = p_profile_id
      -- Exclude muted topics if profile_id provided
      AND (p_profile_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.muted_topics mt 
        WHERE mt.profile_id = p_profile_id AND mt.topic_id = c.topic_id
      ))
      AND (p_profile_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.user_blocks ub 
        WHERE ub.blocker_id = p_profile_id AND ub.blocked_id = c.profile_id
      ))
    ORDER BY c.created_at DESC
    LIMIT (p_limit + p_offset) * 2
  )
  SELECT 
    sc.id as clip_id,
    sc.score,
    sc.clip_data
  FROM scored_clips sc
  ORDER BY sc.score DESC, (sc.clip_data->>'created_at')::TIMESTAMPTZ DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Function: Get "Unheard" clips (clips user hasn't listened to)
CREATE OR REPLACE FUNCTION public.get_unheard_clips(
  p_profile_id UUID,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
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
BEGIN
  RETURN QUERY
  WITH scored_clips AS (
    SELECT 
      c.id,
      public.calculate_enhanced_personalized_relevance(
        c.id, 
        p_profile_id, 
        EXTRACT(HOUR FROM NOW())::INTEGER,
        NULL
      ) as relevance_score,
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
        'reply_count', COALESCE(public.get_reply_count(c.id), 0),
        'remix_of_clip_id', c.remix_of_clip_id,
        'remix_count', COALESCE(public.get_remix_count(c.id), 0),
        'chain_id', c.chain_id,
        'challenge_id', c.challenge_id,
        'is_podcast', c.is_podcast
      ) as clip_data
    FROM public.clips c
    WHERE c.status = 'live'
      -- Exclude clips user has already listened to
      AND NOT EXISTS (
        SELECT 1 FROM public.listens l
        WHERE l.profile_id = p_profile_id AND l.clip_id = c.id
      )
      -- Exclude muted topics/creators
      AND NOT EXISTS (
        SELECT 1 FROM public.muted_topics mt 
        WHERE mt.profile_id = p_profile_id AND mt.topic_id = c.topic_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.muted_creators mc 
        WHERE mc.profile_id = p_profile_id AND mc.creator_id = c.profile_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.user_blocks ub 
        WHERE ub.blocker_id = p_profile_id AND ub.blocked_id = c.profile_id
      )
    ORDER BY c.trending_score DESC NULLS LAST, c.created_at DESC
    LIMIT (p_limit + p_offset) * 3
  )
  SELECT 
    sc.id as clip_id,
    sc.relevance_score,
    sc.clip_data
  FROM scored_clips sc
  WHERE sc.relevance_score > 0 -- Only relevant clips
  ORDER BY sc.relevance_score DESC, (sc.clip_data->>'created_at')::TIMESTAMPTZ DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.calculate_engagement_velocity(UUID, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.update_clip_engagement_velocity(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.calculate_enhanced_personalized_relevance(UUID, UUID, INTEGER, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_best_clips(UUID, TEXT, INTEGER, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_rising_clips(UUID, INTEGER, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_controversial_clips(UUID, INTEGER, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_top_clips_by_topic(UUID, UUID, INTEGER, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_clips_from_city(UUID, TEXT, INTEGER, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_clips_from_followed_creators(UUID, INTEGER, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_unheard_clips(UUID, INTEGER, INTEGER) TO authenticated, anon;

-- Function to update engagement velocity for all recent clips (called by cron job)
CREATE OR REPLACE FUNCTION public.update_all_engagement_velocity()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_count INTEGER := 0;
  v_clip_record RECORD;
BEGIN
  -- Update engagement velocity for all live clips from the last 48 hours
  FOR v_clip_record IN 
    SELECT 
      c.id,
      c.created_at,
      c.listens_count,
      c.reactions,
      c.reply_count,
      c.remix_count
    FROM public.clips c
    WHERE c.status = 'live'
      AND c.created_at > NOW() - INTERVAL '48 hours'
    LIMIT 1000 -- Process in batches to avoid timeout
  LOOP
    -- Call the update function for each clip
    PERFORM public.update_clip_engagement_velocity(v_clip_record.id);
    v_updated_count := v_updated_count + 1;
  END LOOP;
  
  -- Clean up old velocity records (older than 7 days)
  DELETE FROM public.clip_engagement_velocity
  WHERE updated_at < NOW() - INTERVAL '7 days';
  
  RETURN v_updated_count;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.update_all_engagement_velocity() TO authenticated, anon;

-- Comments for documentation
COMMENT ON TABLE public.clip_engagement_velocity IS 'Tracks engagement velocity (reactions per hour) for clips to identify rising content';
COMMENT ON FUNCTION public.update_all_engagement_velocity IS 'Updates engagement velocity for all recent clips. Should be called periodically (e.g., every hour) via cron job or edge function';
COMMENT ON TABLE public.muted_topics IS 'Tracks topics that users have muted to filter from their feed';
COMMENT ON TABLE public.muted_creators IS 'Tracks creators that users have muted to filter from their feed (separate from blocks)';
COMMENT ON FUNCTION public.calculate_engagement_velocity IS 'Calculates engagement velocity (reactions/listens per hour) for a clip';
COMMENT ON FUNCTION public.calculate_enhanced_personalized_relevance IS 'Enhanced personalized relevance calculation with engagement velocity, diversity, topic activity, and creator reputation';
COMMENT ON FUNCTION public.get_best_clips IS 'Gets best clips for a time period (hour, day, week, month, year, all)';
COMMENT ON FUNCTION public.get_rising_clips IS 'Gets clips that are gaining traction (high engagement velocity)';
COMMENT ON FUNCTION public.get_controversial_clips IS 'Gets clips with high engagement but mixed reactions';
COMMENT ON FUNCTION public.get_top_clips_by_topic IS 'Gets top clips for a specific topic';
COMMENT ON FUNCTION public.get_clips_from_city IS 'Gets clips from a specific city';
COMMENT ON FUNCTION public.get_clips_from_followed_creators IS 'Gets clips only from creators the user follows';
COMMENT ON FUNCTION public.get_unheard_clips IS 'Gets clips the user has not yet listened to';

