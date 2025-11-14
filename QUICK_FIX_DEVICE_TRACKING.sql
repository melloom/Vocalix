-- ============================================
-- QUICK FIX: Update get_user_devices function
-- ============================================
-- This is a minimal fix that ensures the function:
-- 1. Always creates the current device
-- 2. Always returns the current device (even if no profile linked)
-- 3. Works even if no devices exist yet
-- ============================================

-- Update the function to ensure it always works
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
  device_created BOOLEAN := false;
BEGIN
  -- Get the current device ID from headers
  current_device_id := NULLIF(trim(
    (current_setting('request.headers', true)::json ->> 'x-device-id')
  ), '');
  
  -- If no device ID, return empty
  IF current_device_id IS NULL OR current_device_id = '' THEN
    RETURN;
  END IF;
  
  -- FIRST: Ensure current device exists in devices table (create if missing)
  -- This MUST happen before we try to query devices
  BEGIN
    INSERT INTO public.devices (device_id, profile_id, first_seen_at, last_seen_at, request_count)
    VALUES (
      current_device_id,
      COALESCE((SELECT id FROM public.profiles WHERE device_id = current_device_id LIMIT 1), NULL),
      COALESCE((SELECT first_seen_at FROM public.devices WHERE device_id = current_device_id LIMIT 1), now()),
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
      ),
      updated_at = now();
    
    device_created := true;
  EXCEPTION
    WHEN OTHERS THEN
      -- If insert fails, try to update existing device
      UPDATE public.devices
      SET 
        last_seen_at = now(),
        request_count = COALESCE(request_count, 0) + 1,
        updated_at = now()
      WHERE device_id = current_device_id;
  END;
  
  -- SECOND: Get all profile IDs associated with the current device
  -- Try to get profiles from all sources (with error handling)
  BEGIN
    -- First, get profiles from profiles table and devices table
    SELECT ARRAY_AGG(DISTINCT id) INTO user_profile_ids
    FROM (
      -- Profiles with matching device_id
      SELECT id FROM public.profiles WHERE device_id = current_device_id
      UNION
      -- Profiles linked via devices table
      SELECT profile_id FROM public.devices WHERE device_id = current_device_id AND profile_id IS NOT NULL
    ) base_profiles;
    
    -- Then, try to add profiles from profile_ids_for_request (if function exists)
    BEGIN
      SELECT ARRAY_AGG(DISTINCT id) INTO user_profile_ids
      FROM (
        SELECT id FROM public.profiles WHERE device_id = current_device_id
        UNION
        SELECT profile_id FROM public.devices WHERE device_id = current_device_id AND profile_id IS NOT NULL
        UNION
        SELECT id FROM public.profile_ids_for_request()
      ) all_profiles;
    EXCEPTION
      WHEN OTHERS THEN
        -- If profile_ids_for_request doesn't exist or fails, use base profiles only
        NULL;
    END;
  EXCEPTION
    WHEN OTHERS THEN
      -- If everything fails, set to empty array
      user_profile_ids := ARRAY[]::UUID[];
  END;
  
  -- Ensure user_profile_ids is initialized (not NULL)
  IF user_profile_ids IS NULL THEN
    user_profile_ids := ARRAY[]::UUID[];
  END IF;
  
  -- THIRD: Return devices - ALWAYS include current device first
  -- SECURITY DEFINER bypasses RLS, so we can read all matching devices
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
    -- ALWAYS return current device (this should always match after insert above)
    (d.device_id = current_device_id)
    -- OR devices linked to any of the user's profiles (for multi-device support via magic links)
    OR (user_profile_ids IS NOT NULL AND array_length(user_profile_ids, 1) > 0 AND d.profile_id = ANY(user_profile_ids))
  )
  ORDER BY 
    -- Current device always first
    CASE WHEN d.device_id = current_device_id THEN 0 ELSE 1 END,
    d.last_seen_at DESC NULLS LAST;
END;
$$;

-- Grant execute permission to all roles
GRANT EXECUTE ON FUNCTION public.get_user_devices() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_devices() TO anon;
GRANT EXECUTE ON FUNCTION public.get_user_devices() TO service_role;

-- Ensure function owner is postgres (bypasses RLS)
ALTER FUNCTION public.get_user_devices() OWNER TO postgres;

-- Verify function was updated
SELECT 
  'Function updated' as status,
  routine_name,
  routine_type,
  security_type
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name = 'get_user_devices';

-- ============================================
-- IMPORTANT: After running this, you MUST:
-- ============================================
-- 1. Open browser console (F12)
-- 2. Run: localStorage.removeItem('missing_rpc_functions');
-- 3. Refresh the page (hard refresh: Ctrl+Shift+R)
-- ============================================

