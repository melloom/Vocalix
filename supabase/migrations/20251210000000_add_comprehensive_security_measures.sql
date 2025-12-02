-- Comprehensive Security Measures
-- Implements: Database query rate limiting, automated ban system, enhanced audit logging

-- ============================================================================
-- 1. DATABASE QUERY RATE LIMITING
-- ============================================================================

-- Table to track expensive database queries
CREATE TABLE IF NOT EXISTS public.query_performance_log (
  id BIGSERIAL PRIMARY KEY,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  device_id TEXT,
  query_type TEXT NOT NULL, -- e.g., 'select', 'insert', 'update', 'delete'
  table_name TEXT,
  execution_time_ms NUMERIC NOT NULL,
  rows_returned INTEGER,
  query_hash TEXT, -- Hash of query for pattern detection
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance and analysis
CREATE INDEX IF NOT EXISTS query_perf_profile_time_idx 
  ON public.query_performance_log(profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS query_perf_device_time_idx 
  ON public.query_performance_log(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS query_perf_slow_queries_idx 
  ON public.query_performance_log(execution_time_ms DESC) 
  WHERE execution_time_ms > 1000; -- Queries over 1 second

-- Enable RLS
ALTER TABLE public.query_performance_log ENABLE ROW LEVEL SECURITY;

-- Policy: Only service role can access
CREATE POLICY "Query perf logs service role only"
ON public.query_performance_log
FOR ALL
USING (false)
WITH CHECK (false);

-- Function to check if a profile has exceeded query rate limits
CREATE OR REPLACE FUNCTION public.check_query_rate_limit(
  p_profile_id UUID,
  p_device_id TEXT,
  p_query_cost INTEGER DEFAULT 1 -- Cost weight for the query
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent_query_cost INTEGER;
  max_query_cost INTEGER := 1000; -- Max cost per hour
  window_start TIMESTAMPTZ;
BEGIN
  window_start := now() - interval '1 hour';
  
  -- Calculate total query cost in the last hour
  SELECT COALESCE(SUM(
    CASE 
      WHEN execution_time_ms > 5000 THEN 10 -- Very expensive queries cost more
      WHEN execution_time_ms > 1000 THEN 5  -- Expensive queries cost more
      ELSE 1
    END
  ), 0)
  INTO recent_query_cost
  FROM public.query_performance_log
  WHERE (profile_id = p_profile_id OR device_id = p_device_id)
    AND created_at >= window_start;
  
  -- Check if adding this query would exceed the limit
  RETURN (recent_query_cost + p_query_cost) <= max_query_cost;
END;
$$;

-- Function to log query performance
CREATE OR REPLACE FUNCTION public.log_query_performance(
  p_profile_id UUID DEFAULT NULL,
  p_device_id TEXT DEFAULT NULL,
  p_query_type TEXT DEFAULT 'select',
  p_table_name TEXT DEFAULT NULL,
  p_execution_time_ms NUMERIC DEFAULT 0,
  p_rows_returned INTEGER DEFAULT NULL,
  p_query_hash TEXT DEFAULT NULL,
  p_ip_address INET DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.query_performance_log (
    profile_id,
    device_id,
    query_type,
    table_name,
    execution_time_ms,
    rows_returned,
    query_hash,
    ip_address
  ) VALUES (
    p_profile_id,
    p_device_id,
    p_query_type,
    p_table_name,
    p_execution_time_ms,
    p_rows_returned,
    p_query_hash,
    p_ip_address
  );
  
  -- Auto-flag suspicious query patterns
  IF p_execution_time_ms > 5000 THEN
    PERFORM public.log_security_event(
      p_device_id,
      'slow_query_detected',
      p_profile_id,
      jsonb_build_object(
        'execution_time_ms', p_execution_time_ms,
        'query_type', p_query_type,
        'table_name', p_table_name
      ),
      p_ip_address,
      NULL,
      'warning'
    );
  END IF;
END;
$$;

-- ============================================================================
-- 2. AUTOMATED BAN SYSTEM
-- ============================================================================

-- Add ban status to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS banned_until TIMESTAMPTZ, -- NULL = permanent ban
ADD COLUMN IF NOT EXISTS ban_reason TEXT,
ADD COLUMN IF NOT EXISTS ban_count INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_ban_at TIMESTAMPTZ;

-- Index for banned profiles
CREATE INDEX IF NOT EXISTS profiles_banned_idx 
  ON public.profiles(is_banned) 
  WHERE is_banned = true;

-- Ban history table for tracking ban patterns
CREATE TABLE IF NOT EXISTS public.ban_history (
  id BIGSERIAL PRIMARY KEY,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  banned_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- NULL = automated
  ban_type TEXT NOT NULL CHECK (ban_type IN ('temporary', 'permanent', 'automated')),
  reason TEXT NOT NULL,
  duration_hours INTEGER, -- NULL = permanent
  banned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  unbanned_at TIMESTAMPTZ,
  unbanned_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ban_details JSONB DEFAULT '{}'::jsonb
);

-- Indexes
CREATE INDEX IF NOT EXISTS ban_history_profile_idx 
  ON public.ban_history(profile_id, banned_at DESC);
CREATE INDEX IF NOT EXISTS ban_history_active_idx 
  ON public.ban_history(profile_id) 
  WHERE unbanned_at IS NULL;

-- Enable RLS
ALTER TABLE public.ban_history ENABLE ROW LEVEL SECURITY;

-- Policy: Only service role can access
CREATE POLICY "Ban history service role only"
ON public.ban_history
FOR ALL
USING (false)
WITH CHECK (false);

-- Function to check if a profile is currently banned
CREATE OR REPLACE FUNCTION public.is_profile_banned(p_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_record public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO profile_record
  FROM public.profiles
  WHERE id = p_profile_id;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Check if banned
  IF NOT profile_record.is_banned THEN
    RETURN false;
  END IF;
  
  -- Check if temporary ban has expired
  IF profile_record.banned_until IS NOT NULL 
     AND profile_record.banned_until < now() THEN
    -- Auto-unban expired temporary bans
    UPDATE public.profiles
    SET 
      is_banned = false,
      banned_at = NULL,
      banned_until = NULL,
      ban_reason = NULL
    WHERE id = p_profile_id;
    
    -- Update ban history
    UPDATE public.ban_history
    SET unbanned_at = now()
    WHERE profile_id = p_profile_id
      AND unbanned_at IS NULL
      AND banned_until IS NOT NULL
      AND banned_until < now();
    
    RETURN false;
  END IF;
  
  RETURN true;
END;
$$;

-- Function to automatically ban repeat offenders
CREATE OR REPLACE FUNCTION public.check_and_auto_ban(
  p_profile_id UUID,
  p_violation_type TEXT,
  p_device_id TEXT DEFAULT NULL
)
RETURNS BOOLEAN -- Returns true if profile was banned
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  violation_count INTEGER;
  recent_violations INTEGER;
  profile_record public.profiles%ROWTYPE;
  ban_duration_hours INTEGER;
  ban_type TEXT;
BEGIN
  -- Get profile info
  SELECT * INTO profile_record
  FROM public.profiles
  WHERE id = p_profile_id;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Skip if already banned
  IF profile_record.is_banned THEN
    RETURN true;
  END IF;
  
  -- Count violations in last 24 hours
  SELECT COUNT(*) INTO recent_violations
  FROM public.security_audit_log
  WHERE profile_id = p_profile_id
    AND event_type LIKE '%violation%'
    AND created_at > now() - interval '24 hours';
  
  -- Count total violations
  SELECT COUNT(*) INTO violation_count
  FROM public.security_audit_log
  WHERE profile_id = p_profile_id
    AND severity IN ('error', 'critical')
    AND created_at > now() - interval '7 days';
  
  -- Auto-ban criteria:
  -- 1. 10+ violations in last 24 hours = temporary 24h ban
  -- 2. 50+ violations in last 7 days = temporary 7 day ban
  -- 3. 100+ violations in last 7 days = permanent ban
  
  IF recent_violations >= 10 THEN
    ban_duration_hours := 24;
    ban_type := 'temporary';
  ELSIF violation_count >= 100 THEN
    ban_duration_hours := NULL; -- Permanent
    ban_type := 'permanent';
  ELSIF violation_count >= 50 THEN
    ban_duration_hours := 168; -- 7 days
    ban_type := 'temporary';
  ELSE
    RETURN false; -- No ban needed
  END IF;
  
  -- Apply the ban
  UPDATE public.profiles
  SET 
    is_banned = true,
    banned_at = now(),
    banned_until = CASE 
      WHEN ban_duration_hours IS NULL THEN NULL 
      ELSE now() + (ban_duration_hours || ' hours')::interval 
    END,
    ban_reason = 'Automated ban: ' || violation_count || ' violations in last 7 days',
    ban_count = ban_count + 1,
    last_ban_at = now()
  WHERE id = p_profile_id;
  
  -- Record in ban history
  INSERT INTO public.ban_history (
    profile_id,
    banned_by_profile_id,
    ban_type,
    reason,
    duration_hours,
    ban_details
  ) VALUES (
    p_profile_id,
    NULL, -- Automated
    ban_type,
    'Automated ban: ' || violation_count || ' violations in last 7 days',
    ban_duration_hours,
    jsonb_build_object(
      'recent_violations_24h', recent_violations,
      'total_violations_7d', violation_count,
      'violation_type', p_violation_type
    )
  );
  
  -- Log security event
  PERFORM public.log_security_event(
    p_device_id,
    'profile_auto_banned',
    p_profile_id,
    jsonb_build_object(
      'ban_type', ban_type,
      'duration_hours', ban_duration_hours,
      'violation_count', violation_count,
      'recent_violations', recent_violations
    ),
    NULL,
    NULL,
    'critical'
  );
  
  RETURN true;
END;
$$;

-- Function to manually ban a profile (for admins)
CREATE OR REPLACE FUNCTION public.ban_profile(
  p_profile_id UUID,
  p_banned_by_profile_id UUID,
  p_reason TEXT,
  p_duration_hours INTEGER DEFAULT NULL -- NULL = permanent
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ban_type TEXT;
BEGIN
  ban_type := CASE 
    WHEN p_duration_hours IS NULL THEN 'permanent'
    ELSE 'temporary'
  END;
  
  -- Update profile
  UPDATE public.profiles
  SET 
    is_banned = true,
    banned_at = now(),
    banned_until = CASE 
      WHEN p_duration_hours IS NULL THEN NULL 
      ELSE now() + (p_duration_hours || ' hours')::interval 
    END,
    ban_reason = p_reason,
    ban_count = ban_count + 1,
    last_ban_at = now()
  WHERE id = p_profile_id;
  
  -- Record in ban history
  INSERT INTO public.ban_history (
    profile_id,
    banned_by_profile_id,
    ban_type,
    reason,
    duration_hours
  ) VALUES (
    p_profile_id,
    p_banned_by_profile_id,
    ban_type,
    p_reason,
    p_duration_hours
  );
  
  -- Log security event
  PERFORM public.log_security_event(
    NULL,
    'profile_manually_banned',
    p_profile_id,
    jsonb_build_object(
      'banned_by', p_banned_by_profile_id,
      'reason', p_reason,
      'duration_hours', p_duration_hours
    ),
    NULL,
    NULL,
    'error'
  );
END;
$$;

-- Function to unban a profile
CREATE OR REPLACE FUNCTION public.unban_profile(
  p_profile_id UUID,
  p_unbanned_by_profile_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update profile
  UPDATE public.profiles
  SET 
    is_banned = false,
    banned_at = NULL,
    banned_until = NULL,
    ban_reason = NULL
  WHERE id = p_profile_id;
  
  -- Update ban history
  UPDATE public.ban_history
  SET 
    unbanned_at = now(),
    unbanned_by_profile_id = p_unbanned_by_profile_id
  WHERE profile_id = p_profile_id
    AND unbanned_at IS NULL;
  
  -- Log security event
  PERFORM public.log_security_event(
    NULL,
    'profile_unbanned',
    p_profile_id,
    jsonb_build_object(
      'unbanned_by', p_unbanned_by_profile_id,
      'reason', p_reason
    ),
    NULL,
    NULL,
    'info'
  );
END;
$$;

-- ============================================================================
-- 3. ENHANCED AUDIT LOGGING
-- ============================================================================

-- Add additional fields to security_audit_log if they don't exist
DO $$ 
BEGIN
  -- Add request_id for tracking related events
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'security_audit_log' 
    AND column_name = 'request_id'
  ) THEN
    ALTER TABLE public.security_audit_log
    ADD COLUMN request_id TEXT;
  END IF;
  
  -- Add session_id for tracking user sessions
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'security_audit_log' 
    AND column_name = 'session_id'
  ) THEN
    ALTER TABLE public.security_audit_log
    ADD COLUMN session_id TEXT;
  END IF;
  
  -- Add action_type for categorizing actions
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'security_audit_log' 
    AND column_name = 'action_type'
  ) THEN
    ALTER TABLE public.security_audit_log
    ADD COLUMN action_type TEXT;
  END IF;
END $$;

-- Create index for request tracking
CREATE INDEX IF NOT EXISTS security_audit_request_idx 
  ON public.security_audit_log(request_id, created_at DESC);

-- Create index for session tracking
CREATE INDEX IF NOT EXISTS security_audit_session_idx 
  ON public.security_audit_log(session_id, created_at DESC);

-- Function to log security-sensitive operations with enhanced details
CREATE OR REPLACE FUNCTION public.log_security_operation(
  p_device_id TEXT,
  p_event_type TEXT,
  p_profile_id UUID DEFAULT NULL,
  p_action_type TEXT DEFAULT NULL,
  p_event_details JSONB DEFAULT '{}'::jsonb,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_severity TEXT DEFAULT 'info',
  p_request_id TEXT DEFAULT NULL,
  p_session_id TEXT DEFAULT NULL
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
    action_type,
    event_details,
    ip_address,
    user_agent,
    severity,
    request_id,
    session_id
  ) VALUES (
    p_device_id,
    p_profile_id,
    p_event_type,
    p_action_type,
    p_event_details,
    p_ip_address,
    p_user_agent,
    p_severity,
    p_request_id,
    p_session_id
  );
  
  -- Auto-check for ban if severity is critical or error
  IF p_severity IN ('error', 'critical') AND p_profile_id IS NOT NULL THEN
    PERFORM public.check_and_auto_ban(
      p_profile_id,
      p_event_type,
      p_device_id
    );
  END IF;
END;
$$;

-- ============================================================================
-- 4. CLEANUP FUNCTIONS
-- ============================================================================

-- Function to clean up old query performance logs
CREATE OR REPLACE FUNCTION public.cleanup_query_performance_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete logs older than 30 days
  DELETE FROM public.query_performance_log
  WHERE created_at < now() - interval '30 days';
END;
$$;

-- Function to clean up old security audit logs (keep critical/error longer)
CREATE OR REPLACE FUNCTION public.cleanup_security_audit_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete info/warning logs older than 90 days
  DELETE FROM public.security_audit_log
  WHERE severity IN ('info', 'warning')
    AND created_at < now() - interval '90 days';
  
  -- Delete error logs older than 1 year
  DELETE FROM public.security_audit_log
  WHERE severity = 'error'
    AND created_at < now() - interval '1 year';
  
  -- Keep critical logs indefinitely (or adjust as needed)
END;
$$;

-- ============================================================================
-- 5. GRANTS
-- ============================================================================

-- Grant execute permissions (only service role can execute these)
-- These functions are SECURITY DEFINER, so they run with elevated privileges

-- ============================================================================
-- 6. COMMENTS
-- ============================================================================

COMMENT ON TABLE public.query_performance_log IS 'Tracks database query performance to detect expensive queries and prevent abuse';
COMMENT ON TABLE public.ban_history IS 'Historical record of all profile bans for audit and pattern analysis';
COMMENT ON FUNCTION public.check_query_rate_limit IS 'Checks if a profile/device has exceeded query rate limits';
COMMENT ON FUNCTION public.check_and_auto_ban IS 'Automatically bans profiles that exceed violation thresholds';
COMMENT ON FUNCTION public.is_profile_banned IS 'Checks if a profile is currently banned (handles temporary ban expiration)';

