-- User follows table
CREATE TABLE public.follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  following_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(follower_id, following_id),
  CHECK (follower_id != following_id)
);

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- Users can view their own follows (who they follow)
CREATE POLICY "Follows readable by follower"
ON public.follows FOR SELECT
USING (
  follower_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Anyone can view follows (for public display of follower counts)
CREATE POLICY "Follows viewable by everyone"
ON public.follows FOR SELECT
USING (true);

-- Users can follow other users
CREATE POLICY "Follows insertable by follower"
ON public.follows FOR INSERT
WITH CHECK (
  follower_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Users can unfollow other users
CREATE POLICY "Follows deletable by follower"
ON public.follows FOR DELETE
USING (
  follower_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Indexes for faster queries
CREATE INDEX idx_follows_follower_id ON public.follows(follower_id);
CREATE INDEX idx_follows_following_id ON public.follows(following_id);
CREATE INDEX idx_follows_created_at ON public.follows(created_at DESC);

