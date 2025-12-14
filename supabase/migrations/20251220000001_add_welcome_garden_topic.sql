-- Create a permanent "Welcome Garden" topic for soft introductions
-- This respects the prevent_duplicate_system_topic() constraint by choosing
-- a date that does not already have a system topic.

DO $$
DECLARE
  v_date DATE := CURRENT_DATE;
  v_days_back INTEGER := 0;
  v_max_days_back INTEGER := 365;
  v_existing_id UUID;
BEGIN
  -- If a Welcome Garden system topic already exists, do nothing
  SELECT id INTO v_existing_id
  FROM public.topics
  WHERE title = 'Welcome Garden'
    AND user_created_by IS NULL
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN;
  END IF;

  -- Find a date within the last year that does NOT already have a system topic
  WHILE v_days_back < v_max_days_back LOOP
    v_date := CURRENT_DATE - (v_days_back || ' days')::INTERVAL;

    IF NOT EXISTS (
      SELECT 1
      FROM public.topics t
      WHERE t.date = v_date
        AND t.is_active = true
        AND t.user_created_by IS NULL
    ) THEN
      INSERT INTO public.topics (title, description, date, is_active, user_created_by)
      VALUES (
        'Welcome Garden',
        'Introduce yourself with a short voice clip – pseudonyms and emojis welcome.',
        v_date,
        true,
        NULL
      );
      RETURN;
    END IF;

    v_days_back := v_days_back + 1;
  END LOOP;

  -- If we somehow didn't find a free date, skip creating the topic
END $$;

