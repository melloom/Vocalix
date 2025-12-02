-- Enhanced device security and tracking

-- Add security metadata to devices table
ALTER TABLE public.devices
ADD COLUMN IF NOT EXISTS ip_address INET,
ADD COLUMN IF NOT EXISTS user_agent TEXT,
ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT now(),
ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ DEFAULT now(),
ADD COLUMN IF NOT EXISTS is_suspicious BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS is_revoked BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS revoked_reason TEXT,
ADD COLUMN IF NOT EXISTS request_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS failed_auth_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_failed_auth_at TIMESTAMPTZ;

-- Create index for security queries
CREATE INDEX IF NOT EXISTS devices_profile_id_idx ON public.devices(profile_id);
CREATE INDEX IF NOT EXISTS devices_last_seen_idx ON public.devices(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS devices_suspicious_idx ON public.devices(is_suspicious) WHERE is_suspicious = true;
CREATE INDEX IF NOT EXISTS devices_revoked_idx ON public.devices(is_revoked) WHERE is_revoked = true;

-- Security audit log table
CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id BIGSERIAL PRIMARY KEY,
  device_id TEXT,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  event_details JSONB DEFAULT '{}'::jsonb,
  ip_address INET,
  user_agent TEXT,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS security_audit_device_idx ON public.security_audit_log(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS security_audit_profile_idx ON public.security_audit_log(profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS security_audit_type_idx ON public.security_audit_log(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS security_audit_severity_idx ON public.security_audit_log(severity, created_at DESC) WHERE severity IN ('error', 'critical');

ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

-- Only service role can access audit logs
CREATE POLICY "Audit logs service role only"
ON public.security_audit_log
FOR ALL
USING (false)
WITH CHECK (false);

-- Function to update device last seen and track activity
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
  UPDATE public.devices
  SET 
    last_seen_at = now(),
    request_count = request_count + 1,
    ip_address = COALESCE(p_ip_address, ip_address),
    user_agent = COALESCE(p_user_agent, user_agent)
  WHERE device_id = p_device_id;
  
  -- If device doesn't exist, create it
  IF NOT FOUND THEN
    INSERT INTO public.devices (device_id, ip_address, user_agent, first_seen_at, last_seen_at, request_count)
    VALUES (p_device_id, p_ip_address, p_user_agent, now(), now(), 1)
    ON CONFLICT (device_id) DO UPDATE SET
      last_seen_at = now(),
      request_count = devices.request_count + 1,
      ip_address = COALESCE(EXCLUDED.ip_address, devices.ip_address),
      user_agent = COALESCE(EXCLUDED.user_agent, devices.user_agent);
  END IF;
END;
$$;

-- Function to log security events
CREATE OR REPLACE FUNCTION public.log_security_event(
  p_device_id TEXT,
  p_event_type TEXT,
  p_profile_id UUID DEFAULT NULL,
  p_event_details JSONB DEFAULT '{}'::jsonb,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_severity TEXT DEFAULT 'info'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.security_audit_log (
    device_id,
    profile_id,
    event_type,
    event_details,
    ip_address,
    user_agent,
    severity
  )
  VALUES (
    p_device_id,
    p_profile_id,
    p_event_type,
    p_event_details,
    p_ip_address,
    p_user_agent,
    p_severity
  );
END;
$$;

-- Function to detect suspicious device activity
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
BEGIN
  SELECT * INTO device_record
  FROM public.devices
  WHERE device_id = p_device_id;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Check if device is revoked
  IF device_record.is_revoked THEN
    RETURN true;
  END IF;
  
  -- Check for too many failed auth attempts (5+ in last hour)
  IF device_record.failed_auth_count >= 5 AND 
     device_record.last_failed_auth_at > now() - interval '1 hour' THEN
    is_suspicious_flag := true;
  END IF;
  
  -- Check for unusual request patterns (1000+ requests in last hour)
  IF device_record.request_count > 1000 AND
     device_record.last_seen_at > now() - interval '1 hour' THEN
    is_suspicious_flag := true;
  END IF;
  
  -- Update suspicious flag
  IF is_suspicious_flag != device_record.is_suspicious THEN
    UPDATE public.devices
    SET is_suspicious = is_suspicious_flag
    WHERE device_id = p_device_id;
    
    -- Log the suspicious activity
    IF is_suspicious_flag THEN
      PERFORM public.log_security_event(
        p_device_id,
        'device_marked_suspicious',
        device_record.profile_id,
        jsonb_build_object(
          'failed_auth_count', device_record.failed_auth_count,
          'request_count', device_record.request_count
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

-- Function to record failed authentication
CREATE OR REPLACE FUNCTION public.record_failed_auth(
  p_device_id TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.devices
  SET 
    failed_auth_count = failed_auth_count + 1,
    last_failed_auth_at = now()
  WHERE device_id = p_device_id;
  
  -- Log the failed auth attempt
  PERFORM public.log_security_event(
    p_device_id,
    'failed_authentication',
    NULL,
    jsonb_build_object('reason', p_reason),
    NULL,
    NULL,
    'warning'
  );
  
  -- Check if device should be marked suspicious
  PERFORM public.check_device_suspicious(p_device_id);
END;
$$;

-- Function to revoke a device
CREATE OR REPLACE FUNCTION public.revoke_device(
  p_device_id TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  device_profile_id UUID;
BEGIN
  SELECT profile_id INTO device_profile_id
  FROM public.devices
  WHERE device_id = p_device_id;
  
  UPDATE public.devices
  SET 
    is_revoked = true,
    revoked_at = now(),
    revoked_reason = p_reason
  WHERE device_id = p_device_id;
  
  -- Log the revocation
  PERFORM public.log_security_event(
    p_device_id,
    'device_revoked',
    device_profile_id,
    jsonb_build_object('reason', p_reason),
    NULL,
    NULL,
    'critical'
  );
END;
$$;

-- Function to get device security status
CREATE OR REPLACE FUNCTION public.get_device_security_status(
  p_device_id TEXT
)
RETURNS TABLE (
  is_revoked BOOLEAN,
  is_suspicious BOOLEAN,
  failed_auth_count INTEGER,
  request_count INTEGER,
  last_seen_at TIMESTAMPTZ,
  revoked_reason TEXT
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
    d.revoked_reason
  FROM public.devices d
  WHERE d.device_id = p_device_id;
END;
$$;

-- Trigger to update last_seen_at on device access
CREATE OR REPLACE FUNCTION public.update_device_last_seen()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  device_id_from_header TEXT;
BEGIN
  device_id_from_header := current_setting('request.headers', true)::json->>'x-device-id';
  
  IF device_id_from_header IS NOT NULL THEN
    UPDATE public.devices
    SET last_seen_at = now()
    WHERE device_id = device_id_from_header;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Enhanced profile_ids_for_request with security checks
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
  
  -- Update device activity
  PERFORM public.update_device_activity(resolved_device_id);
  
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

