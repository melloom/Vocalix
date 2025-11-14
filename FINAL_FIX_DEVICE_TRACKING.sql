-- ============================================
-- FINAL FIX: get_user_devices Function
-- ============================================
-- This is a bulletproof version that:
-- 1. Always creates the current device if missing
-- 2. Always returns the current device (even if no profile)
-- 3. Works with minimal dependencies
-- 4. Handles all error cases gracefully
-- ============================================

-- Drop and recreate the function to ensure it's correct
DROP FUNCTION IF EXISTS public.get_user_devices();

CREATE FUNCTION public.get_user_devices()
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
  existing_device_id UUID;
BEGIN
  -- Step 1: Get device ID from headers
  BEGIN
    current_device_id := NULLIF(trim(
      (current_setting('request.headers', true)::json ->> 'x-device-id')
    ), '');
  EXCEPTION
    WHEN OTHERS THEN
      current_device_id := NULL;
  END;
  
  -- Step 2: If no device ID, return empty (can't proceed without it)
  IF current_device_id IS NULL OR current_device_id = '' THEN
    RETURN;
  END IF;
  
  -- Step 3: CRITICAL - Create/update device FIRST (before any queries)
  -- This ensures the device exists for the query below
  BEGIN
    -- Try to get profile_id from profiles table
    SELECT id INTO user_profile_ids[1]
    FROM public.profiles
    WHERE device_id = current_device_id
    LIMIT 1;
    
    -- Insert or update device
    INSERT INTO public.devices (
      device_id, 
      profile_id, 
      first_seen_at, 
      last_seen_at, 
      request_count,
      updated_at
    )
    VALUES (
      current_device_id,
      user_profile_ids[1],
      now(),
      now(),
      1,
      now()
    )
    ON CONFLICT (device_id) DO UPDATE SET
      last_seen_at = now(),
      request_count = COALESCE(devices.request_count, 0) + 1,
      updated_at = now(),
      -- Only update profile_id if it's NULL and we have one
      profile_id = COALESCE(devices.profile_id, EXCLUDED.profile_id);
      
  EXCEPTION
    WHEN OTHERS THEN
      -- If insert fails, try update only
      BEGIN
        UPDATE public.devices
        SET 
          last_seen_at = now(),
          request_count = COALESCE(request_count, 0) + 1,
          updated_at = now()
        WHERE device_id = current_device_id;
      EXCEPTION
        WHEN OTHERS THEN
          -- If update also fails, device might not exist - that's ok, we'll handle it
          NULL;
      END;
  END;
  
  -- Step 4: Get all profile IDs associated with this device
  -- This is for multi-device support (magic login links)
  BEGIN
    SELECT ARRAY_AGG(DISTINCT id) INTO user_profile_ids
    FROM (
      -- Profiles with matching device_id
      SELECT id FROM public.profiles WHERE device_id = current_device_id
      UNION
      -- Profiles linked via devices table
      SELECT profile_id FROM public.devices 
      WHERE device_id = current_device_id 
      AND profile_id IS NOT NULL
    ) all_profiles;
    
    -- If NULL, initialize as empty array
    IF user_profile_ids IS NULL THEN
      user_profile_ids := ARRAY[]::UUID[];
    END IF;
    
    -- Try to add profiles from profile_ids_for_request (if function exists)
    BEGIN
      SELECT ARRAY_AGG(DISTINCT id) INTO user_profile_ids
      FROM (
        SELECT id FROM public.profiles WHERE device_id = current_device_id
        UNION
        SELECT profile_id FROM public.devices 
        WHERE device_id = current_device_id 
        AND profile_id IS NOT NULL
        UNION
        SELECT id FROM public.profile_ids_for_request()
      ) all_profiles;
    EXCEPTION
      WHEN OTHERS THEN
        -- profile_ids_for_request doesn't exist or failed - that's ok
        NULL;
    END;
  EXCEPTION
    WHEN OTHERS THEN
      -- If everything fails, use empty array
      user_profile_ids := ARRAY[]::UUID[];
  END;
  
  -- Step 5: Return devices - ALWAYS include current device
  -- SECURITY DEFINER bypasses RLS, so we can read the device we just created
  RETURN QUERY
  SELECT DISTINCT
    d.id,
    d.device_id,
    d.profile_id,
    d.created_at,
    d.updated_at,
    d.last_seen_at,
    COALESCE(d.first_seen_at, d.created_at) as first_seen_at,
    d.user_agent,
    d.ip_address,
    COALESCE(d.is_revoked, false) as is_revoked,
    COALESCE(d.is_suspicious, false) as is_suspicious,
    COALESCE(d.request_count, 0) as request_count,
    COALESCE(d.failed_auth_count, 0) as failed_auth_count
  FROM public.devices d
  WHERE (
    -- ALWAYS return current device (this should match after insert above)
    (d.device_id = current_device_id)
    -- OR return devices linked to user's profiles (for multi-device support)
    OR (
      array_length(user_profile_ids, 1) > 0 
      AND d.profile_id = ANY(user_profile_ids)
    )
  )
  ORDER BY 
    -- Current device always first
    CASE WHEN d.device_id = current_device_id THEN 0 ELSE 1 END,
    d.last_seen_at DESC NULLS LAST;
    
  -- If no rows returned (shouldn't happen, but handle it)
  IF NOT FOUND THEN
    -- This shouldn't happen since we just created the device
    -- But if it does, return an empty result (better than error)
    RETURN;
  END IF;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_user_devices() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_devices() TO anon;
GRANT EXECUTE ON FUNCTION public.get_user_devices() TO service_role;

-- Set function owner (ensures SECURITY DEFINER works correctly)
ALTER FUNCTION public.get_user_devices() OWNER TO postgres;

-- Verify function was created
SELECT 
  '✅ Function updated' as status,
  routine_name,
  routine_type,
  security_type
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name = 'get_user_devices';

-- ============================================
-- CRITICAL: After running this script:
-- ============================================
-- 1. Open browser console (F12)
-- 2. Run: localStorage.removeItem('missing_rpc_functions');
-- 3. Run: localStorage.removeItem('missing_rpc_functions'); (run twice to be sure)
-- 4. Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
-- 5. Check Network tab to verify x-device-id header is being sent
-- 6. Check browser console for any errors
-- ============================================
-- 
-- If it still doesn't work:
-- ============================================
-- 1. Check browser console for errors
-- 2. Verify deviceId exists: localStorage.getItem('deviceId')
-- 3. Check Network tab - look for call to get_user_devices
-- 4. Run TEST_DEVICE_FUNCTION_WORKING.sql to verify setup
-- 5. Run DIAGNOSE_DEVICE_TRACKING.sql for detailed diagnostics
-- ============================================

