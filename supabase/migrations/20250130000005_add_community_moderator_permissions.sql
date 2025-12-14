-- Add Community Moderator Permissions System
-- Allows hosts to grant/revoke specific permissions to moderators

-- Add permissions column to community_moderators table
ALTER TABLE public.community_moderators
ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}'::jsonb;

-- Create index for permissions queries
CREATE INDEX IF NOT EXISTS idx_community_moderators_permissions 
ON public.community_moderators USING gin(permissions) 
WHERE permissions IS NOT NULL;

-- Function to check if a user is a community host
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
  RETURN EXISTS(
    SELECT 1 
    FROM public.communities c
    WHERE c.id = p_community_id 
    AND c.created_by_profile_id = p_profile_id
  );
END;
$$;

-- Function to check if a user is a community moderator
CREATE OR REPLACE FUNCTION public.is_community_moderator(
  p_community_id UUID,
  p_profile_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS(
    SELECT 1 
    FROM public.community_moderators cm
    WHERE cm.community_id = p_community_id 
    AND cm.moderator_profile_id = p_profile_id
  );
END;
$$;

-- Function to check if a moderator has a specific permission
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
  v_is_host BOOLEAN;
  v_is_moderator BOOLEAN;
  v_permissions JSONB;
BEGIN
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

-- Update RLS policies to use permission functions
-- Drop existing policies
DROP POLICY IF EXISTS "Community creators and moderators can update" ON public.communities;
DROP POLICY IF EXISTS "Community creators can add moderators" ON public.community_moderators;
DROP POLICY IF EXISTS "Community creators can remove moderators" ON public.community_moderators;

-- Communities: Hosts and moderators with 'manage_community' permission can update
CREATE POLICY "Community hosts and moderators can update"
ON public.communities FOR UPDATE
USING (
  public.is_community_host(id, (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  ))
  OR public.moderator_has_permission(
    id,
    (SELECT id FROM public.profiles
     WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'),
    'manage_community'
  )
);

-- Community moderators: Hosts can add/remove, moderators with 'manage_moderators' can add
CREATE POLICY "Community hosts can add moderators"
ON public.community_moderators FOR INSERT
WITH CHECK (
  public.is_community_host(community_id, (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  ))
  OR public.moderator_has_permission(
    community_id,
    (SELECT id FROM public.profiles
     WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'),
    'manage_moderators'
  )
);

-- Only hosts can remove moderators
CREATE POLICY "Community hosts can remove moderators"
ON public.community_moderators FOR DELETE
USING (
  public.is_community_host(community_id, (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  ))
);

-- Only hosts can update moderator permissions
CREATE POLICY "Community hosts can update moderator permissions"
ON public.community_moderators FOR UPDATE
USING (
  public.is_community_host(community_id, (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  ))
);

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.is_community_host(UUID, UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_community_moderator(UUID, UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.moderator_has_permission(UUID, UUID, TEXT) TO authenticated, anon;

-- Add comment documentation
COMMENT ON COLUMN public.community_moderators.permissions IS 'JSONB object with permission flags: {manage_community: true, manage_moderators: false, manage_members: true, manage_content: true, manage_announcements: true, manage_events: true}';
COMMENT ON FUNCTION public.is_community_host(UUID, UUID) IS 'Returns true if the profile is the host (creator) of the community';
COMMENT ON FUNCTION public.is_community_moderator(UUID, UUID) IS 'Returns true if the profile is a moderator of the community';
COMMENT ON FUNCTION public.moderator_has_permission(UUID, UUID, TEXT) IS 'Returns true if the profile is a host or has the specified permission as a moderator';

