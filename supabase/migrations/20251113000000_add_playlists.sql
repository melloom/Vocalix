-- Playlists table
CREATE TABLE public.playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_public BOOLEAN DEFAULT false,
  share_token TEXT UNIQUE,
  is_auto_generated BOOLEAN DEFAULT false,
  auto_generation_type TEXT, -- 'mood', 'topic', 'tag'
  auto_generation_value TEXT, -- e.g., mood emoji, topic_id, tag name
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.playlists ENABLE ROW LEVEL SECURITY;

-- Users can view their own playlists
CREATE POLICY "Playlists readable by owner"
ON public.playlists FOR SELECT
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
  OR is_public = true
);

-- Users can view public playlists by share token (for shared links)
CREATE POLICY "Public playlists viewable by share token"
ON public.playlists FOR SELECT
USING (is_public = true OR share_token IS NOT NULL);

-- Users can create their own playlists
CREATE POLICY "Playlists insertable by owner"
ON public.playlists FOR INSERT
WITH CHECK (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Users can update their own playlists
CREATE POLICY "Playlists updatable by owner"
ON public.playlists FOR UPDATE
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Users can delete their own playlists
CREATE POLICY "Playlists deletable by owner"
ON public.playlists FOR DELETE
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Playlist clips junction table
CREATE TABLE public.playlist_clips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id UUID REFERENCES public.playlists(id) ON DELETE CASCADE,
  clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE,
  position INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(playlist_id, clip_id)
);

ALTER TABLE public.playlist_clips ENABLE ROW LEVEL SECURITY;

-- Users can view clips in their own playlists or public playlists
CREATE POLICY "Playlist clips readable by playlist owner or public"
ON public.playlist_clips FOR SELECT
USING (
  playlist_id IN (
    SELECT id FROM public.playlists
    WHERE profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
    OR is_public = true
  )
);

-- Users can add clips to their own playlists
CREATE POLICY "Playlist clips insertable by playlist owner"
ON public.playlist_clips FOR INSERT
WITH CHECK (
  playlist_id IN (
    SELECT id FROM public.playlists
    WHERE profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
);

-- Users can update clips in their own playlists
CREATE POLICY "Playlist clips updatable by playlist owner"
ON public.playlist_clips FOR UPDATE
USING (
  playlist_id IN (
    SELECT id FROM public.playlists
    WHERE profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
);

-- Users can remove clips from their own playlists
CREATE POLICY "Playlist clips deletable by playlist owner"
ON public.playlist_clips FOR DELETE
USING (
  playlist_id IN (
    SELECT id FROM public.playlists
    WHERE profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
);

-- Indexes for performance
CREATE INDEX idx_playlists_profile_id ON public.playlists(profile_id);
CREATE INDEX idx_playlists_share_token ON public.playlists(share_token);
CREATE INDEX idx_playlists_auto_generated ON public.playlists(is_auto_generated, auto_generation_type, auto_generation_value);
CREATE INDEX idx_playlist_clips_playlist_id ON public.playlist_clips(playlist_id);
CREATE INDEX idx_playlist_clips_clip_id ON public.playlist_clips(clip_id);
CREATE INDEX idx_playlist_clips_position ON public.playlist_clips(playlist_id, position);

-- Note: Share tokens are generated client-side using crypto.getRandomValues()

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_playlists_updated_at
  BEFORE UPDATE ON public.playlists
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

