-- ============================================
-- Test get_user_devices Function
-- ============================================
-- This script tests if get_user_devices() is working correctly
-- NOTE: The function needs the x-device-id header to work
-- This can't be fully tested in SQL Editor, but we can verify the setup
-- ============================================

-- Step 1: Verify function exists and is configured correctly
SELECT 
  'Function Status' as check_type,
  routine_name,
  routine_type,
  security_type,
  CASE 
    WHEN routine_definition LIKE '%current_device_id%' THEN '✅ Has device ID logic'
    ELSE '❌ Missing device ID logic'
  END as device_logic_status,
  CASE 
    WHEN routine_definition LIKE '%INSERT INTO public.devices%' THEN '✅ Creates devices'
    ELSE '❌ Does not create devices'
  END as device_creation_status,
  CASE 
    WHEN routine_definition LIKE '%SECURITY DEFINER%' THEN '✅ SECURITY DEFINER (bypasses RLS)'
    ELSE '❌ Not SECURITY DEFINER'
  END as security_status
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name = 'get_user_devices';

-- Step 2: Check current devices in table
SELECT 
  'Devices Table' as check_type,
  COUNT(*) as total_devices,
  COUNT(DISTINCT device_id) as unique_devices,
  COUNT(DISTINCT profile_id) as devices_with_profiles
FROM public.devices;

-- Step 3: Show sample devices (if any exist)
SELECT 
  'Sample Devices' as check_type,
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

-- Step 4: Check RLS policies (should allow function to work)
SELECT 
  'RLS Policies' as check_type,
  policyname,
  cmd as command,
  CASE 
    WHEN qual LIKE '%x-device-id%' OR qual LIKE '%device_id%' THEN '✅ Uses device_id'
    ELSE '⚠️ May not use device_id'
  END as policy_status
FROM pg_policies
WHERE schemaname = 'public'
AND tablename = 'devices';

-- Step 5: Check function permissions
SELECT 
  'Function Permissions' as check_type,
  grantee as role,
  privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
AND routine_name = 'get_user_devices';

-- Step 6: Manual device creation test
-- Replace 'YOUR_DEVICE_ID_HERE' with your actual device ID
-- You can find it in browser: localStorage.getItem('deviceId')
-- Example: '56cc048d-d46a-433a-84e1-531ba146171b'
DO $$
DECLARE
  test_device_id TEXT := '56cc048d-d46a-433a-84e1-531ba146171b'; -- REPLACE WITH YOUR DEVICE ID
  test_profile_id UUID;
  device_exists BOOLEAN;
BEGIN
  -- Check if device exists
  SELECT EXISTS(SELECT 1 FROM public.devices WHERE device_id = test_device_id) INTO device_exists;
  
  IF device_exists THEN
    RAISE NOTICE 'Device % already exists in devices table', test_device_id;
  ELSE
    -- Get profile_id if exists
    SELECT id INTO test_profile_id
    FROM public.profiles
    WHERE device_id = test_device_id
    LIMIT 1;
    
    -- Create device manually
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
      updated_at = now();
    
    RAISE NOTICE '✅ Device % created/updated successfully', test_device_id;
    RAISE NOTICE 'Profile ID: %', test_profile_id;
  END IF;
  
  -- Verify device exists
  SELECT EXISTS(SELECT 1 FROM public.devices WHERE device_id = test_device_id) INTO device_exists;
  
  IF device_exists THEN
    RAISE NOTICE '✅ Device verified in devices table';
    
    -- Show device details
    RAISE NOTICE 'Device details:';
    PERFORM d.device_id, d.profile_id, d.last_seen_at
    FROM public.devices d
    WHERE d.device_id = test_device_id;
  ELSE
    RAISE NOTICE '❌ Device not found in devices table after creation';
  END IF;
END $$;

-- Step 7: Check if device was created
SELECT 
  'Device Verification' as check_type,
  device_id,
  profile_id,
  created_at,
  last_seen_at,
  request_count
FROM public.devices
WHERE device_id = '56cc048d-d46a-433a-84e1-531ba146171b' -- REPLACE WITH YOUR DEVICE ID
LIMIT 1;

-- ============================================
-- INTERPRETATION:
-- ============================================
-- 1. If function has ✅ for all checks, it's properly configured
-- 2. If device count is 0, devices aren't being created yet
-- 3. After running Step 6, check Step 7 to verify device was created
-- 4. The function should work when called from frontend with x-device-id header
-- ============================================
-- NEXT STEPS:
-- ============================================
-- 1. Run Step 6 with your actual device ID
-- 2. Clear browser localStorage: localStorage.removeItem('missing_rpc_functions')
-- 3. Refresh browser
-- 4. Check Network tab to verify x-device-id header is being sent
-- 5. Check browser console for any errors
-- ============================================

