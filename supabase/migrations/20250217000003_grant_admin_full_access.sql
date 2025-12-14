-- Grant System Admins Full Access to All Resources
-- This migration ensures admins can view, edit, delete, and manage everything
-- NOTE: Run this migration when there are no active connections to avoid deadlocks

-- Start transaction to ensure atomicity
BEGIN;

-- ============================================================================
-- 1. CREATE HELPER FUNCTION TO CHECK IF USER IS SYSTEM ADMIN
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

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.is_system_admin(UUID) TO authenticated, anon;

COMMENT ON FUNCTION public.is_system_admin(UUID) IS 
'Returns true if the profile is a system admin with full access to all resources';

-- ============================================================================
-- 2. UPDATE COMMUNITY RLS POLICIES TO ALLOW ADMINS FULL ACCESS
-- ============================================================================

-- Update can_view_community function to allow admins
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
  
  -- If community doesn't exist or is not active, return false (unless admin)
  IF NOT FOUND OR NOT v_community.is_active THEN
    -- Check if user is admin (admins can see inactive communities)
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
      
      IF v_profile_id IS NOT NULL AND public.is_system_admin(v_profile_id) THEN
        RETURN true;
      END IF;
    END IF;
    
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
  -- Try to get device_id safely
  BEGIN
    v_device_id := NULLIF(trim((current_setting('request.headers', true)::json ->> 'x-device-id')), '');
  EXCEPTION
    WHEN OTHERS THEN
      v_device_id := NULL;
  END;
  
  -- If no device_id, user can't access private community (unless admin - but we can't check without device_id)
  IF v_device_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Get profile_id for this device
  SELECT id INTO v_profile_id
  FROM public.profiles
  WHERE device_id = v_device_id
  LIMIT 1;
  
  -- If no profile found, can't access
  IF v_profile_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Admins can access everything
  IF public.is_system_admin(v_profile_id) THEN
    RETURN true;
  END IF;
  
  -- Check if user is creator, member, or moderator
  RETURN (
    v_community.created_by_profile_id = v_profile_id
    OR EXISTS (SELECT 1 FROM public.community_members WHERE community_id = p_community_id AND profile_id = v_profile_id)
    OR EXISTS (SELECT 1 FROM public.community_moderators WHERE community_id = p_community_id AND moderator_profile_id = v_profile_id)
  );
END;
$$;

-- Update communities SELECT policy to allow admins
DROP POLICY IF EXISTS "Communities are viewable based on privacy" ON public.communities;

CREATE POLICY "Communities are viewable based on privacy"
ON public.communities FOR SELECT
USING (
  -- Admins can view everything (including inactive)
  public.is_system_admin((
    SELECT id FROM public.profiles
    WHERE device_id = COALESCE(
      NULLIF(trim((current_setting('request.headers', true)::json ->> 'x-device-id')), ''),
      ''
    )
    LIMIT 1
  ))
  OR
  (
    is_active = true 
    AND (
      -- Fast path: Public communities - always visible
      is_public = true
      OR
      -- Fast path: Private but visible publicly - always visible
      (is_public = false AND COALESCE(is_visible_publicly, false) = true)
      OR
      -- Slow path: Private and not visible publicly - use function to check access
      (is_public = false AND COALESCE(is_visible_publicly, false) = false AND public.can_view_community(id))
    )
  )
);

-- Update communities UPDATE policy to allow admins
DROP POLICY IF EXISTS "Community hosts and moderators can update" ON public.communities;
DROP POLICY IF EXISTS "Community hosts can update" ON public.communities;
DROP POLICY IF EXISTS "Community creators can update" ON public.communities;

CREATE POLICY "Community hosts, moderators, and admins can update"
ON public.communities FOR UPDATE
USING (
  -- Admins can update everything
  public.is_system_admin((
    SELECT id FROM public.profiles
    WHERE device_id = COALESCE(
      NULLIF(trim((current_setting('request.headers', true)::json ->> 'x-device-id')), ''),
      ''
    )
    LIMIT 1
  ))
  OR public.is_community_host(id, (
    SELECT id FROM public.profiles
    WHERE device_id = COALESCE(
      NULLIF(trim((current_setting('request.headers', true)::json ->> 'x-device-id')), ''),
      ''
    )
    LIMIT 1
  ))
  OR public.moderator_has_permission(
    id,
    (SELECT id FROM public.profiles
     WHERE device_id = COALESCE(
       NULLIF(trim((current_setting('request.headers', true)::json ->> 'x-device-id')), ''),
       ''
     )
     LIMIT 1),
    'manage_community'
  )
);

-- Update communities DELETE policy to allow admins
DROP POLICY IF EXISTS "Community hosts can delete" ON public.communities;
DROP POLICY IF EXISTS "Community creators can delete" ON public.communities;

CREATE POLICY "Community hosts and admins can delete"
ON public.communities FOR DELETE
USING (
  -- Admins can delete everything
  public.is_system_admin((
    SELECT id FROM public.profiles
    WHERE device_id = COALESCE(
      NULLIF(trim((current_setting('request.headers', true)::json ->> 'x-device-id')), ''),
      ''
    )
    LIMIT 1
  ))
  OR public.is_community_host(id, (
    SELECT id FROM public.profiles
    WHERE device_id = COALESCE(
      NULLIF(trim((current_setting('request.headers', true)::json ->> 'x-device-id')), ''),
      ''
    )
    LIMIT 1
  ))
);

-- Update communities INSERT policy to allow admins
DROP POLICY IF EXISTS "Anyone can create communities" ON public.communities;
DROP POLICY IF EXISTS "Users can create communities" ON public.communities;

CREATE POLICY "Users and admins can create communities"
ON public.communities FOR INSERT
WITH CHECK (
  -- Admins can create communities for any profile
  public.is_system_admin(created_by_profile_id)
  OR
  -- Users can create communities for themselves
  created_by_profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = COALESCE(
      NULLIF(trim((current_setting('request.headers', true)::json ->> 'x-device-id')), ''),
      ''
    )
  )
);

-- ============================================================================
-- 3. UPDATE COMMUNITY MEMBERS POLICIES TO ALLOW ADMINS
-- ============================================================================

-- Allow admins to view all community members
DROP POLICY IF EXISTS "Community members are viewable" ON public.community_members;
CREATE POLICY "Community members are viewable by members and admins"
ON public.community_members FOR SELECT
USING (
  -- Admins can view everything
  public.is_system_admin((
    SELECT id FROM public.profiles
    WHERE device_id = COALESCE(
      NULLIF(trim((current_setting('request.headers', true)::json ->> 'x-device-id')), ''),
      ''
    )
    LIMIT 1
  ))
  OR profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = COALESCE(
      NULLIF(trim((current_setting('request.headers', true)::json ->> 'x-device-id')), ''),
      ''
    )
  )
);

-- Allow admins to manage community members
DROP POLICY IF EXISTS "Community hosts can add members" ON public.community_members;
CREATE POLICY "Community hosts and admins can add members"
ON public.community_members FOR INSERT
WITH CHECK (
  -- Admins can add anyone
  public.is_system_admin((
    SELECT id FROM public.profiles
    WHERE device_id = COALESCE(
      NULLIF(trim((current_setting('request.headers', true)::json ->> 'x-device-id')), ''),
      ''
    )
    LIMIT 1
  ))
  OR public.is_community_host(community_id, (
    SELECT id FROM public.profiles
    WHERE device_id = COALESCE(
      NULLIF(trim((current_setting('request.headers', true)::json ->> 'x-device-id')), ''),
      ''
    )
    LIMIT 1
  ))
);

DROP POLICY IF EXISTS "Community hosts can remove members" ON public.community_members;
CREATE POLICY "Community hosts and admins can remove members"
ON public.community_members FOR DELETE
USING (
  -- Admins can remove anyone
  public.is_system_admin((
    SELECT id FROM public.profiles
    WHERE device_id = COALESCE(
      NULLIF(trim((current_setting('request.headers', true)::json ->> 'x-device-id')), ''),
      ''
    )
    LIMIT 1
  ))
  OR public.is_community_host(community_id, (
    SELECT id FROM public.profiles
    WHERE device_id = COALESCE(
      NULLIF(trim((current_setting('request.headers', true)::json ->> 'x-device-id')), ''),
      ''
    )
    LIMIT 1
  ))
);

-- ============================================================================
-- 4. UPDATE COMMUNITY MODERATORS POLICIES TO ALLOW ADMINS
-- ============================================================================

-- Allow admins to view all moderators
DROP POLICY IF EXISTS "Community moderators are viewable" ON public.community_moderators;
CREATE POLICY "Community moderators are viewable by members and admins"
ON public.community_moderators FOR SELECT
USING (
  -- Admins can view everything
  public.is_system_admin((
    SELECT id FROM public.profiles
    WHERE device_id = COALESCE(
      NULLIF(trim((current_setting('request.headers', true)::json ->> 'x-device-id')), ''),
      ''
    )
    LIMIT 1
  ))
  OR EXISTS (
    SELECT 1 FROM public.community_members cm
    WHERE cm.community_id = community_moderators.community_id
    AND cm.profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = COALESCE(
        NULLIF(trim((current_setting('request.headers', true)::json ->> 'x-device-id')), ''),
        ''
      )
    )
  )
);

-- Allow admins to add moderators
DROP POLICY IF EXISTS "Community hosts can add moderators" ON public.community_moderators;
CREATE POLICY "Community hosts and admins can add moderators"
ON public.community_moderators FOR INSERT
WITH CHECK (
  -- Admins can add anyone
  public.is_system_admin((
    SELECT id FROM public.profiles
    WHERE device_id = COALESCE(
      NULLIF(trim((current_setting('request.headers', true)::json ->> 'x-device-id')), ''),
      ''
    )
    LIMIT 1
  ))
  OR public.is_community_host(community_id, (
    SELECT id FROM public.profiles
    WHERE device_id = COALESCE(
      NULLIF(trim((current_setting('request.headers', true)::json ->> 'x-device-id')), ''),
      ''
    )
    LIMIT 1
  ))
  OR public.moderator_has_permission(
    community_id,
    (SELECT id FROM public.profiles
     WHERE device_id = COALESCE(
       NULLIF(trim((current_setting('request.headers', true)::json ->> 'x-device-id')), ''),
       ''
     )
     LIMIT 1),
    'manage_moderators'
  )
);

-- Allow admins to remove moderators
DROP POLICY IF EXISTS "Community hosts can remove moderators" ON public.community_moderators;
CREATE POLICY "Community hosts and admins can remove moderators"
ON public.community_moderators FOR DELETE
USING (
  -- Admins can remove anyone
  public.is_system_admin((
    SELECT id FROM public.profiles
    WHERE device_id = COALESCE(
      NULLIF(trim((current_setting('request.headers', true)::json ->> 'x-device-id')), ''),
      ''
    )
    LIMIT 1
  ))
  OR public.is_community_host(community_id, (
    SELECT id FROM public.profiles
    WHERE device_id = COALESCE(
      NULLIF(trim((current_setting('request.headers', true)::json ->> 'x-device-id')), ''),
      ''
    )
    LIMIT 1
  ))
);

-- Allow admins to update moderator permissions
DROP POLICY IF EXISTS "Community hosts can update moderator permissions" ON public.community_moderators;
CREATE POLICY "Community hosts and admins can update moderator permissions"
ON public.community_moderators FOR UPDATE
USING (
  -- Admins can update anything
  public.is_system_admin((
    SELECT id FROM public.profiles
    WHERE device_id = COALESCE(
      NULLIF(trim((current_setting('request.headers', true)::json ->> 'x-device-id')), ''),
      ''
    )
    LIMIT 1
  ))
  OR public.is_community_host(community_id, (
    SELECT id FROM public.profiles
    WHERE device_id = COALESCE(
      NULLIF(trim((current_setting('request.headers', true)::json ->> 'x-device-id')), ''),
      ''
    )
    LIMIT 1
  ))
);

-- ============================================================================
-- 5. UPDATE OTHER COMMUNITY-RELATED POLICIES
-- ============================================================================

-- Community rules - admins can manage all rules
DROP POLICY IF EXISTS "Community hosts can manage rules" ON public.community_rules;
CREATE POLICY "Community hosts and admins can manage rules"
ON public.community_rules FOR ALL
USING (
  -- Admins can manage everything
  public.is_system_admin((
    SELECT id FROM public.profiles
    WHERE device_id = COALESCE(
      NULLIF(trim((current_setting('request.headers', true)::json ->> 'x-device-id')), ''),
      ''
    )
    LIMIT 1
  ))
  OR EXISTS (
    SELECT 1 FROM public.communities c
    WHERE c.id = community_rules.community_id
    AND c.created_by_profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = COALESCE(
        NULLIF(trim((current_setting('request.headers', true)::json ->> 'x-device-id')), ''),
        ''
      )
    )
  )
);

-- Community events - admins can manage all events
DROP POLICY IF EXISTS "Community hosts can manage events" ON public.community_events;
CREATE POLICY "Community hosts and admins can manage events"
ON public.community_events FOR ALL
USING (
  -- Admins can manage everything
  public.is_system_admin((
    SELECT id FROM public.profiles
    WHERE device_id = COALESCE(
      NULLIF(trim((current_setting('request.headers', true)::json ->> 'x-device-id')), ''),
      ''
    )
    LIMIT 1
  ))
  OR EXISTS (
    SELECT 1 FROM public.communities c
    WHERE c.id = community_events.community_id
    AND c.created_by_profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = COALESCE(
        NULLIF(trim((current_setting('request.headers', true)::json ->> 'x-device-id')), ''),
        ''
      )
    )
  )
);

-- Community flairs - admins can manage all flairs
DROP POLICY IF EXISTS "Community hosts can manage flairs" ON public.community_flairs;
CREATE POLICY "Community hosts and admins can manage flairs"
ON public.community_flairs FOR ALL
USING (
  -- Admins can manage everything
  public.is_system_admin((
    SELECT id FROM public.profiles
    WHERE device_id = COALESCE(
      NULLIF(trim((current_setting('request.headers', true)::json ->> 'x-device-id')), ''),
      ''
    )
    LIMIT 1
  ))
  OR EXISTS (
    SELECT 1 FROM public.communities c
    WHERE c.id = community_flairs.community_id
    AND c.created_by_profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = COALESCE(
        NULLIF(trim((current_setting('request.headers', true)::json ->> 'x-device-id')), ''),
        ''
      )
    )
  )
);

-- ============================================================================
-- 6. UPDATE CLIPS POLICIES TO ALLOW ADMINS FULL ACCESS
-- ============================================================================

-- Allow admins to view all clips (including deleted/moderation status)
DROP POLICY IF EXISTS "Clips are viewable by everyone" ON public.clips;
DROP POLICY IF EXISTS "Public clips are viewable" ON public.clips;

CREATE POLICY "Clips are viewable by everyone, admins can see all"
ON public.clips FOR SELECT
USING (
  -- Admins can view everything (including deleted, pending moderation, etc.)
  public.is_system_admin((
    SELECT id FROM public.profiles
    WHERE device_id = COALESCE(
      NULLIF(trim((current_setting('request.headers', true)::json ->> 'x-device-id')), ''),
      ''
    )
    LIMIT 1
  ))
  OR status = 'live'
);

-- Allow admins to update all clips
DROP POLICY IF EXISTS "Users can update their own clips" ON public.clips;
CREATE POLICY "Users can update their own clips, admins can update all"
ON public.clips FOR UPDATE
USING (
  -- Admins can update everything
  public.is_system_admin((
    SELECT id FROM public.profiles
    WHERE device_id = COALESCE(
      NULLIF(trim((current_setting('request.headers', true)::json ->> 'x-device-id')), ''),
      ''
    )
    LIMIT 1
  ))
  OR profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = COALESCE(
      NULLIF(trim((current_setting('request.headers', true)::json ->> 'x-device-id')), ''),
      ''
    )
  )
);

-- Allow admins to delete all clips
DROP POLICY IF EXISTS "Users can delete their own clips" ON public.clips;
CREATE POLICY "Users can delete their own clips, admins can delete all"
ON public.clips FOR DELETE
USING (
  -- Admins can delete everything
  public.is_system_admin((
    SELECT id FROM public.profiles
    WHERE device_id = COALESCE(
      NULLIF(trim((current_setting('request.headers', true)::json ->> 'x-device-id')), ''),
      ''
    )
    LIMIT 1
  ))
  OR profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = COALESCE(
      NULLIF(trim((current_setting('request.headers', true)::json ->> 'x-device-id')), ''),
      ''
    )
  )
);

-- ============================================================================
-- 7. UPDATE TOPICS POLICIES TO ALLOW ADMINS
-- ============================================================================

-- Allow admins to manage topics
DROP POLICY IF EXISTS "Anyone can view topics" ON public.topics;
CREATE POLICY "Anyone can view topics, admins can manage all"
ON public.topics FOR SELECT
USING (
  is_active = true
  OR public.is_system_admin((
    SELECT id FROM public.profiles
    WHERE device_id = COALESCE(
      NULLIF(trim((current_setting('request.headers', true)::json ->> 'x-device-id')), ''),
      ''
    )
    LIMIT 1
  ))
);

DROP POLICY IF EXISTS "Admins can manage topics" ON public.topics;
CREATE POLICY "Admins can manage all topics"
ON public.topics FOR ALL
USING (
  public.is_system_admin((
    SELECT id FROM public.profiles
    WHERE device_id = COALESCE(
      NULLIF(trim((current_setting('request.headers', true)::json ->> 'x-device-id')), ''),
      ''
    )
    LIMIT 1
  ))
);

-- ============================================================================
-- 8. UPDATE MODERATOR PERMISSION FUNCTION TO ALLOW ADMINS
-- ============================================================================

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

-- Update is_community_host to allow admins
CREATE OR REPLACE FUNCTION public.is_community_host(
  p_community_id UUID,
  p_profile_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- ============================================================================
-- 9. GRANT EXECUTE PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.is_system_admin(UUID) TO authenticated, anon;

