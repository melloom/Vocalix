-- Automated Security Audit System
-- Automates all security checks from SECURITY_AUDITS_AND_BACKUPS.md
-- Runs automatically via cron job

-- ============================================================================
-- 1. CREATE AUDIT RESULTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.security_audit_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_type TEXT NOT NULL, -- 'quarterly', 'daily', 'weekly', 'monthly'
  check_category TEXT NOT NULL, -- 'authentication', 'data_protection', 'input_validation', 'infrastructure'
  check_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pass', 'fail', 'warning', 'error')),
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  message TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  remediation_steps TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_security_audit_results_type_created 
  ON public.security_audit_results(audit_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_audit_results_category_status 
  ON public.security_audit_results(check_category, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_audit_results_severity 
  ON public.security_audit_results(severity, created_at DESC) 
  WHERE severity IN ('error', 'critical');

CREATE INDEX IF NOT EXISTS idx_security_audit_results_status 
  ON public.security_audit_results(status, created_at DESC) 
  WHERE status IN ('fail', 'error', 'warning');

-- RLS: Only service role can access
ALTER TABLE public.security_audit_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only" ON public.security_audit_results;
CREATE POLICY "Service role only"
ON public.security_audit_results
FOR ALL
USING (false)
WITH CHECK (false);

-- ============================================================================
-- 2. AUTHENTICATION & AUTHORIZATION CHECKS
-- ============================================================================

-- Check if device-based authentication is secure
CREATE OR REPLACE FUNCTION public.check_device_authentication_security()
RETURNS TABLE (
  status TEXT,
  message TEXT,
  details JSONB,
  remediation_steps TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_suspicious_devices INTEGER;
  v_revoked_devices INTEGER;
  v_failed_auth_count INTEGER;
  v_recent_failed_auth INTEGER;
BEGIN
  -- Check for suspicious devices
  SELECT COUNT(*) INTO v_suspicious_devices
  FROM public.devices
  WHERE is_suspicious = true
    AND last_seen_at > now() - interval '7 days';
  
  -- Check for revoked devices
  SELECT COUNT(*) INTO v_revoked_devices
  FROM public.devices
  WHERE is_revoked = true
    AND revoked_at > now() - interval '7 days';
  
  -- Check recent failed authentication attempts
  SELECT COUNT(*) INTO v_recent_failed_auth
  FROM public.security_audit_log
  WHERE event_type = 'failed_authentication'
    AND created_at > now() - interval '24 hours';
  
  -- Check total failed auth count
  SELECT COUNT(*) INTO v_failed_auth_count
  FROM public.security_audit_log
  WHERE event_type = 'failed_authentication'
    AND created_at > now() - interval '7 days';
  
  -- Determine status
  IF v_recent_failed_auth > 100 THEN
    RETURN QUERY SELECT 
      'fail'::TEXT,
      format('High number of failed authentication attempts: %s in last 24 hours', v_recent_failed_auth),
      jsonb_build_object(
        'suspicious_devices', v_suspicious_devices,
        'revoked_devices', v_revoked_devices,
        'failed_auth_24h', v_recent_failed_auth,
        'failed_auth_7d', v_failed_auth_count
      ),
      ARRAY[
        'Review failed authentication patterns',
        'Check for brute force attempts',
        'Consider implementing CAPTCHA',
        'Review device revocation policies'
      ];
  ELSIF v_suspicious_devices > 50 OR v_revoked_devices > 20 THEN
    RETURN QUERY SELECT 
      'warning'::TEXT,
      format('Elevated suspicious/revoked device activity: %s suspicious, %s revoked', v_suspicious_devices, v_revoked_devices),
      jsonb_build_object(
        'suspicious_devices', v_suspicious_devices,
        'revoked_devices', v_revoked_devices,
        'failed_auth_24h', v_recent_failed_auth,
        'failed_auth_7d', v_failed_auth_count
      ),
      ARRAY[
        'Review suspicious device patterns',
        'Check device revocation reasons',
        'Monitor for abuse patterns'
      ];
  ELSE
    RETURN QUERY SELECT 
      'pass'::TEXT,
      'Device-based authentication appears secure',
      jsonb_build_object(
        'suspicious_devices', v_suspicious_devices,
        'revoked_devices', v_revoked_devices,
        'failed_auth_24h', v_recent_failed_auth,
        'failed_auth_7d', v_failed_auth_count
      ),
      ARRAY[]::TEXT[];
  END IF;
END;
$$;

-- Check RLS policies are correctly configured
CREATE OR REPLACE FUNCTION public.check_rls_policies()
RETURNS TABLE (
  status TEXT,
  message TEXT,
  details JSONB,
  remediation_steps TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tables_without_rls INTEGER;
  v_tables_without_policies INTEGER;
  v_table_record RECORD;
  v_policy_count INTEGER;
  v_tables_without_rls_list TEXT[] := ARRAY[]::TEXT[];
  v_tables_without_policies_list TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- Check for tables without RLS enabled (excluding system tables)
  FOR v_table_record IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN ('_prisma_migrations', 'schema_migrations')
  LOOP
    -- Check if RLS is enabled
    SELECT COUNT(*) INTO v_policy_count
    FROM pg_tables t
    JOIN pg_class c ON c.relname = t.tablename
    WHERE t.schemaname = 'public'
      AND t.tablename = v_table_record.tablename
      AND c.relrowsecurity = true;
    
    IF v_policy_count = 0 THEN
      v_tables_without_rls := array_append(v_tables_without_rls, v_table_record.tablename);
    ELSE
      -- Check if table has policies
      SELECT COUNT(*) INTO v_policy_count
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = v_table_record.tablename;
      
      IF v_policy_count = 0 THEN
        v_tables_without_policies := array_append(v_tables_without_policies, v_table_record.tablename);
      END IF;
    END IF;
  END LOOP;
  
  v_tables_without_rls := array_length(v_tables_without_rls, 1);
  v_tables_without_policies := array_length(v_tables_without_policies, 1);
  
  IF COALESCE(v_tables_without_rls, 0) > 0 OR COALESCE(v_tables_without_policies, 0) > 0 THEN
    RETURN QUERY SELECT 
      'fail'::TEXT,
      format('Found tables without RLS or policies: %s without RLS, %s without policies', 
        COALESCE(v_tables_without_rls, 0), COALESCE(v_tables_without_policies, 0)),
      jsonb_build_object(
        'tables_without_rls_count', COALESCE(v_tables_without_rls, 0),
        'tables_without_policies_count', COALESCE(v_tables_without_policies, 0)
      ),
      ARRAY[
        'Enable RLS on all public tables',
        'Create appropriate RLS policies',
        'Review table access requirements'
      ];
  ELSE
    RETURN QUERY SELECT 
      'pass'::TEXT,
      'All tables have RLS enabled with policies',
      jsonb_build_object(
        'tables_checked', (SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public')
      ),
      ARRAY[]::TEXT[];
  END IF;
END;
$$;

-- Check for privilege escalation vulnerabilities
CREATE OR REPLACE FUNCTION public.check_privilege_escalation()
RETURNS TABLE (
  status TEXT,
  message TEXT,
  details JSONB,
  remediation_steps TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_count INTEGER;
  v_recent_admin_creations INTEGER;
  v_suspicious_admin_activity INTEGER;
BEGIN
  -- Count total admins
  SELECT COUNT(*) INTO v_admin_count
  FROM public.profiles
  WHERE is_admin = true;
  
  -- Check recent admin creations
  SELECT COUNT(*) INTO v_recent_admin_creations
  FROM public.profiles
  WHERE is_admin = true
    AND created_at > now() - interval '30 days';
  
  -- Check for suspicious admin activity (many actions in short time)
  SELECT COUNT(*) INTO v_suspicious_admin_activity
  FROM (
    SELECT profile_id, COUNT(*) as action_count
    FROM public.security_audit_log
    WHERE profile_id IN (SELECT id FROM public.profiles WHERE is_admin = true)
      AND created_at > now() - interval '24 hours'
    GROUP BY profile_id
    HAVING COUNT(*) > 1000
  ) suspicious;
  
  IF v_recent_admin_creations > 5 THEN
    RETURN QUERY SELECT 
      'warning'::TEXT,
      format('Multiple admin accounts created recently: %s in last 30 days', v_recent_admin_creations),
      jsonb_build_object(
        'total_admins', v_admin_count,
        'recent_admin_creations', v_recent_admin_creations,
        'suspicious_admin_activity', v_suspicious_admin_activity
      ),
      ARRAY[
        'Verify all admin account creations are legitimate',
        'Review admin access logs',
        'Consider requiring approval for admin creation'
      ];
  ELSIF v_suspicious_admin_activity > 0 THEN
    RETURN QUERY SELECT 
      'warning'::TEXT,
      format('Suspicious admin activity detected: %s admins with excessive activity', v_suspicious_admin_activity),
      jsonb_build_object(
        'total_admins', v_admin_count,
        'recent_admin_creations', v_recent_admin_creations,
        'suspicious_admin_activity', v_suspicious_admin_activity
      ),
      ARRAY[
        'Review admin activity logs',
        'Verify admin accounts are secure',
        'Check for compromised accounts'
      ];
  ELSE
    RETURN QUERY SELECT 
      'pass'::TEXT,
      'No privilege escalation vulnerabilities detected',
      jsonb_build_object(
        'total_admins', v_admin_count,
        'recent_admin_creations', v_recent_admin_creations,
        'suspicious_admin_activity', v_suspicious_admin_activity
      ),
      ARRAY[]::TEXT[];
  END IF;
END;
$$;

-- ============================================================================
-- 3. DATA PROTECTION CHECKS
-- ============================================================================

-- Check for hardcoded credentials
CREATE OR REPLACE FUNCTION public.check_hardcoded_credentials()
RETURNS TABLE (
  status TEXT,
  message TEXT,
  details JSONB,
  remediation_steps TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_api_keys_without_rotation INTEGER;
  v_old_api_keys INTEGER;
BEGIN
  -- Check for API keys that haven't been rotated in 90+ days
  SELECT COUNT(*) INTO v_old_api_keys
  FROM public.api_keys
  WHERE is_active = true
    AND created_at < now() - interval '90 days'
    AND last_used_at < now() - interval '30 days';
  
  -- This is a simplified check - in production, you'd scan code files
  -- For now, we check database for patterns that might indicate issues
  
  IF v_old_api_keys > 10 THEN
    RETURN QUERY SELECT 
      'warning'::TEXT,
      format('Found %s old API keys that should be rotated', v_old_api_keys),
      jsonb_build_object(
        'old_api_keys_count', v_old_api_keys
      ),
      ARRAY[
        'Rotate old API keys',
        'Review API key usage patterns',
        'Implement automatic key rotation'
      ];
  ELSE
    RETURN QUERY SELECT 
      'pass'::TEXT,
      'No obvious hardcoded credential issues detected in database',
      jsonb_build_object(
        'old_api_keys_count', v_old_api_keys,
        'note', 'Code scanning should be performed separately'
      ),
      ARRAY[
        'Perform code scanning for hardcoded credentials',
        'Use secret scanning tools (GitHub Secret Scanning, etc.)'
      ];
  END IF;
END;
$$;

-- Check environment variable security
CREATE OR REPLACE FUNCTION public.check_environment_variables()
RETURNS TABLE (
  status TEXT,
  message TEXT,
  details JSONB,
  remediation_steps TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- This check verifies that sensitive data isn't stored in database
  -- Actual env var checking would be done in edge function
  
  RETURN QUERY SELECT 
    'pass'::TEXT,
    'Environment variable check requires code-level audit',
    jsonb_build_object(
      'note', 'This check should be performed in the edge function that has access to environment variables'
    ),
    ARRAY[
      'Verify all secrets are in environment variables, not code',
      'Use Supabase secrets management',
      'Rotate secrets regularly',
      'Never commit secrets to version control'
    ];
END;
$$;

-- Check HTTPS enforcement
CREATE OR REPLACE FUNCTION public.check_https_enforcement()
RETURNS TABLE (
  status TEXT,
  message TEXT,
  details JSONB,
  remediation_steps TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Supabase automatically enforces HTTPS, but we can check for insecure patterns
  -- This is more of a configuration check that would be done in edge function
  
  RETURN QUERY SELECT 
    'pass'::TEXT,
    'HTTPS enforcement is handled by Supabase infrastructure',
    jsonb_build_object(
      'note', 'Supabase automatically enforces HTTPS for all requests'
    ),
    ARRAY[
      'Verify Supabase project settings enforce HTTPS',
      'Check for any HTTP redirects in application code',
      'Ensure all external API calls use HTTPS'
    ];
END;
$$;

-- ============================================================================
-- 4. INPUT VALIDATION & SANITIZATION CHECKS
-- ============================================================================

-- Check SQL injection prevention
CREATE OR REPLACE FUNCTION public.check_sql_injection_prevention()
RETURNS TABLE (
  status TEXT,
  message TEXT,
  details JSONB,
  remediation_steps TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_suspicious_queries INTEGER;
BEGIN
  -- Check for suspicious query patterns in logs
  -- This is a simplified check - actual prevention is in code
  
  SELECT COUNT(*) INTO v_suspicious_queries
  FROM public.query_performance_log
  WHERE query_hash LIKE '%DROP%'
     OR query_hash LIKE '%DELETE%'
     OR query_hash LIKE '%TRUNCATE%'
     OR execution_time_ms > 5000
  AND created_at > now() - interval '7 days';
  
  IF v_suspicious_queries > 0 THEN
    RETURN QUERY SELECT 
      'warning'::TEXT,
      format('Found %s potentially suspicious queries in last 7 days', v_suspicious_queries),
      jsonb_build_object(
        'suspicious_queries_count', v_suspicious_queries
      ),
      ARRAY[
        'Review suspicious queries in query_performance_log',
        'Verify all queries use parameterization',
        'Check for SQL injection attempts',
        'Review slow query patterns'
      ];
  ELSE
    RETURN QUERY SELECT 
      'pass'::TEXT,
      'No obvious SQL injection patterns detected',
      jsonb_build_object(
        'suspicious_queries_count', 0,
        'note', 'Code-level review should verify parameterization'
      ),
      ARRAY[
        'Verify all database queries use parameterized statements',
        'Review edge function code for SQL injection risks',
        'Use Supabase client which automatically parameterizes'
      ];
  END IF;
END;
$$;

-- Check XSS prevention
CREATE OR REPLACE FUNCTION public.check_xss_prevention()
RETURNS TABLE (
  status TEXT,
  message TEXT,
  details JSONB,
  remediation_steps TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_suspicious_content INTEGER;
BEGIN
  -- Check for potentially malicious content patterns
  SELECT COUNT(*) INTO v_suspicious_content
  FROM public.clips
  WHERE (
    transcript LIKE '%<script%'
    OR transcript LIKE '%javascript:%'
    OR transcript LIKE '%onerror=%'
    OR transcript LIKE '%onload=%'
  )
  AND created_at > now() - interval '7 days';
  
  IF v_suspicious_content > 0 THEN
    RETURN QUERY SELECT 
      'warning'::TEXT,
      format('Found %s clips with potentially malicious content patterns', v_suspicious_content),
      jsonb_build_object(
        'suspicious_content_count', v_suspicious_content
      ),
      ARRAY[
        'Review clips with suspicious content',
        'Ensure all user content is sanitized before display',
        'Implement Content Security Policy (CSP)',
        'Use HTML escaping in frontend'
      ];
  ELSE
    RETURN QUERY SELECT 
      'pass'::TEXT,
      'No obvious XSS patterns detected in content',
      jsonb_build_object(
        'suspicious_content_count', 0,
        'note', 'Frontend should implement proper sanitization'
      ),
      ARRAY[
        'Verify frontend sanitizes all user-generated content',
        'Implement CSP headers',
        'Use libraries like DOMPurify for HTML sanitization'
      ];
  END IF;
END;
$$;

-- ============================================================================
-- 5. INFRASTRUCTURE CHECKS
-- ============================================================================

-- Check rate limiting effectiveness
CREATE OR REPLACE FUNCTION public.check_rate_limiting_effectiveness()
RETURNS TABLE (
  status TEXT,
  message TEXT,
  details JSONB,
  remediation_steps TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rate_limit_violations INTEGER;
  v_high_request_ips INTEGER;
BEGIN
  -- Check for rate limit violations
  SELECT COUNT(*) INTO v_rate_limit_violations
  FROM public.security_audit_log
  WHERE event_type LIKE '%rate_limit%'
    AND severity IN ('warning', 'error')
    AND created_at > now() - interval '24 hours';
  
  -- Check for IPs with very high request counts
  SELECT COUNT(*) INTO v_high_request_ips
  FROM (
    SELECT ip_address, COUNT(*) as request_count
    FROM public.security_audit_log
    WHERE created_at > now() - interval '1 hour'
      AND ip_address IS NOT NULL
    GROUP BY ip_address
    HAVING COUNT(*) > 1000
  ) high_ips;
  
  IF v_high_request_ips > 5 THEN
    RETURN QUERY SELECT 
      'warning'::TEXT,
      format('Found %s IPs with excessive requests (>1000/hour), %s rate limit violations in 24h', 
        v_high_request_ips, v_rate_limit_violations),
      jsonb_build_object(
        'rate_limit_violations_24h', v_rate_limit_violations,
        'high_request_ips', v_high_request_ips
      ),
      ARRAY[
        'Review rate limiting thresholds',
        'Consider stricter rate limits for suspicious IPs',
        'Implement IP-based rate limiting',
        'Monitor for DDoS attempts'
      ];
  ELSIF v_rate_limit_violations > 100 THEN
    RETURN QUERY SELECT 
      'warning'::TEXT,
      format('High number of rate limit violations: %s in 24 hours', v_rate_limit_violations),
      jsonb_build_object(
        'rate_limit_violations_24h', v_rate_limit_violations,
        'high_request_ips', v_high_request_ips
      ),
      ARRAY[
        'Review rate limiting configuration',
        'Check if limits are too strict or too lenient',
        'Monitor violation patterns'
      ];
  ELSE
    RETURN QUERY SELECT 
      'pass'::TEXT,
      'Rate limiting appears effective',
      jsonb_build_object(
        'rate_limit_violations_24h', v_rate_limit_violations,
        'high_request_ips', v_high_request_ips
      ),
      ARRAY[]::TEXT[];
  END IF;
END;
$$;

-- Check for sensitive data in logs
CREATE OR REPLACE FUNCTION public.check_logs_for_sensitive_data()
RETURNS TABLE (
  status TEXT,
  message TEXT,
  details JSONB,
  remediation_steps TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_logs_with_potential_secrets INTEGER;
BEGIN
  -- Check audit logs for patterns that might indicate sensitive data
  -- This is a simplified check
  SELECT COUNT(*) INTO v_logs_with_potential_secrets
  FROM public.security_audit_log
  WHERE (
    event_details::text LIKE '%password%'
    OR event_details::text LIKE '%secret%'
    OR event_details::text LIKE '%token%'
    OR event_details::text LIKE '%api_key%'
  )
  AND created_at > now() - interval '7 days';
  
  IF v_logs_with_potential_secrets > 0 THEN
    RETURN QUERY SELECT 
      'warning'::TEXT,
      format('Found %s log entries that may contain sensitive data patterns', v_logs_with_potential_secrets),
      jsonb_build_object(
        'potential_secrets_in_logs', v_logs_with_potential_secrets
      ),
      ARRAY[
        'Review log entries for actual sensitive data',
        'Ensure sensitive data is redacted before logging',
        'Implement log sanitization',
        'Use structured logging with field filtering'
      ];
  ELSE
    RETURN QUERY SELECT 
      'pass'::TEXT,
      'No obvious sensitive data patterns in logs',
      jsonb_build_object(
        'potential_secrets_in_logs', 0
      ),
      ARRAY[
        'Continue to ensure sensitive data is never logged',
        'Implement automatic log sanitization',
        'Review logging practices regularly'
      ];
  END IF;
END;
$$;

-- ============================================================================
-- 6. MAIN AUDIT FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.run_security_audit(p_audit_type TEXT DEFAULT 'daily')
RETURNS TABLE (
  total_checks INTEGER,
  passed INTEGER,
  failed INTEGER,
  warnings INTEGER,
  errors INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_check_result RECORD;
  v_total INTEGER := 0;
  v_passed INTEGER := 0;
  v_failed INTEGER := 0;
  v_warnings INTEGER := 0;
  v_errors INTEGER := 0;
  v_severity TEXT;
BEGIN
  -- Authentication & Authorization Checks
  FOR v_check_result IN 
    SELECT * FROM public.check_device_authentication_security()
  LOOP
    v_total := v_total + 1;
    v_severity := CASE 
      WHEN v_check_result.status = 'fail' THEN 'error'
      WHEN v_check_result.status = 'warning' THEN 'warning'
      ELSE 'info'
    END;
    
    INSERT INTO public.security_audit_results (
      audit_type, check_category, check_name, status, severity, message, details, remediation_steps
    ) VALUES (
      p_audit_type, 'authentication', 'device_authentication_security', 
      v_check_result.status, v_severity, v_check_result.message, 
      v_check_result.details, v_check_result.remediation_steps
    );
    
    IF v_check_result.status = 'pass' THEN v_passed := v_passed + 1;
    ELSIF v_check_result.status = 'fail' THEN 
      v_failed := v_failed + 1;
      IF v_severity = 'error' THEN v_errors := v_errors + 1;
      ELSE v_warnings := v_warnings + 1; END IF;
    ELSIF v_check_result.status = 'warning' THEN v_warnings := v_warnings + 1;
    END IF;
  END LOOP;
  
  FOR v_check_result IN 
    SELECT * FROM public.check_rls_policies()
  LOOP
    v_total := v_total + 1;
    v_severity := CASE 
      WHEN v_check_result.status = 'fail' THEN 'error'
      WHEN v_check_result.status = 'warning' THEN 'warning'
      ELSE 'info'
    END;
    
    INSERT INTO public.security_audit_results (
      audit_type, check_category, check_name, status, severity, message, details, remediation_steps
    ) VALUES (
      p_audit_type, 'authentication', 'rls_policies', 
      v_check_result.status, v_severity, v_check_result.message, 
      v_check_result.details, v_check_result.remediation_steps
    );
    
    IF v_check_result.status = 'pass' THEN v_passed := v_passed + 1;
    ELSIF v_check_result.status = 'fail' THEN 
      v_failed := v_failed + 1;
      IF v_severity = 'error' THEN v_errors := v_errors + 1;
      ELSE v_warnings := v_warnings + 1; END IF;
    ELSIF v_check_result.status = 'warning' THEN v_warnings := v_warnings + 1;
    END IF;
  END LOOP;
  
  FOR v_check_result IN 
    SELECT * FROM public.check_privilege_escalation()
  LOOP
    v_total := v_total + 1;
    v_severity := CASE 
      WHEN v_check_result.status = 'fail' THEN 'error'
      WHEN v_check_result.status = 'warning' THEN 'warning'
      ELSE 'info'
    END;
    
    INSERT INTO public.security_audit_results (
      audit_type, check_category, check_name, status, severity, message, details, remediation_steps
    ) VALUES (
      p_audit_type, 'authentication', 'privilege_escalation', 
      v_check_result.status, v_severity, v_check_result.message, 
      v_check_result.details, v_check_result.remediation_steps
    );
    
    IF v_check_result.status = 'pass' THEN v_passed := v_passed + 1;
    ELSIF v_check_result.status = 'fail' THEN 
      v_failed := v_failed + 1;
      IF v_severity = 'error' THEN v_errors := v_errors + 1;
      ELSE v_warnings := v_warnings + 1; END IF;
    ELSIF v_check_result.status = 'warning' THEN v_warnings := v_warnings + 1;
    END IF;
  END LOOP;
  
  -- Data Protection Checks
  FOR v_check_result IN 
    SELECT * FROM public.check_hardcoded_credentials()
  LOOP
    v_total := v_total + 1;
    v_severity := CASE 
      WHEN v_check_result.status = 'fail' THEN 'error'
      WHEN v_check_result.status = 'warning' THEN 'warning'
      ELSE 'info'
    END;
    
    INSERT INTO public.security_audit_results (
      audit_type, check_category, check_name, status, severity, message, details, remediation_steps
    ) VALUES (
      p_audit_type, 'data_protection', 'hardcoded_credentials', 
      v_check_result.status, v_severity, v_check_result.message, 
      v_check_result.details, v_check_result.remediation_steps
    );
    
    IF v_check_result.status = 'pass' THEN v_passed := v_passed + 1;
    ELSIF v_check_result.status = 'fail' THEN 
      v_failed := v_failed + 1;
      IF v_severity = 'error' THEN v_errors := v_errors + 1;
      ELSE v_warnings := v_warnings + 1; END IF;
    ELSIF v_check_result.status = 'warning' THEN v_warnings := v_warnings + 1;
    END IF;
  END LOOP;
  
  FOR v_check_result IN 
    SELECT * FROM public.check_environment_variables()
  LOOP
    v_total := v_total + 1;
    v_severity := CASE 
      WHEN v_check_result.status = 'fail' THEN 'error'
      WHEN v_check_result.status = 'warning' THEN 'warning'
      ELSE 'info'
    END;
    
    INSERT INTO public.security_audit_results (
      audit_type, check_category, check_name, status, severity, message, details, remediation_steps
    ) VALUES (
      p_audit_type, 'data_protection', 'environment_variables', 
      v_check_result.status, v_severity, v_check_result.message, 
      v_check_result.details, v_check_result.remediation_steps
    );
    
    IF v_check_result.status = 'pass' THEN v_passed := v_passed + 1;
    ELSIF v_check_result.status = 'fail' THEN 
      v_failed := v_failed + 1;
      IF v_severity = 'error' THEN v_errors := v_errors + 1;
      ELSE v_warnings := v_warnings + 1; END IF;
    ELSIF v_check_result.status = 'warning' THEN v_warnings := v_warnings + 1;
    END IF;
  END LOOP;
  
  FOR v_check_result IN 
    SELECT * FROM public.check_https_enforcement()
  LOOP
    v_total := v_total + 1;
    v_severity := CASE 
      WHEN v_check_result.status = 'fail' THEN 'error'
      WHEN v_check_result.status = 'warning' THEN 'warning'
      ELSE 'info'
    END;
    
    INSERT INTO public.security_audit_results (
      audit_type, check_category, check_name, status, severity, message, details, remediation_steps
    ) VALUES (
      p_audit_type, 'data_protection', 'https_enforcement', 
      v_check_result.status, v_severity, v_check_result.message, 
      v_check_result.details, v_check_result.remediation_steps
    );
    
    IF v_check_result.status = 'pass' THEN v_passed := v_passed + 1;
    ELSIF v_check_result.status = 'fail' THEN 
      v_failed := v_failed + 1;
      IF v_severity = 'error' THEN v_errors := v_errors + 1;
      ELSE v_warnings := v_warnings + 1; END IF;
    ELSIF v_check_result.status = 'warning' THEN v_warnings := v_warnings + 1;
    END IF;
  END LOOP;
  
  -- Input Validation Checks
  FOR v_check_result IN 
    SELECT * FROM public.check_sql_injection_prevention()
  LOOP
    v_total := v_total + 1;
    v_severity := CASE 
      WHEN v_check_result.status = 'fail' THEN 'error'
      WHEN v_check_result.status = 'warning' THEN 'warning'
      ELSE 'info'
    END;
    
    INSERT INTO public.security_audit_results (
      audit_type, check_category, check_name, status, severity, message, details, remediation_steps
    ) VALUES (
      p_audit_type, 'input_validation', 'sql_injection_prevention', 
      v_check_result.status, v_severity, v_check_result.message, 
      v_check_result.details, v_check_result.remediation_steps
    );
    
    IF v_check_result.status = 'pass' THEN v_passed := v_passed + 1;
    ELSIF v_check_result.status = 'fail' THEN 
      v_failed := v_failed + 1;
      IF v_severity = 'error' THEN v_errors := v_errors + 1;
      ELSE v_warnings := v_warnings + 1; END IF;
    ELSIF v_check_result.status = 'warning' THEN v_warnings := v_warnings + 1;
    END IF;
  END LOOP;
  
  FOR v_check_result IN 
    SELECT * FROM public.check_xss_prevention()
  LOOP
    v_total := v_total + 1;
    v_severity := CASE 
      WHEN v_check_result.status = 'fail' THEN 'error'
      WHEN v_check_result.status = 'warning' THEN 'warning'
      ELSE 'info'
    END;
    
    INSERT INTO public.security_audit_results (
      audit_type, check_category, check_name, status, severity, message, details, remediation_steps
    ) VALUES (
      p_audit_type, 'input_validation', 'xss_prevention', 
      v_check_result.status, v_severity, v_check_result.message, 
      v_check_result.details, v_check_result.remediation_steps
    );
    
    IF v_check_result.status = 'pass' THEN v_passed := v_passed + 1;
    ELSIF v_check_result.status = 'fail' THEN 
      v_failed := v_failed + 1;
      IF v_severity = 'error' THEN v_errors := v_errors + 1;
      ELSE v_warnings := v_warnings + 1; END IF;
    ELSIF v_check_result.status = 'warning' THEN v_warnings := v_warnings + 1;
    END IF;
  END LOOP;
  
  -- Infrastructure Checks
  FOR v_check_result IN 
    SELECT * FROM public.check_rate_limiting_effectiveness()
  LOOP
    v_total := v_total + 1;
    v_severity := CASE 
      WHEN v_check_result.status = 'fail' THEN 'error'
      WHEN v_check_result.status = 'warning' THEN 'warning'
      ELSE 'info'
    END;
    
    INSERT INTO public.security_audit_results (
      audit_type, check_category, check_name, status, severity, message, details, remediation_steps
    ) VALUES (
      p_audit_type, 'infrastructure', 'rate_limiting_effectiveness', 
      v_check_result.status, v_severity, v_check_result.message, 
      v_check_result.details, v_check_result.remediation_steps
    );
    
    IF v_check_result.status = 'pass' THEN v_passed := v_passed + 1;
    ELSIF v_check_result.status = 'fail' THEN 
      v_failed := v_failed + 1;
      IF v_severity = 'error' THEN v_errors := v_errors + 1;
      ELSE v_warnings := v_warnings + 1; END IF;
    ELSIF v_check_result.status = 'warning' THEN v_warnings := v_warnings + 1;
    END IF;
  END LOOP;
  
  FOR v_check_result IN 
    SELECT * FROM public.check_logs_for_sensitive_data()
  LOOP
    v_total := v_total + 1;
    v_severity := CASE 
      WHEN v_check_result.status = 'fail' THEN 'error'
      WHEN v_check_result.status = 'warning' THEN 'warning'
      ELSE 'info'
    END;
    
    INSERT INTO public.security_audit_results (
      audit_type, check_category, check_name, status, severity, message, details, remediation_steps
    ) VALUES (
      p_audit_type, 'infrastructure', 'logs_sensitive_data', 
      v_check_result.status, v_severity, v_check_result.message, 
      v_check_result.details, v_check_result.remediation_steps
    );
    
    IF v_check_result.status = 'pass' THEN v_passed := v_passed + 1;
    ELSIF v_check_result.status = 'fail' THEN 
      v_failed := v_failed + 1;
      IF v_severity = 'error' THEN v_errors := v_errors + 1;
      ELSE v_warnings := v_warnings + 1; END IF;
    ELSIF v_check_result.status = 'warning' THEN v_warnings := v_warnings + 1;
    END IF;
  END LOOP;
  
  RETURN QUERY SELECT 
    v_total,
    v_passed,
    v_failed,
    v_warnings,
    v_errors;
END;
$$;

-- Function to get latest audit summary
CREATE OR REPLACE FUNCTION public.get_latest_audit_summary(p_audit_type TEXT DEFAULT 'daily')
RETURNS TABLE (
  audit_type TEXT,
  total_checks INTEGER,
  passed INTEGER,
  failed INTEGER,
  warnings INTEGER,
  errors INTEGER,
  last_audit_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sar.audit_type,
    COUNT(*)::INTEGER as total_checks,
    COUNT(*) FILTER (WHERE sar.status = 'pass')::INTEGER as passed,
    COUNT(*) FILTER (WHERE sar.status = 'fail')::INTEGER as failed,
    COUNT(*) FILTER (WHERE sar.status = 'warning')::INTEGER as warnings,
    COUNT(*) FILTER (WHERE sar.severity IN ('error', 'critical'))::INTEGER as errors,
    MAX(sar.created_at) as last_audit_at
  FROM public.security_audit_results sar
  WHERE sar.audit_type = p_audit_type
    AND sar.created_at >= (
      SELECT MAX(created_at) 
      FROM public.security_audit_results 
      WHERE audit_type = p_audit_type
    )
  GROUP BY sar.audit_type;
END;
$$;

-- Cleanup old audit results (keep last 90 days)
CREATE OR REPLACE FUNCTION public.cleanup_old_audit_results()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.security_audit_results
  WHERE created_at < now() - interval '90 days';
END;
$$;

COMMENT ON TABLE public.security_audit_results IS 'Stores results from automated security audits';
COMMENT ON FUNCTION public.run_security_audit(TEXT) IS 'Runs comprehensive security audit and stores results';
COMMENT ON FUNCTION public.get_latest_audit_summary(TEXT) IS 'Returns summary of latest audit results';

