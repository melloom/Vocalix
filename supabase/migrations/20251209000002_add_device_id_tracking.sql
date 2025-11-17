-- Device ID Tracking and Rotation Limits
-- This migration adds device ID validation, rotation tracking, and limits
-- to prevent device ID manipulation and abuse

-- ============================================================================
-- Device ID Rotation Tracking Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.device_id_rotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  old_device_id TEXT,
  new_device_id TEXT NOT NULL,
  ip_address INET,
  user_agent TEXT,
  device_fingerprint TEXT,
  rotation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_suspicious BOOLEAN DEFAULT false
);

-- Indexes for device ID rotation tracking
CREATE INDEX IF NOT EXISTS idx_device_rotations_profile ON public.device_id_rotations(profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_rotations_new_device ON public.device_id_rotations(new_device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_rotations_old_device ON public.device_id_rotations(old_device_id, created_at DESC) WHERE old_device_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_device_rotations_suspicious ON public.device_id_rotations(is_suspicious) WHERE is_suspicious = true;

-- RLS for device ID rotations (only service role can access)
ALTER TABLE public.device_id_rotations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only" ON public.device_id_rotations;
CREATE POLICY "Service role only"
ON public.device_id_rotations
FOR ALL
USING (false) -- Deny all public access
WITH CHECK (false);

-- ============================================================================
-- Device ID Blacklist Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.device_id_blacklist (
  device_id TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  blacklisted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  blacklisted_by TEXT, -- admin or system
  expires_at TIMESTAMPTZ -- NULL means permanent
);

CREATE INDEX IF NOT EXISTS idx_device_blacklist_expires ON public.device_id_blacklist(expires_at) WHERE expires_at IS NOT NULL;

-- RLS for device blacklist (only service role can access)
ALTER TABLE public.device_id_blacklist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only" ON public.device_id_blacklist;
CREATE POLICY "Service role only"
ON public.device_id_blacklist
FOR ALL
USING (false)
WITH CHECK (false);

-- ============================================================================
-- Device ID Validation Function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.validate_device_id(p_device_id TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if device ID is NULL or empty
  IF p_device_id IS NULL OR trim(p_device_id) = '' THEN
    RETURN false;
  END IF;

  -- Check UUID format (8-4-4-4-12 hex characters)
  IF NOT (p_device_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::TEXT) THEN
    RETURN false;
  END IF;

  -- Check if device ID is blacklisted
  IF EXISTS (
    SELECT 1 FROM public.device_id_blacklist 
    WHERE device_id = p_device_id 
    AND (expires_at IS NULL OR expires_at > now())
  ) THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- Device ID Rotation Limit Check Function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_device_rotation_limit(
  p_profile_id UUID,
  p_new_device_id TEXT,
  p_max_rotations_per_day INTEGER DEFAULT 3
)
RETURNS TABLE (
  allowed BOOLEAN,
  reason TEXT,
  remaining_rotations INTEGER
) AS $$
DECLARE
  v_today_start TIMESTAMPTZ;
  v_rotation_count INTEGER;
BEGIN
  -- Start of today in UTC
  v_today_start := date_trunc('day', now());

  -- Count rotations today for this profile
  SELECT COUNT(*) INTO v_rotation_count
  FROM public.device_id_rotations
  WHERE profile_id = p_profile_id
  AND created_at >= v_today_start;

  -- Check limit
  IF v_rotation_count >= p_max_rotations_per_day THEN
    RETURN QUERY SELECT
      false::BOOLEAN AS allowed,
      format('Maximum of %s device ID rotations per day exceeded', p_max_rotations_per_day)::TEXT AS reason,
      0::INTEGER AS remaining_rotations;
    RETURN;
  END IF;

  -- Allowed
  RETURN QUERY SELECT
    true::BOOLEAN AS allowed,
    NULL::TEXT AS reason,
    (p_max_rotations_per_day - v_rotation_count)::INTEGER AS remaining_rotations;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- Track Device ID Change Function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.track_device_id_change(
  p_profile_id UUID,
  p_old_device_id TEXT,
  p_new_device_id TEXT,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_device_fingerprint TEXT DEFAULT NULL,
  p_rotation_reason TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_rotation_id UUID;
  v_is_suspicious BOOLEAN := false;
  v_recent_use_count INTEGER;
BEGIN
  -- Check if new device ID was recently used by another account
  SELECT COUNT(*) INTO v_recent_use_count
  FROM public.profiles
  WHERE device_id = p_new_device_id
  AND id != p_profile_id
  AND created_at > (now() - INTERVAL '7 days');

  IF v_recent_use_count > 0 THEN
    v_is_suspicious := true;
  END IF;

  -- Check for rapid rotation patterns (more than 3 rotations in last hour)
  SELECT COUNT(*) INTO v_recent_use_count
  FROM public.device_id_rotations
  WHERE profile_id = p_profile_id
  AND created_at > (now() - INTERVAL '1 hour');

  IF v_recent_use_count >= 3 THEN
    v_is_suspicious := true;
  END IF;

  -- Insert rotation record
  INSERT INTO public.device_id_rotations (
    profile_id,
    old_device_id,
    new_device_id,
    ip_address,
    user_agent,
    device_fingerprint,
    rotation_reason,
    is_suspicious
  )
  VALUES (
    p_profile_id,
    p_old_device_id,
    p_new_device_id,
    p_ip_address,
    p_user_agent,
    p_device_fingerprint,
    p_rotation_reason,
    v_is_suspicious
  )
  RETURNING id INTO v_rotation_id;

  -- Log suspicious activity to security audit log if suspicious
  IF v_is_suspicious THEN
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
      p_new_device_id,
      p_profile_id,
      'suspicious_device_rotation',
      jsonb_build_object(
        'old_device_id', p_old_device_id,
        'new_device_id', p_new_device_id,
        'rotation_reason', p_rotation_reason,
        'rotation_id', v_rotation_id
      ),
      p_ip_address,
      p_user_agent,
      'warning'
    );
  END IF;

  RETURN v_rotation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- Function to Check if Device ID Can Be Used
-- ============================================================================

CREATE OR REPLACE FUNCTION public.can_use_device_id(
  p_device_id TEXT,
  p_profile_id UUID DEFAULT NULL
)
RETURNS TABLE (
  allowed BOOLEAN,
  reason TEXT
) AS $$
BEGIN
  -- Validate format
  IF NOT public.validate_device_id(p_device_id) THEN
    RETURN QUERY SELECT
      false::BOOLEAN AS allowed,
      'Invalid device ID format or blacklisted'::TEXT AS reason;
    RETURN;
  END IF;

  -- Check if device ID is currently used by another profile
  IF p_profile_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.profiles
      WHERE device_id = p_device_id
      AND id != p_profile_id
      AND deleted_at IS NULL
    ) THEN
      -- Check if it was recently used (within 24 hours)
      IF EXISTS (
        SELECT 1 FROM public.profiles
        WHERE device_id = p_device_id
        AND id != p_profile_id
        AND deleted_at IS NULL
        AND updated_at > (now() - INTERVAL '24 hours')
      ) THEN
        RETURN QUERY SELECT
          false::BOOLEAN AS allowed,
          'Device ID was recently used by another account'::TEXT AS reason;
        RETURN;
      END IF;
    END IF;
  END IF;

  -- Allowed
  RETURN QUERY SELECT
    true::BOOLEAN AS allowed,
    NULL::TEXT AS reason;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- Add Device Fingerprint Column to Devices Table
-- ============================================================================

ALTER TABLE public.devices
ADD COLUMN IF NOT EXISTS device_fingerprint TEXT;

CREATE INDEX IF NOT EXISTS idx_devices_fingerprint ON public.devices(device_fingerprint) WHERE device_fingerprint IS NOT NULL;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE public.device_id_rotations IS 'Tracks device ID changes for security monitoring and abuse prevention';
COMMENT ON TABLE public.device_id_blacklist IS 'Blacklist of banned device IDs';
COMMENT ON FUNCTION public.validate_device_id(TEXT) IS 'Validates device ID format and checks blacklist';
COMMENT ON FUNCTION public.check_device_rotation_limit(UUID, TEXT, INTEGER) IS 'Checks if profile has exceeded device ID rotation limit';
COMMENT ON FUNCTION public.track_device_id_change(UUID, TEXT, TEXT, INET, TEXT, TEXT, TEXT) IS 'Tracks device ID changes and flags suspicious patterns';
COMMENT ON FUNCTION public.can_use_device_id(TEXT, UUID) IS 'Checks if a device ID can be used (not blacklisted, not recently used by another account)';

