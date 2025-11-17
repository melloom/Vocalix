-- Add audio category field to clips table
ALTER TABLE public.clips
ADD COLUMN IF NOT EXISTS category TEXT CHECK (category IN ('storytelling', 'advice', 'news', 'comedy', 'education', 'music', 'interview', 'podcast', 'other'));

-- Create index for category filtering
CREATE INDEX IF NOT EXISTS idx_clips_category ON public.clips(category) WHERE status = 'live';

-- Create function to get popular tags for auto-suggestions
CREATE OR REPLACE FUNCTION public.get_popular_tags(
  limit_count INT DEFAULT 20,
  min_clip_count INT DEFAULT 3
)
RETURNS TABLE (
  tag TEXT,
  clip_count BIGINT,
  recent_count BIGINT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH tag_counts AS (
    SELECT 
      unnest(tags) AS tag,
      COUNT(*) AS clip_count,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS recent_count
    FROM public.clips
    WHERE status = 'live'
      AND tags IS NOT NULL
      AND array_length(tags, 1) > 0
    GROUP BY unnest(tags)
    HAVING COUNT(*) >= min_clip_count
  )
  SELECT 
    tag_counts.tag,
    tag_counts.clip_count,
    tag_counts.recent_count
  FROM tag_counts
  ORDER BY 
    recent_count DESC,  -- Prioritize recently used tags
    clip_count DESC     -- Then by total usage
  LIMIT limit_count;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_popular_tags TO anon, authenticated;

-- Create function to search tags (for autocomplete)
CREATE OR REPLACE FUNCTION public.search_tags(
  search_query TEXT,
  limit_count INT DEFAULT 10
)
RETURNS TABLE (
  tag TEXT,
  clip_count BIGINT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT
    unnest(tags) AS tag,
    COUNT(*) AS clip_count
  FROM public.clips
  WHERE status = 'live'
    AND tags IS NOT NULL
    AND array_length(tags, 1) > 0
    AND EXISTS (
      SELECT 1 
      FROM unnest(tags) AS t 
      WHERE t ILIKE '%' || search_query || '%'
    )
  GROUP BY unnest(tags)
  ORDER BY 
    clip_count DESC,
    tag ASC
  LIMIT limit_count;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.search_tags TO anon, authenticated;

-- Add comment
COMMENT ON COLUMN public.clips.category IS 'Audio category/genre: storytelling, advice, news, comedy, education, music, interview, podcast, other';
COMMENT ON FUNCTION public.get_popular_tags IS 'Returns popular tags for auto-suggestions, prioritizing recently used tags';
COMMENT ON FUNCTION public.search_tags IS 'Searches tags for autocomplete functionality';

