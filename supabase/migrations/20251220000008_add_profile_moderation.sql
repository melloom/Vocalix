-- Add profile moderation features: warnings, mute, pause, delete
-- This allows admins to moderate profiles directly from profile pages

-- ============================================================================
-- 1. PROFILE WARNINGS TABLE (with acknowledgment requirement)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.profile_warnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  admin_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  warning_type TEXT NOT NULL CHECK (warning_type IN ('content', 'behavior', 'spam', 'harassment', 'other')),
  message TEXT NOT NULL,
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ, -- Optional expiration date
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical'))
);

CREATE INDEX IF NOT EXISTS idx_profile_warnings_profile ON public.profile_warnings(profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profile_warnings_unacknowledged ON public.profile_warnings(profile_id, acknowledged) WHERE acknowledged = false;
CREATE INDEX IF NOT EXISTS idx_profile_warnings_admin ON public.profile_warnings(admin_profile_id, created_at DESC);

-- RLS for profile warnings
ALTER TABLE public.profile_warnings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own warnings" ON public.profile_warnings;
DROP POLICY IF EXISTS "Admins can view all warnings" ON public.profile_warnings;
DROP POLICY IF EXISTS "Admins can create warnings" ON public.profile_warnings;
DROP POLICY IF EXISTS "Users can acknowledge their warnings" ON public.profile_warnings;

-- Users can view their own warnings
CREATE POLICY "Users can view their own warnings"
ON public.profile_warnings FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = profile_id
      AND p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Admins can view all warnings
CREATE POLICY "Admins can view all warnings"
ON public.profile_warnings FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.admins a ON a.profile_id = p.id
    WHERE p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Admins can create warnings
CREATE POLICY "Admins can create warnings"
ON public.profile_warnings FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.admins a ON a.profile_id = p.id
    WHERE p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
      AND p.id = admin_profile_id
  )
);

-- Users can acknowledge their own warnings
CREATE POLICY "Users can acknowledge their warnings"
ON public.profile_warnings FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = profile_id
      AND p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = profile_id
      AND p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- ============================================================================
-- 2. ADD MODERATION FIELDS TO PROFILES TABLE
-- ============================================================================

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_muted BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS muted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS muted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS mute_reason TEXT,
ADD COLUMN IF NOT EXISTS is_paused BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS paused_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS paused_until TIMESTAMPTZ, -- Optional: auto-unpause date
ADD COLUMN IF NOT EXISTS pause_reason TEXT,
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS delete_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_moderation ON public.profiles(is_muted, is_paused, is_deleted, is_banned);

-- ============================================================================
-- 3. PROFILE MODERATION HISTORY TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.profile_moderation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  admin_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('mute', 'unmute', 'pause', 'unpause', 'delete', 'warn', 'ban', 'unban')),
  reason TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profile_moderation_history_profile ON public.profile_moderation_history(profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profile_moderation_history_admin ON public.profile_moderation_history(admin_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profile_moderation_history_action ON public.profile_moderation_history(action_type, created_at DESC);

-- RLS for moderation history (admins only)
ALTER TABLE public.profile_moderation_history ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Admins can view moderation history" ON public.profile_moderation_history;
DROP POLICY IF EXISTS "Admins can create moderation history" ON public.profile_moderation_history;

CREATE POLICY "Admins can view moderation history"
ON public.profile_moderation_history FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.admins a ON a.profile_id = p.id
    WHERE p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

CREATE POLICY "Admins can create moderation history"
ON public.profile_moderation_history FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.admins a ON a.profile_id = p.id
    WHERE p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
      AND p.id = admin_profile_id
  )
);

-- ============================================================================
-- 4. FUNCTION TO ACKNOWLEDGE WARNING
-- ============================================================================

CREATE OR REPLACE FUNCTION public.acknowledge_warning(p_warning_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile_id UUID;
BEGIN
  -- Get the profile_id for this warning
  SELECT profile_id INTO v_profile_id
  FROM public.profile_warnings
  WHERE id = p_warning_id;

  IF v_profile_id IS NULL THEN
    RETURN false;
  END IF;

  -- Verify the user owns this profile
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = v_profile_id
      AND p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
  ) THEN
    RETURN false;
  END IF;

  -- Update the warning
  UPDATE public.profile_warnings
  SET acknowledged = true,
      acknowledged_at = now()
  WHERE id = p_warning_id
    AND acknowledged = false;

  RETURN FOUND;
END;
$$;

-- ============================================================================
-- 5. FUNCTION TO MODERATE PROFILE (mute, pause, delete)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.moderate_profile(
  p_profile_id UUID,
  p_action TEXT,
  p_reason TEXT DEFAULT NULL,
  p_details JSONB DEFAULT '{}'::jsonb,
  p_paused_until TIMESTAMPTZ DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_profile_id UUID;
BEGIN
  -- Get admin profile ID
  SELECT p.id INTO v_admin_profile_id
  FROM public.profiles p
  JOIN public.admins a ON a.profile_id = p.id
  WHERE p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
  LIMIT 1;

  IF v_admin_profile_id IS NULL THEN
    RAISE EXCEPTION 'Only admins can moderate profiles';
  END IF;

  -- Perform the action
  CASE p_action
    WHEN 'mute' THEN
      UPDATE public.profiles
      SET is_muted = true,
          muted_at = now(),
          muted_by = v_admin_profile_id,
          mute_reason = p_reason
      WHERE id = p_profile_id;

    WHEN 'unmute' THEN
      UPDATE public.profiles
      SET is_muted = false,
          muted_at = NULL,
          muted_by = NULL,
          mute_reason = NULL
      WHERE id = p_profile_id;

    WHEN 'pause' THEN
      UPDATE public.profiles
      SET is_paused = true,
          paused_at = now(),
          paused_by = v_admin_profile_id,
          paused_until = p_paused_until,
          pause_reason = p_reason
      WHERE id = p_profile_id;

    WHEN 'unpause' THEN
      UPDATE public.profiles
      SET is_paused = false,
          paused_at = NULL,
          paused_by = NULL,
          paused_until = NULL,
          pause_reason = NULL
      WHERE id = p_profile_id;

    WHEN 'delete' THEN
      UPDATE public.profiles
      SET is_deleted = true,
          deleted_at = now(),
          deleted_by = v_admin_profile_id,
          delete_reason = p_reason
      WHERE id = p_profile_id;

    WHEN 'ban' THEN
      -- IP ban is handled separately, this just logs the action
      -- The actual IP ban is done via ban_ip_address function
      NULL;

    WHEN 'unban' THEN
      -- IP unban is handled separately, this just logs the action
      -- The actual IP unban is done via unban_ip_address function
      NULL;

    ELSE
      RAISE EXCEPTION 'Invalid action: %', p_action;
  END CASE;

  -- Log to moderation history
  INSERT INTO public.profile_moderation_history (
    profile_id,
    admin_profile_id,
    action_type,
    reason,
    details
  ) VALUES (
    p_profile_id,
    v_admin_profile_id,
    p_action,
    p_reason,
    p_details
  );

  RETURN true;
END;
$$;

-- ============================================================================
-- 6. FUNCTION TO CREATE WARNING
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_profile_warning(
  p_profile_id UUID,
  p_warning_type TEXT,
  p_message TEXT,
  p_severity TEXT DEFAULT 'medium',
  p_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_profile_id UUID;
  v_warning_id UUID;
BEGIN
  -- Get admin profile ID
  SELECT p.id INTO v_admin_profile_id
  FROM public.profiles p
  JOIN public.admins a ON a.profile_id = p.id
  WHERE p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
  LIMIT 1;

  IF v_admin_profile_id IS NULL THEN
    RAISE EXCEPTION 'Only admins can create warnings';
  END IF;

  -- Create the warning
  INSERT INTO public.profile_warnings (
    profile_id,
    admin_profile_id,
    warning_type,
    message,
    severity,
    expires_at
  ) VALUES (
    p_profile_id,
    v_admin_profile_id,
    p_warning_type,
    p_message,
    p_severity,
    p_expires_at
  ) RETURNING id INTO v_warning_id;

  -- Log to moderation history
  INSERT INTO public.profile_moderation_history (
    profile_id,
    admin_profile_id,
    action_type,
    reason,
    details
  ) VALUES (
    p_profile_id,
    v_admin_profile_id,
    'warn',
    p_message,
    jsonb_build_object('warning_type', p_warning_type, 'severity', p_severity, 'warning_id', v_warning_id)
  );

  RETURN v_warning_id;
END;
$$;

-- ============================================================================
-- 7. AUTO-UNPAUSE FUNCTION (for scheduled unpauses)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_unpause_profiles()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.profiles
  SET is_paused = false,
      paused_at = NULL,
      paused_by = NULL,
      paused_until = NULL,
      pause_reason = NULL
  WHERE is_paused = true
    AND paused_until IS NOT NULL
    AND paused_until <= now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.acknowledge_warning(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.moderate_profile(UUID, TEXT, TEXT, JSONB, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_profile_warning(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ) TO authenticated;

