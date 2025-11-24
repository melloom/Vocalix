-- Link Accounts via SQL - Fast Method
-- 
-- This script links your production account/device to your local admin account
-- 
-- Local Profile ID (admin): a8c24193-3912-4a7e-af33-328b3c756a32
-- Production Profile ID: 1de6dfce-8d08-4bc0-a91b-61128a25fa97
--
-- INSTRUCTIONS:
-- 1. Run this in your Supabase Production SQL Editor
-- 2. This will link the production device to your local admin account
-- 3. After running, refresh your production app - you'll have admin access

-- ============================================================================
-- STEP 1: Find the device_id associated with production profile
-- ============================================================================

-- Check what device_id is linked to the production profile
SELECT 
  p.id as profile_id,
  p.handle,
  p.device_id as profile_device_id,
  d.device_id as linked_device_id,
  d.profile_id as linked_profile_id
FROM public.profiles p
LEFT JOIN public.devices d ON d.profile_id = p.id
WHERE p.id = '1de6dfce-8d08-4bc0-a91b-61128a25fa97'::uuid;

-- ============================================================================
-- STEP 2: Link production device to local admin account
-- ============================================================================

-- Option A: If production profile has a device_id in profiles table
-- This links the device_id from production profile to local admin account
INSERT INTO public.devices (device_id, profile_id)
SELECT 
  p.device_id,
  'a8c24193-3912-4a7e-af33-328b3c756a32'::uuid  -- Local admin account
FROM public.profiles p
WHERE p.id = '1de6dfce-8d08-4bc0-a91b-61128a25fa97'::uuid
  AND p.device_id IS NOT NULL
ON CONFLICT (device_id) 
DO UPDATE SET
  profile_id = 'a8c24193-3912-4a7e-af33-328b3c756a32'::uuid,
  updated_at = now();

-- Option B: If there are existing device links for production profile
-- This updates any existing device links to point to local admin account
UPDATE public.devices
SET 
  profile_id = 'a8c24193-3912-4a7e-af33-328b3c756a32'::uuid,
  updated_at = now()
WHERE profile_id = '1de6dfce-8d08-4bc0-a91b-61128a25fa97'::uuid;

-- ============================================================================
-- STEP 3: Grant admin access to local account (if not already admin)
-- ============================================================================

-- Make sure local account has admin access
INSERT INTO public.admins (profile_id, role, created_at)
VALUES ('a8c24193-3912-4a7e-af33-328b3c756a32'::uuid, 'admin', now())
ON CONFLICT (profile_id) DO UPDATE 
SET role = 'admin', created_at = now();

-- ============================================================================
-- STEP 4: Verify the link
-- ============================================================================

-- Check that devices are now linked to local admin account
SELECT 
  d.device_id,
  d.profile_id,
  p.handle,
  p.emoji_avatar,
  CASE 
    WHEN EXISTS (SELECT 1 FROM public.admins a WHERE a.profile_id = p.id) 
    THEN 'Yes' 
    ELSE 'No' 
  END as has_admin
FROM public.devices d
JOIN public.profiles p ON p.id = d.profile_id
WHERE d.profile_id = 'a8c24193-3912-4a7e-af33-328b3c756a32'::uuid
ORDER BY d.updated_at DESC;

-- ============================================================================
-- STEP 5: Check all linked devices for local admin account
-- ============================================================================

-- See all devices that can access the local admin account
SELECT 
  d.device_id,
  d.profile_id,
  p.handle,
  p.emoji_avatar,
  d.updated_at as linked_at,
  CASE 
    WHEN EXISTS (SELECT 1 FROM public.admins a WHERE a.profile_id = p.id) 
    THEN 'Admin' 
    ELSE 'User' 
  END as account_type
FROM public.devices d
JOIN public.profiles p ON p.id = d.profile_id
WHERE d.profile_id = 'a8c24193-3912-4a7e-af33-328b3c756a32'::uuid
ORDER BY d.updated_at DESC;

-- ============================================================================
-- OPTIONAL: Clean up production profile (if you want to remove it)
-- ============================================================================
-- WARNING: This will delete the production profile. Only run if you're sure!
-- Uncomment the lines below if you want to remove the production profile:

-- DELETE FROM public.profiles 
-- WHERE id = '1de6dfce-8d08-4bc0-a91b-61128a25fa97'::uuid;

