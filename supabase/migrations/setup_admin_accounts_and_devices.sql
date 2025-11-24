-- Complete Admin & Device Setup - All-in-One SQL Script
-- 
-- This script does everything:
-- 1. Sets up 2 admin accounts (local + production)
-- 2. Links devices to admin accounts
-- 3. Supports multiple devices per admin account
-- 4. All devices will show in Security settings
-- 5. Admins can revoke devices from frontend
--
-- Account IDs:
-- - Local Admin: a8c24193-3912-4a7e-af33-328b3c756a32
-- - Production Admin: 1de6dfce-8d08-4bc0-a91b-61128a25fa97
--
-- INSTRUCTIONS:
-- 1. Run this entire script in your Supabase Production SQL Editor
-- 2. Refresh your app - both accounts will have admin access
-- 3. All linked devices will appear in Settings → Security → Active Devices
-- 4. Admins can revoke devices from the frontend

-- ============================================================================
-- STEP 1: Check current admin count (max 2 allowed)
-- ============================================================================

SELECT 
  COUNT(*) as current_admin_count,
  CASE 
    WHEN COUNT(*) >= 2 THEN 'WARNING: Already at max (2 admins). Will update existing.'
    WHEN COUNT(*) = 1 THEN 'INFO: 1 admin exists. Adding 1 more.'
    ELSE 'INFO: No admins. Adding 2 admins.'
  END as status
FROM public.admins;

-- ============================================================================
-- STEP 2: Grant admin access to BOTH accounts
-- ============================================================================

-- Add local account as admin (first admin)
INSERT INTO public.admins (profile_id, role, created_at)
VALUES ('a8c24193-3912-4a7e-af33-328b3c756a32'::uuid, 'admin', now())
ON CONFLICT (profile_id) DO UPDATE 
SET role = 'admin', created_at = now();

-- Add production account as admin (second admin)
INSERT INTO public.admins (profile_id, role, created_at)
VALUES ('1de6dfce-8d08-4bc0-a91b-61128a25fa97'::uuid, 'admin', now())
ON CONFLICT (profile_id) DO UPDATE 
SET role = 'admin', created_at = now();

-- ============================================================================
-- STEP 3: Link production device to local admin account
-- ============================================================================

-- Find and link the device_id from production profile to local admin account
-- This allows the production device to access the local admin account

-- Option A: Link device_id from production profile to local admin
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

-- Option B: Update any existing device links for production profile
UPDATE public.devices
SET 
  profile_id = 'a8c24193-3912-4a7e-af33-328b3c756a32'::uuid,
  updated_at = now()
WHERE profile_id = '1de6dfce-8d08-4bc0-a91b-61128a25fa97'::uuid;

-- ============================================================================
-- STEP 4: Verify admin access for both accounts
-- ============================================================================

SELECT 
  p.id as profile_id,
  p.handle,
  p.emoji_avatar,
  a.role,
  a.created_at as admin_since,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM public.devices d 
      WHERE d.profile_id = p.id
    ) THEN 'Yes'
    ELSE 'No'
  END as has_linked_devices
FROM public.admins a
JOIN public.profiles p ON p.id = a.profile_id
WHERE a.profile_id IN (
  'a8c24193-3912-4a7e-af33-328b3c756a32'::uuid,
  '1de6dfce-8d08-4bc0-a91b-61128a25fa97'::uuid
)
ORDER BY a.created_at DESC;

-- ============================================================================
-- STEP 5: Show all devices linked to admin accounts
-- ============================================================================

-- This shows all devices that can access admin accounts
-- These will appear in Settings → Security → Active Devices
SELECT 
  d.device_id,
  d.profile_id,
  p.handle as account_handle,
  p.emoji_avatar,
  d.created_at as linked_at,
  d.updated_at as last_updated,
  CASE 
    WHEN EXISTS (SELECT 1 FROM public.admins a WHERE a.profile_id = p.id) 
    THEN 'Admin Account' 
    ELSE 'User Account' 
  END as account_type
FROM public.devices d
JOIN public.profiles p ON p.id = d.profile_id
WHERE d.profile_id IN (
  'a8c24193-3912-4a7e-af33-328b3c756a32'::uuid,
  '1de6dfce-8d08-4bc0-a91b-61128a25fa97'::uuid
)
ORDER BY d.updated_at DESC;

-- ============================================================================
-- STEP 6: Verify device linking works correctly
-- ============================================================================

-- Check that devices can access their linked admin accounts
SELECT 
  'Device Linking Status' as check_type,
  COUNT(DISTINCT d.device_id) as total_linked_devices,
  COUNT(DISTINCT d.profile_id) as total_linked_accounts,
  COUNT(DISTINCT CASE 
    WHEN EXISTS (SELECT 1 FROM public.admins a WHERE a.profile_id = d.profile_id) 
    THEN d.profile_id 
  END) as admin_accounts_with_devices
FROM public.devices d
WHERE d.profile_id IN (
  'a8c24193-3912-4a7e-af33-328b3c756a32'::uuid,
  '1de6dfce-8d08-4bc0-a91b-61128a25fa97'::uuid
);

-- ============================================================================
-- SUMMARY: What this script did
-- ============================================================================

-- ✅ Set up 2 admin accounts (local + production)
-- ✅ Linked production device to local admin account
-- ✅ All devices will show in Settings → Security → Active Devices
-- ✅ Admins can revoke devices from the frontend (useDevices hook handles this)
-- ✅ Multiple devices can be linked to the same admin account
-- ✅ Maximum of 2 admins enforced by existing triggers

-- ============================================================================
-- NEXT STEPS:
-- ============================================================================

-- 1. Refresh your production app
-- 2. Go to Settings → Security → Active Devices
-- 3. You should see all linked devices listed
-- 4. You can revoke devices using the "Revoke" button in the frontend
-- 5. Both admin accounts can access /admin dashboard

