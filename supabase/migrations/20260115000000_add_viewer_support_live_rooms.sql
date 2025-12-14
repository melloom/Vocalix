-- Add viewer support to live rooms
-- Viewers can watch/listen but not speak unless promoted by host

-- Step 1: Add viewer_count to live_rooms table
ALTER TABLE public.live_rooms 
ADD COLUMN IF NOT EXISTS viewer_count INT NOT NULL DEFAULT 0;

-- Step 2: Update the participant count function to handle viewer role
CREATE OR REPLACE FUNCTION public.update_room_participant_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.live_rooms
    SET 
      participant_count = participant_count + 1,
      speaker_count = CASE WHEN NEW.role IN ('host', 'speaker', 'moderator') THEN speaker_count + 1 ELSE speaker_count END,
      listener_count = CASE WHEN NEW.role = 'listener' THEN listener_count + 1 ELSE listener_count END,
      viewer_count = CASE WHEN NEW.role = 'viewer' THEN viewer_count + 1 ELSE viewer_count END
    WHERE id = NEW.room_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.live_rooms
    SET 
      participant_count = GREATEST(0, participant_count - 1),
      speaker_count = CASE WHEN OLD.role IN ('host', 'speaker', 'moderator') THEN GREATEST(0, speaker_count - 1) ELSE speaker_count END,
      listener_count = CASE WHEN OLD.role = 'listener' THEN GREATEST(0, listener_count - 1) ELSE listener_count END,
      viewer_count = CASE WHEN OLD.role = 'viewer' THEN GREATEST(0, viewer_count - 1) ELSE viewer_count END
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
        END,
        viewer_count = CASE 
          WHEN OLD.role = 'viewer' AND NEW.role != 'viewer' THEN GREATEST(0, viewer_count - 1)
          WHEN OLD.role != 'viewer' AND NEW.role = 'viewer' THEN viewer_count + 1
          ELSE viewer_count
        END
      WHERE id = NEW.room_id;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Step 3: Add function to promote viewer to speaker
CREATE OR REPLACE FUNCTION public.promote_viewer_to_speaker(
  p_room_id UUID,
  p_profile_id UUID,
  p_host_profile_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_is_host BOOLEAN;
  v_current_role TEXT;
  v_max_speakers INT;
  v_current_speaker_count INT;
BEGIN
  -- Check if requester is the host
  SELECT host_profile_id = p_host_profile_id INTO v_is_host
  FROM public.live_rooms
  WHERE id = p_room_id;
  
  IF NOT v_is_host THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the host can promote viewers to speakers');
  END IF;
  
  -- Check current role
  SELECT role INTO v_current_role
  FROM public.room_participants
  WHERE room_id = p_room_id AND profile_id = p_profile_id AND left_at IS NULL;
  
  IF v_current_role IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User is not a participant in this room');
  END IF;
  
  IF v_current_role IN ('host', 'speaker', 'moderator') THEN
    RETURN jsonb_build_object('success', false, 'error', 'User is already a speaker');
  END IF;
  
  -- Check max speakers limit
  SELECT max_speakers, speaker_count INTO v_max_speakers, v_current_speaker_count
  FROM public.live_rooms
  WHERE id = p_room_id;
  
  IF v_current_speaker_count >= v_max_speakers THEN
    RETURN jsonb_build_object('success', false, 'error', 'Room has reached maximum speaker limit');
  END IF;
  
  -- Promote to speaker
  UPDATE public.room_participants
  SET role = 'speaker'
  WHERE room_id = p_room_id AND profile_id = p_profile_id AND left_at IS NULL;
  
  RETURN jsonb_build_object('success', true, 'message', 'Viewer promoted to speaker');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Step 4: Add function to invite viewer to join as speaker
CREATE OR REPLACE FUNCTION public.invite_viewer_to_speak(
  p_room_id UUID,
  p_profile_id UUID,
  p_host_profile_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_is_host BOOLEAN;
  v_max_speakers INT;
  v_current_speaker_count INT;
  v_participant_exists BOOLEAN;
BEGIN
  -- Check if requester is the host
  SELECT host_profile_id = p_host_profile_id INTO v_is_host
  FROM public.live_rooms
  WHERE id = p_room_id;
  
  IF NOT v_is_host THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the host can invite viewers');
  END IF;
  
  -- Check max speakers limit
  SELECT max_speakers, speaker_count INTO v_max_speakers, v_current_speaker_count
  FROM public.live_rooms
  WHERE id = p_room_id;
  
  IF v_current_speaker_count >= v_max_speakers THEN
    RETURN jsonb_build_object('success', false, 'error', 'Room has reached maximum speaker limit');
  END IF;
  
  -- Check if participant already exists
  SELECT EXISTS(
    SELECT 1 FROM public.room_participants
    WHERE room_id = p_room_id AND profile_id = p_profile_id AND left_at IS NULL
  ) INTO v_participant_exists;
  
  IF v_participant_exists THEN
    -- Update existing participant to speaker
    UPDATE public.room_participants
    SET role = 'speaker'
    WHERE room_id = p_room_id AND profile_id = p_profile_id AND left_at IS NULL;
  ELSE
    -- Create new participant as speaker
    INSERT INTO public.room_participants (room_id, profile_id, role)
    VALUES (p_room_id, p_profile_id, 'speaker');
  END IF;
  
  RETURN jsonb_build_object('success', true, 'message', 'Viewer invited to speak');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Step 5: Update RLS policies to allow viewers to join
-- Viewers can join any public room or community room they're a member of
-- This is already handled by existing policies, but we ensure viewer role is allowed

-- Step 6: Add index for viewer role queries
CREATE INDEX IF NOT EXISTS idx_room_participants_viewer_role 
ON public.room_participants(room_id, role) 
WHERE role = 'viewer' AND left_at IS NULL;

