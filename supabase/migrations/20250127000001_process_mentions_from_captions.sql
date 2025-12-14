-- Process Mentions from Clip Captions
-- This extends mention processing to captions/transcriptions

-- Function to process mentions from captions when they're updated
CREATE OR REPLACE FUNCTION public.process_mentions_from_captions()
RETURNS TRIGGER AS $$
DECLARE
  v_mention_handle TEXT;
  v_mentioned_profile_id UUID;
  v_mentions TEXT[];
BEGIN
  -- Only process if captions are set and clip is live
  IF NEW.captions IS NULL OR NEW.status != 'live' THEN
    RETURN NEW;
  END IF;

  -- Extract mentions from captions
  v_mentions := public.extract_mentions(NEW.captions);

  -- Process each mention
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
        jsonb_build_object('clip_id', NEW.id, 'title', NEW.title, 'source', 'captions')
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for mentions in captions
-- This fires when captions are updated (e.g., after transcription)
CREATE TRIGGER trigger_process_mentions_from_captions
  AFTER UPDATE OF captions ON public.clips
  FOR EACH ROW
  WHEN (
    NEW.captions IS NOT NULL 
    AND NEW.status = 'live'
    AND (OLD.captions IS NULL OR OLD.captions != NEW.captions)
  )
  EXECUTE FUNCTION public.process_mentions_from_captions();

-- Also process mentions when a clip status changes to 'live' and captions exist
CREATE OR REPLACE FUNCTION public.process_mentions_on_status_change()
RETURNS TRIGGER AS $$
DECLARE
  v_mention_handle TEXT;
  v_mentioned_profile_id UUID;
  v_mentions TEXT[];
BEGIN
  -- Only process when status changes to 'live' and captions exist
  IF NEW.status != 'live' OR NEW.captions IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip if status didn't actually change to live
  IF OLD.status = 'live' THEN
    RETURN NEW;
  END IF;

  -- Extract mentions from captions
  v_mentions := public.extract_mentions(NEW.captions);

  -- Process each mention
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
        jsonb_build_object('clip_id', NEW.id, 'title', NEW.title, 'source', 'captions')
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for mentions when status changes to live
CREATE TRIGGER trigger_process_mentions_on_status_change
  AFTER UPDATE OF status ON public.clips
  FOR EACH ROW
  WHEN (
    NEW.status = 'live'
    AND OLD.status != 'live'
    AND NEW.captions IS NOT NULL
  )
  EXECUTE FUNCTION public.process_mentions_on_status_change();

