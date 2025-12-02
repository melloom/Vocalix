-- User blocks table
-- Allows users to block other users to prevent seeing their content and interactions

CREATE TABLE IF NOT EXISTS public.user_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(blocker_id, blocked_id),
  CHECK (blocker_id != blocked_id)
);

-- Enable RLS
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS "Users can view their own blocks" ON public.user_blocks;
DROP POLICY IF EXISTS "Users can block other users" ON public.user_blocks;
DROP POLICY IF EXISTS "Users can unblock other users" ON public.user_blocks;

-- Users can view their own blocks (who they've blocked)
CREATE POLICY "Users can view their own blocks"
ON public.user_blocks FOR SELECT
USING (
  blocker_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Users can block other users
CREATE POLICY "Users can block other users"
ON public.user_blocks FOR INSERT
WITH CHECK (
  blocker_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Users can unblock other users
CREATE POLICY "Users can unblock other users"
ON public.user_blocks FOR DELETE
USING (
  blocker_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker_id ON public.user_blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked_id ON public.user_blocks(blocked_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_created_at ON public.user_blocks(created_at DESC);

-- Function to check if a user is blocked
CREATE OR REPLACE FUNCTION public.is_user_blocked(
  blocker_id_param UUID,
  blocked_id_param UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE blocker_id = blocker_id_param
      AND blocked_id = blocked_id_param
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to automatically unfollow when blocking
CREATE OR REPLACE FUNCTION public.handle_user_block()
RETURNS TRIGGER AS $$
BEGIN
  -- Remove follow relationship if it exists (both directions)
  DELETE FROM public.follows
  WHERE (follower_id = NEW.blocker_id AND following_id = NEW.blocked_id)
     OR (follower_id = NEW.blocked_id AND following_id = NEW.blocker_id);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to unfollow on block
CREATE TRIGGER trigger_unfollow_on_block
  AFTER INSERT ON public.user_blocks
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_block();

-- Comments
COMMENT ON TABLE public.user_blocks IS 'Tracks which users have blocked other users';
COMMENT ON FUNCTION public.is_user_blocked IS 'Checks if a user has blocked another user';
COMMENT ON FUNCTION public.handle_user_block IS 'Automatically removes follow relationships when a user blocks another';

