-- Security Automation Enhancements
-- Adds: Security audit scheduling, API key rotation enforcement, security alerts

-- ============================================================================
-- 1. SECURITY AUDIT SCHEDULING (Cron Jobs)
-- ============================================================================

-- Schedule daily security audit (runs at 2 AM daily)
-- Note: Requires pg_cron extension to be enabled in Supabase
DO $$
BEGIN
  -- Check if pg_cron is available
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove existing job if it exists (ignore error if it doesn't)
    BEGIN
      PERFORM cron.unschedule('daily-security-audit');
    EXCEPTION
      WHEN OTHERS THEN NULL;
    END;
    
    -- Schedule daily audit
    PERFORM cron.schedule(
      'daily-security-audit',
      '0 2 * * *', -- 2 AM daily (UTC)
      'SELECT public.run_security_audit(''daily'')'
    );
    
    -- Remove existing weekly job if it exists (ignore error if it doesn't)
    BEGIN
      PERFORM cron.unschedule('weekly-security-audit');
    EXCEPTION
      WHEN OTHERS THEN NULL;
    END;
    
    -- Schedule weekly comprehensive audit
    PERFORM cron.schedule(
      'weekly-security-audit',
      '0 3 * * 0', -- 3 AM every Sunday (UTC)
      'SELECT public.run_security_audit(''weekly'')'
    );
    
    -- Remove existing monthly job if it exists (ignore error if it doesn't)
    BEGIN
      PERFORM cron.unschedule('monthly-security-audit');
    EXCEPTION
      WHEN OTHERS THEN NULL;
    END;
    
    -- Schedule monthly full audit
    PERFORM cron.schedule(
      'monthly-security-audit',
      '0 4 * * 1', -- 4 AM first Monday of month (UTC)
      'SELECT public.run_security_audit(''monthly'')'
    );
  ELSE
    RAISE NOTICE 'pg_cron extension not available. Please enable it in Supabase Dashboard or schedule audits manually.';
  END IF;
END $$;

-- ============================================================================
-- 2. API KEY ROTATION ENFORCEMENT
-- ============================================================================

-- Function to enforce API key rotation
CREATE OR REPLACE FUNCTION public.enforce_api_key_rotation()
RETURNS TABLE (
  disabled_keys_count INTEGER,
  warned_keys_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_disabled_count INTEGER := 0;
  v_warned_count INTEGER := 0;
  v_key_age_days INTEGER;
BEGIN
  -- Auto-disable keys older than 90 days
  UPDATE public.api_keys
  SET 
    is_active = false,
    updated_at = now()
  WHERE created_at < now() - interval '90 days'
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now());
  
  GET DIAGNOSTICS v_disabled_count = ROW_COUNT;
  
  -- Mark keys older than 60 days as needing rotation (add flag if column exists)
  -- This is informational - you can query for keys needing rotation
  SELECT COUNT(*) INTO v_warned_count
  FROM public.api_keys
  WHERE created_at < now() - interval '60 days'
    AND created_at >= now() - interval '90 days'
    AND is_active = true;
  
  -- Log the rotation enforcement
  IF v_disabled_count > 0 THEN
    PERFORM public.log_security_event(
      NULL,
      'api_key_rotation_enforced',
      NULL,
      jsonb_build_object(
        'disabled_keys_count', v_disabled_count,
        'warned_keys_count', v_warned_count
      ),
      NULL,
      NULL,
      'warning'
    );
  END IF;
  
  RETURN QUERY SELECT v_disabled_count, v_warned_count;
END;
$$;

-- Function to check if API key needs rotation
CREATE OR REPLACE FUNCTION public.api_key_needs_rotation(api_key_id_param UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key_age_days INTEGER;
BEGIN
  SELECT EXTRACT(DAY FROM (now() - created_at))::INTEGER
  INTO v_key_age_days
  FROM public.api_keys
  WHERE id = api_key_id_param;
  
  -- Needs rotation if older than 60 days
  RETURN COALESCE(v_key_age_days, 0) >= 60;
END;
$$;

-- Schedule API key rotation check (weekly)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove existing job if it exists (ignore error if it doesn't)
    BEGIN
      PERFORM cron.unschedule('api-key-rotation-check');
    EXCEPTION
      WHEN OTHERS THEN NULL;
    END;
    
    PERFORM cron.schedule(
      'api-key-rotation-check',
      '0 5 * * 0', -- 5 AM every Sunday (UTC)
      'SELECT public.enforce_api_key_rotation()'
    );
  END IF;
END $$;

-- ============================================================================
-- 3. SECURITY ALERT FUNCTION
-- ============================================================================

-- Function to check for critical security events and trigger alerts
CREATE OR REPLACE FUNCTION public.check_critical_security_events()
RETURNS TABLE (
  critical_events_count INTEGER,
  events JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_critical_count INTEGER;
  v_events JSONB;
BEGIN
  -- Count critical events in last hour
  SELECT 
    COUNT(*)::INTEGER,
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'event_type', event_type,
        'severity', severity,
        'profile_id', profile_id,
        'device_id', device_id,
        'created_at', created_at,
        'details', event_details
      )
    )
  INTO v_critical_count, v_events
  FROM public.security_audit_log
  WHERE severity IN ('error', 'critical')
    AND created_at > now() - interval '1 hour';
  
  -- If critical events found, you can trigger webhooks/notifications here
  -- Example: Call webhook to send alert to Slack/Discord/Email
  
  RETURN QUERY SELECT 
    COALESCE(v_critical_count, 0),
    COALESCE(v_events, '[]'::jsonb);
END;
$$;

-- Schedule critical event check (every hour)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove existing job if it exists (ignore error if it doesn't)
    BEGIN
      PERFORM cron.unschedule('critical-security-events-check');
    EXCEPTION
      WHEN OTHERS THEN NULL;
    END;
    
    PERFORM cron.schedule(
      'critical-security-events-check',
      '0 * * * *', -- Every hour
      'SELECT public.check_critical_security_events()'
    );
  END IF;
END $$;

-- ============================================================================
-- 4. ADMIN IP ALLOWLIST (Optional - Only if you have static admin IPs)
-- ============================================================================

-- Uncomment this section if you want to restrict admin operations to specific IPs

/*
CREATE TABLE IF NOT EXISTS public.admin_ip_allowlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address INET NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Enable RLS
ALTER TABLE public.admin_ip_allowlist ENABLE ROW LEVEL SECURITY;

-- Only admins can view/manage allowlist
CREATE POLICY "Admin IP allowlist viewable by admins"
ON public.admin_ip_allowlist FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
    AND is_admin = true
  )
);

-- Function to check if IP is allowed for admin operations
CREATE OR REPLACE FUNCTION public.is_admin_ip_allowed(ip_address_param INET)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If allowlist is empty, allow all (backward compatible)
  IF NOT EXISTS (SELECT 1 FROM public.admin_ip_allowlist) THEN
    RETURN true;
  END IF;
  
  RETURN EXISTS (
    SELECT 1 FROM public.admin_ip_allowlist
    WHERE ip_address = ip_address_param
  );
END;
$$;
*/

-- ============================================================================
-- 5. COMMENTS
-- ============================================================================

COMMENT ON FUNCTION public.enforce_api_key_rotation() IS 'Automatically disables API keys older than 90 days and warns about keys older than 60 days';
COMMENT ON FUNCTION public.api_key_needs_rotation(UUID) IS 'Checks if an API key needs rotation (older than 60 days)';
COMMENT ON FUNCTION public.check_critical_security_events() IS 'Checks for critical security events in the last hour and can trigger alerts';

-- ============================================================================
-- 6. NOTES
-- ============================================================================

-- To enable pg_cron in Supabase:
-- 1. Go to Supabase Dashboard → Database → Extensions
-- 2. Enable "pg_cron" extension
-- 3. Run this migration again

-- To manually run security audits:
-- SELECT public.run_security_audit('daily');
-- SELECT public.run_security_audit('weekly');
-- SELECT public.run_security_audit('monthly');

-- To check API keys needing rotation:
-- SELECT * FROM public.api_keys 
-- WHERE created_at < now() - interval '60 days' 
--   AND is_active = true;

-- To check critical security events:
-- SELECT * FROM public.check_critical_security_events();

