-- ============================================================================
-- Fix Device Detection and Suspicious Flag
-- ============================================================================
-- This migration:
-- 1. Improves suspicious flag logic to be less aggressive
-- 2. Adds function to clear suspicious flag for legitimate devices
-- 3. Ensures user_agent is properly stored
-- ============================================================================

-- ============================================================================
-- 1. FIX SUSPICIOUS FLAG LOGIC (Less Aggressive)
-- ============================================================================

-- Update check_device_suspicious to be less aggressive
CREATE OR REPLACE FUNCTION public.check_device_suspicious(
  p_device_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  device_record public.devices%ROWTYPE;
  is_suspicious_flag BOOLEAN := false;
  requests_in_last_hour INTEGER;
BEGIN
  SELECT * INTO device_record
  FROM public.devices
  WHERE device_id = p_device_id;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Check if device is revoked (always suspicious)
  IF device_record.is_revoked THEN
    RETURN true;
  END IF;
  
  -- Calculate requests in last hour (not total request_count)
  SELECT COUNT(*) INTO requests_in_last_hour
  FROM public.security_audit_log
  WHERE device_id = p_device_id
    AND created_at > now() - interval '1 hour';
  
  -- Only mark as suspicious if:
  -- 1. 10+ failed auth attempts in last hour (increased from 5)
  -- 2. 5000+ requests in last hour (increased from 1000, and now checking actual requests not total count)
  -- 3. Device is revoked (already checked above)
  
  IF device_record.failed_auth_count >= 10 AND 
     device_record.last_failed_auth_at IS NOT NULL AND
     device_record.last_failed_auth_at > now() - interval '1 hour' THEN
    is_suspicious_flag := true;
  END IF;
  
  -- Check for unusual request patterns (5000+ requests in last hour)
  IF requests_in_last_hour >= 5000 THEN
    is_suspicious_flag := true;
  END IF;
  
  -- If device was previously suspicious but no longer meets criteria, clear it
  IF device_record.is_suspicious AND NOT is_suspicious_flag THEN
    UPDATE public.devices
    SET is_suspicious = false
    WHERE device_id = p_device_id;
    
    -- Log that suspicious flag was cleared
    PERFORM public.log_security_event(
      p_device_id,
      'device_suspicious_cleared',
      device_record.profile_id,
      jsonb_build_object(
        'reason', 'No longer meets suspicious criteria',
        'failed_auth_count', device_record.failed_auth_count,
        'requests_in_last_hour', requests_in_last_hour
      ),
      NULL,
      NULL,
      'info'
    );
  END IF;
  
  -- Update suspicious flag if it changed
  IF is_suspicious_flag != device_record.is_suspicious THEN
    UPDATE public.devices
    SET is_suspicious = is_suspicious_flag
    WHERE device_id = p_device_id;
    
    -- Log the suspicious activity (only if marking as suspicious)
    IF is_suspicious_flag THEN
      PERFORM public.log_security_event(
        p_device_id,
        'device_marked_suspicious',
        device_record.profile_id,
        jsonb_build_object(
          'failed_auth_count', device_record.failed_auth_count,
          'requests_in_last_hour', requests_in_last_hour,
          'total_request_count', device_record.request_count
        ),
        NULL,
        NULL,
        'warning'
      );
    END IF;
  END IF;
  
  RETURN is_suspicious_flag;
END;
$$;

-- ============================================================================
-- 2. ADD FUNCTION TO CLEAR SUSPICIOUS FLAG
-- ============================================================================

-- Function to manually clear suspicious flag for legitimate devices
CREATE OR REPLACE FUNCTION public.clear_device_suspicious_flag(
  p_device_id TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  device_record public.devices%ROWTYPE;
BEGIN
  SELECT * INTO device_record
  FROM public.devices
  WHERE device_id = p_device_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Device not found';
  END IF;
  
  -- Clear suspicious flag
  UPDATE public.devices
  SET is_suspicious = false
  WHERE device_id = p_device_id;
  
  -- Log the action
  PERFORM public.log_security_event(
    p_device_id,
    'device_suspicious_cleared',
    device_record.profile_id,
    jsonb_build_object(
      'reason', 'Manually cleared by user',
      'cleared_at', now()
    ),
    NULL,
    NULL,
    'info'
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.clear_device_suspicious_flag(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_device_suspicious_flag(TEXT) TO anon;

-- ============================================================================
-- 3. ENSURE USER_AGENT IS STORED IN update_device_activity
-- ============================================================================

-- Update the update_device_activity function to ensure user_agent is stored
CREATE OR REPLACE FUNCTION public.update_device_activity(
  p_device_id TEXT,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Get user agent from headers if not provided
  -- Try both standard 'user-agent' header and custom 'x-user-agent' header
  IF p_user_agent IS NULL THEN
    BEGIN
      -- First try standard user-agent header (from browser)
      p_user_agent := current_setting('request.headers', true)::json->>'user-agent';
      -- If not found, try custom x-user-agent header (from client)
      IF p_user_agent IS NULL OR p_user_agent = '' THEN
        p_user_agent := current_setting('request.headers', true)::json->>'x-user-agent';
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        -- If standard header fails, try custom header
        BEGIN
          p_user_agent := current_setting('request.headers', true)::json->>'x-user-agent';
        EXCEPTION
          WHEN OTHERS THEN
            p_user_agent := NULL;
        END;
    END;
  END IF;
  
  -- Get IP address from headers if not provided
  IF p_ip_address IS NULL THEN
    BEGIN
      p_ip_address := current_setting('request.headers', true)::json->>'x-forwarded-for';
      IF p_ip_address IS NULL THEN
        p_ip_address := current_setting('request.headers', true)::json->>'x-real-ip';
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        p_ip_address := NULL;
    END;
  END IF;
  
  -- Update or insert device
  INSERT INTO public.devices (
    device_id, 
    ip_address, 
    user_agent, 
    last_seen_at, 
    request_count,
    first_seen_at
  )
  VALUES (
    p_device_id, 
    p_ip_address, 
    p_user_agent, 
    now(), 
    1,
    now()
  )
  ON CONFLICT (device_id) DO UPDATE SET
    last_seen_at = now(),
    request_count = COALESCE(devices.request_count, 0) + 1,
    -- Always update user_agent if provided (to keep it current)
    user_agent = COALESCE(p_user_agent, devices.user_agent),
    -- Update IP if provided
    ip_address = COALESCE(p_ip_address, devices.ip_address),
    updated_at = now();
    
  -- Check if device should be marked suspicious (but don't block)
  PERFORM public.check_device_suspicious(p_device_id);
END;
$$;

-- ============================================================================
-- 4. CLEAR EXISTING SUSPICIOUS FLAGS FOR DEVICES WITH LOW ACTIVITY
-- ============================================================================

-- Clear suspicious flags for devices that don't meet the new stricter criteria
UPDATE public.devices
SET is_suspicious = false
WHERE is_suspicious = true
  AND is_revoked = false
  AND (
    -- Devices with less than 10 failed auth attempts
    (failed_auth_count < 10 OR failed_auth_count IS NULL)
    AND
    -- Devices with reasonable request counts (less than 1000 total)
    (request_count < 1000 OR request_count IS NULL)
    AND
    -- Devices that haven't failed auth recently
    (last_failed_auth_at IS NULL OR last_failed_auth_at < now() - interval '1 hour')
  );

-- ============================================================================
-- 5. FIX get_user_devices TO STORE USER_AGENT
-- ============================================================================

-- Update get_user_devices to also store user_agent when creating/updating devices
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
  existing_profile_id UUID;
  current_user_agent TEXT;
  current_ip_address INET;
BEGIN
  -- Step 1: Get device ID from headers (with error handling)
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
  
  -- Step 2.5: Get user_agent and IP from headers
  -- Try both standard 'user-agent' header and custom 'x-user-agent' header
  BEGIN
    -- First try standard user-agent header (from browser)
    current_user_agent := current_setting('request.headers', true)::json->>'user-agent';
    -- If not found, try custom x-user-agent header (from client)
    IF current_user_agent IS NULL OR current_user_agent = '' THEN
      current_user_agent := current_setting('request.headers', true)::json->>'x-user-agent';
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      -- If standard header fails, try custom header
      BEGIN
        current_user_agent := current_setting('request.headers', true)::json->>'x-user-agent';
      EXCEPTION
        WHEN OTHERS THEN
          current_user_agent := NULL;
      END;
  END;
  
  BEGIN
    current_ip_address := (current_setting('request.headers', true)::json->>'x-forwarded-for')::INET;
  EXCEPTION
    WHEN OTHERS THEN
      BEGIN
        current_ip_address := (current_setting('request.headers', true)::json->>'x-real-ip')::INET;
      EXCEPTION
        WHEN OTHERS THEN
          current_ip_address := NULL;
      END;
  END;
  
  -- Step 3: CRITICAL - Create/update device FIRST (before any queries)
  -- This ensures the device exists for subsequent queries
  BEGIN
    -- Try to get profile_id from profiles table
    SELECT id INTO existing_profile_id
    FROM public.profiles
    WHERE device_id = current_device_id
    LIMIT 1;
    
    -- Insert or update device WITH user_agent and ip_address
    INSERT INTO public.devices (
      device_id, 
      profile_id, 
      first_seen_at, 
      last_seen_at, 
      request_count,
      user_agent,
      ip_address,
      updated_at
    )
    VALUES (
      current_device_id,
      existing_profile_id,
      now(),
      now(),
      1,
      current_user_agent,
      current_ip_address,
      now()
    )
    ON CONFLICT (device_id) DO UPDATE SET
      last_seen_at = now(),
      request_count = COALESCE(devices.request_count, 0) + 1,
      updated_at = now(),
      -- Always update user_agent if we have one (prioritize new value over old)
      user_agent = CASE 
        WHEN current_user_agent IS NOT NULL AND current_user_agent != '' 
        THEN current_user_agent 
        ELSE devices.user_agent 
      END,
      -- Update IP if provided
      ip_address = COALESCE(current_ip_address, devices.ip_address),
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
          updated_at = now(),
          -- Update user_agent if we have one (prioritize new value)
          user_agent = CASE 
            WHEN current_user_agent IS NOT NULL AND current_user_agent != '' 
            THEN current_user_agent 
            ELSE devices.user_agent 
          END,
          ip_address = COALESCE(current_ip_address, devices.ip_address),
          profile_id = COALESCE(
            devices.profile_id,
            existing_profile_id,
            (SELECT id FROM public.profiles WHERE device_id = current_device_id LIMIT 1)
          )
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
    -- First, get profiles from profiles table and devices table
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
    -- This supports magic login links
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
    
  -- If no rows returned (shouldn't happen, but handle it gracefully)
  IF NOT FOUND THEN
    -- This shouldn't happen since we just created the device
    -- But if it does, return an empty result (better than error)
    RETURN;
  END IF;
END;
$$;

-- ============================================================================
-- 6. FORCE UPDATE CURRENT DEVICE'S USER_AGENT (One-time fix)
-- ============================================================================

-- Create a function that will update the current device's user_agent immediately
-- This can be called from the client to update existing devices
-- Takes user_agent as parameter (more reliable than reading from headers)
CREATE OR REPLACE FUNCTION public.update_current_device_user_agent(
  p_user_agent TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_device_id TEXT;
  current_user_agent TEXT;
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
  
  IF current_device_id IS NULL OR current_device_id = '' THEN
    RETURN;
  END IF;
  
  -- Use provided user_agent, or try to get from headers
  current_user_agent := p_user_agent;
  
  IF current_user_agent IS NULL OR current_user_agent = '' THEN
    -- Try to get from headers as fallback
    BEGIN
      current_user_agent := current_setting('request.headers', true)::json->>'user-agent';
      IF current_user_agent IS NULL OR current_user_agent = '' THEN
        current_user_agent := current_setting('request.headers', true)::json->>'x-user-agent';
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        BEGIN
          current_user_agent := current_setting('request.headers', true)::json->>'x-user-agent';
        EXCEPTION
          WHEN OTHERS THEN
            current_user_agent := NULL;
        END;
    END;
  END IF;
  
  -- Update the device's user_agent if we have one
  IF current_user_agent IS NOT NULL AND current_user_agent != '' THEN
    UPDATE public.devices
    SET user_agent = current_user_agent,
        updated_at = now()
    WHERE device_id = current_device_id;
  END IF;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.update_current_device_user_agent(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_current_device_user_agent(TEXT) TO anon;

-- ============================================================================
-- Notes
-- ============================================================================
-- After running this migration:
-- 1. Existing suspicious flags will be cleared for legitimate devices
-- 2. New suspicious detection is less aggressive (10 failed auths, 5000 requests/hour)
-- 3. User agents will be properly stored going forward in BOTH functions
-- 4. Users can manually clear suspicious flags via clear_device_suspicious_flag()
-- 5. get_user_devices() now stores user_agent and ip_address from headers
-- 
-- IMPORTANT: After migration, refresh the Settings page to see updated browser name.
-- The user_agent will be captured on the next request to get_user_devices().
-- ============================================================================

