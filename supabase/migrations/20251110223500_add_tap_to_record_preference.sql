-- Add tap-to-record preference so listeners can choose tap or hold
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS tap_to_record BOOLEAN NOT NULL DEFAULT false;













