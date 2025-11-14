-- Audio Search by Transcription
-- This migration adds full-text search capabilities to search clips by their transcription/captions
-- Game-changing feature for discovering audio content

-- Add full-text search index on captions
-- This GIN index enables fast full-text search on clip captions
CREATE INDEX IF NOT EXISTS idx_clips_captions_fts 
ON clips USING gin(to_tsvector('english', COALESCE(captions, '')));

-- Create search function that returns matching clip IDs ranked by relevance
-- The function uses PostgreSQL's full-text search capabilities to search transcriptions
CREATE OR REPLACE FUNCTION search_clips_by_text(search_text TEXT)
RETURNS TABLE(clip_id UUID, rank REAL) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id, 
    ts_rank(
      to_tsvector('english', COALESCE(c.captions, '')), 
      plainto_tsquery('english', search_text)
    ) as rank
  FROM clips c
  WHERE c.status = 'live'
    AND c.captions IS NOT NULL
    AND c.captions != ''
    AND to_tsvector('english', COALESCE(c.captions, '')) @@ plainto_tsquery('english', search_text)
  ORDER BY rank DESC
  LIMIT 100;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission to authenticated and anonymous users
GRANT EXECUTE ON FUNCTION search_clips_by_text(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION search_clips_by_text(TEXT) TO authenticated;

