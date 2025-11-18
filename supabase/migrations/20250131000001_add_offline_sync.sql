-- Offline sync tables for cross-device synchronization
-- Sync downloaded clips, playlists, saved clips, and listening progress

-- Downloaded clips sync table
CREATE TABLE IF NOT EXISTS public.synced_downloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE NOT NULL,
  device_id TEXT NOT NULL, -- Device where clip was downloaded
  synced_at TIMESTAMPTZ DEFAULT now(),
  last_modified TIMESTAMPTZ DEFAULT now(),
  UNIQUE(profile_id, clip_id, device_id)
);

ALTER TABLE public.synced_downloads ENABLE ROW LEVEL SECURITY;

-- Users can view their own synced downloads
CREATE POLICY "Synced downloads readable by owner"
ON public.synced_downloads FOR SELECT
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Users can insert their own synced downloads
CREATE POLICY "Synced downloads insertable by owner"
ON public.synced_downloads FOR INSERT
WITH CHECK (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Users can update their own synced downloads
CREATE POLICY "Synced downloads updatable by owner"
ON public.synced_downloads FOR UPDATE
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Users can delete their own synced downloads
CREATE POLICY "Synced downloads deletable by owner"
ON public.synced_downloads FOR DELETE
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_synced_downloads_profile_id ON public.synced_downloads(profile_id);
CREATE INDEX IF NOT EXISTS idx_synced_downloads_clip_id ON public.synced_downloads(clip_id);
CREATE INDEX IF NOT EXISTS idx_synced_downloads_device_id ON public.synced_downloads(device_id);
CREATE INDEX IF NOT EXISTS idx_synced_downloads_synced_at ON public.synced_downloads(synced_at DESC);

-- Listening progress sync table
CREATE TABLE IF NOT EXISTS public.listening_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE NOT NULL,
  progress_seconds DECIMAL(10, 2) DEFAULT 0 NOT NULL, -- Seconds into the clip
  progress_percentage DECIMAL(5, 2) DEFAULT 0 NOT NULL, -- Percentage (0-100)
  last_played_at TIMESTAMPTZ DEFAULT now(),
  device_id TEXT, -- Device where progress was made
  synced_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(profile_id, clip_id)
);

ALTER TABLE public.listening_progress ENABLE ROW LEVEL SECURITY;

-- Users can view their own listening progress
CREATE POLICY "Listening progress readable by owner"
ON public.listening_progress FOR SELECT
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Users can insert their own listening progress
CREATE POLICY "Listening progress insertable by owner"
ON public.listening_progress FOR INSERT
WITH CHECK (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Users can update their own listening progress
CREATE POLICY "Listening progress updatable by owner"
ON public.listening_progress FOR UPDATE
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Users can delete their own listening progress
CREATE POLICY "Listening progress deletable by owner"
ON public.listening_progress FOR DELETE
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_listening_progress_profile_id ON public.listening_progress(profile_id);
CREATE INDEX IF NOT EXISTS idx_listening_progress_clip_id ON public.listening_progress(clip_id);
CREATE INDEX IF NOT EXISTS idx_listening_progress_last_played_at ON public.listening_progress(last_played_at DESC);

-- Function to sync listening progress (upsert)
CREATE OR REPLACE FUNCTION public.sync_listening_progress(
  p_profile_id UUID,
  p_clip_id UUID,
  p_progress_seconds DECIMAL,
  p_progress_percentage DECIMAL,
  p_device_id TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.listening_progress (
    profile_id,
    clip_id,
    progress_seconds,
    progress_percentage,
    device_id,
    last_played_at,
    synced_at
  )
  VALUES (
    p_profile_id,
    p_clip_id,
    p_progress_seconds,
    p_progress_percentage,
    p_device_id,
    now(),
    now()
  )
  ON CONFLICT (profile_id, clip_id)
  DO UPDATE SET
    progress_seconds = EXCLUDED.progress_seconds,
    progress_percentage = EXCLUDED.progress_percentage,
    device_id = COALESCE(EXCLUDED.device_id, listening_progress.device_id),
    last_played_at = EXCLUDED.last_played_at,
    synced_at = now();
END;
$$;

-- Function to get synced downloads for a profile
CREATE OR REPLACE FUNCTION public.get_synced_downloads(p_profile_id UUID)
RETURNS TABLE (
  clip_id UUID,
  device_id TEXT,
  synced_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sd.clip_id,
    sd.device_id,
    sd.synced_at
  FROM public.synced_downloads sd
  WHERE sd.profile_id = p_profile_id
  ORDER BY sd.synced_at DESC;
END;
$$;

-- Function to get listening progress for a profile
CREATE OR REPLACE FUNCTION public.get_listening_progress(p_profile_id UUID)
RETURNS TABLE (
  clip_id UUID,
  progress_seconds DECIMAL,
  progress_percentage DECIMAL,
  last_played_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    lp.clip_id,
    lp.progress_seconds,
    lp.progress_percentage,
    lp.last_played_at
  FROM public.listening_progress lp
  WHERE lp.profile_id = p_profile_id
  ORDER BY lp.last_played_at DESC;
END;
$$;

