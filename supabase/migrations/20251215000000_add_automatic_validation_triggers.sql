-- Automatic Validation Triggers
-- Makes all "can" function validations automatic via database triggers
-- Ensures validations run even if client-side checks are bypassed

-- ============================================================================
-- 1. AUTOMATIC SCHEDULED POST VALIDATION
-- ============================================================================

-- Trigger function to automatically validate scheduled posts
CREATE OR REPLACE FUNCTION public.validate_scheduled_post()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_validation_result RECORD;
BEGIN
  -- Only validate if scheduled_for is set
  IF NEW.scheduled_for IS NOT NULL THEN
    -- Check if user can schedule this post
    SELECT * INTO v_validation_result
    FROM public.can_schedule_post(NEW.profile_id, NEW.scheduled_for)
    LIMIT 1;
    
    -- If validation fails, raise error
    IF NOT v_validation_result.can_schedule THEN
      RAISE EXCEPTION 'Scheduled post validation failed: %', v_validation_result.reason
        USING ERRCODE = 'P0001'; -- Use generic exception error code
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger BEFORE INSERT to validate new scheduled posts
DROP TRIGGER IF EXISTS trigger_validate_scheduled_post_insert ON public.clips;
CREATE TRIGGER trigger_validate_scheduled_post_insert
  BEFORE INSERT ON public.clips
  FOR EACH ROW
  WHEN (NEW.scheduled_for IS NOT NULL)
  EXECUTE FUNCTION public.validate_scheduled_post();

-- Create trigger BEFORE UPDATE to validate updated scheduled posts
DROP TRIGGER IF EXISTS trigger_validate_scheduled_post_update ON public.clips;
CREATE TRIGGER trigger_validate_scheduled_post_update
  BEFORE UPDATE ON public.clips
  FOR EACH ROW
  WHEN (NEW.scheduled_for IS NOT NULL AND (OLD.scheduled_for IS DISTINCT FROM NEW.scheduled_for))
  EXECUTE FUNCTION public.validate_scheduled_post();

-- ============================================================================
-- 2. AUTOMATIC FOLLOW VALIDATION
-- ============================================================================

-- Trigger function to automatically validate follow actions
CREATE OR REPLACE FUNCTION public.validate_follow_action()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_validation_result RECORD;
BEGIN
  -- Check if user can follow this profile
  SELECT * INTO v_validation_result
  FROM public.can_follow_profile(NEW.follower_id, NEW.following_id)
  LIMIT 1;
  
  -- If validation fails, raise error
  IF NOT v_validation_result.can_follow THEN
    RAISE EXCEPTION 'Follow validation failed: %', v_validation_result.reason
      USING ERRCODE = 'P0001';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger BEFORE INSERT to validate follow actions
DROP TRIGGER IF EXISTS trigger_validate_follow_action ON public.follows;
CREATE TRIGGER trigger_validate_follow_action
  BEFORE INSERT ON public.follows
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_follow_action();

-- ============================================================================
-- 3. AUTOMATIC COMMUNITY CREATION VALIDATION
-- ============================================================================

-- Trigger function to automatically validate community creation
CREATE OR REPLACE FUNCTION public.validate_community_creation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_validation_result RECORD;
  v_ip_address INET;
  request_headers JSON;
  forwarded_for TEXT;
BEGIN
  -- Try to get IP from request headers
  BEGIN
    request_headers := current_setting('request.headers', true)::json;
    
    -- Try x-forwarded-for first
    forwarded_for := request_headers->>'x-forwarded-for';
    IF forwarded_for IS NOT NULL THEN
      forwarded_for := split_part(forwarded_for, ',', 1);
      forwarded_for := trim(forwarded_for);
      v_ip_address := forwarded_for::INET;
    END IF;
    
    -- Fallback to x-real-ip
    IF v_ip_address IS NULL THEN
      v_ip_address := (request_headers->>'x-real-ip')::INET;
    END IF;
    
    -- Fallback to cf-connecting-ip (Cloudflare)
    IF v_ip_address IS NULL THEN
      v_ip_address := (request_headers->>'cf-connecting-ip')::INET;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      v_ip_address := NULL;
  END;
  
  -- Check if user can create this community
  SELECT * INTO v_validation_result
  FROM public.can_create_community(NEW.created_by_profile_id, v_ip_address)
  LIMIT 1;
  
  -- If validation fails, raise error
  IF NOT v_validation_result.can_create THEN
    RAISE EXCEPTION 'Community creation validation failed: %', v_validation_result.reason
      USING ERRCODE = 'P0001';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger BEFORE INSERT to validate community creation
DROP TRIGGER IF EXISTS trigger_validate_community_creation ON public.communities;
CREATE TRIGGER trigger_validate_community_creation
  BEFORE INSERT ON public.communities
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_community_creation();

-- ============================================================================
-- 4. AUTOMATIC LIVE ROOM CREATION VALIDATION
-- ============================================================================

-- Trigger function to automatically validate live room creation
CREATE OR REPLACE FUNCTION public.validate_live_room_creation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_validation_result RECORD;
BEGIN
  -- Check if user can create this live room (pass max_duration_minutes if provided)
  SELECT * INTO v_validation_result
  FROM public.can_create_live_room(NEW.host_profile_id, NEW.max_duration_minutes)
  LIMIT 1;
  
  -- If validation fails, raise error
  IF NOT v_validation_result.can_create THEN
    RAISE EXCEPTION 'Live room creation validation failed: %', v_validation_result.reason
      USING ERRCODE = 'P0001';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger BEFORE INSERT to validate live room creation
DROP TRIGGER IF EXISTS trigger_validate_live_room_creation ON public.live_rooms;
CREATE TRIGGER trigger_validate_live_room_creation
  BEFORE INSERT ON public.live_rooms
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_live_room_creation();

-- ============================================================================
-- 5. COMMENTS
-- ============================================================================

COMMENT ON FUNCTION public.validate_scheduled_post IS 'Automatically validates scheduled posts before insert/update using can_schedule_post';
COMMENT ON FUNCTION public.validate_follow_action IS 'Automatically validates follow actions before insert using can_follow_profile';
COMMENT ON FUNCTION public.validate_community_creation IS 'Automatically validates community creation before insert using can_create_community';
COMMENT ON FUNCTION public.validate_live_room_creation IS 'Automatically validates live room creation before insert using can_create_live_room';

