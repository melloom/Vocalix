-- Community Leadership Transfer Migration
-- Automatically transfers community leadership when the creator is deleted
-- Priority: 1) Moderator, 2) Highest reputation member

-- Step 1: Create function to transfer community leadership when profile is deleted
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
    -- Try to find a moderator first (oldest moderator by elected_at)
    SELECT moderator_profile_id INTO v_new_leader_id
    FROM public.community_moderators
    WHERE community_id = v_community_id
      AND moderator_profile_id != OLD.id  -- Don't reassign to the deleted profile
    ORDER BY elected_at ASC
    LIMIT 1;
    
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
      SET created_by_profile_id = v_new_leader_id
      WHERE id = v_community_id;
    END IF;
  END LOOP;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Step 2: Create function to transfer community leadership when created_by_profile_id is set to NULL
CREATE OR REPLACE FUNCTION public.transfer_community_leadership_on_creator_null()
RETURNS TRIGGER AS $$
DECLARE
  v_new_leader_id UUID;
  v_old_creator_id UUID;
BEGIN
  -- created_by_profile_id was updated to NULL
  v_old_creator_id := OLD.created_by_profile_id;
  
  -- Try to find a moderator first (oldest moderator by elected_at)
  SELECT moderator_profile_id INTO v_new_leader_id
  FROM public.community_moderators
  WHERE community_id = NEW.id
    AND moderator_profile_id != v_old_creator_id  -- Don't reassign to the old creator
  ORDER BY elected_at ASC
  LIMIT 1;
  
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
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Step 3: Create trigger on profiles table (BEFORE DELETE to catch communities before FK constraint sets to NULL)
DROP TRIGGER IF EXISTS transfer_community_leadership_on_profile_delete ON public.profiles;
CREATE TRIGGER transfer_community_leadership_on_profile_delete
BEFORE DELETE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.transfer_community_leadership_on_profile_delete();

-- Step 4: Create trigger on communities table (BEFORE UPDATE to intercept NULL assignment)
DROP TRIGGER IF EXISTS transfer_community_leadership_on_creator_null ON public.communities;
CREATE TRIGGER transfer_community_leadership_on_creator_null
BEFORE UPDATE OF created_by_profile_id ON public.communities
FOR EACH ROW
WHEN (NEW.created_by_profile_id IS NULL AND OLD.created_by_profile_id IS NOT NULL)
EXECUTE FUNCTION public.transfer_community_leadership_on_creator_null();

-- Step 5: Create helper function to manually transfer leadership (for admin use)
CREATE OR REPLACE FUNCTION public.manual_transfer_community_leadership(p_community_id UUID)
RETURNS UUID AS $$
DECLARE
  v_new_leader_id UUID;
BEGIN
  -- Try to find a moderator first
  SELECT moderator_profile_id INTO v_new_leader_id
  FROM public.community_moderators
  WHERE community_id = p_community_id
  ORDER BY elected_at ASC
  LIMIT 1;
  
  -- If no moderator, find member with highest reputation
  IF v_new_leader_id IS NULL THEN
    SELECT cm.profile_id INTO v_new_leader_id
    FROM public.community_members cm
    INNER JOIN public.profiles p ON p.id = cm.profile_id
    WHERE cm.community_id = p_community_id
    ORDER BY COALESCE(p.reputation, 0) DESC, cm.joined_at ASC
    LIMIT 1;
  END IF;
  
  -- Update the community with the new leader
  IF v_new_leader_id IS NOT NULL THEN
    UPDATE public.communities
    SET created_by_profile_id = v_new_leader_id
    WHERE id = p_community_id;
    
    RETURN v_new_leader_id;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Step 6: Grant execute permissions
GRANT EXECUTE ON FUNCTION public.transfer_community_leadership_on_profile_delete() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.transfer_community_leadership_on_creator_null() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.manual_transfer_community_leadership(UUID) TO authenticated, anon;

