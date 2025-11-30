-- Update get_spotlight_question to use daily_spotlight_questions table
-- This replaces the old rotation system with AI-generated daily questions

CREATE OR REPLACE FUNCTION public.get_spotlight_question(
  p_exclude_question_id UUID DEFAULT NULL,
  p_today_topic_id UUID DEFAULT NULL
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
  v_current_date DATE;
  v_daily_question RECORD;
BEGIN
  -- Get current date explicitly to ensure it's always fresh
  v_current_date := CURRENT_DATE;
  
  -- Get today's spotlight question from the daily_spotlight_questions table
  SELECT 
    dsq.id,
    dsq.topic_id,
    NULL::UUID as profile_id, -- Daily questions are system-generated, no profile
    dsq.question as content,
    true::BOOLEAN as is_question,
    false::BOOLEAN as is_answered, -- Daily questions are always "unanswered" to encourage responses
    0::INT as upvotes_count,
    0::INT as replies_count,
    100.0::NUMERIC as spotlight_score, -- High score to ensure it's featured
    dsq.created_at,
    COALESCE(dsq.topic_title, t.title)::TEXT as topic_title,
    COALESCE(dsq.topic_description, t.description)::TEXT as topic_description,
    NULL::TEXT as profile_handle,
    NULL::TEXT as profile_emoji_avatar
  INTO v_daily_question
  FROM public.daily_spotlight_questions dsq
  LEFT JOIN public.topics t ON t.id = dsq.topic_id
  WHERE dsq.date = v_current_date
  LIMIT 1;
  
  -- If we found a daily question, return it
  IF v_daily_question IS NOT NULL THEN
    RETURN QUERY SELECT
      v_daily_question.id,
      v_daily_question.topic_id,
      v_daily_question.profile_id,
      v_daily_question.content,
      v_daily_question.is_question,
      v_daily_question.is_answered,
      v_daily_question.upvotes_count,
      v_daily_question.replies_count,
      v_daily_question.spotlight_score,
      v_daily_question.created_at,
      v_daily_question.topic_title,
      v_daily_question.topic_description,
      v_daily_question.profile_handle,
      v_daily_question.profile_emoji_avatar;
    RETURN;
  END IF;
  
  -- Fallback: If no daily question exists, return empty (frontend can handle this)
  -- The daily-spotlight-question function should be called to generate one
  RETURN;
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_spotlight_question(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_spotlight_question(UUID, UUID) TO anon;

COMMENT ON FUNCTION public.get_spotlight_question(UUID, UUID) IS 
'Gets today''s spotlight question from the daily_spotlight_questions table. Questions are AI-generated daily by the daily-spotlight-question edge function.';

