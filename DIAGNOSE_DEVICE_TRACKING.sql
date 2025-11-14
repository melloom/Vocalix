-- ============================================
-- Diagnose Device Tracking Issues
-- ============================================
-- Run this in Supabase Dashboard SQL Editor
-- This will help identify why get_user_devices() isn't returning devices
-- ============================================

-- Step 1: Check if devices table exists and has data
SELECT 
  'Devices table check' as check_type,
  COUNT(*) as device_count,
  COUNT(DISTINCT device_id) as unique_devices,
  COUNT(DISTINCT profile_id) as devices_with_profiles
FROM public.devices;

-- Step 2: Show recent devices (if any)
SELECT 
  'Recent devices' as check_type,
  device_id,
  profile_id,
  created_at,
  last_seen_at,
  request_count,
  is_revoked,
  is_suspicious
FROM public.devices
ORDER BY last_seen_at DESC NULLS LAST, created_at DESC
LIMIT 10;

-- Step 3: Check function definition
SELECT 
  'Function definition' as check_type,
  routine_name,
  routine_type,
  security_type,
  routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name = 'get_user_devices'
LIMIT 1;

-- Step 4: Check RLS policies on devices table
SELECT 
  'RLS policies' as check_type,
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
AND tablename = 'devices';

-- Step 5: Check if function has proper permissions
SELECT 
  'Function permissions' as check_type,
  p.proname as function_name,
  r.rolname as owner,
  array_agg(DISTINCT pr.privilege_type) as permissions
FROM pg_proc p
JOIN pg_roles r ON p.proowner = r.oid
LEFT JOIN (
  SELECT 
    routine_name,
    privilege_type
  FROM information_schema.routine_privileges
  WHERE routine_schema = 'public'
  AND routine_name = 'get_user_devices'
) pr ON p.proname = pr.routine_name
WHERE p.proname = 'get_user_devices'
GROUP BY p.proname, r.rolname;

-- Step 6: Check profiles table for device_ids
SELECT 
  'Profiles with device_id' as check_type,
  COUNT(*) as profiles_with_device_id,
  COUNT(DISTINCT device_id) as unique_device_ids_in_profiles
FROM public.profiles
WHERE device_id IS NOT NULL;

-- Step 7: Check if there's a mismatch between profiles.device_id and devices.device_id
SELECT 
  'Device mismatch check' as check_type,
  COUNT(*) as profiles_with_device_not_in_devices_table
FROM public.profiles p
WHERE p.device_id IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM public.devices d WHERE d.device_id = p.device_id
);

-- Step 8: Manual device creation test (replace YOUR_DEVICE_ID with an actual device ID from localStorage)
-- This simulates what the function should do
-- NOTE: Replace '56cc048d-d46a-433a-84e1-531ba146171b' with your actual device ID
-- You can find it in browser localStorage: localStorage.getItem('deviceId')
/*
DO $$
DECLARE
  test_device_id TEXT := '56cc048d-d46a-433a-84e1-531ba146171b'; -- REPLACE WITH YOUR DEVICE ID
  test_profile_id UUID;
BEGIN
  -- Get profile_id if exists
  SELECT id INTO test_profile_id
  FROM public.profiles
  WHERE device_id = test_device_id
  LIMIT 1;
  
  -- Create/update device
  INSERT INTO public.devices (device_id, profile_id, first_seen_at, last_seen_at, request_count)
  VALUES (
    test_device_id,
    test_profile_id,
    now(),
    now(),
    1
  )
  ON CONFLICT (device_id) DO UPDATE SET
    last_seen_at = now(),
    request_count = COALESCE(devices.request_count, 0) + 1,
    profile_id = COALESCE(devices.profile_id, EXCLUDED.profile_id, test_profile_id);
  
  RAISE NOTICE 'Device created/updated: %', test_device_id;
  RAISE NOTICE 'Profile ID: %', test_profile_id;
END $$;
*/

-- Step 9: Check function owner (should be postgres or service_role)
SELECT 
  'Function owner' as check_type,
  p.proname as function_name,
  r.rolname as owner
FROM pg_proc p
JOIN pg_roles r ON p.proowner = r.oid
WHERE p.proname = 'get_user_devices';

-- Step 10: Check if search_path is set correctly
SELECT 
  'Function search_path' as check_type,
  p.proname as function_name,
  pg_get_functiondef(p.oid) LIKE '%SET search_path%' as has_search_path_set
FROM pg_proc p
WHERE p.proname = 'get_user_devices';

-- ============================================
-- Next Steps:
-- ============================================
-- 1. Check the results above
-- 2. If device_count is 0, devices aren't being created
-- 3. If devices exist but function returns empty, check RLS policies
-- 4. Run the manual device creation test (Step 8) with your actual device ID
-- 5. Check browser console for errors when calling get_user_devices()
-- 6. Verify x-device-id header is being sent (check Network tab in browser dev tools)
-- ============================================

