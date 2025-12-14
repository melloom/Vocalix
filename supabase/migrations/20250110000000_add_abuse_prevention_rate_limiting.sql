-- Abuse Prevention & Rate Limiting Migration
-- Implements rate limiting and validation for:
-- 1. Community Creation Spam
-- 2. Live Room Abuse
-- 3. Follow/Unfollow Spam
-- 4. Scheduled Post Abuse

-- ============================================================================
-- 1. COMMUNITY CREATION RATE LIMITING
-- ============================================================================

-- Function to check if user can create a community
CREATE OR REPLACE FUNCTION public.can_create_community(profile_id_param UUID)
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
  min_account_age_days INTEGER := 7;
  max_communities_per_day INTEGER := 1;
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

  -- Check daily limit
  SELECT COUNT(*)
  INTO communities_today
  FROM public.communities
  WHERE created_by_profile_id = profile_id_param
    AND created_at >= CURRENT_DATE;

  IF communities_today >= max_communities_per_day THEN
    RETURN QUERY SELECT false, format('Maximum %s community per day allowed', max_communities_per_day)::TEXT;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, 'OK'::TEXT;
END;
$$;

-- Function to validate community slug uniqueness (case-insensitive)
CREATE OR REPLACE FUNCTION public.validate_community_slug(slug_param TEXT)
RETURNS TABLE(
  is_valid BOOLEAN,
  reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reserved_names TEXT[] := ARRAY['admin', 'mod', 'moderator', 'support', 'help', 'api', 'www', 'mail', 'ftp', 'localhost', 'test', 'staging', 'dev', 'development', 'production', 'prod'];
  slug_lower TEXT;
BEGIN
  slug_lower := LOWER(TRIM(slug_param));

  IF slug_lower = ANY(reserved_names) THEN
    RETURN QUERY SELECT false, 'This community name is reserved'::TEXT;
    RETURN;
  END IF;

  -- Check case-insensitive uniqueness
  IF EXISTS (
    SELECT 1 FROM public.communities
    WHERE LOWER(slug) = slug_lower
  ) THEN
    RETURN QUERY SELECT false, 'A community with this name already exists'::TEXT;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, 'OK'::TEXT;
END;
$$;

-- ============================================================================
-- 2. LIVE ROOM ABUSE PREVENTION
-- ============================================================================

-- Function to check if user can create a live room
CREATE OR REPLACE FUNCTION public.can_create_live_room(profile_id_param UUID)
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
BEGIN
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

-- Function to validate room participant limits
CREATE OR REPLACE FUNCTION public.validate_room_limits(
  max_speakers_param INTEGER,
  max_listeners_param INTEGER
)
RETURNS TABLE(
  is_valid BOOLEAN,
  reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  max_speakers_limit INTEGER := 50;
  max_listeners_limit INTEGER := 1000;
BEGIN
  IF max_speakers_param < 1 OR max_speakers_param > max_speakers_limit THEN
    RETURN QUERY SELECT false, format('Max speakers must be between 1 and %s', max_speakers_limit)::TEXT;
    RETURN;
  END IF;

  IF max_listeners_param < 1 OR max_listeners_param > max_listeners_limit THEN
    RETURN QUERY SELECT false, format('Max listeners must be between 1 and %s', max_listeners_limit)::TEXT;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, 'OK'::TEXT;
END;
$$;

-- ============================================================================
-- 3. FOLLOW/UNFOLLOW SPAM PREVENTION
-- ============================================================================

-- Function to check if user can follow another profile
-- More lenient limits to accommodate popular creators and legitimate use cases
CREATE OR REPLACE FUNCTION public.can_follow_profile(
  follower_id_param UUID,
  following_id_param UUID
)
RETURNS TABLE(
  can_follow BOOLEAN,
  reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  follows_last_hour INTEGER;
  follows_today INTEGER;
  last_follow_at TIMESTAMPTZ;
  max_follows_per_hour INTEGER := 200;  -- Increased from 50 to 200 for popular creators
  max_follows_per_day INTEGER := 1000;  -- Increased from 200 to 1000 for popular creators
  cooldown_seconds INTEGER := 1;        -- Reduced from 2 to 1 second (minimal cooldown)
BEGIN
  -- Check hourly limit
  SELECT COUNT(*)
  INTO follows_last_hour
  FROM public.follows
  WHERE follower_id = follower_id_param
    AND created_at >= NOW() - INTERVAL '1 hour';

  IF follows_last_hour >= max_follows_per_hour THEN
    RETURN QUERY SELECT false, format('Maximum %s follows per hour allowed', max_follows_per_hour)::TEXT;
    RETURN;
  END IF;

  -- Check daily limit
  SELECT COUNT(*)
  INTO follows_today
  FROM public.follows
  WHERE follower_id = follower_id_param
    AND created_at >= CURRENT_DATE;

  IF follows_today >= max_follows_per_day THEN
    RETURN QUERY SELECT false, format('Maximum %s follows per day allowed', max_follows_per_day)::TEXT;
    RETURN;
  END IF;

  -- Check cooldown (minimal - just prevents rapid-fire clicking)
  SELECT MAX(created_at)
  INTO last_follow_at
  FROM public.follows
  WHERE follower_id = follower_id_param;

  IF last_follow_at IS NOT NULL AND 
     EXTRACT(EPOCH FROM (NOW() - last_follow_at)) < cooldown_seconds THEN
    RETURN QUERY SELECT false, format('Please wait %s second between follow actions', cooldown_seconds)::TEXT;
    RETURN;
  END IF;

  -- Check for follow/unfollow churn (prevent rapid follow/unfollow cycles)
  -- This checks if the user is already following (which would be an error case)
  -- The actual churn detection would require an audit log table
  -- For now, we rely on the cooldown and rate limits to prevent abuse

  RETURN QUERY SELECT true, 'OK'::TEXT;
END;
$$;

-- ============================================================================
-- 4. SCHEDULED POST ABUSE PREVENTION
-- ============================================================================

-- Function to check if user can schedule a post
CREATE OR REPLACE FUNCTION public.can_schedule_post(
  profile_id_param UUID,
  scheduled_for_param TIMESTAMPTZ
)
RETURNS TABLE(
  can_schedule BOOLEAN,
  reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  scheduled_count INTEGER;
  scheduled_last_hour INTEGER;
  max_scheduled_posts INTEGER := 50;
  max_scheduled_per_hour INTEGER := 10;
  max_scheduling_horizon_days INTEGER := 30;
  scheduling_horizon TIMESTAMPTZ;
BEGIN
  -- Check total scheduled posts limit
  SELECT COUNT(*)
  INTO scheduled_count
  FROM public.clips
  WHERE profile_id = profile_id_param
    AND scheduled_for IS NOT NULL
    AND status = 'draft'
    AND scheduled_for > NOW();

  IF scheduled_count >= max_scheduled_posts THEN
    RETURN QUERY SELECT false, format('Maximum %s scheduled posts allowed', max_scheduled_posts)::TEXT;
    RETURN;
  END IF;

  -- Check hourly scheduling rate limit
  SELECT COUNT(*)
  INTO scheduled_last_hour
  FROM public.clips
  WHERE profile_id = profile_id_param
    AND scheduled_for IS NOT NULL
    AND created_at >= NOW() - INTERVAL '1 hour';

  IF scheduled_last_hour >= max_scheduled_per_hour THEN
    RETURN QUERY SELECT false, format('Maximum %s scheduled posts per hour allowed', max_scheduled_per_hour)::TEXT;
    RETURN;
  END IF;

  -- Validate scheduled time is in the future
  IF scheduled_for_param <= NOW() THEN
    RETURN QUERY SELECT false, 'Scheduled time must be in the future'::TEXT;
    RETURN;
  END IF;

  -- Validate scheduling horizon (max 30 days ahead)
  scheduling_horizon := NOW() + (max_scheduling_horizon_days || ' days')::INTERVAL;
  IF scheduled_for_param > scheduling_horizon THEN
    RETURN QUERY SELECT false, format('Cannot schedule posts more than %s days in advance', max_scheduling_horizon_days)::TEXT;
    RETURN;
  END IF;

  -- Validate scheduled time is reasonable (not 100 years ahead)
  IF scheduled_for_param > NOW() + INTERVAL '100 years' THEN
    RETURN QUERY SELECT false, 'Scheduled time is too far in the future'::TEXT;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, 'OK'::TEXT;
END;
$$;

-- ============================================================================
-- 5. CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

-- Indexes for community creation rate limiting
-- Note: Cannot use CURRENT_DATE in index predicate (not IMMUTABLE)
-- The query will filter by date, and this index will help with the profile_id lookup
CREATE INDEX IF NOT EXISTS idx_communities_created_by_date 
ON public.communities(created_by_profile_id, created_at DESC);

-- Indexes for live room rate limiting
-- Note: Cannot use CURRENT_DATE in index predicate (not IMMUTABLE)
CREATE INDEX IF NOT EXISTS idx_live_rooms_host_date 
ON public.live_rooms(host_profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_live_rooms_host_status 
ON public.live_rooms(host_profile_id, status)
WHERE status IN ('live', 'scheduled');

-- Indexes for follow rate limiting
CREATE INDEX IF NOT EXISTS idx_follows_follower_created 
ON public.follows(follower_id, created_at DESC);

-- Note: Cannot use NOW() in index predicate (not IMMUTABLE)
-- The query will filter by time range, and this index will help with the follower_id lookup
-- The existing idx_follows_follower_created index above is sufficient

-- Indexes for scheduled posts
CREATE INDEX IF NOT EXISTS idx_clips_profile_scheduled 
ON public.clips(profile_id, scheduled_for)
WHERE scheduled_for IS NOT NULL AND status = 'draft';

CREATE INDEX IF NOT EXISTS idx_clips_profile_scheduled_created 
ON public.clips(profile_id, created_at DESC)
WHERE scheduled_for IS NOT NULL;

-- ============================================================================
-- 6. ADD TRIGGER TO ENFORCE COMMUNITY SLUG UNIQUENESS (CASE-INSENSITIVE)
-- ============================================================================

-- Function to enforce case-insensitive slug uniqueness
CREATE OR REPLACE FUNCTION public.enforce_community_slug_uniqueness()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Check if another community exists with the same slug (case-insensitive)
  IF EXISTS (
    SELECT 1 FROM public.communities
    WHERE LOWER(slug) = LOWER(NEW.slug)
      AND id != NEW.id
  ) THEN
    RAISE EXCEPTION 'A community with this name already exists (case-insensitive)';
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_enforce_community_slug_uniqueness ON public.communities;
CREATE TRIGGER trigger_enforce_community_slug_uniqueness
  BEFORE INSERT OR UPDATE OF slug ON public.communities
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_community_slug_uniqueness();
