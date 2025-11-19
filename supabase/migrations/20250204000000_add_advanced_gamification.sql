-- Advanced Gamification System
-- Implements: Points & Rewards System, Referral Bonuses, Weekly/Monthly Challenges,
-- Community Challenges, Creator Challenges, Prize System, Special Event Badges, Points Redemption

-- ============================================================================
-- 1. POINTS & REWARDS SYSTEM (Separate from XP)
-- ============================================================================

-- Add redeemable points to profiles (separate from XP)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS redeemable_points INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_points_earned INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_points_redeemed INTEGER DEFAULT 0;

-- Points transaction log
CREATE TABLE IF NOT EXISTS public.points_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  points INTEGER NOT NULL, -- Positive for earned, negative for redeemed
  transaction_type TEXT NOT NULL CHECK (transaction_type IN (
    'earned', 'redeemed', 'bonus', 'referral', 'challenge', 'contest', 'admin_adjustment'
  )),
  source_type TEXT, -- 'clip_posted', 'reaction', 'listen', 'share', 'challenge', 'referral', etc.
  source_id UUID, -- Reference to the clip/challenge/etc that triggered this
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_points_transactions_profile_id ON public.points_transactions(profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_points_transactions_type ON public.points_transactions(transaction_type, created_at DESC);

-- Points redemption catalog
CREATE TABLE IF NOT EXISTS public.points_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL, -- e.g., 'premium_editing', 'featured_placement'
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  points_cost INTEGER NOT NULL,
  reward_type TEXT NOT NULL CHECK (reward_type IN (
    'feature_unlock', 'premium_editing', 'featured_placement', 'badge', 'custom'
  )),
  reward_data JSONB DEFAULT '{}'::jsonb, -- Flexible reward configuration
  is_active BOOLEAN DEFAULT true,
  max_redemptions_per_user INTEGER DEFAULT NULL, -- NULL = unlimited
  max_total_redemptions INTEGER DEFAULT NULL, -- NULL = unlimited
  total_redemptions INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT NULL
);

-- Points redemptions
CREATE TABLE IF NOT EXISTS public.points_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  reward_id UUID REFERENCES public.points_rewards(id) ON DELETE CASCADE,
  points_spent INTEGER NOT NULL,
  redemption_data JSONB DEFAULT '{}'::jsonb, -- Store any additional data
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_points_redemptions_profile_id ON public.points_redemptions(profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_points_redemptions_reward_id ON public.points_redemptions(reward_id);

-- Function to award points
CREATE OR REPLACE FUNCTION public.award_points(
  p_profile_id UUID,
  p_points INTEGER,
  p_transaction_type TEXT DEFAULT 'earned',
  p_source_type TEXT DEFAULT NULL,
  p_source_id UUID DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  v_new_balance INTEGER;
BEGIN
  -- Update profile points
  UPDATE public.profiles
  SET 
    redeemable_points = redeemable_points + p_points,
    total_points_earned = total_points_earned + CASE WHEN p_points > 0 THEN p_points ELSE 0 END,
    total_points_redeemed = total_points_redeemed + CASE WHEN p_points < 0 THEN ABS(p_points) ELSE 0 END
  WHERE id = p_profile_id
  RETURNING redeemable_points INTO v_new_balance;

  -- Log transaction
  INSERT INTO public.points_transactions (
    profile_id,
    points,
    transaction_type,
    source_type,
    source_id,
    description
  ) VALUES (
    p_profile_id,
    p_points,
    p_transaction_type,
    p_source_type,
    p_source_id,
    p_description
  );

  RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to redeem points
CREATE OR REPLACE FUNCTION public.redeem_points(
  p_profile_id UUID,
  p_reward_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_reward RECORD;
  v_current_points INTEGER;
  v_redemptions_count INTEGER;
  v_result JSONB;
BEGIN
  -- Get reward details
  SELECT * INTO v_reward
  FROM public.points_rewards
  WHERE id = p_reward_id AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reward not found or inactive');
  END IF;

  -- Check if reward has expired
  IF v_reward.expires_at IS NOT NULL AND v_reward.expires_at < NOW() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reward has expired');
  END IF;

  -- Get current points
  SELECT redeemable_points INTO v_current_points
  FROM public.profiles
  WHERE id = p_profile_id;

  -- Check if user has enough points
  IF v_current_points < v_reward.points_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient points');
  END IF;

  -- Check max redemptions per user
  IF v_reward.max_redemptions_per_user IS NOT NULL THEN
    SELECT COUNT(*) INTO v_redemptions_count
    FROM public.points_redemptions
    WHERE profile_id = p_profile_id AND reward_id = p_reward_id;

    IF v_redemptions_count >= v_reward.max_redemptions_per_user THEN
      RETURN jsonb_build_object('success', false, 'error', 'Maximum redemptions reached for this reward');
    END IF;
  END IF;

  -- Check max total redemptions
  IF v_reward.max_total_redemptions IS NOT NULL THEN
    IF v_reward.total_redemptions >= v_reward.max_total_redemptions THEN
      RETURN jsonb_build_object('success', false, 'error', 'Reward is no longer available');
    END IF;
  END IF;

  -- Deduct points
  PERFORM public.award_points(
    p_profile_id,
    -v_reward.points_cost,
    'redeemed',
    'points_reward',
    p_reward_id,
    'Redeemed: ' || v_reward.name
  );

  -- Record redemption
  INSERT INTO public.points_redemptions (
    profile_id,
    reward_id,
    points_spent,
    redemption_data
  ) VALUES (
    p_profile_id,
    p_reward_id,
    v_reward.points_cost,
    v_reward.reward_data
  );

  -- Update reward redemption count
  UPDATE public.points_rewards
  SET total_redemptions = total_redemptions + 1
  WHERE id = p_reward_id;

  RETURN jsonb_build_object(
    'success', true,
    'points_remaining', (SELECT redeemable_points FROM public.profiles WHERE id = p_profile_id),
    'reward', jsonb_build_object(
      'id', v_reward.id,
      'name', v_reward.name,
      'type', v_reward.reward_type,
      'data', v_reward.reward_data
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 2. REFERRAL SYSTEM
-- ============================================================================

-- Referrals table
CREATE TABLE IF NOT EXISTS public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  referred_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  referral_code TEXT NOT NULL, -- Unique code used for referral
  points_awarded INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'rewarded')),
  referred_joined_at TIMESTAMPTZ,
  referrer_rewarded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(referred_id) -- A user can only be referred once
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id ON public.referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referral_code ON public.referrals(referral_code);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON public.referrals(status);

-- Add referral code to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS referred_by_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS total_referrals INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS referral_points_earned INTEGER DEFAULT 0;

-- Generate unique referral codes for existing users
CREATE OR REPLACE FUNCTION public.generate_referral_code(p_profile_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_handle TEXT;
  v_code TEXT;
  v_exists BOOLEAN;
BEGIN
  -- Get user handle
  SELECT handle INTO v_handle
  FROM public.profiles
  WHERE id = p_profile_id;

  -- Generate code from handle (uppercase, remove special chars, max 8 chars)
  v_code := UPPER(REGEXP_REPLACE(v_handle, '[^a-zA-Z0-9]', '', 'g'));
  v_code := SUBSTRING(v_code, 1, 8);

  -- If too short, append random chars
  IF LENGTH(v_code) < 6 THEN
    v_code := v_code || SUBSTRING(MD5(RANDOM()::TEXT), 1, 8 - LENGTH(v_code));
  END IF;

  -- Check if code exists
  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE referral_code = v_code AND id != p_profile_id)
  INTO v_exists;

  -- If exists, append random suffix
  IF v_exists THEN
    v_code := v_code || SUBSTRING(MD5(RANDOM()::TEXT), 1, 4);
  END IF;

  RETURN v_code;
END;
$$ LANGUAGE plpgsql;

-- Function to process referral
CREATE OR REPLACE FUNCTION public.process_referral(
  p_referral_code TEXT,
  p_referred_profile_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_referrer_id UUID;
  v_referrer_points INTEGER := 100; -- Points for referrer
  v_referred_points INTEGER := 50; -- Points for new user
  v_result JSONB;
BEGIN
  -- Find referrer by code
  SELECT id INTO v_referrer_id
  FROM public.profiles
  WHERE referral_code = p_referral_code;

  IF v_referrer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid referral code');
  END IF;

  IF v_referrer_id = p_referred_profile_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot refer yourself');
  END IF;

  -- Check if user was already referred
  IF EXISTS(SELECT 1 FROM public.referrals WHERE referred_id = p_referred_profile_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'User already referred');
  END IF;

  -- Create referral record
  INSERT INTO public.referrals (
    referrer_id,
    referred_id,
    referral_code,
    status,
    referred_joined_at
  ) VALUES (
    v_referrer_id,
    p_referred_profile_id,
    p_referral_code,
    'pending',
    NOW()
  );

  -- Update referred user
  UPDATE public.profiles
  SET referred_by_id = v_referrer_id
  WHERE id = p_referred_profile_id;

  -- Award points to new user
  PERFORM public.award_points(
    p_referred_profile_id,
    v_referred_points,
    'referral',
    'signup_bonus',
    NULL,
    'Welcome bonus for joining via referral'
  );

  -- Award points to referrer when referred user completes onboarding
  -- (We'll mark as completed when user posts first clip or reaches certain milestone)
  PERFORM public.award_points(
    v_referrer_id,
    v_referrer_points,
    'referral',
    'referral_bonus',
    p_referred_profile_id,
    'Referral bonus for inviting friend'
  );

  -- Update referrer stats
  UPDATE public.profiles
  SET 
    total_referrals = total_referrals + 1,
    referral_points_earned = referral_points_earned + v_referrer_points
  WHERE id = v_referrer_id;

  -- Mark referral as completed
  UPDATE public.referrals
  SET status = 'completed', points_awarded = v_referrer_points
  WHERE referred_id = p_referred_profile_id;

  RETURN jsonb_build_object(
    'success', true,
    'referrer_id', v_referrer_id,
    'points_awarded', v_referred_points
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to generate referral code for new users
CREATE OR REPLACE FUNCTION public.generate_referral_code_on_create()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := public.generate_referral_code(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_generate_referral_code ON public.profiles;
CREATE TRIGGER trigger_generate_referral_code
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  WHEN (NEW.referral_code IS NULL)
  EXECUTE FUNCTION public.generate_referral_code_on_create();

-- ============================================================================
-- 3. WEEKLY & MONTHLY CHALLENGES
-- ============================================================================

-- Update challenge_type constraint to include weekly and monthly
ALTER TABLE public.challenges
DROP CONSTRAINT IF EXISTS challenges_challenge_type_check;

ALTER TABLE public.challenges
ADD CONSTRAINT challenges_challenge_type_check 
CHECK (challenge_type IN ('manual', 'daily', 'weekly', 'monthly'));

-- Add prize information to challenges
ALTER TABLE public.challenges
ADD COLUMN IF NOT EXISTS prize_description TEXT,
ADD COLUMN IF NOT EXISTS prize_points INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS prize_badge_id UUID REFERENCES public.badges(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS prize_data JSONB DEFAULT '{}'::jsonb; -- For custom prizes

-- Function to generate weekly challenges
CREATE OR REPLACE FUNCTION public.generate_weekly_challenges()
RETURNS TABLE(challenge_id UUID, challenge_type TEXT) AS $$
DECLARE
  v_week_start DATE;
  v_week_end DATE;
  v_challenge_id UUID;
  v_week_number INTEGER;
BEGIN
  -- Calculate week start (Monday)
  v_week_start := DATE_TRUNC('week', CURRENT_DATE)::DATE;
  v_week_end := v_week_start + INTERVAL '6 days';
  v_week_number := EXTRACT(WEEK FROM CURRENT_DATE);

  -- Check if weekly challenge already exists
  SELECT id INTO v_challenge_id
  FROM public.challenges
  WHERE challenge_type = 'weekly'
    AND start_date::DATE = v_week_start
  LIMIT 1;

  IF v_challenge_id IS NULL THEN
    INSERT INTO public.challenges (
      title,
      description,
      challenge_type,
      challenge_template,
      is_auto_generated,
      is_active,
      leaderboard_enabled,
      reward_points,
      prize_points,
      prize_description,
      start_date,
      end_date,
      criteria
    ) VALUES (
      'Weekly Challenge - Week ' || v_week_number,
      'Weekly themed challenge! Post clips related to this week''s theme and compete for prizes.',
      'weekly',
      'topic_based',
      true,
      true,
      true,
      100, -- Base participation points
      500, -- Prize points for winners
      'Top 3 winners receive bonus points and special badges',
      v_week_start::TIMESTAMPTZ,
      v_week_end::TIMESTAMPTZ + INTERVAL '1 day' - INTERVAL '1 second',
      jsonb_build_object(
        'type', 'weekly',
        'week_number', v_week_number,
        'min_clips', 3,
        'bonus_for_quality', true
      )
    )
    RETURNING id INTO v_challenge_id;

    RETURN QUERY SELECT v_challenge_id, 'weekly'::TEXT;
  END IF;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to generate monthly challenges
CREATE OR REPLACE FUNCTION public.generate_monthly_challenges()
RETURNS TABLE(challenge_id UUID, challenge_type TEXT) AS $$
DECLARE
  v_month_start DATE;
  v_month_end DATE;
  v_challenge_id UUID;
  v_month_name TEXT;
BEGIN
  -- Calculate month start and end
  v_month_start := DATE_TRUNC('month', CURRENT_DATE)::DATE;
  v_month_end := (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
  v_month_name := TO_CHAR(CURRENT_DATE, 'Month YYYY');

  -- Check if monthly challenge already exists
  SELECT id INTO v_challenge_id
  FROM public.challenges
  WHERE challenge_type = 'monthly'
    AND start_date::DATE = v_month_start
  LIMIT 1;

  IF v_challenge_id IS NULL THEN
    INSERT INTO public.challenges (
      title,
      description,
      challenge_type,
      challenge_template,
      is_auto_generated,
      is_active,
      leaderboard_enabled,
      reward_points,
      prize_points,
      prize_description,
      start_date,
      end_date,
      criteria
    ) VALUES (
      'Monthly Contest - ' || v_month_name,
      'Big monthly contest! Create your best content and compete for major prizes.',
      'monthly',
      'topic_based',
      true,
      true,
      true,
      200, -- Base participation points
      2000, -- Prize points for winners
      'Top 5 winners receive major point bonuses, special badges, and featured placement',
      v_month_start::TIMESTAMPTZ,
      v_month_end::TIMESTAMPTZ + INTERVAL '1 day' - INTERVAL '1 second',
      jsonb_build_object(
        'type', 'monthly',
        'month', EXTRACT(MONTH FROM CURRENT_DATE),
        'year', EXTRACT(YEAR FROM CURRENT_DATE),
        'min_clips', 5,
        'bonus_for_engagement', true,
        'prize_tiers', jsonb_build_array(
          jsonb_build_object('rank', 1, 'points', 2000, 'badge', 'monthly_champion'),
          jsonb_build_object('rank', 2, 'points', 1500, 'badge', 'monthly_runner_up'),
          jsonb_build_object('rank', 3, 'points', 1000, 'badge', 'monthly_third'),
          jsonb_build_object('rank', 4, 'points', 500, 'badge', 'monthly_top_five'),
          jsonb_build_object('rank', 5, 'points', 500, 'badge', 'monthly_top_five')
        )
      )
    )
    RETURNING id INTO v_challenge_id;

    RETURN QUERY SELECT v_challenge_id, 'monthly'::TEXT;
  END IF;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 4. COMMUNITY CHALLENGES
-- ============================================================================

-- Add community_id to challenges
ALTER TABLE public.challenges
ADD COLUMN IF NOT EXISTS community_id UUID REFERENCES public.communities(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_challenges_community_id ON public.challenges(community_id);

-- Function to create community challenge
CREATE OR REPLACE FUNCTION public.create_community_challenge(
  p_community_id UUID,
  p_title TEXT,
  p_description TEXT,
  p_created_by_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NOW(),
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_reward_points INTEGER DEFAULT 50,
  p_criteria JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
  v_challenge_id UUID;
BEGIN
  -- Verify user is member of community
  IF NOT EXISTS(
    SELECT 1 FROM public.community_members
    WHERE community_id = p_community_id AND profile_id = p_created_by_id
  ) THEN
    RAISE EXCEPTION 'User is not a member of this community';
  END IF;

  INSERT INTO public.challenges (
    community_id,
    title,
    description,
    challenge_type,
    challenge_template,
    is_auto_generated,
    is_active,
    leaderboard_enabled,
    reward_points,
    start_date,
    end_date,
    criteria
  ) VALUES (
    p_community_id,
    p_title,
    p_description,
    'manual',
    'community_engagement',
    false,
    true,
    true,
    p_reward_points,
    p_start_date,
    p_end_date,
    p_criteria
  )
  RETURNING id INTO v_challenge_id;

  RETURN v_challenge_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 5. CREATOR CHALLENGES
-- ============================================================================

-- Add creator_id to challenges
ALTER TABLE public.challenges
ADD COLUMN IF NOT EXISTS creator_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_challenges_creator_id ON public.challenges(creator_id);

-- Function to create creator challenge
CREATE OR REPLACE FUNCTION public.create_creator_challenge(
  p_creator_id UUID,
  p_title TEXT,
  p_description TEXT,
  p_start_date TIMESTAMPTZ DEFAULT NOW(),
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_reward_points INTEGER DEFAULT 100,
  p_criteria JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
  v_challenge_id UUID;
BEGIN
  INSERT INTO public.challenges (
    creator_id,
    title,
    description,
    challenge_type,
    challenge_template,
    is_auto_generated,
    is_active,
    leaderboard_enabled,
    reward_points,
    start_date,
    end_date,
    criteria
  ) VALUES (
    p_creator_id,
    p_title,
    p_description,
    'manual',
    'topic_based',
    false,
    true,
    true,
    p_reward_points,
    p_start_date,
    p_end_date,
    p_criteria
  )
  RETURNING id INTO v_challenge_id;

  RETURN v_challenge_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 6. PRIZE SYSTEM
-- ============================================================================

-- Contest winners table
CREATE TABLE IF NOT EXISTS public.contest_winners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID REFERENCES public.challenges(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL,
  points_awarded INTEGER DEFAULT 0,
  badge_awarded_id UUID REFERENCES public.badges(id) ON DELETE SET NULL,
  prize_data JSONB DEFAULT '{}'::jsonb,
  awarded_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(challenge_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_contest_winners_challenge_id ON public.contest_winners(challenge_id, rank);
CREATE INDEX IF NOT EXISTS idx_contest_winners_profile_id ON public.contest_winners(profile_id);

-- Function to award contest prizes
CREATE OR REPLACE FUNCTION public.award_contest_prizes(
  p_challenge_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_challenge RECORD;
  v_leaderboard RECORD;
  v_rank INTEGER := 0;
  v_prize_tiers JSONB;
  v_points INTEGER;
  v_badge_code TEXT;
  v_result JSONB := '[]'::jsonb;
BEGIN
  -- Get challenge details
  SELECT * INTO v_challenge
  FROM public.challenges
  WHERE id = p_challenge_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Challenge not found');
  END IF;

  -- Get prize tiers from criteria
  v_prize_tiers := v_challenge.criteria->'prize_tiers';

  -- Get leaderboard (top participants)
  FOR v_leaderboard IN
    SELECT 
      profile_id,
      handle,
      score,
      clips_count,
      total_listens,
      total_reactions
    FROM public.get_challenge_leaderboard(p_challenge_id, 10)
    ORDER BY score DESC
    LIMIT 10
  LOOP
    v_rank := v_rank + 1;

    -- Find prize tier for this rank
    IF v_prize_tiers IS NOT NULL THEN
      SELECT 
        (tier->>'points')::INTEGER,
        tier->>'badge'
      INTO v_points, v_badge_code
      FROM jsonb_array_elements(v_prize_tiers) AS tier
      WHERE (tier->>'rank')::INTEGER = v_rank
      LIMIT 1;
    END IF;

    -- Default prizes if not in tiers
    IF v_points IS NULL THEN
      CASE v_rank
        WHEN 1 THEN v_points := COALESCE(v_challenge.prize_points, 1000);
        WHEN 2 THEN v_points := COALESCE(v_challenge.prize_points, 1000) * 0.75;
        WHEN 3 THEN v_points := COALESCE(v_challenge.prize_points, 1000) * 0.5;
        ELSE v_points := 100;
      END CASE;
    END IF;

    -- Award points
    IF v_points > 0 THEN
      PERFORM public.award_points(
        v_leaderboard.profile_id,
        v_points::INTEGER,
        'contest',
        'challenge_prize',
        p_challenge_id,
        'Prize for rank ' || v_rank || ' in challenge'
      );
    END IF;

    -- Award badge if specified
    IF v_badge_code IS NOT NULL THEN
      DECLARE
        v_badge_id UUID;
      BEGIN
        SELECT id INTO v_badge_id
        FROM public.badges
        WHERE code = v_badge_code;

        IF v_badge_id IS NOT NULL THEN
          INSERT INTO public.user_badges (profile_id, badge_id)
          VALUES (v_leaderboard.profile_id, v_badge_id)
          ON CONFLICT (profile_id, badge_id) DO NOTHING;
        END IF;
      END;
    END IF;

    -- Record winner
    INSERT INTO public.contest_winners (
      challenge_id,
      profile_id,
      rank,
      points_awarded,
      prize_data
    ) VALUES (
      p_challenge_id,
      v_leaderboard.profile_id,
      v_rank,
      v_points::INTEGER,
      jsonb_build_object(
        'score', v_leaderboard.score,
        'clips_count', v_leaderboard.clips_count,
        'total_listens', v_leaderboard.total_listens,
        'total_reactions', v_leaderboard.total_reactions
      )
    )
    ON CONFLICT (challenge_id, profile_id) DO UPDATE
    SET rank = v_rank, points_awarded = v_points::INTEGER;

    -- Add to result
    v_result := v_result || jsonb_build_object(
      'rank', v_rank,
      'profile_id', v_leaderboard.profile_id,
      'handle', v_leaderboard.handle,
      'points_awarded', v_points::INTEGER
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'winners', v_result);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 7. SPECIAL EVENT BADGES
-- ============================================================================

-- Update badge category to include 'event'
ALTER TABLE public.badges
DROP CONSTRAINT IF EXISTS badges_category_check;

ALTER TABLE public.badges
ADD CONSTRAINT badges_category_check 
CHECK (category IN (
  'milestone', 'quality', 'community', 'streak', 'challenge', 
  'social', 'viral', 'special', 'creative', 'karma', 'level', 'event'
));

-- Add event badge fields
ALTER TABLE public.badges
ADD COLUMN IF NOT EXISTS event_start_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS event_end_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS is_limited_time BOOLEAN DEFAULT false;

-- Function to create event badge
CREATE OR REPLACE FUNCTION public.create_event_badge(
  p_code TEXT,
  p_name TEXT,
  p_description TEXT,
  p_icon_emoji TEXT,
  p_event_start_date TIMESTAMPTZ,
  p_event_end_date TIMESTAMPTZ,
  p_criteria_type TEXT,
  p_criteria_value NUMERIC,
  p_rarity TEXT DEFAULT 'rare'
)
RETURNS UUID AS $$
DECLARE
  v_badge_id UUID;
BEGIN
  INSERT INTO public.badges (
    code,
    name,
    description,
    icon_emoji,
    category,
    criteria_type,
    criteria_value,
    rarity,
    is_limited_time,
    event_start_date,
    event_end_date
  ) VALUES (
    p_code,
    p_name,
    p_description,
    p_icon_emoji,
    'event',
    p_criteria_type,
    p_criteria_value,
    p_rarity,
    true,
    p_event_start_date,
    p_event_end_date
  )
  ON CONFLICT (code) DO UPDATE
  SET 
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    event_start_date = EXCLUDED.event_start_date,
    event_end_date = EXCLUDED.event_end_date
  RETURNING id INTO v_badge_id;

  RETURN v_badge_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 8. POINTS EARNING TRIGGERS
-- ============================================================================

-- Award points for engagement actions
CREATE OR REPLACE FUNCTION public.award_points_for_engagement()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Award points for reactions (2 points per reaction)
    IF TG_TABLE_NAME = 'clip_reactions' THEN
      PERFORM public.award_points(
        NEW.profile_id,
        2,
        'earned',
        'reaction',
        NEW.clip_id,
        'Reaction on clip'
      );
    END IF;

    -- Award points for listens (1 point per listen, max 10 per clip)
    IF TG_TABLE_NAME = 'listens' THEN
      DECLARE
        v_listen_count INTEGER;
      BEGIN
        SELECT COUNT(*) INTO v_listen_count
        FROM public.listens
        WHERE profile_id = NEW.profile_id AND clip_id = NEW.clip_id;

        IF v_listen_count <= 10 THEN
          PERFORM public.award_points(
            NEW.profile_id,
            1,
            'earned',
            'listen',
            NEW.clip_id,
            'Listened to clip'
          );
        END IF;
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for reactions
DROP TRIGGER IF EXISTS trigger_award_points_for_reaction ON public.clip_reactions;
CREATE TRIGGER trigger_award_points_for_reaction
  AFTER INSERT ON public.clip_reactions
  FOR EACH ROW
  EXECUTE FUNCTION public.award_points_for_engagement();

-- Trigger for listens
DROP TRIGGER IF EXISTS trigger_award_points_for_listen ON public.listens;
CREATE TRIGGER trigger_award_points_for_listen
  AFTER INSERT ON public.listens
  FOR EACH ROW
  EXECUTE FUNCTION public.award_points_for_engagement();

-- Award points when clips are posted
CREATE OR REPLACE FUNCTION public.award_points_for_clip()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'live' AND OLD.status != 'live' THEN
    -- Base points for posting (10 points)
    PERFORM public.award_points(
      NEW.profile_id,
      10,
      'earned',
      'clip_posted',
      NEW.id,
      'Posted clip'
    );

    -- Bonus points for community clips (5 extra)
    IF NEW.community_id IS NOT NULL THEN
      PERFORM public.award_points(
        NEW.profile_id,
        5,
        'earned',
        'community_clip',
        NEW.id,
        'Posted clip in community'
      );
    END IF;

    -- Bonus points for challenge participation (10 extra)
    IF NEW.challenge_id IS NOT NULL THEN
      PERFORM public.award_points(
        NEW.profile_id,
        10,
        'earned',
        'challenge_participation',
        NEW.id,
        'Participated in challenge'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_award_points_for_clip ON public.clips;
CREATE TRIGGER trigger_award_points_for_clip
  AFTER INSERT OR UPDATE ON public.clips
  FOR EACH ROW
  EXECUTE FUNCTION public.award_points_for_clip();

-- ============================================================================
-- 9. LEADERBOARDS FOR POINTS
-- ============================================================================

-- Function to get top point earners
CREATE OR REPLACE FUNCTION public.get_top_point_earners(
  p_period TEXT DEFAULT 'all_time', -- 'day', 'week', 'month', 'all_time'
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE(
  profile_id UUID,
  handle TEXT,
  emoji_avatar TEXT,
  redeemable_points INTEGER,
  total_points_earned INTEGER,
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
    COALESCE(p.redeemable_points, 0) AS redeemable_points,
    COALESCE(p.total_points_earned, 0) AS total_points_earned,
    ROW_NUMBER() OVER (ORDER BY 
      CASE 
        WHEN p_period = 'all_time' THEN COALESCE(p.total_points_earned, 0)
        ELSE (
          SELECT COALESCE(SUM(points), 0)
          FROM public.points_transactions
          WHERE profile_id = p.id 
            AND transaction_type = 'earned'
            AND created_at >= v_start_date
        )
      END DESC
    ) AS rank
  FROM public.profiles p
  WHERE 
    CASE 
      WHEN p_period = 'all_time' THEN COALESCE(p.total_points_earned, 0) > 0
      ELSE EXISTS(
        SELECT 1 FROM public.points_transactions
        WHERE profile_id = p.id 
          AND transaction_type = 'earned'
          AND created_at >= v_start_date
      )
    END
  ORDER BY 
    CASE 
      WHEN p_period = 'all_time' THEN COALESCE(p.total_points_earned, 0)
      ELSE (
        SELECT COALESCE(SUM(points), 0)
        FROM public.points_transactions
        WHERE profile_id = p.id 
          AND transaction_type = 'earned'
          AND created_at >= v_start_date
      )
    END DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 10. SEED DEFAULT REWARDS
-- ============================================================================

-- Insert default point rewards
INSERT INTO public.points_rewards (code, name, description, points_cost, reward_type, reward_data, is_active) VALUES
('premium_editing', 'Premium Editing', 'Unlock premium audio editing features for 7 days', 500, 'feature_unlock', '{"feature": "premium_editing", "duration_days": 7}'::jsonb, true),
('featured_placement', 'Featured Placement', 'Get your clip featured on the homepage for 24 hours', 1000, 'featured_placement', '{"duration_hours": 24}'::jsonb, true),
('badge_showcase', 'Badge Showcase', 'Showcase your badges prominently on your profile for 30 days', 300, 'feature_unlock', '{"feature": "badge_showcase", "duration_days": 30}'::jsonb, true),
('custom_avatar', 'Custom Avatar', 'Unlock custom emoji avatar selection', 200, 'feature_unlock', '{"feature": "custom_avatar"}'::jsonb, true)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 11. ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.points_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.points_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.points_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contest_winners ENABLE ROW LEVEL SECURITY;

-- Points transactions: Users can view their own
CREATE POLICY "Users can view their own points transactions"
ON public.points_transactions FOR SELECT
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Points rewards: Viewable by everyone
CREATE POLICY "Points rewards are viewable by everyone"
ON public.points_rewards FOR SELECT
USING (true);

-- Points redemptions: Users can view their own
CREATE POLICY "Users can view their own redemptions"
ON public.points_redemptions FOR SELECT
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Referrals: Users can view their own referrals
CREATE POLICY "Users can view their own referrals"
ON public.referrals FOR SELECT
USING (
  referrer_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
  OR referred_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- Contest winners: Viewable by everyone
CREATE POLICY "Contest winners are viewable by everyone"
ON public.contest_winners FOR SELECT
USING (true);

-- ============================================================================
-- 12. COMMENTS
-- ============================================================================

COMMENT ON TABLE public.points_transactions IS 'Log of all points transactions (earned and redeemed)';
COMMENT ON TABLE public.points_rewards IS 'Catalog of rewards that can be redeemed with points';
COMMENT ON TABLE public.points_redemptions IS 'Record of points redemptions by users';
COMMENT ON TABLE public.referrals IS 'Referral tracking for user invitations';
COMMENT ON TABLE public.contest_winners IS 'Winners of challenges and contests';
COMMENT ON FUNCTION public.award_points IS 'Awards redeemable points to a user';
COMMENT ON FUNCTION public.redeem_points IS 'Redeems points for a reward';
COMMENT ON FUNCTION public.process_referral IS 'Processes a referral when a new user signs up';
COMMENT ON FUNCTION public.generate_weekly_challenges IS 'Generates weekly challenges';
COMMENT ON FUNCTION public.generate_monthly_challenges IS 'Generates monthly challenges';
COMMENT ON FUNCTION public.create_community_challenge IS 'Creates a challenge specific to a community';
COMMENT ON FUNCTION public.create_creator_challenge IS 'Creates a challenge hosted by a creator';
COMMENT ON FUNCTION public.award_contest_prizes IS 'Awards prizes to contest winners based on leaderboard';

