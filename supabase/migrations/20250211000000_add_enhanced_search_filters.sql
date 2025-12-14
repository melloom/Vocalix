-- Enhanced Search Filters Migration
-- Adds support for completion rate and creator reputation filters

-- Update search_clips_enhanced to support completion rate and creator reputation filtering
CREATE OR REPLACE FUNCTION search_clips_enhanced(
  search_text TEXT DEFAULT NULL,
  duration_min INT DEFAULT NULL,
  duration_max INT DEFAULT NULL,
  date_from TIMESTAMPTZ DEFAULT NULL,
  date_to TIMESTAMPTZ DEFAULT NULL,
  mood_emoji_filter TEXT DEFAULT NULL,
  city_filter TEXT DEFAULT NULL,
  topic_id_filter UUID DEFAULT NULL,
  min_reactions INT DEFAULT NULL,
  min_listens INT DEFAULT NULL,
  quality_badge_filter TEXT DEFAULT NULL,
  emotion_filter TEXT DEFAULT NULL,
  min_completion_rate NUMERIC DEFAULT NULL,
  creator_reputation TEXT DEFAULT NULL,
  limit_results INT DEFAULT 100
)
RETURNS TABLE(clip_id UUID, rank REAL) AS $$
BEGIN
  RETURN QUERY
  WITH clip_metrics AS (
    SELECT 
      c.id,
      c.profile_id,
      c.duration_seconds,
      c.created_at,
      c.captions,
      c.summary,
      c.title,
      c.mood_emoji,
      c.city,
      c.topic_id,
      c.reactions,
      c.listens_count,
      c.quality_badge,
      c.detected_emotion,
      -- Calculate completion rate dynamically
      COALESCE(
        (
          SELECT AVG(
            CASE 
              WHEN l.completion_percentage IS NOT NULL THEN l.completion_percentage
              WHEN c.duration_seconds > 0 THEN (l.seconds::NUMERIC / c.duration_seconds::NUMERIC * 100)
              ELSE 0
            END
          )
          FROM public.listens l
          WHERE l.clip_id = c.id
        ),
        0
      ) as calculated_completion_rate,
      -- Calculate creator reputation based on engagement metrics
      COALESCE(
        (
          WITH creator_clips AS (
            SELECT 
              c2.listens_count,
              (
                SELECT COALESCE(SUM((value::text)::int), 0)
                FROM jsonb_each(c2.reactions)
              ) as reaction_count
            FROM public.clips c2
            WHERE c2.profile_id = c.profile_id
              AND c2.status = 'live'
              AND c2.created_at >= NOW() - INTERVAL '90 days'
          ),
          creator_stats AS (
            SELECT 
              AVG(cc.listens_count) as avg_listens,
              AVG(cc.reaction_count) as avg_reactions,
              COUNT(*) as clip_count
            FROM creator_clips cc
          )
          SELECT 
            CASE
              -- High reputation: creators with high average engagement
              WHEN cs.avg_listens > 50 
                AND cs.avg_reactions > 10
                AND cs.clip_count > 5
              THEN 'high'
              -- Medium reputation: established creators
              WHEN cs.avg_listens > 20 
                AND cs.clip_count > 3
              THEN 'medium'
              -- Low reputation: new or low-engagement creators
              ELSE 'low'
            END
          FROM creator_stats cs
        ),
        'low'
      ) as calculated_reputation
    FROM clips c
    WHERE c.status = 'live'
      AND c.captions IS NOT NULL
      AND c.captions != ''
  )
  SELECT 
    cm.id, 
    COALESCE(
      CASE 
        WHEN search_text IS NOT NULL AND search_text != '' THEN
          ts_rank(
            to_tsvector('english', COALESCE(cm.captions, '') || ' ' || COALESCE(cm.summary, '') || ' ' || COALESCE(cm.title, '')),
            plainto_tsquery('english', search_text)
          )
        ELSE 1.0
      END,
      1.0
    ) as rank
  FROM clip_metrics cm
  WHERE 
    -- Text search condition
    (
      search_text IS NULL 
      OR search_text = ''
      OR to_tsvector('english', COALESCE(cm.captions, '') || ' ' || COALESCE(cm.summary, '') || ' ' || COALESCE(cm.title, '')) 
         @@ plainto_tsquery('english', search_text)
    )
    -- Duration filter
    AND (duration_min IS NULL OR cm.duration_seconds >= duration_min)
    AND (duration_max IS NULL OR cm.duration_seconds <= duration_max)
    -- Date filter
    AND (date_from IS NULL OR cm.created_at >= date_from)
    AND (date_to IS NULL OR cm.created_at <= date_to)
    -- Mood filter
    AND (mood_emoji_filter IS NULL OR cm.mood_emoji = mood_emoji_filter)
    -- City filter
    AND (city_filter IS NULL OR cm.city = city_filter)
    -- Topic filter
    AND (topic_id_filter IS NULL OR cm.topic_id = topic_id_filter)
    -- Reactions filter
    AND (
      min_reactions IS NULL 
      OR (
        SELECT COALESCE(SUM((value::text)::int), 0)
        FROM jsonb_each(cm.reactions)
      ) >= min_reactions
    )
    -- Listens filter
    AND (min_listens IS NULL OR cm.listens_count >= min_listens)
    -- Quality badge filter
    AND (quality_badge_filter IS NULL OR cm.quality_badge = quality_badge_filter)
    -- Emotion filter
    AND (emotion_filter IS NULL OR cm.detected_emotion = emotion_filter)
    -- Completion rate filter
    AND (min_completion_rate IS NULL OR cm.calculated_completion_rate >= min_completion_rate)
    -- Creator reputation filter
    AND (creator_reputation IS NULL OR cm.calculated_reputation = creator_reputation)
  ORDER BY rank DESC, cm.created_at DESC
  LIMIT limit_results;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION search_clips_enhanced(TEXT, INT, INT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, UUID, INT, INT, TEXT, TEXT, NUMERIC, TEXT, INT) TO anon;
GRANT EXECUTE ON FUNCTION search_clips_enhanced(TEXT, INT, INT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, UUID, INT, INT, TEXT, TEXT, NUMERIC, TEXT, INT) TO authenticated;

-- Add function to get "People also searched for" suggestions
CREATE OR REPLACE FUNCTION get_related_searches(
  p_query TEXT,
  p_profile_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 5
)
RETURNS TABLE(query TEXT, search_count BIGINT) AS $$
BEGIN
  RETURN QUERY
  -- Find searches that were performed by users who also searched for the given query
  WITH users_who_searched AS (
    SELECT DISTINCT sh1.profile_id
    FROM search_history sh1
    WHERE sh1.query ILIKE '%' || p_query || '%'
      AND (p_profile_id IS NULL OR sh1.profile_id != p_profile_id)
      AND sh1.created_at >= NOW() - INTERVAL '30 days'
  ),
  related_queries AS (
    SELECT 
      sh2.query,
      COUNT(*)::BIGINT as search_count
    FROM search_history sh2
    INNER JOIN users_who_searched u ON u.profile_id = sh2.profile_id
    WHERE sh2.query != p_query
      AND sh2.query NOT ILIKE '%' || p_query || '%'
      AND sh2.query NOT ILIKE p_query || '%'
      AND sh2.created_at >= NOW() - INTERVAL '30 days'
    GROUP BY sh2.query
    HAVING COUNT(*) >= 2
  )
  SELECT 
    rq.query,
    rq.search_count
  FROM related_queries rq
  ORDER BY rq.search_count DESC, rq.query
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_related_searches(TEXT, UUID, INT) TO anon;
GRANT EXECUTE ON FUNCTION get_related_searches(TEXT, UUID, INT) TO authenticated;

