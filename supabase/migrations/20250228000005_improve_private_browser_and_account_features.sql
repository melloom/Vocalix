-- ============================================================================
-- Improve Private Browser Support & Account Features
-- ============================================================================
-- This migration:
-- 1. Adds account-level privacy settings
-- 2. Improves account deletion to handle all related data
-- 3. Notes about private browser support (handled in frontend)
-- ============================================================================

-- ============================================================================
-- PART 1: Add Account Privacy Settings
-- ============================================================================

-- Add privacy fields to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_private_account BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS hide_from_search BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS hide_from_discovery BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS require_approval_to_follow BOOLEAN NOT NULL DEFAULT false;

-- Create indexes for privacy queries
-- Use separate indexes instead of OR condition for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_private_account ON public.profiles(is_private_account) 
WHERE is_private_account = true;
CREATE INDEX IF NOT EXISTS idx_profiles_hide_from_search ON public.profiles(hide_from_search) 
WHERE hide_from_search = true;
CREATE INDEX IF NOT EXISTS idx_profiles_hide_from_discovery ON public.profiles(hide_from_discovery) 
WHERE hide_from_discovery = true;

-- Add comment
COMMENT ON COLUMN public.profiles.is_private_account IS 'If true, profile is private - only approved followers can see clips';
COMMENT ON COLUMN public.profiles.hide_from_search IS 'If true, profile will not appear in search results';
COMMENT ON COLUMN public.profiles.hide_from_discovery IS 'If true, profile will not appear in discovery/recommendations';
COMMENT ON COLUMN public.profiles.require_approval_to_follow IS 'If true, follow requests must be approved';

-- ============================================================================
-- PART 2: Comprehensive Account Deletion Function
-- ============================================================================

-- Drop old purge_account function
DROP FUNCTION IF EXISTS public.purge_account();

-- Create comprehensive account deletion function
CREATE OR REPLACE FUNCTION public.purge_account()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requester_profile public.profiles%ROWTYPE;
  v_profile_id UUID;
BEGIN
  requester_profile := get_request_profile();
  v_profile_id := requester_profile.id;

  -- Delete all clips (cascade should handle related data)
  DELETE FROM public.clips WHERE profile_id = v_profile_id;
  
  -- Delete all clip reactions by this user
  DELETE FROM public.clip_reactions WHERE profile_id = v_profile_id;
  
  -- Delete reactions on this user's clips (if separate table exists)
  -- Note: clip_reactions might reference clips which cascade, but let's be explicit
  
  -- Delete all listens by this user
  DELETE FROM public.listens WHERE profile_id = v_profile_id;
  
  -- Delete all comments by this user
  DELETE FROM public.comments WHERE profile_id = v_profile_id;
  
  -- Delete all posts by this user (if posts table exists)
  DELETE FROM public.posts WHERE profile_id = v_profile_id;
  
  -- Delete all replies/reactions to clips
  DELETE FROM public.clip_replies WHERE profile_id = v_profile_id;
  
  -- Delete all saved clips/bookmarks
  DELETE FROM public.saved_clips WHERE profile_id = v_profile_id;
  
  -- Delete all follows (both directions)
  DELETE FROM public.follows WHERE follower_id = v_profile_id OR following_id = v_profile_id;
  
  -- Delete all follow requests
  DELETE FROM public.follow_requests WHERE requester_id = v_profile_id OR target_id = v_profile_id;
  
  -- Delete all block relationships
  DELETE FROM public.blocked_users WHERE blocker_id = v_profile_id OR blocked_id = v_profile_id;
  
  -- Delete all reports by this user
  DELETE FROM public.reports WHERE reporter_profile_id = v_profile_id;
  
  -- Delete community memberships
  DELETE FROM public.community_members WHERE profile_id = v_profile_id;
  
  -- Delete community moderators
  DELETE FROM public.community_moderators WHERE moderator_profile_id = v_profile_id;
  
  -- Delete community ownerships (transfer or delete communities)
  -- First, transfer communities to system or delete them
  UPDATE public.communities 
  SET created_by_profile_id = NULL 
  WHERE created_by_profile_id = v_profile_id;
  
  -- Delete live room participants
  DELETE FROM public.live_room_participants WHERE profile_id = v_profile_id;
  
  -- Delete live room hosts (transfer or end rooms)
  UPDATE public.live_rooms 
  SET host_profile_id = NULL 
  WHERE host_profile_id = v_profile_id;
  
  -- Delete chat participants
  DELETE FROM public.private_chat_participants WHERE profile_id = v_profile_id;
  
  -- Delete chat messages
  DELETE FROM public.private_chat_messages WHERE profile_id = v_profile_id;
  
  -- Delete chat ownerships
  UPDATE public.private_chats 
  SET created_by_profile_id = NULL 
  WHERE created_by_profile_id = v_profile_id;
  
  -- Delete voice AMA questions
  DELETE FROM public.voice_ama_questions WHERE profile_id = v_profile_id;
  
  -- Delete voice AMA sessions
  DELETE FROM public.voice_ama_sessions WHERE creator_profile_id = v_profile_id;
  
  -- Delete notifications
  DELETE FROM public.notifications WHERE profile_id = v_profile_id OR from_profile_id = v_profile_id;
  
  -- Delete sessions
  DELETE FROM public.sessions WHERE profile_id = v_profile_id;
  
  -- Delete magic login links
  DELETE FROM public.magic_login_links WHERE profile_id = v_profile_id;
  
  -- Delete magic login PINs
  DELETE FROM public.magic_login_pins WHERE profile_id = v_profile_id;
  
  -- Delete account link PINs
  DELETE FROM public.account_link_pins WHERE profile_id = v_profile_id;
  
  -- Delete admins (shouldn't be deletable, but included for completeness)
  DELETE FROM public.admins WHERE profile_id = v_profile_id;
  
  -- Delete devices (unlink them)
  UPDATE public.devices SET profile_id = NULL WHERE profile_id = v_profile_id;
  
  -- Delete any badges or achievements
  DELETE FROM public.user_badges WHERE profile_id = v_profile_id;
  
  -- Delete any karma or reputation entries
  DELETE FROM public.karma_events WHERE profile_id = v_profile_id;
  
  -- Delete any user preferences
  DELETE FROM public.user_preferences WHERE profile_id = v_profile_id;
  
  -- Finally, delete the profile itself
  DELETE FROM public.profiles WHERE id = v_profile_id;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.purge_account() TO authenticated, anon;

-- Add comment
COMMENT ON FUNCTION public.purge_account() IS 
'Comprehensively deletes all user data including clips, comments, reactions, follows, communities, chats, and all related data. Use with caution - this action cannot be undone.';

-- ============================================================================
-- PART 3: Update RLS Policies for Private Accounts
-- ============================================================================

-- Update profile viewing policy
-- Note: To avoid infinite recursion, we make all profiles viewable at RLS level
-- Privacy restrictions (is_private_account, hide_from_search, etc.) will be
-- enforced at the query/application level, not in RLS policies.
-- This prevents recursion while still allowing privacy controls.
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;

CREATE POLICY "Profiles are viewable by everyone"
ON public.profiles FOR SELECT
USING (true);

-- Note: Search and discovery filtering will need to be handled in queries
-- by checking hide_from_search and hide_from_discovery flags

-- ============================================================================
-- PART 4: Add Helper Functions for Privacy
-- ============================================================================

-- Function to check if a profile can be viewed by another profile
CREATE OR REPLACE FUNCTION public.can_view_profile(
  p_viewer_profile_id UUID,
  p_target_profile_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_is_private BOOLEAN;
  v_is_owner BOOLEAN;
  v_is_follower BOOLEAN;
BEGIN
  -- If viewing own profile, always allowed
  IF p_viewer_profile_id = p_target_profile_id THEN
    RETURN true;
  END IF;
  
  -- Check if target is private
  SELECT is_private_account INTO v_target_is_private
  FROM public.profiles
  WHERE id = p_target_profile_id;
  
  -- If not private, anyone can view
  IF NOT v_target_is_private THEN
    RETURN true;
  END IF;
  
  -- If private, check if viewer is a follower
  SELECT EXISTS (
    SELECT 1 FROM public.follows
    WHERE following_id = p_target_profile_id
      AND follower_id = p_viewer_profile_id
  ) INTO v_is_follower;
  
  RETURN v_is_follower;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_view_profile(UUID, UUID) TO authenticated, anon;

COMMENT ON FUNCTION public.can_view_profile(UUID, UUID) IS
'Checks if a viewer profile can view a target profile based on privacy settings';

