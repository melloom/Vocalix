-- Add Garden Spotlight Questions System
-- Highlights the best/most engaging questions based on community engagement

-- Step 1: Add spotlight_score column to topic_comments for questions
ALTER TABLE public.topic_comments
  ADD COLUMN IF NOT EXISTS spotlight_score NUMERIC DEFAULT 0;

-- Step 2: Create index for spotlight queries
CREATE INDEX IF NOT EXISTS idx_topic_comments_spotlight_score 
ON public.topic_comments(spotlight_score DESC, created_at DESC) 
WHERE is_question = true AND deleted_at IS NULL;

-- Step 3: Function to calculate question spotlight score
-- Formula considers: upvotes, replies, recency, topic popularity, and answer status
CREATE OR REPLACE FUNCTION public.calculate_question_spotlight_score(p_comment_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  v_score NUMERIC := 0;
  v_upvotes INT := 0;
  v_replies INT := 0;
  v_hours_since_created NUMERIC;
  v_topic_trending_score NUMERIC := 0;
  v_is_answered BOOLEAN := false;
  v_recent_reply_hours NUMERIC := NULL;
BEGIN
  -- Get question data
  SELECT 
    upvotes_count,
    replies_count,
    is_answered,
    EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600,
    (SELECT trending_score FROM public.topics WHERE id = topic_id)
  INTO v_upvotes, v_replies, v_is_answered, v_hours_since_created, v_topic_trending_score
  FROM public.topic_comments
  WHERE id = p_comment_id AND is_question = true;

  -- If question doesn't exist or isn't a question, return 0
  IF v_upvotes IS NULL THEN
    RETURN 0;
  END IF;

  -- Get most recent reply time (if any)
  SELECT EXTRACT(EPOCH FROM (NOW() - MAX(created_at))) / 3600
  INTO v_recent_reply_hours
  FROM public.topic_comments
  WHERE parent_comment_id = p_comment_id AND deleted_at IS NULL;

  -- Spotlight score formula:
  -- Base engagement: upvotes * 5 + replies * 10 (replies are more valuable)
  -- Recency bonus: divide by (hours + 1) to favor recent questions (max 72 hours bonus)
  -- Topic boost: add topic trending score * 0.1 (questions on trending topics get boost)
  -- Answer penalty: unanswered questions get 1.5x boost (encourages engagement)
  -- Recent activity bonus: if replied to recently (within 24h), add bonus

  DECLARE
    base_engagement NUMERIC;
    recency_factor NUMERIC;
    topic_boost NUMERIC;
    answer_factor NUMERIC;
    activity_bonus NUMERIC;
  BEGIN
    base_engagement := (v_upvotes * 5) + (v_replies * 10);
    
    -- Recency: more recent = higher score (decay over time)
    -- Use logarithmic decay for better long-tail engagement
    recency_factor := 1.0 / GREATEST(LOG(GREATEST(v_hours_since_created, 1) + 1) + 1, 0.1);
    
    -- Topic boost (normalize trending score)
    topic_boost := COALESCE(v_topic_trending_score * 0.1, 0);
    
    -- Unanswered questions get boost to encourage engagement
    answer_factor := CASE WHEN NOT v_is_answered THEN 1.5 ELSE 1.0 END;
    
    -- Recent activity bonus (replies in last 24 hours)
    activity_bonus := CASE 
      WHEN v_recent_reply_hours IS NOT NULL AND v_recent_reply_hours <= 24 THEN 20
      WHEN v_recent_reply_hours IS NOT NULL AND v_recent_reply_hours <= 48 THEN 10
      ELSE 0
    END;
    
    v_score := (base_engagement * recency_factor * answer_factor) + topic_boost + activity_bonus;
  END;

  RETURN GREATEST(v_score, 0);
END;
$$ LANGUAGE plpgsql STABLE;

-- Step 4: Function to update spotlight score for a question
CREATE OR REPLACE FUNCTION public.update_question_spotlight_score()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the question's spotlight score if it's a question
  IF NEW.is_question = true THEN
    UPDATE public.topic_comments
    SET spotlight_score = public.calculate_question_spotlight_score(NEW.id)
    WHERE id = NEW.id;
  END IF;
  
  -- If this is a reply, update the parent question's score
  IF NEW.parent_comment_id IS NOT NULL THEN
    UPDATE public.topic_comments
    SET spotlight_score = public.calculate_question_spotlight_score(NEW.parent_comment_id)
    WHERE id = NEW.parent_comment_id AND is_question = true;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Step 5: Trigger to update spotlight scores on comment changes
DROP TRIGGER IF EXISTS update_question_spotlight_score_trigger ON public.topic_comments;
CREATE TRIGGER update_question_spotlight_score_trigger
AFTER INSERT OR UPDATE OF upvotes_count, replies_count, is_answered, is_question ON public.topic_comments
FOR EACH ROW 
WHEN (NEW.is_question = true)
EXECUTE FUNCTION public.update_question_spotlight_score();

-- Additional trigger for UPDATE that checks OLD value (for when is_question changes from true to false)
DROP TRIGGER IF EXISTS update_question_spotlight_score_old_trigger ON public.topic_comments;
CREATE TRIGGER update_question_spotlight_score_old_trigger
AFTER UPDATE OF is_question ON public.topic_comments
FOR EACH ROW 
WHEN (OLD.is_question = true AND NEW.is_question = false)
EXECUTE FUNCTION public.update_question_spotlight_score();

-- Step 6: Trigger to update parent question score when reply is added/deleted
CREATE OR REPLACE FUNCTION public.update_parent_spotlight_on_reply()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the parent question's spotlight score when reply is added/removed
  IF TG_OP = 'INSERT' AND NEW.parent_comment_id IS NOT NULL THEN
    UPDATE public.topic_comments
    SET spotlight_score = public.calculate_question_spotlight_score(NEW.parent_comment_id)
    WHERE id = NEW.parent_comment_id AND is_question = true;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' AND OLD.parent_comment_id IS NOT NULL THEN
    UPDATE public.topic_comments
    SET spotlight_score = public.calculate_question_spotlight_score(OLD.parent_comment_id)
    WHERE id = OLD.parent_comment_id AND is_question = true;
    RETURN OLD;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS update_parent_spotlight_on_reply_trigger ON public.topic_comments;
CREATE TRIGGER update_parent_spotlight_on_reply_trigger
AFTER INSERT OR DELETE ON public.topic_comments
FOR EACH ROW EXECUTE FUNCTION public.update_parent_spotlight_on_reply();

-- Step 7: Function to update spotlight score when upvotes change
CREATE OR REPLACE FUNCTION public.update_spotlight_on_upvote_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the question's spotlight score when upvote is added/removed
  IF TG_OP = 'INSERT' OR TG_OP = 'DELETE' THEN
    UPDATE public.topic_comments
    SET spotlight_score = public.calculate_question_spotlight_score(
      COALESCE(NEW.comment_id, OLD.comment_id)
    )
    WHERE id = COALESCE(NEW.comment_id, OLD.comment_id) AND is_question = true;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Step 7b: Trigger to update when upvotes change
DROP TRIGGER IF EXISTS update_spotlight_on_upvote_trigger ON public.topic_comment_upvotes;
CREATE TRIGGER update_spotlight_on_upvote_trigger
AFTER INSERT OR DELETE ON public.topic_comment_upvotes
FOR EACH ROW EXECUTE FUNCTION public.update_spotlight_on_upvote_change();

-- Step 8: Function to get the top spotlight question
CREATE OR REPLACE FUNCTION public.get_spotlight_question()
RETURNS TABLE (
  id UUID,
  topic_id UUID,
  profile_id UUID,
  content TEXT,
  is_question BOOLEAN,
  is_answered BOOLEAN,
  upvotes_count INT,
  replies_count INT,
  spotlight_score NUMERIC,
  created_at TIMESTAMPTZ,
  topic_title TEXT,
  topic_description TEXT,
  profile_handle TEXT,
  profile_emoji_avatar TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    tc.id,
    tc.topic_id,
    tc.profile_id,
    tc.content,
    tc.is_question,
    tc.is_answered,
    tc.upvotes_count,
    tc.replies_count,
    tc.spotlight_score,
    tc.created_at,
    t.title as topic_title,
    t.description as topic_description,
    p.handle as profile_handle,
    p.emoji_avatar as profile_emoji_avatar
  FROM public.topic_comments tc
  INNER JOIN public.topics t ON t.id = tc.topic_id
  LEFT JOIN public.profiles p ON p.id = tc.profile_id
  WHERE tc.is_question = true
    AND tc.deleted_at IS NULL
    AND tc.parent_comment_id IS NULL
    AND t.is_active = true
    AND tc.spotlight_score > 0
  ORDER BY tc.spotlight_score DESC, tc.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

-- Step 9: Initial calculation for existing questions
-- Calculate spotlight scores for all existing questions
DO $$
DECLARE
  question_record RECORD;
BEGIN
  FOR question_record IN 
    SELECT id FROM public.topic_comments 
    WHERE is_question = true AND deleted_at IS NULL AND parent_comment_id IS NULL
  LOOP
    UPDATE public.topic_comments
    SET spotlight_score = public.calculate_question_spotlight_score(question_record.id)
    WHERE id = question_record.id;
  END LOOP;
END $$;

