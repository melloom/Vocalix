-- Ethical Voice Cloning Framework
-- This migration adds comprehensive ethical controls for voice cloning:
-- 1. Consent-based cloning system (request/approve cloning others' voices)
-- 2. Creator controls (enable/disable cloning permissions)
-- 3. Attribution enforcement (require original_voice_clip_id)
-- 4. Revenue sharing for cloned content
-- 5. Watermarking support for AI-generated content

-- ============================================================================
-- 1. VOICE CLONING CONSENT SYSTEM
-- ============================================================================

-- Table to track voice cloning consent requests
CREATE TABLE IF NOT EXISTS public.voice_cloning_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  creator_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  source_clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'revoked')),
  purpose TEXT, -- Use case: 'accessibility', 'translation', 'content_creation', 'other'
  message TEXT, -- Optional message from requester
  response_message TEXT, -- Optional response from creator
  expires_at TIMESTAMPTZ, -- Optional expiration date
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  responded_at TIMESTAMPTZ,
  UNIQUE(requester_id, creator_id, source_clip_id)
);

CREATE INDEX IF NOT EXISTS idx_voice_cloning_consents_requester ON public.voice_cloning_consents(requester_id);
CREATE INDEX IF NOT EXISTS idx_voice_cloning_consents_creator ON public.voice_cloning_consents(creator_id);
CREATE INDEX IF NOT EXISTS idx_voice_cloning_consents_status ON public.voice_cloning_consents(status);
CREATE INDEX IF NOT EXISTS idx_voice_cloning_consents_clip ON public.voice_cloning_consents(source_clip_id);

ALTER TABLE public.voice_cloning_consents ENABLE ROW LEVEL SECURITY;

-- Users can view their own consent requests and requests made to them
CREATE POLICY "Users can view their voice cloning consents"
ON public.voice_cloning_consents FOR SELECT
USING (
  requester_id IN (SELECT id FROM public.profile_ids_for_request())
  OR creator_id IN (SELECT id FROM public.profile_ids_for_request())
);

-- Users can create consent requests
CREATE POLICY "Users can create voice cloning consent requests"
ON public.voice_cloning_consents FOR INSERT
WITH CHECK (
  requester_id IN (SELECT id FROM public.profile_ids_for_request())
);

-- Creators can update consent requests (approve/reject)
CREATE POLICY "Creators can respond to consent requests"
ON public.voice_cloning_consents FOR UPDATE
USING (
  creator_id IN (SELECT id FROM public.profile_ids_for_request())
);

-- ============================================================================
-- 2. CREATOR CLONING PERMISSIONS
-- ============================================================================

-- Add fields to profiles for controlling voice cloning permissions
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS allow_voice_cloning BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS voice_cloning_auto_approve BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS voice_cloning_revenue_share_percentage NUMERIC(5,2) DEFAULT 20.00 CHECK (voice_cloning_revenue_share_percentage >= 0 AND voice_cloning_revenue_share_percentage <= 100);

CREATE INDEX IF NOT EXISTS idx_profiles_allow_voice_cloning ON public.profiles(allow_voice_cloning) WHERE allow_voice_cloning = true;

-- ============================================================================
-- 3. CLONED VOICE MODELS (for cloning others' voices)
-- ============================================================================

-- Table to track cloned voice models from other creators
CREATE TABLE IF NOT EXISTS public.cloned_voice_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  original_creator_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  source_clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE NOT NULL,
  consent_id UUID REFERENCES public.voice_cloning_consents(id) ON DELETE SET NULL,
  voice_model_id TEXT NOT NULL, -- ElevenLabs voice model ID
  voice_model_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ, -- Optional expiration
  UNIQUE(user_id, original_creator_id, source_clip_id)
);

CREATE INDEX IF NOT EXISTS idx_cloned_voice_models_user ON public.cloned_voice_models(user_id);
CREATE INDEX IF NOT EXISTS idx_cloned_voice_models_creator ON public.cloned_voice_models(original_creator_id);
CREATE INDEX IF NOT EXISTS idx_cloned_voice_models_consent ON public.cloned_voice_models(consent_id);
CREATE INDEX IF NOT EXISTS idx_cloned_voice_models_active ON public.cloned_voice_models(is_active) WHERE is_active = true;

ALTER TABLE public.cloned_voice_models ENABLE ROW LEVEL SECURITY;

-- Users can view their own cloned voice models
CREATE POLICY "Users can view their cloned voice models"
ON public.cloned_voice_models FOR SELECT
USING (
  user_id IN (SELECT id FROM public.profile_ids_for_request())
  OR original_creator_id IN (SELECT id FROM public.profile_ids_for_request())
);

-- Users can create cloned voice models (with proper consent)
CREATE POLICY "Users can create cloned voice models"
ON public.cloned_voice_models FOR INSERT
WITH CHECK (
  user_id IN (SELECT id FROM public.profile_ids_for_request())
);

-- Users can update their own cloned voice models
CREATE POLICY "Users can update their cloned voice models"
ON public.cloned_voice_models FOR UPDATE
USING (
  user_id IN (SELECT id FROM public.profile_ids_for_request())
);

-- ============================================================================
-- 4. ATTRIBUTION ENFORCEMENT
-- ============================================================================

-- Add watermarking fields to clips
ALTER TABLE public.clips
ADD COLUMN IF NOT EXISTS has_watermark BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS watermark_data JSONB, -- Store watermark metadata
ADD COLUMN IF NOT EXISTS cloned_voice_model_id UUID REFERENCES public.cloned_voice_models(id) ON DELETE SET NULL;

-- Update original_voice_clip_id to be required when uses_cloned_voice is true
ALTER TABLE public.clips
DROP CONSTRAINT IF EXISTS clips_uses_cloned_voice_requires_original;

ALTER TABLE public.clips
ADD CONSTRAINT clips_uses_cloned_voice_requires_original 
CHECK (
  (uses_cloned_voice = false) OR 
  (uses_cloned_voice = true AND original_voice_clip_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_clips_cloned_voice_model ON public.clips(cloned_voice_model_id);
CREATE INDEX IF NOT EXISTS idx_clips_has_watermark ON public.clips(has_watermark) WHERE has_watermark = true;

-- ============================================================================
-- 5. REVENUE SHARING FOR CLONED CONTENT
-- ============================================================================

-- Table to track revenue sharing for cloned voice content
CREATE TABLE IF NOT EXISTS public.voice_cloning_revenue_sharing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cloned_clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE NOT NULL,
  original_clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE NOT NULL,
  cloned_creator_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  original_creator_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  revenue_amount NUMERIC DEFAULT 0, -- In platform currency
  cloned_creator_share NUMERIC DEFAULT 0,
  original_creator_share NUMERIC DEFAULT 0,
  sharing_percentage NUMERIC DEFAULT 20.00, -- Percentage of revenue to share (default 20%)
  is_paid BOOLEAN DEFAULT false,
  paid_at TIMESTAMPTZ,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(cloned_clip_id, original_clip_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_voice_cloning_revenue_cloned ON public.voice_cloning_revenue_sharing(cloned_clip_id);
CREATE INDEX IF NOT EXISTS idx_voice_cloning_revenue_original ON public.voice_cloning_revenue_sharing(original_clip_id);
CREATE INDEX IF NOT EXISTS idx_voice_cloning_revenue_creators ON public.voice_cloning_revenue_sharing(cloned_creator_id, original_creator_id);
CREATE INDEX IF NOT EXISTS idx_voice_cloning_revenue_paid ON public.voice_cloning_revenue_sharing(is_paid) WHERE is_paid = false;

ALTER TABLE public.voice_cloning_revenue_sharing ENABLE ROW LEVEL SECURITY;

-- Users can view revenue sharing for their content
CREATE POLICY "Users can view their voice cloning revenue"
ON public.voice_cloning_revenue_sharing FOR SELECT
USING (
  cloned_creator_id IN (SELECT id FROM public.profile_ids_for_request())
  OR original_creator_id IN (SELECT id FROM public.profile_ids_for_request())
);

-- ============================================================================
-- 6. HELPER FUNCTIONS
-- ============================================================================

-- Function to check if user can clone another creator's voice
CREATE OR REPLACE FUNCTION public.can_clone_voice(
  p_requester_id UUID,
  p_creator_id UUID,
  p_clip_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator_profile RECORD;
  v_consent RECORD;
BEGIN
  -- Get creator's profile
  SELECT * INTO v_creator_profile
  FROM public.profiles
  WHERE id = p_creator_id;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- If creator doesn't allow voice cloning, return false
  IF NOT v_creator_profile.allow_voice_cloning THEN
    RETURN false;
  END IF;
  
  -- If auto-approve is enabled, return true
  IF v_creator_profile.voice_cloning_auto_approve THEN
    RETURN true;
  END IF;
  
  -- Check for approved consent
  SELECT * INTO v_consent
  FROM public.voice_cloning_consents
  WHERE requester_id = p_requester_id
    AND creator_id = p_creator_id
    AND source_clip_id = p_clip_id
    AND status = 'approved'
    AND (expires_at IS NULL OR expires_at > now());
  
  RETURN v_consent IS NOT NULL;
END;
$$;

-- Function to get revenue share percentage for a creator
CREATE OR REPLACE FUNCTION public.get_voice_cloning_revenue_share(
  p_creator_id UUID
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_percentage NUMERIC;
BEGIN
  SELECT COALESCE(voice_cloning_revenue_share_percentage, 20.00) INTO v_percentage
  FROM public.profiles
  WHERE id = p_creator_id;
  
  RETURN COALESCE(v_percentage, 20.00);
END;
$$;

-- Function to calculate and record revenue sharing for cloned content
CREATE OR REPLACE FUNCTION public.calculate_voice_cloning_revenue(
  p_cloned_clip_id UUID,
  p_revenue_amount NUMERIC,
  p_period_start TIMESTAMPTZ,
  p_period_end TIMESTAMPTZ
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cloned_clip RECORD;
  v_original_clip RECORD;
  v_revenue_share_percentage NUMERIC;
  v_original_share NUMERIC;
  v_cloned_share NUMERIC;
  v_revenue_id UUID;
BEGIN
  -- Get cloned clip details
  SELECT * INTO v_cloned_clip
  FROM public.clips
  WHERE id = p_cloned_clip_id;
  
  IF NOT FOUND OR NOT v_cloned_clip.uses_cloned_voice OR v_cloned_clip.original_voice_clip_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Get original clip details
  SELECT * INTO v_original_clip
  FROM public.clips
  WHERE id = v_cloned_clip.original_voice_clip_id;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Get revenue share percentage from original creator
  SELECT get_voice_cloning_revenue_share(v_original_clip.profile_id) INTO v_revenue_share_percentage;
  
  -- Calculate shares
  v_original_share := (p_revenue_amount * v_revenue_share_percentage / 100);
  v_cloned_share := p_revenue_amount - v_original_share;
  
  -- Insert or update revenue sharing record
  INSERT INTO public.voice_cloning_revenue_sharing (
    cloned_clip_id,
    original_clip_id,
    cloned_creator_id,
    original_creator_id,
    revenue_amount,
    cloned_creator_share,
    original_creator_share,
    sharing_percentage,
    period_start,
    period_end
  )
  VALUES (
    p_cloned_clip_id,
    v_cloned_clip.original_voice_clip_id,
    v_cloned_clip.profile_id,
    v_original_clip.profile_id,
    p_revenue_amount,
    v_cloned_share,
    v_original_share,
    v_revenue_share_percentage,
    p_period_start,
    p_period_end
  )
  ON CONFLICT (cloned_clip_id, original_clip_id, period_start, period_end)
  DO UPDATE SET
    revenue_amount = EXCLUDED.revenue_amount,
    cloned_creator_share = EXCLUDED.cloned_creator_share,
    original_creator_share = EXCLUDED.original_creator_share,
    updated_at = now()
  RETURNING id INTO v_revenue_id;
  
  RETURN v_revenue_id;
END;
$$;

-- Function to get pending consent requests for a creator
CREATE OR REPLACE FUNCTION public.get_pending_voice_cloning_requests(
  p_creator_id UUID
)
RETURNS TABLE (
  id UUID,
  requester_id UUID,
  requester_handle TEXT,
  requester_emoji_avatar TEXT,
  source_clip_id UUID,
  source_clip_title TEXT,
  purpose TEXT,
  message TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    vcc.id,
    vcc.requester_id,
    pr.handle as requester_handle,
    pr.emoji_avatar as requester_emoji_avatar,
    vcc.source_clip_id,
    c.title as source_clip_title,
    vcc.purpose,
    vcc.message,
    vcc.created_at
  FROM public.voice_cloning_consents vcc
  INNER JOIN public.profiles pr ON pr.id = vcc.requester_id
  INNER JOIN public.clips c ON c.id = vcc.source_clip_id
  WHERE vcc.creator_id = p_creator_id
    AND vcc.status = 'pending'
    AND (vcc.expires_at IS NULL OR vcc.expires_at > now())
  ORDER BY vcc.created_at DESC;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.can_clone_voice(UUID, UUID, UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_voice_cloning_revenue_share(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.calculate_voice_cloning_revenue(UUID, NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_pending_voice_cloning_requests(UUID) TO authenticated, anon;

-- ============================================================================
-- 7. COMMENTS
-- ============================================================================

COMMENT ON TABLE public.voice_cloning_consents IS 'Tracks consent requests for cloning another creator''s voice';
COMMENT ON COLUMN public.voice_cloning_consents.status IS 'Status: pending, approved, rejected, or revoked';
COMMENT ON COLUMN public.voice_cloning_consents.purpose IS 'Use case: accessibility, translation, content_creation, other';
COMMENT ON TABLE public.cloned_voice_models IS 'Stores cloned voice models from other creators (with consent)';
COMMENT ON COLUMN public.profiles.allow_voice_cloning IS 'Whether this creator allows others to clone their voice';
COMMENT ON COLUMN public.profiles.voice_cloning_auto_approve IS 'Whether to auto-approve voice cloning requests';
COMMENT ON COLUMN public.profiles.voice_cloning_revenue_share_percentage IS 'Percentage of revenue to share with original creator (0-100)';
COMMENT ON COLUMN public.clips.has_watermark IS 'Whether this clip has audio watermarking for AI detection';
COMMENT ON COLUMN public.clips.watermark_data IS 'Metadata about the watermark (algorithm, timestamp, etc.)';
COMMENT ON COLUMN public.clips.cloned_voice_model_id IS 'Reference to the cloned voice model used (if cloning another creator''s voice)';
COMMENT ON TABLE public.voice_cloning_revenue_sharing IS 'Tracks revenue sharing for content created with cloned voices';

