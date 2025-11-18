-- Migration: Add "For You" Personalized Feed
-- This migration adds functions to calculate personalized relevance scores
-- and retrieve a personalized feed based on user preferences and behavior

-- Function to calculate personalized relevance score for a clip
-- Considers: followed topics, high completion rate clips, followed creators, trending score
CREATE OR REPLACE FUNCTION public.calculate_personalized_relevance(
  p_clip_id UUID,
  p_profile_id UUID
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
  v_clip_record RECORD;
  v_is_following_topic BOOLEAN := false;
  v_is_following_creator BOOLEAN := false;
  v_user_completion_rate NUMERIC := 0;
  v_avg_completion_rate NUMERIC := 0;
  v_followed_creators_count INTEGER := 0;
BEGIN
  -- Get clip data
  SELECT 
    c.id,
    c.profile_id,
    c.topic_id,
    c.trending_score,
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
  
  -- Base score: trending score (normalized to 0-1 range, then scaled)
  v_trending_score := COALESCE(v_clip_record.trending_score, 0) / 1000.0;
  v_relevance_score := v_trending_score * 0.4; -- 40% weight for trending
  
  -- If no profile_id provided, return base trending score
  IF p_profile_id IS NULL THEN
    RETURN v_relevance_score;
  END IF;
  
  -- 1. TOPIC FOLLOW BONUS (30% weight)
  -- Check if user follows the topic this clip belongs to
  IF v_clip_record.topic_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 
      FROM public.topic_subscriptions ts
      WHERE ts.profile_id = p_profile_id 
      AND ts.topic_id = v_clip_record.topic_id
    ) INTO v_is_following_topic;
    
    IF v_is_following_topic THEN
      v_topic_follow_bonus := 0.3; -- 30% boost for followed topics
    END IF;
  END IF;
  
  -- 2. CREATOR FOLLOW BONUS (20% weight)
  -- Check if user follows the clip creator
  IF v_clip_record.profile_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 
      FROM public.follows f
      WHERE f.follower_id = p_profile_id 
      AND f.following_id = v_clip_record.profile_id
    ) INTO v_is_following_creator;
    
    IF v_is_following_creator THEN
      v_creator_follow_bonus := 0.2; -- 20% boost for followed creators
    END IF;
  END IF;
  
  -- 3. COMPLETION RATE BONUS (20% weight)
  -- Boost clips that user has listened to with high completion rate
  SELECT 
    COALESCE(AVG(completion_percentage), 0)
  INTO v_user_completion_rate
  FROM public.listens l
  WHERE l.clip_id = p_clip_id 
  AND l.profile_id = p_profile_id
  AND l.completion_percentage IS NOT NULL;
  
  -- If user has high completion rate (>70%) for this clip, boost it
  IF v_user_completion_rate > 70 THEN
    v_completion_bonus := 0.2 * (v_user_completion_rate / 100.0); -- Up to 20% boost
  END IF;
  
  -- Also boost clips similar to ones user completes (based on creator)
  -- If user has high completion rate for clips from this creator, boost
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
      v_similar_creator_bonus := 0.1 * (v_avg_completion_rate / 100.0); -- Up to 10% boost
    END IF;
  END IF;
  
  -- Calculate final relevance score
  -- Base trending (40%) + Topic follow (30%) + Creator follow (20%) + Completion (20%) + Similar creator (10%)
  -- Total can exceed 1.0, which is fine for ranking
  v_relevance_score := v_relevance_score + v_topic_follow_bonus + v_creator_follow_bonus + 
                       v_completion_bonus + v_similar_creator_bonus;
  
  RETURN v_relevance_score;
END;
$$;

-- Function to get personalized "For You" feed
-- Returns clips sorted by personalized relevance score
CREATE OR REPLACE FUNCTION public.get_for_you_feed(
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
      public.calculate_personalized_relevance(c.id, p_profile_id) as relevance,
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
    -- This improves performance by avoiding calculation for very old/low-trending clips
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

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.calculate_personalized_relevance(UUID, UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_for_you_feed(UUID, INTEGER, INTEGER) TO authenticated, anon;

-- Create index for faster queries on topic subscriptions
CREATE INDEX IF NOT EXISTS idx_topic_subscriptions_profile_topic 
ON public.topic_subscriptions(profile_id, topic_id);

-- Create index for faster queries on follows
CREATE INDEX IF NOT EXISTS idx_follows_follower_following 
ON public.follows(follower_id, following_id);

-- Create index for faster completion rate queries
CREATE INDEX IF NOT EXISTS idx_listens_profile_clip_completion 
ON public.listens(profile_id, clip_id, completion_percentage) 
WHERE completion_percentage IS NOT NULL;

-- Create index for similar creator queries (listens by creator)
CREATE INDEX IF NOT EXISTS idx_listens_clip_creator 
ON public.listens(clip_id, profile_id, completion_percentage, listened_at) 
WHERE completion_percentage IS NOT NULL;

