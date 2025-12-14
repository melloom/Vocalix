-- Remove "What brightened your day?" from spotlight questions
-- This migration updates any existing questions with the old text and ensures
-- the fallback function uses the new question

-- Step 1: Update any existing "What brightened your day?" questions in daily_spotlight_questions
UPDATE public.daily_spotlight_questions
SET question = 'What''s a small victory you''re celebrating?',
    updated_at = NOW()
WHERE LOWER(TRIM(question)) = LOWER(TRIM('What brightened your day?'));

-- Step 2: Update the fallback function to use the new question (if not already updated)
CREATE OR REPLACE FUNCTION public.trigger_daily_spotlight_question_fallback()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_exists BOOLEAN;
  v_fallback_question TEXT := 'What''s a small victory you''re celebrating?';
BEGIN
  -- Check if question for today already exists
  SELECT EXISTS(
    SELECT 1 FROM public.daily_spotlight_questions
    WHERE date = v_today
  ) INTO v_exists;

  IF v_exists THEN
    RAISE NOTICE 'Question for today already exists, skipping generation';
    RETURN;
  END IF;

  -- Insert fallback question if none exists
  INSERT INTO public.daily_spotlight_questions (
    date,
    question,
    generated_by
  ) VALUES (
    v_today,
    v_fallback_question,
    'fallback'
  )
  ON CONFLICT (date) DO NOTHING;

  RAISE NOTICE 'Created fallback spotlight question for %', v_today;
END;
$$;

-- Step 3: Also check and update any topic_comments that might have this question
-- (though these shouldn't be in the spotlight, but just in case)
-- We'll just log a notice about these, not update them automatically
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.topic_comments
  WHERE is_question = true
    AND deleted_at IS NULL
    AND LOWER(TRIM(content)) = LOWER(TRIM('What brightened your day?'));
  
  IF v_count > 0 THEN
    RAISE NOTICE 'Found % topic_comments with "What brightened your day?" - these are user-created questions and will not be automatically updated', v_count;
  END IF;
END $$;

COMMENT ON FUNCTION public.trigger_daily_spotlight_question_fallback() IS 
'Fallback function that creates a default spotlight question if the edge function fails. Uses "What''s a small victory you''re celebrating?" as the fallback question.';

