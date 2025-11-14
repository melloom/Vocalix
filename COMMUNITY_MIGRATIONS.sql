-- ============================================
-- Community Features Migrations
-- ============================================
-- This migration adds:
-- 1. Live Audio Rooms (with participants, recordings, transcripts)
-- 2. Community Chat Rooms (with real-time messaging)
-- 3. Community Follows (follow/unfollow communities)
-- ============================================
-- Run this in Supabase Dashboard > SQL Editor
-- Or use: npx supabase db push
-- ============================================


-- ============================================
-- 20251125000000_add_live_audio_rooms.sql
-- ============================================

-- Live Audio Rooms Migration
-- Creates tables for live audio rooms, participants, recordings, and transcripts

-- Step 1: Create live_rooms table
CREATE TABLE IF NOT EXISTS public.live_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  host_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  community_id UUID REFERENCES public.communities(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'scheduled', -- scheduled, live, ended
  is_public BOOLEAN DEFAULT true,
  max_speakers INT DEFAULT 10,
  max_listeners INT DEFAULT 100,
  scheduled_start_time TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  participant_count INT NOT NULL DEFAULT 0,
  speaker_count INT NOT NULL DEFAULT 0,
  listener_count INT NOT NULL DEFAULT 0,
  recording_enabled BOOLEAN DEFAULT true,
  transcription_enabled BOOLEAN DEFAULT true,
  webrtc_room_id TEXT UNIQUE, -- For WebRTC service integration
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Step 2: Enable RLS on live_rooms
DO $$ 
BEGIN
  ALTER TABLE public.live_rooms ENABLE ROW LEVEL SECURITY;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

-- Step 3: Drop existing policies (idempotent)
DROP POLICY IF EXISTS "Live rooms are viewable by everyone" ON public.live_rooms;
DROP POLICY IF EXISTS "Users can create live rooms" ON public.live_rooms;
DROP POLICY IF EXISTS "Room hosts can update their rooms" ON public.live_rooms;
DROP POLICY IF EXISTS "Room hosts can delete their rooms" ON public.live_rooms;

-- Step 4: Create SELECT policy
CREATE POLICY "Live rooms are viewable by everyone"
ON public.live_rooms FOR SELECT
USING (is_public = true OR status = 'live');

-- Step 5: Create INSERT policy
CREATE POLICY "Users can create live rooms"
ON public.live_rooms FOR INSERT
WITH CHECK (
  host_profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Step 6: Create UPDATE policy
CREATE POLICY "Room hosts can update their rooms"
ON public.live_rooms FOR UPDATE
USING (
  host_profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Step 7: Create DELETE policy
CREATE POLICY "Room hosts can delete their rooms"
ON public.live_rooms FOR DELETE
USING (
  host_profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Step 8: Create room_participants table
CREATE TABLE IF NOT EXISTS public.room_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES public.live_rooms(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'listener', -- host, speaker, listener, moderator
  is_muted BOOLEAN DEFAULT false,
  is_speaking BOOLEAN DEFAULT false,
  joined_at TIMESTAMPTZ DEFAULT now(),
  left_at TIMESTAMPTZ,
  webrtc_connection_id TEXT, -- For WebRTC tracking
  UNIQUE(room_id, profile_id)
);

-- Step 9: Enable RLS on room_participants
DO $$ 
BEGIN
  ALTER TABLE public.room_participants ENABLE ROW LEVEL SECURITY;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

-- Step 10: Drop existing policies on room_participants
DROP POLICY IF EXISTS "Participants can view room participants" ON public.room_participants;
DROP POLICY IF EXISTS "Users can join rooms" ON public.room_participants;
DROP POLICY IF EXISTS "Users can update their own participation" ON public.room_participants;
DROP POLICY IF EXISTS "Users can leave rooms" ON public.room_participants;
DROP POLICY IF EXISTS "Room hosts can manage participants" ON public.room_participants;

-- Step 11: Create policies for room_participants
CREATE POLICY "Participants can view room participants"
ON public.room_participants FOR SELECT
USING (true);

CREATE POLICY "Users can join rooms"
ON public.room_participants FOR INSERT
WITH CHECK (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

CREATE POLICY "Users can update their own participation"
ON public.room_participants FOR UPDATE
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

CREATE POLICY "Users can leave rooms"
ON public.room_participants FOR DELETE
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

CREATE POLICY "Room hosts can manage participants"
ON public.room_participants FOR UPDATE
USING (
  room_id IN (
    SELECT id FROM public.live_rooms
    WHERE host_profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
);

-- Step 12: Create room_recordings table
CREATE TABLE IF NOT EXISTS public.room_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES public.live_rooms(id) ON DELETE CASCADE,
  audio_path TEXT NOT NULL,
  duration_seconds INT,
  file_size_bytes BIGINT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'processing', -- processing, completed, failed
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Step 13: Enable RLS on room_recordings
DO $$ 
BEGIN
  ALTER TABLE public.room_recordings ENABLE ROW LEVEL SECURITY;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

-- Step 14: Create policies for room_recordings
DROP POLICY IF EXISTS "Recordings are viewable by everyone" ON public.room_recordings;
DROP POLICY IF EXISTS "Room hosts can create recordings" ON public.room_recordings;

CREATE POLICY "Recordings are viewable by everyone"
ON public.room_recordings FOR SELECT
USING (true);

CREATE POLICY "Room hosts can create recordings"
ON public.room_recordings FOR INSERT
WITH CHECK (
  room_id IN (
    SELECT id FROM public.live_rooms
    WHERE host_profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
);

-- Step 15: Create room_transcripts table
CREATE TABLE IF NOT EXISTS public.room_transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES public.live_rooms(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  text TEXT NOT NULL,
  timestamp_seconds INT NOT NULL,
  confidence FLOAT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Step 16: Enable RLS on room_transcripts
DO $$ 
BEGIN
  ALTER TABLE public.room_transcripts ENABLE ROW LEVEL SECURITY;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

-- Step 17: Create policies for room_transcripts
DROP POLICY IF EXISTS "Transcripts are viewable by everyone" ON public.room_transcripts;
DROP POLICY IF EXISTS "System can create transcripts" ON public.room_transcripts;

CREATE POLICY "Transcripts are viewable by everyone"
ON public.room_transcripts FOR SELECT
USING (true);

CREATE POLICY "System can create transcripts"
ON public.room_transcripts FOR INSERT
WITH CHECK (true); -- Allow system/backend to insert transcripts

-- Step 18: Create indexes
CREATE INDEX IF NOT EXISTS idx_live_rooms_status ON public.live_rooms(status) WHERE status = 'live';
CREATE INDEX IF NOT EXISTS idx_live_rooms_host ON public.live_rooms(host_profile_id);
CREATE INDEX IF NOT EXISTS idx_live_rooms_community ON public.live_rooms(community_id);
CREATE INDEX IF NOT EXISTS idx_live_rooms_scheduled_start ON public.live_rooms(scheduled_start_time) WHERE scheduled_start_time IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_room_participants_room ON public.room_participants(room_id);
CREATE INDEX IF NOT EXISTS idx_room_participants_profile ON public.room_participants(profile_id);
CREATE INDEX IF NOT EXISTS idx_room_participants_role ON public.room_participants(role);
CREATE INDEX IF NOT EXISTS idx_room_recordings_room ON public.room_recordings(room_id);
CREATE INDEX IF NOT EXISTS idx_room_transcripts_room ON public.room_transcripts(room_id);
CREATE INDEX IF NOT EXISTS idx_room_transcripts_timestamp ON public.room_transcripts(room_id, timestamp_seconds);

-- Step 19: Create function to update room participant counts
CREATE OR REPLACE FUNCTION public.update_room_participant_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.live_rooms
    SET 
      participant_count = participant_count + 1,
      speaker_count = CASE WHEN NEW.role IN ('host', 'speaker', 'moderator') THEN speaker_count + 1 ELSE speaker_count END,
      listener_count = CASE WHEN NEW.role = 'listener' THEN listener_count + 1 ELSE listener_count END
    WHERE id = NEW.room_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.live_rooms
    SET 
      participant_count = GREATEST(0, participant_count - 1),
      speaker_count = CASE WHEN OLD.role IN ('host', 'speaker', 'moderator') THEN GREATEST(0, speaker_count - 1) ELSE speaker_count END,
      listener_count = CASE WHEN OLD.role = 'listener' THEN GREATEST(0, listener_count - 1) ELSE listener_count END
    WHERE id = OLD.room_id;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Handle role changes
    IF OLD.role IS DISTINCT FROM NEW.role THEN
      UPDATE public.live_rooms
      SET 
        speaker_count = CASE 
          WHEN OLD.role IN ('host', 'speaker', 'moderator') AND NEW.role NOT IN ('host', 'speaker', 'moderator') THEN GREATEST(0, speaker_count - 1)
          WHEN OLD.role NOT IN ('host', 'speaker', 'moderator') AND NEW.role IN ('host', 'speaker', 'moderator') THEN speaker_count + 1
          ELSE speaker_count
        END,
        listener_count = CASE 
          WHEN OLD.role = 'listener' AND NEW.role != 'listener' THEN GREATEST(0, listener_count - 1)
          WHEN OLD.role != 'listener' AND NEW.role = 'listener' THEN listener_count + 1
          ELSE listener_count
        END
      WHERE id = NEW.room_id;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Step 20: Create trigger for participant count
DROP TRIGGER IF EXISTS update_room_participant_count_trigger ON public.room_participants;
CREATE TRIGGER update_room_participant_count_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.room_participants
FOR EACH ROW EXECUTE FUNCTION public.update_room_participant_count();

-- Step 21: Add updated_at trigger
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.routines 
    WHERE routine_schema = 'public' 
    AND routine_name = 'handle_updated_at'
  ) THEN
    DROP TRIGGER IF EXISTS set_updated_at_live_rooms ON public.live_rooms;
    CREATE TRIGGER set_updated_at_live_rooms
    BEFORE UPDATE ON public.live_rooms
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
    
    DROP TRIGGER IF EXISTS set_updated_at_room_recordings ON public.room_recordings;
    CREATE TRIGGER set_updated_at_room_recordings
    BEFORE UPDATE ON public.room_recordings
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;




-- ============================================
-- 20251126000000_add_community_chat_rooms.sql
-- ============================================

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




-- ============================================
-- 20251127000000_add_community_follows.sql
-- ============================================

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



