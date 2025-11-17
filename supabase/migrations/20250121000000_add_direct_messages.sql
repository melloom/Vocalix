-- Direct Messages (Voice Messages) System
-- Allows users to send voice messages to each other

-- Create direct_messages table
CREATE TABLE IF NOT EXISTS public.direct_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  audio_path TEXT NOT NULL,
  duration_seconds INT NOT NULL,
  transcript TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  CHECK (sender_id != recipient_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_direct_messages_sender ON public.direct_messages(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_direct_messages_recipient ON public.direct_messages(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_direct_messages_conversation ON public.direct_messages(
  LEAST(sender_id, recipient_id),
  GREATEST(sender_id, recipient_id),
  created_at DESC
);
CREATE INDEX IF NOT EXISTS idx_direct_messages_unread ON public.direct_messages(recipient_id, read_at) WHERE read_at IS NULL;

-- Enable RLS
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

-- Users can view messages they sent or received
CREATE POLICY "Direct messages readable by participants"
ON public.direct_messages FOR SELECT
USING (
  sender_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
  OR recipient_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Users can send messages
CREATE POLICY "Direct messages insertable by sender"
ON public.direct_messages FOR INSERT
WITH CHECK (
  sender_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Recipients can mark messages as read
CREATE POLICY "Direct messages updatable by recipient"
ON public.direct_messages FOR UPDATE
USING (
  recipient_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Function to get conversation between two users
CREATE OR REPLACE FUNCTION public.get_conversation(
  user1_id UUID,
  user2_id UUID,
  limit_count INT DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  sender_id UUID,
  recipient_id UUID,
  audio_path TEXT,
  duration_seconds INT,
  transcript TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dm.id,
    dm.sender_id,
    dm.recipient_id,
    dm.audio_path,
    dm.duration_seconds,
    dm.transcript,
    dm.read_at,
    dm.created_at
  FROM public.direct_messages dm
  WHERE (dm.sender_id = user1_id AND dm.recipient_id = user2_id)
     OR (dm.sender_id = user2_id AND dm.recipient_id = user1_id)
  ORDER BY dm.created_at ASC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get unread message count for a user
CREATE OR REPLACE FUNCTION public.get_unread_message_count(profile_id_param UUID)
RETURNS INT AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INT
    FROM public.direct_messages
    WHERE recipient_id = profile_id_param
      AND read_at IS NULL
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark conversation as read
CREATE OR REPLACE FUNCTION public.mark_conversation_read(
  current_user_id UUID,
  other_user_id UUID
)
RETURNS void AS $$
BEGIN
  UPDATE public.direct_messages
  SET read_at = now()
  WHERE recipient_id = current_user_id
    AND sender_id = other_user_id
    AND read_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get list of conversations (most recent message per conversation)
CREATE OR REPLACE FUNCTION public.get_conversations(profile_id_param UUID)
RETURNS TABLE (
  other_user_id UUID,
  other_user_handle TEXT,
  other_user_avatar TEXT,
  last_message_id UUID,
  last_message_audio_path TEXT,
  last_message_duration_seconds INT,
  last_message_created_at TIMESTAMPTZ,
  unread_count INT,
  is_sender BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  WITH conversation_messages AS (
    SELECT 
      dm.id,
      dm.sender_id,
      dm.recipient_id,
      dm.audio_path,
      dm.duration_seconds,
      dm.created_at,
      dm.read_at,
      CASE 
        WHEN dm.sender_id = profile_id_param THEN dm.recipient_id
        ELSE dm.sender_id
      END AS other_user_id,
      CASE 
        WHEN dm.sender_id = profile_id_param THEN true
        ELSE false
      END AS is_sender
    FROM public.direct_messages dm
    WHERE dm.sender_id = profile_id_param OR dm.recipient_id = profile_id_param
  ),
  latest_messages AS (
    SELECT DISTINCT ON (other_user_id)
      id,
      other_user_id,
      audio_path,
      duration_seconds,
      created_at,
      is_sender
    FROM conversation_messages
    ORDER BY other_user_id, created_at DESC
  ),
  unread_counts AS (
    SELECT 
      other_user_id,
      COUNT(*)::INT AS unread_count
    FROM conversation_messages
    WHERE is_sender = false AND read_at IS NULL
    GROUP BY other_user_id
  )
  SELECT 
    lm.other_user_id,
    p.handle,
    p.emoji_avatar,
    lm.id,
    lm.audio_path,
    lm.duration_seconds,
    lm.created_at,
    COALESCE(uc.unread_count, 0)::INT,
    lm.is_sender
  FROM latest_messages lm
  JOIN public.profiles p ON p.id = lm.other_user_id
  LEFT JOIN unread_counts uc ON uc.other_user_id = lm.other_user_id
  ORDER BY lm.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create notification when message is received
CREATE OR REPLACE FUNCTION public.notify_direct_message_received()
RETURNS TRIGGER AS $$
BEGIN
  -- Don't notify if user is messaging themselves (shouldn't happen due to CHECK constraint)
  IF NEW.sender_id = NEW.recipient_id THEN
    RETURN NEW;
  END IF;

  -- Create notification for recipient
  PERFORM public.create_notification(
    NEW.recipient_id,
    NEW.sender_id,
    'direct_message',
    'message',
    NEW.id,
    jsonb_build_object(
      'message_id', NEW.id,
      'sender_id', NEW.sender_id,
      'audio_path', NEW.audio_path,
      'duration_seconds', NEW.duration_seconds
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_notify_direct_message_received
  AFTER INSERT ON public.direct_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_direct_message_received();

-- Update notifications table to support direct_message type
-- Check if the type already exists, if not, we'll need to alter the constraint
DO $$
BEGIN
  -- Check if 'direct_message' is already in the type constraint
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints 
    WHERE constraint_name LIKE '%notifications_type%' 
    AND check_clause LIKE '%direct_message%'
  ) THEN
    -- Drop and recreate the constraint to add 'direct_message'
    ALTER TABLE public.notifications 
    DROP CONSTRAINT IF EXISTS notifications_type_check;
    
    ALTER TABLE public.notifications 
    ADD CONSTRAINT notifications_type_check 
    CHECK (type IN ('comment', 'reply', 'follow', 'reaction', 'mention', 'challenge_update', 'direct_message'));
  END IF;
END $$;

-- Update entity_type constraint to support 'message'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints 
    WHERE constraint_name LIKE '%notifications_entity_type%' 
    AND check_clause LIKE '%message%'
  ) THEN
    ALTER TABLE public.notifications 
    DROP CONSTRAINT IF EXISTS notifications_entity_type_check;
    
    ALTER TABLE public.notifications 
    ADD CONSTRAINT notifications_entity_type_check 
    CHECK (entity_type IN ('clip', 'comment', 'challenge', 'profile', 'message'));
  END IF;
END $$;

