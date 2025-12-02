-- Enhanced Search Features
-- This migration adds search history, enhanced search function with filters, and search suggestions support

-- Create search_history table to track user search queries
CREATE TABLE IF NOT EXISTS public.search_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  search_type TEXT NOT NULL DEFAULT 'text', -- 'text', 'voice', 'semantic'
  filters JSONB DEFAULT '{}'::jsonb,
  result_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.search_history ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own search history
CREATE POLICY "Users can view their own search history"
ON public.search_history FOR SELECT
USING (
  profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Policy: Users can insert their own search history
CREATE POLICY "Users can insert their own search history"
ON public.search_history FOR INSERT
WITH CHECK (
  profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Policy: Users can delete their own search history
CREATE POLICY "Users can delete their own search history"
ON public.search_history FOR DELETE
USING (
  profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Create indexes for search history
CREATE INDEX IF NOT EXISTS search_history_profile_id_idx ON public.search_history(profile_id);
CREATE INDEX IF NOT EXISTS search_history_created_at_idx ON public.search_history(created_at DESC);
CREATE INDEX IF NOT EXISTS search_history_query_idx ON public.search_history(query);

-- Enhanced search function with filters
-- This function extends search_clips_by_text to support filtering by duration, date, reactions, quality, etc.
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
  limit_results INT DEFAULT 100
)
RETURNS TABLE(clip_id UUID, rank REAL) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id, 
    COALESCE(
      CASE 
        WHEN search_text IS NOT NULL AND search_text != '' THEN
          ts_rank(
            to_tsvector('english', COALESCE(c.captions, '') || ' ' || COALESCE(c.summary, '') || ' ' || COALESCE(c.title, '')),
            plainto_tsquery('english', search_text)
          )
        ELSE 1.0
      END,
      1.0
    ) as rank
  FROM clips c
  WHERE c.status = 'live'
    AND c.captions IS NOT NULL
    AND c.captions != ''
    -- Text search condition
    AND (
      search_text IS NULL 
      OR search_text = ''
      OR to_tsvector('english', COALESCE(c.captions, '') || ' ' || COALESCE(c.summary, '') || ' ' || COALESCE(c.title, '')) 
         @@ plainto_tsquery('english', search_text)
    )
    -- Duration filter
    AND (duration_min IS NULL OR c.duration_seconds >= duration_min)
    AND (duration_max IS NULL OR c.duration_seconds <= duration_max)
    -- Date filter
    AND (date_from IS NULL OR c.created_at >= date_from)
    AND (date_to IS NULL OR c.created_at <= date_to)
    -- Mood filter
    AND (mood_emoji_filter IS NULL OR c.mood_emoji = mood_emoji_filter)
    -- City filter
    AND (city_filter IS NULL OR c.city = city_filter)
    -- Topic filter
    AND (topic_id_filter IS NULL OR c.topic_id = topic_id_filter)
    -- Reactions filter (check if reactions JSONB has any non-zero values)
    AND (
      min_reactions IS NULL 
      OR (
        SELECT COALESCE(SUM((value::text)::int), 0)
        FROM jsonb_each(c.reactions)
      ) >= min_reactions
    )
    -- Listens filter
    AND (min_listens IS NULL OR c.listens_count >= min_listens)
  ORDER BY rank DESC, c.created_at DESC
  LIMIT limit_results;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission to authenticated and anonymous users
GRANT EXECUTE ON FUNCTION search_clips_enhanced(TEXT, INT, INT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, UUID, INT, INT, INT) TO anon;
GRANT EXECUTE ON FUNCTION search_clips_enhanced(TEXT, INT, INT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, UUID, INT, INT, INT) TO authenticated;

-- Function to get search suggestions based on popular queries and user history
CREATE OR REPLACE FUNCTION get_search_suggestions(
  user_profile_id UUID DEFAULT NULL,
  query_prefix TEXT DEFAULT '',
  limit_suggestions INT DEFAULT 10
)
RETURNS TABLE(suggestion TEXT, source TEXT, count BIGINT) AS $$
BEGIN
  RETURN QUERY
  (
    -- Popular searches from history (excluding user's own searches to avoid bias)
    SELECT DISTINCT
      sh.query as suggestion,
      'popular'::TEXT as source,
      COUNT(*)::BIGINT as count
    FROM search_history sh
    WHERE sh.query ILIKE query_prefix || '%'
      AND (user_profile_id IS NULL OR sh.profile_id != user_profile_id)
      AND sh.created_at >= NOW() - INTERVAL '30 days'
    GROUP BY sh.query
    ORDER BY count DESC, sh.query
    LIMIT limit_suggestions / 2
  )
  UNION ALL
  (
    -- User's recent searches
    SELECT DISTINCT
      sh.query as suggestion,
      'recent'::TEXT as source,
      COUNT(*)::BIGINT as count
    FROM search_history sh
    WHERE sh.profile_id = user_profile_id
      AND sh.query ILIKE query_prefix || '%'
      AND sh.created_at >= NOW() - INTERVAL '7 days'
    GROUP BY sh.query
    ORDER BY MAX(sh.created_at) DESC
    LIMIT limit_suggestions / 2
  )
  ORDER BY 
    CASE source WHEN 'recent' THEN 0 ELSE 1 END,
    count DESC
  LIMIT limit_suggestions;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_search_suggestions(UUID, TEXT, INT) TO anon;
GRANT EXECUTE ON FUNCTION get_search_suggestions(UUID, TEXT, INT) TO authenticated;

-- Function to get trending search terms
CREATE OR REPLACE FUNCTION get_trending_searches(
  hours_back INT DEFAULT 24,
  limit_results INT DEFAULT 10
)
RETURNS TABLE(query TEXT, search_count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sh.query,
    COUNT(*)::BIGINT as search_count
  FROM search_history sh
  WHERE sh.created_at >= NOW() - (hours_back || ' hours')::INTERVAL
  GROUP BY sh.query
  ORDER BY search_count DESC, sh.query
  LIMIT limit_results;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_trending_searches(INT, INT) TO anon;
GRANT EXECUTE ON FUNCTION get_trending_searches(INT, INT) TO authenticated;

