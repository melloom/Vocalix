-- Account Creation Limits and Handle Validation
-- This migration adds IP-based rate limiting, case-insensitive handle checking,
-- reserved usernames, and account creation tracking

-- ============================================================================
-- IP-based Account Creation Tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.account_creation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address INET NOT NULL,
  device_id TEXT,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_agent TEXT,
  device_fingerprint TEXT
);

-- Indexes for account creation logs
CREATE INDEX IF NOT EXISTS idx_account_creation_logs_ip ON public.account_creation_logs(ip_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_account_creation_logs_device ON public.account_creation_logs(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_account_creation_logs_profile ON public.account_creation_logs(profile_id);

-- RLS for account creation logs (only service role can access)
ALTER TABLE public.account_creation_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only" ON public.account_creation_logs;
CREATE POLICY "Service role only"
ON public.account_creation_logs
FOR ALL
USING (false) -- Deny all public access
WITH CHECK (false);

-- ============================================================================
-- Case-Insensitive Handle Constraint
-- ============================================================================

-- Create a unique index on lowercased handle (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_handle_lower ON public.profiles(LOWER(handle));

-- Add constraint to ensure handles are stored in lowercase
-- Note: This will be enforced by application code and database triggers

-- ============================================================================
-- Reserved Usernames Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.reserved_handles (
  handle TEXT PRIMARY KEY,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Insert reserved usernames
INSERT INTO public.reserved_handles (handle, reason) VALUES
  ('admin', 'Reserved for administrators'),
  ('administrator', 'Reserved for administrators'),
  ('mod', 'Reserved for moderators'),
  ('moderator', 'Reserved for moderators'),
  ('support', 'Reserved for support team'),
  ('help', 'Reserved for support team'),
  ('echo', 'Reserved for official account'),
  ('echogarden', 'Reserved for official account'),
  ('echo-garden', 'Reserved for official account'),
  ('api', 'Reserved for API'),
  ('system', 'Reserved for system'),
  ('root', 'Reserved for system'),
  ('test', 'Reserved for testing'),
  ('null', 'Reserved'),
  ('undefined', 'Reserved'),
  ('true', 'Reserved'),
  ('false', 'Reserved'),
  ('www', 'Reserved'),
  ('mail', 'Reserved'),
  ('ftp', 'Reserved')
ON CONFLICT (handle) DO NOTHING;

-- ============================================================================
-- Functions for Account Creation Validation
-- ============================================================================

-- Function to check if handle is reserved
CREATE OR REPLACE FUNCTION public.is_handle_reserved(p_handle TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.reserved_handles
    WHERE LOWER(handle) = LOWER(p_handle)
  );
END;
$$;

-- Function to check if handle is available (case-insensitive)
CREATE OR REPLACE FUNCTION public.is_handle_available(p_handle TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if reserved
  IF public.is_handle_reserved(p_handle) THEN
    RETURN false;
  END IF;
  
  -- Check if already exists (case-insensitive)
  RETURN NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE LOWER(handle) = LOWER(p_handle)
  );
END;
$$;

-- Function to check IP-based rate limits for account creation
CREATE OR REPLACE FUNCTION public.check_account_creation_rate_limit(
  p_ip_address INET,
  p_max_accounts_per_24h INTEGER DEFAULT 3,
  p_max_accounts_per_hour INTEGER DEFAULT 1
)
RETURNS TABLE (
  allowed BOOLEAN,
  reason TEXT,
  retry_after TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_accounts_last_24h INTEGER;
  v_accounts_last_hour INTEGER;
  v_last_account_created TIMESTAMPTZ;
  v_hourly_limit_reached BOOLEAN := false;
  v_daily_limit_reached BOOLEAN := false;
BEGIN
  -- Count accounts created in last 24 hours
  SELECT COUNT(*), MAX(created_at)
  INTO v_accounts_last_24h, v_last_account_created
  FROM public.account_creation_logs
  WHERE ip_address = p_ip_address
    AND created_at > now() - interval '24 hours';
  
  -- Count accounts created in last hour
  SELECT COUNT(*)
  INTO v_accounts_last_hour
  FROM public.account_creation_logs
  WHERE ip_address = p_ip_address
    AND created_at > now() - interval '1 hour';
  
  -- Check hourly limit
  IF v_accounts_last_hour >= p_max_accounts_per_hour THEN
    v_hourly_limit_reached := true;
    RETURN QUERY SELECT
      false,
      format('Account creation rate limit exceeded. Maximum %s account(s) per hour allowed.', p_max_accounts_per_hour),
      (SELECT MAX(created_at) + interval '1 hour' FROM public.account_creation_logs WHERE ip_address = p_ip_address AND created_at > now() - interval '1 hour');
  END IF;
  
  -- Check daily limit
  IF v_accounts_last_24h >= p_max_accounts_per_24h THEN
    v_daily_limit_reached := true;
    RETURN QUERY SELECT
      false,
      format('Account creation rate limit exceeded. Maximum %s account(s) per 24 hours allowed.', p_max_accounts_per_24h),
      (SELECT MAX(created_at) + interval '24 hours' FROM public.account_creation_logs WHERE ip_address = p_ip_address AND created_at > now() - interval '24 hours');
  END IF;
  
  -- Allowed
  IF NOT v_hourly_limit_reached AND NOT v_daily_limit_reached THEN
    RETURN QUERY SELECT true, NULL::TEXT, NULL::TIMESTAMPTZ;
  END IF;
END;
$$;

-- Function to log account creation
CREATE OR REPLACE FUNCTION public.log_account_creation(
  p_ip_address INET,
  p_device_id TEXT,
  p_profile_id UUID,
  p_user_agent TEXT DEFAULT NULL,
  p_device_fingerprint TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO public.account_creation_logs (
    ip_address,
    device_id,
    profile_id,
    user_agent,
    device_fingerprint
  )
  VALUES (
    p_ip_address,
    p_device_id,
    p_profile_id,
    p_user_agent,
    p_device_fingerprint
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;

-- Function to validate device ID format
CREATE OR REPLACE FUNCTION public.is_valid_device_id(p_device_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- UUID format: 8-4-4-4-12 hex characters
  RETURN p_device_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::TEXT;
END;
$$;

-- ============================================================================
-- Trigger to Ensure Lowercase Handles
-- ============================================================================

-- Function to normalize handle to lowercase before insert/update
CREATE OR REPLACE FUNCTION public.normalize_handle()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Normalize handle to lowercase
  NEW.handle := LOWER(TRIM(NEW.handle));
  RETURN NEW;
END;
$$;

-- Drop trigger if exists
DROP TRIGGER IF EXISTS trigger_normalize_handle_on_profiles ON public.profiles;

-- Create trigger to normalize handles
CREATE TRIGGER trigger_normalize_handle_on_profiles
BEFORE INSERT OR UPDATE OF handle ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.normalize_handle();

-- ============================================================================
-- Cleanup Function for Old Logs
-- ============================================================================

-- Function to clean up old account creation logs (older than 30 days)
CREATE OR REPLACE FUNCTION public.cleanup_account_creation_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.account_creation_logs
  WHERE created_at < now() - interval '30 days';
END;
$$;

-- ============================================================================
-- Trigger to Auto-Log Account Creation
-- ============================================================================

-- Function to automatically log account creation when profile is created
CREATE OR REPLACE FUNCTION public.trigger_log_account_creation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_device_id TEXT;
  v_ip_address INET;
  v_user_agent TEXT;
BEGIN
  -- Try to get device_id and IP from request headers (if available)
  BEGIN
    v_device_id := NEW.device_id;
    v_ip_address := (current_setting('request.headers', true)::json->>'x-forwarded-for')::INET;
    v_user_agent := current_setting('request.headers', true)::json->>'user-agent';
  EXCEPTION
    WHEN OTHERS THEN
      v_device_id := NEW.device_id;
      v_ip_address := NULL;
      v_user_agent := NULL;
  END;
  
  -- Log the account creation (non-blocking)
  BEGIN
    PERFORM public.log_account_creation(
      v_ip_address,
      v_device_id,
      NEW.id,
      v_user_agent,
      NULL -- device_fingerprint (not available in trigger)
    );
  EXCEPTION
    WHEN OTHERS THEN
      -- Log error but don't fail the insert
      RAISE WARNING 'Failed to log account creation: %', SQLERRM;
  END;
  
  RETURN NEW;
END;
$$;

-- Drop trigger if exists
DROP TRIGGER IF EXISTS trigger_log_account_creation_on_profiles ON public.profiles;

-- Create trigger to log account creation
CREATE TRIGGER trigger_log_account_creation_on_profiles
AFTER INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.trigger_log_account_creation();

-- ============================================================================
-- Update change_pseudonym function to use case-insensitive checking
-- ============================================================================

CREATE OR REPLACE FUNCTION public.change_pseudonym(new_handle TEXT)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requester_profile public.profiles%ROWTYPE;
  sanitized_handle TEXT;
  rate_limit_window INTERVAL := interval '7 days';
BEGIN
  requester_profile := public.get_request_profile();

  -- Normalize handle (lowercase, trim)
  sanitized_handle := LOWER(TRIM(new_handle));

  -- Validate length
  IF sanitized_handle IS NULL OR length(sanitized_handle) < 3 THEN
    RAISE EXCEPTION 'Handle must be at least 3 characters';
  END IF;

  -- Replace spaces with hyphens
  IF sanitized_handle ~ '[\s]' THEN
    sanitized_handle := regexp_replace(sanitized_handle, '\s+', '-', 'g');
  END IF;

  -- Check if reserved
  IF public.is_handle_reserved(sanitized_handle) THEN
    RAISE EXCEPTION 'That handle is reserved';
  END IF;

  -- Check if available (case-insensitive)
  IF NOT public.is_handle_available(sanitized_handle) THEN
    RAISE EXCEPTION 'That handle is already taken';
  END IF;

  -- Check rate limit
  IF requester_profile.handle_last_changed_at IS NOT NULL
     AND requester_profile.handle_last_changed_at > (now() - rate_limit_window) THEN
    RAISE EXCEPTION 'You can change your handle again %s',
      to_char(requester_profile.handle_last_changed_at + rate_limit_window, 'Mon DD, YYYY');
  END IF;

  -- Update handle
  BEGIN
    UPDATE public.profiles
    SET handle = sanitized_handle,
        handle_last_changed_at = now()
    WHERE id = requester_profile.id
    RETURNING * INTO requester_profile;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'That handle is already taken';
  END;

  RETURN requester_profile;
END;
$$;

