-- ============================================================================
-- Session Timeout Management and Anomaly Detection
-- ============================================================================
-- This migration adds:
-- 1. Session timeout management for device-based authentication
-- 2. Anomaly detection using statistical ML models
-- ============================================================================

-- ============================================================================
-- PART 1: Session Timeout Management
-- ============================================================================

-- Add session expiration columns to devices table
ALTER TABLE public.devices
ADD COLUMN IF NOT EXISTS session_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS session_timeout_hours INTEGER DEFAULT 24,
ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ DEFAULT now(),
ADD COLUMN IF NOT EXISTS session_refresh_count INTEGER DEFAULT 0;

-- Create index for session expiration queries
CREATE INDEX IF NOT EXISTS idx_devices_session_expires ON public.devices(session_expires_at) 
WHERE session_expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_devices_last_activity ON public.devices(last_activity_at DESC);

-- Function to check if device session is valid
CREATE OR REPLACE FUNCTION public.is_session_valid(p_device_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  device_record public.devices%ROWTYPE;
  session_valid BOOLEAN := false;
BEGIN
  SELECT * INTO device_record
  FROM public.devices
  WHERE device_id = p_device_id;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Device must not be revoked
  IF device_record.is_revoked THEN
    RETURN false;
  END IF;
  
  -- Check if session has expired
  IF device_record.session_expires_at IS NOT NULL THEN
    IF device_record.session_expires_at > now() THEN
      session_valid := true;
    ELSE
      -- Session expired - log it
      PERFORM public.log_security_event(
        p_device_id,
        'session_expired',
        device_record.profile_id,
        jsonb_build_object(
          'expired_at', device_record.session_expires_at,
          'current_time', now()
        ),
        NULL,
        NULL,
        'warning'
      );
      RETURN false;
    END IF;
  ELSE
    -- No expiration set, session is valid (backward compatibility)
    session_valid := true;
  END IF;
  
  RETURN session_valid;
END;
$$;

-- Function to refresh device session
CREATE OR REPLACE FUNCTION public.refresh_device_session(
  p_device_id TEXT,
  p_timeout_hours INTEGER DEFAULT NULL
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  device_record public.devices%ROWTYPE;
  timeout_hours INTEGER;
  new_expires_at TIMESTAMPTZ;
BEGIN
  SELECT * INTO device_record
  FROM public.devices
  WHERE device_id = p_device_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Device not found';
  END IF;
  
  -- Use provided timeout or device's default or system default (24 hours)
  timeout_hours := COALESCE(
    p_timeout_hours,
    device_record.session_timeout_hours,
    24
  );
  
  -- Calculate new expiration time
  new_expires_at := now() + (timeout_hours || ' hours')::INTERVAL;
  
  -- Update device session
  UPDATE public.devices
  SET 
    session_expires_at = new_expires_at,
    last_activity_at = now(),
    session_refresh_count = session_refresh_count + 1,
    last_seen_at = now()
  WHERE device_id = p_device_id;
  
  RETURN new_expires_at;
END;
$$;

-- Function to initialize device session (called on first login/device creation)
CREATE OR REPLACE FUNCTION public.initialize_device_session(
  p_device_id TEXT,
  p_timeout_hours INTEGER DEFAULT 24
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_expires_at TIMESTAMPTZ;
BEGIN
  new_expires_at := now() + (p_timeout_hours || ' hours')::INTERVAL;
  
  -- Update or insert device with session
  INSERT INTO public.devices (
    device_id,
    session_expires_at,
    session_timeout_hours,
    last_activity_at,
    first_seen_at,
    last_seen_at
  )
  VALUES (
    p_device_id,
    new_expires_at,
    p_timeout_hours,
    now(),
    now(),
    now()
  )
  ON CONFLICT (device_id) DO UPDATE SET
    session_expires_at = COALESCE(devices.session_expires_at, EXCLUDED.session_expires_at),
    session_timeout_hours = COALESCE(devices.session_timeout_hours, EXCLUDED.session_timeout_hours),
    last_activity_at = now(),
    last_seen_at = now();
  
  RETURN new_expires_at;
END;
$$;

-- Function to extend session on activity (auto-refresh)
CREATE OR REPLACE FUNCTION public.update_device_activity_with_session(
  p_device_id TEXT,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_auto_refresh_session BOOLEAN DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  device_record public.devices%ROWTYPE;
  should_refresh BOOLEAN := false;
BEGIN
  SELECT * INTO device_record
  FROM public.devices
  WHERE device_id = p_device_id;
  
  -- Update basic activity
  UPDATE public.devices
  SET 
    last_seen_at = now(),
    request_count = request_count + 1,
    ip_address = COALESCE(p_ip_address, ip_address),
    user_agent = COALESCE(p_user_agent, user_agent),
    last_activity_at = now()
  WHERE device_id = p_device_id;
  
  -- Auto-refresh session if enabled and session is close to expiring (within 1 hour)
  IF p_auto_refresh_session AND device_record.session_expires_at IS NOT NULL THEN
    IF device_record.session_expires_at < now() + interval '1 hour' THEN
      should_refresh := true;
    END IF;
  END IF;
  
  -- If device doesn't exist, create it with session
  IF NOT FOUND THEN
    PERFORM public.initialize_device_session(p_device_id, 24);
  ELSIF should_refresh THEN
    PERFORM public.refresh_device_session(p_device_id);
  END IF;
END;
$$;

-- Function to get session status
CREATE OR REPLACE FUNCTION public.get_session_status(p_device_id TEXT)
RETURNS TABLE (
  is_valid BOOLEAN,
  expires_at TIMESTAMPTZ,
  expires_in_seconds INTEGER,
  last_activity_at TIMESTAMPTZ,
  session_refresh_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    public.is_session_valid(p_device_id) AS is_valid,
    d.session_expires_at AS expires_at,
    EXTRACT(EPOCH FROM (d.session_expires_at - now()))::INTEGER AS expires_in_seconds,
    d.last_activity_at,
    d.session_refresh_count
  FROM public.devices d
  WHERE d.device_id = p_device_id;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.is_session_valid(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_session_valid(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.refresh_device_session(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_device_session(TEXT, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION public.initialize_device_session(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.initialize_device_session(TEXT, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION public.update_device_activity_with_session(TEXT, INET, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_device_activity_with_session(TEXT, INET, TEXT, BOOLEAN) TO anon;
GRANT EXECUTE ON FUNCTION public.get_session_status(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_session_status(TEXT) TO anon;

-- ============================================================================
-- PART 2: Anomaly Detection ML Models
-- ============================================================================

-- Table to store anomaly detection features and scores
CREATE TABLE IF NOT EXISTS public.device_anomaly_scores (
  id BIGSERIAL PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES public.devices(device_id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  anomaly_score NUMERIC(5, 2) NOT NULL CHECK (anomaly_score >= 0 AND anomaly_score <= 100),
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  features JSONB NOT NULL DEFAULT '{}'::jsonb,
  detected_anomalies TEXT[] DEFAULT '{}',
  model_version TEXT DEFAULT '1.0',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for anomaly detection
CREATE INDEX IF NOT EXISTS idx_anomaly_scores_device ON public.device_anomaly_scores(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_anomaly_scores_profile ON public.device_anomaly_scores(profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_anomaly_scores_risk ON public.device_anomaly_scores(risk_level, created_at DESC) 
WHERE risk_level IN ('high', 'critical');
CREATE INDEX IF NOT EXISTS idx_anomaly_scores_score ON public.device_anomaly_scores(anomaly_score DESC, created_at DESC);

-- RLS for anomaly scores (service role only for security)
ALTER TABLE public.device_anomaly_scores ENABLE ROW LEVEL SECURITY;

-- Drop policy if it exists before creating it
DROP POLICY IF EXISTS "Anomaly scores service role only" ON public.device_anomaly_scores;

CREATE POLICY "Anomaly scores service role only"
ON public.device_anomaly_scores
FOR ALL
USING (false)
WITH CHECK (false);

-- Function to calculate statistical features for anomaly detection
CREATE OR REPLACE FUNCTION public.calculate_device_features(p_device_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  device_record public.devices%ROWTYPE;
  features JSONB := '{}'::jsonb;
  requests_per_hour NUMERIC;
  requests_per_day NUMERIC;
  failed_auth_rate NUMERIC;
  ip_changes INTEGER;
  user_agent_changes INTEGER;
  time_since_first_seen INTERVAL;
  time_since_last_seen INTERVAL;
  avg_requests_per_hour NUMERIC;
  recent_audit_events INTEGER;
BEGIN
  SELECT * INTO device_record
  FROM public.devices
  WHERE device_id = p_device_id;
  
  IF NOT FOUND THEN
    RETURN features;
  END IF;
  
  -- Calculate time-based features
  time_since_first_seen := now() - device_record.first_seen_at;
  time_since_last_seen := now() - device_record.last_seen_at;
  
  -- Calculate request rate features
  IF time_since_first_seen > interval '0' THEN
    requests_per_hour := (device_record.request_count::NUMERIC / 
      EXTRACT(EPOCH FROM GREATEST(time_since_first_seen, interval '1 hour'))::NUMERIC) * 3600;
    requests_per_day := (device_record.request_count::NUMERIC / 
      EXTRACT(EPOCH FROM GREATEST(time_since_first_seen, interval '1 day'))::NUMERIC) * 86400;
  ELSE
    requests_per_hour := 0;
    requests_per_day := 0;
  END IF;
  
  -- Calculate failed auth rate
  IF device_record.request_count > 0 THEN
    failed_auth_rate := (device_record.failed_auth_count::NUMERIC / device_record.request_count::NUMERIC) * 100;
  ELSE
    failed_auth_rate := 0;
  END IF;
  
  -- Count IP and user agent changes from audit log
  SELECT 
    COUNT(DISTINCT ip_address) FILTER (WHERE ip_address IS NOT NULL),
    COUNT(DISTINCT user_agent) FILTER (WHERE user_agent IS NOT NULL),
    COUNT(*) FILTER (WHERE created_at > now() - interval '1 hour')
  INTO ip_changes, user_agent_changes, recent_audit_events
  FROM public.security_audit_log
  WHERE device_id = p_device_id
    AND created_at > device_record.first_seen_at;
  
  -- Calculate average requests per hour (baseline)
  IF time_since_first_seen > interval '1 hour' THEN
    avg_requests_per_hour := device_record.request_count::NUMERIC / 
      (EXTRACT(EPOCH FROM time_since_first_seen) / 3600);
  ELSE
    avg_requests_per_hour := device_record.request_count::NUMERIC;
  END IF;
  
  -- Build features JSONB
  features := jsonb_build_object(
    'request_count', device_record.request_count,
    'failed_auth_count', device_record.failed_auth_count,
    'requests_per_hour', ROUND(requests_per_hour, 2),
    'requests_per_day', ROUND(requests_per_day, 2),
    'failed_auth_rate', ROUND(failed_auth_rate, 2),
    'ip_changes', ip_changes,
    'user_agent_changes', user_agent_changes,
    'time_since_first_seen_hours', EXTRACT(EPOCH FROM time_since_first_seen) / 3600,
    'time_since_last_seen_minutes', EXTRACT(EPOCH FROM time_since_last_seen) / 60,
    'avg_requests_per_hour', ROUND(avg_requests_per_hour, 2),
    'recent_audit_events', recent_audit_events,
    'is_suspicious', device_record.is_suspicious,
    'is_revoked', device_record.is_revoked,
    'session_refresh_count', COALESCE(device_record.session_refresh_count, 0)
  );
  
  RETURN features;
END;
$$;

-- Function to detect anomalies using statistical methods (Z-score, IQR, threshold-based)
CREATE OR REPLACE FUNCTION public.detect_device_anomalies(p_device_id TEXT)
RETURNS TABLE (
  anomaly_score NUMERIC,
  risk_level TEXT,
  detected_anomalies TEXT[],
  features JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  device_features JSONB;
  score NUMERIC := 0;
  risk TEXT := 'low';
  anomalies TEXT[] := '{}';
  requests_per_hour NUMERIC;
  failed_auth_rate NUMERIC;
  requests_per_day NUMERIC;
  ip_changes INTEGER;
  user_agent_changes INTEGER;
  recent_audit_events INTEGER;
  avg_requests_per_hour NUMERIC;
  baseline_requests_per_hour NUMERIC;
  z_score NUMERIC;
BEGIN
  -- Calculate features
  device_features := public.calculate_device_features(p_device_id);
  
  IF device_features = '{}'::jsonb THEN
    RETURN QUERY SELECT 0::NUMERIC, 'low'::TEXT, '{}'::TEXT[], '{}'::JSONB;
    RETURN;
  END IF;
  
  -- Extract feature values
  requests_per_hour := (device_features->>'requests_per_hour')::NUMERIC;
  failed_auth_rate := (device_features->>'failed_auth_rate')::NUMERIC;
  requests_per_day := (device_features->>'requests_per_day')::NUMERIC;
  ip_changes := (device_features->>'ip_changes')::INTEGER;
  user_agent_changes := (device_features->>'user_agent_changes')::INTEGER;
  recent_audit_events := (device_features->>'recent_audit_events')::INTEGER;
  avg_requests_per_hour := (device_features->>'avg_requests_per_hour')::NUMERIC;
  
  -- Calculate baseline from all devices (statistical baseline)
  SELECT AVG(request_count::NUMERIC / GREATEST(EXTRACT(EPOCH FROM (now() - first_seen_at)) / 3600, 1))
  INTO baseline_requests_per_hour
  FROM public.devices
  WHERE first_seen_at IS NOT NULL
    AND first_seen_at > now() - interval '30 days'
    AND is_revoked = false;
  
  baseline_requests_per_hour := COALESCE(baseline_requests_per_hour, 10); -- Default baseline
  
  -- ANOMALY DETECTION RULES (Statistical ML-like approach)
  
  -- 1. Excessive request rate (Z-score based)
  IF avg_requests_per_hour > 0 AND baseline_requests_per_hour > 0 THEN
    z_score := (avg_requests_per_hour - baseline_requests_per_hour) / 
      GREATEST(baseline_requests_per_hour * 0.5, 1); -- Simplified std dev
    
    IF z_score > 3 THEN
      score := score + 30;
      risk := 'high';
      anomalies := array_append(anomalies, 'excessive_request_rate');
    ELSIF z_score > 2 THEN
      score := score + 15;
      IF risk = 'low' THEN risk := 'medium'; END IF;
      anomalies := array_append(anomalies, 'high_request_rate');
    END IF;
  END IF;
  
  -- 2. High failed authentication rate
  IF failed_auth_rate > 50 THEN
    score := score + 40;
    risk := 'critical';
    anomalies := array_append(anomalies, 'very_high_failed_auth_rate');
  ELSIF failed_auth_rate > 20 THEN
    score := score + 25;
    IF risk != 'critical' THEN risk := 'high'; END IF;
    anomalies := array_append(anomalies, 'high_failed_auth_rate');
  ELSIF failed_auth_rate > 10 THEN
    score := score + 10;
    IF risk = 'low' THEN risk := 'medium'; END IF;
    anomalies := array_append(anomalies, 'elevated_failed_auth_rate');
  END IF;
  
  -- 3. Frequent IP changes (potential account sharing or bot)
  IF ip_changes > 10 THEN
    score := score + 25;
    IF risk != 'critical' THEN risk := 'high'; END IF;
    anomalies := array_append(anomalies, 'frequent_ip_changes');
  ELSIF ip_changes > 5 THEN
    score := score + 10;
    IF risk = 'low' THEN risk := 'medium'; END IF;
    anomalies := array_append(anomalies, 'multiple_ip_changes');
  END IF;
  
  -- 4. Frequent user agent changes
  IF user_agent_changes > 5 THEN
    score := score + 20;
    IF risk != 'critical' THEN risk := 'high'; END IF;
    anomalies := array_append(anomalies, 'frequent_user_agent_changes');
  ELSIF user_agent_changes > 2 THEN
    score := score + 8;
    IF risk = 'low' THEN risk := 'medium'; END IF;
    anomalies := array_append(anomalies, 'multiple_user_agent_changes');
  END IF;
  
  -- 5. Burst activity (many events in short time)
  IF recent_audit_events > 100 THEN
    score := score + 30;
    IF risk != 'critical' THEN risk := 'high'; END IF;
    anomalies := array_append(anomalies, 'burst_activity');
  ELSIF recent_audit_events > 50 THEN
    score := score + 15;
    IF risk = 'low' THEN risk := 'medium'; END IF;
    anomalies := array_append(anomalies, 'high_recent_activity');
  END IF;
  
  -- 6. Very high daily request rate
  IF requests_per_day > 10000 THEN
    score := score + 35;
    IF risk != 'critical' THEN risk := 'high'; END IF;
    anomalies := array_append(anomalies, 'extremely_high_daily_requests');
  ELSIF requests_per_day > 5000 THEN
    score := score + 20;
    IF risk = 'low' THEN risk := 'medium'; END IF;
    anomalies := array_append(anomalies, 'very_high_daily_requests');
  END IF;
  
  -- 7. Device already marked suspicious
  IF (device_features->>'is_suspicious')::BOOLEAN THEN
    score := score + 20;
    IF risk != 'critical' THEN risk := 'high'; END IF;
    anomalies := array_append(anomalies, 'previously_marked_suspicious');
  END IF;
  
  -- 8. Device revoked
  IF (device_features->>'is_revoked')::BOOLEAN THEN
    score := 100;
    risk := 'critical';
    anomalies := array_append(anomalies, 'device_revoked');
  END IF;
  
  -- Cap score at 100
  score := LEAST(score, 100);
  
  -- Determine final risk level based on score
  IF score >= 70 THEN
    risk := 'critical';
  ELSIF score >= 50 THEN
    risk := 'high';
  ELSIF score >= 25 THEN
    risk := 'medium';
  ELSE
    risk := 'low';
  END IF;
  
  RETURN QUERY SELECT 
    ROUND(score, 2)::NUMERIC,
    risk::TEXT,
    anomalies,
    device_features;
END;
$$;

-- Function to store anomaly detection results
CREATE OR REPLACE FUNCTION public.record_anomaly_detection(p_device_id TEXT)
RETURNS TABLE (
  anomaly_score NUMERIC,
  risk_level TEXT,
  detected_anomalies TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  device_record public.devices%ROWTYPE;
  detection_result RECORD;
BEGIN
  SELECT * INTO device_record
  FROM public.devices
  WHERE device_id = p_device_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Run anomaly detection
  SELECT * INTO detection_result
  FROM public.detect_device_anomalies(p_device_id);
  
  -- Store result
  INSERT INTO public.device_anomaly_scores (
    device_id,
    profile_id,
    anomaly_score,
    risk_level,
    features,
    detected_anomalies,
    model_version
  )
  VALUES (
    p_device_id,
    device_record.profile_id,
    detection_result.anomaly_score,
    detection_result.risk_level,
    detection_result.features,
    detection_result.detected_anomalies,
    '1.0'
  )
  ON CONFLICT DO NOTHING; -- Don't overwrite existing scores
  
  -- If high risk, mark device as suspicious and log
  IF detection_result.risk_level IN ('high', 'critical') THEN
    UPDATE public.devices
    SET is_suspicious = true
    WHERE device_id = p_device_id
      AND is_suspicious = false; -- Only update if not already suspicious
    
    PERFORM public.log_security_event(
      p_device_id,
      'anomaly_detected',
      device_record.profile_id,
      jsonb_build_object(
        'anomaly_score', detection_result.anomaly_score,
        'risk_level', detection_result.risk_level,
        'detected_anomalies', detection_result.detected_anomalies
      ),
      NULL,
      NULL,
      CASE 
        WHEN detection_result.risk_level = 'critical' THEN 'critical'
        ELSE 'warning'
      END
    );
  END IF;
  
  RETURN QUERY SELECT 
    detection_result.anomaly_score,
    detection_result.risk_level,
    detection_result.detected_anomalies;
END;
$$;

-- Function to get latest anomaly score for a device
CREATE OR REPLACE FUNCTION public.get_latest_anomaly_score(p_device_id TEXT)
RETURNS TABLE (
  anomaly_score NUMERIC,
  risk_level TEXT,
  detected_anomalies TEXT[],
  features JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    das.anomaly_score,
    das.risk_level,
    das.detected_anomalies,
    das.features,
    das.created_at
  FROM public.device_anomaly_scores das
  WHERE das.device_id = p_device_id
  ORDER BY das.created_at DESC
  LIMIT 1;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.calculate_device_features(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.detect_device_anomalies(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_anomaly_detection(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_latest_anomaly_score(TEXT) TO service_role;

-- ============================================================================
-- PART 3: Update existing functions to use session management
-- ============================================================================

-- Update profile_ids_for_request_secure to check session validity
CREATE OR REPLACE FUNCTION public.profile_ids_for_request_secure(request_device_id TEXT DEFAULT NULL)
RETURNS TABLE (id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved_device_id TEXT;
  device_is_revoked BOOLEAN;
  device_is_suspicious BOOLEAN;
  session_is_valid BOOLEAN;
BEGIN
  resolved_device_id := NULLIF(trim(
    COALESCE(
      request_device_id,
      (current_setting('request.headers', true)::json ->> 'x-device-id')
    )
  ), '');
  
  IF resolved_device_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Check if device is revoked
  SELECT is_revoked, is_suspicious
  INTO device_is_revoked, device_is_suspicious
  FROM public.devices
  WHERE device_id = resolved_device_id;
  
  -- If device is revoked, don't return any profile IDs
  IF device_is_revoked THEN
    PERFORM public.log_security_event(
      resolved_device_id,
      'revoked_device_access_attempt',
      NULL,
      '{}'::jsonb,
      NULL,
      NULL,
      'error'
    );
    RETURN;
  END IF;
  
  -- Check session validity
  session_is_valid := public.is_session_valid(resolved_device_id);
  IF NOT session_is_valid THEN
    PERFORM public.log_security_event(
      resolved_device_id,
      'expired_session_access_attempt',
      NULL,
      '{}'::jsonb,
      NULL,
      NULL,
      'warning'
    );
    RETURN;
  END IF;
  
  -- Check for suspicious activity
  IF device_is_suspicious OR public.check_device_suspicious(resolved_device_id) THEN
    PERFORM public.log_security_event(
      resolved_device_id,
      'suspicious_device_access',
      NULL,
      '{}'::jsonb,
      NULL,
      NULL,
      'warning'
    );
  END IF;
  
  -- Update device activity with session management
  PERFORM public.update_device_activity_with_session(resolved_device_id);
  
  -- Periodically run anomaly detection (every 100 requests or on suspicious activity)
  IF device_is_suspicious OR (SELECT request_count FROM public.devices WHERE device_id = resolved_device_id) % 100 = 0 THEN
    PERFORM public.record_anomaly_detection(resolved_device_id);
  END IF;
  
  -- Return profile IDs (existing logic)
  RETURN QUERY
  SELECT p.id
  FROM public.profiles p
  WHERE p.device_id = resolved_device_id
  UNION
  SELECT d.profile_id
  FROM public.devices d
  WHERE d.device_id = resolved_device_id
    AND d.profile_id IS NOT NULL;
END;
$$;

-- ============================================================================
-- PART 4: Comments and Documentation
-- ============================================================================

COMMENT ON COLUMN public.devices.session_expires_at IS 'Timestamp when device session expires. NULL means no expiration (backward compatibility)';
COMMENT ON COLUMN public.devices.session_timeout_hours IS 'Session timeout in hours. Default is 24 hours';
COMMENT ON COLUMN public.devices.last_activity_at IS 'Last time device had any activity';
COMMENT ON COLUMN public.devices.session_refresh_count IS 'Number of times session has been refreshed';

COMMENT ON TABLE public.device_anomaly_scores IS 'Stores anomaly detection scores and features for devices using statistical ML methods';
COMMENT ON FUNCTION public.is_session_valid(TEXT) IS 'Checks if device session is valid and not expired';
COMMENT ON FUNCTION public.refresh_device_session(TEXT, INTEGER) IS 'Refreshes device session expiration time';
COMMENT ON FUNCTION public.detect_device_anomalies(TEXT) IS 'Detects anomalies using statistical methods (Z-score, threshold-based detection)';
COMMENT ON FUNCTION public.record_anomaly_detection(TEXT) IS 'Runs anomaly detection and stores results, automatically marks suspicious devices';

