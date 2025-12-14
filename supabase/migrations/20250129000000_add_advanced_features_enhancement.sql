-- Advanced Features Enhancement
-- Adds multiple high-value features to enhance the platform

-- ============================================================================
-- 1. CONTENT SERIES & EPISODES (Podcast-like functionality)
-- ============================================================================

-- Create series table for podcast-like content
CREATE TABLE IF NOT EXISTS public.series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  cover_image_url TEXT,
  category TEXT,
  is_public BOOLEAN DEFAULT true,
  episode_count INTEGER DEFAULT 0,
  total_listens INTEGER DEFAULT 0,
  follower_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.series ENABLE ROW LEVEL SECURITY;

-- RLS policies for series
CREATE POLICY "Series are viewable by everyone if public"
ON public.series FOR SELECT
USING (is_public = true OR profile_id IN (
  SELECT id FROM public.profiles 
  WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
));

CREATE POLICY "Users can create their own series"
ON public.series FOR INSERT
WITH CHECK (
  profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

CREATE POLICY "Users can update their own series"
ON public.series FOR UPDATE
USING (
  profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Add series_id to clips table
ALTER TABLE public.clips
ADD COLUMN IF NOT EXISTS series_id UUID REFERENCES public.series(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS episode_number INTEGER;

-- Create series_follows table
CREATE TABLE IF NOT EXISTS public.series_follows (
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  series_id UUID REFERENCES public.series(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (profile_id, series_id)
);

ALTER TABLE public.series_follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Series follows are viewable by everyone"
ON public.series_follows FOR SELECT
USING (true);

CREATE POLICY "Users can follow/unfollow series"
ON public.series_follows FOR ALL
USING (
  profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Indexes for series
CREATE INDEX IF NOT EXISTS idx_series_profile_id ON public.series(profile_id);
CREATE INDEX IF NOT EXISTS idx_series_public ON public.series(is_public, created_at DESC) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_clips_series_id ON public.clips(series_id) WHERE series_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_series_follows_profile ON public.series_follows(profile_id);
CREATE INDEX IF NOT EXISTS idx_series_follows_series ON public.series_follows(series_id);

-- Function to update series stats
CREATE OR REPLACE FUNCTION public.update_series_stats()
RETURNS TRIGGER AS $$
DECLARE
  v_series_id UUID;
BEGIN
  -- Determine which series_id to update based on operation
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    v_series_id := NEW.series_id;
    -- Also update old series if series_id changed
    IF TG_OP = 'UPDATE' AND OLD.series_id IS DISTINCT FROM NEW.series_id AND OLD.series_id IS NOT NULL THEN
      UPDATE public.series
      SET 
        episode_count = (
          SELECT COUNT(*) FROM public.clips 
          WHERE series_id = OLD.series_id AND status = 'live'
        ),
        total_listens = (
          SELECT COALESCE(SUM(listens_count), 0) FROM public.clips 
          WHERE series_id = OLD.series_id AND status = 'live'
        ),
        updated_at = NOW()
      WHERE id = OLD.series_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    v_series_id := OLD.series_id;
  END IF;
  
  -- Update series stats if series_id exists
  IF v_series_id IS NOT NULL THEN
    UPDATE public.series
    SET 
      episode_count = (
        SELECT COUNT(*) FROM public.clips 
        WHERE series_id = v_series_id AND status = 'live'
      ),
      total_listens = (
        SELECT COALESCE(SUM(listens_count), 0) FROM public.clips 
        WHERE series_id = v_series_id AND status = 'live'
      ),
      updated_at = NOW()
    WHERE id = v_series_id;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_series_stats
  AFTER INSERT OR UPDATE OR DELETE ON public.clips
  FOR EACH ROW
  EXECUTE FUNCTION public.update_series_stats();

-- Function to get series with episodes
CREATE OR REPLACE FUNCTION public.get_series_with_episodes(
  p_series_id UUID,
  p_profile_id UUID DEFAULT NULL
)
RETURNS TABLE (
  series_data JSONB,
  episodes JSONB[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    jsonb_build_object(
      'id', s.id,
      'title', s.title,
      'description', s.description,
      'cover_image_url', s.cover_image_url,
      'category', s.category,
      'episode_count', s.episode_count,
      'total_listens', s.total_listens,
      'follower_count', s.follower_count,
      'is_following', CASE 
        WHEN p_profile_id IS NOT NULL THEN EXISTS(
          SELECT 1 FROM public.series_follows 
          WHERE series_id = s.id AND profile_id = p_profile_id
        )
        ELSE false
      END,
      'created_at', s.created_at
    ) as series_data,
    ARRAY(
      SELECT jsonb_build_object(
        'id', c.id,
        'title', c.title,
        'episode_number', c.episode_number,
        'duration_seconds', c.duration_seconds,
        'listens_count', c.listens_count,
        'created_at', c.created_at
      )
      FROM public.clips c
      WHERE c.series_id = s.id AND c.status = 'live'
      ORDER BY c.episode_number ASC, c.created_at ASC
    ) as episodes
  FROM public.series s
  WHERE s.id = p_series_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================================
-- 2. ADVANCED REMIX FEATURES
-- ============================================================================

-- Create remix_analytics table to track remix performance
CREATE TABLE IF NOT EXISTS public.remix_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  remix_clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE NOT NULL,
  original_clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE NOT NULL,
  remix_creator_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  original_creator_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  remix_listens INTEGER DEFAULT 0,
  original_listens_from_remix INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(remix_clip_id, original_clip_id)
);

ALTER TABLE public.remix_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Remix analytics are viewable by everyone"
ON public.remix_analytics FOR SELECT
USING (true);

-- Function to track remix listens
CREATE OR REPLACE FUNCTION public.track_remix_listen(
  p_remix_clip_id UUID,
  p_original_clip_id UUID
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.remix_analytics (
    remix_clip_id,
    original_clip_id,
    remix_creator_id,
    original_creator_id
  )
  SELECT 
    c1.id,
    c2.id,
    c1.profile_id,
    c2.profile_id
  FROM public.clips c1
  CROSS JOIN public.clips c2
  WHERE c1.id = p_remix_clip_id AND c2.id = p_original_clip_id
  ON CONFLICT (remix_clip_id, original_clip_id) 
  DO UPDATE SET 
    remix_listens = remix_analytics.remix_listens + 1,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get remix chain
CREATE OR REPLACE FUNCTION public.get_remix_chain(
  p_clip_id UUID
)
RETURNS TABLE (
  clip_id UUID,
  is_original BOOLEAN,
  depth INTEGER,
  remix_path UUID[]
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE remix_tree AS (
    -- Start with the original clip
    SELECT 
      id,
      remix_of_clip_id,
      0 as depth,
      ARRAY[id] as path,
      false as is_remix
    FROM public.clips
    WHERE id = p_clip_id
    
    UNION ALL
    
    -- Find all remixes of this clip
    SELECT 
      c.id,
      c.remix_of_clip_id,
      rt.depth + 1,
      rt.path || c.id,
      true
    FROM public.clips c
    INNER JOIN remix_tree rt ON c.remix_of_clip_id = rt.id
    WHERE c.id != ALL(rt.path) -- Prevent cycles
  )
  SELECT 
    id as clip_id,
    is_remix,
    depth,
    path as remix_path
  FROM remix_tree
  ORDER BY depth, id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================================
-- 3. ADVANCED SEARCH & FILTERS
-- ============================================================================

-- Create saved_search_filters table
CREATE TABLE IF NOT EXISTS public.saved_search_filters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  search_query TEXT,
  filters JSONB DEFAULT '{}'::jsonb, -- {topics: [], tags: [], duration_min: 0, duration_max: 30, ...}
  created_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.saved_search_filters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own saved filters"
ON public.saved_search_filters FOR ALL
USING (
  profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Function for advanced clip search with filters
CREATE OR REPLACE FUNCTION public.search_clips_advanced(
  p_query TEXT DEFAULT NULL,
  p_topic_ids UUID[] DEFAULT NULL,
  p_tags TEXT[] DEFAULT NULL,
  p_profile_ids UUID[] DEFAULT NULL,
  p_duration_min INTEGER DEFAULT NULL,
  p_duration_max INTEGER DEFAULT NULL,
  p_date_from TIMESTAMPTZ DEFAULT NULL,
  p_date_to TIMESTAMPTZ DEFAULT NULL,
  p_min_listens INTEGER DEFAULT NULL,
  p_min_completion_rate NUMERIC DEFAULT NULL,
  p_has_voice_reactions BOOLEAN DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  clip_id UUID,
  relevance_score NUMERIC,
  clip_data JSONB
) AS $$
BEGIN
  RETURN QUERY
  WITH filtered_clips AS (
    SELECT 
      c.*,
      CASE 
        WHEN p_query IS NOT NULL THEN
          ts_rank(to_tsvector('english', COALESCE(c.title, '') || ' ' || COALESCE(c.captions, '') || ' ' || COALESCE(c.summary, '')), 
                  plainto_tsquery('english', p_query))
        ELSE 1.0
      END as text_relevance,
      CASE 
        WHEN p_min_completion_rate IS NOT NULL AND c.completion_rate < p_min_completion_rate THEN 0
        ELSE 1.0
      END as completion_match
    FROM public.clips c
    WHERE c.status = 'live'
      AND (p_topic_ids IS NULL OR c.topic_id = ANY(p_topic_ids))
      AND (p_tags IS NULL OR c.tags && p_tags)
      AND (p_profile_ids IS NULL OR c.profile_id = ANY(p_profile_ids))
      AND (p_duration_min IS NULL OR c.duration_seconds >= p_duration_min)
      AND (p_duration_max IS NULL OR c.duration_seconds <= p_duration_max)
      AND (p_date_from IS NULL OR c.created_at >= p_date_from)
      AND (p_date_to IS NULL OR c.created_at <= p_date_to)
      AND (p_min_listens IS NULL OR c.listens_count >= p_min_listens)
      AND (p_has_voice_reactions IS NULL OR EXISTS(
        SELECT 1 FROM public.voice_reactions vr WHERE vr.clip_id = c.id
      ))
  )
  SELECT 
    fc.id as clip_id,
    (fc.text_relevance * fc.completion_match * COALESCE(fc.trending_score, 0) / 1000.0) as relevance_score,
    jsonb_build_object(
      'id', fc.id,
      'title', fc.title,
      'profile_id', fc.profile_id,
      'audio_path', fc.audio_path,
      'duration_seconds', fc.duration_seconds,
      'listens_count', fc.listens_count,
      'trending_score', fc.trending_score,
      'created_at', fc.created_at
    ) as clip_data
  FROM filtered_clips fc
  WHERE fc.completion_match > 0
  ORDER BY relevance_score DESC, fc.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================================
-- 4. CONTENT SCHEDULING ENHANCEMENTS
-- ============================================================================

-- Add scheduling fields to clips if not exists
ALTER TABLE public.clips
ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC';

-- Create index for scheduled clips
CREATE INDEX IF NOT EXISTS idx_clips_scheduled ON public.clips(scheduled_for, status) 
WHERE scheduled_for IS NOT NULL AND status = 'processing';

-- Function to get upcoming scheduled clips
CREATE OR REPLACE FUNCTION public.get_scheduled_clips(
  p_profile_id UUID,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  clip_id UUID,
  title TEXT,
  scheduled_for TIMESTAMPTZ,
  timezone TEXT,
  status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.title,
    c.scheduled_for,
    c.timezone,
    c.status
  FROM public.clips c
  WHERE c.profile_id = p_profile_id
    AND c.scheduled_for IS NOT NULL
    AND c.scheduled_for > NOW()
    AND c.status = 'processing'
  ORDER BY c.scheduled_for ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================================
-- 5. ANALYTICS EXPORT & REPORTING
-- ============================================================================

-- Create analytics_exports table
CREATE TABLE IF NOT EXISTS public.analytics_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  export_type TEXT NOT NULL CHECK (export_type IN ('clips', 'listens', 'engagement', 'full')),
  format TEXT NOT NULL CHECK (format IN ('csv', 'json')),
  file_path TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE public.analytics_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own exports"
ON public.analytics_exports FOR SELECT
USING (
  profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Function to generate analytics report
CREATE OR REPLACE FUNCTION public.generate_analytics_report(
  p_profile_id UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ,
  p_export_type TEXT DEFAULT 'full'
)
RETURNS JSONB AS $$
DECLARE
  v_report JSONB;
BEGIN
  SELECT jsonb_build_object(
    'profile_id', p_profile_id,
    'period', jsonb_build_object('start', p_start_date, 'end', p_end_date),
    'clips', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id,
        'title', c.title,
        'created_at', c.created_at,
        'listens_count', c.listens_count,
        'completion_rate', c.completion_rate,
        'reactions', c.reactions,
        'trending_score', c.trending_score
      ))
      FROM public.clips c
      WHERE c.profile_id = p_profile_id
        AND c.created_at BETWEEN p_start_date AND p_end_date
        AND c.status = 'live'
    ),
    'summary', (
      SELECT jsonb_build_object(
        'total_clips', COUNT(*),
        'total_listens', COALESCE(SUM(listens_count), 0),
        'avg_completion_rate', COALESCE(AVG(completion_rate), 0),
        'total_reactions', (
          SELECT COALESCE(SUM((reactions->>'🔥')::int + (reactions->>'❤️')::int + (reactions->>'😊')::int), 0)
          FROM public.clips
          WHERE profile_id = p_profile_id
            AND created_at BETWEEN p_start_date AND p_end_date
        )
      )
      FROM public.clips
      WHERE profile_id = p_profile_id
        AND created_at BETWEEN p_start_date AND p_end_date
        AND status = 'live'
    )
  ) INTO v_report;
  
  RETURN v_report;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================================
-- 6. SMART NOTIFICATIONS ENHANCEMENT
-- ============================================================================

-- Add notification preferences to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{
  "mentions": true,
  "follows": true,
  "reactions": true,
  "comments": true,
  "remixes": true,
  "digest": true,
  "quiet_hours_start": null,
  "quiet_hours_end": null
}'::jsonb;

-- Function to get smart notification digest
CREATE OR REPLACE FUNCTION public.get_smart_notification_digest(
  p_profile_id UUID,
  p_since TIMESTAMPTZ DEFAULT NOW() - INTERVAL '24 hours'
)
RETURNS JSONB AS $$
DECLARE
  v_digest JSONB;
BEGIN
  SELECT jsonb_build_object(
    'unread_count', (
      SELECT COUNT(*) FROM public.notifications
      WHERE profile_id = p_profile_id
        AND read_at IS NULL
        AND created_at >= p_since
    ),
    'by_type', (
      SELECT jsonb_object_agg(
        type,
        COUNT(*)
      )
      FROM public.notifications
      WHERE profile_id = p_profile_id
        AND read_at IS NULL
        AND created_at >= p_since
      GROUP BY type
    ),
    'priority_notifications', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', id,
        'type', type,
        'message', message,
        'created_at', created_at
      ))
      FROM public.notifications
      WHERE profile_id = p_profile_id
        AND read_at IS NULL
        AND created_at >= p_since
        AND type IN ('mention', 'follow')
      ORDER BY created_at DESC
      LIMIT 5
    )
  ) INTO v_digest;
  
  RETURN v_digest;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================================
-- 7. CLIP EXPORT FUNCTIONALITY
-- ============================================================================

-- Create clip_exports table
CREATE TABLE IF NOT EXISTS public.clip_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE NOT NULL,
  export_format TEXT NOT NULL CHECK (export_format IN ('audio', 'transcript', 'both')),
  file_path TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE public.clip_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can export their own clips"
ON public.clip_exports FOR ALL
USING (
  profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
  OR clip_id IN (
    SELECT id FROM public.clips 
    WHERE profile_id IN (
      SELECT id FROM public.profiles 
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
);

-- ============================================================================
-- 8. GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.get_series_with_episodes(UUID, UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.track_remix_listen(UUID, UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_remix_chain(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.search_clips_advanced(TEXT, UUID[], TEXT[], UUID[], INTEGER, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, NUMERIC, BOOLEAN, INTEGER, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_scheduled_clips(UUID, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.generate_analytics_report(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_smart_notification_digest(UUID, TIMESTAMPTZ) TO authenticated, anon;

-- ============================================================================
-- 9. COMMENTS
-- ============================================================================

COMMENT ON TABLE public.series IS 'Podcast-like series for organizing related clips into episodes';
COMMENT ON TABLE public.remix_analytics IS 'Tracks remix performance and cross-promotion between original and remix clips';
COMMENT ON TABLE public.saved_search_filters IS 'User-saved search filters for quick access to filtered content';
COMMENT ON TABLE public.analytics_exports IS 'Tracks analytics export requests and generated reports';
COMMENT ON TABLE public.clip_exports IS 'Tracks clip export requests (audio, transcript, or both)';

