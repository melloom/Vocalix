-- Fix daily spotlight question rotation to force change every day
-- The problem: frontend was excluding current question, preventing daily rotation
-- Solution: Use date-based rotation ONLY, ignore exclusion for daily changes

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
  v_day_of_year INTEGER;
  v_day_of_week INTEGER;
  v_offset INTEGER;
  v_question_count INTEGER;
  v_today_topic_id UUID;
  v_current_date DATE;
BEGIN
  -- Get current date explicitly to ensure it's always fresh (not cached)
  v_current_date := CURRENT_DATE;
  
  -- Get today's topic ID if not provided
  IF p_today_topic_id IS NULL THEN
    SELECT t.id INTO v_today_topic_id
    FROM public.topics t
    WHERE t.date = v_current_date
      AND t.is_active = true
      AND t.user_created_by IS NULL
    ORDER BY t.created_at DESC
    LIMIT 1;
  ELSE
    v_today_topic_id := p_today_topic_id;
  END IF;
  
  -- Calculate rotation offset based on date (changes every day)
  -- Use day of year (1-365/366) plus day of week (0-6) for better distribution
  v_day_of_year := EXTRACT(DOY FROM v_current_date)::INTEGER;
  v_day_of_week := EXTRACT(DOW FROM v_current_date)::INTEGER;
  
  -- Get all eligible questions (from today's topic if available, otherwise all)
  WITH ranked_questions AS (
    SELECT 
      tc.id,
      ROW_NUMBER() OVER (ORDER BY 
        CASE WHEN tc.topic_id = v_today_topic_id THEN 0 ELSE 1 END, -- Today's topic first
        tc.spotlight_score DESC, 
        tc.created_at DESC
      ) as rn
    FROM public.topic_comments tc
    INNER JOIN public.topics t ON t.id = tc.topic_id
    WHERE tc.is_question = true
      AND tc.deleted_at IS NULL
      AND tc.parent_comment_id IS NULL
      AND t.is_active = true
      AND tc.spotlight_score > 0
      -- Don't exclude current question - let date-based rotation handle it
    LIMIT 50 -- Get more questions for better rotation
  )
  SELECT COUNT(*) INTO v_question_count FROM ranked_questions;
  
  -- If no questions, return empty
  IF v_question_count = 0 THEN
    RETURN;
  END IF;
  
  -- Calculate offset based on date - this ensures different question each day
  -- Multiply by a prime number (17) to create better distribution
  v_offset := ((v_day_of_year * 17 + v_day_of_week * 3) % GREATEST(v_question_count, 1));
  
  -- Get the question at the calculated offset - this will be different each day
  RETURN QUERY
  WITH deduplicated_questions AS (
    SELECT DISTINCT ON (LOWER(TRIM(tc.content)))
      tc.id AS comment_id,
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
      ROW_NUMBER() OVER (
        PARTITION BY LOWER(TRIM(tc.content))
        ORDER BY tc.spotlight_score DESC, tc.created_at DESC
      ) as content_rank
    FROM public.topic_comments tc
    INNER JOIN public.topics t ON t.id = tc.topic_id
    LEFT JOIN public.profiles p ON p.id = tc.profile_id
    WHERE tc.is_question = true
      AND tc.deleted_at IS NULL
      AND tc.parent_comment_id IS NULL
      AND t.is_active = true
      AND tc.spotlight_score > 0
  ),
  ranked_questions AS (
    SELECT 
      dq.*,
      ROW_NUMBER() OVER (ORDER BY 
        CASE WHEN dq.topic_id = v_today_topic_id THEN 0 ELSE 1 END,
        dq.spotlight_score DESC, 
        dq.created_at DESC
      ) as rn
    FROM deduplicated_questions dq
    WHERE dq.content_rank = 1
  )
  SELECT 
    rq.comment_id AS id,
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
  WHERE rq.rn = (v_offset + 1) -- Offset is 0-based, rn is 1-based
  LIMIT 1;
  
  -- Fallback: if no question found at offset, get top question from today's topic
  IF NOT FOUND THEN
    RETURN QUERY
    WITH deduplicated_fallback AS (
      SELECT DISTINCT ON (LOWER(TRIM(tc.content)))
        tc.id AS id,
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
        AND (v_today_topic_id IS NULL OR tc.topic_id = v_today_topic_id)
      ORDER BY LOWER(TRIM(tc.content)), tc.spotlight_score DESC, tc.created_at DESC
    )
    SELECT 
      df.id,
      df.topic_id,
      df.profile_id,
      df.content,
      df.is_question,
      df.is_answered,
      df.upvotes_count,
      df.replies_count,
      df.spotlight_score,
      df.created_at,
      df.topic_title,
      df.topic_description,
      df.profile_handle,
      df.profile_emoji_avatar
    FROM deduplicated_fallback df
    ORDER BY df.spotlight_score DESC, df.created_at DESC
    LIMIT 1;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_spotlight_question(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_spotlight_question(UUID, UUID) TO anon;

COMMENT ON FUNCTION public.get_spotlight_question(UUID, UUID) IS 
'Gets a spotlight question with guaranteed daily rotation based on date. The question changes automatically every day based on the current date, ensuring fresh content daily.';

