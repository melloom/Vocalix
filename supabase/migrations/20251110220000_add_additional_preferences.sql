-- Additional listener preferences
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS autoplay_next_clip BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS notify_new_topics BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS filter_mature_content BOOLEAN NOT NULL DEFAULT true;










