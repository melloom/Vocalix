-- Successor Designation Migration
-- Allows leaders/creators/hosts to designate a successor before deletion
-- Successor takes priority over automatic selection

-- Step 1: Add successor_profile_id column to communities
ALTER TABLE public.communities
ADD COLUMN IF NOT EXISTS successor_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Step 2: Add successor_profile_id column to live_rooms
ALTER TABLE public.live_rooms
ADD COLUMN IF NOT EXISTS successor_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Step 3: Add successor_profile_id column to community_chat_rooms
ALTER TABLE public.community_chat_rooms
ADD COLUMN IF NOT EXISTS successor_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Step 4: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_communities_successor ON public.communities(successor_profile_id) WHERE successor_profile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_live_rooms_successor ON public.live_rooms(successor_profile_id) WHERE successor_profile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_rooms_successor ON public.community_chat_rooms(successor_profile_id) WHERE successor_profile_id IS NOT NULL;

-- Step 5: Update community leadership transfer function to check for successor first
CREATE OR REPLACE FUNCTION public.transfer_community_leadership_on_profile_delete()
RETURNS TRIGGER AS $$
DECLARE
  v_community_id UUID;
  v_new_leader_id UUID;
BEGIN
  -- Profile is being deleted, find all communities where this profile was the creator
  FOR v_community_id IN
    SELECT id FROM public.communities
    WHERE created_by_profile_id = OLD.id
  LOOP
    -- First, check if a successor was designated
    SELECT successor_profile_id INTO v_new_leader_id
    FROM public.communities
    WHERE id = v_community_id
      AND successor_profile_id IS NOT NULL
      AND successor_profile_id != OLD.id;  -- Don't reassign to the deleted profile
    
    -- Verify successor is still a member of the community
    IF v_new_leader_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.community_members
        WHERE community_id = v_community_id
          AND profile_id = v_new_leader_id
      ) THEN
        -- Successor is not a member, ignore and fall through to automatic selection
        v_new_leader_id := NULL;
      END IF;
    END IF;
    
    -- If no valid successor, try to find a moderator first (oldest moderator by elected_at)
    IF v_new_leader_id IS NULL THEN
      SELECT moderator_profile_id INTO v_new_leader_id
      FROM public.community_moderators
      WHERE community_id = v_community_id
        AND moderator_profile_id != OLD.id  -- Don't reassign to the deleted profile
      ORDER BY elected_at ASC
      LIMIT 1;
    END IF;
    
    -- If no moderator, find member with highest reputation
    IF v_new_leader_id IS NULL THEN
      SELECT cm.profile_id INTO v_new_leader_id
      FROM public.community_members cm
      INNER JOIN public.profiles p ON p.id = cm.profile_id
      WHERE cm.community_id = v_community_id
        AND cm.profile_id != OLD.id  -- Don't reassign to the deleted profile
      ORDER BY COALESCE(p.reputation, 0) DESC, cm.joined_at ASC
      LIMIT 1;
    END IF;
    
    -- Update the community with the new leader (or leave NULL if no members)
    IF v_new_leader_id IS NOT NULL THEN
      UPDATE public.communities
      SET 
        created_by_profile_id = v_new_leader_id,
        successor_profile_id = NULL  -- Clear successor after transfer
      WHERE id = v_community_id;
    END IF;
  END LOOP;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Step 6: Update community leadership transfer function for NULL updates
CREATE OR REPLACE FUNCTION public.transfer_community_leadership_on_creator_null()
RETURNS TRIGGER AS $$
DECLARE
  v_new_leader_id UUID;
  v_old_creator_id UUID;
BEGIN
  -- created_by_profile_id was updated to NULL
  v_old_creator_id := OLD.created_by_profile_id;
  
  -- First, check if a successor was designated
  v_new_leader_id := NEW.successor_profile_id;
  
  -- Verify successor is still a member of the community
  IF v_new_leader_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.community_members
      WHERE community_id = NEW.id
        AND profile_id = v_new_leader_id
    ) OR v_new_leader_id = v_old_creator_id THEN
      -- Successor is not a member or is the old creator, ignore and fall through
      v_new_leader_id := NULL;
    END IF;
  END IF;
  
  -- If no valid successor, try to find a moderator first (oldest moderator by elected_at)
  IF v_new_leader_id IS NULL THEN
    SELECT moderator_profile_id INTO v_new_leader_id
    FROM public.community_moderators
    WHERE community_id = NEW.id
      AND moderator_profile_id != v_old_creator_id  -- Don't reassign to the old creator
    ORDER BY elected_at ASC
    LIMIT 1;
  END IF;
  
  -- If no moderator, find member with highest reputation
  IF v_new_leader_id IS NULL THEN
    SELECT cm.profile_id INTO v_new_leader_id
    FROM public.community_members cm
    INNER JOIN public.profiles p ON p.id = cm.profile_id
    WHERE cm.community_id = NEW.id
      AND cm.profile_id != v_old_creator_id  -- Don't reassign to the old creator
    ORDER BY COALESCE(p.reputation, 0) DESC, cm.joined_at ASC
    LIMIT 1;
  END IF;
  
  -- Update the community with the new leader (or leave NULL if no members)
  IF v_new_leader_id IS NOT NULL THEN
    NEW.created_by_profile_id := v_new_leader_id;
    NEW.successor_profile_id := NULL;  -- Clear successor after transfer
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Step 7: Update live room host transfer function to check for successor first
CREATE OR REPLACE FUNCTION public.transfer_live_room_host_on_profile_delete()
RETURNS TRIGGER AS $$
DECLARE
  v_room_id UUID;
  v_new_host_id UUID;
  v_room_status TEXT;
BEGIN
  -- Profile is being deleted, find all live rooms where this profile was the host
  FOR v_room_id IN
    SELECT id FROM public.live_rooms
    WHERE host_profile_id = OLD.id
  LOOP
    -- Get room status
    SELECT status INTO v_room_status
    FROM public.live_rooms
    WHERE id = v_room_id;
    
    -- First, check if a successor was designated
    SELECT successor_profile_id INTO v_new_host_id
    FROM public.live_rooms
    WHERE id = v_room_id
      AND successor_profile_id IS NOT NULL
      AND successor_profile_id != OLD.id;  -- Don't reassign to the deleted profile
    
    -- Verify successor is a participant in the room
    IF v_new_host_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.room_participants
        WHERE room_id = v_room_id
          AND profile_id = v_new_host_id
          AND left_at IS NULL
      ) THEN
        -- Successor is not a participant, ignore and fall through to automatic selection
        v_new_host_id := NULL;
      END IF;
    END IF;
    
    -- If no valid successor, try to find a moderator participant first
    IF v_new_host_id IS NULL THEN
      SELECT profile_id INTO v_new_host_id
      FROM public.room_participants
      WHERE room_id = v_room_id
        AND profile_id != OLD.id
        AND role = 'moderator'
        AND left_at IS NULL
      ORDER BY joined_at ASC
      LIMIT 1;
    END IF;
    
    -- If no moderator, try to find a speaker
    IF v_new_host_id IS NULL THEN
      SELECT profile_id INTO v_new_host_id
      FROM public.room_participants
      WHERE room_id = v_room_id
        AND profile_id != OLD.id
        AND role = 'speaker'
        AND left_at IS NULL
      ORDER BY joined_at ASC
      LIMIT 1;
    END IF;
    
    -- If no speaker, find participant with highest reputation
    IF v_new_host_id IS NULL THEN
      SELECT rp.profile_id INTO v_new_host_id
      FROM public.room_participants rp
      INNER JOIN public.profiles p ON p.id = rp.profile_id
      WHERE rp.room_id = v_room_id
        AND rp.profile_id != OLD.id
        AND rp.left_at IS NULL
      ORDER BY COALESCE(p.reputation, 0) DESC, rp.joined_at ASC
      LIMIT 1;
    END IF;
    
    -- Update the room with the new host (or end it if live and no participants)
    IF v_new_host_id IS NOT NULL THEN
      -- Update host and promote participant to host role
      UPDATE public.live_rooms
      SET 
        host_profile_id = v_new_host_id,
        successor_profile_id = NULL  -- Clear successor after transfer
      WHERE id = v_room_id;
      
      -- Update participant role to host
      UPDATE public.room_participants
      SET role = 'host'
      WHERE room_id = v_room_id
        AND profile_id = v_new_host_id;
    ELSIF v_room_status = 'live' THEN
      -- No suitable participant found and room is live - end it
      UPDATE public.live_rooms
      SET 
        host_profile_id = NULL,
        status = 'ended',
        ended_at = now(),
        successor_profile_id = NULL
      WHERE id = v_room_id;
    ELSE
      -- Room is scheduled or ended, just clear host
      UPDATE public.live_rooms
      SET 
        host_profile_id = NULL,
        successor_profile_id = NULL
      WHERE id = v_room_id;
    END IF;
  END LOOP;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Step 8: Update live room host transfer function for NULL updates
CREATE OR REPLACE FUNCTION public.transfer_live_room_host_on_host_null()
RETURNS TRIGGER AS $$
DECLARE
  v_new_host_id UUID;
  v_old_host_id UUID;
  v_room_status TEXT;
BEGIN
  -- host_profile_id was updated to NULL
  v_old_host_id := OLD.host_profile_id;
  v_room_status := NEW.status;
  
  -- First, check if a successor was designated
  v_new_host_id := NEW.successor_profile_id;
  
  -- Verify successor is a participant in the room
  IF v_new_host_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.room_participants
      WHERE room_id = NEW.id
        AND profile_id = v_new_host_id
        AND left_at IS NULL
    ) OR v_new_host_id = v_old_host_id THEN
      -- Successor is not a participant or is the old host, ignore and fall through
      v_new_host_id := NULL;
    END IF;
  END IF;
  
  -- If no valid successor, try to find a moderator participant first
  IF v_new_host_id IS NULL THEN
    SELECT profile_id INTO v_new_host_id
    FROM public.room_participants
    WHERE room_id = NEW.id
      AND profile_id != v_old_host_id
      AND role = 'moderator'
      AND left_at IS NULL
    ORDER BY joined_at ASC
    LIMIT 1;
  END IF;
  
  -- If no moderator, try to find a speaker
  IF v_new_host_id IS NULL THEN
    SELECT profile_id INTO v_new_host_id
    FROM public.room_participants
    WHERE room_id = NEW.id
      AND profile_id != v_old_host_id
      AND role = 'speaker'
      AND left_at IS NULL
    ORDER BY joined_at ASC
    LIMIT 1;
  END IF;
  
  -- If no speaker, find participant with highest reputation
  IF v_new_host_id IS NULL THEN
    SELECT rp.profile_id INTO v_new_host_id
    FROM public.room_participants rp
    INNER JOIN public.profiles p ON p.id = rp.profile_id
    WHERE rp.room_id = NEW.id
      AND rp.profile_id != v_old_host_id
      AND rp.left_at IS NULL
    ORDER BY COALESCE(p.reputation, 0) DESC, rp.joined_at ASC
    LIMIT 1;
  END IF;
  
  -- Update the room with the new host (or end it if live and no participants)
  IF v_new_host_id IS NOT NULL THEN
    NEW.host_profile_id := v_new_host_id;
    NEW.successor_profile_id := NULL;  -- Clear successor after transfer
  ELSIF v_room_status = 'live' THEN
    -- No suitable participant found and room is live - end it
    NEW.status := 'ended';
    NEW.ended_at := now();
    NEW.host_profile_id := NULL;
    NEW.successor_profile_id := NULL;
  ELSE
    -- Room is scheduled or ended, just leave host as NULL
    NEW.host_profile_id := NULL;
    NEW.successor_profile_id := NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Step 9: Update chat room creator transfer function to check for successor first
CREATE OR REPLACE FUNCTION public.transfer_chat_room_creator_on_profile_delete()
RETURNS TRIGGER AS $$
DECLARE
  v_room_id UUID;
  v_new_creator_id UUID;
  v_community_id UUID;
BEGIN
  -- Profile is being deleted, find all chat rooms where this profile was the creator
  FOR v_room_id IN
    SELECT id FROM public.community_chat_rooms
    WHERE created_by_profile_id = OLD.id
  LOOP
    -- Get the community_id for this chat room
    SELECT community_id INTO v_community_id
    FROM public.community_chat_rooms
    WHERE id = v_room_id;
    
    -- First, check if a successor was designated
    SELECT successor_profile_id INTO v_new_creator_id
    FROM public.community_chat_rooms
    WHERE id = v_room_id
      AND successor_profile_id IS NOT NULL
      AND successor_profile_id != OLD.id;  -- Don't reassign to the deleted profile
    
    -- Verify successor is a member of the community
    IF v_new_creator_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.community_members
        WHERE community_id = v_community_id
          AND profile_id = v_new_creator_id
      ) THEN
        -- Successor is not a member, ignore and fall through to automatic selection
        v_new_creator_id := NULL;
      END IF;
    END IF;
    
    -- If no valid successor, try to find a community moderator first
    IF v_new_creator_id IS NULL THEN
      SELECT moderator_profile_id INTO v_new_creator_id
      FROM public.community_moderators
      WHERE community_id = v_community_id
        AND moderator_profile_id != OLD.id
      ORDER BY elected_at ASC
      LIMIT 1;
    END IF;
    
    -- If no moderator, find member with highest reputation
    IF v_new_creator_id IS NULL THEN
      SELECT cm.profile_id INTO v_new_creator_id
      FROM public.community_members cm
      INNER JOIN public.profiles p ON p.id = cm.profile_id
      WHERE cm.community_id = v_community_id
        AND cm.profile_id != OLD.id
      ORDER BY COALESCE(p.reputation, 0) DESC, cm.joined_at ASC
      LIMIT 1;
    END IF;
    
    -- Update the chat room with the new creator (or leave NULL if no members)
    IF v_new_creator_id IS NOT NULL THEN
      UPDATE public.community_chat_rooms
      SET 
        created_by_profile_id = v_new_creator_id,
        successor_profile_id = NULL  -- Clear successor after transfer
      WHERE id = v_room_id;
    END IF;
  END LOOP;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Step 10: Update chat room creator transfer function for NULL updates
CREATE OR REPLACE FUNCTION public.transfer_chat_room_creator_on_creator_null()
RETURNS TRIGGER AS $$
DECLARE
  v_new_creator_id UUID;
  v_old_creator_id UUID;
  v_community_id UUID;
BEGIN
  -- created_by_profile_id was updated to NULL
  v_old_creator_id := OLD.created_by_profile_id;
  v_community_id := NEW.community_id;
  
  -- First, check if a successor was designated
  v_new_creator_id := NEW.successor_profile_id;
  
  -- Verify successor is a member of the community
  IF v_new_creator_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.community_members
      WHERE community_id = v_community_id
        AND profile_id = v_new_creator_id
    ) OR v_new_creator_id = v_old_creator_id THEN
      -- Successor is not a member or is the old creator, ignore and fall through
      v_new_creator_id := NULL;
    END IF;
  END IF;
  
  -- If no valid successor, try to find a community moderator first
  IF v_new_creator_id IS NULL THEN
    SELECT moderator_profile_id INTO v_new_creator_id
    FROM public.community_moderators
    WHERE community_id = v_community_id
      AND moderator_profile_id != v_old_creator_id
    ORDER BY elected_at ASC
    LIMIT 1;
  END IF;
  
  -- If no moderator, find member with highest reputation
  IF v_new_creator_id IS NULL THEN
    SELECT cm.profile_id INTO v_new_creator_id
    FROM public.community_members cm
    INNER JOIN public.profiles p ON p.id = cm.profile_id
    WHERE cm.community_id = v_community_id
      AND cm.profile_id != v_old_creator_id
    ORDER BY COALESCE(p.reputation, 0) DESC, cm.joined_at ASC
    LIMIT 1;
  END IF;
  
  -- Update the chat room with the new creator (or leave NULL if no members)
  IF v_new_creator_id IS NOT NULL THEN
    NEW.created_by_profile_id := v_new_creator_id;
    NEW.successor_profile_id := NULL;  -- Clear successor after transfer
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Step 11: Create function to set community successor (only creator can set)
CREATE OR REPLACE FUNCTION public.set_community_successor(
  p_community_id UUID,
  p_successor_profile_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_current_creator_id UUID;
BEGIN
  -- Get current creator
  SELECT created_by_profile_id INTO v_current_creator_id
  FROM public.communities
  WHERE id = p_community_id;
  
  -- Verify requester is the creator (using device_id from request)
  IF v_current_creator_id NOT IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  ) THEN
    RAISE EXCEPTION 'Only the community creator can set a successor';
  END IF;
  
  -- Verify successor is a member of the community
  IF NOT EXISTS (
    SELECT 1 FROM public.community_members
    WHERE community_id = p_community_id
      AND profile_id = p_successor_profile_id
  ) THEN
    RAISE EXCEPTION 'Successor must be a member of the community';
  END IF;
  
  -- Verify successor is not the current creator
  IF p_successor_profile_id = v_current_creator_id THEN
    RAISE EXCEPTION 'Cannot set yourself as successor';
  END IF;
  
  -- Set successor
  UPDATE public.communities
  SET successor_profile_id = p_successor_profile_id
  WHERE id = p_community_id;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Step 12: Create function to set live room successor (only host can set)
CREATE OR REPLACE FUNCTION public.set_live_room_successor(
  p_room_id UUID,
  p_successor_profile_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_current_host_id UUID;
BEGIN
  -- Get current host
  SELECT host_profile_id INTO v_current_host_id
  FROM public.live_rooms
  WHERE id = p_room_id;
  
  -- Verify requester is the host
  IF v_current_host_id NOT IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  ) THEN
    RAISE EXCEPTION 'Only the room host can set a successor';
  END IF;
  
  -- Verify successor is a participant in the room
  IF NOT EXISTS (
    SELECT 1 FROM public.room_participants
    WHERE room_id = p_room_id
      AND profile_id = p_successor_profile_id
      AND left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Successor must be a participant in the room';
  END IF;
  
  -- Verify successor is not the current host
  IF p_successor_profile_id = v_current_host_id THEN
    RAISE EXCEPTION 'Cannot set yourself as successor';
  END IF;
  
  -- Set successor
  UPDATE public.live_rooms
  SET successor_profile_id = p_successor_profile_id
  WHERE id = p_room_id;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Step 13: Create function to set chat room successor (only creator can set)
CREATE OR REPLACE FUNCTION public.set_chat_room_successor(
  p_room_id UUID,
  p_successor_profile_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_current_creator_id UUID;
  v_community_id UUID;
BEGIN
  -- Get current creator and community
  SELECT created_by_profile_id, community_id 
  INTO v_current_creator_id, v_community_id
  FROM public.community_chat_rooms
  WHERE id = p_room_id;
  
  -- Verify requester is the creator
  IF v_current_creator_id NOT IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  ) THEN
    RAISE EXCEPTION 'Only the chat room creator can set a successor';
  END IF;
  
  -- Verify successor is a member of the community
  IF NOT EXISTS (
    SELECT 1 FROM public.community_members
    WHERE community_id = v_community_id
      AND profile_id = p_successor_profile_id
  ) THEN
    RAISE EXCEPTION 'Successor must be a member of the community';
  END IF;
  
  -- Verify successor is not the current creator
  IF p_successor_profile_id = v_current_creator_id THEN
    RAISE EXCEPTION 'Cannot set yourself as successor';
  END IF;
  
  -- Set successor
  UPDATE public.community_chat_rooms
  SET successor_profile_id = p_successor_profile_id
  WHERE id = p_room_id;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Step 14: Create function to clear successor (only creator/host can clear)
CREATE OR REPLACE FUNCTION public.clear_community_successor(p_community_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Verify requester is the creator
  IF NOT EXISTS (
    SELECT 1 FROM public.communities
    WHERE id = p_community_id
      AND created_by_profile_id IN (
        SELECT id FROM public.profiles
        WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
      )
  ) THEN
    RAISE EXCEPTION 'Only the community creator can clear the successor';
  END IF;
  
  UPDATE public.communities
  SET successor_profile_id = NULL
  WHERE id = p_community_id;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.clear_live_room_successor(p_room_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Verify requester is the host
  IF NOT EXISTS (
    SELECT 1 FROM public.live_rooms
    WHERE id = p_room_id
      AND host_profile_id IN (
        SELECT id FROM public.profiles
        WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
      )
  ) THEN
    RAISE EXCEPTION 'Only the room host can clear the successor';
  END IF;
  
  UPDATE public.live_rooms
  SET successor_profile_id = NULL
  WHERE id = p_room_id;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.clear_chat_room_successor(p_room_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Verify requester is the creator
  IF NOT EXISTS (
    SELECT 1 FROM public.community_chat_rooms
    WHERE id = p_room_id
      AND created_by_profile_id IN (
        SELECT id FROM public.profiles
        WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
      )
  ) THEN
    RAISE EXCEPTION 'Only the chat room creator can clear the successor';
  END IF;
  
  UPDATE public.community_chat_rooms
  SET successor_profile_id = NULL
  WHERE id = p_room_id;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Step 15: Grant execute permissions
GRANT EXECUTE ON FUNCTION public.set_community_successor(UUID, UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.set_live_room_successor(UUID, UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.set_chat_room_successor(UUID, UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.clear_community_successor(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.clear_live_room_successor(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.clear_chat_room_successor(UUID) TO authenticated, anon;

