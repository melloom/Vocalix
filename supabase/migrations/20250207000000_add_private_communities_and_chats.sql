-- Private Communities and Private Live Chats Migration
-- Adds proper support for private communities and standalone private live chats

-- ============================================
-- PART 1: Fix Private Communities RLS Policies
-- ============================================

-- Add is_visible_publicly column to communities (allows private communities to be visible but require permission to join)
ALTER TABLE public.communities
ADD COLUMN IF NOT EXISTS is_visible_publicly BOOLEAN DEFAULT false;

-- Update existing private communities to not be visible publicly by default
UPDATE public.communities
SET is_visible_publicly = false
WHERE is_public = false AND is_visible_publicly IS NULL;

-- Drop existing SELECT policy that shows all communities
DROP POLICY IF EXISTS "Communities are viewable by everyone" ON public.communities;
DROP POLICY IF EXISTS "Communities are viewable based on privacy" ON public.communities;

-- Create new SELECT policy that properly handles private communities
-- Public communities: visible to everyone (including anonymous users) - NO CHECKS NEEDED
-- Private communities with is_visible_publicly=true: visible to everyone (but require permission to join)
-- Private communities with is_visible_publicly=false: only visible to members, creators, and moderators
CREATE POLICY "Communities are viewable based on privacy"
ON public.communities FOR SELECT
USING (
  is_active = true AND (
    -- Public communities are visible to everyone (including anonymous users) - simplest case first
    is_public = true
    OR
    -- Private communities with is_visible_publicly=true are visible to everyone
    (is_public = false AND is_visible_publicly = true)
    OR
    -- For private communities with is_visible_publicly=false, check if user has access
    (
      is_public = false AND is_visible_publicly = false AND (
        -- Creator can see their own community
        created_by_profile_id IN (SELECT id FROM public.profile_ids_for_request())
        OR
        -- Members can see communities they're part of
        id IN (
          SELECT community_id FROM public.community_members
          WHERE profile_id IN (SELECT id FROM public.profile_ids_for_request())
        )
        OR
        -- Moderators can see communities they moderate
        id IN (
          SELECT community_id FROM public.community_moderators
          WHERE moderator_profile_id IN (SELECT id FROM public.profile_ids_for_request())
        )
      )
    )
  )
);

-- Update community memberships policy to hide private community memberships
DROP POLICY IF EXISTS "Community memberships viewable by everyone" ON public.community_members;
DROP POLICY IF EXISTS "Community memberships viewable based on privacy" ON public.community_members;

-- Members can view their own memberships
-- Others can only see memberships for public communities
CREATE POLICY "Community memberships viewable based on privacy"
ON public.community_members FOR SELECT
USING (
  -- Users can always see their own memberships
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
  OR
  -- Others can see memberships for public communities only
  community_id IN (
    SELECT id FROM public.communities
    WHERE is_public = true
  )
);

-- ============================================
-- PART 2: Create Private Live Chats Tables
-- ============================================

-- Create private_chats table for standalone private group chats
CREATE TABLE IF NOT EXISTS public.private_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  avatar_emoji TEXT NOT NULL DEFAULT '💬',
  is_active BOOLEAN DEFAULT true,
  message_count INT NOT NULL DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.private_chats ENABLE ROW LEVEL SECURITY;

-- Create private_chat_participants table
CREATE TABLE IF NOT EXISTS public.private_chat_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID REFERENCES public.private_chats(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT now(),
  is_admin BOOLEAN DEFAULT false, -- Chat creator and admins can add/remove participants
  UNIQUE(chat_id, profile_id)
);

-- Enable RLS
ALTER TABLE public.private_chat_participants ENABLE ROW LEVEL SECURITY;

-- Create private_chat_messages table
CREATE TABLE IF NOT EXISTS public.private_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID REFERENCES public.private_chats(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  is_edited BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false,
  reply_to_message_id UUID REFERENCES public.private_chat_messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.private_chat_messages ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PART 3: RLS Policies for Private Chats
-- ============================================

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS "Private chats are viewable by participants" ON public.private_chats;
DROP POLICY IF EXISTS "Users can create private chats" ON public.private_chats;
DROP POLICY IF EXISTS "Chat creators and admins can update" ON public.private_chats;
DROP POLICY IF EXISTS "Chat creators and admins can delete" ON public.private_chats;
DROP POLICY IF EXISTS "Private chat participants are viewable by participants" ON public.private_chat_participants;
DROP POLICY IF EXISTS "Chat participants can add other participants" ON public.private_chat_participants;
DROP POLICY IF EXISTS "Chat creators and admins can add participants" ON public.private_chat_participants;
DROP POLICY IF EXISTS "Participants can leave or be removed" ON public.private_chat_participants;
DROP POLICY IF EXISTS "Chat creators and admins can update participants" ON public.private_chat_participants;
DROP POLICY IF EXISTS "Private chat messages are viewable by participants" ON public.private_chat_messages;
DROP POLICY IF EXISTS "Participants can send messages" ON public.private_chat_messages;
DROP POLICY IF EXISTS "Community members can send messages" ON public.private_chat_messages;
DROP POLICY IF EXISTS "Users can edit their own messages" ON public.private_chat_messages;

-- Private chats: only visible to participants
CREATE POLICY "Private chats are viewable by participants"
ON public.private_chats FOR SELECT
USING (
  is_active = true AND
  id IN (
    SELECT chat_id FROM public.private_chat_participants
    WHERE profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
);

-- Users can create private chats
CREATE POLICY "Users can create private chats"
ON public.private_chats FOR INSERT
WITH CHECK (
  created_by_profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Chat creators and admins can update chats
CREATE POLICY "Chat creators and admins can update"
ON public.private_chats FOR UPDATE
USING (
  created_by_profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
  OR
  id IN (
    SELECT chat_id FROM public.private_chat_participants
    WHERE profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
    AND is_admin = true
  )
);

-- Chat creators and admins can delete chats
CREATE POLICY "Chat creators and admins can delete"
ON public.private_chats FOR DELETE
USING (
  created_by_profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
  OR
  id IN (
    SELECT chat_id FROM public.private_chat_participants
    WHERE profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
    AND is_admin = true
  )
);

-- Private chat participants: only visible to participants
CREATE POLICY "Private chat participants are viewable by participants"
ON public.private_chat_participants FOR SELECT
USING (
  chat_id IN (
    SELECT chat_id FROM public.private_chat_participants
    WHERE profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
);

-- All participants can add other participants (anyone in the chat can invite)
CREATE POLICY "Chat participants can add other participants"
ON public.private_chat_participants FOR INSERT
WITH CHECK (
  chat_id IN (
    SELECT chat_id FROM public.private_chat_participants
    WHERE profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
);

-- Participants can leave, creators and admins can remove participants
CREATE POLICY "Participants can leave or be removed"
ON public.private_chat_participants FOR DELETE
USING (
  -- Participants can remove themselves
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
  OR
  -- Creators and admins can remove anyone
  chat_id IN (
    SELECT id FROM public.private_chats
    WHERE created_by_profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
  OR
  chat_id IN (
    SELECT chat_id FROM public.private_chat_participants
    WHERE profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
    AND is_admin = true
  )
);

-- Chat creators and admins can update participant roles
CREATE POLICY "Chat creators and admins can update participants"
ON public.private_chat_participants FOR UPDATE
USING (
  chat_id IN (
    SELECT id FROM public.private_chats
    WHERE created_by_profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
  OR
  chat_id IN (
    SELECT chat_id FROM public.private_chat_participants
    WHERE profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
    AND is_admin = true
  )
);

-- Private chat messages: only visible to participants
CREATE POLICY "Private chat messages are viewable by participants"
ON public.private_chat_messages FOR SELECT
USING (
  chat_id IN (
    SELECT chat_id FROM public.private_chat_participants
    WHERE profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
);

-- Participants can send messages
CREATE POLICY "Participants can send messages"
ON public.private_chat_messages FOR INSERT
WITH CHECK (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
  AND
  chat_id IN (
    SELECT chat_id FROM public.private_chat_participants
    WHERE profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
);

-- Users can edit their own messages
CREATE POLICY "Users can edit their own messages"
ON public.private_chat_messages FOR UPDATE
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
)
WITH CHECK (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- ============================================
-- PART 4: Indexes for Performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_private_chats_created_by ON public.private_chats(created_by_profile_id);
CREATE INDEX IF NOT EXISTS idx_private_chats_active ON public.private_chats(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_private_chat_participants_chat ON public.private_chat_participants(chat_id);
CREATE INDEX IF NOT EXISTS idx_private_chat_participants_profile ON public.private_chat_participants(profile_id);
CREATE INDEX IF NOT EXISTS idx_private_chat_messages_chat ON public.private_chat_messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_private_chat_messages_profile ON public.private_chat_messages(profile_id);
CREATE INDEX IF NOT EXISTS idx_private_chat_messages_created ON public.private_chat_messages(chat_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_private_chat_messages_reply ON public.private_chat_messages(reply_to_message_id);

-- ============================================
-- PART 5: Functions and Triggers
-- ============================================

-- Function to update private chat message count and last message
CREATE OR REPLACE FUNCTION public.update_private_chat_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.private_chats
    SET 
      message_count = message_count + 1,
      last_message_at = NEW.created_at,
      updated_at = now()
    WHERE id = NEW.chat_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.private_chats
    SET 
      message_count = GREATEST(0, message_count - 1),
      updated_at = now()
    WHERE id = OLD.chat_id;
    -- Update last_message_at to the most recent message
    UPDATE public.private_chats
    SET last_message_at = (
      SELECT MAX(created_at) 
      FROM public.private_chat_messages 
      WHERE chat_id = OLD.chat_id AND is_deleted = false
    )
    WHERE id = OLD.chat_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger for chat stats
DROP TRIGGER IF EXISTS update_private_chat_stats_trigger ON public.private_chat_messages;
CREATE TRIGGER update_private_chat_stats_trigger
AFTER INSERT OR DELETE ON public.private_chat_messages
FOR EACH ROW EXECUTE FUNCTION public.update_private_chat_stats();

-- Function to auto-add creator as admin participant when chat is created
CREATE OR REPLACE FUNCTION public.auto_add_chat_creator()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.created_by_profile_id IS NOT NULL THEN
    INSERT INTO public.private_chat_participants (chat_id, profile_id, is_admin)
    VALUES (NEW.id, NEW.created_by_profile_id, true)
    ON CONFLICT (chat_id, profile_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to auto-add creator
DROP TRIGGER IF EXISTS auto_add_chat_creator_trigger ON public.private_chats;
CREATE TRIGGER auto_add_chat_creator_trigger
AFTER INSERT ON public.private_chats
FOR EACH ROW EXECUTE FUNCTION public.auto_add_chat_creator();

-- Add updated_at triggers
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.routines 
    WHERE routine_schema = 'public' 
    AND routine_name = 'handle_updated_at'
  ) THEN
    DROP TRIGGER IF EXISTS set_updated_at_private_chats ON public.private_chats;
    CREATE TRIGGER set_updated_at_private_chats
    BEFORE UPDATE ON public.private_chats
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
    
    DROP TRIGGER IF EXISTS set_updated_at_private_chat_messages ON public.private_chat_messages;
    CREATE TRIGGER set_updated_at_private_chat_messages
    BEFORE UPDATE ON public.private_chat_messages
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

-- ============================================
-- PART 6: Helper Functions
-- ============================================

-- Function to check if user is participant in a private chat
CREATE OR REPLACE FUNCTION public.is_private_chat_participant(
  p_chat_id UUID,
  p_profile_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.private_chat_participants
    WHERE chat_id = p_chat_id
    AND profile_id = p_profile_id
  );
END;
$$;

-- Function to check if user is admin in a private chat
CREATE OR REPLACE FUNCTION public.is_private_chat_admin(
  p_chat_id UUID,
  p_profile_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.private_chat_participants
    WHERE chat_id = p_chat_id
    AND profile_id = p_profile_id
    AND is_admin = true
  )
  OR EXISTS (
    SELECT 1 FROM public.private_chats
    WHERE id = p_chat_id
    AND created_by_profile_id = p_profile_id
  );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.is_private_chat_participant(UUID, UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_private_chat_admin(UUID, UUID) TO authenticated, anon;

COMMENT ON TABLE public.private_chats IS 'Standalone private group chats (not tied to communities)';
COMMENT ON TABLE public.private_chat_participants IS 'Participants in private chats';
COMMENT ON TABLE public.private_chat_messages IS 'Messages in private chats';
COMMENT ON COLUMN public.private_chat_participants.is_admin IS 'Whether the participant is an admin (can add/remove participants)';


