-- Community Chat Room Creator Transfer Migration
-- Automatically transfers chat room creator when the creator is deleted
-- Priority: 1) Community moderator, 2) Highest reputation community member

-- Step 1: Create function to transfer chat room creator when profile is deleted
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
    
    -- Try to find a community moderator first (oldest moderator by elected_at)
    SELECT moderator_profile_id INTO v_new_creator_id
    FROM public.community_moderators
    WHERE community_id = v_community_id
      AND moderator_profile_id != OLD.id  -- Don't reassign to the deleted profile
    ORDER BY elected_at ASC
    LIMIT 1;
    
    -- If no moderator, find member with highest reputation
    IF v_new_creator_id IS NULL THEN
      SELECT cm.profile_id INTO v_new_creator_id
      FROM public.community_members cm
      INNER JOIN public.profiles p ON p.id = cm.profile_id
      WHERE cm.community_id = v_community_id
        AND cm.profile_id != OLD.id  -- Don't reassign to the deleted profile
      ORDER BY COALESCE(p.reputation, 0) DESC, cm.joined_at ASC
      LIMIT 1;
    END IF;
    
    -- Update the chat room with the new creator (or leave NULL if no members)
    IF v_new_creator_id IS NOT NULL THEN
      UPDATE public.community_chat_rooms
      SET created_by_profile_id = v_new_creator_id
      WHERE id = v_room_id;
    END IF;
  END LOOP;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Step 2: Create function to transfer chat room creator when created_by_profile_id is set to NULL
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
  
  -- Try to find a community moderator first (oldest moderator by elected_at)
  SELECT moderator_profile_id INTO v_new_creator_id
  FROM public.community_moderators
  WHERE community_id = v_community_id
    AND moderator_profile_id != v_old_creator_id  -- Don't reassign to the old creator
  ORDER BY elected_at ASC
  LIMIT 1;
  
  -- If no moderator, find member with highest reputation
  IF v_new_creator_id IS NULL THEN
    SELECT cm.profile_id INTO v_new_creator_id
    FROM public.community_members cm
    INNER JOIN public.profiles p ON p.id = cm.profile_id
    WHERE cm.community_id = v_community_id
      AND cm.profile_id != v_old_creator_id  -- Don't reassign to the old creator
    ORDER BY COALESCE(p.reputation, 0) DESC, cm.joined_at ASC
    LIMIT 1;
  END IF;
  
  -- Update the chat room with the new creator (or leave NULL if no members)
  IF v_new_creator_id IS NOT NULL THEN
    NEW.created_by_profile_id := v_new_creator_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Step 3: Create trigger on profiles table (BEFORE DELETE to catch chat rooms before FK constraint sets to NULL)
DROP TRIGGER IF EXISTS transfer_chat_room_creator_on_profile_delete ON public.profiles;
CREATE TRIGGER transfer_chat_room_creator_on_profile_delete
BEFORE DELETE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.transfer_chat_room_creator_on_profile_delete();

-- Step 4: Create trigger on community_chat_rooms table (BEFORE UPDATE to intercept NULL assignment)
DROP TRIGGER IF EXISTS transfer_chat_room_creator_on_creator_null ON public.community_chat_rooms;
CREATE TRIGGER transfer_chat_room_creator_on_creator_null
BEFORE UPDATE OF created_by_profile_id ON public.community_chat_rooms
FOR EACH ROW
WHEN (NEW.created_by_profile_id IS NULL AND OLD.created_by_profile_id IS NOT NULL)
EXECUTE FUNCTION public.transfer_chat_room_creator_on_creator_null();

-- Step 5: Create helper function to manually transfer creator (for admin use)
CREATE OR REPLACE FUNCTION public.manual_transfer_chat_room_creator(p_room_id UUID)
RETURNS UUID AS $$
DECLARE
  v_new_creator_id UUID;
  v_community_id UUID;
BEGIN
  -- Get the community_id for this chat room
  SELECT community_id INTO v_community_id
  FROM public.community_chat_rooms
  WHERE id = p_room_id;
  
  IF v_community_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Try to find a community moderator first
  SELECT moderator_profile_id INTO v_new_creator_id
  FROM public.community_moderators
  WHERE community_id = v_community_id
  ORDER BY elected_at ASC
  LIMIT 1;
  
  -- If no moderator, find member with highest reputation
  IF v_new_creator_id IS NULL THEN
    SELECT cm.profile_id INTO v_new_creator_id
    FROM public.community_members cm
    INNER JOIN public.profiles p ON p.id = cm.profile_id
    WHERE cm.community_id = v_community_id
    ORDER BY COALESCE(p.reputation, 0) DESC, cm.joined_at ASC
    LIMIT 1;
  END IF;
  
  -- Update the chat room with the new creator
  IF v_new_creator_id IS NOT NULL THEN
    UPDATE public.community_chat_rooms
    SET created_by_profile_id = v_new_creator_id
    WHERE id = p_room_id;
    
    RETURN v_new_creator_id;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Step 6: Grant execute permissions
GRANT EXECUTE ON FUNCTION public.transfer_chat_room_creator_on_profile_delete() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.transfer_chat_room_creator_on_creator_null() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.manual_transfer_chat_room_creator(UUID) TO authenticated, anon;

