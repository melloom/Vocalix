-- Add optional title for clips and ensure tags default
ALTER TABLE public.clips
ADD COLUMN IF NOT EXISTS title TEXT;

ALTER TABLE public.clips
ALTER COLUMN tags SET DEFAULT '{}'::text[];














