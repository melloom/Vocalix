-- Accessibility & Privacy Features
-- This migration adds support for:
-- 1. Private clips (is_private field)
-- 2. Granular privacy controls (visibility settings)
-- 3. Sign language support (sign_language_video_url)
-- 4. Audio descriptions (audio_description_url)

-- ============================================================================
-- PRIVACY FEATURES
-- ============================================================================

-- Add privacy fields to clips table
ALTER TABLE public.clips
ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'followers', 'private')),
ADD COLUMN IF NOT EXISTS allowed_viewers UUID[] DEFAULT NULL; -- Array of profile IDs who can view private clips

-- Create index for private clips queries
CREATE INDEX IF NOT EXISTS idx_clips_visibility ON public.clips(visibility, profile_id) WHERE visibility != 'public';
CREATE INDEX IF NOT EXISTS idx_clips_is_private ON public.clips(is_private, profile_id) WHERE is_private = true;

-- Update RLS policies to handle private clips
-- Drop existing policies that need updating
DROP POLICY IF EXISTS "Public clips viewable" ON public.clips;
DROP POLICY IF EXISTS "Owners view their clips" ON public.clips;
DROP POLICY IF EXISTS "Followers can view follower-only clips" ON public.clips;
DROP POLICY IF EXISTS "Allowed viewers can view private clips" ON public.clips;

-- Policy 1: Public can view public/processing clips
CREATE POLICY "Public clips viewable"
ON public.clips FOR SELECT
USING (
  status IN ('live', 'processing') 
  AND visibility = 'public'
  AND is_private = false
);

-- Policy 2: Owners can view ALL their clips (including private)
CREATE POLICY "Owners view their clips"
ON public.clips FOR SELECT
USING (
  profile_id IN (SELECT id FROM public.profile_ids_for_request())
);

-- Policy 3: Followers can view clips with 'followers' visibility
CREATE POLICY "Followers can view follower-only clips"
ON public.clips FOR SELECT
USING (
  status IN ('live', 'processing')
  AND visibility = 'followers'
  AND profile_id IN (
    SELECT following_id FROM public.follows
    WHERE follower_id IN (SELECT id FROM public.profile_ids_for_request())
  )
);

-- Policy 4: Allowed viewers can view private clips
CREATE POLICY "Allowed viewers can view private clips"
ON public.clips FOR SELECT
USING (
  status IN ('live', 'processing')
  AND visibility = 'private'
  AND (
    profile_id IN (SELECT id FROM public.profile_ids_for_request())
    OR (
      allowed_viewers IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM unnest(allowed_viewers) AS viewer_id
        WHERE viewer_id IN (SELECT id FROM public.profile_ids_for_request())
      )
    )
  )
);

-- ============================================================================
-- ACCESSIBILITY FEATURES
-- ============================================================================

-- Add accessibility fields to clips table
ALTER TABLE public.clips
ADD COLUMN IF NOT EXISTS sign_language_video_url TEXT, -- URL to sign language interpretation video
ADD COLUMN IF NOT EXISTS audio_description_url TEXT, -- URL to audio description track
ADD COLUMN IF NOT EXISTS has_captions BOOLEAN NOT NULL DEFAULT true; -- Whether captions are available

-- Create index for accessibility features
CREATE INDEX IF NOT EXISTS idx_clips_sign_language ON public.clips(sign_language_video_url) WHERE sign_language_video_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clips_audio_description ON public.clips(audio_description_url) WHERE audio_description_url IS NOT NULL;

-- Add accessibility preferences to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS accessibility_preferences JSONB DEFAULT '{
  "prefer_captions": true,
  "prefer_sign_language": false,
  "prefer_audio_descriptions": false,
  "caption_size": "medium",
  "caption_position": "bottom"
}'::jsonb;

-- Create index for accessibility preferences
CREATE INDEX IF NOT EXISTS idx_profiles_accessibility ON public.profiles USING gin(accessibility_preferences);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to check if a user can view a clip
CREATE OR REPLACE FUNCTION public.can_view_clip(
  p_clip_id UUID,
  p_viewer_profile_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clip RECORD;
  v_is_owner BOOLEAN;
  v_is_follower BOOLEAN;
  v_is_allowed_viewer BOOLEAN;
BEGIN
  -- Get clip details
  SELECT * INTO v_clip
  FROM public.clips
  WHERE id = p_clip_id;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Owner can always view
  IF v_clip.profile_id = p_viewer_profile_id THEN
    RETURN true;
  END IF;
  
  -- Check if clip is live/processing
  IF v_clip.status NOT IN ('live', 'processing') THEN
    RETURN false;
  END IF;
  
  -- Public clips are viewable by everyone
  IF v_clip.visibility = 'public' AND v_clip.is_private = false THEN
    RETURN true;
  END IF;
  
  -- Check if viewer is a follower (for 'followers' visibility)
  IF v_clip.visibility = 'followers' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.follows
      WHERE follower_id = p_viewer_profile_id
        AND following_id = v_clip.profile_id
    ) INTO v_is_follower;
    
    IF v_is_follower THEN
      RETURN true;
    END IF;
  END IF;
  
  -- Check if viewer is in allowed_viewers list (for 'private' visibility)
  IF v_clip.visibility = 'private' AND v_clip.allowed_viewers IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM unnest(v_clip.allowed_viewers) AS viewer_id
      WHERE viewer_id = p_viewer_profile_id
    ) INTO v_is_allowed_viewer;
    
    IF v_is_allowed_viewer THEN
      RETURN true;
    END IF;
  END IF;
  
  RETURN false;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.can_view_clip TO authenticated, anon;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN public.clips.is_private IS 'Whether the clip is private (only visible to owner and allowed viewers)';
COMMENT ON COLUMN public.clips.visibility IS 'Visibility level: public (everyone), followers (only followers), private (only allowed viewers)';
COMMENT ON COLUMN public.clips.allowed_viewers IS 'Array of profile IDs who can view this private clip';
COMMENT ON COLUMN public.clips.sign_language_video_url IS 'URL to sign language interpretation video for this clip';
COMMENT ON COLUMN public.clips.audio_description_url IS 'URL to audio description track for this clip';
COMMENT ON COLUMN public.clips.has_captions IS 'Whether captions/transcription are available for this clip';
COMMENT ON COLUMN public.profiles.accessibility_preferences IS 'User accessibility preferences (captions, sign language, audio descriptions, etc.)';

