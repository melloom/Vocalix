-- Add parent_clip_id to clips table for voice reply threading
ALTER TABLE public.clips
ADD COLUMN IF NOT EXISTS parent_clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE;

-- Add index for faster queries on parent_clip_id
CREATE INDEX IF NOT EXISTS idx_clips_parent_clip_id ON public.clips(parent_clip_id);

-- Add index for faster queries on clips without parent (top-level clips)
CREATE INDEX IF NOT EXISTS idx_clips_top_level ON public.clips(parent_clip_id) WHERE parent_clip_id IS NULL;

-- Create a function to count replies for a clip
CREATE OR REPLACE FUNCTION public.get_reply_count(clip_uuid UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM public.clips
    WHERE parent_clip_id = clip_uuid
      AND status = 'live'
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- Add a computed column or view for reply counts (we'll handle this in queries)
-- For now, we'll use the function in queries

-- Update RLS policies to allow viewing replies
-- Replies inherit the same visibility rules as parent clips
-- The existing "Live clips are viewable by everyone" policy already covers replies

-- Add a comment to document the threading feature
COMMENT ON COLUMN public.clips.parent_clip_id IS 'References the parent clip if this is a voice reply. NULL indicates a top-level clip.';

