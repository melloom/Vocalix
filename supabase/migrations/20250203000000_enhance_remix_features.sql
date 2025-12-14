-- Enhanced Clip Remixing Features
-- This migration adds support for:
-- - Remix templates
-- - Multi-clip remixes (3+ clips)
-- - Remix challenges
-- - Remix collaboration
-- - Remix effects
-- - Remix of the day
-- - Remix leaderboards
-- - Revenue sharing
-- - Attribution chains

-- ============================================================================
-- 1. REMIX TEMPLATES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.remix_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  template_type TEXT NOT NULL DEFAULT 'overlay', -- 'overlay', 'sequential', 'custom'
  structure JSONB NOT NULL DEFAULT '{}'::jsonb, -- Defines how clips should be mixed
  original_volume NUMERIC DEFAULT 0.5,
  remix_volume NUMERIC DEFAULT 1.0,
  fade_in_seconds NUMERIC DEFAULT 0,
  fade_out_seconds NUMERIC DEFAULT 0,
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_public BOOLEAN DEFAULT true,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_remix_templates_public ON public.remix_templates(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_remix_templates_usage ON public.remix_templates(usage_count DESC);

ALTER TABLE public.remix_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Remix templates are viewable by everyone"
ON public.remix_templates FOR SELECT
USING (is_public = true OR created_by_profile_id IN (
  SELECT id FROM public.profiles
  WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
));

CREATE POLICY "Remix templates are insertable by authenticated users"
ON public.remix_templates FOR INSERT
WITH CHECK (true);

CREATE POLICY "Remix templates are updatable by creator"
ON public.remix_templates FOR UPDATE
USING (created_by_profile_id IN (
  SELECT id FROM public.profiles
  WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
));

-- ============================================================================
-- 2. MULTI-CLIP REMIXES
-- ============================================================================

-- Add support for multiple source clips in a remix
CREATE TABLE IF NOT EXISTS public.remix_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  remix_clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE NOT NULL,
  source_clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE NOT NULL,
  source_order INTEGER NOT NULL DEFAULT 1, -- Order in which clips appear
  volume NUMERIC DEFAULT 1.0, -- Volume for this specific source
  start_offset NUMERIC DEFAULT 0, -- Start time offset in seconds
  fade_in NUMERIC DEFAULT 0, -- Fade in duration
  fade_out NUMERIC DEFAULT 0, -- Fade out duration
  effect_type TEXT, -- 'none', 'echo', 'reverb', 'pitch_shift', etc.
  effect_params JSONB DEFAULT '{}'::jsonb, -- Effect-specific parameters
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(remix_clip_id, source_clip_id, source_order)
);

CREATE INDEX IF NOT EXISTS idx_remix_sources_remix ON public.remix_sources(remix_clip_id);
CREATE INDEX IF NOT EXISTS idx_remix_sources_source ON public.remix_sources(source_clip_id);

ALTER TABLE public.remix_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Remix sources are viewable by everyone"
ON public.remix_sources FOR SELECT
USING (true);

CREATE POLICY "Remix sources are insertable by authenticated users"
ON public.remix_sources FOR INSERT
WITH CHECK (true);

-- ============================================================================
-- 3. REMIX CHALLENGES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.remix_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  challenge_clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE NOT NULL, -- The clip to remix
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  start_date TIMESTAMPTZ DEFAULT now(),
  end_date TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  prize_description TEXT, -- Description of prizes/rewards
  rules JSONB DEFAULT '{}'::jsonb, -- Challenge-specific rules
  participant_count INTEGER DEFAULT 0,
  submission_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_remix_challenges_active ON public.remix_challenges(is_active, end_date) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_remix_challenges_clip ON public.remix_challenges(challenge_clip_id);

ALTER TABLE public.remix_challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Remix challenges are viewable by everyone"
ON public.remix_challenges FOR SELECT
USING (true);

CREATE POLICY "Remix challenges are insertable by authenticated users"
ON public.remix_challenges FOR INSERT
WITH CHECK (true);

CREATE POLICY "Remix challenges are updatable by creator"
ON public.remix_challenges FOR UPDATE
USING (created_by_profile_id IN (
  SELECT id FROM public.profiles
  WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
));

-- Link clips to remix challenges
ALTER TABLE public.clips
ADD COLUMN IF NOT EXISTS remix_challenge_id UUID REFERENCES public.remix_challenges(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clips_remix_challenge ON public.clips(remix_challenge_id);

-- ============================================================================
-- 4. REMIX COLLABORATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.remix_collaborations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  remix_clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE NOT NULL,
  collaborator_profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL DEFAULT 'contributor', -- 'creator', 'contributor', 'editor'
  contribution_type TEXT, -- 'recording', 'mixing', 'effects', 'editing'
  contribution_percentage NUMERIC DEFAULT 0, -- Percentage of contribution (for revenue sharing)
  invited_at TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  UNIQUE(remix_clip_id, collaborator_profile_id)
);

CREATE INDEX IF NOT EXISTS idx_remix_collaborations_remix ON public.remix_collaborations(remix_clip_id);
CREATE INDEX IF NOT EXISTS idx_remix_collaborations_profile ON public.remix_collaborations(collaborator_profile_id);

ALTER TABLE public.remix_collaborations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Remix collaborations are viewable by everyone"
ON public.remix_collaborations FOR SELECT
USING (true);

CREATE POLICY "Remix collaborations are insertable by authenticated users"
ON public.remix_collaborations FOR INSERT
WITH CHECK (true);

CREATE POLICY "Remix collaborations are updatable by collaborator"
ON public.remix_collaborations FOR UPDATE
USING (collaborator_profile_id IN (
  SELECT id FROM public.profiles
  WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
));

-- ============================================================================
-- 5. REMIX OF THE DAY
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.remix_of_the_day (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  remix_clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE NOT NULL UNIQUE,
  featured_date DATE NOT NULL UNIQUE,
  featured_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason TEXT, -- Why this remix was featured
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_remix_of_the_day_date ON public.remix_of_the_day(featured_date DESC);

ALTER TABLE public.remix_of_the_day ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Remix of the day is viewable by everyone"
ON public.remix_of_the_day FOR SELECT
USING (true);

-- ============================================================================
-- 6. REMIX LEADERBOARDS
-- ============================================================================

-- View for remix leaderboards (computed on the fly)
CREATE OR REPLACE VIEW public.remix_leaderboard AS
SELECT 
  c.id as remix_clip_id,
  c.profile_id as creator_id,
  p.handle as creator_handle,
  p.emoji_avatar as creator_avatar,
  c.remix_of_clip_id,
  c.listens_count,
  COALESCE((SELECT SUM((value::text)::int) FROM jsonb_each_text(c.reactions)), 0) as reactions_count,
  (SELECT COUNT(*) FROM public.clips WHERE remix_of_clip_id = c.id AND status = 'live') as remix_count,
  COALESCE(ra.remix_listens, 0) as remix_analytics_listens,
  COALESCE(COUNT(DISTINCT rc.id), 0) as collaboration_count,
  (
    (c.listens_count * 0.3) +
    (COALESCE((SELECT SUM((value::text)::int) FROM jsonb_each_text(c.reactions)), 0) * 2.0) +
    ((SELECT COUNT(*) FROM public.clips WHERE remix_of_clip_id = c.id AND status = 'live') * 3.0) +
    (COALESCE(ra.remix_listens, 0) * 0.5) +
    (COALESCE(COUNT(DISTINCT rc.id), 0) * 1.5)
  ) as engagement_score,
  c.created_at
FROM public.clips c
LEFT JOIN public.profiles p ON c.profile_id = p.id
LEFT JOIN public.remix_analytics ra ON c.id = ra.remix_clip_id
LEFT JOIN public.remix_collaborations rc ON c.id = rc.remix_clip_id AND rc.is_active = true
WHERE c.remix_of_clip_id IS NOT NULL
  AND c.status = 'live'
GROUP BY c.id, c.profile_id, p.handle, p.emoji_avatar, c.remix_of_clip_id, 
         c.listens_count, c.reactions, c.created_at, ra.remix_listens
ORDER BY engagement_score DESC, c.created_at DESC;

-- ============================================================================
-- 7. REVENUE SHARING
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.remix_revenue_sharing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  remix_clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE NOT NULL,
  original_clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE NOT NULL,
  remix_creator_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  original_creator_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  revenue_amount NUMERIC DEFAULT 0, -- In platform currency
  remix_creator_share NUMERIC DEFAULT 0, -- Amount for remix creator
  original_creator_share NUMERIC DEFAULT 0, -- Amount for original creator
  sharing_percentage NUMERIC DEFAULT 10, -- Percentage of revenue to share (default 10%)
  is_paid BOOLEAN DEFAULT false,
  paid_at TIMESTAMPTZ,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(remix_clip_id, original_clip_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_remix_revenue_remix ON public.remix_revenue_sharing(remix_clip_id);
CREATE INDEX IF NOT EXISTS idx_remix_revenue_original ON public.remix_revenue_sharing(original_clip_id);
CREATE INDEX IF NOT EXISTS idx_remix_revenue_creators ON public.remix_revenue_sharing(remix_creator_id, original_creator_id);

ALTER TABLE public.remix_revenue_sharing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Remix revenue sharing is viewable by participants"
ON public.remix_revenue_sharing FOR SELECT
USING (
  remix_creator_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
  OR original_creator_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- ============================================================================
-- 8. ATTRIBUTION CHAINS
-- ============================================================================

-- Function to get full attribution chain for a remix
CREATE OR REPLACE FUNCTION public.get_remix_attribution_chain(
  p_clip_id UUID
)
RETURNS TABLE (
  clip_id UUID,
  clip_title TEXT,
  creator_handle TEXT,
  creator_avatar TEXT,
  depth INTEGER,
  is_original BOOLEAN,
  attribution_path UUID[]
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE attribution_tree AS (
    -- Start with the given clip
    SELECT 
      c.id,
      c.title,
      c.remix_of_clip_id,
      p.handle,
      p.emoji_avatar,
      0 as depth,
      ARRAY[c.id] as path,
      c.remix_of_clip_id IS NULL as is_original
    FROM public.clips c
    LEFT JOIN public.profiles p ON c.profile_id = p.id
    WHERE c.id = p_clip_id
    
    UNION ALL
    
    -- Find the original clip(s) this remix is based on
    SELECT 
      c.id,
      c.title,
      c.remix_of_clip_id,
      p.handle,
      p.emoji_avatar,
      at.depth + 1,
      at.path || c.id,
      c.remix_of_clip_id IS NULL as is_original
    FROM public.clips c
    LEFT JOIN public.profiles p ON c.profile_id = p.id
    INNER JOIN attribution_tree at ON c.id = at.remix_of_clip_id
    WHERE NOT (c.id = ANY(at.path)) -- Prevent cycles
  )
  SELECT 
    at.id as clip_id,
    at.title as clip_title,
    at.handle as creator_handle,
    at.emoji_avatar as creator_avatar,
    at.depth,
    at.is_original,
    at.path as attribution_path
  FROM attribution_tree at
  ORDER BY at.depth DESC; -- Original first, then remixes
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 9. NOTIFICATIONS FOR REMIX CREATORS
-- ============================================================================

-- Function to notify original creator when their clip is remixed
CREATE OR REPLACE FUNCTION public.notify_remix_created()
RETURNS TRIGGER AS $$
DECLARE
  v_original_creator_id UUID;
  v_remix_creator_id UUID;
  v_original_title TEXT;
BEGIN
  -- Only notify if this is a new remix
  IF NEW.remix_of_clip_id IS NOT NULL AND NEW.status = 'live' THEN
    -- Get original creator
    SELECT profile_id, title INTO v_original_creator_id, v_original_title
    FROM public.clips
    WHERE id = NEW.remix_of_clip_id;
    
    -- Get remix creator
    v_remix_creator_id := NEW.profile_id;
    
    -- Only notify if different creators
    IF v_original_creator_id IS NOT NULL 
       AND v_remix_creator_id IS NOT NULL 
       AND v_original_creator_id != v_remix_creator_id THEN
      
      -- Create notification (assuming notifications table exists)
      INSERT INTO public.notifications (
        profile_id,
        type,
        title,
        message,
        related_clip_id,
        created_at
      )
      VALUES (
        v_original_creator_id,
        'remix_created',
        'Your clip was remixed!',
        'Someone created a remix of your clip: ' || COALESCE(v_original_title, 'Untitled'),
        NEW.id,
        NOW()
      )
      ON CONFLICT DO NOTHING; -- Prevent duplicate notifications
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (only if notifications table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications') THEN
    DROP TRIGGER IF EXISTS trigger_notify_remix_created ON public.clips;
    CREATE TRIGGER trigger_notify_remix_created
      AFTER INSERT OR UPDATE ON public.clips
      FOR EACH ROW
      WHEN (NEW.remix_of_clip_id IS NOT NULL AND NEW.status = 'live')
      EXECUTE FUNCTION public.notify_remix_created();
  END IF;
END $$;

-- ============================================================================
-- 10. HELPER FUNCTIONS
-- ============================================================================

-- Function to get remix of the day
CREATE OR REPLACE FUNCTION public.get_remix_of_the_day(
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  remix_clip_id UUID,
  featured_date DATE,
  reason TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    rotd.remix_clip_id,
    rotd.featured_date,
    rotd.reason
  FROM public.remix_of_the_day rotd
  WHERE rotd.featured_date = p_date
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get active remix challenges
CREATE OR REPLACE FUNCTION public.get_active_remix_challenges()
RETURNS TABLE (
  challenge_id UUID,
  title TEXT,
  description TEXT,
  challenge_clip_id UUID,
  end_date TIMESTAMPTZ,
  participant_count INTEGER,
  submission_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    rc.id as challenge_id,
    rc.title,
    rc.description,
    rc.challenge_clip_id,
    rc.end_date,
    rc.participant_count,
    rc.submission_count
  FROM public.remix_challenges rc
  WHERE rc.is_active = true
    AND (rc.end_date IS NULL OR rc.end_date > NOW())
  ORDER BY rc.created_at DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to update remix challenge stats
CREATE OR REPLACE FUNCTION public.update_remix_challenge_stats(
  p_challenge_id UUID
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.remix_challenges
  SET 
    participant_count = (
      SELECT COUNT(DISTINCT profile_id)
      FROM public.clips
      WHERE remix_challenge_id = p_challenge_id
        AND status = 'live'
    ),
    submission_count = (
      SELECT COUNT(*)
      FROM public.clips
      WHERE remix_challenge_id = p_challenge_id
        AND status = 'live'
    ),
    updated_at = NOW()
  WHERE id = p_challenge_id;
END;
$$ LANGUAGE plpgsql;

-- Function to increment template usage
CREATE OR REPLACE FUNCTION public.increment_template_usage(
  p_template_id UUID
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.remix_templates
  SET 
    usage_count = usage_count + 1,
    updated_at = NOW()
  WHERE id = p_template_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 11. GRANTS
-- ============================================================================

GRANT SELECT ON public.remix_templates TO authenticated, anon;
GRANT INSERT ON public.remix_templates TO authenticated;
GRANT SELECT ON public.remix_sources TO authenticated, anon;
GRANT INSERT ON public.remix_sources TO authenticated;
GRANT SELECT ON public.remix_challenges TO authenticated, anon;
GRANT INSERT ON public.remix_challenges TO authenticated;
GRANT SELECT ON public.remix_collaborations TO authenticated, anon;
GRANT INSERT ON public.remix_collaborations TO authenticated;
GRANT SELECT ON public.remix_of_the_day TO authenticated, anon;
GRANT SELECT ON public.remix_leaderboard TO authenticated, anon;
GRANT SELECT ON public.remix_revenue_sharing TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_remix_attribution_chain(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_remix_of_the_day(DATE) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_active_remix_challenges() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.update_remix_challenge_stats(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_template_usage(UUID) TO authenticated;

-- ============================================================================
-- 12. COMMENTS
-- ============================================================================

COMMENT ON TABLE public.remix_templates IS 'Pre-made remix structures that users can apply';
COMMENT ON TABLE public.remix_sources IS 'Tracks multiple source clips in a single remix';
COMMENT ON TABLE public.remix_challenges IS 'Community remix contests and challenges';
COMMENT ON TABLE public.remix_collaborations IS 'Tracks multiple users collaborating on a remix';
COMMENT ON TABLE public.remix_of_the_day IS 'Featured remix for each day';
COMMENT ON VIEW public.remix_leaderboard IS 'Leaderboard of top remixes by engagement score';
COMMENT ON TABLE public.remix_revenue_sharing IS 'Tracks revenue sharing between remix and original creators';

