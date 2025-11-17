-- ============================================================================
-- Migration: Switch to Supabase Auth (Anonymous)
-- ============================================================================
-- This migration switches from device-based auth to Supabase Auth anonymous
-- ============================================================================

-- Step 1: Add auth_user_id column to profiles (links profile to auth user)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Step 2: Create index for faster lookups
CREATE INDEX IF NOT EXISTS profiles_auth_user_id_idx ON public.profiles(auth_user_id);

-- Step 3: Update RLS policies to use auth.uid() instead of device_id
-- Keep device_id policies as fallback for backward compatibility

-- Profiles: Update policy
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
USING (
  auth_user_id = auth.uid() OR
  id IN (SELECT id FROM public.profile_ids_for_request())
)
WITH CHECK (
  auth_user_id = auth.uid() OR
  id IN (SELECT id FROM public.profile_ids_for_request())
);

-- Profiles: Delete policy
DROP POLICY IF EXISTS "Users can delete their own profile" ON public.profiles;
CREATE POLICY "Users can delete their own profile"
ON public.profiles FOR DELETE
USING (
  auth_user_id = auth.uid() OR
  id IN (SELECT id FROM public.profile_ids_for_request())
);

-- Profiles: Insert policy (allow anonymous signup)
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT
WITH CHECK (
  -- Allow if auth_user_id matches current user (primary method)
  auth_user_id = auth.uid() OR
  -- Allow if no auth_user_id is set (will be set by trigger or app)
  auth_user_id IS NULL OR
  -- Backward compatibility: device-based auth
  device_id = COALESCE(
    NULLIF(trim((current_setting('request.headers', true)::json ->> 'x-device-id')), ''),
    device_id
  )
);

-- Clips: Update policies to support both auth and device-based
DROP POLICY IF EXISTS "Owners update their clips" ON public.clips;
CREATE POLICY "Owners update their clips"
ON public.clips FOR UPDATE
USING (
  profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()) OR
  profile_id IN (SELECT id FROM public.profile_ids_for_request())
)
WITH CHECK (
  profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()) OR
  profile_id IN (SELECT id FROM public.profile_ids_for_request())
);

DROP POLICY IF EXISTS "Owners delete their clips" ON public.clips;
CREATE POLICY "Owners delete their clips"
ON public.clips FOR DELETE
USING (
  profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()) OR
  profile_id IN (SELECT id FROM public.profile_ids_for_request())
);

DROP POLICY IF EXISTS "Users can insert their own clips" ON public.clips;
CREATE POLICY "Users can insert their own clips"
ON public.clips FOR INSERT
WITH CHECK (
  profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()) OR
  profile_id IN (SELECT id FROM public.profile_ids_for_request())
);

DROP POLICY IF EXISTS "Owners view their clips" ON public.clips;
CREATE POLICY "Owners view their clips"
ON public.clips FOR SELECT
USING (
  profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()) OR
  profile_id IN (SELECT id FROM public.profile_ids_for_request())
);

-- Note: Other tables (follows, saved_clips, etc.) will be updated similarly
-- For now, we keep backward compatibility with device-based auth

