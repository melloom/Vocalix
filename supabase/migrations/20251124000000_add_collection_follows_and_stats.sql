-- Collection follows table (for following playlists/collections)
CREATE TABLE public.collection_follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  playlist_id UUID REFERENCES public.playlists(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(profile_id, playlist_id),
  CHECK (profile_id IS NOT NULL AND playlist_id IS NOT NULL)
);

ALTER TABLE public.collection_follows ENABLE ROW LEVEL SECURITY;

-- Users can view their own follows
CREATE POLICY "Collection follows readable by follower"
ON public.collection_follows FOR SELECT
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Anyone can view collection follows (for public display of follower counts)
CREATE POLICY "Collection follows viewable by everyone"
ON public.collection_follows FOR SELECT
USING (true);

-- Users can follow collections
CREATE POLICY "Collection follows insertable by follower"
ON public.collection_follows FOR INSERT
WITH CHECK (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Users can unfollow collections
CREATE POLICY "Collection follows deletable by follower"
ON public.collection_follows FOR DELETE
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Indexes for performance
CREATE INDEX idx_collection_follows_profile_id ON public.collection_follows(profile_id);
CREATE INDEX idx_collection_follows_playlist_id ON public.collection_follows(playlist_id);
CREATE INDEX idx_collection_follows_created_at ON public.collection_follows(created_at DESC);

-- Collection views table (for tracking views/stats)
CREATE TABLE public.collection_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id UUID REFERENCES public.playlists(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  viewed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(playlist_id, profile_id) -- One view per user per collection
);

ALTER TABLE public.collection_views ENABLE ROW LEVEL SECURITY;

-- Anyone can insert views (for tracking)
CREATE POLICY "Collection views insertable by anyone"
ON public.collection_views FOR INSERT
WITH CHECK (true);

-- Users can view their own view history
CREATE POLICY "Collection views readable by viewer"
ON public.collection_views FOR SELECT
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
  OR profile_id IS NULL -- Allow viewing anonymous views for stats
);

-- Indexes for performance
CREATE INDEX idx_collection_views_playlist_id ON public.collection_views(playlist_id);
CREATE INDEX idx_collection_views_profile_id ON public.collection_views(profile_id);
CREATE INDEX idx_collection_views_viewed_at ON public.collection_views(viewed_at DESC);

-- Add stats columns to playlists table for caching
ALTER TABLE public.playlists
ADD COLUMN IF NOT EXISTS follower_count INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS view_count INT DEFAULT 0;

-- Function to update playlist follower count
CREATE OR REPLACE FUNCTION update_playlist_follower_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.playlists
    SET follower_count = (
      SELECT COUNT(*) FROM public.collection_follows
      WHERE playlist_id = NEW.playlist_id
    )
    WHERE id = NEW.playlist_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.playlists
    SET follower_count = (
      SELECT COUNT(*) FROM public.collection_follows
      WHERE playlist_id = OLD.playlist_id
    )
    WHERE id = OLD.playlist_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update playlist view count
CREATE OR REPLACE FUNCTION update_playlist_view_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.playlists
    SET view_count = (
      SELECT COUNT(*) FROM public.collection_views
      WHERE playlist_id = NEW.playlist_id
    )
    WHERE id = NEW.playlist_id;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Triggers to update stats
CREATE TRIGGER update_playlist_follower_count_on_follow
  AFTER INSERT ON public.collection_follows
  FOR EACH ROW
  EXECUTE FUNCTION update_playlist_follower_count();

CREATE TRIGGER update_playlist_follower_count_on_unfollow
  AFTER DELETE ON public.collection_follows
  FOR EACH ROW
  EXECUTE FUNCTION update_playlist_follower_count();

CREATE TRIGGER update_playlist_view_count
  AFTER INSERT ON public.collection_views
  FOR EACH ROW
  EXECUTE FUNCTION update_playlist_view_count();

-- Initialize stats for existing playlists
UPDATE public.playlists
SET follower_count = (
  SELECT COUNT(*) FROM public.collection_follows
  WHERE collection_follows.playlist_id = playlists.id
),
view_count = (
  SELECT COUNT(*) FROM public.collection_views
  WHERE collection_views.playlist_id = playlists.id
);

