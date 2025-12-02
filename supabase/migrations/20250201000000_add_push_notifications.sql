-- Push Notifications Support
-- This migration adds support for web push notifications via service workers

-- ============================================================================
-- PUSH SUBSCRIPTIONS TABLE
-- ============================================================================

-- Create push_subscriptions table to store user push notification subscriptions
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL, -- Public key for encryption
  auth TEXT NOT NULL, -- Auth secret for encryption
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(profile_id, endpoint) -- One subscription per user per endpoint
);

-- Enable RLS
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can view their own subscriptions
CREATE POLICY "Push subscriptions readable by owner"
ON public.push_subscriptions FOR SELECT
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Users can insert their own subscriptions
CREATE POLICY "Push subscriptions insertable by owner"
ON public.push_subscriptions FOR INSERT
WITH CHECK (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Users can update their own subscriptions
CREATE POLICY "Push subscriptions updatable by owner"
ON public.push_subscriptions FOR UPDATE
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Users can delete their own subscriptions
CREATE POLICY "Push subscriptions deletable by owner"
ON public.push_subscriptions FOR DELETE
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_profile_id ON public.push_subscriptions(profile_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON public.push_subscriptions(endpoint);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to save or update push subscription
CREATE OR REPLACE FUNCTION public.save_push_subscription(
  p_profile_id UUID,
  p_endpoint TEXT,
  p_p256dh TEXT,
  p_auth TEXT,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_subscription_id UUID;
BEGIN
  -- Insert or update subscription
  INSERT INTO public.push_subscriptions (
    profile_id,
    endpoint,
    p256dh,
    auth,
    user_agent,
    updated_at
  )
  VALUES (
    p_profile_id,
    p_endpoint,
    p_p256dh,
    p_auth,
    p_user_agent,
    now()
  )
  ON CONFLICT (profile_id, endpoint) 
  DO UPDATE SET
    p256dh = EXCLUDED.p256dh,
    auth = EXCLUDED.auth,
    user_agent = EXCLUDED.user_agent,
    updated_at = now()
  RETURNING id INTO v_subscription_id;
  
  RETURN v_subscription_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to delete push subscription
CREATE OR REPLACE FUNCTION public.delete_push_subscription(
  p_profile_id UUID,
  p_endpoint TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
  DELETE FROM public.push_subscriptions
  WHERE profile_id = p_profile_id AND endpoint = p_endpoint;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get all push subscriptions for a user
CREATE OR REPLACE FUNCTION public.get_push_subscriptions(
  p_profile_id UUID
)
RETURNS TABLE (
  id UUID,
  endpoint TEXT,
  p256dh TEXT,
  auth TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ps.id,
    ps.endpoint,
    ps.p256dh,
    ps.auth,
    ps.user_agent,
    ps.created_at,
    ps.updated_at
  FROM public.push_subscriptions ps
  WHERE ps.profile_id = p_profile_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.save_push_subscription IS 
'Saves or updates a push notification subscription for a user';

COMMENT ON FUNCTION public.delete_push_subscription IS 
'Deletes a push notification subscription';

COMMENT ON FUNCTION public.get_push_subscriptions IS 
'Gets all push notification subscriptions for a user';

-- ============================================================================
-- PUSH NOTIFICATION TRIGGER
-- ============================================================================

-- Function to send push notification when a notification is created
-- This function calls the send-push-notification Edge Function
CREATE OR REPLACE FUNCTION public.send_push_notification_on_create()
RETURNS TRIGGER AS $$
DECLARE
  v_actor_handle TEXT;
  v_title TEXT;
  v_body TEXT;
  v_icon TEXT := '/favicon.ico';
  v_badge TEXT := '/favicon.ico';
  v_tag TEXT;
  v_data JSONB;
  v_url TEXT;
BEGIN
  -- Only send push if notification was just created (not updated)
  IF TG_OP != 'INSERT' THEN
    RETURN NEW;
  END IF;

  -- Get actor handle for notification text
  SELECT handle INTO v_actor_handle
  FROM public.profiles
  WHERE id = NEW.actor_id;

  -- Build notification payload based on type
  CASE NEW.type
    WHEN 'comment' THEN
      v_title := 'New comment';
      v_body := COALESCE(v_actor_handle, 'Someone') || ' commented on your clip';
      v_data := jsonb_build_object(
        'clip_id', NEW.entity_id,
        'notification_id', NEW.id,
        'url', '/clip/' || NEW.entity_id
      );
      v_url := '/clip/' || NEW.entity_id;
      
    WHEN 'reply' THEN
      v_title := 'New reply';
      v_body := COALESCE(v_actor_handle, 'Someone') || ' replied to your comment';
      v_data := jsonb_build_object(
        'clip_id', (NEW.metadata->>'clip_id')::uuid,
        'comment_id', NEW.entity_id,
        'notification_id', NEW.id,
        'url', '/clip/' || (NEW.metadata->>'clip_id')
      );
      v_url := '/clip/' || (NEW.metadata->>'clip_id');
      
    WHEN 'follow' THEN
      v_title := 'New follower';
      v_body := COALESCE(v_actor_handle, 'Someone') || ' started following you';
      v_data := jsonb_build_object(
        'profile_handle', v_actor_handle,
        'notification_id', NEW.id,
        'url', '/profile/' || v_actor_handle
      );
      v_url := '/profile/' || v_actor_handle;
      
    WHEN 'reaction' THEN
      DECLARE
        v_emoji TEXT := COALESCE(NEW.metadata->>'emoji', '❤️');
      BEGIN
        v_title := 'New reaction';
        v_body := COALESCE(v_actor_handle, 'Someone') || ' reacted with ' || v_emoji || ' to your clip';
        v_data := jsonb_build_object(
          'clip_id', NEW.entity_id,
          'emoji', v_emoji,
          'notification_id', NEW.id,
          'url', '/clip/' || NEW.entity_id
        );
        v_url := '/clip/' || NEW.entity_id;
      END;
      
    WHEN 'mention' THEN
      v_title := 'You were mentioned';
      v_body := COALESCE(v_actor_handle, 'Someone') || ' mentioned you in a comment';
      v_data := jsonb_build_object(
        'clip_id', NEW.entity_id,
        'notification_id', NEW.id,
        'url', '/clip/' || NEW.entity_id
      );
      v_url := '/clip/' || NEW.entity_id;
      
    WHEN 'challenge_update' THEN
      v_title := 'Challenge update';
      v_body := 'New update on a challenge you''re following';
      v_data := jsonb_build_object(
        'challenge_id', NEW.entity_id,
        'notification_id', NEW.id,
        'url', '/challenges'
      );
      v_url := '/challenges';
      
    WHEN 'badge_unlocked' THEN
      DECLARE
        v_badge_name TEXT := COALESCE(NEW.metadata->>'badge_name', 'Badge');
        v_badge_icon TEXT := COALESCE(NEW.metadata->>'badge_icon', '🏆');
      BEGIN
        v_title := 'Badge Unlocked!';
        v_body := 'You unlocked ' || v_badge_icon || ' ' || v_badge_name || '!';
        v_data := jsonb_build_object(
          'badge_name', v_badge_name,
          'badge_icon', v_badge_icon,
          'notification_id', NEW.id,
          'url', '/profile'
        );
        v_url := '/profile';
      END;
      
    WHEN 'direct_message' THEN
      v_title := 'New message';
      v_body := COALESCE(v_actor_handle, 'Someone') || ' sent you a message';
      v_data := jsonb_build_object(
        'message_id', NEW.entity_id,
        'notification_id', NEW.id,
        'url', '/messages'
      );
      v_url := '/messages';
      
    ELSE
      -- Unknown notification type, skip push
      RETURN NEW;
  END CASE;

  v_tag := NEW.id::TEXT;

  -- Call the Edge Function to send push notification
  -- Using pg_net extension if available
  -- Note: This requires pg_net extension to be enabled in Supabase
  -- If pg_net is not available, you can call the Edge Function from application code
  -- when notifications are created, or use Supabase database webhooks
  BEGIN
    PERFORM
      net.http_post(
        url := current_setting('app.settings.supabase_url', true) || '/functions/v1/send-push-notification',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key', true)
        ),
        body := jsonb_build_object(
          'profile_id', NEW.recipient_id,
          'title', v_title,
          'body', v_body,
          'icon', v_icon,
          'badge', v_badge,
          'tag', v_tag,
          'data', v_data
        )
      );
  EXCEPTION
    WHEN undefined_function THEN
      -- pg_net extension not available, skip push notification
      -- Application code should handle push notifications in this case
      RAISE WARNING 'pg_net extension not available. Push notifications should be handled by application code.';
    WHEN OTHERS THEN
      -- Log error but don't fail the notification creation
      RAISE WARNING 'Failed to send push notification: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to send push notifications when notifications are created
CREATE TRIGGER trigger_send_push_notification
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.send_push_notification_on_create();

COMMENT ON FUNCTION public.send_push_notification_on_create() IS 
'Sends push notification when a new notification is created. Uses pg_net to call the send-push-notification Edge Function.';

-- Note: For this to work, you need:
-- 1. pg_net extension enabled in Supabase (usually enabled by default)
-- 2. VAPID keys configured as environment variables in Supabase:
--    - VAPID_PUBLIC_KEY
--    - VAPID_PRIVATE_KEY
--    - VAPID_SUBJECT (optional, defaults to mailto:support@echogarden.app)
-- 3. The send-push-notification Edge Function deployed

