-- Grant System Admins Full Access - SAFE VERSION
-- This is a simplified version to avoid deadlocks
-- Run this FIRST, then run the full migration during low-traffic periods

-- ============================================================================
-- STEP 1: CREATE HELPER FUNCTION (SAFE - NO LOCKS NEEDED)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_system_admin(p_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  -- Check if profile_id exists in admins table
  RETURN EXISTS(
    SELECT 1 
    FROM public.admins a
    WHERE a.profile_id = p_profile_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_system_admin(UUID) TO authenticated, anon;

COMMENT ON FUNCTION public.is_system_admin(UUID) IS 
'Returns true if the profile is a system admin with full access to all resources';

-- ============================================================================
-- STEP 2: ADD ADMIN PROFILE (SAFE)
-- ============================================================================

INSERT INTO public.admins (profile_id, role, created_at)
VALUES ('a8c24193-3912-4a7e-af33-328b3c756a32'::uuid, 'admin', now())
ON CONFLICT (profile_id) DO UPDATE 
SET role = 'admin', created_at = now();

-- ============================================================================
-- STEP 3: UPDATE HELPER FUNCTIONS TO CHECK FOR ADMINS (SAFE - NO LOCKS)
-- ============================================================================

-- Update is_community_host to allow admins
CREATE OR REPLACE FUNCTION public.is_community_host(
  p_community_id UUID,
  p_profile_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  -- Admins are considered hosts for all communities
  IF public.is_system_admin(p_profile_id) THEN
    RETURN true;
  END IF;
  
  RETURN EXISTS(
    SELECT 1 
    FROM public.communities c
    WHERE c.id = p_community_id 
    AND c.created_by_profile_id = p_profile_id
  );
END;
$$;

-- Update moderator_has_permission to check for admins first
CREATE OR REPLACE FUNCTION public.moderator_has_permission(
  p_community_id UUID,
  p_profile_id UUID,
  p_permission TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_is_host BOOLEAN;
  v_is_moderator BOOLEAN;
  v_permissions JSONB;
BEGIN
  -- Admins have all permissions
  SELECT public.is_system_admin(p_profile_id) INTO v_is_admin;
  IF v_is_admin THEN
    RETURN true;
  END IF;
  
  -- Hosts have all permissions
  SELECT public.is_community_host(p_community_id, p_profile_id) INTO v_is_host;
  IF v_is_host THEN
    RETURN true;
  END IF;
  
  -- Check if user is a moderator
  SELECT public.is_community_moderator(p_community_id, p_profile_id) INTO v_is_moderator;
  IF NOT v_is_moderator THEN
    RETURN false;
  END IF;
  
  -- Get moderator permissions
  SELECT cm.permissions INTO v_permissions
  FROM public.community_moderators cm
  WHERE cm.community_id = p_community_id 
  AND cm.moderator_profile_id = p_profile_id;
  
  -- Check if permission is granted (default to false if not specified)
  RETURN COALESCE((v_permissions->>p_permission)::boolean, false);
END;
$$;

-- Update can_view_community to allow admins
CREATE OR REPLACE FUNCTION public.can_view_community(p_community_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_community RECORD;
  v_device_id TEXT;
  v_profile_id UUID;
BEGIN
  -- Get the community
  SELECT * INTO v_community
  FROM public.communities
  WHERE id = p_community_id;
  
  -- If community doesn't exist, return false
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Get device_id and profile_id for admin check
  BEGIN
    v_device_id := NULLIF(trim((current_setting('request.headers', true)::json ->> 'x-device-id')), '');
  EXCEPTION
    WHEN OTHERS THEN
      v_device_id := NULL;
  END;
  
  IF v_device_id IS NOT NULL THEN
    SELECT id INTO v_profile_id
    FROM public.profiles
    WHERE device_id = v_device_id
    LIMIT 1;
    
    -- Admins can view everything (including inactive)
    IF v_profile_id IS NOT NULL AND public.is_system_admin(v_profile_id) THEN
      RETURN true;
    END IF;
  END IF;
  
  -- If not admin and community is not active, return false
  IF NOT v_community.is_active THEN
    RETURN false;
  END IF;
  
  -- Public communities are always visible
  IF v_community.is_public = true THEN
    RETURN true;
  END IF;
  
  -- Private communities with is_visible_publicly=true are visible
  IF v_community.is_public = false AND COALESCE(v_community.is_visible_publicly, false) = true THEN
    RETURN true;
  END IF;
  
  -- For private communities with is_visible_publicly=false, check access
  IF v_profile_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Check if user is creator, member, or moderator
  RETURN (
    v_community.created_by_profile_id = v_profile_id
    OR EXISTS (SELECT 1 FROM public.community_members WHERE community_id = p_community_id AND profile_id = v_profile_id)
    OR EXISTS (SELECT 1 FROM public.community_moderators WHERE community_id = p_community_id AND moderator_profile_id = v_profile_id)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_view_community(UUID) TO authenticated, anon;

-- ============================================================================
-- NOTE: The RLS policy updates are in the main migration file
-- Run 20250217000003_grant_admin_full_access.sql AFTER this one
-- during a low-traffic period to avoid deadlocks
-- ============================================================================

