-- Fix Gamification Bugs
-- Addresses: Badge progress on deletion, Streak timezone issues, Race conditions, XP idempotency

-- ============================================================================
-- 1. FIX STREAK TRACKING TIMEZONE ISSUES
-- ============================================================================

-- Update streak function to use UTC dates
CREATE OR REPLACE FUNCTION public.update_posting_streak(p_profile_id UUID)
RETURNS VOID AS $$
DECLARE
  v_today DATE;
  v_yesterday DATE;
  v_last_post_date DATE;
  v_current_streak INTEGER;
  v_longest_streak INTEGER;
  v_posted_today BOOLEAN;
BEGIN
  -- Use UTC date to avoid timezone issues
  v_today := (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::DATE;
  v_yesterday := v_today - INTERVAL '1 day';

  -- Check if user posted today
  SELECT EXISTS(
    SELECT 1 FROM public.posting_streaks
    WHERE profile_id = p_profile_id AND post_date = v_today
  ) INTO v_posted_today;

  -- If already posted today, just increment clip count
  IF v_posted_today THEN
    UPDATE public.posting_streaks
    SET clip_count = clip_count + 1
    WHERE profile_id = p_profile_id AND post_date = v_today;
  ELSE
    -- Record today's post
    INSERT INTO public.posting_streaks (profile_id, post_date, clip_count)
    VALUES (p_profile_id, v_today, 1)
    ON CONFLICT (profile_id, post_date) DO UPDATE
    SET clip_count = posting_streaks.clip_count + 1;

    -- Get last post date
    SELECT last_post_date INTO v_last_post_date
    FROM public.profiles
    WHERE id = p_profile_id;

    -- Update streak
    IF v_last_post_date IS NULL OR v_last_post_date < v_yesterday THEN
      -- Streak broken, start new streak
      v_current_streak := 1;
    ELSIF v_last_post_date = v_yesterday THEN
      -- Continue streak
      SELECT current_streak_days INTO v_current_streak
      FROM public.profiles
      WHERE id = p_profile_id;
      v_current_streak := v_current_streak + 1;
    ELSE
      -- Same day, don't change streak
      SELECT current_streak_days INTO v_current_streak
      FROM public.profiles
      WHERE id = p_profile_id;
    END IF;

    -- Update longest streak if needed
    SELECT longest_streak_days INTO v_longest_streak
    FROM public.profiles
    WHERE id = p_profile_id;

    IF v_current_streak > v_longest_streak THEN
      v_longest_streak := v_current_streak;
    END IF;

    -- Update profile
    UPDATE public.profiles
    SET 
      current_streak_days = v_current_streak,
      longest_streak_days = v_longest_streak,
      last_post_date = v_today
    WHERE id = p_profile_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 2. ADD XP AWARD IDEMPOTENCY TRACKING
-- ============================================================================

-- Create table to track XP awards for idempotency
CREATE TABLE IF NOT EXISTS public.xp_awards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  xp_amount INTEGER NOT NULL,
  source TEXT NOT NULL,
  source_id UUID, -- References the clip/reaction/etc that triggered the XP
  source_type TEXT, -- 'clip', 'reaction', 'listen', etc.
  created_at TIMESTAMPTZ DEFAULT now(),
  -- Prevent duplicate XP awards for the same action
  UNIQUE(profile_id, source, source_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_xp_awards_profile_source ON public.xp_awards(profile_id, source, source_id);
CREATE INDEX IF NOT EXISTS idx_xp_awards_created_at ON public.xp_awards(created_at);

-- Update award_xp function to check for duplicates
CREATE OR REPLACE FUNCTION public.award_xp(
  p_profile_id UUID,
  p_xp_amount INTEGER,
  p_source TEXT DEFAULT 'activity',
  p_source_id UUID DEFAULT NULL
)
RETURNS TABLE(new_level INTEGER, leveled_up BOOLEAN) AS $$
DECLARE
  v_current_xp INTEGER;
  v_current_level INTEGER;
  v_new_xp INTEGER;
  v_new_level INTEGER;
  v_leveled_up BOOLEAN := false;
  v_already_awarded BOOLEAN := false;
BEGIN
  -- Check if XP was already awarded for this action (idempotency check)
  IF p_source_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.xp_awards
      WHERE profile_id = p_profile_id
        AND source = p_source
        AND source_id = p_source_id
    ) INTO v_already_awarded;
    
    -- If already awarded, return current level without awarding again
    IF v_already_awarded THEN
      SELECT COALESCE(xp, 0), COALESCE(level, 1)
      INTO v_current_xp, v_current_level
      FROM public.profiles
      WHERE id = p_profile_id;
      
      RETURN QUERY SELECT v_current_level, false;
      RETURN;
    END IF;
  END IF;

  -- Get current XP and level
  SELECT COALESCE(xp, 0), COALESCE(level, 1)
  INTO v_current_xp, v_current_level
  FROM public.profiles
  WHERE id = p_profile_id;

  -- Calculate new XP and level
  v_new_xp := v_current_xp + p_xp_amount;
  v_new_level := public.level_from_xp(v_new_xp);
  
  -- Check if leveled up
  IF v_new_level > v_current_level THEN
    v_leveled_up := true;
  END IF;

  -- Update profile
  UPDATE public.profiles
  SET 
    xp = v_new_xp,
    level = v_new_level
  WHERE id = p_profile_id;

  -- Record XP award for idempotency
  IF p_source_id IS NOT NULL THEN
    INSERT INTO public.xp_awards (profile_id, xp_amount, source, source_id, source_type)
    VALUES (p_profile_id, p_xp_amount, p_source, p_source_id, 
      CASE 
        WHEN p_source = 'clip_posted' THEN 'clip'
        WHEN p_source = 'reaction_given' THEN 'reaction'
        WHEN p_source = 'listened' THEN 'listen'
        ELSE 'activity'
      END
    )
    ON CONFLICT (profile_id, source, source_id) DO NOTHING;
  END IF;

  RETURN QUERY SELECT v_new_level, v_leveled_up;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 3. FIX BADGE UNLOCKING RACE CONDITIONS
-- ============================================================================

-- Enhanced badge checking functions with advisory locks to prevent race conditions
CREATE OR REPLACE FUNCTION public.check_milestone_badges(p_profile_id UUID)
RETURNS TABLE(badge_id UUID, badge_code TEXT) AS $$
DECLARE
  v_clips_count INTEGER;
  v_listens_count INTEGER;
  v_badge RECORD;
  v_lock_key BIGINT;
BEGIN
  -- Use advisory lock to prevent concurrent badge unlocks
  v_lock_key := hashtext('badge_check_' || p_profile_id::TEXT);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Get user stats
  SELECT 
    COUNT(*)::INTEGER,
    COALESCE(SUM(listens_count), 0)::INTEGER
  INTO v_clips_count, v_listens_count
  FROM public.clips
  WHERE profile_id = p_profile_id AND status = 'live';

  -- Check clips_count badges
  FOR v_badge IN 
    SELECT id, code FROM public.badges 
    WHERE category = 'milestone' 
      AND criteria_type = 'clips_count' 
      AND criteria_value <= v_clips_count
      AND id NOT IN (SELECT badge_id FROM public.user_badges WHERE profile_id = p_profile_id)
  LOOP
    INSERT INTO public.user_badges (profile_id, badge_id)
    VALUES (p_profile_id, v_badge.id)
    ON CONFLICT (profile_id, badge_id) DO NOTHING;
    
    -- Send notification (advisory lock prevents race conditions)
    PERFORM public.notify_badge_unlocked(p_profile_id, v_badge.id, v_badge.code);
    
    RETURN QUERY SELECT v_badge.id, v_badge.code;
  END LOOP;

  -- Check listens_count badges
  FOR v_badge IN 
    SELECT id, code FROM public.badges 
    WHERE category = 'milestone' 
      AND criteria_type = 'listens_count' 
      AND criteria_value <= v_listens_count
      AND id NOT IN (SELECT badge_id FROM public.user_badges WHERE profile_id = p_profile_id)
  LOOP
    INSERT INTO public.user_badges (profile_id, badge_id)
    VALUES (p_profile_id, v_badge.id)
    ON CONFLICT (profile_id, badge_id) DO NOTHING;
    
    -- Send notification (advisory lock prevents race conditions)
    PERFORM public.notify_badge_unlocked(p_profile_id, v_badge.id, v_badge.code);
    
    RETURN QUERY SELECT v_badge.id, v_badge.code;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update other badge checking functions similarly
CREATE OR REPLACE FUNCTION public.check_streak_badges(p_profile_id UUID)
RETURNS TABLE(badge_id UUID, badge_code TEXT) AS $$
DECLARE
  v_streak_days INTEGER;
  v_badge RECORD;
  v_lock_key BIGINT;
BEGIN
  -- Use advisory lock to prevent concurrent badge unlocks
  v_lock_key := hashtext('badge_check_' || p_profile_id::TEXT);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Get current streak
  SELECT current_streak_days INTO v_streak_days
  FROM public.profiles
  WHERE id = p_profile_id;

  -- Check streak badges
  FOR v_badge IN 
    SELECT id, code FROM public.badges 
    WHERE category = 'streak' 
      AND criteria_type = 'streak_days' 
      AND criteria_value <= v_streak_days
      AND id NOT IN (SELECT badge_id FROM public.user_badges WHERE profile_id = p_profile_id)
  LOOP
    INSERT INTO public.user_badges (profile_id, badge_id)
    VALUES (p_profile_id, v_badge.id)
    ON CONFLICT (profile_id, badge_id) DO NOTHING;
    
    -- Send notification (advisory lock prevents race conditions)
    PERFORM public.notify_badge_unlocked(p_profile_id, v_badge.id, v_badge.code);
    
    RETURN QUERY SELECT v_badge.id, v_badge.code;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.check_community_badges(p_profile_id UUID)
RETURNS TABLE(badge_id UUID, badge_code TEXT) AS $$
DECLARE
  v_community_clips INTEGER;
  v_badge RECORD;
  v_lock_key BIGINT;
BEGIN
  -- Use advisory lock to prevent concurrent badge unlocks
  v_lock_key := hashtext('badge_check_' || p_profile_id::TEXT);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Count clips in communities
  SELECT COUNT(*)::INTEGER
  INTO v_community_clips
  FROM public.clips
  WHERE profile_id = p_profile_id 
    AND status = 'live' 
    AND community_id IS NOT NULL;

  -- Check community badges (both global and custom)
  FOR v_badge IN 
    SELECT id, code FROM public.badges 
    WHERE category = 'community' 
      AND criteria_type = 'community_clips' 
      AND criteria_value <= v_community_clips
      AND id NOT IN (SELECT badge_id FROM public.user_badges WHERE profile_id = p_profile_id)
  LOOP
    INSERT INTO public.user_badges (profile_id, badge_id)
    VALUES (p_profile_id, v_badge.id)
    ON CONFLICT (profile_id, badge_id) DO NOTHING;
    
    -- Send notification (advisory lock prevents race conditions)
    PERFORM public.notify_badge_unlocked(p_profile_id, v_badge.id, v_badge.code);
    
    RETURN QUERY SELECT v_badge.id, v_badge.code;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.check_challenge_badges(p_profile_id UUID)
RETURNS TABLE(badge_id UUID, badge_code TEXT) AS $$
DECLARE
  v_challenges_participated INTEGER;
  v_badge RECORD;
  v_lock_key BIGINT;
BEGIN
  -- Use advisory lock to prevent concurrent badge unlocks
  v_lock_key := hashtext('badge_check_' || p_profile_id::TEXT);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Count unique challenges participated in
  SELECT COUNT(DISTINCT challenge_id)::INTEGER
  INTO v_challenges_participated
  FROM public.challenge_participations
  WHERE profile_id = p_profile_id;

  -- Check challenge badges
  FOR v_badge IN 
    SELECT id, code FROM public.badges 
    WHERE category = 'challenge' 
      AND criteria_type = 'challenges_participated' 
      AND criteria_value <= v_challenges_participated
      AND id NOT IN (SELECT badge_id FROM public.user_badges WHERE profile_id = p_profile_id)
  LOOP
    INSERT INTO public.user_badges (profile_id, badge_id)
    VALUES (p_profile_id, v_badge.id)
    ON CONFLICT (profile_id, badge_id) DO NOTHING;
    
    IF FOUND THEN
      PERFORM public.notify_badge_unlocked(p_profile_id, v_badge.id, v_badge.code);
    END IF;
    
    RETURN QUERY SELECT v_badge.id, v_badge.code;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update quality badges function (if it exists)
CREATE OR REPLACE FUNCTION public.check_quality_badges(p_profile_id UUID)
RETURNS TABLE(badge_id UUID, badge_code TEXT) AS $$
DECLARE
  v_avg_completion_rate NUMERIC;
  v_badge RECORD;
  v_lock_key BIGINT;
BEGIN
  -- Use advisory lock to prevent concurrent badge unlocks
  v_lock_key := hashtext('badge_check_' || p_profile_id::TEXT);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Get average completion rate
  SELECT COALESCE(AVG(completion_rate), 0)
  INTO v_avg_completion_rate
  FROM public.clips
  WHERE profile_id = p_profile_id 
    AND status = 'live' 
    AND completion_rate IS NOT NULL;

  -- Check quality badges
  FOR v_badge IN 
    SELECT id, code FROM public.badges 
    WHERE category = 'quality' 
      AND criteria_type = 'avg_completion_rate' 
      AND criteria_value <= v_avg_completion_rate
      AND id NOT IN (SELECT badge_id FROM public.user_badges WHERE profile_id = p_profile_id)
  LOOP
    INSERT INTO public.user_badges (profile_id, badge_id)
    VALUES (p_profile_id, v_badge.id)
    ON CONFLICT (profile_id, badge_id) DO NOTHING;
    
    -- Send notification (advisory lock prevents race conditions)
    PERFORM public.notify_badge_unlocked(p_profile_id, v_badge.id, v_badge.code);
    
    RETURN QUERY SELECT v_badge.id, v_badge.code;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update custom community badges function with advisory lock
CREATE OR REPLACE FUNCTION public.check_custom_community_badges(
  p_profile_id UUID,
  p_community_id UUID
)
RETURNS TABLE(badge_id UUID, badge_code TEXT) AS $$
DECLARE
  v_community_clips INTEGER;
  v_badge RECORD;
  v_lock_key BIGINT;
BEGIN
  -- Use advisory lock to prevent concurrent badge unlocks
  v_lock_key := hashtext('badge_check_' || p_profile_id::TEXT);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Count clips in this specific community
  SELECT COUNT(*)::INTEGER
  INTO v_community_clips
  FROM public.clips
  WHERE profile_id = p_profile_id 
    AND status = 'live' 
    AND community_id = p_community_id;

  -- Check custom community badges
  FOR v_badge IN 
    SELECT id, code FROM public.badges 
    WHERE category = 'custom' 
      AND community_id = p_community_id
      AND criteria_type = 'community_clips' 
      AND criteria_value <= v_community_clips
      AND id NOT IN (SELECT badge_id FROM public.user_badges WHERE profile_id = p_profile_id)
  LOOP
    INSERT INTO public.user_badges (profile_id, badge_id)
    VALUES (p_profile_id, v_badge.id)
    ON CONFLICT (profile_id, badge_id) DO NOTHING;
    
    -- Send notification (advisory lock prevents race conditions)
    PERFORM public.notify_badge_unlocked(p_profile_id, v_badge.id, v_badge.code);
    
    RETURN QUERY SELECT v_badge.id, v_badge.code;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 4. FIX BADGE PROGRESS ON CLIP DELETION
-- ============================================================================

-- Trigger function to re-check badges when clips are deleted
CREATE OR REPLACE FUNCTION public.on_clip_deleted()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process if clip was live and had a profile
  IF OLD.status = 'live' AND OLD.profile_id IS NOT NULL THEN
    -- Re-check all badges for the user (in case deletion changed their stats)
    PERFORM public.check_all_badges(OLD.profile_id);
    
    -- Recalculate karma
    UPDATE public.profiles
    SET total_karma = public.calculate_enhanced_reputation(OLD.profile_id)
    WHERE id = OLD.profile_id;
  END IF;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for clip deletion
DROP TRIGGER IF EXISTS trigger_on_clip_deleted ON public.clips;
CREATE TRIGGER trigger_on_clip_deleted
  AFTER DELETE ON public.clips
  FOR EACH ROW
  EXECUTE FUNCTION public.on_clip_deleted();

-- ============================================================================
-- 5. UPDATE XP AWARDING TRIGGERS TO PASS SOURCE_ID
-- ============================================================================

-- Update clip posted trigger to pass source_id for idempotency
CREATE OR REPLACE FUNCTION public.on_clip_posted_enhanced()
RETURNS TRIGGER AS $$
DECLARE
  v_xp_awarded INTEGER;
  v_leveled_up BOOLEAN;
BEGIN
  IF NEW.status = 'live' AND NEW.profile_id IS NOT NULL THEN
    -- Award XP for posting (base: 10 XP)
    v_xp_awarded := 10;
    
    -- Bonus XP for community clips
    IF NEW.community_id IS NOT NULL THEN
      v_xp_awarded := v_xp_awarded + 5;
      
      -- Check custom community badges
      PERFORM public.check_custom_community_badges(NEW.profile_id, NEW.community_id);
    END IF;
    
    -- Bonus XP for challenge participation
    IF NEW.challenge_id IS NOT NULL THEN
      v_xp_awarded := v_xp_awarded + 10;
    END IF;
    
    -- Award XP with source_id for idempotency
    PERFORM public.award_xp(NEW.profile_id, v_xp_awarded, 'clip_posted', NEW.id);
    
    -- Update streak
    PERFORM public.update_posting_streak(NEW.profile_id);
    
    -- Award community contribution if clip is in a community
    IF NEW.community_id IS NOT NULL THEN
      PERFORM public.award_community_contribution(
        NEW.profile_id,
        NEW.community_id,
        'clip',
        NEW.id,
        5
      );
    END IF;
    
    -- Record challenge participation if clip is for a challenge
    IF NEW.challenge_id IS NOT NULL THEN
      PERFORM public.record_challenge_participation(
        NEW.profile_id,
        NEW.challenge_id,
        NEW.id,
        10
      );
    END IF;
    
    -- Update total karma
    UPDATE public.profiles
    SET total_karma = public.calculate_enhanced_reputation(NEW.profile_id)
    WHERE id = NEW.profile_id;
    
    -- Check for badge unlocks (this will send notifications)
    PERFORM public.check_all_badges(NEW.profile_id);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update reaction trigger to pass source_id
CREATE OR REPLACE FUNCTION public.award_xp_for_reaction()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Award 2 XP for reacting, with source_id for idempotency
    PERFORM public.award_xp(NEW.profile_id, 2, 'reaction_given', NEW.id);
    
    -- Update karma for clip owner
    IF NEW.clip_id IS NOT NULL THEN
      UPDATE public.profiles
      SET total_karma = public.calculate_enhanced_reputation(
        (SELECT profile_id FROM public.clips WHERE id = NEW.clip_id)
      )
      WHERE id = (SELECT profile_id FROM public.clips WHERE id = NEW.clip_id);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update listen trigger to pass source_id
CREATE OR REPLACE FUNCTION public.award_xp_for_listen()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Award 1 XP for listening, with source_id for idempotency
    PERFORM public.award_xp(NEW.profile_id, 1, 'listened', NEW.id);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 6. COMMENTS
-- ============================================================================

COMMENT ON TABLE public.xp_awards IS 'Tracks XP awards for idempotency - prevents duplicate XP for same action';
COMMENT ON FUNCTION public.on_clip_deleted IS 'Re-checks badges when clips are deleted to ensure badge progress is accurate';
COMMENT ON FUNCTION public.update_posting_streak IS 'Updates posting streak using UTC dates to avoid timezone issues';

