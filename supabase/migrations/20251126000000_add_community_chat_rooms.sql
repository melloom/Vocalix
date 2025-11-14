-- Community Chat Rooms Migration
-- Creates tables for community chat rooms and messages

-- Step 1: Create community_chat_rooms table
CREATE TABLE IF NOT EXISTS public.community_chat_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID REFERENCES public.communities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_public BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  message_count INT NOT NULL DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Step 2: Enable RLS on community_chat_rooms
DO $$ 
BEGIN
  ALTER TABLE public.community_chat_rooms ENABLE ROW LEVEL SECURITY;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

-- Step 3: Drop existing policies (idempotent)
DROP POLICY IF EXISTS "Chat rooms are viewable by community members" ON public.community_chat_rooms;
DROP POLICY IF EXISTS "Community members can create chat rooms" ON public.community_chat_rooms;
DROP POLICY IF EXISTS "Chat room creators can update" ON public.community_chat_rooms;
DROP POLICY IF EXISTS "Chat room creators can delete" ON public.community_chat_rooms;

-- Step 4: Create SELECT policy
CREATE POLICY "Chat rooms are viewable by community members"
ON public.community_chat_rooms FOR SELECT
USING (
  is_active = true AND (
    is_public = true OR
    community_id IN (
      SELECT community_id FROM public.community_members
      WHERE profile_id IN (
        SELECT id FROM public.profiles
        WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
      )
    )
  )
);

-- Step 5: Create INSERT policy
CREATE POLICY "Community members can create chat rooms"
ON public.community_chat_rooms FOR INSERT
WITH CHECK (
  created_by_profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  ) AND
  community_id IN (
    SELECT community_id FROM public.community_members
    WHERE profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
);

-- Step 6: Create UPDATE policy
CREATE POLICY "Chat room creators can update"
ON public.community_chat_rooms FOR UPDATE
USING (
  created_by_profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Step 7: Create DELETE policy
CREATE POLICY "Chat room creators can delete"
ON public.community_chat_rooms FOR DELETE
USING (
  created_by_profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Step 8: Create community_chat_messages table
CREATE TABLE IF NOT EXISTS public.community_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_room_id UUID REFERENCES public.community_chat_rooms(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  is_edited BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false,
  reply_to_message_id UUID REFERENCES public.community_chat_messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Step 9: Enable RLS on community_chat_messages
DO $$ 
BEGIN
  ALTER TABLE public.community_chat_messages ENABLE ROW LEVEL SECURITY;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

-- Step 10: Drop existing policies on community_chat_messages
DROP POLICY IF EXISTS "Chat messages are viewable by room members" ON public.community_chat_messages;
DROP POLICY IF EXISTS "Community members can send messages" ON public.community_chat_messages;
DROP POLICY IF EXISTS "Users can edit their own messages" ON public.community_chat_messages;
DROP POLICY IF EXISTS "Users can delete their own messages" ON public.community_chat_messages;

-- Step 11: Create policies for community_chat_messages
CREATE POLICY "Chat messages are viewable by room members"
ON public.community_chat_messages FOR SELECT
USING (
  chat_room_id IN (
    SELECT id FROM public.community_chat_rooms
    WHERE is_active = true AND (
      is_public = true OR
      community_id IN (
        SELECT community_id FROM public.community_members
        WHERE profile_id IN (
          SELECT id FROM public.profiles
          WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
        )
      )
    )
  )
);

CREATE POLICY "Community members can send messages"
ON public.community_chat_messages FOR INSERT
WITH CHECK (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  ) AND
  chat_room_id IN (
    SELECT id FROM public.community_chat_rooms
    WHERE is_active = true AND
    community_id IN (
      SELECT community_id FROM public.community_members
      WHERE profile_id IN (
        SELECT id FROM public.profiles
        WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
      )
    )
  )
);

CREATE POLICY "Users can edit their own messages"
ON public.community_chat_messages FOR UPDATE
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

CREATE POLICY "Users can delete their own messages"
ON public.community_chat_messages FOR UPDATE
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

-- Step 12: Create indexes
CREATE INDEX IF NOT EXISTS idx_chat_rooms_community ON public.community_chat_rooms(community_id);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_active ON public.community_chat_rooms(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_chat_messages_room ON public.community_chat_messages(chat_room_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_profile ON public.community_chat_messages(profile_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON public.community_chat_messages(chat_room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_reply ON public.community_chat_messages(reply_to_message_id);

-- Step 13: Create function to update chat room message count and last message
CREATE OR REPLACE FUNCTION public.update_chat_room_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.community_chat_rooms
    SET 
      message_count = message_count + 1,
      last_message_at = NEW.created_at,
      updated_at = now()
    WHERE id = NEW.chat_room_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.community_chat_rooms
    SET 
      message_count = GREATEST(0, message_count - 1),
      updated_at = now()
    WHERE id = OLD.chat_room_id;
    -- Update last_message_at to the most recent message
    UPDATE public.community_chat_rooms
    SET last_message_at = (
      SELECT MAX(created_at) 
      FROM public.community_chat_messages 
      WHERE chat_room_id = OLD.chat_room_id AND is_deleted = false
    )
    WHERE id = OLD.chat_room_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Step 14: Create trigger for chat room stats
DROP TRIGGER IF EXISTS update_chat_room_stats_trigger ON public.community_chat_messages;
CREATE TRIGGER update_chat_room_stats_trigger
AFTER INSERT OR DELETE ON public.community_chat_messages
FOR EACH ROW EXECUTE FUNCTION public.update_chat_room_stats();

-- Step 15: Add updated_at trigger
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.routines 
    WHERE routine_schema = 'public' 
    AND routine_name = 'handle_updated_at'
  ) THEN
    DROP TRIGGER IF EXISTS set_updated_at_chat_rooms ON public.community_chat_rooms;
    CREATE TRIGGER set_updated_at_chat_rooms
    BEFORE UPDATE ON public.community_chat_rooms
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
    
    DROP TRIGGER IF EXISTS set_updated_at_chat_messages ON public.community_chat_messages;
    CREATE TRIGGER set_updated_at_chat_messages
    BEFORE UPDATE ON public.community_chat_messages
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

