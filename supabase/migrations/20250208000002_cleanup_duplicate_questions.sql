-- Cleanup duplicate questions with the same content
-- This removes duplicate questions, keeping only the one with highest engagement

-- Find and remove duplicate questions with the same content (case-insensitive)
-- Keep only the one with highest spotlight_score, then most recent
DELETE FROM public.topic_comments
WHERE id IN (
  SELECT id
  FROM (
    SELECT 
      id,
      content,
      spotlight_score,
      created_at,
      ROW_NUMBER() OVER (
        PARTITION BY LOWER(TRIM(content))
        ORDER BY spotlight_score DESC, created_at DESC
      ) as rn
    FROM public.topic_comments
    WHERE is_question = true
      AND deleted_at IS NULL
      AND parent_comment_id IS NULL
      AND LOWER(TRIM(content)) IN (
        -- Find content that appears more than once
        SELECT LOWER(TRIM(content))
        FROM public.topic_comments
        WHERE is_question = true
          AND deleted_at IS NULL
          AND parent_comment_id IS NULL
        GROUP BY LOWER(TRIM(content))
        HAVING COUNT(*) > 1
      )
  ) duplicate_questions
  WHERE rn > 1  -- Keep only the first (best), delete the rest
);

-- Also clean up questions that are exact duplicates of topic descriptions
-- These are likely auto-generated and not real questions
DELETE FROM public.topic_comments
WHERE is_question = true
  AND deleted_at IS NULL
  AND parent_comment_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.topics t
    WHERE t.id = topic_comments.topic_id
      AND LOWER(TRIM(topic_comments.content)) = LOWER(TRIM(COALESCE(t.description, '')))
  );

COMMENT ON FUNCTION public.get_spotlight_question(UUID, UUID) IS 
'Gets a spotlight question with daily rotation, prioritizing questions from today''s topic. Prevents duplicates by content and ensures questions are relevant to the daily topic.';

