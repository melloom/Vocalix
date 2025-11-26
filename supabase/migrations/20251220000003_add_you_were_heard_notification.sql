-- "You were heard" notifications: send a gentle one-time nudge when a clip
-- gets its first listen, reply, or save. This uses the existing notifications
-- table if it is present.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notifications') THEN
    -- Function to notify creator when their clip gets its first engagement
    CREATE OR REPLACE FUNCTION public.notify_clip_first_engagement()
    RETURNS TRIGGER AS $$
    DECLARE
      v_clip_id UUID;
      v_creator_id UUID;
      v_existing_notification_id UUID;
    BEGIN
      -- Determine the clip id based on which table triggered the function
      IF TG_TABLE_NAME = 'listens' THEN
        v_clip_id := NEW.clip_id;
      ELSIF TG_TABLE_NAME = 'clips' THEN
        -- Replies: child clips that reference a parent via parent_clip_id
        IF NEW.parent_clip_id IS NULL THEN
          RETURN NEW;
        END IF;
        v_clip_id := NEW.parent_clip_id;
      ELSIF TG_TABLE_NAME = 'saved_clips' THEN
        v_clip_id := NEW.clip_id;
      ELSE
        RETURN NEW;
      END IF;

      IF v_clip_id IS NULL THEN
        RETURN NEW;
      END IF;

      -- Get original clip creator
      SELECT profile_id INTO v_creator_id
      FROM public.clips
      WHERE id = v_clip_id
      LIMIT 1;

      IF v_creator_id IS NULL THEN
        RETURN NEW;
      END IF;

      -- Do not notify on self-engagement
      IF TG_TABLE_NAME = 'listens' AND NEW.profile_id = v_creator_id THEN
        RETURN NEW;
      ELSIF TG_TABLE_NAME = 'clips' AND NEW.profile_id = v_creator_id THEN
        RETURN NEW;
      ELSIF TG_TABLE_NAME = 'saved_clips' AND NEW.profile_id = v_creator_id THEN
        RETURN NEW;
      END IF;

      -- Check if we've already sent a "you_were_heard" notification for this clip
      IF EXISTS (
        SELECT 1
        FROM public.notifications
        WHERE profile_id = v_creator_id
          AND related_clip_id = v_clip_id
          AND type = 'you_were_heard'
      ) THEN
        RETURN NEW;
      END IF;

      -- Insert a single, gentle notification
      INSERT INTO public.notifications (
        profile_id,
        type,
        title,
        message,
        related_clip_id,
        created_at
      )
      VALUES (
        v_creator_id,
        'you_were_heard',
        'Someone heard your voice',
        'Your clip just received its first listen, reply, or save.',
        v_clip_id,
        NOW()
      )
      ON CONFLICT DO NOTHING;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    -- Trigger on first listen
    DROP TRIGGER IF EXISTS trigger_notify_clip_first_listen ON public.listens;
    CREATE TRIGGER trigger_notify_clip_first_listen
      AFTER INSERT ON public.listens
      FOR EACH ROW
      WHEN (NEW.clip_id IS NOT NULL)
      EXECUTE FUNCTION public.notify_clip_first_engagement();

    -- Trigger on first reply (child clip)
    DROP TRIGGER IF EXISTS trigger_notify_clip_first_reply ON public.clips;
    CREATE TRIGGER trigger_notify_clip_first_reply
      AFTER INSERT ON public.clips
      FOR EACH ROW
      WHEN (NEW.parent_clip_id IS NOT NULL AND NEW.status = 'live')
      EXECUTE FUNCTION public.notify_clip_first_engagement();

    -- Trigger on first save
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'saved_clips') THEN
      DROP TRIGGER IF EXISTS trigger_notify_clip_first_save ON public.saved_clips;
      CREATE TRIGGER trigger_notify_clip_first_save
        AFTER INSERT ON public.saved_clips
        FOR EACH ROW
        WHEN (NEW.clip_id IS NOT NULL)
        EXECUTE FUNCTION public.notify_clip_first_engagement();
    END IF;
  END IF;
END $$;


