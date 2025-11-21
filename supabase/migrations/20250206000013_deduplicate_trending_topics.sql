-- Deduplicate trending topics by title (only for system topics)
-- This ensures that system topics with the same title don't appear multiple times in trending
-- User-created topics are not deduplicated (they can have same titles)

CREATE OR REPLACE FUNCTION public.get_trending_topics(p_limit INT DEFAULT 10)
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  date DATE,
  is_active BOOLEAN,
  user_created_by UUID,
  community_id UUID,
  clips_count INT,
  trending_score NUMERIC,
  created_at TIMESTAMPTZ,
  communities JSONB,
  profiles JSONB
) AS $$
BEGIN
  -- Get trending topics with deduplication for system topics only
  -- Only deduplicate system topics (user_created_by IS NULL) with same title
  -- For user-created topics, don't deduplicate (allow same titles)
  RETURN QUERY
  WITH ranked_topics AS (
    SELECT 
      t.id,
      t.title,
      t.description,
      t.date,
      t.is_active,
      t.user_created_by,
      t.community_id,
      t.clips_count,
      COALESCE(t.trending_score, 0) as trending_score,
      t.created_at,
      CASE 
        WHEN t.community_id IS NOT NULL THEN
          jsonb_build_object(
            'id', c.id,
            'name', c.name,
            'slug', c.slug,
            'avatar_emoji', c.avatar_emoji
          )
        ELSE NULL
      END as communities,
      CASE 
        WHEN t.user_created_by IS NOT NULL THEN
          jsonb_build_object(
            'id', p.id,
            'handle', p.handle,
            'emoji_avatar', p.emoji_avatar
          )
        ELSE NULL
      END as profiles,
      -- Only deduplicate system topics with same title
      -- User-created topics are not deduplicated
      CASE 
        WHEN t.user_created_by IS NULL THEN
          ROW_NUMBER() OVER (
            PARTITION BY LOWER(TRIM(t.title))
            ORDER BY COALESCE(t.trending_score, 0) DESC, t.date DESC, t.created_at DESC
          )
        ELSE 1  -- User-created topics always get rn = 1 (no deduplication)
      END as rn
    FROM public.topics t
    LEFT JOIN public.communities c ON t.community_id = c.id
    LEFT JOIN public.profiles p ON t.user_created_by = p.id
    WHERE t.is_active = true
  )
  SELECT 
    rt.id,
    rt.title,
    rt.description,
    rt.date,
    rt.is_active,
    rt.user_created_by,
    rt.community_id,
    rt.clips_count,
    rt.trending_score,
    rt.created_at,
    rt.communities,
    rt.profiles
  FROM ranked_topics rt
  WHERE rt.rn = 1  -- Only keep the first (best) topic for each system topic title
  ORDER BY rt.trending_score DESC, rt.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- Also improve the cleanup to remove duplicate system topics with same title
-- Keep only the most recent one (by date, then created_at)
-- This helps prevent confusion in trending topics
DELETE FROM public.topics
WHERE id IN (
  SELECT id
  FROM (
    SELECT 
      id,
      date,
      created_at,
      ROW_NUMBER() OVER (
        PARTITION BY LOWER(TRIM(title)), user_created_by
        ORDER BY date DESC, created_at DESC
      ) as rn
    FROM public.topics
    WHERE is_active = true 
      AND user_created_by IS NULL  -- Only system-generated topics
      AND date IS NOT NULL
      AND title ILIKE '%brightened your day%'  -- Focus on this specific duplicate
  ) duplicate_title_topics
  WHERE rn > 1  -- Keep only the first (most recent), delete the rest
);

-- Grant execute permission (should already exist, but ensure it)
GRANT EXECUTE ON FUNCTION public.get_trending_topics(INT) TO authenticated, anon;

COMMENT ON FUNCTION public.get_trending_topics IS 
'Gets trending topics, deduplicated by title for system topics only (case-insensitive). For system topics with the same title, returns only the one with highest trending_score and most recent date. User-created topics are not deduplicated. Returns all active topics if none have trending_score > 0.';
