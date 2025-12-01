-- Generate daily spotlight questions for missing dates
-- This ensures all dates from the past week have questions

DO $$
DECLARE
  v_date DATE;
  v_today DATE := CURRENT_DATE;
  v_seven_days_ago DATE := CURRENT_DATE - INTERVAL '7 days';
  v_question_exists BOOLEAN;
  v_topic_id UUID;
  v_topic_title TEXT;
  v_topic_description TEXT;
  v_fallback_questions TEXT[] := ARRAY[
    'What brightened your day?',
    'What''s a small victory you''re celebrating?',
    'What''s something you''re grateful for?',
    'What made you smile today?',
    'What''s a moment of peace you experienced?',
    'What''s a little act of kindness you noticed?',
    'What''s a hopeful thought you had?',
    'What are you grateful for?',
    'Your calm corner - where do you find peace?',
    'What''s something that helped you recharge?',
    'What''s a lesson you''ve learned recently?',
    'What''s something that gives you hope?',
    'What''s a moment of connection you experienced?',
    'What''s something you''re curious about right now?'
  ];
  v_selected_question TEXT;
  v_day_offset INTEGER;
BEGIN
  -- Loop through each date from 7 days ago to today
  v_date := v_seven_days_ago;
  
  WHILE v_date <= v_today LOOP
    -- Check if question exists for this date
    SELECT EXISTS(
      SELECT 1 
      FROM public.daily_spotlight_questions 
      WHERE date = v_date
    ) INTO v_question_exists;
    
    -- If no question exists, create one
    IF NOT v_question_exists THEN
      -- Try to get the topic for this date
      SELECT id, title, description INTO v_topic_id, v_topic_title, v_topic_description
      FROM public.topics
      WHERE date = v_date
        AND is_active = true
        AND user_created_by IS NULL
      ORDER BY created_at DESC
      LIMIT 1;
      
      -- Select a fallback question based on day offset (for variety)
      v_day_offset := EXTRACT(DOY FROM v_date)::INTEGER;
      v_selected_question := v_fallback_questions[1 + (v_day_offset % array_length(v_fallback_questions, 1))];
      
      -- Insert the question
      INSERT INTO public.daily_spotlight_questions (
        date,
        question,
        topic_id,
        topic_title,
        topic_description,
        generated_by,
        created_at,
        updated_at
      ) VALUES (
        v_date,
        v_selected_question,
        v_topic_id,
        v_topic_title,
        v_topic_description,
        'migration',
        NOW(),
        NOW()
      )
      ON CONFLICT (date) DO NOTHING; -- Skip if somehow created between check and insert
      
      RAISE NOTICE 'Created daily spotlight question for %: %', v_date, v_selected_question;
    END IF;
    
    -- Move to next day
    v_date := v_date + INTERVAL '1 day';
  END LOOP;
END $$;

COMMENT ON FUNCTION public.get_spotlight_question(UUID, UUID) IS 
'Gets today''s spotlight question, prioritizing daily_spotlight_questions (AI-generated daily questions). Falls back to topic_comments if no daily question exists. The daily-spotlight-question edge function generates questions in daily_spotlight_questions table. Ensures only one question per date is returned.';

