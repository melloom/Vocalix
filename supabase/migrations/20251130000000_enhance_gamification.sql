-- Enhanced Gamification System
-- Adds XP/Level system, more badges, karma multipliers, and game-like features

-- ============================================================================
-- 1. XP & LEVEL SYSTEM
-- ============================================================================

-- Add XP and level columns to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS xp INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS total_karma INTEGER DEFAULT 0;

-- Create index for level queries
CREATE INDEX IF NOT EXISTS idx_profiles_level ON public.profiles(level DESC, xp DESC);

-- Function to calculate XP needed for next level
CREATE OR REPLACE FUNCTION public.xp_for_level(p_level INTEGER)
RETURNS INTEGER AS $$
BEGIN
  -- Exponential growth: level 1 = 100, level 2 = 250, level 3 = 500, etc.
  RETURN 100 * POWER(2, p_level - 1)::INTEGER;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to calculate level from XP
CREATE OR REPLACE FUNCTION public.level_from_xp(p_xp INTEGER)
RETURNS INTEGER AS $$
DECLARE
  v_level INTEGER := 1;
  v_xp_needed INTEGER;
BEGIN
  WHILE TRUE LOOP
    v_xp_needed := public.xp_for_level(v_level + 1);
    IF p_xp < v_xp_needed THEN
      RETURN v_level;
    END IF;
    v_level := v_level + 1;
  END LOOP;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to award XP
CREATE OR REPLACE FUNCTION public.award_xp(
  p_profile_id UUID,
  p_xp_amount INTEGER,
  p_source TEXT DEFAULT 'activity'
)
RETURNS TABLE(new_level INTEGER, leveled_up BOOLEAN) AS $$
DECLARE
  v_current_xp INTEGER;
  v_current_level INTEGER;
  v_new_xp INTEGER;
  v_new_level INTEGER;
  v_leveled_up BOOLEAN := false;
BEGIN
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

  RETURN QUERY SELECT v_new_level, v_leveled_up;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 2. KARMA MULTIPLIERS & BONUSES
-- ============================================================================

-- Add karma multiplier based on level
CREATE OR REPLACE FUNCTION public.calculate_karma_multiplier(p_level INTEGER)
RETURNS NUMERIC AS $$
BEGIN
  -- Level 1-5: 1.0x, Level 6-10: 1.1x, Level 11-20: 1.2x, etc.
  RETURN 1.0 + (FLOOR((p_level - 1) / 5.0) * 0.1);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Enhanced reputation calculation with karma multiplier
CREATE OR REPLACE FUNCTION public.calculate_enhanced_reputation(p_profile_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_base_reputation INTEGER;
  v_level INTEGER;
  v_multiplier NUMERIC;
  v_enhanced_reputation INTEGER;
BEGIN
  -- Get base reputation
  v_base_reputation := public.calculate_user_reputation(p_profile_id);
  
  -- Get user level
  SELECT COALESCE(level, 1) INTO v_level
  FROM public.profiles
  WHERE id = p_profile_id;
  
  -- Calculate multiplier
  v_multiplier := public.calculate_karma_multiplier(v_level);
  
  -- Calculate enhanced reputation (karma)
  v_enhanced_reputation := FLOOR(v_base_reputation * v_multiplier)::INTEGER;
  
  RETURN v_enhanced_reputation;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 3. UPDATE BADGE CATEGORIES (MUST BE BEFORE INSERTING BADGES)
-- ============================================================================

-- Update badge category constraint to include new categories
ALTER TABLE public.badges
DROP CONSTRAINT IF EXISTS badges_category_check;

ALTER TABLE public.badges
ADD CONSTRAINT badges_category_check 
CHECK (category IN ('milestone', 'quality', 'community', 'streak', 'challenge', 'social', 'viral', 'special', 'creative', 'karma', 'level'));

-- ============================================================================
-- 4. ADD MORE FUN BADGES
-- ============================================================================

-- Social Interaction Badges
INSERT INTO public.badges (code, name, description, icon_emoji, category, criteria_type, criteria_value, rarity) VALUES
-- Reactions given
('first_reaction', 'First Reaction', 'Gave your first reaction', '👍', 'social', 'reactions_given', 1, 'common'),
('reaction_enthusiast', 'Reaction Enthusiast', 'Given 50 reactions', '❤️', 'social', 'reactions_given', 50, 'rare'),
('reaction_master', 'Reaction Master', 'Given 500 reactions', '💖', 'social', 'reactions_given', 500, 'epic'),
('reaction_legend', 'Reaction Legend', 'Given 5,000 reactions', '💝', 'social', 'reactions_given', 5000, 'legendary'),

-- Comments/Replies
('first_reply', 'First Reply', 'Replied to your first clip', '💬', 'social', 'replies_given', 1, 'common'),
('conversation_starter', 'Conversation Starter', 'Made 25 replies', '🗣️', 'social', 'replies_given', 25, 'rare'),
('discussion_master', 'Discussion Master', 'Made 200 replies', '💭', 'social', 'replies_given', 200, 'epic'),

-- Followers
('first_follower', 'First Follower', 'Got your first follower', '👥', 'social', 'followers_count', 1, 'common'),
('popular_voice', 'Popular Voice', 'Got 10 followers', '🌟', 'social', 'followers_count', 10, 'rare'),
('voice_influencer', 'Voice Influencer', 'Got 100 followers', '⭐', 'social', 'followers_count', 100, 'epic'),
('voice_celebrity', 'Voice Celebrity', 'Got 1,000 followers', '✨', 'social', 'followers_count', 1000, 'legendary'),

-- Viral Content Badges
('trending_clip', 'Trending!', 'Had a clip reach trending', '🔥', 'viral', 'trending_clips', 1, 'rare'),
('viral_sensation', 'Viral Sensation', 'Had 5 clips reach trending', '🚀', 'viral', 'trending_clips', 5, 'epic'),
('trending_master', 'Trending Master', 'Had 20 clips reach trending', '💥', 'viral', 'trending_clips', 20, 'legendary'),

-- High Engagement
('engagement_king', 'Engagement King', 'Got 100 reactions on a single clip', '👑', 'viral', 'max_reactions', 100, 'epic'),
('viral_moment', 'Viral Moment', 'Got 1,000 listens on a single clip', '📈', 'viral', 'max_listens', 1000, 'epic'),
('breakthrough', 'Breakthrough', 'Got 10,000 listens on a single clip', '🎯', 'viral', 'max_listens', 10000, 'legendary'),

-- Special Achievement Badges
('early_adopter', 'Early Adopter', 'Joined in the first month', '🌱', 'special', 'days_since_join', 30, 'rare'),
('veteran', 'Veteran', 'Been active for 6 months', '🎖️', 'special', 'days_since_join', 180, 'epic'),
('pioneer', 'Pioneer', 'Been active for a year', '🏛️', 'special', 'days_since_join', 365, 'legendary'),

-- Remix Badges
('first_remix', 'First Remix', 'Created your first remix', '🎨', 'creative', 'remixes_created', 1, 'common'),
('remix_artist', 'Remix Artist', 'Created 10 remixes', '🎭', 'creative', 'remixes_created', 10, 'rare'),
('remix_master', 'Remix Master', 'Created 50 remixes', '🎪', 'creative', 'remixes_created', 50, 'epic'),

-- Podcast Badges
('podcast_starter', 'Podcast Starter', 'Created your first podcast', '🎙️', 'creative', 'podcasts_created', 1, 'common'),
('podcast_host', 'Podcast Host', 'Created 10 podcasts', '📻', 'creative', 'podcasts_created', 10, 'rare'),
('podcast_producer', 'Podcast Producer', 'Created 50 podcasts', '🎬', 'creative', 'podcasts_created', 50, 'epic'),

-- Listener Badges
('active_listener', 'Active Listener', 'Listened to 100 clips', '👂', 'social', 'clips_listened', 100, 'common'),
('super_listener', 'Super Listener', 'Listened to 1,000 clips', '🎧', 'social', 'clips_listened', 1000, 'rare'),
('audio_enthusiast', 'Audio Enthusiast', 'Listened to 10,000 clips', '🔊', 'social', 'clips_listened', 10000, 'epic'),

-- Time-based Badges
('night_owl', 'Night Owl', 'Posted 10 clips after midnight', '🦉', 'special', 'night_posts', 10, 'rare'),
('early_bird', 'Early Bird', 'Posted 10 clips before 6am', '🐦', 'special', 'morning_posts', 10, 'rare'),
('weekend_warrior', 'Weekend Warrior', 'Posted 20 clips on weekends', '🎉', 'special', 'weekend_posts', 20, 'rare'),

-- Consistency Badges
('consistent_creator', 'Consistent Creator', 'Posted clips for 14 days straight', '📅', 'streak', 'streak_days', 14, 'rare'),
('dedicated', 'Dedicated', 'Posted clips for 60 days straight', '💪', 'streak', 'streak_days', 60, 'epic'),

-- Community Badges
('community_builder', 'Community Builder', 'Created your first community', '🏗️', 'community', 'communities_created', 1, 'rare'),
('community_leader', 'Community Leader', 'Created 5 communities', '👔', 'community', 'communities_created', 5, 'epic'),
('moderator', 'Moderator', 'Became a community moderator', '🛡️', 'community', 'moderator_roles', 1, 'epic'),

-- Karma/Reputation Badges
('karma_collector', 'Karma Collector', 'Reached 1,000 karma', '⭐', 'karma', 'karma_points', 1000, 'rare'),
('karma_master', 'Karma Master', 'Reached 10,000 karma', '🌟', 'karma', 'karma_points', 10000, 'epic'),
('karma_legend', 'Karma Legend', 'Reached 100,000 karma', '💫', 'karma', 'karma_points', 100000, 'legendary'),

-- Level Badges
('level_up', 'Level Up!', 'Reached level 5', '⬆️', 'level', 'user_level', 5, 'common'),
('rising_star', 'Rising Star', 'Reached level 10', '⭐', 'level', 'user_level', 10, 'rare'),
('elite', 'Elite', 'Reached level 20', '💎', 'level', 'user_level', 20, 'epic'),
('legend', 'Legend', 'Reached level 50', '👑', 'level', 'user_level', 50, 'legendary')
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 5. BADGE CHECKING FUNCTIONS FOR NEW BADGES
-- ============================================================================

-- Function to check social badges
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
    RETURN QUERY SELECT v_badge.id, v_badge.code;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check viral badges
CREATE OR REPLACE FUNCTION public.check_viral_badges(p_profile_id UUID)
RETURNS TABLE(badge_id UUID, badge_code TEXT) AS $$
DECLARE
  v_trending_clips INTEGER;
  v_max_reactions INTEGER;
  v_max_listens INTEGER;
  v_badge RECORD;
BEGIN
  -- Count trending clips (trending_score > 0.5)
  SELECT COUNT(*)::INTEGER INTO v_trending_clips
  FROM public.clips
  WHERE profile_id = p_profile_id 
    AND status = 'live' 
    AND trending_score > 0.5;

  -- Get max reactions on a single clip
  SELECT COALESCE(MAX(
    (SELECT SUM(value::INTEGER) FROM jsonb_each_text(reactions))
  ), 0)::INTEGER INTO v_max_reactions
  FROM public.clips
  WHERE profile_id = p_profile_id AND status = 'live';

  -- Get max listens on a single clip
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
    RETURN QUERY SELECT v_badge.id, v_badge.code;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check special badges
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

  -- Count night posts (after midnight, before 6am)
  SELECT COUNT(*)::INTEGER INTO v_night_posts
  FROM public.clips
  WHERE profile_id = p_profile_id 
    AND status = 'live'
    AND EXTRACT(HOUR FROM created_at) >= 0 
    AND EXTRACT(HOUR FROM created_at) < 6;

  -- Count morning posts (before 6am)
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
    AND EXTRACT(DOW FROM created_at) IN (0, 6); -- Sunday = 0, Saturday = 6

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
    RETURN QUERY SELECT v_badge.id, v_badge.code;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check creative badges
CREATE OR REPLACE FUNCTION public.check_creative_badges(p_profile_id UUID)
RETURNS TABLE(badge_id UUID, badge_code TEXT) AS $$
DECLARE
  v_remixes_created INTEGER;
  v_podcasts_created INTEGER;
  v_badge RECORD;
BEGIN
  -- Count remixes created
  SELECT COUNT(*)::INTEGER INTO v_remixes_created
  FROM public.clips
  WHERE profile_id = p_profile_id 
    AND status = 'live' 
    AND remix_of_clip_id IS NOT NULL;

  -- Count podcasts created
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
    RETURN QUERY SELECT v_badge.id, v_badge.code;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check karma badges
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
    RETURN QUERY SELECT v_badge.id, v_badge.code;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check level badges
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
    RETURN QUERY SELECT v_badge.id, v_badge.code;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update master badge checking function
CREATE OR REPLACE FUNCTION public.check_all_badges(p_profile_id UUID)
RETURNS TABLE(badge_id UUID, badge_code TEXT) AS $$
BEGIN
  RETURN QUERY SELECT * FROM public.check_milestone_badges(p_profile_id);
  RETURN QUERY SELECT * FROM public.check_quality_badges(p_profile_id);
  RETURN QUERY SELECT * FROM public.check_streak_badges(p_profile_id);
  RETURN QUERY SELECT * FROM public.check_community_badges(p_profile_id);
  RETURN QUERY SELECT * FROM public.check_challenge_badges(p_profile_id);
  RETURN QUERY SELECT * FROM public.check_social_badges(p_profile_id);
  RETURN QUERY SELECT * FROM public.check_viral_badges(p_profile_id);
  RETURN QUERY SELECT * FROM public.check_special_badges(p_profile_id);
  RETURN QUERY SELECT * FROM public.check_creative_badges(p_profile_id);
  RETURN QUERY SELECT * FROM public.check_karma_badges(p_profile_id);
  RETURN QUERY SELECT * FROM public.check_level_badges(p_profile_id);
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 6. XP REWARDS FOR ACTIONS
-- ============================================================================

-- Enhanced trigger to award XP when clips are posted
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
    
    -- Check for badge unlocks
    PERFORM public.check_all_badges(NEW.profile_id);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Replace old trigger
DROP TRIGGER IF EXISTS trigger_on_clip_posted ON public.clips;
CREATE TRIGGER trigger_on_clip_posted
  AFTER INSERT OR UPDATE ON public.clips
  FOR EACH ROW
  WHEN (NEW.status = 'live')
  EXECUTE FUNCTION public.on_clip_posted_enhanced();

-- Award XP for reactions
CREATE OR REPLACE FUNCTION public.award_xp_for_reaction()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Award 2 XP for reacting
    PERFORM public.award_xp(NEW.profile_id, 2, 'reaction_given');
    
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

DROP TRIGGER IF EXISTS trigger_award_xp_for_reaction ON public.clip_reactions;
CREATE TRIGGER trigger_award_xp_for_reaction
  AFTER INSERT ON public.clip_reactions
  FOR EACH ROW
  EXECUTE FUNCTION public.award_xp_for_reaction();

-- Award XP for listening
CREATE OR REPLACE FUNCTION public.award_xp_for_listen()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Award 1 XP for listening
    PERFORM public.award_xp(NEW.profile_id, 1, 'listened');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_award_xp_for_listen ON public.listens;
CREATE TRIGGER trigger_award_xp_for_listen
  AFTER INSERT ON public.listens
  FOR EACH ROW
  EXECUTE FUNCTION public.award_xp_for_listen();

-- ============================================================================
-- 7. COMMENTS
-- ============================================================================

COMMENT ON COLUMN public.profiles.xp IS 'Experience points earned through activities';
COMMENT ON COLUMN public.profiles.level IS 'User level calculated from XP';
COMMENT ON COLUMN public.profiles.total_karma IS 'Total karma/reputation with multipliers applied';
COMMENT ON FUNCTION public.award_xp IS 'Awards XP to a user and returns new level and whether they leveled up';
COMMENT ON FUNCTION public.calculate_karma_multiplier IS 'Calculates karma multiplier based on user level';
COMMENT ON FUNCTION public.calculate_enhanced_reputation IS 'Calculates reputation with karma multiplier applied';

