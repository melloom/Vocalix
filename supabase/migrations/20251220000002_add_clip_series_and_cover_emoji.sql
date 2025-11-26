-- Add optional series name and cover emoji to clips to support episode-like groupings

ALTER TABLE public.clips
  ADD COLUMN IF NOT EXISTS series_name TEXT,
  ADD COLUMN IF NOT EXISTS cover_emoji TEXT;


