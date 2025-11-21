-- Add preference for showing 18+ content
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS show_18_plus_content BOOLEAN NOT NULL DEFAULT false;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_profiles_show_18_plus_content ON public.profiles(show_18_plus_content);

