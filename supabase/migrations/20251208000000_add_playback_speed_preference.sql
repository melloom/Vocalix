-- Add playback speed preference to profiles table
-- This allows users to set their preferred playback speed (0.5x, 1x, 1.5x, 2x)
-- The preference is saved per user and applied to all audio playback

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS playback_speed NUMERIC(3, 2) NOT NULL DEFAULT 1.0
CHECK (playback_speed >= 0.5 AND playback_speed <= 2.0);

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.playback_speed IS 'User preferred playback speed (0.5x to 2.0x). Default is 1.0 (normal speed).';

