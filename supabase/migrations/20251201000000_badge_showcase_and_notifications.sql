-- Badge Showcase, Notifications, and Custom Community Badges
-- Adds badge notifications, custom community badges, and enhances badge system

-- ============================================================================
-- 1. ADD BADGE NOTIFICATIONS TO NOTIFICATIONS TABLE
-- ============================================================================

-- Update notifications type to include 'badge_unlocked'
ALTER TABLE public.notifications
DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
ADD CONSTRAINT notifications_type_check 
CHECK (type IN ('comment', 'reply', 'follow', 'reaction', 'mention', 'challenge_update', 'badge_unlocked'));

-- Update entity_type to include 'badge'
ALTER TABLE public.notifications
DROP CONSTRAINT IF EXISTS notifications_entity_type_check;

ALTER TABLE public.notifications
ADD CONSTRAINT notifications_entity_type_check 
CHECK (entity_type IN ('clip', 'comment', 'challenge', 'profile', 'badge'));

-- ============================================================================
-- 2. CUSTOM COMMUNITY BADGES
-- ============================================================================

-- Add community_id to badges table for custom community badges
ALTER TABLE public.badges
ADD COLUMN IF NOT EXISTS community_id UUID REFERENCES public.communities(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS is_custom BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Update category constraint to allow 'custom' category
ALTER TABLE public.badges
DROP CONSTRAINT IF EXISTS badges_category_check;

ALTER TABLE public.badges
ADD CONSTRAINT badges_category_check 
CHECK (category IN ('milestone', 'quality', 'community', 'streak', 'challenge', 'social', 'viral', 'special', 'creative', 'karma', 'level', 'custom'));

-- Add index for community badges
CREATE INDEX IF NOT EXISTS idx_badges_community_id ON public.badges(community_id) WHERE community_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_badges_is_custom ON public.badges(is_custom) WHERE is_custom = true;

-- Update RLS to allow community creators/moderators to create custom badges
DROP POLICY IF EXISTS "Community creators can create custom badges" ON public.badges;
CREATE POLICY "Community creators can create custom badges"
ON public.badges FOR INSERT
WITH CHECK (
  is_custom = true AND (
    created_by_profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
    AND (
      -- User is community creator
      community_id IN (
        SELECT id FROM public.communities
        WHERE created_by_profile_id IN (
          SELECT id FROM public.profiles
          WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
        )
      )
      OR
      -- User is community moderator
      community_id IN (
        SELECT community_id FROM public.community_moderators
        WHERE moderator_profile_id IN (
          SELECT id FROM public.profiles
          WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
        )
      )
    )
  )
);

-- Allow community creators/moderators to update their custom badges
DROP POLICY IF EXISTS "Community creators can update custom badges" ON public.badges;
CREATE POLICY "Community creators can update custom badges"
ON public.badges FOR UPDATE
USING (
  is_custom = true AND (
    created_by_profile_id IN (
      SELECT id FROM public.profiles
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
    AND (
      community_id IN (
        SELECT id FROM public.communities
        WHERE created_by_profile_id IN (
          SELECT id FROM public.profiles
          WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
        )
      )
      OR
      community_id IN (
        SELECT community_id FROM public.community_moderators
        WHERE moderator_profile_id IN (
          SELECT id FROM public.profiles
          WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
        )
      )
    )
  )
);

-- ============================================================================
-- 3. BADGE NOTIFICATION FUNCTION
-- ============================================================================

-- Function to notify user when badge is unlocked
CREATE OR REPLACE FUNCTION public.notify_badge_unlocked(
  p_profile_id UUID,
  p_badge_id UUID,
  p_badge_code TEXT
)
RETURNS UUID AS $$
DECLARE
  v_notification_id UUID;
  v_badge_name TEXT;
  v_badge_icon TEXT;
BEGIN
  -- Get badge info
  SELECT name, icon_emoji INTO v_badge_name, v_badge_icon
  FROM public.badges
  WHERE id = p_badge_id;

  -- Create notification
  INSERT INTO public.notifications (
    recipient_id,
    actor_id,
    type,
    entity_type,
    entity_id,
    metadata
  )
  VALUES (
    p_profile_id,
    NULL, -- System notification, no actor
    'badge_unlocked',
    'badge',
    p_badge_id,
    jsonb_build_object(
      'badge_code', p_badge_code,
      'badge_name', v_badge_name,
      'badge_icon', v_badge_icon
    )
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 4. UPDATE BADGE UNLOCKING FUNCTIONS TO SEND NOTIFICATIONS
-- ============================================================================

-- Enhanced function to check and unlock milestone badges with notifications
CREATE OR REPLACE FUNCTION public.check_milestone_badges(p_profile_id UUID)
RETURNS TABLE(badge_id UUID, badge_code TEXT) AS $$
DECLARE
  v_clips_count INTEGER;
  v_listens_count INTEGER;
  v_badge RECORD;
BEGIN
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
    
    -- Send notification
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
    
    -- Send notification
    PERFORM public.notify_badge_unlocked(p_profile_id, v_badge.id, v_badge.code);
    
    RETURN QUERY SELECT v_badge.id, v_badge.code;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enhanced function to check and unlock quality badges with notifications
CREATE OR REPLACE FUNCTION public.check_quality_badges(p_profile_id UUID)
RETURNS TABLE(badge_id UUID, badge_code TEXT) AS $$
DECLARE
  v_avg_completion_rate NUMERIC;
  v_badge RECORD;
BEGIN
  -- Calculate average completion rate
  SELECT COALESCE(AVG(completion_rate), 0)
  INTO v_avg_completion_rate
  FROM public.clips
  WHERE profile_id = p_profile_id 
    AND status = 'live' 
    AND completion_rate IS NOT NULL
    AND listens_count >= 10;

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
    
    -- Send notification
    PERFORM public.notify_badge_unlocked(p_profile_id, v_badge.id, v_badge.code);
    
    RETURN QUERY SELECT v_badge.id, v_badge.code;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enhanced function to check and unlock streak badges with notifications
CREATE OR REPLACE FUNCTION public.check_streak_badges(p_profile_id UUID)
RETURNS TABLE(badge_id UUID, badge_code TEXT) AS $$
DECLARE
  v_streak_days INTEGER;
  v_badge RECORD;
BEGIN
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
    
    -- Send notification
    PERFORM public.notify_badge_unlocked(p_profile_id, v_badge.id, v_badge.code);
    
    RETURN QUERY SELECT v_badge.id, v_badge.code;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enhanced function to check and unlock community badges with notifications
CREATE OR REPLACE FUNCTION public.check_community_badges(p_profile_id UUID)
RETURNS TABLE(badge_id UUID, badge_code TEXT) AS $$
DECLARE
  v_community_clips INTEGER;
  v_badge RECORD;
BEGIN
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
    
    -- Send notification
    PERFORM public.notify_badge_unlocked(p_profile_id, v_badge.id, v_badge.code);
    
    RETURN QUERY SELECT v_badge.id, v_badge.code;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enhanced function to check and unlock challenge badges with notifications
CREATE OR REPLACE FUNCTION public.check_challenge_badges(p_profile_id UUID)
RETURNS TABLE(badge_id UUID, badge_code TEXT) AS $$
DECLARE
  v_challenges_participated INTEGER;
  v_badge RECORD;
BEGIN
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
    
    -- Send notification
    PERFORM public.notify_badge_unlocked(p_profile_id, v_badge.id, v_badge.code);
    
    RETURN QUERY SELECT v_badge.id, v_badge.code;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update all other badge checking functions to send notifications
-- (We'll update the master function to call these)

-- ============================================================================
-- 5. FUNCTION TO CREATE CUSTOM COMMUNITY BADGE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_community_badge(
  p_community_id UUID,
  p_code TEXT,
  p_name TEXT,
  p_description TEXT,
  p_icon_emoji TEXT,
  p_criteria_type TEXT,
  p_criteria_value NUMERIC,
  p_rarity TEXT DEFAULT 'common'
)
RETURNS UUID AS $$
DECLARE
  v_profile_id UUID;
  v_badge_id UUID;
BEGIN
  -- Get current user profile
  SELECT id INTO v_profile_id
  FROM public.profiles
  WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id';

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Verify user is community creator or moderator
  IF NOT EXISTS (
    SELECT 1 FROM public.communities
    WHERE id = p_community_id
      AND (
        created_by_profile_id = v_profile_id
        OR id IN (
          SELECT community_id FROM public.community_moderators
          WHERE moderator_profile_id = v_profile_id
        )
      )
  ) THEN
    RAISE EXCEPTION 'Only community creators and moderators can create custom badges';
  END IF;

  -- Create custom badge
  INSERT INTO public.badges (
    code,
    name,
    description,
    icon_emoji,
    category,
    criteria_type,
    criteria_value,
    rarity,
    community_id,
    is_custom,
    created_by_profile_id
  )
  VALUES (
    p_code,
    p_name,
    p_description,
    p_icon_emoji,
    'custom',
    p_criteria_type,
    p_criteria_value,
    p_rarity,
    p_community_id,
    true,
    v_profile_id
  )
  RETURNING id INTO v_badge_id;

  RETURN v_badge_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 6. FUNCTION TO CHECK CUSTOM COMMUNITY BADGES
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_custom_community_badges(
  p_profile_id UUID,
  p_community_id UUID
)
RETURNS TABLE(badge_id UUID, badge_code TEXT) AS $$
DECLARE
  v_community_clips INTEGER;
  v_badge RECORD;
BEGIN
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
    
    -- Send notification
    PERFORM public.notify_badge_unlocked(p_profile_id, v_badge.id, v_badge.code);
    
    RETURN QUERY SELECT v_badge.id, v_badge.code;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 7. UPDATE TRIGGER TO CHECK CUSTOM BADGES
-- ============================================================================

-- Update the clip posted trigger to check custom community badges
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
    
    -- Award XP
    PERFORM public.award_xp(NEW.profile_id, v_xp_awarded, 'clip_posted');
    
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

-- ============================================================================
-- 8. UPDATE OTHER BADGE CHECKING FUNCTIONS TO SEND NOTIFICATIONS
-- ============================================================================

-- Update social badges function
CREATE OR REPLACE FUNCTION public.check_social_badges(p_profile_id UUID)
RETURNS TABLE(badge_id UUID, badge_code TEXT) AS $$
DECLARE
  v_reactions_given INTEGER;
  v_replies_given INTEGER;
  v_followers_count INTEGER;
  v_clips_listened INTEGER;
  v_badge RECORD;
BEGIN
  -- Count reactions given
  SELECT COUNT(*)::INTEGER INTO v_reactions_given
  FROM public.clip_reactions
  WHERE profile_id = p_profile_id;

  -- Count replies given
  SELECT COUNT(*)::INTEGER INTO v_replies_given
  FROM public.clips
  WHERE profile_id = p_profile_id AND parent_clip_id IS NOT NULL;

  -- Count followers
  SELECT COUNT(*)::INTEGER INTO v_followers_count
  FROM public.follows
  WHERE following_id = p_profile_id;

  -- Count clips listened
  SELECT COUNT(DISTINCT clip_id)::INTEGER INTO v_clips_listened
  FROM public.listens
  WHERE profile_id = p_profile_id;

  -- Check reactions_given badges
  FOR v_badge IN 
    SELECT id, code FROM public.badges 
    WHERE category = 'social' 
      AND criteria_type = 'reactions_given' 
      AND criteria_value <= v_reactions_given
      AND id NOT IN (SELECT badge_id FROM public.user_badges WHERE profile_id = p_profile_id)
  LOOP
    INSERT INTO public.user_badges (profile_id, badge_id)
    VALUES (p_profile_id, v_badge.id)
    ON CONFLICT (profile_id, badge_id) DO NOTHING;
    PERFORM public.notify_badge_unlocked(p_profile_id, v_badge.id, v_badge.code);
    RETURN QUERY SELECT v_badge.id, v_badge.code;
  END LOOP;

  -- Check replies_given badges
  FOR v_badge IN 
    SELECT id, code FROM public.badges 
    WHERE category = 'social' 
      AND criteria_type = 'replies_given' 
      AND criteria_value <= v_replies_given
      AND id NOT IN (SELECT badge_id FROM public.user_badges WHERE profile_id = p_profile_id)
  LOOP
    INSERT INTO public.user_badges (profile_id, badge_id)
    VALUES (p_profile_id, v_badge.id)
    ON CONFLICT (profile_id, badge_id) DO NOTHING;
    PERFORM public.notify_badge_unlocked(p_profile_id, v_badge.id, v_badge.code);
    RETURN QUERY SELECT v_badge.id, v_badge.code;
  END LOOP;

  -- Check followers_count badges
  FOR v_badge IN 
    SELECT id, code FROM public.badges 
    WHERE category = 'social' 
      AND criteria_type = 'followers_count' 
      AND criteria_value <= v_followers_count
      AND id NOT IN (SELECT badge_id FROM public.user_badges WHERE profile_id = p_profile_id)
  LOOP
    INSERT INTO public.user_badges (profile_id, badge_id)
    VALUES (p_profile_id, v_badge.id)
    ON CONFLICT (profile_id, badge_id) DO NOTHING;
    PERFORM public.notify_badge_unlocked(p_profile_id, v_badge.id, v_badge.code);
    RETURN QUERY SELECT v_badge.id, v_badge.code;
  END LOOP;

  -- Check clips_listened badges
  FOR v_badge IN 
    SELECT id, code FROM public.badges 
    WHERE category = 'social' 
      AND criteria_type = 'clips_listened' 
      AND criteria_value <= v_clips_listened
      AND id NOT IN (SELECT badge_id FROM public.user_badges WHERE profile_id = p_profile_id)
  LOOP
    INSERT INTO public.user_badges (profile_id, badge_id)
    VALUES (p_profile_id, v_badge.id)
    ON CONFLICT (profile_id, badge_id) DO NOTHING;
    PERFORM public.notify_badge_unlocked(p_profile_id, v_badge.id, v_badge.code);
    RETURN QUERY SELECT v_badge.id, v_badge.code;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update viral badges function
CREATE OR REPLACE FUNCTION public.check_viral_badges(p_profile_id UUID)
RETURNS TABLE(badge_id UUID, badge_code TEXT) AS $$
DECLARE
  v_trending_clips INTEGER;
  v_max_reactions INTEGER;
  v_max_listens INTEGER;
  v_badge RECORD;
BEGIN
  -- Count trending clips
  SELECT COUNT(*)::INTEGER INTO v_trending_clips
  FROM public.clips
  WHERE profile_id = p_profile_id 
    AND status = 'live' 
    AND trending_score > 0.5;

  -- Get max reactions
  SELECT COALESCE(MAX(
    (SELECT SUM(value::INTEGER) FROM jsonb_each_text(reactions))
  ), 0)::INTEGER INTO v_max_reactions
  FROM public.clips
  WHERE profile_id = p_profile_id AND status = 'live';

  -- Get max listens
  SELECT COALESCE(MAX(listens_count), 0)::INTEGER INTO v_max_listens
  FROM public.clips
  WHERE profile_id = p_profile_id AND status = 'live';

  -- Check trending_clips badges
  FOR v_badge IN 
    SELECT id, code FROM public.badges 
    WHERE category = 'viral' 
      AND criteria_type = 'trending_clips' 
      AND criteria_value <= v_trending_clips
      AND id NOT IN (SELECT badge_id FROM public.user_badges WHERE profile_id = p_profile_id)
  LOOP
    INSERT INTO public.user_badges (profile_id, badge_id)
    VALUES (p_profile_id, v_badge.id)
    ON CONFLICT (profile_id, badge_id) DO NOTHING;
    PERFORM public.notify_badge_unlocked(p_profile_id, v_badge.id, v_badge.code);
    RETURN QUERY SELECT v_badge.id, v_badge.code;
  END LOOP;

  -- Check max_reactions badges
  FOR v_badge IN 
    SELECT id, code FROM public.badges 
    WHERE category = 'viral' 
      AND criteria_type = 'max_reactions' 
      AND criteria_value <= v_max_reactions
      AND id NOT IN (SELECT badge_id FROM public.user_badges WHERE profile_id = p_profile_id)
  LOOP
    INSERT INTO public.user_badges (profile_id, badge_id)
    VALUES (p_profile_id, v_badge.id)
    ON CONFLICT (profile_id, badge_id) DO NOTHING;
    PERFORM public.notify_badge_unlocked(p_profile_id, v_badge.id, v_badge.code);
    RETURN QUERY SELECT v_badge.id, v_badge.code;
  END LOOP;

  -- Check max_listens badges
  FOR v_badge IN 
    SELECT id, code FROM public.badges 
    WHERE category = 'viral' 
      AND criteria_type = 'max_listens' 
      AND criteria_value <= v_max_listens
      AND id NOT IN (SELECT badge_id FROM public.user_badges WHERE profile_id = p_profile_id)
  LOOP
    INSERT INTO public.user_badges (profile_id, badge_id)
    VALUES (p_profile_id, v_badge.id)
    ON CONFLICT (profile_id, badge_id) DO NOTHING;
    PERFORM public.notify_badge_unlocked(p_profile_id, v_badge.id, v_badge.code);
    RETURN QUERY SELECT v_badge.id, v_badge.code;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update special badges function
CREATE OR REPLACE FUNCTION public.check_special_badges(p_profile_id UUID)
RETURNS TABLE(badge_id UUID, badge_code TEXT) AS $$
DECLARE
  v_days_since_join INTEGER;
  v_night_posts INTEGER;
  v_morning_posts INTEGER;
  v_weekend_posts INTEGER;
  v_badge RECORD;
BEGIN
  -- Calculate days since join
  SELECT EXTRACT(DAY FROM (NOW() - joined_at))::INTEGER INTO v_days_since_join
  FROM public.profiles
  WHERE id = p_profile_id;

  -- Count night posts
  SELECT COUNT(*)::INTEGER INTO v_night_posts
  FROM public.clips
  WHERE profile_id = p_profile_id 
    AND status = 'live'
    AND EXTRACT(HOUR FROM created_at) >= 0 
    AND EXTRACT(HOUR FROM created_at) < 6;

  -- Count morning posts
  SELECT COUNT(*)::INTEGER INTO v_morning_posts
  FROM public.clips
  WHERE profile_id = p_profile_id 
    AND status = 'live'
    AND EXTRACT(HOUR FROM created_at) >= 6 
    AND EXTRACT(HOUR FROM created_at) < 9;

  -- Count weekend posts
  SELECT COUNT(*)::INTEGER INTO v_weekend_posts
  FROM public.clips
  WHERE profile_id = p_profile_id 
    AND status = 'live'
    AND EXTRACT(DOW FROM created_at) IN (0, 6);

  -- Check days_since_join badges
  FOR v_badge IN 
    SELECT id, code FROM public.badges 
    WHERE category = 'special' 
      AND criteria_type = 'days_since_join' 
      AND criteria_value <= v_days_since_join
      AND id NOT IN (SELECT badge_id FROM public.user_badges WHERE profile_id = p_profile_id)
  LOOP
    INSERT INTO public.user_badges (profile_id, badge_id)
    VALUES (p_profile_id, v_badge.id)
    ON CONFLICT (profile_id, badge_id) DO NOTHING;
    PERFORM public.notify_badge_unlocked(p_profile_id, v_badge.id, v_badge.code);
    RETURN QUERY SELECT v_badge.id, v_badge.code;
  END LOOP;

  -- Check night_posts badges
  FOR v_badge IN 
    SELECT id, code FROM public.badges 
    WHERE category = 'special' 
      AND criteria_type = 'night_posts' 
      AND criteria_value <= v_night_posts
      AND id NOT IN (SELECT badge_id FROM public.user_badges WHERE profile_id = p_profile_id)
  LOOP
    INSERT INTO public.user_badges (profile_id, badge_id)
    VALUES (p_profile_id, v_badge.id)
    ON CONFLICT (profile_id, badge_id) DO NOTHING;
    PERFORM public.notify_badge_unlocked(p_profile_id, v_badge.id, v_badge.code);
    RETURN QUERY SELECT v_badge.id, v_badge.code;
  END LOOP;

  -- Check morning_posts badges
  FOR v_badge IN 
    SELECT id, code FROM public.badges 
    WHERE category = 'special' 
      AND criteria_type = 'morning_posts' 
      AND criteria_value <= v_morning_posts
      AND id NOT IN (SELECT badge_id FROM public.user_badges WHERE profile_id = p_profile_id)
  LOOP
    INSERT INTO public.user_badges (profile_id, badge_id)
    VALUES (p_profile_id, v_badge.id)
    ON CONFLICT (profile_id, badge_id) DO NOTHING;
    PERFORM public.notify_badge_unlocked(p_profile_id, v_badge.id, v_badge.code);
    RETURN QUERY SELECT v_badge.id, v_badge.code;
  END LOOP;

  -- Check weekend_posts badges
  FOR v_badge IN 
    SELECT id, code FROM public.badges 
    WHERE category = 'special' 
      AND criteria_type = 'weekend_posts' 
      AND criteria_value <= v_weekend_posts
      AND id NOT IN (SELECT badge_id FROM public.user_badges WHERE profile_id = p_profile_id)
  LOOP
    INSERT INTO public.user_badges (profile_id, badge_id)
    VALUES (p_profile_id, v_badge.id)
    ON CONFLICT (profile_id, badge_id) DO NOTHING;
    PERFORM public.notify_badge_unlocked(p_profile_id, v_badge.id, v_badge.code);
    RETURN QUERY SELECT v_badge.id, v_badge.code;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update creative badges function
CREATE OR REPLACE FUNCTION public.check_creative_badges(p_profile_id UUID)
RETURNS TABLE(badge_id UUID, badge_code TEXT) AS $$
DECLARE
  v_remixes_created INTEGER;
  v_podcasts_created INTEGER;
  v_badge RECORD;
BEGIN
  -- Count remixes
  SELECT COUNT(*)::INTEGER INTO v_remixes_created
  FROM public.clips
  WHERE profile_id = p_profile_id 
    AND status = 'live' 
    AND remix_of_clip_id IS NOT NULL;

  -- Count podcasts
  SELECT COUNT(*)::INTEGER INTO v_podcasts_created
  FROM public.clips
  WHERE profile_id = p_profile_id 
    AND status = 'live' 
    AND is_podcast = true;

  -- Check remixes_created badges
  FOR v_badge IN 
    SELECT id, code FROM public.badges 
    WHERE category = 'creative' 
      AND criteria_type = 'remixes_created' 
      AND criteria_value <= v_remixes_created
      AND id NOT IN (SELECT badge_id FROM public.user_badges WHERE profile_id = p_profile_id)
  LOOP
    INSERT INTO public.user_badges (profile_id, badge_id)
    VALUES (p_profile_id, v_badge.id)
    ON CONFLICT (profile_id, badge_id) DO NOTHING;
    PERFORM public.notify_badge_unlocked(p_profile_id, v_badge.id, v_badge.code);
    RETURN QUERY SELECT v_badge.id, v_badge.code;
  END LOOP;

  -- Check podcasts_created badges
  FOR v_badge IN 
    SELECT id, code FROM public.badges 
    WHERE category = 'creative' 
      AND criteria_type = 'podcasts_created' 
      AND criteria_value <= v_podcasts_created
      AND id NOT IN (SELECT badge_id FROM public.user_badges WHERE profile_id = p_profile_id)
  LOOP
    INSERT INTO public.user_badges (profile_id, badge_id)
    VALUES (p_profile_id, v_badge.id)
    ON CONFLICT (profile_id, badge_id) DO NOTHING;
    PERFORM public.notify_badge_unlocked(p_profile_id, v_badge.id, v_badge.code);
    RETURN QUERY SELECT v_badge.id, v_badge.code;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update karma badges function
CREATE OR REPLACE FUNCTION public.check_karma_badges(p_profile_id UUID)
RETURNS TABLE(badge_id UUID, badge_code TEXT) AS $$
DECLARE
  v_karma INTEGER;
  v_badge RECORD;
BEGIN
  -- Get total karma
  SELECT COALESCE(total_karma, 0) INTO v_karma
  FROM public.profiles
  WHERE id = p_profile_id;

  -- Check karma badges
  FOR v_badge IN 
    SELECT id, code FROM public.badges 
    WHERE category = 'karma' 
      AND criteria_type = 'karma_points' 
      AND criteria_value <= v_karma
      AND id NOT IN (SELECT badge_id FROM public.user_badges WHERE profile_id = p_profile_id)
  LOOP
    INSERT INTO public.user_badges (profile_id, badge_id)
    VALUES (p_profile_id, v_badge.id)
    ON CONFLICT (profile_id, badge_id) DO NOTHING;
    PERFORM public.notify_badge_unlocked(p_profile_id, v_badge.id, v_badge.code);
    RETURN QUERY SELECT v_badge.id, v_badge.code;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update level badges function
CREATE OR REPLACE FUNCTION public.check_level_badges(p_profile_id UUID)
RETURNS TABLE(badge_id UUID, badge_code TEXT) AS $$
DECLARE
  v_level INTEGER;
  v_badge RECORD;
BEGIN
  -- Get user level
  SELECT COALESCE(level, 1) INTO v_level
  FROM public.profiles
  WHERE id = p_profile_id;

  -- Check level badges
  FOR v_badge IN 
    SELECT id, code FROM public.badges 
    WHERE category = 'level' 
      AND criteria_type = 'user_level' 
      AND criteria_value <= v_level
      AND id NOT IN (SELECT badge_id FROM public.user_badges WHERE profile_id = p_profile_id)
  LOOP
    INSERT INTO public.user_badges (profile_id, badge_id)
    VALUES (p_profile_id, v_badge.id)
    ON CONFLICT (profile_id, badge_id) DO NOTHING;
    PERFORM public.notify_badge_unlocked(p_profile_id, v_badge.id, v_badge.code);
    RETURN QUERY SELECT v_badge.id, v_badge.code;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 9. COMMENTS
-- ============================================================================

COMMENT ON COLUMN public.badges.community_id IS 'For custom community badges, references the community this badge belongs to';
COMMENT ON COLUMN public.badges.is_custom IS 'True if this is a custom badge created by a community';
COMMENT ON COLUMN public.badges.created_by_profile_id IS 'Profile that created this custom badge';
COMMENT ON FUNCTION public.notify_badge_unlocked IS 'Creates a notification when a user unlocks a badge';
COMMENT ON FUNCTION public.create_community_badge IS 'Allows community creators/moderators to create custom badges for their community';
COMMENT ON FUNCTION public.check_custom_community_badges IS 'Checks and unlocks custom community badges for a user';

