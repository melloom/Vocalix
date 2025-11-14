-- ============================================
-- VERIFY: Check if Device Setup is Complete
-- ============================================
-- Run this to verify everything is set up correctly
-- ============================================

-- Check 1: Verify function exists and has correct security
SELECT 
  'Function Status' as check_type,
  routine_name,
  security_type,
  routine_definition LIKE '%SECURITY DEFINER%' as has_security_definer
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name = 'get_user_devices';

-- Check 2: Verify RLS policies exist and are correct
SELECT 
  'Policy Status' as check_type,
  policyname,
  cmd,
  CASE 
    WHEN qual LIKE '%x-device-id%' THEN 'Uses device header'
    WHEN qual LIKE '%profile_id%' THEN 'Uses profile lookup'
    ELSE 'Other'
  END as policy_type
FROM pg_policies
WHERE schemaname = 'public'
AND tablename = 'devices'
ORDER BY policyname;

-- Check 3: Check if devices table has all required columns
SELECT 
  'Table Schema' as check_type,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'devices'
ORDER BY ordinal_position;

-- Check 4: Test if function can be called (this will show any errors)
-- Note: This might return empty if no device_id header is set, which is normal
SELECT 
  'Function Test' as check_type,
  COUNT(*) as devices_returned
FROM public.get_user_devices();

-- Check 5: Count devices in table
SELECT 
  'Device Count' as check_type,
  COUNT(*) as total_devices,
  COUNT(DISTINCT device_id) as unique_devices
FROM public.devices;

-- ============================================
-- Expected Results:
-- ============================================
-- 1. Function should exist with security_type = 'DEFINER' ✓
-- 2. Should have 2 policies: devices_by_device_id and devices_by_profile_id ✓
-- 3. Table should have all required columns (device_id, profile_id, last_seen_at, etc.) ✓
-- 4. Function test might return 0 devices (normal if no header set) ✓
-- 5. Device count shows how many devices are in the database
-- ============================================
-- If all checks pass, the setup is complete!
-- Now refresh your browser and check the Device Activity section
-- ============================================

