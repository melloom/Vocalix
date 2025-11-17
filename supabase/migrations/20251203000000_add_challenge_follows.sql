-- Challenge Follows Migration
-- Allows users to follow/unfollow challenges to get notified of new clips

-- Step 1: Create challenge_follows table
CREATE TABLE IF NOT EXISTS public.challenge_follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  challenge_id UUID REFERENCES public.challenges(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(profile_id, challenge_id)
);

-- Step 2: Enable RLS on challenge_follows
DO $$ 
BEGIN
  ALTER TABLE public.challenge_follows ENABLE ROW LEVEL SECURITY;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

-- Step 3: Drop existing policies (idempotent)
DROP POLICY IF EXISTS "Users can view their own challenge follows" ON public.challenge_follows;
DROP POLICY IF EXISTS "Challenge follows viewable by everyone" ON public.challenge_follows;
DROP POLICY IF EXISTS "Users can follow challenges" ON public.challenge_follows;
DROP POLICY IF EXISTS "Users can unfollow challenges" ON public.challenge_follows;

-- Step 4: Create SELECT policies
CREATE POLICY "Users can view their own challenge follows"
ON public.challenge_follows FOR SELECT
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

CREATE POLICY "Challenge follows viewable by everyone"
ON public.challenge_follows FOR SELECT
USING (true);

-- Step 5: Create INSERT policy
CREATE POLICY "Users can follow challenges"
ON public.challenge_follows FOR INSERT
WITH CHECK (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Step 6: Create DELETE policy
CREATE POLICY "Users can unfollow challenges"
ON public.challenge_follows FOR DELETE
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Step 7: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_challenge_follows_profile_id ON public.challenge_follows(profile_id);
CREATE INDEX IF NOT EXISTS idx_challenge_follows_challenge_id ON public.challenge_follows(challenge_id);
CREATE INDEX IF NOT EXISTS idx_challenge_follows_created_at ON public.challenge_follows(created_at DESC);

