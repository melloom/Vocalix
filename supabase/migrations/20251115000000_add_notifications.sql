-- Notifications system
-- Supports: comments, replies, follows, reactions, mentions, challenge updates

-- Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('comment', 'reply', 'follow', 'reaction', 'mention', 'challenge_update')),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('clip', 'comment', 'challenge', 'profile')),
  entity_id UUID NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_id ON public.notifications(recipient_id);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread ON public.notifications(recipient_id, read_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_entity ON public.notifications(entity_type, entity_id);

-- Prevent duplicate notifications for the same event (handles NULL actor_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_unique 
ON public.notifications(recipient_id, type, entity_type, entity_id, COALESCE(actor_id, '00000000-0000-0000-0000-000000000000'::UUID));

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can view their own notifications
CREATE POLICY "Notifications readable by recipient"
ON public.notifications FOR SELECT
USING (
  recipient_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- System can insert notifications (via triggers/functions)
CREATE POLICY "Notifications insertable by system"
ON public.notifications FOR INSERT
WITH CHECK (true);

-- Users can update their own notifications (mark as read)
CREATE POLICY "Notifications updatable by recipient"
ON public.notifications FOR UPDATE
USING (
  recipient_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Function to create a notification
CREATE OR REPLACE FUNCTION public.create_notification(
  p_recipient_id UUID,
  p_actor_id UUID,
  p_type TEXT,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
  v_notification_id UUID;
BEGIN
  -- Don't notify yourself
  IF p_recipient_id = p_actor_id THEN
    RETURN NULL;
  END IF;

  -- Insert notification, ignoring duplicates
  INSERT INTO public.notifications (
    recipient_id,
    actor_id,
    type,
    entity_type,
    entity_id,
    metadata
  )
  VALUES (
    p_recipient_id,
    p_actor_id,
    p_type,
    p_entity_type,
    p_entity_id,
    p_metadata
  )
  ON CONFLICT (recipient_id, type, entity_type, entity_id, actor_id) DO NOTHING
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to extract mentions from comment text
CREATE OR REPLACE FUNCTION public.extract_mentions(text_content TEXT)
RETURNS TEXT[] AS $$
DECLARE
  mention_pattern TEXT := '@([a-zA-Z0-9_-]+)';
  mentions TEXT[];
BEGIN
  -- Extract all @mentions from text
  SELECT array_agg(DISTINCT substring(match[1] FROM 1))
  INTO mentions
  FROM regexp_matches(text_content, mention_pattern, 'g') AS match;

  RETURN COALESCE(mentions, ARRAY[]::TEXT[]);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger: Notify on new comment (notify clip owner)
CREATE OR REPLACE FUNCTION public.notify_comment_created()
RETURNS TRIGGER AS $$
DECLARE
  v_clip_owner_id UUID;
BEGIN
  -- Get the clip owner
  SELECT profile_id INTO v_clip_owner_id
  FROM public.clips
  WHERE id = NEW.clip_id;

  -- Create notification for clip owner (if comment is not from owner)
  IF v_clip_owner_id IS NOT NULL AND v_clip_owner_id != NEW.profile_id THEN
    PERFORM public.create_notification(
      v_clip_owner_id,
      NEW.profile_id,
      'comment',
      'clip',
      NEW.clip_id,
      jsonb_build_object('comment_id', NEW.id, 'clip_id', NEW.clip_id)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_notify_comment_created
  AFTER INSERT ON public.comments
  FOR EACH ROW
  WHEN (NEW.deleted_at IS NULL)
  EXECUTE FUNCTION public.notify_comment_created();

-- Trigger: Notify on reply (notify parent comment author)
CREATE OR REPLACE FUNCTION public.notify_reply_created()
RETURNS TRIGGER AS $$
DECLARE
  v_parent_comment_author_id UUID;
BEGIN
  -- Only process if this is a reply (has parent_comment_id)
  IF NEW.parent_comment_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get the parent comment author
  SELECT profile_id INTO v_parent_comment_author_id
  FROM public.comments
  WHERE id = NEW.parent_comment_id AND deleted_at IS NULL;

  -- Create notification for parent comment author (if reply is not from author)
  IF v_parent_comment_author_id IS NOT NULL AND v_parent_comment_author_id != NEW.profile_id THEN
    PERFORM public.create_notification(
      v_parent_comment_author_id,
      NEW.profile_id,
      'reply',
      'comment',
      NEW.parent_comment_id,
      jsonb_build_object('reply_id', NEW.id, 'comment_id', NEW.parent_comment_id, 'clip_id', NEW.clip_id)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_notify_reply_created
  AFTER INSERT ON public.comments
  FOR EACH ROW
  WHEN (NEW.deleted_at IS NULL AND NEW.parent_comment_id IS NOT NULL)
  EXECUTE FUNCTION public.notify_reply_created();

-- Trigger: Notify on mention in comment
CREATE OR REPLACE FUNCTION public.notify_mention_created()
RETURNS TRIGGER AS $$
DECLARE
  v_mention_handle TEXT;
  v_mentioned_profile_id UUID;
  v_mentions TEXT[];
BEGIN
  -- Extract mentions from comment content
  v_mentions := public.extract_mentions(NEW.content);

  -- Notify each mentioned user
  FOREACH v_mention_handle IN ARRAY v_mentions
  LOOP
    -- Find profile by handle
    SELECT id INTO v_mentioned_profile_id
    FROM public.profiles
    WHERE handle = v_mention_handle;

    -- Create notification for mentioned user (if not the comment author)
    IF v_mentioned_profile_id IS NOT NULL AND v_mentioned_profile_id != NEW.profile_id THEN
      PERFORM public.create_notification(
        v_mentioned_profile_id,
        NEW.profile_id,
        'mention',
        'comment',
        NEW.id,
        jsonb_build_object('comment_id', NEW.id, 'clip_id', NEW.clip_id)
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_notify_mention_created
  AFTER INSERT ON public.comments
  FOR EACH ROW
  WHEN (NEW.deleted_at IS NULL)
  EXECUTE FUNCTION public.notify_mention_created();

-- Trigger: Notify on new follow
CREATE OR REPLACE FUNCTION public.notify_follow_created()
RETURNS TRIGGER AS $$
BEGIN
  -- Notify the user being followed
  PERFORM public.create_notification(
    NEW.following_id,
    NEW.follower_id,
    'follow',
    'profile',
    NEW.following_id,
    jsonb_build_object('follower_id', NEW.follower_id)
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_notify_follow_created
  AFTER INSERT ON public.follows
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_follow_created();

-- Trigger: Notify on reaction (notify clip owner)
CREATE OR REPLACE FUNCTION public.notify_reaction_created()
RETURNS TRIGGER AS $$
DECLARE
  v_clip_owner_id UUID;
BEGIN
  -- Get the clip owner
  SELECT profile_id INTO v_clip_owner_id
  FROM public.clips
  WHERE id = NEW.clip_id;

  -- Create notification for clip owner (if reaction is not from owner)
  IF v_clip_owner_id IS NOT NULL AND v_clip_owner_id != NEW.profile_id THEN
    PERFORM public.create_notification(
      v_clip_owner_id,
      NEW.profile_id,
      'reaction',
      'clip',
      NEW.clip_id,
      jsonb_build_object('reaction_id', NEW.id, 'emoji', NEW.emoji, 'clip_id', NEW.clip_id)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_notify_reaction_created
  AFTER INSERT ON public.clip_reactions
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_reaction_created();

-- Function to get unread notification count
CREATE OR REPLACE FUNCTION public.get_unread_notification_count(p_profile_id UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM public.notifications
    WHERE recipient_id = p_profile_id
      AND read_at IS NULL
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function to mark notifications as read
CREATE OR REPLACE FUNCTION public.mark_notifications_read(
  p_profile_id UUID,
  p_notification_ids UUID[] DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  IF p_notification_ids IS NOT NULL AND array_length(p_notification_ids, 1) > 0 THEN
    -- Mark specific notifications as read
    UPDATE public.notifications
    SET read_at = now()
    WHERE recipient_id = p_profile_id
      AND id = ANY(p_notification_ids)
      AND read_at IS NULL;
  ELSE
    -- Mark all notifications as read
    UPDATE public.notifications
    SET read_at = now()
    WHERE recipient_id = p_profile_id
      AND read_at IS NULL;
  END IF;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comments for documentation
COMMENT ON TABLE public.notifications IS 'User notifications for comments, replies, follows, reactions, mentions, and challenge updates.';
COMMENT ON COLUMN public.notifications.type IS 'Type of notification: comment, reply, follow, reaction, mention, challenge_update';
COMMENT ON COLUMN public.notifications.entity_type IS 'Type of entity the notification refers to: clip, comment, challenge, profile';
COMMENT ON COLUMN public.notifications.entity_id IS 'ID of the entity the notification refers to';
COMMENT ON COLUMN public.notifications.metadata IS 'Additional data about the notification (e.g., emoji for reactions, comment_id for replies)';
COMMENT ON COLUMN public.notifications.read_at IS 'Timestamp when notification was read. NULL means unread.';

