-- Enhanced Collections Discovery
-- Adds trending algorithm, recommendations, and categories

-- Add category to playlists (collections)
ALTER TABLE public.playlists
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general' CHECK (category IN ('general', 'music', 'comedy', 'storytelling', 'education', 'news', 'entertainment', 'sports', 'tech', 'lifestyle')),
ADD COLUMN IF NOT EXISTS trending_score NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS recommendation_score NUMERIC DEFAULT 0;

-- Create function to calculate trending score for collections
CREATE OR REPLACE FUNCTION public.calculate_collection_trending_score(p_playlist_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  v_follower_count INTEGER := 0;
  v_view_count INTEGER := 0;
  v_clip_count INTEGER := 0;
  v_recent_activity NUMERIC := 0;
  v_score NUMERIC := 0;
BEGIN
  -- Get follower count
  SELECT COUNT(*) INTO v_follower_count
  FROM public.collection_follows
  WHERE playlist_id = p_playlist_id;

  -- Get view count
  SELECT COALESCE(view_count, 0) INTO v_view_count
  FROM public.playlists
  WHERE id = p_playlist_id;

  -- Get clip count
  SELECT COUNT(*) INTO v_clip_count
  FROM public.playlist_clips
  WHERE playlist_id = p_playlist_id;

  -- Calculate recent activity (clips added in last 7 days)
  SELECT COUNT(*) * 5 INTO v_recent_activity
  FROM public.playlist_clips
  WHERE playlist_id = p_playlist_id
    AND created_at >= NOW() - INTERVAL '7 days';

  -- Calculate trending score
  -- Formula: (followers * 2) + (views * 0.1) + (clips * 3) + (recent_activity * 10)
  v_score := (v_follower_count * 2) + (v_view_count * 0.1) + (v_clip_count * 3) + v_recent_activity;

  -- Apply recency boost (decay over time)
  DECLARE
    v_age_days INTEGER;
  BEGIN
    SELECT EXTRACT(DAY FROM (NOW() - updated_at)) INTO v_age_days
    FROM public.playlists
    WHERE id = p_playlist_id;

    IF v_age_days <= 1 THEN
      v_score := v_score * 1.5; -- 50% boost for very recent
    ELSIF v_age_days <= 3 THEN
      v_score := v_score * 1.2; -- 20% boost for recent
    ELSIF v_age_days > 30 THEN
      v_score := v_score * 0.7; -- 30% penalty for old collections
    END IF;
  END;

  RETURN v_score;
END;
$$ LANGUAGE plpgsql STABLE;

-- Create function to update all collection trending scores
CREATE OR REPLACE FUNCTION public.update_collection_trending_scores()
RETURNS INTEGER AS $$
DECLARE
  v_updated_count INTEGER := 0;
  v_playlist RECORD;
BEGIN
  FOR v_playlist IN
    SELECT id FROM public.playlists
    WHERE is_public = true
      AND is_auto_generated = false
  LOOP
    UPDATE public.playlists
    SET trending_score = public.calculate_collection_trending_score(v_playlist.id)
    WHERE id = v_playlist.id;
    
    v_updated_count := v_updated_count + 1;
  END LOOP;

  RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get recommended collections for a user
CREATE OR REPLACE FUNCTION public.get_recommended_collections(
  p_profile_id UUID,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  playlist_id UUID,
  name TEXT,
  description TEXT,
  category TEXT,
  trending_score NUMERIC,
  recommendation_reason TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH user_interests AS (
    -- Get categories of collections user follows
    SELECT DISTINCT p.category
    FROM public.collection_follows cf
    JOIN public.playlists p ON p.id = cf.playlist_id
    WHERE cf.profile_id = p_profile_id
      AND p.category IS NOT NULL
  ),
  recommended AS (
    SELECT 
      p.id as playlist_id,
      p.name,
      p.description,
      p.category,
      p.trending_score,
      CASE
        WHEN EXISTS (SELECT 1 FROM user_interests ui WHERE ui.category = p.category) 
          THEN 'Similar to collections you follow'
        WHEN p.follower_count > 100 THEN 'Popular in the community'
        WHEN p.clip_count > 20 THEN 'Well-curated collection'
        ELSE 'Trending now'
      END as recommendation_reason,
      CASE
        WHEN EXISTS (SELECT 1 FROM user_interests ui WHERE ui.category = p.category) THEN 100
        WHEN p.follower_count > 100 THEN 50
        WHEN p.clip_count > 20 THEN 30
        ELSE p.trending_score
      END as priority_score
    FROM public.playlists p
    WHERE p.is_public = true
      AND p.is_auto_generated = false
      AND NOT EXISTS (
        SELECT 1 FROM public.collection_follows cf
        WHERE cf.playlist_id = p.id
          AND cf.profile_id = p_profile_id
      )
      AND p.profile_id != p_profile_id
  )
  SELECT 
    r.playlist_id,
    r.name,
    r.description,
    r.category,
    r.trending_score,
    r.recommendation_reason
  FROM recommended r
  ORDER BY r.priority_score DESC, r.trending_score DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Create function to get trending collections
CREATE OR REPLACE FUNCTION public.get_trending_collections(
  p_category TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  playlist_id UUID,
  name TEXT,
  description TEXT,
  category TEXT,
  follower_count INTEGER,
  clip_count BIGINT,
  view_count INTEGER,
  trending_score NUMERIC,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id as playlist_id,
    p.name,
    p.description,
    p.category,
    COALESCE(cf_stats.follower_count, 0) as follower_count,
    COALESCE(pc_stats.clip_count, 0) as clip_count,
    COALESCE(p.view_count, 0) as view_count,
    COALESCE(p.trending_score, 0) as trending_score,
    p.updated_at
  FROM public.playlists p
  LEFT JOIN (
    SELECT playlist_id, COUNT(*) as follower_count
    FROM public.collection_follows
    GROUP BY playlist_id
  ) cf_stats ON cf_stats.playlist_id = p.id
  LEFT JOIN (
    SELECT playlist_id, COUNT(*) as clip_count
    FROM public.playlist_clips
    GROUP BY playlist_id
  ) pc_stats ON pc_stats.playlist_id = p.id
  WHERE p.is_public = true
    AND p.is_auto_generated = false
    AND (p_category IS NULL OR p.category = p_category)
  ORDER BY p.trending_score DESC, p.updated_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Trigger to update trending score when collection is updated
CREATE OR REPLACE FUNCTION public.update_collection_trending_score_trigger()
RETURNS TRIGGER AS $$
BEGIN
  NEW.trending_score := public.calculate_collection_trending_score(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_collection_trending_score ON public.playlists;
CREATE TRIGGER trigger_update_collection_trending_score
  BEFORE UPDATE ON public.playlists
  FOR EACH ROW
  WHEN (
    OLD.is_public IS DISTINCT FROM NEW.is_public
    OR OLD.view_count IS DISTINCT FROM NEW.view_count
    OR OLD.updated_at IS DISTINCT FROM NEW.updated_at
  )
  EXECUTE FUNCTION public.update_collection_trending_score_trigger();

-- Trigger to update trending score when clips are added/removed
CREATE OR REPLACE FUNCTION public.update_collection_score_on_clip_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'DELETE' THEN
    UPDATE public.playlists
    SET trending_score = public.calculate_collection_trending_score(
      COALESCE(NEW.playlist_id, OLD.playlist_id)
    ),
    updated_at = NOW()
    WHERE id = COALESCE(NEW.playlist_id, OLD.playlist_id);
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_collection_score_on_clip_change ON public.playlist_clips;
CREATE TRIGGER trigger_update_collection_score_on_clip_change
  AFTER INSERT OR DELETE ON public.playlist_clips
  FOR EACH ROW
  EXECUTE FUNCTION public.update_collection_score_on_clip_change();

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_playlists_category ON public.playlists(category) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_playlists_trending_score ON public.playlists(trending_score DESC) WHERE is_public = true AND is_auto_generated = false;

-- Grant access to functions
GRANT EXECUTE ON FUNCTION public.calculate_collection_trending_score(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_recommended_collections(UUID, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_trending_collections(TEXT, INTEGER) TO authenticated, anon;

COMMENT ON COLUMN public.playlists.category IS 'Category of the collection: general, music, comedy, storytelling, education, news, entertainment, sports, tech, lifestyle';
COMMENT ON COLUMN public.playlists.trending_score IS 'Calculated trending score based on followers, views, clips, and recent activity';
COMMENT ON COLUMN public.playlists.recommendation_score IS 'Score used for personalized recommendations';

