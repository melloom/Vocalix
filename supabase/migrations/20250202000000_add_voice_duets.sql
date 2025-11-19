-- Voice Duets Migration
-- Duets allow users to record their voice alongside an existing clip (side-by-side audio)
-- This is different from remixes which mix audio together
-- Duets have viral potential as they create collaborative content chains

-- ============================================================================
-- STEP 1: Add duet support to clips table
-- ============================================================================

-- Add duet_of_clip_id to reference the original clip being duetted
ALTER TABLE public.clips
ADD COLUMN IF NOT EXISTS duet_of_clip_id UUID REFERENCES public.clips(id) ON DELETE SET NULL;

-- Add duet_position to indicate which side (left/right) in the duet
-- 'left' = original clip, 'right' = duet response
ALTER TABLE public.clips
ADD COLUMN IF NOT EXISTS duet_position TEXT CHECK (duet_position IN ('left', 'right')) DEFAULT NULL;

-- Add duet_chain_id to group duets that form a chain (duet of a duet)
ALTER TABLE public.clips
ADD COLUMN IF NOT EXISTS duet_chain_id UUID DEFAULT NULL;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_clips_duet_of_clip_id ON public.clips(duet_of_clip_id) WHERE duet_of_clip_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clips_duet_chain_id ON public.clips(duet_chain_id) WHERE duet_chain_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clips_duet_status ON public.clips(duet_of_clip_id, status) WHERE duet_of_clip_id IS NOT NULL AND status = 'live';

-- ============================================================================
-- STEP 2: Create duets table for tracking duet relationships and metrics
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.duets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE NOT NULL,
  duet_clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE NOT NULL,
  duet_chain_id UUID DEFAULT NULL, -- Groups duets that form chains
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(original_clip_id, duet_clip_id)
);

-- Add indexes for duets table
CREATE INDEX IF NOT EXISTS idx_duets_original_clip_id ON public.duets(original_clip_id);
CREATE INDEX IF NOT EXISTS idx_duets_duet_clip_id ON public.duets(duet_clip_id);
CREATE INDEX IF NOT EXISTS idx_duets_duet_chain_id ON public.duets(duet_chain_id) WHERE duet_chain_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_duets_created_at ON public.duets(created_at DESC);

-- Enable RLS on duets table
ALTER TABLE public.duets ENABLE ROW LEVEL SECURITY;

-- Duets are viewable by everyone
CREATE POLICY "Duets are viewable by everyone"
ON public.duets FOR SELECT
USING (true);

-- Users can create duets for their own clips
CREATE POLICY "Duets are insertable by authenticated users"
ON public.duets FOR INSERT
WITH CHECK (
  duet_clip_id IN (
    SELECT id FROM public.clips
    WHERE profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
);

-- ============================================================================
-- STEP 3: Create duet analytics table for viral tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.duet_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE NOT NULL,
  duet_clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE NOT NULL,
  original_listens_from_duet BIGINT DEFAULT 0, -- Listens to original from duet viewers
  duet_listens BIGINT DEFAULT 0, -- Listens to the duet itself
  viral_score NUMERIC DEFAULT 0, -- Calculated viral potential score
  chain_depth INTEGER DEFAULT 1, -- How many duets deep in the chain
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(original_clip_id, duet_clip_id)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_duet_analytics_original_clip_id ON public.duet_analytics(original_clip_id);
CREATE INDEX IF NOT EXISTS idx_duet_analytics_duet_clip_id ON public.duet_analytics(duet_clip_id);
CREATE INDEX IF NOT EXISTS idx_duet_analytics_viral_score ON public.duet_analytics(viral_score DESC);
CREATE INDEX IF NOT EXISTS idx_duet_analytics_chain_depth ON public.duet_analytics(chain_depth);

-- Enable RLS
ALTER TABLE public.duet_analytics ENABLE ROW LEVEL SECURITY;

-- Duet analytics are viewable by everyone
CREATE POLICY "Duet analytics are viewable by everyone"
ON public.duet_analytics FOR SELECT
USING (true);

-- ============================================================================
-- STEP 4: Create functions for duet operations
-- ============================================================================

-- Function to get duet count for a clip
CREATE OR REPLACE FUNCTION public.get_duet_count(clip_uuid UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM public.clips
    WHERE duet_of_clip_id = clip_uuid
      AND status = 'live'
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_duet_count TO authenticated, anon;

-- Function to get duet chain (all duets in a chain)
CREATE OR REPLACE FUNCTION public.get_duet_chain(
  p_clip_id UUID
)
RETURNS TABLE (
  clip_id UUID,
  duet_position TEXT,
  depth INTEGER,
  chain_path UUID[]
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE duet_tree AS (
    -- Start with the original clip
    SELECT 
      c.id,
      c.duet_position,
      0 as depth,
      ARRAY[c.id]::UUID[] as chain_path
    FROM public.clips c
    WHERE c.id = p_clip_id
    
    UNION ALL
    
    -- Find all duets of this clip
    SELECT 
      c.id,
      c.duet_position,
      dt.depth + 1,
      dt.chain_path || c.id
    FROM public.clips c
    INNER JOIN duet_tree dt ON c.duet_of_clip_id = dt.clip_id
    WHERE c.status = 'live'
      AND dt.depth < 10 -- Prevent infinite recursion
  )
  SELECT 
    dt.clip_id,
    dt.duet_position,
    dt.depth,
    dt.chain_path
  FROM duet_tree dt
  ORDER BY dt.depth, dt.clip_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_duet_chain TO authenticated, anon;

-- Function to calculate viral score for a duet
CREATE OR REPLACE FUNCTION public.calculate_duet_viral_score(
  p_original_clip_id UUID,
  p_duet_clip_id UUID
)
RETURNS NUMERIC AS $$
DECLARE
  v_original_listens BIGINT;
  v_duet_listens BIGINT;
  v_duet_reactions BIGINT;
  v_chain_depth INTEGER;
  v_viral_score NUMERIC;
BEGIN
  -- Get listens
  SELECT listens_count INTO v_original_listens
  FROM public.clips
  WHERE id = p_original_clip_id;
  
  SELECT listens_count INTO v_duet_listens
  FROM public.clips
  WHERE id = p_duet_clip_id;
  
  -- Get reactions on duet
  SELECT COALESCE(SUM((reactions->>key)::INTEGER), 0) INTO v_duet_reactions
  FROM public.clips
  WHERE id = p_duet_clip_id
    AND reactions IS NOT NULL;
  
  -- Get chain depth
  SELECT COALESCE(MAX(chain_depth), 1) INTO v_chain_depth
  FROM public.duet_analytics
  WHERE original_clip_id = p_original_clip_id;
  
  -- Calculate viral score
  -- Formula: (duet_listens * 0.4) + (duet_reactions * 0.3) + (chain_depth * 0.2) + (original_listens_from_duet * 0.1)
  v_viral_score := (v_duet_listens * 0.4) + (v_duet_reactions * 0.3) + (v_chain_depth * 0.2);
  
  RETURN v_viral_score;
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.calculate_duet_viral_score TO authenticated, anon;

-- Function to get trending duets
CREATE OR REPLACE FUNCTION public.get_trending_duets(
  p_limit INT DEFAULT 20,
  p_days INT DEFAULT 7
)
RETURNS TABLE (
  original_clip_id UUID,
  duet_clip_id UUID,
  original_title TEXT,
  duet_title TEXT,
  original_creator_handle TEXT,
  duet_creator_handle TEXT,
  original_creator_emoji TEXT,
  duet_creator_emoji TEXT,
  viral_score NUMERIC,
  duet_listens BIGINT,
  chain_depth INTEGER,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    da.original_clip_id,
    da.duet_clip_id,
    oc.title as original_title,
    dc.title as duet_title,
    op.handle as original_creator_handle,
    dp.handle as duet_creator_handle,
    op.emoji_avatar as original_creator_emoji,
    dp.emoji_avatar as duet_creator_emoji,
    da.viral_score,
    da.duet_listens,
    da.chain_depth,
    d.created_at
  FROM public.duet_analytics da
  INNER JOIN public.duets d ON d.original_clip_id = da.original_clip_id AND d.duet_clip_id = da.duet_clip_id
  INNER JOIN public.clips oc ON oc.id = da.original_clip_id
  INNER JOIN public.clips dc ON dc.id = da.duet_clip_id
  INNER JOIN public.profiles op ON op.id = oc.profile_id
  INNER JOIN public.profiles dp ON dp.id = dc.profile_id
  WHERE d.created_at >= NOW() - (p_days || ' days')::INTERVAL
    AND oc.status = 'live'
    AND dc.status = 'live'
  ORDER BY da.viral_score DESC, da.duet_listens DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_trending_duets TO authenticated, anon;

-- ============================================================================
-- STEP 5: Create trigger to update duet analytics when duet is created
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_duet_analytics()
RETURNS TRIGGER AS $$
DECLARE
  v_chain_depth INTEGER;
  v_duet_chain_id UUID;
BEGIN
  -- Get or create duet chain ID
  IF NEW.duet_chain_id IS NULL THEN
    -- Check if original clip is part of a duet chain
    SELECT duet_chain_id INTO v_duet_chain_id
    FROM public.clips
    WHERE id = NEW.duet_of_clip_id;
    
    IF v_duet_chain_id IS NULL THEN
      -- Create new chain ID
      v_duet_chain_id := gen_random_uuid();
    END IF;
    
    NEW.duet_chain_id := v_duet_chain_id;
  END IF;
  
  -- Calculate chain depth
  SELECT COALESCE(MAX(chain_depth), 0) + 1 INTO v_chain_depth
  FROM public.duet_analytics
  WHERE original_clip_id = NEW.duet_of_clip_id;
  
  IF v_chain_depth IS NULL THEN
    v_chain_depth := 1;
  END IF;
  
  -- Insert or update duet record
  INSERT INTO public.duets (original_clip_id, duet_clip_id, duet_chain_id)
  VALUES (NEW.duet_of_clip_id, NEW.id, NEW.duet_chain_id)
  ON CONFLICT (original_clip_id, duet_clip_id) DO NOTHING;
  
  -- Insert or update analytics
  INSERT INTO public.duet_analytics (
    original_clip_id,
    duet_clip_id,
    chain_depth,
    viral_score
  )
  VALUES (
    NEW.duet_of_clip_id,
    NEW.id,
    v_chain_depth,
    public.calculate_duet_viral_score(NEW.duet_of_clip_id, NEW.id)
  )
  ON CONFLICT (original_clip_id, duet_clip_id)
  DO UPDATE SET
    updated_at = NOW(),
    viral_score = public.calculate_duet_viral_score(NEW.duet_of_clip_id, NEW.id);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_update_duet_analytics ON public.clips;
CREATE TRIGGER trigger_update_duet_analytics
  AFTER INSERT ON public.clips
  FOR EACH ROW
  WHEN (NEW.duet_of_clip_id IS NOT NULL)
  EXECUTE FUNCTION public.update_duet_analytics();

-- ============================================================================
-- STEP 6: Add comments for documentation
-- ============================================================================

COMMENT ON COLUMN public.clips.duet_of_clip_id IS 'References the original clip if this is a duet. NULL indicates an original clip.';
COMMENT ON COLUMN public.clips.duet_position IS 'Position in duet: left (original) or right (duet response)';
COMMENT ON COLUMN public.clips.duet_chain_id IS 'Groups duets that form a chain (duet of a duet). NULL indicates a standalone duet.';

COMMENT ON TABLE public.duets IS 'Tracks duet relationships between clips';
COMMENT ON TABLE public.duet_analytics IS 'Tracks viral metrics and analytics for duets';

COMMENT ON FUNCTION public.get_duet_count IS 'Returns the number of duets for a given clip';
COMMENT ON FUNCTION public.get_duet_chain IS 'Returns all clips in a duet chain starting from a given clip';
COMMENT ON FUNCTION public.calculate_duet_viral_score IS 'Calculates viral potential score for a duet';
COMMENT ON FUNCTION public.get_trending_duets IS 'Returns trending duets sorted by viral score';

