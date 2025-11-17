-- Enhanced API Key Security Features
-- Addresses SECURITY_TODO.md item #10 - API Key Abuse Prevention
-- Implements: rotation requirements, suspicious usage tracking, stricter rate limits

-- ============================================================================
-- 1. Add API Key Rotation Fields
-- ============================================================================

ALTER TABLE public.api_keys
ADD COLUMN IF NOT EXISTS last_rotated_at TIMESTAMPTZ, -- When the key was last rotated
ADD COLUMN IF NOT EXISTS rotation_required_after_days INTEGER DEFAULT 90, -- Require rotation every 90 days
ADD COLUMN IF NOT EXISTS rotation_warning_sent_at TIMESTAMPTZ, -- When rotation warning was sent
ADD COLUMN IF NOT EXISTS is_flagged_for_review BOOLEAN DEFAULT false, -- Flag for admin review
ADD COLUMN IF NOT EXISTS flagged_reason TEXT, -- Reason for flagging
ADD COLUMN IF NOT EXISTS flagged_at TIMESTAMPTZ; -- When flagged

-- Set initial last_rotated_at for existing keys
UPDATE public.api_keys
SET last_rotated_at = created_at
WHERE last_rotated_at IS NULL;

-- Create index for rotation tracking
CREATE INDEX IF NOT EXISTS idx_api_keys_rotation ON public.api_keys(rotation_required_after_days, last_rotated_at) 
WHERE is_active = true;

-- Create index for flagged keys
CREATE INDEX IF NOT EXISTS idx_api_keys_flagged ON public.api_keys(is_flagged_for_review) 
WHERE is_flagged_for_review = true;

-- ============================================================================
-- 2. Enhanced Suspicious Usage Tracking
-- ============================================================================

-- Track IP addresses per API key for pattern detection
CREATE TABLE IF NOT EXISTS public.api_key_ip_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID REFERENCES public.api_keys(id) ON DELETE CASCADE,
  ip_address TEXT NOT NULL,
  first_seen_at TIMESTAMPTZ DEFAULT now(),
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  request_count INTEGER DEFAULT 1,
  UNIQUE(api_key_id, ip_address)
);

CREATE INDEX IF NOT EXISTS idx_api_key_ip_history_api_key ON public.api_key_ip_history(api_key_id);
CREATE INDEX IF NOT EXISTS idx_api_key_ip_history_ip ON public.api_key_ip_history(ip_address);
CREATE INDEX IF NOT EXISTS idx_api_key_ip_history_last_seen ON public.api_key_ip_history(last_seen_at);

-- Function to update IP history and detect suspicious patterns
CREATE OR REPLACE FUNCTION public.update_api_key_ip_history(
  p_api_key_id UUID,
  p_ip_address TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_history RECORD;
  v_ip_count INTEGER;
  v_recent_ips INTEGER;
BEGIN
  -- Update or insert IP history
  INSERT INTO public.api_key_ip_history (api_key_id, ip_address, last_seen_at, request_count)
  VALUES (p_api_key_id, p_ip_address, now(), 1)
  ON CONFLICT (api_key_id, ip_address)
  DO UPDATE SET
    last_seen_at = now(),
    request_count = api_key_ip_history.request_count + 1;

  -- Count total unique IPs for this key in last 24 hours
  SELECT COUNT(DISTINCT ip_address) INTO v_recent_ips
  FROM public.api_key_ip_history
  WHERE api_key_id = p_api_key_id
    AND last_seen_at > now() - interval '24 hours';

  -- Count total unique IPs for this key
  SELECT COUNT(DISTINCT ip_address) INTO v_ip_count
  FROM public.api_key_ip_history
  WHERE api_key_id = p_api_key_id;

  -- Flag as suspicious if using more than 10 different IPs in 24 hours
  -- or more than 50 different IPs total (potential key sharing/leakage)
  IF v_recent_ips > 10 OR v_ip_count > 50 THEN
    UPDATE public.api_keys
    SET
      is_flagged_for_review = true,
      suspicious_usage_count = suspicious_usage_count + 1,
      flagged_reason = CASE
        WHEN v_recent_ips > 10 THEN 'High IP diversity in 24 hours (' || v_recent_ips || ' unique IPs)'
        WHEN v_ip_count > 50 THEN 'Excessive total IP diversity (' || v_ip_count || ' unique IPs)'
        ELSE flagged_reason
      END,
      flagged_at = COALESCE(flagged_at, now())
    WHERE id = p_api_key_id
      AND (is_flagged_for_review = false OR flagged_at IS NULL);
    
    RETURN true; -- Flagged as suspicious
  END IF;

  RETURN false; -- Not suspicious
END;
$$;

-- ============================================================================
-- 3. Enhanced validate_api_key with Rotation Check
-- ============================================================================

-- Drop the existing function first (required when changing return type)
DROP FUNCTION IF EXISTS public.validate_api_key(TEXT);

-- Create enhanced validate_api_key with rotation checks
CREATE FUNCTION public.validate_api_key(p_key_hash TEXT)
RETURNS TABLE (
  api_key_id UUID,
  profile_id UUID,
  scopes TEXT[],
  rate_limit_per_minute INTEGER,
  is_active BOOLEAN,
  expires_at TIMESTAMPTZ,
  rotation_required BOOLEAN,
  days_since_rotation INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_api_key RECORD;
  v_days_since_rotation INTEGER;
  v_rotation_required BOOLEAN;
BEGIN
  -- Get API key
  SELECT * INTO v_api_key
  FROM public.api_keys
  WHERE key_hash = p_key_hash
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now());
  
  IF NOT FOUND THEN
    RETURN; -- No key found
  END IF;

  -- Calculate days since rotation
  v_days_since_rotation := EXTRACT(EPOCH FROM (now() - COALESCE(v_api_key.last_rotated_at, v_api_key.created_at))) / 86400;
  
  -- Check if rotation is required
  v_rotation_required := v_days_since_rotation >= v_api_key.rotation_required_after_days;

  -- Update last_used_at
  UPDATE public.api_keys
  SET last_used_at = now()
  WHERE id = v_api_key.id;

  RETURN QUERY
  SELECT
    v_api_key.id,
    v_api_key.profile_id,
    v_api_key.scopes,
    v_api_key.rate_limit_per_minute,
    v_api_key.is_active,
    v_api_key.expires_at,
    v_rotation_required,
    v_days_since_rotation::INTEGER;
END;
$$;

-- ============================================================================
-- 4. Function to Flag API Keys for Suspicious Usage Patterns
-- ============================================================================

CREATE OR REPLACE FUNCTION public.flag_suspicious_api_usage(
  p_api_key_id UUID,
  p_reason TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.api_keys
  SET
    is_flagged_for_review = true,
    suspicious_usage_count = suspicious_usage_count + 1,
    flagged_reason = p_reason,
    flagged_at = COALESCE(flagged_at, now())
  WHERE id = p_api_key_id;
END;
$$;

-- ============================================================================
-- 5. Reduce Default Rate Limits
-- ============================================================================

-- Update default rate limit for new API keys (existing keys keep their current limit)
-- This will be applied to new keys only via application logic

-- ============================================================================
-- 6. Grants
-- ============================================================================

-- Re-grant permissions on validate_api_key (since we dropped and recreated it)
GRANT EXECUTE ON FUNCTION public.validate_api_key(TEXT) TO authenticated, anon;

GRANT EXECUTE ON FUNCTION public.update_api_key_ip_history(UUID, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.flag_suspicious_api_usage(UUID, TEXT) TO authenticated, anon;

-- ============================================================================
-- 7. Comments
-- ============================================================================

COMMENT ON COLUMN public.api_keys.last_rotated_at IS 'When the API key was last rotated';
COMMENT ON COLUMN public.api_keys.rotation_required_after_days IS 'Number of days after which rotation is required (default: 90)';
COMMENT ON COLUMN public.api_keys.rotation_warning_sent_at IS 'When a rotation warning email/notification was sent';
COMMENT ON COLUMN public.api_keys.is_flagged_for_review IS 'Whether this key has been flagged for admin review due to suspicious activity';
COMMENT ON COLUMN public.api_keys.flagged_reason IS 'Reason why this key was flagged';
COMMENT ON COLUMN public.api_keys.flagged_at IS 'When this key was flagged';
COMMENT ON TABLE public.api_key_ip_history IS 'Tracks IP addresses used with each API key for suspicious pattern detection';

