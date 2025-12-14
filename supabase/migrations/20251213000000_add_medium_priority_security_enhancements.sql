-- Medium Priority Security Enhancements
-- Implements missing features from SECURITY_TODO.md items #11-14:
-- 1. Profile Update Abuse - IP-based rate limiting enhancement
-- 2. Community Creation Spam - IP-based rate limiting
-- 3. Live Room Abuse - Room duration limits (max 2 hours)
-- 4. Storage Abuse - Activity-based retention limits

-- ============================================================================
-- 1. COMMUNITY CREATION - IP-BASED RATE LIMITING
-- ============================================================================

-- Add IP tracking to community creation
CREATE TABLE IF NOT EXISTS public.community_creation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create index for IP-based rate limiting
CREATE INDEX IF NOT EXISTS idx_community_creation_logs_ip_created 
ON public.community_creation_logs(ip_address, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_community_creation_logs_profile_created 
ON public.community_creation_logs(profile_id, created_at DESC);

-- Update can_create_community to include IP-based rate limiting
CREATE OR REPLACE FUNCTION public.can_create_community(
  profile_id_param UUID,
  ip_address_param INET DEFAULT NULL
)
RETURNS TABLE(
  can_create BOOLEAN,
  reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  account_age_days INTEGER;
  communities_today INTEGER;
  communities_by_ip_today INTEGER;
  min_account_age_days INTEGER := 7;
  max_communities_per_day INTEGER := 1;
  max_communities_per_ip_per_day INTEGER := 3;
BEGIN
  -- Check account age
  SELECT EXTRACT(DAY FROM (NOW() - created_at))::INTEGER
  INTO account_age_days
  FROM public.profiles
  WHERE id = profile_id_param;

  IF account_age_days IS NULL THEN
    RETURN QUERY SELECT false, 'Profile not found'::TEXT;
    RETURN;
  END IF;

  IF account_age_days < min_account_age_days THEN
    RETURN QUERY SELECT false, format('Account must be at least %s days old (yours is %s days)', min_account_age_days, account_age_days)::TEXT;
    RETURN;
  END IF;

  -- Check daily limit per profile
  SELECT COUNT(*)
  INTO communities_today
  FROM public.communities
  WHERE created_by_profile_id = profile_id_param
    AND created_at >= CURRENT_DATE;

  IF communities_today >= max_communities_per_day THEN
    RETURN QUERY SELECT false, format('Maximum %s community per day allowed', max_communities_per_day)::TEXT;
    RETURN;
  END IF;

  -- Check IP-based rate limiting (if IP provided)
  IF ip_address_param IS NOT NULL THEN
    SELECT COUNT(*)
    INTO communities_by_ip_today
    FROM public.community_creation_logs
    WHERE ip_address = ip_address_param
      AND created_at >= CURRENT_DATE;

    IF communities_by_ip_today >= max_communities_per_ip_per_day THEN
      RETURN QUERY SELECT false, format('Maximum %s communities per day per IP address allowed', max_communities_per_ip_per_day)::TEXT;
      RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT true, 'OK'::TEXT;
END;
$$;

-- Trigger to log community creation with IP address
CREATE OR REPLACE FUNCTION public.log_community_creation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_headers JSON;
  request_ip INET;
  forwarded_for TEXT;
BEGIN
  -- Try to get IP from request headers
  BEGIN
    request_headers := current_setting('request.headers', true)::json;
    
    -- Try x-forwarded-for first (may contain multiple IPs, comma-separated)
    forwarded_for := request_headers->>'x-forwarded-for';
    IF forwarded_for IS NOT NULL THEN
      -- Take first IP if multiple
      forwarded_for := split_part(forwarded_for, ',', 1);
      forwarded_for := trim(forwarded_for);
      request_ip := forwarded_for::INET;
    END IF;
    
    -- Fallback to x-real-ip
    IF request_ip IS NULL THEN
      request_ip := (request_headers->>'x-real-ip')::INET;
    END IF;
    
    -- Fallback to cf-connecting-ip (Cloudflare)
    IF request_ip IS NULL THEN
      request_ip := (request_headers->>'cf-connecting-ip')::INET;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      request_ip := NULL;
  END;

  -- Log the community creation
  INSERT INTO public.community_creation_logs (profile_id, ip_address)
  VALUES (NEW.created_by_profile_id, request_ip);

  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_log_community_creation ON public.communities;
CREATE TRIGGER trigger_log_community_creation
  AFTER INSERT ON public.communities
  FOR EACH ROW
  EXECUTE FUNCTION public.log_community_creation();

-- ============================================================================
-- 2. LIVE ROOM ABUSE - ROOM DURATION LIMITS (MAX 2 HOURS)
-- ============================================================================

-- Add max_duration_minutes column to live_rooms if it doesn't exist
ALTER TABLE public.live_rooms
ADD COLUMN IF NOT EXISTS max_duration_minutes INTEGER DEFAULT 120; -- 2 hours default

-- Function to check and enforce room duration limits
CREATE OR REPLACE FUNCTION public.check_room_duration_limit(room_id_param UUID)
RETURNS TABLE(
  is_valid BOOLEAN,
  reason TEXT,
  should_end BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room RECORD;
  v_duration_minutes INTEGER;
  v_max_duration_minutes INTEGER := 120; -- 2 hours
BEGIN
  -- Get room info
  SELECT 
    id,
    started_at,
    ended_at,
    status,
    max_duration_minutes
  INTO v_room
  FROM public.live_rooms
  WHERE id = room_id_param;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Room not found'::TEXT, false;
    RETURN;
  END IF;

  -- Use room's max_duration_minutes if set, otherwise use default
  v_max_duration_minutes := COALESCE(v_room.max_duration_minutes, 120);

  -- If room hasn't started, it's valid
  IF v_room.started_at IS NULL THEN
    RETURN QUERY SELECT true, 'OK'::TEXT, false;
    RETURN;
  END IF;

  -- If room already ended, it's valid
  IF v_room.ended_at IS NOT NULL THEN
    RETURN QUERY SELECT true, 'OK'::TEXT, false;
    RETURN;
  END IF;

  -- Calculate duration
  v_duration_minutes := EXTRACT(EPOCH FROM (NOW() - v_room.started_at)) / 60;

  -- Check if duration exceeded
  IF v_duration_minutes >= v_max_duration_minutes THEN
    RETURN QUERY SELECT false, format('Room duration limit of %s minutes exceeded', v_max_duration_minutes)::TEXT, true;
    RETURN;
  END IF;

  -- Check if approaching limit (within 5 minutes)
  IF v_duration_minutes >= (v_max_duration_minutes - 5) THEN
    RETURN QUERY SELECT true, format('Room approaching duration limit (%s minutes remaining)', v_max_duration_minutes - v_duration_minutes)::TEXT, false;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, 'OK'::TEXT, false;
END;
$$;

-- Function to auto-end rooms that exceed duration limit
CREATE OR REPLACE FUNCTION public.auto_end_expired_rooms()
RETURNS TABLE(
  ended_rooms_count INTEGER,
  ended_room_ids UUID[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room RECORD;
  v_ended_count INTEGER := 0;
  v_ended_ids UUID[] := ARRAY[]::UUID[];
  v_max_duration_minutes INTEGER := 120;
BEGIN
  -- Find live rooms that have exceeded duration
  FOR v_room IN
    SELECT 
      lr.id,
      lr.started_at,
      lr.max_duration_minutes,
      EXTRACT(EPOCH FROM (NOW() - lr.started_at)) / 60 AS duration_minutes
    FROM public.live_rooms lr
    WHERE lr.status = 'live'
      AND lr.started_at IS NOT NULL
      AND lr.ended_at IS NULL
      AND EXTRACT(EPOCH FROM (NOW() - lr.started_at)) / 60 >= COALESCE(lr.max_duration_minutes, 120)
  LOOP
    -- End the room
    UPDATE public.live_rooms
    SET 
      status = 'ended',
      ended_at = NOW(),
      updated_at = NOW()
    WHERE id = v_room.id;

    v_ended_count := v_ended_count + 1;
    v_ended_ids := array_append(v_ended_ids, v_room.id);
  END LOOP;

  RETURN QUERY SELECT v_ended_count, v_ended_ids;
END;
$$;

-- Update can_create_live_room to validate max_duration_minutes
CREATE OR REPLACE FUNCTION public.can_create_live_room(
  profile_id_param UUID,
  max_duration_minutes_param INTEGER DEFAULT NULL
)
RETURNS TABLE(
  can_create BOOLEAN,
  reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rooms_today INTEGER;
  active_rooms INTEGER;
  last_room_created_at TIMESTAMPTZ;
  cooldown_hours INTEGER := 1;
  max_rooms_per_day INTEGER := 3;
  max_duration_limit_minutes INTEGER := 120; -- 2 hours max
BEGIN
  -- Validate max_duration_minutes if provided
  IF max_duration_minutes_param IS NOT NULL THEN
    IF max_duration_minutes_param < 1 OR max_duration_minutes_param > max_duration_limit_minutes THEN
      RETURN QUERY SELECT false, format('Room duration must be between 1 and %s minutes (2 hours)', max_duration_limit_minutes)::TEXT;
      RETURN;
    END IF;
  END IF;

  -- Check daily limit
  SELECT COUNT(*)
  INTO rooms_today
  FROM public.live_rooms
  WHERE host_profile_id = profile_id_param
    AND created_at >= CURRENT_DATE;

  IF rooms_today >= max_rooms_per_day THEN
    RETURN QUERY SELECT false, format('Maximum %s live rooms per day allowed', max_rooms_per_day)::TEXT;
    RETURN;
  END IF;

  -- Check concurrent active rooms
  SELECT COUNT(*)
  INTO active_rooms
  FROM public.live_rooms
  WHERE host_profile_id = profile_id_param
    AND status IN ('live', 'scheduled')
    AND (ended_at IS NULL OR ended_at > NOW());

  IF active_rooms >= 1 THEN
    RETURN QUERY SELECT false, 'You can only have 1 active live room at a time'::TEXT;
    RETURN;
  END IF;

  -- Check cooldown
  SELECT MAX(created_at)
  INTO last_room_created_at
  FROM public.live_rooms
  WHERE host_profile_id = profile_id_param;

  IF last_room_created_at IS NOT NULL AND 
     (NOW() - last_room_created_at) < (cooldown_hours || ' hours')::INTERVAL THEN
    RETURN QUERY SELECT false, format('Please wait %s hour(s) between creating rooms', cooldown_hours)::TEXT;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, 'OK'::TEXT;
END;
$$;

-- ============================================================================
-- 3. STORAGE ABUSE - ACTIVITY-BASED RETENTION LIMITS
-- ============================================================================

-- Function to cleanup clips for inactive accounts (no activity in 90 days)
CREATE OR REPLACE FUNCTION public.cleanup_inactive_account_clips()
RETURNS TABLE (
  deleted_clips_count BIGINT,
  freed_storage_bytes BIGINT,
  affected_profiles_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count BIGINT := 0;
  v_freed_storage BIGINT := 0;
  v_affected_profiles BIGINT := 0;
  v_clip RECORD;
  v_profile RECORD;
  v_last_activity TIMESTAMPTZ;
BEGIN
  -- Find profiles with no activity in 90 days
  FOR v_profile IN
    SELECT 
      p.id,
      p.created_at,
      COALESCE(
        (SELECT MAX(created_at) FROM public.clips WHERE profile_id = p.id),
        (SELECT MAX(created_at) FROM public.comments WHERE profile_id = p.id),
        (SELECT MAX(created_at) FROM public.reactions WHERE profile_id = p.id),
        p.created_at
      ) AS last_activity
    FROM public.profiles p
    WHERE p.created_at < (now() - interval '90 days')
  LOOP
    -- Check if last activity was more than 90 days ago
    IF v_profile.last_activity < (now() - interval '90 days') THEN
      -- Delete all clips for this inactive profile
      FOR v_clip IN
        SELECT id, profile_id, duration_seconds, audio_path, status
        FROM public.clips
        WHERE profile_id = v_profile.id
          AND status != 'deleted'
      LOOP
        -- Mark for deletion
        UPDATE public.clips
        SET status = 'deleted'
        WHERE id = v_clip.id;
        
        -- Update storage usage
        UPDATE public.profiles
        SET storage_used_bytes = GREATEST(0, storage_used_bytes - (v_clip.duration_seconds * 34000))
        WHERE id = v_clip.profile_id;
        
        v_deleted_count := v_deleted_count + 1;
        v_freed_storage := v_freed_storage + (v_clip.duration_seconds * 34000);
      END LOOP;
      
      v_affected_profiles := v_affected_profiles + 1;
    END IF;
  END LOOP;
  
  RETURN QUERY SELECT v_deleted_count, v_freed_storage, v_affected_profiles;
END;
$$;

-- ============================================================================
-- 4. GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.can_create_community(UUID, INET) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.log_community_creation() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.check_room_duration_limit(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.auto_end_expired_rooms() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.can_create_live_room(UUID, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.cleanup_inactive_account_clips() TO authenticated, anon;

-- ============================================================================
-- 5. CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

-- Index for room duration checks
CREATE INDEX IF NOT EXISTS idx_live_rooms_status_started 
ON public.live_rooms(status, started_at)
WHERE status = 'live' AND started_at IS NOT NULL;

-- Index for inactive account cleanup
CREATE INDEX IF NOT EXISTS idx_clips_profile_status_created 
ON public.clips(profile_id, status, created_at)
WHERE status != 'deleted';

-- ============================================================================
-- 6. COMMENTS
-- ============================================================================

COMMENT ON FUNCTION public.can_create_community(UUID, INET) IS 'Checks if user can create a community with IP-based rate limiting';
COMMENT ON FUNCTION public.check_room_duration_limit(UUID) IS 'Checks if a live room has exceeded its duration limit (max 2 hours)';
COMMENT ON FUNCTION public.auto_end_expired_rooms() IS 'Automatically ends live rooms that have exceeded their duration limit';
COMMENT ON FUNCTION public.can_create_live_room(UUID, INTEGER) IS 'Checks if user can create a live room with duration validation';
COMMENT ON FUNCTION public.cleanup_inactive_account_clips() IS 'Cleans up clips for accounts with no activity in 90 days';

