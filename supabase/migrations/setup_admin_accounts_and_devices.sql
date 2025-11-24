-- Complete Admin & Device Setup - All-in-One SQL Script (Optimized)
-- 
-- This script does everything in one transaction:
-- 1. Sets up 2 admin accounts (local + production)
-- 2. Links devices to admin accounts
-- 3. Supports multiple devices per admin account
--
-- Account IDs:
-- - Local Admin: a8c24193-3912-4a7e-af33-328b3c756a32
-- - Production Admin: 1de6dfce-8d08-4bc0-a91b-61128a25fa97
--
-- INSTRUCTIONS:
-- 1. Run this entire script in your Supabase Production SQL Editor
-- 2. Refresh your app - both accounts will have admin access
-- 3. All linked devices will appear in Settings → Security → Active Devices

BEGIN;

-- ============================================================================
-- STEP 1: Grant admin access to BOTH accounts (fast, no checks)
-- ============================================================================

INSERT INTO public.admins (profile_id, role, created_at)
VALUES 
  ('a8c24193-3912-4a7e-af33-328b3c756a32'::uuid, 'admin', now()),
  ('1de6dfce-8d08-4bc0-a91b-61128a25fa97'::uuid, 'admin', now())
ON CONFLICT (profile_id) DO UPDATE 
SET role = 'admin';

-- ============================================================================
-- STEP 2: Link production device to local admin account (fast)
-- ============================================================================

-- Link device_id from production profile to local admin account
INSERT INTO public.devices (device_id, profile_id)
SELECT 
  p.device_id,
  'a8c24193-3912-4a7e-af33-328b3c756a32'::uuid
FROM public.profiles p
WHERE p.id = '1de6dfce-8d08-4bc0-a91b-61128a25fa97'::uuid
  AND p.device_id IS NOT NULL
ON CONFLICT (device_id) 
DO UPDATE SET
  profile_id = 'a8c24193-3912-4a7e-af33-328b3c756a32'::uuid,
  updated_at = now();

-- Update any existing device links for production profile
UPDATE public.devices
SET 
  profile_id = 'a8c24193-3912-4a7e-af33-328b3c756a32'::uuid,
  updated_at = now()
WHERE profile_id = '1de6dfce-8d08-4bc0-a91b-61128a25fa97'::uuid;

COMMIT;

-- ============================================================================
-- VERIFICATION (Optional - run separately if needed)
-- ============================================================================

-- Quick check: Verify both accounts are admins
-- SELECT p.handle, a.role FROM public.admins a
-- JOIN public.profiles p ON p.id = a.profile_id
-- WHERE a.profile_id IN (
--   'a8c24193-3912-4a7e-af33-328b3c756a32'::uuid,
--   '1de6dfce-8d08-4bc0-a91b-61128a25fa97'::uuid
-- );

-- Quick check: See linked devices
-- SELECT d.device_id, p.handle FROM public.devices d
-- JOIN public.profiles p ON p.id = d.profile_id
-- WHERE d.profile_id = 'a8c24193-3912-4a7e-af33-328b3c756a32'::uuid;

