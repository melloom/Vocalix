-- Add creator tools: drafts and scheduled posts
-- This migration adds support for saving drafts and scheduling posts

-- Add scheduled_for timestamp to clips table for scheduled posts
ALTER TABLE public.clips 
ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;

-- Update RLS policy to allow users to see their own drafts
-- Drafts should only be visible to the creator
DROP POLICY IF EXISTS "Users can view their own drafts" ON public.clips;
CREATE POLICY "Users can view their own drafts" 
ON public.clips FOR SELECT 
USING (
  status = 'draft' AND 
  profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Allow users to insert drafts
-- This is already covered by "Users can insert their own clips" policy, but we ensure drafts work
-- The existing policy allows all inserts, so drafts will work

-- Allow users to update their own drafts
DROP POLICY IF EXISTS "Users can update their own drafts" ON public.clips;
CREATE POLICY "Users can update their own drafts" 
ON public.clips FOR UPDATE 
USING (
  status = 'draft' AND 
  profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Allow users to delete their own drafts
DROP POLICY IF EXISTS "Users can delete their own drafts" ON public.clips;
CREATE POLICY "Users can delete their own drafts" 
ON public.clips FOR DELETE 
USING (
  status = 'draft' AND 
  profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Create index for scheduled posts query (for cron job to find posts to publish)
CREATE INDEX IF NOT EXISTS idx_clips_scheduled_for 
ON public.clips(scheduled_for) 
WHERE scheduled_for IS NOT NULL AND status = 'draft';

-- Create index for drafts query (for users to see their drafts)
CREATE INDEX IF NOT EXISTS idx_clips_drafts 
ON public.clips(profile_id, created_at DESC) 
WHERE status = 'draft';

-- Function to publish scheduled clips
-- This will be called by a cron job or edge function
CREATE OR REPLACE FUNCTION public.publish_scheduled_clips()
RETURNS TABLE (
  clip_id UUID,
  profile_id UUID,
  audio_path TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  clip_record RECORD;
BEGIN
  -- Find all drafts that are scheduled to be published now or in the past
  FOR clip_record IN
    SELECT id, profile_id, audio_path
    FROM public.clips
    WHERE 
      status = 'draft' 
      AND scheduled_for IS NOT NULL
      AND scheduled_for <= NOW()
  LOOP
    -- Update the clip status to processing
    UPDATE public.clips
    SET 
      status = 'processing',
      scheduled_for = NULL
    WHERE id = clip_record.id;
    
    -- Return the clip info
    clip_id := clip_record.id;
    profile_id := clip_record.profile_id;
    audio_path := clip_record.audio_path;
    RETURN NEXT;
  END LOOP;
  
  RETURN;
END;
$$;

-- Grant execute permission to authenticated users (for edge function)
GRANT EXECUTE ON FUNCTION public.publish_scheduled_clips() TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_scheduled_clips() TO anon;

-- Add comment for documentation
COMMENT ON COLUMN public.clips.scheduled_for IS 'Timestamp when draft should be published. If set, clip will be published automatically at this time.';
COMMENT ON FUNCTION public.publish_scheduled_clips() IS 'Publishes all scheduled clips that are due. Returns the clips that were published.';

