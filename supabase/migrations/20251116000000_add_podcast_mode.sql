-- Add podcast mode support
-- Allow longer content for podcasts (up to 10 minutes = 600 seconds)

-- Add is_podcast field to clips table
ALTER TABLE public.clips 
ADD COLUMN IF NOT EXISTS is_podcast BOOLEAN DEFAULT false;

-- Update duration constraint to allow longer content for podcasts
-- Regular clips: max 30 seconds
-- Podcast clips: max 600 seconds (10 minutes)
ALTER TABLE public.clips 
DROP CONSTRAINT IF EXISTS clips_duration_seconds_check;

ALTER TABLE public.clips 
ADD CONSTRAINT clips_duration_seconds_check 
CHECK (
  (is_podcast = false AND duration_seconds <= 30) OR
  (is_podcast = true AND duration_seconds <= 600 AND duration_seconds > 30)
);

-- Add index for podcast queries
CREATE INDEX IF NOT EXISTS idx_clips_is_podcast ON public.clips(is_podcast) WHERE is_podcast = true;

-- Add comment
COMMENT ON COLUMN public.clips.is_podcast IS 'Indicates if this is a longer-form podcast episode (up to 10 minutes)';

