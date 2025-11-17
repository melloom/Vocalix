-- Add profile reporting support to reports table
-- Allow reports to target either clips or profiles

-- Add profile_id column to reports table
ALTER TABLE public.reports
ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Add constraint to ensure either clip_id or profile_id is set (but not both)
ALTER TABLE public.reports
ADD CONSTRAINT reports_target_check CHECK (
  (clip_id IS NOT NULL AND profile_id IS NULL) OR 
  (clip_id IS NULL AND profile_id IS NOT NULL)
);

-- Add index for profile reports
CREATE INDEX IF NOT EXISTS reports_profile_id_idx ON public.reports(profile_id) WHERE profile_id IS NOT NULL;

-- Update RLS policies to allow viewing profile reports (same as clip reports)
-- The existing policies should already work since they check for admin status

