-- Add text comments support for voice clips
-- Comments can be nested (replies to comments)

-- Create comments table
CREATE TABLE IF NOT EXISTS public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id UUID NOT NULL REFERENCES public.clips(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  parent_comment_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) > 0 AND char_length(content) <= 1000),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT comments_content_length CHECK (char_length(trim(content)) > 0)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_comments_clip_id ON public.comments(clip_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_comments_parent_comment_id ON public.comments(parent_comment_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_comments_profile_id ON public.comments(profile_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON public.comments(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_comments_top_level ON public.comments(clip_id, created_at DESC) WHERE parent_comment_id IS NULL AND deleted_at IS NULL;

-- Enable RLS
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone can view non-deleted comments
CREATE POLICY "Comments are viewable by everyone"
ON public.comments FOR SELECT
USING (deleted_at IS NULL);

-- Policy: Users can insert their own comments
CREATE POLICY "Users can insert their own comments"
ON public.comments FOR INSERT
WITH CHECK (
  profile_id IN (
    SELECT id
    FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Policy: Users can update their own comments
CREATE POLICY "Users can update their own comments"
ON public.comments FOR UPDATE
USING (
  profile_id IN (
    SELECT id
    FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
  AND deleted_at IS NULL
)
WITH CHECK (
  profile_id IN (
    SELECT id
    FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
  AND deleted_at IS NULL
);

-- Policy: Users can soft-delete their own comments
CREATE POLICY "Users can delete their own comments"
ON public.comments FOR UPDATE
USING (
  profile_id IN (
    SELECT id
    FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
)
WITH CHECK (
  profile_id IN (
    SELECT id
    FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Function to count comments for a clip (excluding deleted)
CREATE OR REPLACE FUNCTION public.get_comment_count(clip_uuid UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM public.comments
    WHERE clip_id = clip_uuid
      AND deleted_at IS NULL
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to count top-level comments (not replies)
CREATE OR REPLACE FUNCTION public.get_top_level_comment_count(clip_uuid UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM public.comments
    WHERE clip_id = clip_uuid
      AND parent_comment_id IS NULL
      AND deleted_at IS NULL
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to count replies for a comment
CREATE OR REPLACE FUNCTION public.get_comment_reply_count(comment_uuid UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM public.comments
    WHERE parent_comment_id = comment_uuid
      AND deleted_at IS NULL
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_comments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_comments_updated_at
  BEFORE UPDATE ON public.comments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_comments_updated_at();

-- Add comment count column to clips table (optional, for denormalization)
-- We'll use the function in queries instead for real-time accuracy

-- Add documentation
COMMENT ON TABLE public.comments IS 'Text comments on voice clips. Supports nested replies via parent_comment_id.';
COMMENT ON COLUMN public.comments.clip_id IS 'The voice clip this comment is on.';
COMMENT ON COLUMN public.comments.parent_comment_id IS 'If set, this is a reply to another comment. NULL indicates a top-level comment.';
COMMENT ON COLUMN public.comments.content IS 'The comment text content (1-1000 characters).';
COMMENT ON COLUMN public.comments.deleted_at IS 'Soft delete timestamp. NULL means the comment is active.';

