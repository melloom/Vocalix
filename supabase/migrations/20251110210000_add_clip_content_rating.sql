-- Add explicit content rating for clips so creators can self-tag sensitive audio
ALTER TABLE public.clips
ADD COLUMN IF NOT EXISTS content_rating TEXT NOT NULL DEFAULT 'general';

ALTER TABLE public.clips
DROP CONSTRAINT IF EXISTS clips_content_rating_check;

ALTER TABLE public.clips
ADD CONSTRAINT clips_content_rating_check
CHECK (content_rating IN ('general', 'sensitive'));

