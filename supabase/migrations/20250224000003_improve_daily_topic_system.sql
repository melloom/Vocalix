-- Improve Daily Topic System
-- Better deduplication and variety enforcement

-- 1. Improve the upsert function to check for title similarity (not just exact match)
CREATE OR REPLACE FUNCTION public.upsert_system_topic(
  p_title TEXT,
  p_description TEXT,
  p_date DATE,
  p_is_active BOOLEAN DEFAULT true
)
RETURNS UUID AS $$
DECLARE
  v_topic_id UUID;
  v_similar_count INT;
BEGIN
  -- First, check if a system topic already exists for this date
  SELECT id INTO v_topic_id
  FROM public.topics
  WHERE date = p_date
    AND is_active = true
    AND user_created_by IS NULL
  LIMIT 1;
  
  IF v_topic_id IS NOT NULL THEN
    -- Update existing topic
    UPDATE public.topics
    SET title = p_title,
        description = p_description,
        is_active = p_is_active,
        updated_at = NOW()
    WHERE id = v_topic_id;
    
    RETURN v_topic_id;
  ELSE
    -- Check for similar titles in recent topics (last 30 days) to warn about duplicates
    SELECT COUNT(*) INTO v_similar_count
    FROM public.topics
    WHERE is_active = true
      AND user_created_by IS NULL
      AND date >= p_date - INTERVAL '30 days'
      AND LOWER(TRIM(title)) = LOWER(TRIM(p_title));
    
    IF v_similar_count > 0 THEN
      RAISE WARNING 'Similar topic title found in recent topics: "%"', p_title;
      -- Still allow it, but log a warning
    END IF;
    
    -- Try to insert new topic
    BEGIN
      INSERT INTO public.topics (
        title,
        description,
        date,
        is_active,
        user_created_by,
        created_at,
        updated_at
      ) VALUES (
        p_title,
        p_description,
        p_date,
        p_is_active,
        NULL, -- System topic
        NOW(),
        NOW()
      )
      RETURNING id INTO v_topic_id;
      
      RETURN v_topic_id;
    EXCEPTION
      WHEN unique_violation THEN
        -- Race condition: another request created it, so fetch and update it
        SELECT id INTO v_topic_id
        FROM public.topics
        WHERE date = p_date
          AND is_active = true
          AND user_created_by IS NULL
        LIMIT 1;
        
        IF v_topic_id IS NOT NULL THEN
          -- Update the topic that was just created by another request
          UPDATE public.topics
          SET title = p_title,
              description = p_description,
              updated_at = NOW()
          WHERE id = v_topic_id;
          
          RETURN v_topic_id;
        ELSE
          -- Should not happen, but raise if it does
          RAISE;
        END IF;
    END;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.upsert_system_topic(TEXT, TEXT, DATE, BOOLEAN) TO service_role;

-- Update comment
COMMENT ON FUNCTION public.upsert_system_topic IS 
'Safely upserts a system topic for a given date. Prevents duplicates through database constraints, handles race conditions, and warns about similar titles in recent topics.';

-- 2. Create a function to check if today's topic exists (useful for monitoring)
CREATE OR REPLACE FUNCTION public.check_today_topic()
RETURNS TABLE (
  "exists" BOOLEAN,
  topic_id UUID,
  topic_title TEXT,
  topic_date DATE,
  created_at TIMESTAMPTZ
) AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
BEGIN
  RETURN QUERY
  SELECT 
    TRUE as "exists",
    t.id as topic_id,
    t.title as topic_title,
    t.date as topic_date,
    t.created_at
  FROM public.topics t
  WHERE t.date = v_today
    AND t.is_active = true
    AND t.user_created_by IS NULL
  LIMIT 1;
  
  -- If no topic found, return false
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, NULL::DATE, NULL::TIMESTAMPTZ;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.check_today_topic() TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.check_today_topic() IS 
'Checks if a system topic exists for today. Useful for monitoring and health checks.';

-- 3. Create a view for monitoring daily topic generation
CREATE OR REPLACE VIEW public.daily_topic_status AS
SELECT 
  CURRENT_DATE as check_date,
  EXISTS (
    SELECT 1 
    FROM public.topics 
    WHERE date = CURRENT_DATE 
      AND is_active = true 
      AND user_created_by IS NULL
  ) as topic_exists,
  (
    SELECT title 
    FROM public.topics 
    WHERE date = CURRENT_DATE 
      AND is_active = true 
      AND user_created_by IS NULL
    LIMIT 1
  ) as today_topic_title,
  (
    SELECT COUNT(*) 
    FROM public.topics 
    WHERE date >= CURRENT_DATE - INTERVAL '7 days'
      AND is_active = true 
      AND user_created_by IS NULL
  ) as topics_last_7_days,
  (
    SELECT COUNT(*) 
    FROM public.topics 
    WHERE date >= CURRENT_DATE - INTERVAL '30 days'
      AND is_active = true 
      AND user_created_by IS NULL
  ) as topics_last_30_days;

GRANT SELECT ON public.daily_topic_status TO authenticated, anon, service_role;

COMMENT ON VIEW public.daily_topic_status IS 
'Monitoring view for daily topic generation status. Shows if today''s topic exists and statistics about recent topics.';


