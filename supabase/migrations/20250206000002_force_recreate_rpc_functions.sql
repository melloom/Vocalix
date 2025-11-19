-- Force recreate RPC functions with CREATE OR REPLACE
-- This ensures functions are created even if they already exist with different signatures

-- ============================================================================
-- 1. get_smart_notification_digest
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_smart_notification_digest(
  p_profile_id UUID,
  p_since TIMESTAMPTZ DEFAULT NOW() - INTERVAL '24 hours'
)
RETURNS JSONB 
LANGUAGE plpgsql 
STABLE 
SECURITY DEFINER
AS $$
DECLARE
  v_digest JSONB;
BEGIN
  -- Return empty digest if profile_id is null
  IF p_profile_id IS NULL THEN
    RETURN jsonb_build_object(
      'unread_count', 0,
      'by_type', '{}'::jsonb,
      'priority_notifications', '[]'::jsonb
    );
  END IF;

  SELECT jsonb_build_object(
    'unread_count', (
      SELECT COUNT(*)::INTEGER FROM public.notifications
      WHERE recipient_id = p_profile_id
        AND read_at IS NULL
        AND created_at >= p_since
    ),
    'by_type', (
      SELECT COALESCE(
        jsonb_object_agg(
          type,
          count
        ),
        '{}'::jsonb
      )
      FROM (
        SELECT type, COUNT(*)::INTEGER as count
        FROM public.notifications
        WHERE recipient_id = p_profile_id
          AND read_at IS NULL
          AND created_at >= p_since
        GROUP BY type
      ) type_counts
    ),
    'priority_notifications', (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', id,
            'type', type,
            'message', CASE 
              WHEN type = 'mention' THEN 'You were mentioned'
              WHEN type = 'follow' THEN 'You have a new follower'
              WHEN type = 'comment' THEN 'You have a new comment'
              WHEN type = 'reply' THEN 'You have a new reply'
              WHEN type = 'reaction' THEN 'You have a new reaction'
              WHEN type = 'challenge_update' THEN 'Challenge update'
              ELSE 'You have a new notification'
            END,
            'created_at', created_at
          )
        ),
        '[]'::jsonb
      )
      FROM (
        SELECT id, type, created_at
        FROM public.notifications
        WHERE recipient_id = p_profile_id
          AND read_at IS NULL
          AND created_at >= p_since
          AND type IN ('mention', 'follow')
        ORDER BY created_at DESC
        LIMIT 5
      ) priority_notifs
    )
  ) INTO v_digest;
  
  RETURN COALESCE(v_digest, jsonb_build_object(
    'unread_count', 0,
    'by_type', '{}'::jsonb,
    'priority_notifications', '[]'::jsonb
  ));
END;
$$;

-- ============================================================================
-- 2. calculate_enhanced_personalized_relevance (simplified, no dependencies)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_enhanced_personalized_relevance(
  p_clip_id UUID,
  p_profile_id UUID,
  p_current_hour INTEGER DEFAULT NULL,
  p_device_type TEXT DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_relevance_score NUMERIC := 0;
  v_trending_score NUMERIC := 0;
  v_follows_creator BOOLEAN := false;
  v_follows_topic BOOLEAN := false;
BEGIN
  -- Return 0 if inputs are invalid
  IF p_clip_id IS NULL OR p_profile_id IS NULL THEN
    RETURN 0;
  END IF;
  
  -- Base relevance from trending score
  SELECT COALESCE(trending_score, 0) INTO v_trending_score
  FROM public.clips
  WHERE id = p_clip_id AND status = 'live';
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  v_relevance_score := LEAST(v_trending_score / 1000.0, 1.0) * 0.3;
  
  -- Check if user follows the creator
  SELECT EXISTS(
    SELECT 1 FROM public.follows
    WHERE follower_id = p_profile_id
      AND following_id = (SELECT profile_id FROM public.clips WHERE id = p_clip_id)
  ) INTO v_follows_creator;
  
  IF v_follows_creator THEN
    v_relevance_score := v_relevance_score + 0.3;
  END IF;
  
  -- Check if user follows the topic (only if topic_subscriptions table exists)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'topic_subscriptions') THEN
    SELECT EXISTS(
      SELECT 1 FROM public.topic_subscriptions
      WHERE profile_id = p_profile_id
        AND topic_id = (SELECT topic_id FROM public.clips WHERE id = p_clip_id)
    ) INTO v_follows_topic;
    
    IF v_follows_topic THEN
      v_relevance_score := v_relevance_score + 0.2;
    END IF;
  END IF;
  
  -- Ensure score is between 0 and 1
  v_relevance_score := GREATEST(0, LEAST(1, v_relevance_score));
  
  RETURN v_relevance_score;
END;
$$;

-- ============================================================================
-- 3. get_enhanced_for_you_feed
-- ============================================================================

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
  v_valid_limit INTEGER;
  v_valid_offset INTEGER;
BEGIN
  -- Validate inputs - return empty result if profile_id is invalid
  IF p_profile_id IS NULL THEN
    RETURN;
  END IF;
  
  v_valid_limit := GREATEST(1, LEAST(COALESCE(p_limit, 50), 100));
  v_valid_offset := GREATEST(0, COALESCE(p_offset, 0));
  
  -- Get current hour if not provided
  v_current_hour := COALESCE(p_current_hour, EXTRACT(HOUR FROM NOW())::INTEGER);
  
  -- Ensure profile exists before processing
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_profile_id) THEN
    RETURN;
  END IF;
  
  RETURN QUERY
  WITH scored_clips AS (
    SELECT 
      c.id,
      COALESCE(
        public.calculate_enhanced_personalized_relevance(
          c.id, 
          p_profile_id, 
          v_current_hour, 
          p_device_type
        ),
        0
      ) as relevance,
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
        'listens_count', COALESCE(c.listens_count, 0),
        'reactions', COALESCE(c.reactions, '{}'::jsonb),
        'created_at', c.created_at,
        'topic_id', c.topic_id,
        'completion_rate', COALESCE(
          (SELECT AVG(l.completion_percentage) 
           FROM public.listens l 
           WHERE l.clip_id = c.id 
           AND l.completion_percentage IS NOT NULL),
          0
        ),
        'trending_score', COALESCE(c.trending_score, 0),
        'city', c.city,
        'parent_clip_id', c.parent_clip_id,
        'reply_count', COALESCE(public.get_reply_count(c.id), 0),
        'remix_of_clip_id', c.remix_of_clip_id,
        'remix_count', COALESCE(public.get_remix_count(c.id), 0),
        'chain_id', c.chain_id,
        'challenge_id', c.challenge_id,
        'is_podcast', COALESCE(c.is_podcast, false)
      ) as clip_data
    FROM public.clips c
    WHERE c.status = 'live'
    -- Pre-filter: only calculate relevance for clips that might be relevant
    AND (c.created_at > NOW() - INTERVAL '30 days' OR COALESCE(c.trending_score, 0) > 100)
    ORDER BY COALESCE(c.trending_score, 0) DESC, c.created_at DESC
    LIMIT (v_valid_limit + v_valid_offset) * 3
  )
  SELECT 
    sc.id as clip_id,
    sc.relevance as relevance_score,
    sc.clip_data
  FROM scored_clips sc
  WHERE sc.relevance > 0
  ORDER BY sc.relevance DESC, (sc.clip_data->>'created_at')::TIMESTAMPTZ DESC
  LIMIT v_valid_limit
  OFFSET v_valid_offset;
END;
$$;

-- Grant execute permissions (explicit grants)
GRANT EXECUTE ON FUNCTION public.get_smart_notification_digest(UUID, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_smart_notification_digest(UUID, TIMESTAMPTZ) TO anon;
GRANT EXECUTE ON FUNCTION public.calculate_enhanced_personalized_relevance(UUID, UUID, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_enhanced_personalized_relevance(UUID, UUID, INTEGER, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_enhanced_for_you_feed(UUID, INTEGER, INTEGER, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_enhanced_for_you_feed(UUID, INTEGER, INTEGER, INTEGER, TEXT) TO anon;

