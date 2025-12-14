-- Smart Notifications for Topic and Challenge Follows
-- Only notify users of high-quality clips when they follow topics/challenges

-- Step 1: Update notifications table to support new notification types
-- First, drop the check constraint if it exists
DO $$ 
BEGIN
  ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

-- Add new notification types
ALTER TABLE public.notifications
ADD CONSTRAINT notifications_type_check 
CHECK (type IN ('comment', 'reply', 'follow', 'reaction', 'mention', 'challenge_update', 'topic_new_clip', 'challenge_new_clip'));

-- Step 2: Function to check if a clip is high quality (for smart notifications)
-- Quality threshold: trending_score > 50 OR completion_rate > 0.7 OR listens_count > 5
CREATE OR REPLACE FUNCTION public.is_high_quality_clip(p_clip_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_clip_record RECORD;
  v_trending_score NUMERIC;
  v_completion_rate NUMERIC;
  v_listens_count INTEGER;
BEGIN
  -- Get clip data
  SELECT 
    trending_score,
    completion_rate,
    listens_count,
    status
  INTO v_clip_record
  FROM public.clips
  WHERE id = p_clip_id;
  
  -- If clip doesn't exist or isn't live, return false
  IF NOT FOUND OR v_clip_record.status != 'live' THEN
    RETURN false;
  END IF;
  
  v_trending_score := COALESCE(v_clip_record.trending_score, 0);
  v_completion_rate := COALESCE(v_clip_record.completion_rate, 0);
  v_listens_count := COALESCE(v_clip_record.listens_count, 0);
  
  -- High quality if:
  -- 1. Trending score > 50 (moderate engagement)
  -- 2. Completion rate > 0.7 (people listen to the end)
  -- 3. Listens count > 5 (some initial engagement)
  -- OR if clip is very new (less than 1 hour old), give it a chance
  RETURN (
    v_trending_score > 50 OR
    v_completion_rate > 0.7 OR
    v_listens_count > 5 OR
    (EXTRACT(EPOCH FROM (NOW() - (SELECT created_at FROM public.clips WHERE id = p_clip_id))) / 3600.0) < 1
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Step 3: Trigger function to notify topic followers when a new clip is posted
CREATE OR REPLACE FUNCTION public.notify_topic_followers_new_clip()
RETURNS TRIGGER AS $$
DECLARE
  v_subscriber RECORD;
  v_is_high_quality BOOLEAN;
BEGIN
  -- Only process if clip is live and has a topic
  IF NEW.status != 'live' OR NEW.topic_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Check if clip is high quality (for smart notifications)
  v_is_high_quality := public.is_high_quality_clip(NEW.id);
  
  -- Only notify if clip is high quality
  IF NOT v_is_high_quality THEN
    RETURN NEW;
  END IF;
  
  -- Notify all users who follow this topic
  FOR v_subscriber IN
    SELECT profile_id
    FROM public.topic_subscriptions
    WHERE topic_id = NEW.topic_id
      AND profile_id != NEW.profile_id  -- Don't notify the clip creator
  LOOP
    PERFORM public.create_notification(
      v_subscriber.profile_id,
      NEW.profile_id,
      'topic_new_clip',
      'clip',
      NEW.id,
      jsonb_build_object(
        'clip_id', NEW.id,
        'topic_id', NEW.topic_id,
        'topic_title', (SELECT title FROM public.topics WHERE id = NEW.topic_id)
      )
    );
  END LOOP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 4: Trigger function to notify challenge followers when a new clip is posted
CREATE OR REPLACE FUNCTION public.notify_challenge_followers_new_clip()
RETURNS TRIGGER AS $$
DECLARE
  v_subscriber RECORD;
  v_is_high_quality BOOLEAN;
BEGIN
  -- Only process if clip is live and has a challenge
  IF NEW.status != 'live' OR NEW.challenge_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Check if clip is high quality (for smart notifications)
  v_is_high_quality := public.is_high_quality_clip(NEW.id);
  
  -- Only notify if clip is high quality
  IF NOT v_is_high_quality THEN
    RETURN NEW;
  END IF;
  
  -- Notify all users who follow this challenge
  FOR v_subscriber IN
    SELECT profile_id
    FROM public.challenge_follows
    WHERE challenge_id = NEW.challenge_id
      AND profile_id != NEW.profile_id  -- Don't notify the clip creator
  LOOP
    PERFORM public.create_notification(
      v_subscriber.profile_id,
      NEW.profile_id,
      'challenge_new_clip',
      'clip',
      NEW.id,
      jsonb_build_object(
        'clip_id', NEW.id,
        'challenge_id', NEW.challenge_id,
        'challenge_title', (SELECT title FROM public.challenges WHERE id = NEW.challenge_id)
      )
    );
  END LOOP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 5: Create triggers
-- Note: We use UPDATE trigger because clips are initially inserted with status='processing'
-- and then updated to status='live' after processing
DROP TRIGGER IF EXISTS trigger_notify_topic_followers_new_clip ON public.clips;
CREATE TRIGGER trigger_notify_topic_followers_new_clip
  AFTER UPDATE ON public.clips
  FOR EACH ROW
  WHEN (NEW.status = 'live' AND OLD.status != 'live' AND NEW.topic_id IS NOT NULL)
  EXECUTE FUNCTION public.notify_topic_followers_new_clip();

DROP TRIGGER IF EXISTS trigger_notify_challenge_followers_new_clip ON public.clips;
CREATE TRIGGER trigger_notify_challenge_followers_new_clip
  AFTER UPDATE ON public.clips
  FOR EACH ROW
  WHEN (NEW.status = 'live' AND OLD.status != 'live' AND NEW.challenge_id IS NOT NULL)
  EXECUTE FUNCTION public.notify_challenge_followers_new_clip();

-- Step 6: Also handle clips that are inserted directly as 'live' (less common but possible)
-- We'll use a deferred approach: check quality after a short delay
-- For now, we'll rely on the UPDATE trigger which handles the common case

-- Step 7: Grant execute permissions
GRANT EXECUTE ON FUNCTION public.is_high_quality_clip(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_topic_followers_new_clip() TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_challenge_followers_new_clip() TO authenticated;

