-- Collaborative Playlists
-- Allows multiple users to collaborate on playlists

-- Create playlist_collaborators table
CREATE TABLE IF NOT EXISTS public.playlist_collaborators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id UUID NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('editor', 'viewer')),
  invited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(playlist_id, profile_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_playlist_collaborators_playlist ON public.playlist_collaborators(playlist_id);
CREATE INDEX IF NOT EXISTS idx_playlist_collaborators_profile ON public.playlist_collaborators(profile_id);

-- Enable RLS
ALTER TABLE public.playlist_collaborators ENABLE ROW LEVEL SECURITY;

-- Users can view collaborators on playlists they own or collaborate on
CREATE POLICY "Playlist collaborators readable by owner or collaborator"
ON public.playlist_collaborators FOR SELECT
USING (
  playlist_id IN (
    SELECT id FROM public.playlists
    WHERE profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
  OR profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Playlist owners can add collaborators
CREATE POLICY "Playlist collaborators insertable by owner"
ON public.playlist_collaborators FOR INSERT
WITH CHECK (
  playlist_id IN (
    SELECT id FROM public.playlists
    WHERE profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
);

-- Playlist owners can update collaborator roles
CREATE POLICY "Playlist collaborators updatable by owner"
ON public.playlist_collaborators FOR UPDATE
USING (
  playlist_id IN (
    SELECT id FROM public.playlists
    WHERE profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
);

-- Playlist owners and collaborators can remove themselves
CREATE POLICY "Playlist collaborators deletable by owner or self"
ON public.playlist_collaborators FOR DELETE
USING (
  playlist_id IN (
    SELECT id FROM public.playlists
    WHERE profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
  OR profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Update playlists RLS to allow collaborators to view/edit
-- Drop existing policies and recreate with collaborator support
DROP POLICY IF EXISTS "Playlists readable by owner" ON public.playlists;
CREATE POLICY "Playlists readable by owner or collaborator"
ON public.playlists FOR SELECT
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
  OR id IN (
    SELECT playlist_id FROM public.playlist_collaborators
    WHERE profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
  OR is_public = true
);

DROP POLICY IF EXISTS "Playlists updatable by owner" ON public.playlists;
CREATE POLICY "Playlists updatable by owner or editor"
ON public.playlists FOR UPDATE
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
  OR id IN (
    SELECT playlist_id FROM public.playlist_collaborators
    WHERE profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
    AND role = 'editor'
  )
);

-- Update playlist_clips RLS to allow collaborators to add/remove clips
DROP POLICY IF EXISTS "Playlist clips insertable by playlist owner" ON public.playlist_clips;
CREATE POLICY "Playlist clips insertable by owner or editor"
ON public.playlist_clips FOR INSERT
WITH CHECK (
  playlist_id IN (
    SELECT id FROM public.playlists
    WHERE profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
  OR playlist_id IN (
    SELECT playlist_id FROM public.playlist_collaborators
    WHERE profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
    AND role = 'editor'
  )
);

DROP POLICY IF EXISTS "Playlist clips updatable by playlist owner" ON public.playlist_clips;
CREATE POLICY "Playlist clips updatable by owner or editor"
ON public.playlist_clips FOR UPDATE
USING (
  playlist_id IN (
    SELECT id FROM public.playlists
    WHERE profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
  OR playlist_id IN (
    SELECT playlist_id FROM public.playlist_collaborators
    WHERE profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
    AND role = 'editor'
  )
);

DROP POLICY IF EXISTS "Playlist clips deletable by playlist owner" ON public.playlist_clips;
CREATE POLICY "Playlist clips deletable by owner or editor"
ON public.playlist_clips FOR DELETE
USING (
  playlist_id IN (
    SELECT id FROM public.playlists
    WHERE profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
  OR playlist_id IN (
    SELECT playlist_id FROM public.playlist_collaborators
    WHERE profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
    AND role = 'editor'
  )
);

-- Function to check if user can edit playlist
CREATE OR REPLACE FUNCTION public.can_edit_playlist(
  playlist_id_param UUID,
  profile_id_param UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.playlists
    WHERE id = playlist_id_param
      AND profile_id = profile_id_param
  ) OR EXISTS (
    SELECT 1 FROM public.playlist_collaborators
    WHERE playlist_id = playlist_id_param
      AND profile_id = profile_id_param
      AND role = 'editor'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get playlist collaborators
CREATE OR REPLACE FUNCTION public.get_playlist_collaborators(playlist_id_param UUID)
RETURNS TABLE (
  profile_id UUID,
  handle TEXT,
  emoji_avatar TEXT,
  role TEXT,
  invited_by UUID,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pc.profile_id,
    p.handle,
    p.emoji_avatar,
    pc.role,
    pc.invited_by,
    pc.created_at
  FROM public.playlist_collaborators pc
  JOIN public.profiles p ON p.id = pc.profile_id
  WHERE pc.playlist_id = playlist_id_param
  ORDER BY pc.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

