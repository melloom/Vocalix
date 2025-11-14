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
DROP POLICY IF EXISTS "Community live rooms are viewable by members" ON public.live_rooms;
DROP POLICY IF EXISTS "Users can create live rooms" ON public.live_rooms;
DROP POLICY IF EXISTS "Community members can create community live rooms" ON public.live_rooms;
DROP POLICY IF EXISTS "Room hosts can update their rooms" ON public.live_rooms;
DROP POLICY IF EXISTS "Room hosts can delete their rooms" ON public.live_rooms;

-- Step 4: Create SELECT policies
-- Public rooms or non-community rooms are viewable by everyone
CREATE POLICY "Live rooms are viewable by everyone"
ON public.live_rooms FOR SELECT
USING (
  (is_public = true OR status = 'live') 
  AND community_id IS NULL
);

-- Community rooms are only viewable by community members
CREATE POLICY "Community live rooms are viewable by members"
ON public.live_rooms FOR SELECT
USING (
  community_id IS NOT NULL AND
  (
    -- User is a member of the community
    EXISTS (
      SELECT 1 FROM public.community_members
      WHERE community_id = live_rooms.community_id
      AND profile_id IN (
        SELECT id FROM public.profiles
        WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
      )
    )
    OR
    -- Room is public and live (for discovery)
    (is_public = true AND status = 'live')
  )
);

-- Step 5: Create INSERT policies
-- Users can create non-community live rooms
CREATE POLICY "Users can create live rooms"
ON public.live_rooms FOR INSERT
WITH CHECK (
  community_id IS NULL AND
  host_profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Community members can create community live rooms
CREATE POLICY "Community members can create community live rooms"
ON public.live_rooms FOR INSERT
WITH CHECK (
  community_id IS NOT NULL AND
  host_profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  ) AND
  EXISTS (
    SELECT 1 FROM public.community_members
    WHERE community_id = live_rooms.community_id
    AND profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
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
DROP POLICY IF EXISTS "Community members can join community rooms" ON public.room_participants;
DROP POLICY IF EXISTS "Users can update their own participation" ON public.room_participants;
DROP POLICY IF EXISTS "Users can leave rooms" ON public.room_participants;
DROP POLICY IF EXISTS "Room hosts can manage participants" ON public.room_participants;

-- Step 11: Create policies for room_participants
CREATE POLICY "Participants can view room participants"
ON public.room_participants FOR SELECT
USING (true);

-- Users can join non-community rooms
CREATE POLICY "Users can join rooms"
ON public.room_participants FOR INSERT
WITH CHECK (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  ) AND
  room_id IN (
    SELECT id FROM public.live_rooms
    WHERE community_id IS NULL
  )
);

-- Community members can join community rooms
CREATE POLICY "Community members can join community rooms"
ON public.room_participants FOR INSERT
WITH CHECK (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  ) AND
  room_id IN (
    SELECT id FROM public.live_rooms
    WHERE community_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.community_members
      WHERE community_id = live_rooms.community_id
      AND profile_id IN (
        SELECT id FROM public.profiles
        WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
      )
    )
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

