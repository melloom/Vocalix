-- Enhanced Comments System
-- Adds voice comments, reactions, moderation, summaries, and sorting support

-- 1. Add voice comment support to comments table
ALTER TABLE public.comments
ADD COLUMN IF NOT EXISTS audio_path TEXT,
ADD COLUMN IF NOT EXISTS duration_seconds DECIMAL(5,2) CHECK (duration_seconds IS NULL OR (duration_seconds >= 1 AND duration_seconds <= 30)),
ADD COLUMN IF NOT EXISTS summary TEXT,
ADD COLUMN IF NOT EXISTS reactions JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Update constraint to allow either content OR audio_path
ALTER TABLE public.comments
DROP CONSTRAINT IF EXISTS comments_content_length;

-- Allow comments to have either text content OR audio (or both)
ALTER TABLE public.comments
ADD CONSTRAINT comments_has_content CHECK (
  (content IS NOT NULL AND char_length(trim(content)) > 0) OR 
  (audio_path IS NOT NULL)
);

-- Update content constraint to allow NULL if audio_path exists
ALTER TABLE public.comments
ALTER COLUMN content DROP NOT NULL;

-- Add index for voice comments
CREATE INDEX IF NOT EXISTS idx_comments_audio_path ON public.comments(audio_path) WHERE audio_path IS NOT NULL;

-- 2. Create comment reactions table (emoji reactions)
CREATE TABLE IF NOT EXISTS public.comment_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(comment_id, profile_id, emoji)
);

CREATE INDEX idx_comment_reactions_comment_id ON public.comment_reactions(comment_id);
CREATE INDEX idx_comment_reactions_profile_id ON public.comment_reactions(profile_id);
CREATE INDEX idx_comment_reactions_created_at ON public.comment_reactions(created_at DESC);

ALTER TABLE public.comment_reactions ENABLE ROW LEVEL SECURITY;

-- Comment reactions are readable by everyone
CREATE POLICY "Comment reactions readable by everyone"
ON public.comment_reactions FOR SELECT
USING (true);

-- Users can insert their own comment reactions
CREATE POLICY "Comment reactions insertable by owner"
ON public.comment_reactions FOR INSERT
WITH CHECK (
  profile_id IN (SELECT id FROM public.profile_ids_for_request())
  OR profile_id IS NULL
);

-- Users can delete their own comment reactions
CREATE POLICY "Comment reactions deletable by owner"
ON public.comment_reactions FOR DELETE
USING (
  profile_id IN (SELECT id FROM public.profile_ids_for_request())
);

-- 3. Create comment voice reactions table (voice clip reactions)
CREATE TABLE IF NOT EXISTS public.comment_voice_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  audio_path TEXT NOT NULL,
  duration_seconds DECIMAL(5,2) NOT NULL CHECK (duration_seconds >= 1 AND duration_seconds <= 5),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_comment_voice_reactions_comment_id ON public.comment_voice_reactions(comment_id);
CREATE INDEX idx_comment_voice_reactions_profile_id ON public.comment_voice_reactions(profile_id);
CREATE INDEX idx_comment_voice_reactions_created_at ON public.comment_voice_reactions(created_at DESC);

ALTER TABLE public.comment_voice_reactions ENABLE ROW LEVEL SECURITY;

-- Comment voice reactions are readable by everyone
CREATE POLICY "Comment voice reactions readable by everyone"
ON public.comment_voice_reactions FOR SELECT
USING (true);

-- Users can insert their own comment voice reactions
CREATE POLICY "Comment voice reactions insertable by owner"
ON public.comment_voice_reactions FOR INSERT
WITH CHECK (
  profile_id IN (SELECT id FROM public.profile_ids_for_request())
  OR profile_id IS NULL
);

-- Users can delete their own comment voice reactions
CREATE POLICY "Comment voice reactions deletable by owner"
ON public.comment_voice_reactions FOR DELETE
USING (
  profile_id IN (SELECT id FROM public.profile_ids_for_request())
);

-- 4. Add comment moderation: Allow clip creators to delete comments on their clips
-- Update existing delete policy to also allow clip creators
DROP POLICY IF EXISTS "Users can delete their own comments" ON public.comments;

CREATE POLICY "Users can delete their own comments"
ON public.comments FOR UPDATE
USING (
  profile_id IN (SELECT id FROM public.profile_ids_for_request())
)
WITH CHECK (
  profile_id IN (SELECT id FROM public.profile_ids_for_request())
);

-- Clip creators can delete comments on their clips
CREATE POLICY "Clip creators can delete comments on their clips"
ON public.comments FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.clips c
    WHERE c.id = comments.clip_id
    AND c.profile_id IN (SELECT id FROM public.profile_ids_for_request())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.clips c
    WHERE c.id = comments.clip_id
    AND c.profile_id IN (SELECT id FROM public.profile_ids_for_request())
  )
);

-- 5. Functions for comment reactions aggregation
CREATE OR REPLACE FUNCTION public.get_comment_reactions(comment_uuid UUID)
RETURNS JSONB AS $$
DECLARE
  reaction_counts JSONB := '{}'::jsonb;
BEGIN
  SELECT jsonb_object_agg(emoji, count)
  INTO reaction_counts
  FROM (
    SELECT emoji, COUNT(*)::INTEGER as count
    FROM public.comment_reactions
    WHERE comment_id = comment_uuid
    GROUP BY emoji
  ) subq;
  
  RETURN COALESCE(reaction_counts, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get comment voice reaction count
CREATE OR REPLACE FUNCTION public.get_comment_voice_reaction_count(comment_uuid UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM public.comment_voice_reactions
    WHERE comment_id = comment_uuid
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to calculate comment relevance score (for sorting)
CREATE OR REPLACE FUNCTION public.get_comment_relevance_score(comment_uuid UUID)
RETURNS NUMERIC AS $$
DECLARE
  v_reaction_count INTEGER;
  v_voice_reaction_count INTEGER;
  v_reply_count INTEGER;
  v_age_hours NUMERIC;
  v_score NUMERIC;
BEGIN
  -- Get reaction counts
  SELECT COUNT(*)::INTEGER INTO v_reaction_count
  FROM public.comment_reactions
  WHERE comment_id = comment_uuid;
  
  SELECT COUNT(*)::INTEGER INTO v_voice_reaction_count
  FROM public.comment_voice_reactions
  WHERE comment_id = comment_uuid;
  
  -- Get reply count
  SELECT COUNT(*)::INTEGER INTO v_reply_count
  FROM public.comments
  WHERE parent_comment_id = comment_uuid
  AND deleted_at IS NULL;
  
  -- Get age in hours
  SELECT EXTRACT(EPOCH FROM (now() - created_at)) / 3600 INTO v_age_hours
  FROM public.comments
  WHERE id = comment_uuid;
  
  -- Calculate score: reactions + voice reactions + replies, weighted by recency
  -- More recent comments get a boost (decay factor)
  v_score := (
    (v_reaction_count * 1.0) +
    (v_voice_reaction_count * 2.0) +  -- Voice reactions weighted more
    (v_reply_count * 1.5) +  -- Replies indicate engagement
    (CASE WHEN v_age_hours < 24 THEN 2.0 ELSE 1.0 / (1.0 + v_age_hours / 24.0) END)  -- Recency boost
  );
  
  RETURN v_score;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to generate comment thread summary (placeholder - can be enhanced with AI)
CREATE OR REPLACE FUNCTION public.generate_comment_summary(comment_uuid UUID, max_length INTEGER DEFAULT 200)
RETURNS TEXT AS $$
DECLARE
  v_summary TEXT;
  v_comment_count INTEGER;
  v_top_level_comment TEXT;
BEGIN
  -- Get count of replies
  SELECT COUNT(*)::INTEGER INTO v_comment_count
  FROM public.comments
  WHERE parent_comment_id = comment_uuid
  AND deleted_at IS NULL;
  
  -- Get the original comment content
  SELECT content INTO v_top_level_comment
  FROM public.comments
  WHERE id = comment_uuid
  AND deleted_at IS NULL;
  
  -- Simple summary: "X replies to: [first 100 chars of comment]"
  IF v_comment_count > 0 THEN
    v_summary := v_comment_count::TEXT || ' replies';
    IF v_top_level_comment IS NOT NULL THEN
      v_summary := v_summary || ' to: ' || LEFT(v_top_level_comment, 100);
      IF char_length(v_top_level_comment) > 100 THEN
        v_summary := v_summary || '...';
      END IF;
    END IF;
  ELSE
    v_summary := NULL;
  END IF;
  
  RETURN v_summary;
END;
$$ LANGUAGE plpgsql STABLE;

-- Trigger to update comment reactions JSONB when reactions change
CREATE OR REPLACE FUNCTION public.update_comment_reactions_jsonb()
RETURNS TRIGGER AS $$
DECLARE
  v_comment_id UUID;
  v_reactions JSONB;
BEGIN
  v_comment_id := COALESCE(NEW.comment_id, OLD.comment_id);
  
  -- Get aggregated reactions
  SELECT public.get_comment_reactions(v_comment_id) INTO v_reactions;
  
  -- Update comment reactions JSONB
  UPDATE public.comments
  SET reactions = v_reactions
  WHERE id = v_comment_id;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger to update reactions when comment_reactions change
DROP TRIGGER IF EXISTS trigger_update_comment_reactions_jsonb ON public.comment_reactions;
CREATE TRIGGER trigger_update_comment_reactions_jsonb
  AFTER INSERT OR DELETE ON public.comment_reactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_comment_reactions_jsonb();

-- Add index for sorting by relevance
CREATE INDEX IF NOT EXISTS idx_comments_relevance ON public.comments(clip_id, created_at DESC) 
WHERE deleted_at IS NULL AND parent_comment_id IS NULL;

-- Add index for reactions sorting
CREATE INDEX IF NOT EXISTS idx_comments_reactions ON public.comments(clip_id, reactions) 
WHERE deleted_at IS NULL AND parent_comment_id IS NULL;

-- Add comment summary column index
CREATE INDEX IF NOT EXISTS idx_comments_summary ON public.comments(summary) 
WHERE summary IS NOT NULL;

-- Update RLS policies to allow viewing comments with audio
-- The existing policy should already work, but ensure it's correct
DROP POLICY IF EXISTS "Comments are viewable by everyone" ON public.comments;

CREATE POLICY "Comments are viewable by everyone"
ON public.comments FOR SELECT
USING (
  deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.clips c
    WHERE c.id = comments.clip_id
    AND c.status = 'live'
  )
);

COMMENT ON COLUMN public.comments.audio_path IS 'Path to audio file for voice comments';
COMMENT ON COLUMN public.comments.duration_seconds IS 'Duration of voice comment in seconds (1-30)';
COMMENT ON COLUMN public.comments.summary IS 'AI-generated summary of comment thread';
COMMENT ON COLUMN public.comments.reactions IS 'Aggregated emoji reactions JSONB';
COMMENT ON TABLE public.comment_reactions IS 'Emoji reactions on comments';
COMMENT ON TABLE public.comment_voice_reactions IS 'Voice clip reactions on comments (3-5 seconds)';

