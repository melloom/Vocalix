-- Saved clips (bookmarks) table
CREATE TABLE public.saved_clips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(clip_id, profile_id)
);

ALTER TABLE public.saved_clips ENABLE ROW LEVEL SECURITY;

-- Users can view their own saved clips
CREATE POLICY "Saved clips readable by owner"
ON public.saved_clips FOR SELECT
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Users can save clips to their collection
CREATE POLICY "Saved clips insertable by owner"
ON public.saved_clips FOR INSERT
WITH CHECK (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Users can remove clips from their collection
CREATE POLICY "Saved clips deletable by owner"
ON public.saved_clips FOR DELETE
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Index for faster queries
CREATE INDEX idx_saved_clips_profile_id ON public.saved_clips(profile_id);
CREATE INDEX idx_saved_clips_clip_id ON public.saved_clips(clip_id);

