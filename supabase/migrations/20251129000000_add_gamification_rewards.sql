-- Gamification & Rewards System
-- Implements: Achievement Badges, Voice Quality Badges, Community Contributions,
-- Streak Tracking, Leaderboards, and Challenge Rewards

-- ============================================================================
-- 1. BADGES SYSTEM
-- ============================================================================

-- Badge definitions table
CREATE TABLE IF NOT EXISTS public.badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL, -- e.g., 'first_clip', 'hundred_clips', 'quality_master'
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon_emoji TEXT NOT NULL DEFAULT '🏆',
  category TEXT NOT NULL CHECK (category IN ('milestone', 'quality', 'community', 'streak', 'challenge')),
  criteria_type TEXT NOT NULL, -- e.g., 'clips_count', 'listens_count', 'quality_score', 'streak_days'
  criteria_value NUMERIC NOT NULL, -- e.g., 100 for 100 clips
  rarity TEXT NOT NULL DEFAULT 'common' CHECK (rarity IN ('common', 'rare', 'epic', 'legendary')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- User badges (earned badges)
CREATE TABLE IF NOT EXISTS public.user_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  badge_id UUID REFERENCES public.badges(id) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb, -- Additional context (e.g., which clip triggered it)
  UNIQUE(profile_id, badge_id)
);

-- ============================================================================
-- 2. STREAK TRACKING
-- ============================================================================

-- Add streak tracking to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS current_streak_days INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS longest_streak_days INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_post_date DATE;

-- Daily posting activity tracking
CREATE TABLE IF NOT EXISTS public.posting_streaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_date DATE NOT NULL,
  clip_count INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(profile_id, post_date)
);

-- ============================================================================
-- 3. COMMUNITY CONTRIBUTIONS
-- ============================================================================

-- Track community contributions for rewards
CREATE TABLE IF NOT EXISTS public.community_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  community_id UUID REFERENCES public.communities(id) ON DELETE CASCADE,
  contribution_type TEXT NOT NULL CHECK (contribution_type IN ('clip', 'comment', 'reaction', 'moderation', 'event')),
  contribution_id UUID, -- References the clip/comment/etc that was contributed
  points_awarded INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add community contribution points to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS community_points INTEGER DEFAULT 0;

-- ============================================================================
-- 4. CHALLENGE PARTICIPATION REWARDS
-- ============================================================================

-- Track challenge participation and rewards
CREATE TABLE IF NOT EXISTS public.challenge_participations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  challenge_id UUID REFERENCES public.challenges(id) ON DELETE CASCADE,
  clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE,
  points_awarded INTEGER DEFAULT 0,
  badge_awarded_id UUID REFERENCES public.badges(id) ON DELETE SET NULL,
  participated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(profile_id, challenge_id, clip_id)
);

-- ============================================================================
-- 5. INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_badges_code ON public.badges(code);
CREATE INDEX IF NOT EXISTS idx_badges_category ON public.badges(category);
CREATE INDEX IF NOT EXISTS idx_user_badges_profile_id ON public.user_badges(profile_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_badge_id ON public.user_badges(badge_id);
CREATE INDEX IF NOT EXISTS idx_posting_streaks_profile_id ON public.posting_streaks(profile_id);
CREATE INDEX IF NOT EXISTS idx_posting_streaks_post_date ON public.posting_streaks(post_date DESC);
CREATE INDEX IF NOT EXISTS idx_community_contributions_profile_id ON public.community_contributions(profile_id);
CREATE INDEX IF NOT EXISTS idx_community_contributions_community_id ON public.community_contributions(community_id);
CREATE INDEX IF NOT EXISTS idx_challenge_participations_profile_id ON public.challenge_participations(profile_id);
CREATE INDEX IF NOT EXISTS idx_challenge_participations_challenge_id ON public.challenge_participations(challenge_id);
CREATE INDEX IF NOT EXISTS idx_profiles_streak ON public.profiles(current_streak_days DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_community_points ON public.profiles(community_points DESC);

-- ============================================================================
-- 6. ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posting_streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_participations ENABLE ROW LEVEL SECURITY;

-- Badges are viewable by everyone
CREATE POLICY "Badges are viewable by everyone"
ON public.badges FOR SELECT
USING (true);

-- User badges are viewable by everyone
CREATE POLICY "User badges are viewable by everyone"
ON public.user_badges FOR SELECT
USING (true);

-- Users can view their own streaks
CREATE POLICY "Users can view their own streaks"
ON public.posting_streaks FOR SELECT
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Streaks are viewable by everyone (for leaderboards)
CREATE POLICY "Streaks are viewable by everyone"
ON public.posting_streaks FOR SELECT
USING (true);

-- Community contributions are viewable by everyone
CREATE POLICY "Community contributions are viewable by everyone"
ON public.community_contributions FOR SELECT
USING (true);

-- Challenge participations are viewable by everyone
CREATE POLICY "Challenge participations are viewable by everyone"
ON public.challenge_participations FOR SELECT
USING (true);

-- ============================================================================
-- 7. BADGE SEED DATA
-- ============================================================================

-- Milestone badges
INSERT INTO public.badges (code, name, description, icon_emoji, category, criteria_type, criteria_value, rarity) VALUES
-- Clip milestones
('first_clip', 'First Voice', 'Posted your first voice clip', '🎤', 'milestone', 'clips_count', 1, 'common'),
('ten_clips', 'Getting Started', 'Posted 10 voice clips', '🎵', 'milestone', 'clips_count', 10, 'common'),
('fifty_clips', 'Voice Enthusiast', 'Posted 50 voice clips', '🎙️', 'milestone', 'clips_count', 50, 'rare'),
('hundred_clips', 'Century Creator', 'Posted 100 voice clips', '💯', 'milestone', 'clips_count', 100, 'epic'),
('five_hundred_clips', 'Voice Master', 'Posted 500 voice clips', '🌟', 'milestone', 'clips_count', 500, 'legendary'),
('thousand_clips', 'Voice Legend', 'Posted 1,000 voice clips', '👑', 'milestone', 'clips_count', 1000, 'legendary'),

-- Listen milestones
('hundred_listens', 'First Hundred', 'Received 100 listens on your clips', '👂', 'milestone', 'listens_count', 100, 'common'),
('thousand_listens', 'Thousand Listens', 'Received 1,000 listens on your clips', '🎧', 'milestone', 'listens_count', 1000, 'rare'),
('ten_thousand_listens', 'Ten Thousand', 'Received 10,000 listens on your clips', '🔥', 'milestone', 'listens_count', 10000, 'epic'),
('hundred_thousand_listens', 'Hundred Thousand', 'Received 100,000 listens on your clips', '💎', 'milestone', 'listens_count', 100000, 'legendary'),

-- Quality badges
('quality_novice', 'Quality Novice', 'Average completion rate above 60%', '⭐', 'quality', 'avg_completion_rate', 0.6, 'common'),
('quality_adept', 'Quality Adept', 'Average completion rate above 75%', '⭐⭐', 'quality', 'avg_completion_rate', 0.75, 'rare'),
('quality_master', 'Quality Master', 'Average completion rate above 85%', '⭐⭐⭐', 'quality', 'avg_completion_rate', 0.85, 'epic'),
('quality_legend', 'Quality Legend', 'Average completion rate above 95%', '💫', 'quality', 'avg_completion_rate', 0.95, 'legendary'),

-- Streak badges
('three_day_streak', 'Three Day Streak', 'Posted clips for 3 days in a row', '🔥', 'streak', 'streak_days', 3, 'common'),
('week_streak', 'Week Warrior', 'Posted clips for 7 days in a row', '🔥🔥', 'streak', 'streak_days', 7, 'rare'),
('month_streak', 'Monthly Master', 'Posted clips for 30 days in a row', '🔥🔥🔥', 'streak', 'streak_days', 30, 'epic'),
('hundred_day_streak', 'Century Streak', 'Posted clips for 100 days in a row', '💯🔥', 'streak', 'streak_days', 100, 'legendary'),

-- Community badges
('community_contributor', 'Community Contributor', 'Contributed 10 clips to communities', '🏘️', 'community', 'community_clips', 10, 'common'),
('community_champion', 'Community Champion', 'Contributed 50 clips to communities', '🏆', 'community', 'community_clips', 50, 'rare'),
('community_legend', 'Community Legend', 'Contributed 200 clips to communities', '👑', 'community', 'community_clips', 200, 'epic'),

-- Challenge badges
('challenge_participant', 'Challenge Participant', 'Participated in your first challenge', '🎯', 'challenge', 'challenges_participated', 1, 'common'),
('challenge_enthusiast', 'Challenge Enthusiast', 'Participated in 10 challenges', '🎯🎯', 'challenge', 'challenges_participated', 10, 'rare'),
('challenge_master', 'Challenge Master', 'Participated in 50 challenges', '🎯🎯🎯', 'challenge', 'challenges_participated', 50, 'epic')
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 8. FUNCTIONS FOR BADGE UNLOCKING
-- ============================================================================

-- Function to check and unlock milestone badges
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
    
    RETURN QUERY SELECT v_badge.id, v_badge.code;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check and unlock quality badges
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
    AND listens_count >= 10; -- Need at least 10 listens for quality badge

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
    
    RETURN QUERY SELECT v_badge.id, v_badge.code;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check and unlock streak badges
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
    
    RETURN QUERY SELECT v_badge.id, v_badge.code;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check and unlock community badges
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

  -- Check community badges
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
    
    RETURN QUERY SELECT v_badge.id, v_badge.code;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check and unlock challenge badges
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
    
    RETURN QUERY SELECT v_badge.id, v_badge.code;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Master function to check all badges
CREATE OR REPLACE FUNCTION public.check_all_badges(p_profile_id UUID)
RETURNS TABLE(badge_id UUID, badge_code TEXT) AS $$
BEGIN
  RETURN QUERY SELECT * FROM public.check_milestone_badges(p_profile_id);
  RETURN QUERY SELECT * FROM public.check_quality_badges(p_profile_id);
  RETURN QUERY SELECT * FROM public.check_streak_badges(p_profile_id);
  RETURN QUERY SELECT * FROM public.check_community_badges(p_profile_id);
  RETURN QUERY SELECT * FROM public.check_challenge_badges(p_profile_id);
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 9. STREAK TRACKING FUNCTIONS
-- ============================================================================

-- Function to update streak when a clip is posted
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
  v_today := CURRENT_DATE;
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
-- 10. COMMUNITY CONTRIBUTION FUNCTIONS
-- ============================================================================

-- Function to award community contribution points
CREATE OR REPLACE FUNCTION public.award_community_contribution(
  p_profile_id UUID,
  p_community_id UUID,
  p_contribution_type TEXT,
  p_contribution_id UUID,
  p_points INTEGER DEFAULT 1
)
RETURNS VOID AS $$
BEGIN
  -- Record contribution
  INSERT INTO public.community_contributions (
    profile_id,
    community_id,
    contribution_type,
    contribution_id,
    points_awarded
  )
  VALUES (
    p_profile_id,
    p_community_id,
    p_contribution_type,
    p_contribution_id,
    p_points
  );

  -- Update profile community points
  UPDATE public.profiles
  SET community_points = community_points + p_points
  WHERE id = p_profile_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 11. CHALLENGE PARTICIPATION FUNCTIONS
-- ============================================================================

-- Function to record challenge participation and award rewards
CREATE OR REPLACE FUNCTION public.record_challenge_participation(
  p_profile_id UUID,
  p_challenge_id UUID,
  p_clip_id UUID,
  p_points INTEGER DEFAULT 10
)
RETURNS TABLE(badge_id UUID, badge_code TEXT) AS $$
DECLARE
  v_badge_id UUID;
BEGIN
  -- Record participation
  INSERT INTO public.challenge_participations (
    profile_id,
    challenge_id,
    clip_id,
    points_awarded
  )
  VALUES (
    p_profile_id,
    p_challenge_id,
    p_clip_id,
    p_points
  )
  ON CONFLICT (profile_id, challenge_id, clip_id) DO NOTHING;

  -- Check for challenge badges
  RETURN QUERY SELECT * FROM public.check_challenge_badges(p_profile_id);
  
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 12. LEADERBOARD FUNCTIONS
-- ============================================================================

-- Top creators leaderboard
CREATE OR REPLACE FUNCTION public.get_top_creators(
  p_period TEXT DEFAULT 'all_time', -- 'day', 'week', 'month', 'all_time'
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE(
  profile_id UUID,
  handle TEXT,
  emoji_avatar TEXT,
  clips_count BIGINT,
  total_listens BIGINT,
  reputation INTEGER,
  rank BIGINT
) AS $$
DECLARE
  v_start_date TIMESTAMPTZ;
BEGIN
  -- Calculate start date based on period
  CASE p_period
    WHEN 'day' THEN v_start_date := NOW() - INTERVAL '1 day';
    WHEN 'week' THEN v_start_date := NOW() - INTERVAL '7 days';
    WHEN 'month' THEN v_start_date := NOW() - INTERVAL '30 days';
    ELSE v_start_date := '1970-01-01'::TIMESTAMPTZ;
  END CASE;

  RETURN QUERY
  SELECT 
    p.id AS profile_id,
    p.handle,
    p.emoji_avatar,
    COUNT(c.id)::BIGINT AS clips_count,
    COALESCE(SUM(c.listens_count), 0)::BIGINT AS total_listens,
    COALESCE(p.reputation, 0) AS reputation,
    ROW_NUMBER() OVER (ORDER BY COUNT(c.id) DESC, COALESCE(SUM(c.listens_count), 0) DESC) AS rank
  FROM public.profiles p
  LEFT JOIN public.clips c ON c.profile_id = p.id 
    AND c.status = 'live'
    AND (p_period = 'all_time' OR c.created_at >= v_start_date)
  GROUP BY p.id, p.handle, p.emoji_avatar, p.reputation
  ORDER BY clips_count DESC, total_listens DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- Top listeners leaderboard
CREATE OR REPLACE FUNCTION public.get_top_listeners(
  p_period TEXT DEFAULT 'all_time',
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE(
  profile_id UUID,
  handle TEXT,
  emoji_avatar TEXT,
  listens_count BIGINT,
  rank BIGINT
) AS $$
DECLARE
  v_start_date TIMESTAMPTZ;
BEGIN
  CASE p_period
    WHEN 'day' THEN v_start_date := NOW() - INTERVAL '1 day';
    WHEN 'week' THEN v_start_date := NOW() - INTERVAL '7 days';
    WHEN 'month' THEN v_start_date := NOW() - INTERVAL '30 days';
    ELSE v_start_date := '1970-01-01'::TIMESTAMPTZ;
  END CASE;

  RETURN QUERY
  SELECT 
    p.id AS profile_id,
    p.handle,
    p.emoji_avatar,
    COUNT(l.id)::BIGINT AS listens_count,
    ROW_NUMBER() OVER (ORDER BY COUNT(l.id) DESC) AS rank
  FROM public.profiles p
  LEFT JOIN public.listens l ON l.profile_id = p.id
    AND (p_period = 'all_time' OR l.listened_at >= v_start_date)
  GROUP BY p.id, p.handle, p.emoji_avatar
  ORDER BY listens_count DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- Top reactors leaderboard
CREATE OR REPLACE FUNCTION public.get_top_reactors(
  p_period TEXT DEFAULT 'all_time',
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE(
  profile_id UUID,
  handle TEXT,
  emoji_avatar TEXT,
  reactions_count BIGINT,
  rank BIGINT
) AS $$
DECLARE
  v_start_date TIMESTAMPTZ;
BEGIN
  CASE p_period
    WHEN 'day' THEN v_start_date := NOW() - INTERVAL '1 day';
    WHEN 'week' THEN v_start_date := NOW() - INTERVAL '7 days';
    WHEN 'month' THEN v_start_date := NOW() - INTERVAL '30 days';
    ELSE v_start_date := '1970-01-01'::TIMESTAMPTZ;
  END CASE;

  RETURN QUERY
  SELECT 
    p.id AS profile_id,
    p.handle,
    p.emoji_avatar,
    COUNT(cr.id)::BIGINT AS reactions_count,
    ROW_NUMBER() OVER (ORDER BY COUNT(cr.id) DESC) AS rank
  FROM public.profiles p
  LEFT JOIN public.clip_reactions cr ON cr.profile_id = p.id
    AND (p_period = 'all_time' OR cr.created_at >= v_start_date)
  GROUP BY p.id, p.handle, p.emoji_avatar
  ORDER BY reactions_count DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- Top streak holders leaderboard
CREATE OR REPLACE FUNCTION public.get_top_streaks(
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE(
  profile_id UUID,
  handle TEXT,
  emoji_avatar TEXT,
  current_streak_days INTEGER,
  longest_streak_days INTEGER,
  rank BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id AS profile_id,
    p.handle,
    p.emoji_avatar,
    COALESCE(p.current_streak_days, 0) AS current_streak_days,
    COALESCE(p.longest_streak_days, 0) AS longest_streak_days,
    ROW_NUMBER() OVER (ORDER BY COALESCE(p.current_streak_days, 0) DESC, COALESCE(p.longest_streak_days, 0) DESC) AS rank
  FROM public.profiles p
  WHERE p.current_streak_days > 0 OR p.longest_streak_days > 0
  ORDER BY current_streak_days DESC, longest_streak_days DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 13. TRIGGERS
-- ============================================================================

-- Trigger to update streak and check badges when a clip is posted
CREATE OR REPLACE FUNCTION public.on_clip_posted()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'live' AND NEW.profile_id IS NOT NULL THEN
    -- Update streak
    PERFORM public.update_posting_streak(NEW.profile_id);
    
    -- Award community contribution if clip is in a community
    IF NEW.community_id IS NOT NULL THEN
      PERFORM public.award_community_contribution(
        NEW.profile_id,
        NEW.community_id,
        'clip',
        NEW.id,
        5 -- 5 points per clip in community
      );
    END IF;
    
    -- Record challenge participation if clip is for a challenge
    IF NEW.challenge_id IS NOT NULL THEN
      PERFORM public.record_challenge_participation(
        NEW.profile_id,
        NEW.challenge_id,
        NEW.id,
        10 -- 10 points for challenge participation
      );
    END IF;
    
    -- Check for badge unlocks
    PERFORM public.check_all_badges(NEW.profile_id);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_on_clip_posted ON public.clips;
CREATE TRIGGER trigger_on_clip_posted
  AFTER INSERT OR UPDATE ON public.clips
  FOR EACH ROW
  WHEN (NEW.status = 'live')
  EXECUTE FUNCTION public.on_clip_posted();

-- Trigger to check badges when clip stats change
CREATE OR REPLACE FUNCTION public.on_clip_stats_changed()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.profile_id IS NOT NULL AND (
    OLD.listens_count IS DISTINCT FROM NEW.listens_count OR
    OLD.completion_rate IS DISTINCT FROM NEW.completion_rate
  ) THEN
    -- Check milestone and quality badges
    PERFORM public.check_milestone_badges(NEW.profile_id);
    PERFORM public.check_quality_badges(NEW.profile_id);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_on_clip_stats_changed ON public.clips;
CREATE TRIGGER trigger_on_clip_stats_changed
  AFTER UPDATE ON public.clips
  FOR EACH ROW
  EXECUTE FUNCTION public.on_clip_stats_changed();

-- ============================================================================
-- 14. COMMENTS
-- ============================================================================

COMMENT ON TABLE public.badges IS 'Badge definitions for achievements, milestones, quality, streaks, and challenges';
COMMENT ON TABLE public.user_badges IS 'Badges earned by users';
COMMENT ON TABLE public.posting_streaks IS 'Daily posting activity tracking for streak calculation';
COMMENT ON TABLE public.community_contributions IS 'Tracks user contributions to communities for rewards';
COMMENT ON TABLE public.challenge_participations IS 'Tracks user participation in challenges and rewards';
COMMENT ON FUNCTION public.check_all_badges IS 'Master function to check and unlock all badge types for a user';
COMMENT ON FUNCTION public.update_posting_streak IS 'Updates user posting streak when a clip is posted';
COMMENT ON FUNCTION public.get_top_creators IS 'Returns leaderboard of top creators by period';
COMMENT ON FUNCTION public.get_top_listeners IS 'Returns leaderboard of top listeners by period';
COMMENT ON FUNCTION public.get_top_reactors IS 'Returns leaderboard of top reactors by period';
COMMENT ON FUNCTION public.get_top_streaks IS 'Returns leaderboard of top streak holders';

