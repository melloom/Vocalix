-- Add admin IP ban functionality
-- Allows admins to ban IP addresses from the profile page

-- ============================================================================
-- 1. UPDATE RLS POLICIES FOR IP BLACKLIST (Allow admins to view/manage)
-- ============================================================================

-- Drop existing restrictive policy
DROP POLICY IF EXISTS "Service role only" ON public.ip_blacklist;
DROP POLICY IF EXISTS "Admins can view IP blacklist" ON public.ip_blacklist;
DROP POLICY IF EXISTS "Admins can create IP bans" ON public.ip_blacklist;
DROP POLICY IF EXISTS "Admins can update IP bans" ON public.ip_blacklist;

-- Allow admins to view IP blacklist
CREATE POLICY "Admins can view IP blacklist"
ON public.ip_blacklist FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.admins a ON a.profile_id = p.id
    WHERE p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Allow admins to insert IP bans
CREATE POLICY "Admins can create IP bans"
ON public.ip_blacklist FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.admins a ON a.profile_id = p.id
    WHERE p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
      AND p.id = banned_by
  )
);

-- Allow admins to update IP bans (for unbanning)
CREATE POLICY "Admins can update IP bans"
ON public.ip_blacklist FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.admins a ON a.profile_id = p.id
    WHERE p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.admins a ON a.profile_id = p.id
    WHERE p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- ============================================================================
-- 2. FUNCTION TO BAN IP ADDRESS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ban_ip_address(
  p_ip_address INET,
  p_reason TEXT DEFAULT NULL,
  p_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_profile_id UUID;
  v_ban_id UUID;
BEGIN
  -- Get admin profile ID
  SELECT p.id INTO v_admin_profile_id
  FROM public.profiles p
  JOIN public.admins a ON a.profile_id = p.id
  WHERE p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
  LIMIT 1;

  IF v_admin_profile_id IS NULL THEN
    RAISE EXCEPTION 'Only admins can ban IP addresses';
  END IF;

  -- Insert or update IP ban
  INSERT INTO public.ip_blacklist (
    ip_address,
    reason,
    banned_by,
    expires_at,
    is_active
  )
  VALUES (
    p_ip_address,
    p_reason,
    v_admin_profile_id,
    p_expires_at,
    true
  )
  ON CONFLICT (ip_address) DO UPDATE SET
    reason = COALESCE(EXCLUDED.reason, ip_blacklist.reason),
    banned_by = v_admin_profile_id,
    expires_at = COALESCE(EXCLUDED.expires_at, ip_blacklist.expires_at),
    is_active = true,
    banned_at = now()
  RETURNING id INTO v_ban_id;

  -- Log to moderation history if we have a profile context
  -- (This will be called from profile page with profile_id in details)
  
  RETURN v_ban_id;
END;
$$;

-- ============================================================================
-- 3. FUNCTION TO UNBAN IP ADDRESS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.unban_ip_address(p_ip_address INET)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    RAISE EXCEPTION 'Only admins can unban IP addresses';
  END IF;

  -- Deactivate the ban
  UPDATE public.ip_blacklist
  SET is_active = false
  WHERE ip_address = p_ip_address
    AND is_active = true;

  RETURN FOUND;
END;
$$;

-- ============================================================================
-- 4. FUNCTION TO GET IP ADDRESSES FOR A PROFILE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_profile_ip_addresses(p_profile_id UUID)
RETURNS TABLE (
  ip_address INET,
  device_count BIGINT,
  last_seen_at TIMESTAMPTZ,
  is_banned BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if caller is admin
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.admins a ON a.profile_id = p.id
    WHERE p.device_id = current_setting('request.headers', true)::json->>'x-device-id'
  ) THEN
    RAISE EXCEPTION 'Only admins can view IP addresses';
  END IF;

  RETURN QUERY
  SELECT 
    d.ip_address,
    COUNT(*)::BIGINT as device_count,
    MAX(d.last_seen_at) as last_seen_at,
    COALESCE(ib.is_active, false) as is_banned
  FROM public.devices d
  LEFT JOIN public.ip_blacklist ib ON ib.ip_address = d.ip_address AND ib.is_active = true
  WHERE d.profile_id = p_profile_id
    AND d.ip_address IS NOT NULL
  GROUP BY d.ip_address, ib.is_active
  ORDER BY MAX(d.last_seen_at) DESC;
END;
$$;

-- ============================================================================
-- 5. GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.ban_ip_address(INET, TEXT, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unban_ip_address(INET) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_profile_ip_addresses(UUID) TO authenticated;

