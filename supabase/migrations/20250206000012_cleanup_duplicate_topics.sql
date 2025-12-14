-- Cleanup any duplicate topics that may have slipped through
-- This migration finds and removes duplicates based on date (for system topics) and title+date

-- 1. Find and remove duplicate system topics on the same date
-- Keep only the most recent one (by created_at)
DELETE FROM public.topics
WHERE id IN (
  SELECT id
  FROM (
    SELECT 
      id,
      ROW_NUMBER() OVER (
        PARTITION BY date, user_created_by
        ORDER BY created_at DESC
      ) as rn
    FROM public.topics
    WHERE is_active = true 
      AND user_created_by IS NULL  -- Only system-generated topics
      AND date IS NOT NULL
  ) duplicate_topics
  WHERE rn > 1  -- Keep only the first (most recent), delete the rest
);

-- 2. Find and remove duplicate system topics with same title on same date
-- This catches any edge cases where same title was created on same date
DELETE FROM public.topics
WHERE id IN (
  SELECT id
  FROM (
    SELECT 
      id,
      ROW_NUMBER() OVER (
        PARTITION BY date, title, user_created_by
        ORDER BY created_at DESC
      ) as rn
    FROM public.topics
    WHERE is_active = true 
      AND user_created_by IS NULL  -- Only system-generated topics
      AND date IS NOT NULL
  ) duplicate_title_topics
  WHERE rn > 1  -- Keep only the first (most recent), delete the rest
);

-- 3. Also check for any user-created topics that might be duplicates on same date
-- (though this is less critical, as users can create topics)
DELETE FROM public.topics
WHERE id IN (
  SELECT id
  FROM (
    SELECT 
      id,
      ROW_NUMBER() OVER (
        PARTITION BY date, title, user_created_by
        ORDER BY created_at DESC
      ) as rn
    FROM public.topics
    WHERE is_active = true 
      AND user_created_by IS NOT NULL  -- User-created topics
      AND date IS NOT NULL
      AND date < CURRENT_DATE  -- Only old topics, not today's (users might create same day)
  ) duplicate_user_topics
  WHERE rn > 1  -- Keep only the first (most recent), delete the rest
);

-- 4. Verify the unique constraint exists (should already exist from previous migration)
CREATE UNIQUE INDEX IF NOT EXISTS idx_topics_date_system_unique 
ON public.topics(date) 
WHERE is_active = true AND user_created_by IS NULL;

-- Add comment
COMMENT ON INDEX idx_topics_date_system_unique IS 
'Ensures only one active system topic per date. Prevents duplicate daily topics.';

