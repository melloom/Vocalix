-- RPC function to get all devices for the current user
-- This allows users to see all devices associated with their profile

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
  IF current_device_id IS NOT NULL THEN
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
  END IF;
  
  -- Return all devices for these profiles, or devices matching the current device_id
  -- SECURITY DEFINER bypasses RLS, so we can read all matching devices
  -- Use DISTINCT to avoid duplicates
  -- Wrap in subquery to allow ORDER BY with expressions not in SELECT list
  RETURN QUERY
  SELECT 
    distinct_devices.id,
    distinct_devices.device_id,
    distinct_devices.profile_id,
    distinct_devices.created_at,
    distinct_devices.updated_at,
    distinct_devices.last_seen_at,
    distinct_devices.first_seen_at,
    distinct_devices.user_agent,
    distinct_devices.ip_address,
    distinct_devices.is_revoked,
    distinct_devices.is_suspicious,
    distinct_devices.request_count,
    distinct_devices.failed_auth_count
  FROM (
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
      -- Always return current device if it exists (this should always match)
      (current_device_id IS NOT NULL AND d.device_id = current_device_id)
      -- OR devices linked to any of the user's profiles (for multi-device support via magic links)
      OR (user_profile_ids IS NOT NULL AND array_length(user_profile_ids, 1) > 0 AND d.profile_id = ANY(user_profile_ids))
    )
  ) distinct_devices
  ORDER BY 
    -- Current device first
    CASE WHEN distinct_devices.device_id = current_device_id THEN 0 ELSE 1 END,
    distinct_devices.last_seen_at DESC NULLS LAST;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_user_devices() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_devices() TO anon;
GRANT EXECUTE ON FUNCTION public.get_user_devices() TO service_role;

-- Also grant execute on other device functions
GRANT EXECUTE ON FUNCTION public.update_device_activity(TEXT, INET, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_device_activity(TEXT, INET, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.update_device_activity(TEXT, INET, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_device(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_device(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.revoke_device(TEXT, TEXT) TO service_role;

-- Ensure function owner can bypass RLS (functions owned by postgres should already have this)
ALTER FUNCTION public.get_user_devices() OWNER TO postgres;
ALTER FUNCTION public.update_device_activity(TEXT, INET, TEXT) OWNER TO postgres;
ALTER FUNCTION public.revoke_device(TEXT, TEXT) OWNER TO postgres;

