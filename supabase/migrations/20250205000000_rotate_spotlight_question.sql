-- Update get_spotlight_question to rotate questions
-- Excludes the question that was shown recently and adds time-based rotation

CREATE OR REPLACE FUNCTION public.get_spotlight_question(
  p_exclude_question_id UUID DEFAULT NULL
)
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
DECLARE
  v_day_of_year INTEGER;
  v_offset INTEGER;
BEGIN
  -- Use day of year to rotate questions (changes daily)
  v_day_of_year := EXTRACT(DOY FROM CURRENT_DATE)::INTEGER;
  
  -- Calculate offset based on day of year to rotate through questions
  -- This ensures questions change daily
  v_offset := (v_day_of_year % 3); -- Rotate through top 3 questions
  
  RETURN QUERY
  WITH ranked_questions AS (
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
      p.emoji_avatar as profile_emoji_avatar,
      ROW_NUMBER() OVER (ORDER BY tc.spotlight_score DESC, tc.created_at DESC) as rn
    FROM public.topic_comments tc
    INNER JOIN public.topics t ON t.id = tc.topic_id
    LEFT JOIN public.profiles p ON p.id = tc.profile_id
    WHERE tc.is_question = true
      AND tc.deleted_at IS NULL
      AND tc.parent_comment_id IS NULL
      AND t.is_active = true
      AND tc.spotlight_score > 0
      AND (p_exclude_question_id IS NULL OR tc.id != p_exclude_question_id)
    ORDER BY tc.spotlight_score DESC, tc.created_at DESC
    LIMIT 10 -- Get top 10, then rotate
  )
  SELECT 
    rq.id,
    rq.topic_id,
    rq.profile_id,
    rq.content,
    rq.is_question,
    rq.is_answered,
    rq.upvotes_count,
    rq.replies_count,
    rq.spotlight_score,
    rq.created_at,
    rq.topic_title,
    rq.topic_description,
    rq.profile_handle,
    rq.profile_emoji_avatar
  FROM ranked_questions rq
  WHERE rq.rn = (v_offset + 1) -- Rotate: day 1 = question 1, day 2 = question 2, etc.
  LIMIT 1;
  
  -- If no question found with offset, return the top question
  IF NOT FOUND THEN
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
      AND (p_exclude_question_id IS NULL OR tc.id != p_exclude_question_id)
    ORDER BY tc.spotlight_score DESC, tc.created_at DESC
    LIMIT 1;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_spotlight_question(UUID) TO authenticated, anon;

