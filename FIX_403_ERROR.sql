-- ============================================
-- FIX 403 ERROR: Device Tracking Permissions
-- ============================================
-- This script fixes the 403 (Forbidden) error when calling get_user_devices()
-- The issue is RLS policies blocking access even though function is SECURITY DEFINER
-- ============================================

-- Step 1: Drop existing restrictive policies
DROP POLICY IF EXISTS "Devices service role only" ON public.devices;
DROP POLICY IF EXISTS "Users can view their profile devices" ON public.devices;
DROP POLICY IF EXISTS "Users can manage their devices" ON public.devices;

-- Step 2: Create a policy that allows viewing devices by device_id
-- This policy allows users to view their own device (matching x-device-id header)
CREATE POLICY "Users can view devices by device_id"
ON public.devices FOR SELECT
USING (
  -- Allow viewing if device_id matches the header
  device_id = COALESCE(
    NULLIF(trim((current_setting('request.headers', true)::json ->> 'x-device-id')), ''),
    ''
  )
  -- OR if profile_id matches a profile with the device_id
  OR profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = COALESCE(
      NULLIF(trim((current_setting('request.headers', true)::json ->> 'x-device-id')), ''),
      ''
    )
  )
  -- OR if profile_id is in devices table linked to the device_id
  OR profile_id IN (
    SELECT profile_id FROM public.devices
    WHERE device_id = COALESCE(
      NULLIF(trim((current_setting('request.headers', true)::json ->> 'x-device-id')), ''),
      ''
    )
    AND profile_id IS NOT NULL
  )
);

-- Step 3: Create a policy that allows inserting/updating devices by device_id
-- This policy allows users to create/update their own device
CREATE POLICY "Users can manage devices by device_id"
ON public.devices FOR ALL
USING (
  -- Allow if device_id matches the header
  device_id = COALESCE(
    NULLIF(trim((current_setting('request.headers', true)::json ->> 'x-device-id')), ''),
    ''
  )
  -- OR if profile_id matches a profile with the device_id
  OR profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = COALESCE(
      NULLIF(trim((current_setting('request.headers', true)::json ->> 'x-device-id')), ''),
      ''
    )
  )
)
WITH CHECK (
  -- Allow if device_id matches the header
  device_id = COALESCE(
    NULLIF(trim((current_setting('request.headers', true)::json ->> 'x-device-id')), ''),
    ''
  )
  -- OR if profile_id matches a profile with the device_id
  OR profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = COALESCE(
      NULLIF(trim((current_setting('request.headers', true)::json ->> 'x-device-id')), ''),
      ''
    )
  )
);

-- Step 4: Recreate the function with better error handling
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
  -- Get device ID from headers
  BEGIN
    current_device_id := NULLIF(trim(
      (current_setting('request.headers', true)::json ->> 'x-device-id')
    ), '');
  EXCEPTION
    WHEN OTHERS THEN
      current_device_id := NULL;
  END;
  
  -- If no device ID, return empty
  IF current_device_id IS NULL OR current_device_id = '' THEN
    RETURN;
  END IF;
  
  -- Get profile_id if exists
  BEGIN
    SELECT id INTO user_profile_ids[1]
    FROM public.profiles
    WHERE device_id = current_device_id
    LIMIT 1;
  EXCEPTION
    WHEN OTHERS THEN
      user_profile_ids[1] := NULL;
  END;
  
  -- Create or update device (SECURITY DEFINER should bypass RLS)
  BEGIN
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
      profile_id = COALESCE(devices.profile_id, EXCLUDED.profile_id);
  EXCEPTION
    WHEN OTHERS THEN
      -- If insert fails, try update
      BEGIN
        UPDATE public.devices
        SET 
          last_seen_at = now(),
          request_count = COALESCE(request_count, 0) + 1,
          updated_at = now()
        WHERE device_id = current_device_id;
      EXCEPTION
        WHEN OTHERS THEN
          -- If update also fails, continue (device might not exist yet)
          NULL;
      END;
  END;
  
  -- Get all profile IDs for multi-device support
  BEGIN
    SELECT ARRAY_AGG(DISTINCT id) INTO user_profile_ids
    FROM (
      SELECT id FROM public.profiles WHERE device_id = current_device_id
      UNION
      SELECT profile_id FROM public.devices 
      WHERE device_id = current_device_id 
      AND profile_id IS NOT NULL
    ) all_profiles;
    
    IF user_profile_ids IS NULL THEN
      user_profile_ids := ARRAY[]::UUID[];
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      user_profile_ids := ARRAY[]::UUID[];
  END;
  
  -- Return devices - SECURITY DEFINER bypasses RLS
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
    d.device_id = current_device_id
    OR (
      array_length(user_profile_ids, 1) > 0 
      AND d.profile_id = ANY(user_profile_ids)
    )
  )
  ORDER BY 
    CASE WHEN d.device_id = current_device_id THEN 0 ELSE 1 END,
    d.last_seen_at DESC NULLS LAST;
END;
$$;

-- Step 5: Grant permissions
GRANT EXECUTE ON FUNCTION public.get_user_devices() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_devices() TO anon;
GRANT EXECUTE ON FUNCTION public.get_user_devices() TO service_role;

-- Step 6: Ensure function owner is postgres (bypasses RLS)
ALTER FUNCTION public.get_user_devices() OWNER TO postgres;

-- Step 7: Verify policies
SELECT 
  'RLS Policies' as check_type,
  policyname,
  cmd as command
FROM pg_policies
WHERE schemaname = 'public'
AND tablename = 'devices';

-- Step 8: Verify function
SELECT 
  'Function Status' as check_type,
  routine_name,
  routine_type,
  security_type
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name = 'get_user_devices';

-- ============================================
-- IMPORTANT: After running this script:
-- ============================================
-- 1. Clear browser cache:
--    localStorage.removeItem('missing_rpc_functions');
-- 2. Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
-- 3. Check browser console - 403 errors should be gone
-- 4. Device should now appear in Settings
-- ============================================

