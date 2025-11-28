-- ============================================================================
-- Add Account Deletion Options
-- ============================================================================
-- This migration adds the ability to delete account while keeping content
-- ============================================================================

-- Create function to anonymize account (delete account but keep content)
CREATE OR REPLACE FUNCTION public.anonymize_account()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requester_profile public.profiles%ROWTYPE;
  v_profile_id UUID;
  v_anonymous_handle TEXT;
  v_anonymous_emoji TEXT;
BEGIN
  requester_profile := get_request_profile();
  v_profile_id := requester_profile.id;

  -- Generate anonymous handle (can't conflict since we're deleting the profile)
  v_anonymous_handle := 'deleted_user_' || substring(v_profile_id::text, 1, 8);
  v_anonymous_emoji := '💀'; -- Deleted user emoji

  -- Anonymize profile instead of deleting
  UPDATE public.profiles
  SET 
    handle = v_anonymous_handle,
    device_id = NULL, -- Clear device association
    emoji_avatar = v_anonymous_emoji,
    city = NULL,
    consent_city = false,
    bio = NULL,
    cover_image_url = NULL,
    profile_picture_url = NULL,
    is_private_account = true,
    hide_from_search = true,
    hide_from_discovery = true,
    -- Keep: clips, posts, comments (they'll show as "deleted_user_xxx")
    -- Delete: personal data, follows, blocks, etc.
    updated_at = now()
  WHERE id = v_profile_id;

  -- Delete all follows (both directions)
  DELETE FROM public.follows WHERE follower_id = v_profile_id OR following_id = v_profile_id;
  
  -- Delete all follow requests
  DELETE FROM public.follow_requests WHERE requester_id = v_profile_id OR target_id = v_profile_id;
  
  -- Delete all block relationships
  DELETE FROM public.blocked_users WHERE blocker_id = v_profile_id OR blocked_id = v_profile_id;
  
  -- Delete all saved clips/bookmarks
  DELETE FROM public.saved_clips WHERE profile_id = v_profile_id;
  
  -- Delete community memberships
  DELETE FROM public.community_members WHERE profile_id = v_profile_id;
  
  -- Delete community moderators
  DELETE FROM public.community_moderators WHERE moderator_profile_id = v_profile_id;
  
  -- Delete community ownerships (transfer to system or delete)
  UPDATE public.communities 
  SET created_by_profile_id = NULL 
  WHERE created_by_profile_id = v_profile_id;
  
  -- Delete live room participants
  DELETE FROM public.live_room_participants WHERE profile_id = v_profile_id;
  
  -- Delete live room hosts (transfer to system)
  UPDATE public.live_rooms 
  SET host_profile_id = NULL 
  WHERE host_profile_id = v_profile_id;
  
  -- Delete chat participants
  DELETE FROM public.private_chat_participants WHERE profile_id = v_profile_id;
  
  -- Delete chat messages (or anonymize them)
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
  
  -- Delete reports made by user
  DELETE FROM public.reports WHERE reporter_profile_id = v_profile_id;
  
  -- Note: Clips, posts, comments, reactions, and listens are KEPT
  -- They will show as posted by "deleted_user_xxx"
END;
$$;

-- Update purge_account to accept optional parameter for keeping content
DROP FUNCTION IF EXISTS public.purge_account();

CREATE OR REPLACE FUNCTION public.purge_account(p_keep_content BOOLEAN DEFAULT false)
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

  -- If keeping content, anonymize instead of deleting
  IF p_keep_content THEN
    PERFORM public.anonymize_account();
    RETURN;
  END IF;

  -- Full deletion (existing behavior)
  -- Delete all clips
  DELETE FROM public.clips WHERE profile_id = v_profile_id;
  
  -- Delete all clip reactions by this user
  DELETE FROM public.clip_reactions WHERE profile_id = v_profile_id;
  
  -- Delete all listens by this user
  DELETE FROM public.listens WHERE profile_id = v_profile_id;
  
  -- Delete all comments by this user
  DELETE FROM public.comments WHERE profile_id = v_profile_id;
  
  -- Delete all posts by this user
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
  
  -- Delete admins
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

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.anonymize_account() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.purge_account(BOOLEAN) TO authenticated, anon;

-- Add comments
COMMENT ON FUNCTION public.anonymize_account() IS 
'Anonymizes the account (deletes personal data, follows, blocks) but keeps content (clips, posts, comments) showing as "deleted_user_xxx".';

COMMENT ON FUNCTION public.purge_account(BOOLEAN) IS 
'Deletes all user data. If p_keep_content is true, anonymizes account instead of deleting everything. Use with caution - this action cannot be undone.';

