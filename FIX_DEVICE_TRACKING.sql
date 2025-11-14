-- ============================================
-- Fix Device Tracking - Run this in Supabase Dashboard SQL Editor
-- ============================================
-- This script will:
-- 1. Check if migrations have been run
-- 2. Create/update the get_user_devices function to always return the current device
-- 3. Ensure device tracking works even if no profile is linked yet
-- ============================================

-- Step 1: Check if devices table exists (this will show an error if it doesn't exist)
-- If you get an error here, run COMBINED_MIGRATION.sql first
SELECT 1 FROM public.devices LIMIT 1;

-- Step 2: Ensure get_user_devices function exists and works correctly
CREATE OR REPLACE FUNCTION public.get_user_devices()
RETURNS TABLE (
  id UUID,
  device_id TEXT,
  profile_id UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ,
  user_agent TEXT,
  ip_address INET,
  is_revoked BOOLEAN,
  is_suspicious BOOLEAN,
  request_count INTEGER,
  failed_auth_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_profile_ids UUID[];
  current_device_id TEXT;
BEGIN
  -- Get the current device ID from headers
  current_device_id := NULLIF(trim(
    (current_setting('request.headers', true)::json ->> 'x-device-id')
  ), '');
  
  -- If no device ID, return empty
  IF current_device_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Get all profile IDs associated with the current device
  -- This includes profiles with matching device_id and profiles linked via devices table
  BEGIN
    SELECT ARRAY_AGG(DISTINCT id) INTO user_profile_ids
    FROM (
      -- Profiles with matching device_id
      SELECT id FROM public.profiles WHERE device_id = current_device_id
      UNION
      -- Profiles linked via devices table
      SELECT profile_id FROM public.devices WHERE device_id = current_device_id AND profile_id IS NOT NULL
      UNION
      -- Also get from profile_ids_for_request for magic login links (if function exists)
      SELECT id FROM public.profile_ids_for_request()
    ) all_profiles;
  EXCEPTION
    WHEN OTHERS THEN
      -- If profile_ids_for_request doesn't exist, just use the other sources
      SELECT ARRAY_AGG(DISTINCT id) INTO user_profile_ids
      FROM (
        SELECT id FROM public.profiles WHERE device_id = current_device_id
        UNION
        SELECT profile_id FROM public.devices WHERE device_id = current_device_id AND profile_id IS NOT NULL
      ) all_profiles;
  END;
  
  -- Ensure current device exists in devices table (create if missing)
  -- Use SECURITY DEFINER to bypass RLS for this operation
  BEGIN
    -- Upsert device (create if missing, update if exists)
    INSERT INTO public.devices (device_id, profile_id, first_seen_at, last_seen_at, request_count)
    VALUES (
      current_device_id,
      COALESCE((SELECT id FROM public.profiles WHERE device_id = current_device_id LIMIT 1), NULL),
      now(),
      now(),
      1
    )
    ON CONFLICT (device_id) DO UPDATE SET
      last_seen_at = now(),
      request_count = COALESCE(devices.request_count, 0) + 1,
      profile_id = COALESCE(
        devices.profile_id,
        EXCLUDED.profile_id,
        (SELECT id FROM public.profiles WHERE device_id = current_device_id LIMIT 1)
      );
  EXCEPTION
    WHEN OTHERS THEN
      -- If insert fails, continue - device might already exist
      NULL;
  END;
  
  -- Return all devices for these profiles, or devices matching the current device_id
  -- SECURITY DEFINER bypasses RLS, so we can read all matching devices
  -- Use DISTINCT to avoid duplicates
  RETURN QUERY
  SELECT DISTINCT
    d.id,
    d.device_id,
    d.profile_id,
    d.created_at,
    d.updated_at,
    d.last_seen_at,
    d.first_seen_at,
    d.user_agent,
    d.ip_address,
    COALESCE(d.is_revoked, false) as is_revoked,
    COALESCE(d.is_suspicious, false) as is_suspicious,
    COALESCE(d.request_count, 0) as request_count,
    COALESCE(d.failed_auth_count, 0) as failed_auth_count
  FROM public.devices d
  WHERE (
    -- Always return current device if it exists (this should always match after insert above)
    (d.device_id = current_device_id)
    -- OR devices linked to any of the user's profiles (for multi-device support via magic links)
    OR (user_profile_ids IS NOT NULL AND array_length(user_profile_ids, 1) > 0 AND d.profile_id = ANY(user_profile_ids))
  )
  ORDER BY 
    -- Current device first
    CASE WHEN d.device_id = current_device_id THEN 0 ELSE 1 END,
    d.last_seen_at DESC NULLS LAST;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_user_devices() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_devices() TO anon;
GRANT EXECUTE ON FUNCTION public.get_user_devices() TO service_role;

-- Ensure function owner can bypass RLS
ALTER FUNCTION public.get_user_devices() OWNER TO postgres;

-- Step 3: Verify function exists and show details
SELECT 
  routine_name,
  routine_type,
  security_type,
  routine_definition LIKE '%current_device_id%' as has_device_id_logic,
  routine_definition LIKE '%INSERT INTO public.devices%' as creates_devices
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name = 'get_user_devices';

-- Step 4: Check if devices table has any devices
SELECT 
  'Device count' as check_type,
  COUNT(*) as total_devices,
  COUNT(DISTINCT device_id) as unique_devices
FROM public.devices;

-- Step 5: Show sample devices (if any)
SELECT 
  device_id,
  profile_id,
  created_at,
  last_seen_at,
  request_count
FROM public.devices
ORDER BY last_seen_at DESC NULLS LAST
LIMIT 5;

-- ✅ Device tracking fix applied!
-- 
-- NEXT STEPS:
-- 1. Check the results above - verify the function has the correct logic
-- 2. If device count is 0, devices aren't being created yet (they will be on next function call)
-- 3. Open your browser and:
--    a. Open browser console (F12)
--    b. Run: localStorage.removeItem('missing_rpc_functions');
--    c. Refresh the page
-- 4. Check the Network tab to verify the x-device-id header is being sent
-- 5. The function should now work and create/return your device
--
-- If you still see "No devices found":
-- - Check browser console for errors
-- - Verify deviceId exists: localStorage.getItem('deviceId')
-- - Check Network tab to see if get_user_devices is being called
-- - Run DIAGNOSE_DEVICE_TRACKING.sql for more detailed diagnostics

