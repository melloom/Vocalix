-- Enhance Topics System
-- Add user-created topics, community topics, trending, and notes/memos

-- Step 1: Remove UNIQUE constraint on date (allow multiple topics per day)
ALTER TABLE public.topics DROP CONSTRAINT IF EXISTS topics_date_key;

-- Step 2: Add new columns to topics table
ALTER TABLE public.topics
  ADD COLUMN IF NOT EXISTS user_created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS community_id UUID REFERENCES public.communities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS clips_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trending_score NUMERIC DEFAULT 0;

-- Step 3: Create index for trending queries
CREATE INDEX IF NOT EXISTS idx_topics_trending_score ON public.topics(trending_score DESC) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_topics_community_id ON public.topics(community_id) WHERE community_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_topics_user_created_by ON public.topics(user_created_by) WHERE user_created_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_topics_date_active ON public.topics(date DESC, is_active) WHERE is_active = true;

-- Step 4: Create topic_notes table for notes/memos
CREATE TABLE IF NOT EXISTS public.topic_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  content TEXT NOT NULL CHECK (char_length(content) > 0 AND char_length(content) <= 2000),
  is_pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS for topic_notes
ALTER TABLE public.topic_notes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for topic_notes (drop if exists first)
DROP POLICY IF EXISTS "Topic notes are viewable by everyone" ON public.topic_notes;
DROP POLICY IF EXISTS "Users can insert their own notes" ON public.topic_notes;
DROP POLICY IF EXISTS "Users can update their own notes" ON public.topic_notes;
DROP POLICY IF EXISTS "Users can delete their own notes" ON public.topic_notes;

CREATE POLICY "Topic notes are viewable by everyone"
ON public.topic_notes FOR SELECT
USING (true);

CREATE POLICY "Users can insert their own notes"
ON public.topic_notes FOR INSERT
WITH CHECK (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

CREATE POLICY "Users can update their own notes"
ON public.topic_notes FOR UPDATE
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

CREATE POLICY "Users can delete their own notes"
ON public.topic_notes FOR DELETE
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Indexes for topic_notes
CREATE INDEX IF NOT EXISTS idx_topic_notes_topic_id ON public.topic_notes(topic_id);
CREATE INDEX IF NOT EXISTS idx_topic_notes_profile_id ON public.topic_notes(profile_id);
CREATE INDEX IF NOT EXISTS idx_topic_notes_created_at ON public.topic_notes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_topic_notes_pinned ON public.topic_notes(topic_id, is_pinned DESC, created_at DESC) WHERE is_pinned = true;

-- Step 5: Update RLS policies for topics to allow user creation
DROP POLICY IF EXISTS "Users can create topics" ON public.topics;
CREATE POLICY "Users can create topics"
ON public.topics FOR INSERT
WITH CHECK (
  user_created_by IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
  OR user_created_by IS NULL -- Allow system-generated topics
);

DROP POLICY IF EXISTS "Users can update their own topics" ON public.topics;
CREATE POLICY "Users can update their own topics"
ON public.topics FOR UPDATE
USING (
  user_created_by IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
  OR user_created_by IS NULL -- System topics can be updated by anyone (for now)
);

-- Step 6: Function to calculate trending score
CREATE OR REPLACE FUNCTION public.calculate_topic_trending_score(p_topic_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  v_score NUMERIC := 0;
  v_clips_count INT := 0;
  v_total_listens INT := 0;
  v_total_reactions INT := 0;
  v_recent_clips INT := 0;
  v_hours_since_creation NUMERIC;
BEGIN
  -- Get clips count and engagement
  SELECT 
    COUNT(*)::INT,
    COALESCE(SUM(listens_count), 0)::INT,
    COALESCE(SUM(
      (reactions->>'👍')::INT +
      (reactions->>'❤️')::INT +
      (reactions->>'🔥')::INT +
      (reactions->>'😄')::INT +
      (reactions->>'💯')::INT
    ), 0)::INT,
    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::INT
  INTO v_clips_count, v_total_listens, v_total_reactions, v_recent_clips
  FROM public.clips
  WHERE topic_id = p_topic_id
    AND status = 'live';

  -- Calculate hours since topic creation
  SELECT EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600
  INTO v_hours_since_creation
  FROM public.topics
  WHERE id = p_topic_id;

  -- Trending score formula:
  -- Base: clips count * 10
  -- Engagement: listens * 0.1 + reactions * 1
  -- Recency bonus: recent clips (last 24h) * 20
  -- Time decay: divide by (hours + 1) to favor newer topics
  v_score := (
    (v_clips_count * 10) +
    (v_total_listens * 0.1) +
    (v_total_reactions * 1) +
    (v_recent_clips * 20)
  ) / GREATEST(v_hours_since_creation + 1, 1);

  RETURN v_score;
END;
$$ LANGUAGE plpgsql STABLE;

-- Step 7: Function to update topic clips count
CREATE OR REPLACE FUNCTION public.update_topic_clips_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.topic_id IS NOT NULL THEN
    UPDATE public.topics
    SET clips_count = clips_count + 1,
        trending_score = public.calculate_topic_trending_score(NEW.topic_id)
    WHERE id = NEW.topic_id;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.topic_id IS DISTINCT FROM NEW.topic_id THEN
      -- Decrement old topic
      IF OLD.topic_id IS NOT NULL THEN
        UPDATE public.topics
        SET clips_count = GREATEST(0, clips_count - 1),
            trending_score = public.calculate_topic_trending_score(OLD.topic_id)
        WHERE id = OLD.topic_id;
      END IF;
      -- Increment new topic
      IF NEW.topic_id IS NOT NULL THEN
        UPDATE public.topics
        SET clips_count = clips_count + 1,
            trending_score = public.calculate_topic_trending_score(NEW.topic_id)
        WHERE id = NEW.topic_id;
      END IF;
    ELSIF OLD.status IS DISTINCT FROM NEW.status OR 
          OLD.listens_count IS DISTINCT FROM NEW.listens_count OR
          OLD.reactions IS DISTINCT FROM NEW.reactions THEN
      -- Update trending score if engagement changed
      IF NEW.topic_id IS NOT NULL THEN
        UPDATE public.topics
        SET trending_score = public.calculate_topic_trending_score(NEW.topic_id)
        WHERE id = NEW.topic_id;
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' AND OLD.topic_id IS NOT NULL THEN
    UPDATE public.topics
    SET clips_count = GREATEST(0, clips_count - 1),
        trending_score = public.calculate_topic_trending_score(OLD.topic_id)
    WHERE id = OLD.topic_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Step 8: Trigger to update topic clips count and trending score
DROP TRIGGER IF EXISTS update_topic_clips_count_trigger ON public.clips;
CREATE TRIGGER update_topic_clips_count_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.clips
FOR EACH ROW EXECUTE FUNCTION public.update_topic_clips_count();

-- Step 9: Function to get trending topics
CREATE OR REPLACE FUNCTION public.get_trending_topics(p_limit INT DEFAULT 10)
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
  communities JSONB,
  profiles JSONB
) AS $$
BEGIN
  RETURN QUERY
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
  LEFT JOIN public.communities c ON t.community_id = c.id
  LEFT JOIN public.profiles p ON t.user_created_by = p.id
  WHERE t.is_active = true
    AND t.trending_score > 0
  ORDER BY t.trending_score DESC, t.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- Step 10: Initialize trending scores for existing topics
UPDATE public.topics
SET trending_score = public.calculate_topic_trending_score(id)
WHERE is_active = true;

-- Step 11: Trigger for updated_at on topic_notes
DROP TRIGGER IF EXISTS set_updated_at_topic_notes ON public.topic_notes;
CREATE TRIGGER set_updated_at_topic_notes
BEFORE UPDATE ON public.topic_notes
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

