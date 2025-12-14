-- Prevent Duplicate Daily Topics System
-- This migration creates multiple layers of protection to prevent duplicate system topics

-- 1. Ensure the unique constraint exists (if it doesn't already)
CREATE UNIQUE INDEX IF NOT EXISTS idx_topics_date_system_unique 
ON public.topics(date) 
WHERE is_active = true AND user_created_by IS NULL;

-- 2. Create a function to check and prevent duplicate system topics before insert
CREATE OR REPLACE FUNCTION public.prevent_duplicate_system_topic()
RETURNS TRIGGER AS $$
BEGIN
  -- Only check for system topics (user_created_by IS NULL)
  IF NEW.user_created_by IS NULL AND NEW.is_active = true THEN
    -- Check if a system topic already exists for this date
    IF EXISTS (
      SELECT 1 
      FROM public.topics 
      WHERE date = NEW.date 
        AND is_active = true 
        AND user_created_by IS NULL
        AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    ) THEN
      RAISE EXCEPTION 'A system-generated topic already exists for date %', NEW.date
        USING ERRCODE = '23505'; -- unique_violation
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Create trigger BEFORE INSERT to prevent duplicates
DROP TRIGGER IF EXISTS prevent_duplicate_system_topic_insert ON public.topics;
CREATE TRIGGER prevent_duplicate_system_topic_insert
  BEFORE INSERT ON public.topics
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_duplicate_system_topic();

-- 4. Create trigger BEFORE UPDATE to prevent duplicates on updates
DROP TRIGGER IF EXISTS prevent_duplicate_system_topic_update ON public.topics;
CREATE TRIGGER prevent_duplicate_system_topic_update
  BEFORE UPDATE ON public.topics
  FOR EACH ROW
  WHEN (OLD.user_created_by IS NULL AND NEW.user_created_by IS NULL)
  EXECUTE FUNCTION public.prevent_duplicate_system_topic();

-- 5. Create a function to safely upsert a system topic (for use by Edge Functions)
-- This handles race conditions by checking first, then using INSERT with exception handling
CREATE OR REPLACE FUNCTION public.upsert_system_topic(
  p_title TEXT,
  p_description TEXT,
  p_date DATE,
  p_is_active BOOLEAN DEFAULT true
)
RETURNS UUID AS $$
DECLARE
  v_topic_id UUID;
BEGIN
  -- First, try to find existing system topic for this date
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

-- Grant execute permission to service role (for Edge Functions)
GRANT EXECUTE ON FUNCTION public.upsert_system_topic(TEXT, TEXT, DATE, BOOLEAN) TO service_role;

-- Add comment
COMMENT ON FUNCTION public.upsert_system_topic IS 
'Safely upserts a system topic for a given date. Prevents duplicates through database constraints and handles race conditions.';

