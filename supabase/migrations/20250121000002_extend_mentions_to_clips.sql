-- Extend Mentions to Work in Clips
-- Currently mentions only work in comments, this extends them to clips

-- Trigger to notify on mention in clip title or summary
CREATE OR REPLACE FUNCTION public.notify_mention_in_clip()
RETURNS TRIGGER AS $$
DECLARE
  v_mention_handle TEXT;
  v_mentioned_profile_id UUID;
  v_mentions TEXT[];
  v_text_content TEXT;
BEGIN
  -- Combine title and summary for mention extraction
  v_text_content := COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.summary, '');
  
  -- Extract mentions from combined text
  v_mentions := public.extract_mentions(v_text_content);

  -- Notify each mentioned user
  FOREACH v_mention_handle IN ARRAY v_mentions
  LOOP
    -- Find profile by handle
    SELECT id INTO v_mentioned_profile_id
    FROM public.profiles
    WHERE handle = v_mention_handle;

    -- Create notification for mentioned user (if not the clip author)
    IF v_mentioned_profile_id IS NOT NULL AND v_mentioned_profile_id != NEW.profile_id THEN
      PERFORM public.create_notification(
        v_mentioned_profile_id,
        NEW.profile_id,
        'mention',
        'clip',
        NEW.id,
        jsonb_build_object('clip_id', NEW.id, 'title', NEW.title)
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for mentions in clips (only for live clips)
CREATE TRIGGER trigger_notify_mention_in_clip
  AFTER INSERT OR UPDATE ON public.clips
  FOR EACH ROW
  WHEN (NEW.status = 'live' AND (NEW.title IS NOT NULL OR NEW.summary IS NOT NULL))
  EXECUTE FUNCTION public.notify_mention_in_clip();

-- Function to extract mentions from clip captions/transcriptions
-- This can be used for mentions in audio transcriptions
CREATE OR REPLACE FUNCTION public.extract_mentions_from_captions(clip_id_param UUID)
RETURNS TEXT[] AS $$
DECLARE
  v_captions TEXT;
  v_mentions TEXT[];
BEGIN
  -- Get captions from clip
  SELECT captions INTO v_captions
  FROM public.clips
  WHERE id = clip_id_param;

  IF v_captions IS NULL THEN
    RETURN ARRAY[]::TEXT[];
  END IF;

  -- Extract mentions
  v_mentions := public.extract_mentions(v_captions);

  RETURN v_mentions;
END;
$$ LANGUAGE plpgsql STABLE;

-- Note: For mentions in audio transcriptions, we'll need to process them
-- when the transcription is completed. This can be done in the edge function
-- that processes clip uploads (on-clip-uploaded).

