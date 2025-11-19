-- Cleanup duplicate daily topics
-- This migration removes duplicate system-generated topics with the same title
-- Keeps only the most recent one (by date)

-- Find and delete duplicate system topics with the same title "What brightened your day?"
-- Keep only the one with the latest date
DELETE FROM public.topics
WHERE id IN (
  SELECT id
  FROM (
    SELECT 
      id,
      ROW_NUMBER() OVER (
        PARTITION BY title, user_created_by 
        ORDER BY date DESC, created_at DESC
      ) as rn
    FROM public.topics
    WHERE is_active = true 
      AND user_created_by IS NULL  -- Only system-generated topics
      AND title = 'What brightened your day?'
  ) duplicate_topics
  WHERE rn > 1  -- Keep only the first (most recent), delete the rest
);

-- Also check for any other potential duplicate system topics with same title on different dates
-- This is a broader cleanup for any other duplicates that might exist
DELETE FROM public.topics
WHERE id IN (
  SELECT id
  FROM (
    SELECT 
      id,
      ROW_NUMBER() OVER (
        PARTITION BY title 
        ORDER BY date DESC, created_at DESC
      ) as rn
    FROM public.topics
    WHERE is_active = true 
      AND user_created_by IS NULL  -- Only system-generated topics
      AND date < CURRENT_DATE  -- Only old topics, not today's
  ) duplicate_system_topics
  WHERE rn > 1  -- Keep only the first (most recent), delete the rest
);

