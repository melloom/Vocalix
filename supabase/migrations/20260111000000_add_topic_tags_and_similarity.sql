-- Add Tags and Similarity Algorithm for Topics
-- This migration adds tags support to topics and creates a function to find similar topics

-- Step 1: Add tags column to topics table
ALTER TABLE public.topics
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Step 2: Create index for tag searches
CREATE INDEX IF NOT EXISTS idx_topics_tags ON public.topics USING GIN(tags) WHERE tags IS NOT NULL AND array_length(tags, 1) > 0;

-- Step 3: Create function to get aggregated tags from clips in a topic
CREATE OR REPLACE FUNCTION public.get_topic_tags(p_topic_id UUID)
RETURNS TEXT[] AS $$
DECLARE
  v_tags TEXT[];
BEGIN
  SELECT ARRAY_AGG(DISTINCT tag)
  INTO v_tags
  FROM (
    SELECT unnest(tags) AS tag
    FROM public.clips
    WHERE topic_id = p_topic_id
      AND status = 'live'
      AND tags IS NOT NULL
      AND array_length(tags, 1) > 0
  ) tag_list;
  
  RETURN COALESCE(v_tags, ARRAY[]::TEXT[]);
END;
$$ LANGUAGE plpgsql STABLE;

-- Step 4: Create function to calculate text similarity between two strings
-- Uses word overlap and trigram similarity
CREATE OR REPLACE FUNCTION public.calculate_text_similarity(text1 TEXT, text2 TEXT)
RETURNS NUMERIC AS $$
DECLARE
  v_similarity NUMERIC := 0;
  v_words1 TEXT[];
  v_words2 TEXT[];
  v_common_words INT := 0;
  v_total_words INT := 0;
BEGIN
  -- Handle NULL cases
  IF text1 IS NULL OR text2 IS NULL THEN
    RETURN 0;
  END IF;
  
  -- Convert to lowercase and split into words
  v_words1 := string_to_array(lower(regexp_replace(text1, '[^a-zA-Z0-9\s]', '', 'g')), ' ');
  v_words2 := string_to_array(lower(regexp_replace(text2, '[^a-zA-Z0-9\s]', '', 'g')), ' ');
  
  -- Remove empty strings
  v_words1 := array_remove(v_words1, '');
  v_words2 := array_remove(v_words2, '');
  
  -- Calculate word overlap (Jaccard similarity)
  SELECT COUNT(*)
  INTO v_common_words
  FROM (
    SELECT DISTINCT word
    FROM unnest(v_words1) AS word
    INTERSECT
    SELECT DISTINCT word
    FROM unnest(v_words2) AS word
  ) common;
  
  v_total_words := array_length(v_words1, 1) + array_length(v_words2, 1) - v_common_words;
  
  IF v_total_words > 0 THEN
    v_similarity := (v_common_words::NUMERIC / v_total_words::NUMERIC) * 100;
  END IF;
  
  -- Add trigram similarity if pg_trgm extension is available
  BEGIN
    v_similarity := v_similarity * 0.7 + (similarity(text1, text2) * 100) * 0.3;
  EXCEPTION WHEN OTHERS THEN
    -- pg_trgm not available, use word overlap only
    NULL;
  END;
  
  RETURN v_similarity;
END;
$$ LANGUAGE plpgsql STABLE;

-- Step 5: Create main function to find similar topics
CREATE OR REPLACE FUNCTION public.get_similar_topics(
  p_topic_id UUID,
  p_limit INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  date DATE,
  is_active BOOLEAN,
  user_created_by UUID,
  community_id UUID,
  clips_count INT,
  trending_score NUMERIC,
  created_at TIMESTAMPTZ,
  similarity_score NUMERIC,
  communities JSONB,
  profiles JSONB
) AS $$
DECLARE
  v_current_topic RECORD;
  v_current_tags TEXT[];
  v_other_topic RECORD;
  v_score NUMERIC;
  v_title_sim NUMERIC;
  v_desc_sim NUMERIC;
  v_tag_overlap NUMERIC;
  v_community_match NUMERIC;
  v_clip_count_sim NUMERIC;
BEGIN
  -- Get current topic details
  SELECT 
    t.*,
    COALESCE(t.tags, public.get_topic_tags(t.id)) as computed_tags
  INTO v_current_topic
  FROM public.topics t
  WHERE t.id = p_topic_id
    AND t.is_active = true;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  v_current_tags := COALESCE(v_current_topic.computed_tags, ARRAY[]::TEXT[]);
  
  -- Return similar topics with calculated similarity scores
  RETURN QUERY
  WITH topic_tags AS (
    -- Pre-compute tags for all topics to avoid multiple function calls
    SELECT 
      t.id as topic_id,
      COALESCE(t.tags, public.get_topic_tags(t.id)) as computed_tags
    FROM public.topics t
    WHERE t.id != p_topic_id AND t.is_active = true
  ),
  scored_topics AS (
    SELECT 
      t.id,
      t.title,
      t.description,
      t.date,
      t.is_active,
      t.user_created_by,
      t.community_id,
      t.clips_count,
      t.trending_score,
      t.created_at,
      tt.computed_tags,
      -- Calculate similarity score
      (
        -- Title similarity (30% weight)
        (public.calculate_text_similarity(v_current_topic.title, t.title) * 0.3) +
        -- Description similarity (20% weight)
        (COALESCE(public.calculate_text_similarity(v_current_topic.description, t.description), 0) * 0.2) +
        -- Tag overlap (25% weight)
        (
          CASE 
            WHEN array_length(tt.computed_tags, 1) > 0 
                 AND array_length(v_current_tags, 1) > 0 THEN
              (
                SELECT COUNT(*)::NUMERIC / GREATEST(
                  array_length(tt.computed_tags, 1),
                  array_length(v_current_tags, 1),
                  1
                ) * 100
                FROM unnest(tt.computed_tags) tag
                WHERE tag = ANY(v_current_tags)
              ) * 0.25
            ELSE 0
          END
        ) +
        -- Community match (10% weight)
        (
          CASE 
            WHEN v_current_topic.community_id IS NOT NULL 
                 AND t.community_id = v_current_topic.community_id THEN 100 * 0.1
            ELSE 0
          END
        ) +
        -- Clip count similarity (10% weight) - topics with similar engagement
        (
          CASE 
            WHEN v_current_topic.clips_count > 0 AND t.clips_count > 0 THEN
              (1 - ABS(v_current_topic.clips_count - t.clips_count)::NUMERIC / 
               GREATEST(v_current_topic.clips_count, t.clips_count, 1)) * 100 * 0.1
            WHEN v_current_topic.clips_count = 0 AND t.clips_count = 0 THEN 100 * 0.1
            ELSE 0
          END
        ) +
        -- Recency bonus (5% weight) - favor recent topics
        (
          CASE 
            WHEN t.created_at > NOW() - INTERVAL '7 days' THEN 100 * 0.05
            WHEN t.created_at > NOW() - INTERVAL '30 days' THEN 50 * 0.05
            ELSE 0
          END
        )
      ) as similarity_score,
      CASE 
        WHEN t.community_id IS NOT NULL THEN
          jsonb_build_object(
            'id', c.id,
            'name', c.name,
            'slug', c.slug,
            'avatar_emoji', c.avatar_emoji
          )
        ELSE NULL
      END as communities,
      CASE 
        WHEN t.user_created_by IS NOT NULL THEN
          jsonb_build_object(
            'id', p.id,
            'handle', p.handle,
            'emoji_avatar', p.emoji_avatar
          )
        ELSE NULL
      END as profiles
    FROM public.topics t
    INNER JOIN topic_tags tt ON t.id = tt.topic_id
    LEFT JOIN public.communities c ON t.community_id = c.id
    LEFT JOIN public.profiles p ON t.user_created_by = p.id
  )
  SELECT 
    st.id,
    st.title,
    st.description,
    st.date,
    st.is_active,
    st.user_created_by,
    st.community_id,
    st.clips_count,
    st.trending_score,
    st.created_at,
    st.similarity_score,
    st.communities,
    st.profiles
  FROM scored_topics st
  WHERE st.similarity_score > 0  -- Only return topics with some similarity
  ORDER BY st.similarity_score DESC, st.trending_score DESC, st.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- Step 6: Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_topic_tags(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_text_similarity(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_similar_topics(UUID, INT) TO anon, authenticated;

-- Step 7: Create a trigger to auto-update topic tags from clips (optional, can be done manually)
-- This function can be called periodically or on clip creation
CREATE OR REPLACE FUNCTION public.update_topic_tags_from_clips(p_topic_id UUID)
RETURNS void AS $$
DECLARE
  v_tags TEXT[];
BEGIN
  -- Get all unique tags from clips in this topic
  SELECT ARRAY_AGG(DISTINCT tag)
  INTO v_tags
  FROM (
    SELECT unnest(tags) AS tag
    FROM public.clips
    WHERE topic_id = p_topic_id
      AND status = 'live'
      AND tags IS NOT NULL
      AND array_length(tags, 1) > 0
  ) tag_list;
  
  -- Update topic tags if we found any
  IF v_tags IS NOT NULL AND array_length(v_tags, 1) > 0 THEN
    UPDATE public.topics
    SET tags = v_tags
    WHERE id = p_topic_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.update_topic_tags_from_clips(UUID) TO authenticated;

-- Step 8: Add comment documentation
COMMENT ON FUNCTION public.get_similar_topics IS 'Finds topics similar to a given topic based on title, description, tags, community, and engagement patterns';
COMMENT ON FUNCTION public.get_topic_tags IS 'Returns aggregated tags from all clips in a topic';
COMMENT ON FUNCTION public.calculate_text_similarity IS 'Calculates text similarity between two strings using word overlap and trigram similarity';
COMMENT ON COLUMN public.topics.tags IS 'Tags associated with this topic, can be manually set or auto-populated from clips';

