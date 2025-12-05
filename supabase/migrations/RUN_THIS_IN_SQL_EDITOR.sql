-- ============================================================================
-- Run this SQL in Supabase Dashboard → SQL Editor
-- ============================================================================
-- This adds the pseudo_id column to the profiles table
-- ============================================================================

-- Step 1: Add pseudo_id column to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS pseudo_id TEXT;

-- Step 2: Create index for faster lookups by pseudo_id
CREATE INDEX IF NOT EXISTS idx_profiles_pseudo_id ON public.profiles(pseudo_id)
WHERE pseudo_id IS NOT NULL;

-- Step 3: Add comment explaining the column
COMMENT ON COLUMN public.profiles.pseudo_id IS 
  'HMAC-hashed device ID for pseudonymity. Never store raw device_id in database.';

