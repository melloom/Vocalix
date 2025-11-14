-- Voice reactions table for audio reactions (3-5 second voice clips)
CREATE TABLE public.voice_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  audio_path TEXT NOT NULL,
  duration_seconds DECIMAL(5,2) NOT NULL CHECK (duration_seconds >= 1 AND duration_seconds <= 5),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_voice_reactions_clip_id ON public.voice_reactions(clip_id);
CREATE INDEX idx_voice_reactions_profile_id ON public.voice_reactions(profile_id);
CREATE INDEX idx_voice_reactions_created_at ON public.voice_reactions(created_at DESC);

ALTER TABLE public.voice_reactions ENABLE ROW LEVEL SECURITY;

-- Voice reactions are readable by everyone
CREATE POLICY "Voice reactions readable by everyone"
ON public.voice_reactions FOR SELECT
USING (true);

-- Voice reactions can be inserted by authenticated users
CREATE POLICY "Voice reactions insertable by owner"
ON public.voice_reactions FOR INSERT
WITH CHECK (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Users can delete their own voice reactions
CREATE POLICY "Voice reactions deletable by owner"
ON public.voice_reactions FOR DELETE
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

