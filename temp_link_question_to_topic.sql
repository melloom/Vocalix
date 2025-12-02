-- Link today's spotlight question to today's topic

UPDATE public.daily_spotlight_questions dsq
SET 
  topic_id = t.id,
  topic_title = t.title,
  topic_description = t.description,
  updated_at = NOW()
FROM public.topics t
WHERE dsq.date = CURRENT_DATE
  AND t.date = CURRENT_DATE
  AND t.is_active = true
  AND t.user_created_by IS NULL
  AND (dsq.topic_id IS NULL OR dsq.topic_id != t.id)
ORDER BY t.created_at DESC
LIMIT 1;

-- Show the updated question
SELECT 
  id,
  date,
  question,
  topic_title,
  topic_id,
  generated_by
FROM public.daily_spotlight_questions
WHERE date = CURRENT_DATE;

