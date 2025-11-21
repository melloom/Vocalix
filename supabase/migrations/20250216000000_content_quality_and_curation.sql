-- Content Quality & Curation Features Migration
-- Implements Priority 10: Content Quality & Curation
-- This migration adds:
-- 1. Enhanced quality scoring with multi-factor metrics
-- 2. Content curation system (Editor's picks, Featured clips, Collections)
-- 3. Community curation tools for moderators
-- 4. Algorithmic curation with diversity signals
-- 5. Quality-based feed ranking

-- ============================================================================
-- PART 1: ENHANCED QUALITY SCORING SYSTEM
-- ============================================================================

-- 1.1 Enhanced quality metrics table
CREATE TABLE IF NOT EXISTS public.clip_quality_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id UUID NOT NULL REFERENCES public.clips(id) ON DELETE CASCADE,
  -- Audio quality metrics (0-1 scale)
  audio_clarity NUMERIC(3, 2) CHECK (audio_clarity >= 0 AND audio_clarity <= 1),
  volume_consistency NUMERIC(3, 2) CHECK (volume_consistency >= 0 AND volume_consistency <= 1),
  noise_level NUMERIC(3, 2) CHECK (noise_level >= 0 AND noise_level <= 1),
  -- Content quality metrics
  has_intro BOOLEAN DEFAULT false,
  has_body BOOLEAN DEFAULT false,
  has_conclusion BOOLEAN DEFAULT false,
  content_structure_score NUMERIC(3, 2) CHECK (content_structure_score >= 0 AND content_structure_score <= 1),
  -- Engagement metrics
  completion_rate NUMERIC(5, 2) CHECK (completion_rate >= 0 AND completion_rate <= 100),
  avg_engagement_score NUMERIC(5, 2) DEFAULT 0,
  -- Community validation
  upvote_ratio NUMERIC(3, 2) CHECK (upvote_ratio >= 0 AND upvote_ratio <= 1),
  share_count INTEGER DEFAULT 0,
  -- Overall quality score (1-10)
  overall_quality_score NUMERIC(3, 1) CHECK (overall_quality_score >= 0 AND overall_quality_score <= 10),
  quality_badge TEXT CHECK (quality_badge IN ('excellent', 'good', 'fair', 'poor', NULL)),
  -- Quality improvement suggestions
  improvement_suggestions TEXT[],
  -- Metadata
  analyzed_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(clip_id)
);

CREATE INDEX IF NOT EXISTS idx_clip_quality_metrics_clip ON public.clip_quality_metrics(clip_id);
CREATE INDEX IF NOT EXISTS idx_clip_quality_metrics_score ON public.clip_quality_metrics(overall_quality_score DESC) WHERE overall_quality_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clip_quality_metrics_badge ON public.clip_quality_metrics(quality_badge) WHERE quality_badge IS NOT NULL;

ALTER TABLE public.clip_quality_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Quality metrics viewable by everyone for live clips" ON public.clip_quality_metrics;
CREATE POLICY "Quality metrics viewable by everyone for live clips"
ON public.clip_quality_metrics FOR SELECT
USING (
  clip_id IN (SELECT id FROM public.clips WHERE status = 'live')
  OR clip_id IN (
    SELECT c.id FROM public.clips c
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- 1.2 Function to calculate multi-factor quality score
CREATE OR REPLACE FUNCTION public.calculate_quality_score(
  p_clip_id UUID
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_clip RECORD;
  v_metrics RECORD;
  v_score NUMERIC := 0;
  v_audio_score NUMERIC := 0;
  v_content_score NUMERIC := 0;
  v_engagement_score NUMERIC := 0;
  v_community_score NUMERIC := 0;
  v_total_listens INTEGER;
  v_total_completion NUMERIC;
  v_reaction_sum INTEGER;
BEGIN
  -- Get clip data
  SELECT * INTO v_clip
  FROM public.clips
  WHERE id = p_clip_id AND status = 'live';
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Get existing metrics or create new
  SELECT * INTO v_metrics
  FROM public.clip_quality_metrics
  WHERE clip_id = p_clip_id;
  
  -- Calculate audio quality score (30% weight)
  IF v_metrics IS NOT NULL THEN
    v_audio_score := COALESCE(v_metrics.audio_clarity, 0.5) * 0.4 +
                     COALESCE(v_metrics.volume_consistency, 0.5) * 0.3 +
                     (1.0 - COALESCE(v_metrics.noise_level, 0.5)) * 0.3;
  ELSE
    -- Default audio score if no metrics
    v_audio_score := 0.5;
  END IF;
  
  -- Calculate content structure score (25% weight)
  IF v_metrics IS NOT NULL THEN
    v_content_score := COALESCE(v_metrics.content_structure_score, 
      CASE 
        WHEN v_metrics.has_intro AND v_metrics.has_body THEN 0.7
        WHEN v_metrics.has_body THEN 0.5
        ELSE 0.3
      END);
  ELSE
    v_content_score := 0.5;
  END IF;
  
  -- Calculate engagement score (25% weight)
  SELECT 
    COUNT(*)::INTEGER,
    AVG(
      CASE 
        WHEN l.completion_percentage IS NOT NULL THEN l.completion_percentage
        WHEN v_clip.duration_seconds > 0 THEN (l.seconds::NUMERIC / v_clip.duration_seconds::NUMERIC * 100)
        ELSE 0
      END
    )::NUMERIC
  INTO v_total_listens, v_total_completion
  FROM public.listens l
  WHERE l.clip_id = p_clip_id;
  
  -- Reaction engagement
  SELECT COALESCE(SUM((value::text)::int), 0)::INTEGER
  INTO v_reaction_sum
  FROM jsonb_each(v_clip.reactions);
  
  -- Normalize engagement (completion rate + reactions)
  v_engagement_score := LEAST(
    COALESCE(v_total_completion / 100.0, 0) * 0.6 +
    LEAST(v_reaction_sum / 50.0, 1.0) * 0.4,
    1.0
  );
  
  -- Calculate community validation score (20% weight)
  -- Based on upvote ratio and share count
  IF v_metrics IS NOT NULL THEN
    v_community_score := COALESCE(v_metrics.upvote_ratio, 0.5) * 0.7 +
                         LEAST(COALESCE(v_metrics.share_count, 0) / 10.0, 1.0) * 0.3;
  ELSE
    v_community_score := 0.5;
  END IF;
  
  -- Weighted overall score (scale to 1-10)
  v_score := (
    v_audio_score * 0.30 +
    v_content_score * 0.25 +
    v_engagement_score * 0.25 +
    v_community_score * 0.20
  ) * 10.0;
  
  -- Ensure score is between 0 and 10
  v_score := GREATEST(0, LEAST(10, v_score));
  
  RETURN ROUND(v_score, 1);
END;
$$;

-- 1.3 Function to update quality badge based on score
CREATE OR REPLACE FUNCTION public.update_quality_badge(p_clip_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_score NUMERIC;
  v_badge TEXT;
BEGIN
  v_score := public.calculate_quality_score(p_clip_id);
  
  IF v_score IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Determine badge
  IF v_score >= 8.0 THEN
    v_badge := 'excellent';
  ELSIF v_score >= 6.0 THEN
    v_badge := 'good';
  ELSIF v_score >= 4.0 THEN
    v_badge := 'fair';
  ELSE
    v_badge := 'poor';
  END IF;
  
  -- Update clip quality badge
  UPDATE public.clips
  SET quality_badge = v_badge,
      quality_score = v_score
  WHERE id = p_clip_id;
  
  -- Update metrics table
  INSERT INTO public.clip_quality_metrics (clip_id, overall_quality_score, quality_badge)
  VALUES (p_clip_id, v_score, v_badge)
  ON CONFLICT (clip_id) 
  DO UPDATE SET 
    overall_quality_score = v_score,
    quality_badge = v_badge,
    updated_at = now();
  
  RETURN v_badge;
END;
$$;

-- 1.4 Function to generate quality improvement suggestions
CREATE OR REPLACE FUNCTION public.generate_quality_suggestions(p_clip_id UUID)
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_metrics RECORD;
  v_suggestions TEXT[] := '{}';
BEGIN
  SELECT * INTO v_metrics
  FROM public.clip_quality_metrics
  WHERE clip_id = p_clip_id;
  
  IF NOT FOUND THEN
    RETURN ARRAY['No quality metrics available for analysis'];
  END IF;
  
  -- Audio quality suggestions
  IF COALESCE(v_metrics.audio_clarity, 0) < 0.7 THEN
    v_suggestions := array_append(v_suggestions, 'Improve audio clarity: record in a quieter environment or use noise reduction');
  END IF;
  
  IF COALESCE(v_metrics.noise_level, 0) > 0.3 THEN
    v_suggestions := array_append(v_suggestions, 'Reduce background noise for better audio quality');
  END IF;
  
  IF COALESCE(v_metrics.volume_consistency, 0) < 0.7 THEN
    v_suggestions := array_append(v_suggestions, 'Normalize audio volume for consistency');
  END IF;
  
  -- Content structure suggestions
  IF NOT COALESCE(v_metrics.has_intro, false) THEN
    v_suggestions := array_append(v_suggestions, 'Add an introduction to engage listeners from the start');
  END IF;
  
  IF NOT COALESCE(v_metrics.has_body, false) THEN
    v_suggestions := array_append(v_suggestions, 'Ensure your clip has a clear main message or story');
  END IF;
  
  IF NOT COALESCE(v_metrics.has_conclusion, false) THEN
    v_suggestions := array_append(v_suggestions, 'Add a conclusion or wrap-up to provide closure');
  END IF;
  
  -- Engagement suggestions
  IF COALESCE(v_metrics.completion_rate, 0) < 50 THEN
    v_suggestions := array_append(v_suggestions, 'Work on improving listener retention - consider shorter clips or more engaging content');
  END IF;
  
  -- Update suggestions in metrics
  UPDATE public.clip_quality_metrics
  SET improvement_suggestions = v_suggestions,
      updated_at = now()
  WHERE clip_id = p_clip_id;
  
  RETURN v_suggestions;
END;
$$;

-- ============================================================================
-- PART 2: CONTENT CURATION SYSTEM
-- ============================================================================

-- 2.1 Editor's picks table
CREATE TABLE IF NOT EXISTS public.editors_picks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id UUID NOT NULL REFERENCES public.clips(id) ON DELETE CASCADE,
  editor_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  pick_date DATE NOT NULL,
  reason TEXT,
  featured_until TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(clip_id, pick_date)
);

CREATE INDEX IF NOT EXISTS idx_editors_picks_date ON public.editors_picks(pick_date DESC, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_editors_picks_clip ON public.editors_picks(clip_id);
CREATE INDEX IF NOT EXISTS idx_editors_picks_active ON public.editors_picks(is_active, featured_until) WHERE is_active = true;

ALTER TABLE public.editors_picks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Editors picks viewable by everyone" ON public.editors_picks;
CREATE POLICY "Editors picks viewable by everyone"
ON public.editors_picks FOR SELECT
USING (
  is_active = true 
  AND (featured_until IS NULL OR featured_until > now())
  AND clip_id IN (SELECT id FROM public.clips WHERE status = 'live')
);

DROP POLICY IF EXISTS "Editors picks manageable by admins" ON public.editors_picks;
CREATE POLICY "Editors picks manageable by admins"
ON public.editors_picks FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.admins a ON a.profile_id = p.id
    WHERE p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- 2.2 Featured clips table (daily featured clips)
CREATE TABLE IF NOT EXISTS public.featured_clips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id UUID NOT NULL REFERENCES public.clips(id) ON DELETE CASCADE,
  featured_type TEXT NOT NULL CHECK (featured_type IN ('daily_homepage', 'topic', 'community', 'creator_spotlight')),
  featured_for_id UUID, -- Can be topic_id, community_id, or profile_id depending on type
  featured_date DATE NOT NULL,
  featured_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason TEXT,
  featured_until TIMESTAMPTZ,
  priority INTEGER DEFAULT 0, -- Higher priority shown first
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(clip_id, featured_type, featured_date, featured_for_id)
);

CREATE INDEX IF NOT EXISTS idx_featured_clips_type_date ON public.featured_clips(featured_type, featured_date DESC, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_featured_clips_clip ON public.featured_clips(clip_id);
CREATE INDEX IF NOT EXISTS idx_featured_clips_for_id ON public.featured_clips(featured_type, featured_for_id) WHERE featured_for_id IS NOT NULL;

ALTER TABLE public.featured_clips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Featured clips viewable by everyone" ON public.featured_clips;
CREATE POLICY "Featured clips viewable by everyone"
ON public.featured_clips FOR SELECT
USING (
  is_active = true 
  AND (featured_until IS NULL OR featured_until > now())
  AND clip_id IN (SELECT id FROM public.clips WHERE status = 'live')
);

DROP POLICY IF EXISTS "Featured clips manageable by admins and moderators" ON public.featured_clips;
CREATE POLICY "Featured clips manageable by admins and moderators"
ON public.featured_clips FOR ALL
USING (
  -- Admins can manage all
  EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.admins a ON a.profile_id = p.id
    WHERE p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
  OR
  -- Moderators can feature in their communities
  (
    featured_type = 'community' 
    AND featured_for_id IN (
      SELECT community_id FROM public.community_moderators cm
      JOIN public.profiles p ON p.id = cm.moderator_profile_id
      WHERE p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
);

-- 2.3 Curated collections table
CREATE TABLE IF NOT EXISTS public.curated_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  collection_type TEXT NOT NULL CHECK (collection_type IN ('themed', 'topic_deep_dive', 'creator_spotlight', 'event_based', 'best_of', 'trending_highlights')),
  theme TEXT, -- For themed collections
  curator_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  cover_image_url TEXT,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  display_order INTEGER DEFAULT 0,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_curated_collections_type ON public.curated_collections(collection_type, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_curated_collections_featured ON public.curated_collections(is_featured, display_order) WHERE is_featured = true;

ALTER TABLE public.curated_collections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Curated collections viewable by everyone when active" ON public.curated_collections;
CREATE POLICY "Curated collections viewable by everyone when active"
ON public.curated_collections FOR SELECT
USING (
  is_active = true 
  AND (starts_at IS NULL OR starts_at <= now())
  AND (ends_at IS NULL OR ends_at > now())
);

DROP POLICY IF EXISTS "Curated collections manageable by admins" ON public.curated_collections;
CREATE POLICY "Curated collections manageable by admins"
ON public.curated_collections FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.admins a ON a.profile_id = p.id
    WHERE p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- 2.4 Collection clips (many-to-many relationship)
CREATE TABLE IF NOT EXISTS public.collection_clips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES public.curated_collections(id) ON DELETE CASCADE,
  clip_id UUID NOT NULL REFERENCES public.clips(id) ON DELETE CASCADE,
  display_order INTEGER DEFAULT 0,
  added_note TEXT, -- Why this clip was added to the collection
  added_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  added_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(collection_id, clip_id)
);

CREATE INDEX IF NOT EXISTS idx_collection_clips_collection ON public.collection_clips(collection_id, display_order);
CREATE INDEX IF NOT EXISTS idx_collection_clips_clip ON public.collection_clips(clip_id);

ALTER TABLE public.collection_clips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Collection clips viewable by everyone" ON public.collection_clips;
CREATE POLICY "Collection clips viewable by everyone"
ON public.collection_clips FOR SELECT
USING (
  collection_id IN (
    SELECT id FROM public.curated_collections WHERE is_active = true
  )
  AND clip_id IN (SELECT id FROM public.clips WHERE status = 'live')
);

DROP POLICY IF EXISTS "Collection clips manageable by admins" ON public.collection_clips;
CREATE POLICY "Collection clips manageable by admins"
ON public.collection_clips FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.admins a ON a.profile_id = p.id
    WHERE p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- ============================================================================
-- PART 3: COMMUNITY CURATION TOOLS
-- ============================================================================

-- 3.1 Community featured clips (moderators can feature clips in communities)
CREATE TABLE IF NOT EXISTS public.community_featured_clips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  clip_id UUID NOT NULL REFERENCES public.clips(id) ON DELETE CASCADE,
  featured_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  featured_date DATE NOT NULL,
  reason TEXT,
  is_pinned BOOLEAN NOT NULL DEFAULT false, -- Pinned clips appear at top
  featured_until TIMESTAMPTZ,
  priority INTEGER DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(community_id, clip_id, featured_date)
);

CREATE INDEX IF NOT EXISTS idx_community_featured_community ON public.community_featured_clips(community_id, featured_date DESC, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_community_featured_pinned ON public.community_featured_clips(community_id, is_pinned, priority DESC) WHERE is_pinned = true AND is_active = true;

ALTER TABLE public.community_featured_clips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Community featured clips viewable by everyone" ON public.community_featured_clips;
CREATE POLICY "Community featured clips viewable by everyone"
ON public.community_featured_clips FOR SELECT
USING (
  is_active = true 
  AND (featured_until IS NULL OR featured_until > now())
  AND clip_id IN (SELECT id FROM public.clips WHERE status = 'live')
  AND (
    community_id IN (SELECT id FROM public.communities WHERE is_public = true)
    OR community_id IN (
      SELECT community_id FROM public.community_members cm
      JOIN public.profiles p ON p.id = cm.profile_id
      WHERE p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
);

DROP POLICY IF EXISTS "Community featured clips manageable by moderators" ON public.community_featured_clips;
CREATE POLICY "Community featured clips manageable by moderators"
ON public.community_featured_clips FOR ALL
USING (
  public.is_community_host(community_id, (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  ))
  OR public.moderator_has_permission(
    community_id,
    (SELECT id FROM public.profiles
     WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'),
    'manage_content'
  )
);

-- 3.2 Community collections (moderator-curated playlists)
CREATE TABLE IF NOT EXISTS public.community_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  collection_type TEXT NOT NULL CHECK (collection_type IN ('moderator_curated', 'community_favorites', 'community_milestones', 'events_archive', 'highlights')),
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_community_collections_community ON public.community_collections(community_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_collections_featured ON public.community_collections(community_id, is_featured, display_order) WHERE is_featured = true;

ALTER TABLE public.community_collections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Community collections viewable by community members" ON public.community_collections;
CREATE POLICY "Community collections viewable by community members"
ON public.community_collections FOR SELECT
USING (
  community_id IN (SELECT id FROM public.communities WHERE is_public = true)
  OR community_id IN (
    SELECT community_id FROM public.community_members cm
    JOIN public.profiles p ON p.id = cm.profile_id
    WHERE p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

DROP POLICY IF EXISTS "Community collections manageable by moderators" ON public.community_collections;
CREATE POLICY "Community collections manageable by moderators"
ON public.community_collections FOR ALL
USING (
  public.is_community_host(community_id, (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  ))
  OR public.moderator_has_permission(
    community_id,
    (SELECT id FROM public.profiles
     WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'),
    'manage_content'
  )
);

-- 3.3 Community collection clips
CREATE TABLE IF NOT EXISTS public.community_collection_clips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES public.community_collections(id) ON DELETE CASCADE,
  clip_id UUID NOT NULL REFERENCES public.clips(id) ON DELETE CASCADE,
  display_order INTEGER DEFAULT 0,
  added_note TEXT,
  added_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  added_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(collection_id, clip_id)
);

CREATE INDEX IF NOT EXISTS idx_community_collection_clips_collection ON public.community_collection_clips(collection_id, display_order);
CREATE INDEX IF NOT EXISTS idx_community_collection_clips_clip ON public.community_collection_clips(clip_id);

ALTER TABLE public.community_collection_clips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Community collection clips viewable by community members" ON public.community_collection_clips;
CREATE POLICY "Community collection clips viewable by community members"
ON public.community_collection_clips FOR SELECT
USING (
  collection_id IN (
    SELECT id FROM public.community_collections
    WHERE community_id IN (
      SELECT id FROM public.communities WHERE is_public = true
    ) OR community_id IN (
      SELECT community_id FROM public.community_members cm
      JOIN public.profiles p ON p.id = cm.profile_id
      WHERE p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
);

DROP POLICY IF EXISTS "Community collection clips manageable by moderators" ON public.community_collection_clips;
CREATE POLICY "Community collection clips manageable by moderators"
ON public.community_collection_clips FOR ALL
USING (
  collection_id IN (
    SELECT id FROM public.community_collections cc
    WHERE public.is_community_host(cc.community_id, (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    ))
    OR public.moderator_has_permission(
      cc.community_id,
      (SELECT id FROM public.profiles
       WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'),
      'manage_content'
    )
  )
);

-- ============================================================================
-- PART 4: ALGORITHMIC CURATION FUNCTIONS
-- ============================================================================

-- 4.1 Function to get quality-based recommendations (prioritizes high quality)
CREATE OR REPLACE FUNCTION public.get_quality_based_recommendations(
  p_profile_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 20,
  p_min_quality_score NUMERIC DEFAULT 7.0
)
RETURNS TABLE (
  clip_id UUID,
  quality_score NUMERIC,
  relevance_score NUMERIC,
  recommendation_reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH quality_clips AS (
    SELECT 
      c.id,
      COALESCE(cqm.overall_quality_score, c.quality_score, 0) as q_score,
      -- Calculate relevance based on user preferences if profile_id provided
      CASE 
        WHEN p_profile_id IS NOT NULL THEN
          COALESCE(
            public.calculate_personalized_relevance(c.id, p_profile_id),
            1.0
          )
        ELSE 1.0
      END as relevance
    FROM public.clips c
    LEFT JOIN public.clip_quality_metrics cqm ON cqm.clip_id = c.id
    WHERE c.status = 'live'
      AND COALESCE(cqm.overall_quality_score, c.quality_score, 0) >= p_min_quality_score
  )
  SELECT 
    qc.id,
    qc.q_score,
    qc.relevance,
    CASE 
      WHEN qc.q_score >= 8.0 THEN 'High quality content'
      WHEN qc.q_score >= 7.0 THEN 'Quality recommended'
      ELSE 'Quality threshold met'
    END as reason
  FROM quality_clips qc
  ORDER BY (qc.q_score * 0.6 + qc.relevance * 0.4) DESC, qc.id
  LIMIT p_limit;
END;
$$;

-- 4.2 Function to get diverse recommendations (avoids echo chambers)
CREATE OR REPLACE FUNCTION public.get_diverse_recommendations(
  p_profile_id UUID,
  p_limit INTEGER DEFAULT 20,
  p_diversity_factor NUMERIC DEFAULT 0.3
)
RETURNS TABLE (
  clip_id UUID,
  creator_id UUID,
  topic_id UUID,
  diversity_score NUMERIC,
  quality_score NUMERIC,
  recommendation_reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_recent_creators UUID[];
  v_recent_topics UUID[];
  v_recent_communities UUID[];
BEGIN
  -- Get user's recently engaged content to avoid
  SELECT 
    ARRAY_AGG(DISTINCT c.profile_id),
    ARRAY_AGG(DISTINCT c.topic_id),
    ARRAY_AGG(DISTINCT c.community_id)
  INTO v_recent_creators, v_recent_topics, v_recent_communities
  FROM (
    SELECT DISTINCT c.profile_id, c.topic_id, c.community_id
    FROM public.clips c
    JOIN public.listens l ON l.clip_id = c.id
    WHERE l.profile_id = p_profile_id
      AND l.listened_at >= now() - INTERVAL '7 days'
    LIMIT 100
  ) c;
  
  RETURN QUERY
  WITH diverse_clips AS (
    SELECT 
      c.id,
      c.profile_id,
      c.topic_id,
      c.community_id,
      COALESCE(cqm.overall_quality_score, c.quality_score, 5.0) as q_score,
      -- Diversity score: higher if from different creator/topic/community
      (
        CASE WHEN c.profile_id = ANY(COALESCE(v_recent_creators, ARRAY[]::UUID[])) THEN 0.0 ELSE 0.4 END +
        CASE WHEN c.topic_id = ANY(COALESCE(v_recent_topics, ARRAY[]::UUID[])) THEN 0.0 ELSE 0.3 END +
        CASE WHEN c.community_id = ANY(COALESCE(v_recent_communities, ARRAY[]::UUID[])) THEN 0.0 ELSE 0.3 END
      ) as div_score
    FROM public.clips c
    LEFT JOIN public.clip_quality_metrics cqm ON cqm.clip_id = c.id
    WHERE c.status = 'live'
      AND c.profile_id != p_profile_id -- Don't recommend own clips
  )
  SELECT 
    dc.id,
    dc.profile_id,
    dc.topic_id,
    dc.div_score,
    dc.q_score,
    CASE 
      WHEN dc.div_score > 0.7 THEN 'Diverse perspective'
      WHEN dc.div_score > 0.4 THEN 'Different creator/topic'
      ELSE 'Fresh content'
    END as reason
  FROM diverse_clips dc
  ORDER BY (dc.div_score * p_diversity_factor + dc.q_score * (1 - p_diversity_factor) / 10.0) DESC, dc.id
  LIMIT p_limit;
END;
$$;

-- 4.3 Function to promote fresh content (boost new creators and recent uploads)
CREATE OR REPLACE FUNCTION public.get_fresh_content_promotion(
  p_limit INTEGER DEFAULT 20,
  p_new_creator_threshold_days INTEGER DEFAULT 30,
  p_min_quality_score NUMERIC DEFAULT 6.0
)
RETURNS TABLE (
  clip_id UUID,
  creator_id UUID,
  is_new_creator BOOLEAN,
  clip_age_days INTEGER,
  quality_score NUMERIC,
  engagement_velocity NUMERIC,
  promotion_reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH fresh_clips AS (
    SELECT 
      c.id,
      c.profile_id,
      EXTRACT(DAY FROM (now() - c.created_at))::INTEGER as age,
      COALESCE(cqm.overall_quality_score, c.quality_score, 5.0) as q_score,
      -- Check if creator is new
      EXISTS (
        SELECT 1 FROM public.clips c2
        WHERE c2.profile_id = c.profile_id
          AND c2.created_at < c.created_at - INTERVAL '1 day' * p_new_creator_threshold_days
      ) = false as is_new,
      -- Calculate engagement velocity (reactions/listens per hour)
      CASE 
        WHEN EXTRACT(EPOCH FROM (now() - c.created_at)) / 3600 > 0 THEN
          (
            SELECT COALESCE(SUM((value::text)::int), 0)
            FROM jsonb_each(c.reactions)
          )::NUMERIC / (EXTRACT(EPOCH FROM (now() - c.created_at)) / 3600)
        ELSE 0
      END as velocity
    FROM public.clips c
    LEFT JOIN public.clip_quality_metrics cqm ON cqm.clip_id = c.id
    WHERE c.status = 'live'
      AND c.created_at >= now() - INTERVAL '7 days' -- Only recent clips
      AND COALESCE(cqm.overall_quality_score, c.quality_score, 5.0) >= p_min_quality_score
  )
  SELECT 
    fc.id,
    fc.profile_id,
    fc.is_new,
    fc.age,
    fc.q_score,
    fc.velocity,
    CASE 
      WHEN fc.is_new THEN 'New creator'
      WHEN fc.age < 1 THEN 'Fresh upload'
      WHEN fc.velocity > 5 THEN 'Rapidly engaging'
      ELSE 'Quality fresh content'
    END as reason
  FROM fresh_clips fc
  ORDER BY 
    -- Boost new creators heavily
    CASE WHEN fc.is_new THEN 100 ELSE 0 END DESC,
    -- Boost very recent uploads
    CASE WHEN fc.age < 1 THEN 50 ELSE 0 END DESC,
    -- Then by quality and velocity
    (fc.q_score * 0.5 + LEAST(fc.velocity, 10) * 5) DESC,
    fc.id
  LIMIT p_limit;
END;
$$;

-- 4.4 Function to promote underrepresented creators
CREATE OR REPLACE FUNCTION public.get_underrepresented_creator_promotion(
  p_limit INTEGER DEFAULT 20,
  p_max_follower_count INTEGER DEFAULT 100,
  p_min_quality_score NUMERIC DEFAULT 7.0,
  p_min_clips INTEGER DEFAULT 3
)
RETURNS TABLE (
  clip_id UUID,
  creator_id UUID,
  creator_follower_count INTEGER,
  creator_clip_count INTEGER,
  creator_avg_quality NUMERIC,
  promotion_reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH underrepresented_creators AS (
    SELECT 
      c2.profile_id,
      COUNT(DISTINCT f.follower_id) as follower_count,
      COUNT(DISTINCT c2.id) as clip_count,
      AVG(COALESCE(cqm.overall_quality_score, c2.quality_score, 0)) as avg_quality
    FROM public.clips c2
    LEFT JOIN public.follows f ON f.following_id = c2.profile_id
    LEFT JOIN public.clip_quality_metrics cqm ON cqm.clip_id = c2.id
    WHERE c2.status = 'live'
    GROUP BY c2.profile_id
    HAVING COUNT(DISTINCT f.follower_id) <= p_max_follower_count
      AND COUNT(DISTINCT c2.id) >= p_min_clips
      AND AVG(COALESCE(cqm.overall_quality_score, c2.quality_score, 0)) >= p_min_quality_score
  )
  SELECT 
    c.id,
    c.profile_id,
    uc.follower_count,
    uc.clip_count,
    uc.avg_quality,
    CASE 
      WHEN uc.follower_count < 10 THEN 'Emerging voice'
      WHEN uc.follower_count < 50 THEN 'Undiscovered talent'
      ELSE 'Quality underrepresented creator'
    END as reason
  FROM public.clips c
  JOIN underrepresented_creators uc ON uc.profile_id = c.profile_id
  LEFT JOIN public.clip_quality_metrics cqm ON cqm.clip_id = c.id
  WHERE c.status = 'live'
    AND c.created_at >= now() - INTERVAL '30 days'
    AND COALESCE(cqm.overall_quality_score, c.quality_score, 0) >= p_min_quality_score
  ORDER BY 
    uc.avg_quality DESC,
    uc.follower_count ASC, -- Lower followers = more underrepresented
    c.created_at DESC
  LIMIT p_limit;
END;
$$;

-- ============================================================================
-- PART 5: QUALITY-BASED FEED RANKING INTEGRATION
-- ============================================================================

-- 5.1 Update get_for_you_feed to include quality score weighting
-- Note: This assumes get_for_you_feed exists. If not, we'll create a wrapper function.
CREATE OR REPLACE FUNCTION public.calculate_quality_weighted_score(
  p_clip_id UUID,
  p_base_relevance_score NUMERIC DEFAULT 1.0,
  p_quality_weight NUMERIC DEFAULT 0.2
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
IMMUTABLE
AS $$
DECLARE
  v_quality_score NUMERIC;
  v_final_score NUMERIC;
BEGIN
  -- Get quality score
  SELECT COALESCE(cqm.overall_quality_score, c.quality_score, 5.0)
  INTO v_quality_score
  FROM public.clips c
  LEFT JOIN public.clip_quality_metrics cqm ON cqm.clip_id = c.id
  WHERE c.id = p_clip_id;
  
  -- Normalize quality score to 0-1 range
  v_quality_score := LEAST(v_quality_score / 10.0, 1.0);
  
  -- Weighted combination
  v_final_score := p_base_relevance_score * (1.0 - p_quality_weight) + 
                   v_quality_score * p_quality_weight;
  
  RETURN v_final_score;
END;
$$;

-- ============================================================================
-- PART 6: HELPER FUNCTIONS FOR CURATION
-- ============================================================================

-- 6.1 Function to get editor's picks for a date range
CREATE OR REPLACE FUNCTION public.get_editors_picks(
  p_start_date DATE DEFAULT CURRENT_DATE - INTERVAL '7 days',
  p_end_date DATE DEFAULT CURRENT_DATE,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  clip_id UUID,
  pick_date DATE,
  reason TEXT,
  editor_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ep.clip_id,
    ep.pick_date,
    ep.reason,
    COALESCE(p.display_name, 'Editor') as editor_name
  FROM public.editors_picks ep
  LEFT JOIN public.profiles p ON p.id = ep.editor_profile_id
  WHERE ep.pick_date >= p_start_date
    AND ep.pick_date <= p_end_date
    AND ep.is_active = true
    AND (ep.featured_until IS NULL OR ep.featured_until > now())
    AND ep.clip_id IN (SELECT id FROM public.clips WHERE status = 'live')
  ORDER BY ep.pick_date DESC, ep.created_at DESC
  LIMIT p_limit;
END;
$$;

-- 6.2 Function to get featured clips by type
CREATE OR REPLACE FUNCTION public.get_featured_clips(
  p_featured_type TEXT,
  p_featured_for_id UUID DEFAULT NULL,
  p_date DATE DEFAULT CURRENT_DATE,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  clip_id UUID,
  featured_type TEXT,
  priority INTEGER,
  reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    fc.clip_id,
    fc.featured_type,
    fc.priority,
    fc.reason
  FROM public.featured_clips fc
  WHERE fc.featured_type = p_featured_type
    AND fc.featured_date = p_date
    AND fc.is_active = true
    AND (fc.featured_until IS NULL OR fc.featured_until > now())
    AND (p_featured_for_id IS NULL OR fc.featured_for_id = p_featured_for_id)
    AND fc.clip_id IN (SELECT id FROM public.clips WHERE status = 'live')
  ORDER BY fc.priority DESC, fc.created_at DESC
  LIMIT p_limit;
END;
$$;

-- 6.3 Function to get best of [time period]
CREATE OR REPLACE FUNCTION public.get_best_of_period(
  p_period_type TEXT, -- 'today', 'week', 'month', 'year'
  p_topic_id UUID DEFAULT NULL,
  p_community_id UUID DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  clip_id UUID,
  score NUMERIC,
  period_type TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_start_date TIMESTAMPTZ;
BEGIN
  -- Determine start date based on period
  CASE p_period_type
    WHEN 'today' THEN v_start_date := date_trunc('day', now());
    WHEN 'week' THEN v_start_date := date_trunc('week', now());
    WHEN 'month' THEN v_start_date := date_trunc('month', now());
    WHEN 'year' THEN v_start_date := date_trunc('year', now());
    ELSE v_start_date := now() - INTERVAL '7 days';
  END CASE;
  
  RETURN QUERY
  WITH scored_clips AS (
    SELECT 
      c.id,
      -- Combined score: quality (40%) + engagement (40%) + recency (20%)
      (
        COALESCE(cqm.overall_quality_score, c.quality_score, 5.0) / 10.0 * 0.4 +
        LEAST(
          (
            (c.listens_count::NUMERIC / 100.0) * 0.3 +
            (
              SELECT COALESCE(SUM((value::text)::int), 0)::NUMERIC / 50.0
              FROM jsonb_each(c.reactions)
            ) * 0.7
          ),
          1.0
        ) * 0.4 +
        -- Recency decay
        GREATEST(0, 1.0 - EXTRACT(EPOCH FROM (now() - c.created_at)) / EXTRACT(EPOCH FROM (now() - v_start_date))) * 0.2
      ) as combined_score
    FROM public.clips c
    LEFT JOIN public.clip_quality_metrics cqm ON cqm.clip_id = c.id
    WHERE c.status = 'live'
      AND c.created_at >= v_start_date
      AND (p_topic_id IS NULL OR c.topic_id = p_topic_id)
      AND (p_community_id IS NULL OR c.community_id = p_community_id)
      AND (p_category IS NULL OR cqm.quality_badge = p_category)
  )
  SELECT 
    sc.id,
    sc.combined_score,
    p_period_type
  FROM scored_clips sc
  ORDER BY sc.combined_score DESC
  LIMIT p_limit;
END;
$$;

-- 6.4 Function to get trending highlights (weekly/monthly recap)
CREATE OR REPLACE FUNCTION public.get_trending_highlights(
  p_period_type TEXT DEFAULT 'week', -- 'week' or 'month'
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  clip_id UUID,
  trend_score NUMERIC,
  highlight_type TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_start_date TIMESTAMPTZ;
BEGIN
  CASE p_period_type
    WHEN 'week' THEN v_start_date := now() - INTERVAL '7 days';
    WHEN 'month' THEN v_start_date := now() - INTERVAL '30 days';
    ELSE v_start_date := now() - INTERVAL '7 days';
  END CASE;
  
  RETURN QUERY
  WITH trending AS (
    SELECT 
      c.id,
      -- Trend score: engagement acceleration + absolute engagement
      (
        -- Engagement velocity (reactions/listens growth)
        CASE 
          WHEN EXTRACT(EPOCH FROM (now() - c.created_at)) / 3600 > 0 THEN
            (
              SELECT COALESCE(SUM((value::text)::int), 0)
              FROM jsonb_each(c.reactions)
            )::NUMERIC / (EXTRACT(EPOCH FROM (now() - c.created_at)) / 3600)
          ELSE 0
        END * 0.5 +
        -- Absolute engagement
        LEAST(
          (c.listens_count::NUMERIC / 500.0) * 0.3 +
          (
            SELECT COALESCE(SUM((value::text)::int), 0)::NUMERIC / 100.0
            FROM jsonb_each(c.reactions)
          ) * 0.7,
          1.0
        ) * 0.5
      ) as trend
    FROM public.clips c
    WHERE c.status = 'live'
      AND c.created_at >= v_start_date
  )
  SELECT 
    t.id,
    t.trend,
    p_period_type || '_highlight'
  FROM trending t
  ORDER BY t.trend DESC
  LIMIT p_limit;
END;
$$;

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.calculate_quality_score(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.update_quality_badge(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.generate_quality_suggestions(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_quality_based_recommendations(UUID, INTEGER, NUMERIC) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_diverse_recommendations(UUID, INTEGER, NUMERIC) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_fresh_content_promotion(INTEGER, INTEGER, NUMERIC) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_underrepresented_creator_promotion(INTEGER, INTEGER, NUMERIC, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.calculate_quality_weighted_score(UUID, NUMERIC, NUMERIC) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_editors_picks(DATE, DATE, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_featured_clips(TEXT, UUID, DATE, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_best_of_period(TEXT, UUID, UUID, TEXT, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_trending_highlights(TEXT, INTEGER) TO authenticated, anon;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger to update quality metrics when clip is updated
CREATE OR REPLACE FUNCTION public.sync_clip_quality_on_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Recalculate quality score when clip metrics change
  IF OLD.status != NEW.status AND NEW.status = 'live' THEN
    PERFORM public.update_quality_badge(NEW.id);
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_quality_on_clip_update ON public.clips;
CREATE TRIGGER sync_quality_on_clip_update
AFTER UPDATE ON public.clips
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.listens_count IS DISTINCT FROM NEW.listens_count)
EXECUTE FUNCTION public.sync_clip_quality_on_update();

-- Trigger to update updated_at timestamps
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.routines 
    WHERE routine_schema = 'public' 
    AND routine_name = 'handle_updated_at'
  ) THEN
    DROP TRIGGER IF EXISTS set_updated_at_clip_quality_metrics ON public.clip_quality_metrics;
    CREATE TRIGGER set_updated_at_clip_quality_metrics
    BEFORE UPDATE ON public.clip_quality_metrics
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
    
    DROP TRIGGER IF EXISTS set_updated_at_curated_collections ON public.curated_collections;
    CREATE TRIGGER set_updated_at_curated_collections
    BEFORE UPDATE ON public.curated_collections
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
    
    DROP TRIGGER IF EXISTS set_updated_at_community_collections ON public.community_collections;
    CREATE TRIGGER set_updated_at_community_collections
    BEFORE UPDATE ON public.community_collections
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
END $$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.clip_quality_metrics IS 'Detailed quality metrics and scores for clips';
COMMENT ON TABLE public.editors_picks IS 'Editor-selected featured clips';
COMMENT ON TABLE public.featured_clips IS 'Daily featured clips for homepage, topics, communities, or creator spotlights';
COMMENT ON TABLE public.curated_collections IS 'Admin-curated collections of clips (themed, best of, etc.)';
COMMENT ON TABLE public.community_featured_clips IS 'Community moderator-featured clips';
COMMENT ON TABLE public.community_collections IS 'Community moderator-curated collections';
COMMENT ON FUNCTION public.calculate_quality_score(UUID) IS 'Calculates multi-factor quality score (1-10) for a clip';
COMMENT ON FUNCTION public.get_quality_based_recommendations IS 'Returns high-quality content recommendations';
COMMENT ON FUNCTION public.get_diverse_recommendations IS 'Returns diverse recommendations to avoid echo chambers';
COMMENT ON FUNCTION public.get_fresh_content_promotion IS 'Promotes fresh content from new creators and recent uploads';
COMMENT ON FUNCTION public.get_underrepresented_creator_promotion IS 'Promotes clips from underrepresented creators';

