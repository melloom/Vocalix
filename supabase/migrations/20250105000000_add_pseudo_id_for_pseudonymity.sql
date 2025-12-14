-- ============================================================================
-- Migration: Add pseudo_id for Device ID Pseudonymity
-- ============================================================================
-- This migration adds a pseudo_id column to profiles table for pseudonymized
-- device IDs using HMAC hashing. This provides better privacy while maintaining
-- the ability to link user activity to a consistent persona.
-- ============================================================================

-- Step 1: Add pseudo_id column to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS pseudo_id TEXT;

-- Step 2: Create index for faster lookups by pseudo_id
CREATE INDEX IF NOT EXISTS idx_profiles_pseudo_id ON public.profiles(pseudo_id)
WHERE pseudo_id IS NOT NULL;

-- Step 3: Add unique constraint on pseudo_id (after migration populates it)
-- We'll add this in a separate step after migration to avoid conflicts

-- Step 4: Add comment explaining the column
COMMENT ON COLUMN public.profiles.pseudo_id IS 
  'HMAC-hashed device ID for pseudonymity. Never store raw device_id in database.';

-- Step 5: Create function to migrate existing users
-- This will be called by a separate migration script
CREATE OR REPLACE FUNCTION public.migrate_existing_users_to_pseudo_id()
RETURNS TABLE (
  profile_id UUID,
  pseudo_id TEXT,
  migrated_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_migrated_count INTEGER := 0;
  v_profile_record RECORD;
BEGIN
  -- Note: This function is a placeholder
  -- Actual migration will be done via Edge Function or script
  -- that calls the pseudonymize-device function for each device_id
  
  -- Return empty result - migration happens externally
  RETURN QUERY
  SELECT NULL::UUID, NULL::TEXT, 0::INTEGER
  WHERE FALSE;
END;
$$;

-- Step 6: Update RLS policies to allow pseudo_id lookups
-- Keep existing policies, but add support for pseudo_id in future queries

COMMENT ON FUNCTION public.migrate_existing_users_to_pseudo_id() IS 
  'Placeholder function for migrating existing users. Actual migration should be done via Edge Function that calls pseudonymize-device for each device_id.';

