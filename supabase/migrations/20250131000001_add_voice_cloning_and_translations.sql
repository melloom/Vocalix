-- Voice Cloning for Accessibility & Multi-Language Auto-Translation
-- This migration adds support for:
-- 1. Voice cloning consent and voice model storage
-- 2. Language detection and translations for clips and comments
-- 3. User language preferences

-- ============================================================================
-- VOICE CLONING FOR ACCESSIBILITY
-- ============================================================================

-- Add voice cloning fields to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS voice_cloning_enabled BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS voice_cloning_consent_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS voice_model_id TEXT, -- ID from voice cloning service (e.g., ElevenLabs)
ADD COLUMN IF NOT EXISTS voice_model_created_at TIMESTAMPTZ;

-- Create index for voice cloning queries
CREATE INDEX IF NOT EXISTS idx_profiles_voice_cloning ON public.profiles(voice_cloning_enabled) WHERE voice_cloning_enabled = true;

-- Add voice cloning flag to clips table (indicates if clip uses cloned voice)
ALTER TABLE public.clips
ADD COLUMN IF NOT EXISTS uses_cloned_voice BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS original_voice_clip_id UUID REFERENCES public.clips(id) ON DELETE SET NULL; -- Reference to original clip used for voice cloning

-- Add voice cloning flag to comments table
ALTER TABLE public.comments
ADD COLUMN IF NOT EXISTS uses_cloned_voice BOOLEAN NOT NULL DEFAULT false;

-- Create index for cloned voice clips
CREATE INDEX IF NOT EXISTS idx_clips_cloned_voice ON public.clips(uses_cloned_voice) WHERE uses_cloned_voice = true;

-- ============================================================================
-- MULTI-LANGUAGE AUTO-TRANSLATION
-- ============================================================================

-- Add language detection and translation fields to clips table
ALTER TABLE public.clips
ADD COLUMN IF NOT EXISTS detected_language TEXT, -- ISO 639-1 language code (e.g., 'en', 'es', 'fr')
ADD COLUMN IF NOT EXISTS detected_language_confidence NUMERIC(3,2) CHECK (detected_language_confidence >= 0 AND detected_language_confidence <= 1),
ADD COLUMN IF NOT EXISTS translations JSONB DEFAULT '{}'::jsonb; -- { "es": "translated text", "fr": "translated text" }

-- Add language detection and translation fields to comments table
ALTER TABLE public.comments
ADD COLUMN IF NOT EXISTS detected_language TEXT,
ADD COLUMN IF NOT EXISTS detected_language_confidence NUMERIC(3,2) CHECK (detected_language_confidence >= 0 AND detected_language_confidence <= 1),
ADD COLUMN IF NOT EXISTS translations JSONB DEFAULT '{}'::jsonb;

-- Add user language preference to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'en' CHECK (preferred_language ~ '^[a-z]{2}$'), -- ISO 639-1 code
ADD COLUMN IF NOT EXISTS auto_translate_enabled BOOLEAN NOT NULL DEFAULT true;

-- Create indexes for language queries
CREATE INDEX IF NOT EXISTS idx_clips_detected_language ON public.clips(detected_language) WHERE detected_language IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comments_detected_language ON public.comments(detected_language) WHERE detected_language IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_preferred_language ON public.profiles(preferred_language);
CREATE INDEX IF NOT EXISTS idx_clips_translations ON public.clips USING gin(translations);
CREATE INDEX IF NOT EXISTS idx_comments_translations ON public.comments USING gin(translations);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get translated text for a clip
CREATE OR REPLACE FUNCTION public.get_clip_translation(
  p_clip_id UUID,
  p_target_language TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clip RECORD;
  v_user_language TEXT;
  v_translation TEXT;
BEGIN
  -- Get clip details
  SELECT * INTO v_clip
  FROM public.clips
  WHERE id = p_clip_id;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Use provided language or get from current user's profile
  IF p_target_language IS NULL THEN
    SELECT preferred_language INTO v_user_language
    FROM public.profiles
    WHERE id IN (SELECT id FROM public.profile_ids_for_request())
    LIMIT 1;
    
    v_user_language := COALESCE(v_user_language, 'en');
  ELSE
    v_user_language := p_target_language;
  END IF;
  
  -- If user's language matches detected language, return original
  IF v_clip.detected_language = v_user_language THEN
    RETURN v_clip.captions;
  END IF;
  
  -- Get translation from translations JSONB
  IF v_clip.translations IS NOT NULL AND v_clip.translations ? v_user_language THEN
    v_translation := v_clip.translations->>v_user_language;
    RETURN v_translation;
  END IF;
  
  -- No translation available, return original
  RETURN v_clip.captions;
END;
$$;

-- Function to get translated text for a comment
CREATE OR REPLACE FUNCTION public.get_comment_translation(
  p_comment_id UUID,
  p_target_language TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comment RECORD;
  v_user_language TEXT;
  v_translation TEXT;
BEGIN
  -- Get comment details
  SELECT * INTO v_comment
  FROM public.comments
  WHERE id = p_comment_id;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Use provided language or get from current user's profile
  IF p_target_language IS NULL THEN
    SELECT preferred_language INTO v_user_language
    FROM public.profiles
    WHERE id IN (SELECT id FROM public.profile_ids_for_request())
    LIMIT 1;
    
    v_user_language := COALESCE(v_user_language, 'en');
  ELSE
    v_user_language := p_target_language;
  END IF;
  
  -- If user's language matches detected language, return original
  IF v_comment.detected_language = v_user_language THEN
    RETURN v_comment.content;
  END IF;
  
  -- Get translation from translations JSONB
  IF v_comment.translations IS NOT NULL AND v_comment.translations ? v_user_language THEN
    v_translation := v_comment.translations->>v_user_language;
    RETURN v_translation;
  END IF;
  
  -- No translation available, return original
  RETURN v_comment.content;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_clip_translation TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_comment_translation TO authenticated, anon;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN public.profiles.voice_cloning_enabled IS 'Whether user has enabled voice cloning for accessibility';
COMMENT ON COLUMN public.profiles.voice_cloning_consent_date IS 'Date when user consented to voice cloning';
COMMENT ON COLUMN public.profiles.voice_model_id IS 'Voice model ID from voice cloning service (e.g., ElevenLabs)';
COMMENT ON COLUMN public.profiles.voice_model_created_at IS 'When the voice model was created';
COMMENT ON COLUMN public.profiles.preferred_language IS 'User preferred language (ISO 639-1 code, e.g., en, es, fr)';
COMMENT ON COLUMN public.profiles.auto_translate_enabled IS 'Whether to automatically show translations for clips/comments';
COMMENT ON COLUMN public.clips.uses_cloned_voice IS 'Whether this clip uses a cloned voice';
COMMENT ON COLUMN public.clips.original_voice_clip_id IS 'Reference to original clip used for voice cloning';
COMMENT ON COLUMN public.clips.detected_language IS 'Detected language code (ISO 639-1)';
COMMENT ON COLUMN public.clips.detected_language_confidence IS 'Confidence score for language detection (0-1)';
COMMENT ON COLUMN public.clips.translations IS 'JSONB object with translations: {"es": "texto traducido", "fr": "texte traduit"}';
COMMENT ON COLUMN public.comments.uses_cloned_voice IS 'Whether this comment uses a cloned voice';
COMMENT ON COLUMN public.comments.detected_language IS 'Detected language code (ISO 639-1)';
COMMENT ON COLUMN public.comments.detected_language_confidence IS 'Confidence score for language detection (0-1)';
COMMENT ON COLUMN public.comments.translations IS 'JSONB object with translations: {"es": "texto traducido", "fr": "texte traduit"}';

