-- ============================================
-- TEST: Verify Device Function Works
-- ============================================
-- Run this to test if get_user_devices is working
-- ============================================

-- Test 1: Check if function exists and has correct signature
SELECT 
  routine_name,
  routine_type,
  security_type,
  routine_definition LIKE '%SECURITY DEFINER%' as has_security_definer,
  routine_definition LIKE '%current_device_id%' as has_device_id_logic
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name = 'get_user_devices';

-- Test 2: Check RLS policies
SELECT 
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
AND tablename = 'devices'
ORDER BY policyname;

-- Test 3: Check if devices table has required columns
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'devices'
ORDER BY ordinal_position;

-- Test 4: Check current devices count
SELECT 
  COUNT(*) as total_devices,
  COUNT(DISTINCT device_id) as unique_devices,
  COUNT(*) FILTER (WHERE profile_id IS NOT NULL) as devices_with_profile
FROM public.devices;

-- Test 5: Show sample devices (if any)
SELECT 
  device_id,
  profile_id,
  created_at,
  last_seen_at,
  request_count,
  is_revoked,
  is_suspicious
FROM public.devices
ORDER BY last_seen_at DESC NULLS LAST
LIMIT 5;

-- Test 6: Check function permissions
SELECT 
  p.proname as function_name,
  pg_get_userbyid(p.proowner) as owner,
  array_agg(DISTINCT pr.rolname) as granted_to
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
LEFT JOIN pg_proc_acl pa ON p.oid = pa.prooid
LEFT JOIN pg_roles pr ON pa.grantee = pr.oid
WHERE n.nspname = 'public'
AND p.proname = 'get_user_devices'
GROUP BY p.proname, p.proowner;

-- ============================================
-- If all tests pass:
-- 1. Function exists ✓
-- 2. Policies are simple and non-recursive ✓
-- 3. Table has all required columns ✓
-- 4. Function has correct permissions ✓
--
-- Then the issue might be:
-- - The x-device-id header is not being sent
-- - The function is being called but returning empty
-- - Browser cache needs to be cleared
-- ============================================
