-- ============================================================================
-- Add IP-based Geolocation Tracking and Device Trust Scoring
-- ============================================================================
-- This migration adds:
-- 1. IP-based geolocation tracking (country, region, city, coordinates)
-- 2. Device trust scoring system (0-100 scale)
-- 3. Functions to calculate and update trust scores
-- 4. Integration with existing suspicious device detection
-- ============================================================================

-- ============================================================================
-- 1. ADD GEOLOCATION COLUMNS TO DEVICES TABLE
-- ============================================================================

ALTER TABLE public.devices
ADD COLUMN IF NOT EXISTS country_code TEXT,
ADD COLUMN IF NOT EXISTS country_name TEXT,
ADD COLUMN IF NOT EXISTS region TEXT,
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7),
ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7),
ADD COLUMN IF NOT EXISTS timezone TEXT,
ADD COLUMN IF NOT EXISTS isp TEXT,
ADD COLUMN IF NOT EXISTS geolocation_updated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS geolocation_source TEXT DEFAULT 'manual';

-- Add index for geolocation queries
CREATE INDEX IF NOT EXISTS devices_country_idx ON public.devices(country_code);
CREATE INDEX IF NOT EXISTS devices_location_idx ON public.devices(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- ============================================================================
-- 2. ADD TRUST SCORING COLUMNS TO DEVICES TABLE
-- ============================================================================

ALTER TABLE public.devices
ADD COLUMN IF NOT EXISTS trust_score INTEGER DEFAULT 50 CHECK (trust_score >= 0 AND trust_score <= 100),
ADD COLUMN IF NOT EXISTS trust_score_updated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS trust_score_factors JSONB DEFAULT '{}'::jsonb;

-- Add index for trust score queries
CREATE INDEX IF NOT EXISTS devices_trust_score_idx ON public.devices(trust_score DESC);
CREATE INDEX IF NOT EXISTS devices_low_trust_idx ON public.devices(trust_score) WHERE trust_score < 30;

-- ============================================================================
-- 3. CREATE GEOLOCATION LOOKUP FUNCTION
-- ============================================================================
-- This function can be extended to integrate with external geolocation APIs
-- For now, it provides a structure that can be populated manually or via API

CREATE OR REPLACE FUNCTION public.lookup_ip_geolocation(
  p_ip_address INET
)
RETURNS TABLE (
  country_code TEXT,
  country_name TEXT,
  region TEXT,
  city TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  timezone TEXT,
  isp TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- For now, return NULL values - this can be extended to call external APIs
  -- Example: Use Supabase Edge Functions or pg_net extension to call IP geolocation services
  -- Services like ipapi.co, ip-api.com, or MaxMind GeoIP2 can be integrated
BEGIN
  -- Return empty result for now
  -- This function can be extended to:
  -- 1. Call external geolocation API via HTTP
  -- 2. Use MaxMind GeoIP2 database (if installed)
  -- 3. Query a local geolocation cache table
  
  RETURN QUERY
  SELECT 
    NULL::TEXT as country_code,
    NULL::TEXT as country_name,
    NULL::TEXT as region,
    NULL::TEXT as city,
    NULL::NUMERIC as latitude,
    NULL::NUMERIC as longitude,
    NULL::TEXT as timezone,
    NULL::TEXT as isp;
END;
$$;

-- ============================================================================
-- 4. CREATE FUNCTION TO UPDATE DEVICE GEOLOCATION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_device_geolocation(
  p_device_id TEXT,
  p_ip_address INET DEFAULT NULL,
  p_country_code TEXT DEFAULT NULL,
  p_country_name TEXT DEFAULT NULL,
  p_region TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_latitude NUMERIC DEFAULT NULL,
  p_longitude NUMERIC DEFAULT NULL,
  p_timezone TEXT DEFAULT NULL,
  p_isp TEXT DEFAULT NULL,
  p_auto_lookup BOOLEAN DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  device_ip INET;
  geo_result RECORD;
BEGIN
  -- Get IP address from device if not provided
  IF p_ip_address IS NULL THEN
    SELECT ip_address INTO device_ip
    FROM public.devices
    WHERE device_id = p_device_id;
  ELSE
    device_ip := p_ip_address;
  END IF;
  
  -- If auto_lookup is enabled and we have an IP but no geolocation data
  IF p_auto_lookup AND device_ip IS NOT NULL AND p_country_code IS NULL THEN
    -- Try to lookup geolocation (this will be extended with actual API calls)
    SELECT * INTO geo_result
    FROM public.lookup_ip_geolocation(device_ip)
    LIMIT 1;
    
    -- Use looked up values if available
    IF geo_result.country_code IS NOT NULL THEN
      UPDATE public.devices
      SET 
        country_code = geo_result.country_code,
        country_name = geo_result.country_name,
        region = geo_result.region,
        city = geo_result.city,
        latitude = geo_result.latitude,
        longitude = geo_result.longitude,
        timezone = geo_result.timezone,
        isp = geo_result.isp,
        geolocation_updated_at = now(),
        geolocation_source = 'auto_lookup'
      WHERE device_id = p_device_id;
      RETURN;
    END IF;
  END IF;
  
  -- Update with provided values (or keep existing if NULL)
  UPDATE public.devices
  SET 
    country_code = COALESCE(p_country_code, country_code),
    country_name = COALESCE(p_country_name, country_name),
    region = COALESCE(p_region, region),
    city = COALESCE(p_city, city),
    latitude = COALESCE(p_latitude, latitude),
    longitude = COALESCE(p_longitude, longitude),
    timezone = COALESCE(p_timezone, timezone),
    isp = COALESCE(p_isp, isp),
    geolocation_updated_at = CASE 
      WHEN p_country_code IS NOT NULL OR p_latitude IS NOT NULL THEN now()
      ELSE geolocation_updated_at
    END,
    geolocation_source = CASE 
      WHEN p_country_code IS NOT NULL OR p_latitude IS NOT NULL THEN 'manual'
      ELSE geolocation_source
    END
  WHERE device_id = p_device_id;
END;
$$;

-- ============================================================================
-- 5. CREATE FUNCTION TO CALCULATE DEVICE TRUST SCORE
-- ============================================================================
-- Trust score factors (0-100):
-- - Device age: +0 to +30 points (older = more trusted)
-- - Failed auth attempts: -0 to -40 points (more failures = less trusted)
-- - Request consistency: +0 to +20 points (consistent patterns = more trusted)
-- - Geolocation consistency: +0 to +15 points (same location = more trusted)
-- - Suspicious flags: -0 to -30 points (suspicious = less trusted)
-- - Request volume: +0 to +10 points (reasonable volume = more trusted)
-- - Base score: 50 points

CREATE OR REPLACE FUNCTION public.calculate_device_trust_score(
  p_device_id TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  device_record public.devices%ROWTYPE;
  trust_score INTEGER := 50; -- Base score
  device_age_days INTEGER;
  location_consistency_score INTEGER := 0;
  request_consistency_score INTEGER := 0;
  recent_requests_count INTEGER;
  unique_locations_count INTEGER;
  trust_factors JSONB := '{}'::jsonb;
BEGIN
  -- Get device record
  SELECT * INTO device_record
  FROM public.devices
  WHERE device_id = p_device_id;
  
  IF NOT FOUND THEN
    RETURN 0; -- Unknown device = no trust
  END IF;
  
  -- Factor 1: Device age (0-30 points)
  -- Older devices are more trusted
  device_age_days := EXTRACT(EPOCH FROM (now() - device_record.first_seen_at)) / 86400;
  IF device_age_days >= 90 THEN
    trust_score := trust_score + 30;
  ELSIF device_age_days >= 30 THEN
    trust_score := trust_score + 20;
  ELSIF device_age_days >= 7 THEN
    trust_score := trust_score + 10;
  ELSIF device_age_days >= 1 THEN
    trust_score := trust_score + 5;
  END IF;
  trust_factors := trust_factors || jsonb_build_object('device_age_days', device_age_days, 'age_score', LEAST(30, GREATEST(0, trust_score - 50)));
  
  -- Factor 2: Failed auth attempts (-0 to -40 points)
  -- More failures = less trusted
  IF device_record.failed_auth_count >= 20 THEN
    trust_score := trust_score - 40;
  ELSIF device_record.failed_auth_count >= 10 THEN
    trust_score := trust_score - 25;
  ELSIF device_record.failed_auth_count >= 5 THEN
    trust_score := trust_score - 15;
  ELSIF device_record.failed_auth_count >= 1 THEN
    trust_score := trust_score - 5;
  END IF;
  trust_factors := trust_factors || jsonb_build_object('failed_auth_count', device_record.failed_auth_count, 'auth_penalty', GREATEST(-40, LEAST(0, trust_score - (trust_factors->>'age_score')::INTEGER - 50)));
  
  -- Factor 3: Suspicious flags (-0 to -30 points)
  IF device_record.is_revoked THEN
    trust_score := trust_score - 50; -- Revoked devices get very low trust
  ELSIF device_record.is_suspicious THEN
    trust_score := trust_score - 30;
  END IF;
  trust_factors := trust_factors || jsonb_build_object('is_suspicious', device_record.is_suspicious, 'is_revoked', device_record.is_revoked);
  
  -- Factor 4: Request consistency (0-20 points)
  -- Check if device has consistent request patterns
  SELECT COUNT(*) INTO recent_requests_count
  FROM public.security_audit_log
  WHERE device_id = p_device_id
    AND created_at > now() - interval '7 days';
  
  IF recent_requests_count > 0 THEN
    -- Devices with regular activity are more trusted
    IF recent_requests_count >= 100 THEN
      request_consistency_score := 20;
    ELSIF recent_requests_count >= 50 THEN
      request_consistency_score := 15;
    ELSIF recent_requests_count >= 20 THEN
      request_consistency_score := 10;
    ELSIF recent_requests_count >= 5 THEN
      request_consistency_score := 5;
    END IF;
  END IF;
  trust_score := trust_score + request_consistency_score;
  trust_factors := trust_factors || jsonb_build_object('recent_requests', recent_requests_count, 'consistency_score', request_consistency_score);
  
  -- Factor 5: Geolocation consistency (0-15 points)
  -- Devices from consistent locations are more trusted
  SELECT COUNT(DISTINCT country_code) INTO unique_locations_count
  FROM public.devices
  WHERE profile_id = device_record.profile_id
    AND country_code IS NOT NULL;
  
  IF unique_locations_count = 1 THEN
    location_consistency_score := 15; -- Same location = high trust
  ELSIF unique_locations_count = 2 THEN
    location_consistency_score := 10; -- 2 locations = moderate trust
  ELSIF unique_locations_count <= 3 THEN
    location_consistency_score := 5; -- 3 locations = low trust
  END IF;
  trust_score := trust_score + location_consistency_score;
  trust_factors := trust_factors || jsonb_build_object('unique_locations', unique_locations_count, 'location_score', location_consistency_score);
  
  -- Factor 6: Request volume (0-10 points)
  -- Reasonable request volume indicates legitimate use
  IF device_record.request_count BETWEEN 10 AND 10000 THEN
    trust_score := trust_score + 10;
  ELSIF device_record.request_count BETWEEN 5 AND 50000 THEN
    trust_score := trust_score + 5;
  ELSIF device_record.request_count > 100000 THEN
    trust_score := trust_score - 10; -- Too many requests = suspicious
  END IF;
  trust_factors := trust_factors || jsonb_build_object('total_requests', device_record.request_count);
  
  -- Ensure score is within bounds (0-100)
  trust_score := GREATEST(0, LEAST(100, trust_score));
  
  -- Store trust factors for debugging/analysis
  trust_factors := trust_factors || jsonb_build_object('final_score', trust_score, 'calculated_at', now());
  
  -- Update device with new trust score
  UPDATE public.devices
  SET 
    trust_score = trust_score,
    trust_score_updated_at = now(),
    trust_score_factors = trust_factors
  WHERE device_id = p_device_id;
  
  RETURN trust_score;
END;
$$;

-- ============================================================================
-- 6. UPDATE update_device_activity TO INCLUDE GEOLOCATION
-- ============================================================================

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
DECLARE
  resolved_ip INET;
  device_request_count INTEGER;
  device_trust_updated TIMESTAMPTZ;
  should_recalculate BOOLEAN := false;
BEGIN
  -- Get user agent from headers if not provided
  IF p_user_agent IS NULL THEN
    BEGIN
      p_user_agent := current_setting('request.headers', true)::json->>'user-agent';
      IF p_user_agent IS NULL OR p_user_agent = '' THEN
        p_user_agent := current_setting('request.headers', true)::json->>'x-user-agent';
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
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
      resolved_ip := (current_setting('request.headers', true)::json->>'x-forwarded-for')::INET;
      IF resolved_ip IS NULL THEN
        resolved_ip := (current_setting('request.headers', true)::json->>'x-real-ip')::INET;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        BEGIN
          resolved_ip := (current_setting('request.headers', true)::json->>'x-real-ip')::INET;
        EXCEPTION
          WHEN OTHERS THEN
            resolved_ip := NULL;
        END;
    END;
  ELSE
    resolved_ip := p_ip_address;
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
    resolved_ip, 
    p_user_agent, 
    now(), 
    1,
    now()
  )
  ON CONFLICT (device_id) DO UPDATE SET
    last_seen_at = now(),
    request_count = COALESCE(devices.request_count, 0) + 1,
    user_agent = COALESCE(p_user_agent, devices.user_agent),
    ip_address = COALESCE(resolved_ip, devices.ip_address),
    updated_at = now();
  
  -- Update geolocation if IP address changed or geolocation is missing
  IF resolved_ip IS NOT NULL THEN
    PERFORM public.update_device_geolocation(
      p_device_id,
      resolved_ip,
      NULL, -- Let it auto-lookup if enabled
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      true -- Auto lookup enabled
    );
  END IF;
  
  -- Recalculate trust score periodically (every 10 requests or if not updated in 24 hours)
  SELECT request_count, trust_score_updated_at 
  INTO device_request_count, device_trust_updated
  FROM public.devices 
  WHERE device_id = p_device_id;
  
  IF device_request_count % 10 = 0 OR 
     device_trust_updated IS NULL OR 
     device_trust_updated < now() - interval '24 hours' THEN
    should_recalculate := true;
  END IF;
  
  IF should_recalculate THEN
    PERFORM public.calculate_device_trust_score(p_device_id);
  END IF;
  
  -- Check if device should be marked suspicious (but don't block)
  PERFORM public.check_device_suspicious(p_device_id);
END;
$$;

-- ============================================================================
-- 7. UPDATE check_device_suspicious TO USE TRUST SCORE
-- ============================================================================

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
  current_trust_score INTEGER;
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
  
  -- Calculate or get current trust score
  IF device_record.trust_score_updated_at IS NULL OR 
     device_record.trust_score_updated_at < now() - interval '1 hour' THEN
    current_trust_score := public.calculate_device_trust_score(p_device_id);
  ELSE
    current_trust_score := device_record.trust_score;
  END IF;
  
  -- Calculate requests in last hour
  SELECT COUNT(*) INTO requests_in_last_hour
  FROM public.security_audit_log
  WHERE device_id = p_device_id
    AND created_at > now() - interval '1 hour';
  
  -- Mark as suspicious if:
  -- 1. Trust score is very low (< 20)
  IF current_trust_score < 20 THEN
    is_suspicious_flag := true;
  END IF;
  
  -- 2. 10+ failed auth attempts in last hour
  IF device_record.failed_auth_count >= 10 AND 
     device_record.last_failed_auth_at IS NOT NULL AND
     device_record.last_failed_auth_at > now() - interval '1 hour' THEN
    is_suspicious_flag := true;
  END IF;
  
  -- 3. 5000+ requests in last hour
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
        'requests_in_last_hour', requests_in_last_hour,
        'trust_score', current_trust_score
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
          'total_request_count', device_record.request_count,
          'trust_score', current_trust_score
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
-- 8. CREATE FUNCTION TO GET DEVICE SECURITY STATUS WITH TRUST SCORE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_device_security_status(
  p_device_id TEXT
)
RETURNS TABLE (
  is_revoked BOOLEAN,
  is_suspicious BOOLEAN,
  failed_auth_count INTEGER,
  request_count INTEGER,
  last_seen_at TIMESTAMPTZ,
  revoked_reason TEXT,
  trust_score INTEGER,
  trust_score_updated_at TIMESTAMPTZ,
  country_code TEXT,
  country_name TEXT,
  city TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    d.is_revoked,
    d.is_suspicious,
    d.failed_auth_count,
    d.request_count,
    d.last_seen_at,
    d.revoked_reason,
    d.trust_score,
    d.trust_score_updated_at,
    d.country_code,
    d.country_name,
    d.city
  FROM public.devices d
  WHERE d.device_id = p_device_id;
END;
$$;

-- ============================================================================
-- 9. GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.lookup_ip_geolocation(INET) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_ip_geolocation(INET) TO anon;
GRANT EXECUTE ON FUNCTION public.update_device_geolocation(TEXT, INET, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_device_geolocation(TEXT, INET, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, BOOLEAN) TO anon;
GRANT EXECUTE ON FUNCTION public.calculate_device_trust_score(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_device_trust_score(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_device_security_status(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_device_security_status(TEXT) TO anon;

-- ============================================================================
-- 10. INITIALIZE TRUST SCORES FOR EXISTING DEVICES
-- ============================================================================

-- Calculate trust scores for all existing devices
DO $$
DECLARE
  device_record RECORD;
BEGIN
  FOR device_record IN SELECT device_id FROM public.devices LOOP
    PERFORM public.calculate_device_trust_score(device_record.device_id);
  END LOOP;
END $$;

-- ============================================================================
-- Notes
-- ============================================================================
-- After running this migration:
-- 1. Geolocation columns are added to devices table
-- 2. Trust scoring system is active and scores are calculated for all devices
-- 3. update_device_activity now automatically updates geolocation and trust scores
-- 4. Suspicious device detection now considers trust scores
-- 5. To integrate actual geolocation API, update lookup_ip_geolocation function
--    to call external services (e.g., via Supabase Edge Functions or pg_net)
-- ============================================================================

