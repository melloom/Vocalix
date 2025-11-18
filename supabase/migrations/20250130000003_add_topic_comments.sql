-- Add Comments/Questions System for Topics
-- Allows users to ask questions and have conversations on topics

-- Create topic_comments table
CREATE TABLE IF NOT EXISTS public.topic_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  parent_comment_id UUID REFERENCES public.topic_comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) > 0 AND char_length(content) <= 2000),
  is_question BOOLEAN DEFAULT false,
  is_answered BOOLEAN DEFAULT false,
  upvotes_count INT NOT NULL DEFAULT 0,
  replies_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE public.topic_comments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Topic comments are viewable by everyone" ON public.topic_comments;
DROP POLICY IF EXISTS "Users can insert their own comments" ON public.topic_comments;
DROP POLICY IF EXISTS "Users can update their own comments" ON public.topic_comments;
DROP POLICY IF EXISTS "Users can delete their own comments" ON public.topic_comments;

-- RLS Policies
CREATE POLICY "Topic comments are viewable by everyone"
ON public.topic_comments FOR SELECT
USING (deleted_at IS NULL);

CREATE POLICY "Users can insert their own comments"
ON public.topic_comments FOR INSERT
WITH CHECK (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

CREATE POLICY "Users can update their own comments"
ON public.topic_comments FOR UPDATE
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
  AND deleted_at IS NULL
);

CREATE POLICY "Users can delete their own comments"
ON public.topic_comments FOR UPDATE
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Create topic_comment_upvotes table for voting
CREATE TABLE IF NOT EXISTS public.topic_comment_upvotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES public.topic_comments(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(comment_id, profile_id)
);

-- Enable RLS for upvotes
ALTER TABLE public.topic_comment_upvotes ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Comment upvotes are viewable by everyone" ON public.topic_comment_upvotes;
DROP POLICY IF EXISTS "Users can upvote comments" ON public.topic_comment_upvotes;
DROP POLICY IF EXISTS "Users can remove their upvotes" ON public.topic_comment_upvotes;

-- RLS Policies for upvotes
CREATE POLICY "Comment upvotes are viewable by everyone"
ON public.topic_comment_upvotes FOR SELECT
USING (true);

CREATE POLICY "Users can upvote comments"
ON public.topic_comment_upvotes FOR INSERT
WITH CHECK (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

CREATE POLICY "Users can remove their upvotes"
ON public.topic_comment_upvotes FOR DELETE
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_topic_comments_topic_id ON public.topic_comments(topic_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_topic_comments_parent_id ON public.topic_comments(parent_comment_id) WHERE deleted_at IS NULL AND parent_comment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_topic_comments_profile_id ON public.topic_comments(profile_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_topic_comments_created_at ON public.topic_comments(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_topic_comments_top_level ON public.topic_comments(topic_id, created_at DESC) WHERE parent_comment_id IS NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_topic_comments_questions ON public.topic_comments(topic_id, is_question, created_at DESC) WHERE is_question = true AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_topic_comment_upvotes_comment_id ON public.topic_comment_upvotes(comment_id);
CREATE INDEX IF NOT EXISTS idx_topic_comment_upvotes_profile_id ON public.topic_comment_upvotes(profile_id);

-- Function to update comment replies count
CREATE OR REPLACE FUNCTION public.update_topic_comment_replies_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.parent_comment_id IS NOT NULL THEN
    UPDATE public.topic_comments
    SET replies_count = replies_count + 1
    WHERE id = NEW.parent_comment_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' AND OLD.parent_comment_id IS NOT NULL THEN
    UPDATE public.topic_comments
    SET replies_count = GREATEST(0, replies_count - 1)
    WHERE id = OLD.parent_comment_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger for replies count
DROP TRIGGER IF EXISTS update_topic_comment_replies_count_trigger ON public.topic_comments;
CREATE TRIGGER update_topic_comment_replies_count_trigger
AFTER INSERT OR DELETE ON public.topic_comments
FOR EACH ROW EXECUTE FUNCTION public.update_topic_comment_replies_count();

-- Function to update comment upvotes count
CREATE OR REPLACE FUNCTION public.update_topic_comment_upvotes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.topic_comments
    SET upvotes_count = upvotes_count + 1
    WHERE id = NEW.comment_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.topic_comments
    SET upvotes_count = GREATEST(0, upvotes_count - 1)
    WHERE id = OLD.comment_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger for upvotes count
DROP TRIGGER IF EXISTS update_topic_comment_upvotes_count_trigger ON public.topic_comment_upvotes;
CREATE TRIGGER update_topic_comment_upvotes_count_trigger
AFTER INSERT OR DELETE ON public.topic_comment_upvotes
FOR EACH ROW EXECUTE FUNCTION public.update_topic_comment_upvotes_count();

-- Trigger for updated_at
DROP TRIGGER IF EXISTS set_updated_at_topic_comments ON public.topic_comments;
CREATE TRIGGER set_updated_at_topic_comments
BEFORE UPDATE ON public.topic_comments
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

