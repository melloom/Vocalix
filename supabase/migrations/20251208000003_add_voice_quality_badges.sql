-- Voice Quality Badges Feature
-- This migration adds support for:
-- 1. Audio quality analysis (volume, clarity, noise)
-- 2. Quality score and badge assignment
-- 3. Quality metrics storage

-- ============================================================================
-- QUALITY FIELDS
-- ============================================================================

-- Add quality fields to clips table
ALTER TABLE public.clips
ADD COLUMN IF NOT EXISTS quality_score NUMERIC(3,1) DEFAULT NULL CHECK (quality_score >= 0 AND quality_score <= 10),
ADD COLUMN IF NOT EXISTS quality_badge TEXT DEFAULT NULL CHECK (quality_badge IN ('excellent', 'good', 'fair', NULL)),
ADD COLUMN IF NOT EXISTS quality_metrics JSONB DEFAULT NULL; -- Stores detailed metrics: {volume, clarity, noise_level}

-- Create index for quality badge filtering
CREATE INDEX IF NOT EXISTS idx_clips_quality_badge ON public.clips(quality_badge) WHERE quality_badge IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clips_quality_score ON public.clips(quality_score) WHERE quality_score IS NOT NULL;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to calculate quality badge from score
CREATE OR REPLACE FUNCTION public.calculate_quality_badge(score NUMERIC)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF score IS NULL THEN
    RETURN NULL;
  ELSIF score >= 8.0 THEN
    RETURN 'excellent';
  ELSIF score >= 6.0 THEN
    RETURN 'good';
  ELSIF score >= 4.0 THEN
    RETURN 'fair';
  ELSE
    RETURN NULL; -- No badge for low quality
  END IF;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.calculate_quality_badge TO authenticated, anon;

-- ============================================================================
-- UPDATE SEARCH FUNCTION
-- ============================================================================

-- Update search_clips_enhanced to support quality badge filtering
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
    -- Quality badge filter
    AND (quality_badge_filter IS NULL OR c.quality_badge = quality_badge_filter)
  ORDER BY rank DESC, c.created_at DESC
  LIMIT limit_results;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission to authenticated and anonymous users
GRANT EXECUTE ON FUNCTION search_clips_enhanced(TEXT, INT, INT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, UUID, INT, INT, TEXT, INT) TO anon;
GRANT EXECUTE ON FUNCTION search_clips_enhanced(TEXT, INT, INT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, UUID, INT, INT, TEXT, INT) TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN public.clips.quality_score IS 'Audio quality score (0-10): based on volume, clarity, and noise level';
COMMENT ON COLUMN public.clips.quality_badge IS 'Quality badge: excellent (8+), good (6-7.9), fair (4-5.9)';
COMMENT ON COLUMN public.clips.quality_metrics IS 'Detailed quality metrics: {volume: 0-1, clarity: 0-1, noise_level: 0-1}';

