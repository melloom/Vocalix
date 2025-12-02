-- Community Follows Migration
-- Allows users to follow/unfollow communities (separate from joining)

-- Step 1: Create community_follows table
CREATE TABLE IF NOT EXISTS public.community_follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  community_id UUID REFERENCES public.communities(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(profile_id, community_id)
);

-- Step 2: Enable RLS on community_follows
DO $$ 
BEGIN
  ALTER TABLE public.community_follows ENABLE ROW LEVEL SECURITY;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

-- Step 3: Drop existing policies (idempotent)
DROP POLICY IF EXISTS "Users can view their own community follows" ON public.community_follows;
DROP POLICY IF EXISTS "Community follows viewable by everyone" ON public.community_follows;
DROP POLICY IF EXISTS "Users can follow communities" ON public.community_follows;
DROP POLICY IF EXISTS "Users can unfollow communities" ON public.community_follows;

-- Step 4: Create SELECT policies
CREATE POLICY "Users can view their own community follows"
ON public.community_follows FOR SELECT
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

CREATE POLICY "Community follows viewable by everyone"
ON public.community_follows FOR SELECT
USING (true);

-- Step 5: Create INSERT policy
CREATE POLICY "Users can follow communities"
ON public.community_follows FOR INSERT
WITH CHECK (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Step 6: Create DELETE policy
CREATE POLICY "Users can unfollow communities"
ON public.community_follows FOR DELETE
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Step 7: Create indexes
CREATE INDEX IF NOT EXISTS idx_community_follows_profile ON public.community_follows(profile_id);
CREATE INDEX IF NOT EXISTS idx_community_follows_community ON public.community_follows(community_id);
CREATE INDEX IF NOT EXISTS idx_community_follows_created ON public.community_follows(created_at DESC);

-- Step 8: Add follower_count column to communities if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'communities' 
    AND column_name = 'follower_count'
  ) THEN
    ALTER TABLE public.communities ADD COLUMN follower_count INT NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Step 9: Create function to update community follower count
CREATE OR REPLACE FUNCTION public.update_community_follower_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.communities
    SET follower_count = follower_count + 1
    WHERE id = NEW.community_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.communities
    SET follower_count = GREATEST(0, follower_count - 1)
    WHERE id = OLD.community_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Step 10: Create trigger for follower count
DROP TRIGGER IF EXISTS update_community_follower_count_trigger ON public.community_follows;
CREATE TRIGGER update_community_follower_count_trigger
AFTER INSERT OR DELETE ON public.community_follows
FOR EACH ROW EXECUTE FUNCTION public.update_community_follower_count();

-- Step 11: Initialize follower counts for existing communities
UPDATE public.communities
SET follower_count = (
  SELECT COUNT(*) 
  FROM public.community_follows 
  WHERE community_follows.community_id = communities.id
);

