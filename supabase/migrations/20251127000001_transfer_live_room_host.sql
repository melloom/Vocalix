-- Live Room Host Transfer Migration
-- Automatically transfers live room host when the host is deleted
-- Priority: 1) Moderator participant, 2) Speaker participant, 3) Highest reputation participant, 4) End room if live

-- Step 1: Create function to transfer live room host when profile is deleted
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
    
    -- Try to find a moderator participant first
    SELECT profile_id INTO v_new_host_id
    FROM public.room_participants
    WHERE room_id = v_room_id
      AND profile_id != OLD.id  -- Don't reassign to the deleted profile
      AND role = 'moderator'
      AND left_at IS NULL  -- Still in the room
    ORDER BY joined_at ASC
    LIMIT 1;
    
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
      SET host_profile_id = v_new_host_id
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
        ended_at = now()
      WHERE id = v_room_id;
    ELSE
      -- Room is scheduled or ended, just clear host
      UPDATE public.live_rooms
      SET host_profile_id = NULL
      WHERE id = v_room_id;
    END IF;
  END LOOP;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Step 2: Create function to transfer live room host when host_profile_id is set to NULL
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
  
  -- Try to find a moderator participant first
  SELECT profile_id INTO v_new_host_id
  FROM public.room_participants
  WHERE room_id = NEW.id
    AND profile_id != v_old_host_id  -- Don't reassign to the old host
    AND role = 'moderator'
    AND left_at IS NULL
  ORDER BY joined_at ASC
  LIMIT 1;
  
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
    
    -- Update participant role to host (will be done in AFTER trigger)
  ELSIF v_room_status = 'live' THEN
    -- No suitable participant found and room is live - end it
    NEW.status := 'ended';
    NEW.ended_at := now();
    NEW.host_profile_id := NULL;
  ELSE
    -- Room is scheduled or ended, just leave host as NULL
    NEW.host_profile_id := NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Step 3: Create function to update participant role after host transfer
CREATE OR REPLACE FUNCTION public.update_participant_role_after_host_transfer()
RETURNS TRIGGER AS $$
BEGIN
  -- If host_profile_id was set and is different from old value, update participant role
  IF NEW.host_profile_id IS NOT NULL AND 
     (OLD.host_profile_id IS NULL OR OLD.host_profile_id != NEW.host_profile_id) THEN
    -- Update the new host's participant role
    UPDATE public.room_participants
    SET role = 'host'
    WHERE room_id = NEW.id
      AND profile_id = NEW.host_profile_id
      AND role != 'host';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Step 4: Create trigger on profiles table (BEFORE DELETE)
DROP TRIGGER IF EXISTS transfer_live_room_host_on_profile_delete ON public.profiles;
CREATE TRIGGER transfer_live_room_host_on_profile_delete
BEFORE DELETE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.transfer_live_room_host_on_profile_delete();

-- Step 5: Create trigger on live_rooms table (BEFORE UPDATE to intercept NULL assignment)
DROP TRIGGER IF EXISTS transfer_live_room_host_on_host_null ON public.live_rooms;
CREATE TRIGGER transfer_live_room_host_on_host_null
BEFORE UPDATE OF host_profile_id ON public.live_rooms
FOR EACH ROW
WHEN (NEW.host_profile_id IS NULL AND OLD.host_profile_id IS NOT NULL)
EXECUTE FUNCTION public.transfer_live_room_host_on_host_null();

-- Step 6: Create trigger to update participant role after host transfer
DROP TRIGGER IF EXISTS update_participant_role_after_host_transfer ON public.live_rooms;
CREATE TRIGGER update_participant_role_after_host_transfer
AFTER UPDATE OF host_profile_id ON public.live_rooms
FOR EACH ROW
WHEN (NEW.host_profile_id IS NOT NULL AND (OLD.host_profile_id IS NULL OR OLD.host_profile_id != NEW.host_profile_id))
EXECUTE FUNCTION public.update_participant_role_after_host_transfer();

-- Step 7: Create helper function to manually transfer host (for admin use)
CREATE OR REPLACE FUNCTION public.manual_transfer_live_room_host(p_room_id UUID)
RETURNS UUID AS $$
DECLARE
  v_new_host_id UUID;
  v_room_status TEXT;
BEGIN
  -- Get room status
  SELECT status INTO v_room_status
  FROM public.live_rooms
  WHERE id = p_room_id;
  
  -- Try to find a moderator participant first
  SELECT profile_id INTO v_new_host_id
  FROM public.room_participants
  WHERE room_id = p_room_id
    AND role = 'moderator'
    AND left_at IS NULL
  ORDER BY joined_at ASC
  LIMIT 1;
  
  -- If no moderator, try to find a speaker
  IF v_new_host_id IS NULL THEN
    SELECT profile_id INTO v_new_host_id
    FROM public.room_participants
    WHERE room_id = p_room_id
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
    WHERE rp.room_id = p_room_id
      AND rp.left_at IS NULL
    ORDER BY COALESCE(p.reputation, 0) DESC, rp.joined_at ASC
    LIMIT 1;
  END IF;
  
  -- Update the room with the new host
  IF v_new_host_id IS NOT NULL THEN
    UPDATE public.live_rooms
    SET host_profile_id = v_new_host_id
    WHERE id = p_room_id;
    
    -- Update participant role to host
    UPDATE public.room_participants
    SET role = 'host'
    WHERE room_id = p_room_id
      AND profile_id = v_new_host_id;
    
    RETURN v_new_host_id;
  ELSIF v_room_status = 'live' THEN
    -- No suitable participant found and room is live - end it
    UPDATE public.live_rooms
    SET 
      host_profile_id = NULL,
      status = 'ended',
      ended_at = now()
    WHERE id = p_room_id;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Step 8: Grant execute permissions
GRANT EXECUTE ON FUNCTION public.transfer_live_room_host_on_profile_delete() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.transfer_live_room_host_on_host_null() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.update_participant_role_after_host_transfer() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.manual_transfer_live_room_host(UUID) TO authenticated, anon;

