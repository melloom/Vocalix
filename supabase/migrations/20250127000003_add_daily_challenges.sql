-- Daily Challenges Enhancement
-- Adds auto-generated daily challenges, leaderboards, and rewards

-- Add columns to challenges table for daily challenges
ALTER TABLE public.challenges
ADD COLUMN IF NOT EXISTS is_auto_generated BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS challenge_type TEXT DEFAULT 'manual' CHECK (challenge_type IN ('manual', 'daily', 'weekly', 'monthly')),
ADD COLUMN IF NOT EXISTS leaderboard_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS reward_points INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_participants INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS criteria JSONB DEFAULT NULL;

-- Create challenge_leaderboard view for rankings
CREATE OR REPLACE VIEW public.challenge_leaderboard AS
SELECT 
  cp.challenge_id,
  cp.profile_id,
  p.handle,
  p.emoji_avatar,
  COUNT(DISTINCT cp.clip_id) as clips_count,
  SUM(c.listens_count) as total_listens,
  SUM((c.reactions->>'🔥')::int) + 
  SUM((c.reactions->>'❤️')::int) + 
  SUM((c.reactions->>'😊')::int) as total_reactions,
  MAX(c.created_at) as last_submission_at,
  (COUNT(DISTINCT cp.clip_id) * 10 + 
   SUM(c.listens_count) * 0.1 + 
   (SUM((c.reactions->>'🔥')::int) + SUM((c.reactions->>'❤️')::int) + SUM((c.reactions->>'😊')::int)) * 2) as score
FROM public.challenge_participations cp
JOIN public.clips c ON c.id = cp.clip_id
JOIN public.profiles p ON p.id = cp.profile_id
WHERE c.status = 'live'
GROUP BY cp.challenge_id, cp.profile_id, p.handle, p.emoji_avatar;

-- Function to get challenge leaderboard
CREATE OR REPLACE FUNCTION public.get_challenge_leaderboard(
  p_challenge_id UUID,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  rank INTEGER,
  profile_id UUID,
  handle TEXT,
  emoji_avatar TEXT,
  clips_count BIGINT,
  total_listens BIGINT,
  total_reactions BIGINT,
  score NUMERIC,
  last_submission_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ROW_NUMBER() OVER (ORDER BY cl.score DESC, cl.last_submission_at DESC)::INTEGER as rank,
    cl.profile_id,
    cl.handle,
    cl.emoji_avatar,
    cl.clips_count,
    cl.total_listens,
    cl.total_reactions,
    cl.score,
    cl.last_submission_at
  FROM public.challenge_leaderboard cl
  WHERE cl.challenge_id = p_challenge_id
  ORDER BY cl.score DESC, cl.last_submission_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function to generate daily challenge automatically
CREATE OR REPLACE FUNCTION public.generate_daily_challenge()
RETURNS UUID AS $$
DECLARE
  v_topic_id UUID;
  v_challenge_id UUID;
  v_today DATE := CURRENT_DATE;
  v_challenge_title TEXT;
BEGIN
  -- Get today's topic
  SELECT id INTO v_topic_id
  FROM public.topics
  WHERE date = v_today
    AND is_active = true
  LIMIT 1;

  IF v_topic_id IS NULL THEN
    RAISE EXCEPTION 'No active topic found for today';
  END IF;

  -- Check if daily challenge already exists for today
  SELECT id INTO v_challenge_id
  FROM public.challenges
  WHERE topic_id = v_topic_id
    AND challenge_type = 'daily'
    AND is_auto_generated = true
    AND start_date::DATE = v_today
  LIMIT 1;

  IF v_challenge_id IS NOT NULL THEN
    RETURN v_challenge_id;
  END IF;

  -- Generate challenge title
  SELECT 'Daily Challenge: ' || title INTO v_challenge_title
  FROM public.topics
  WHERE id = v_topic_id;

  -- Create new daily challenge
  INSERT INTO public.challenges (
    topic_id,
    title,
    description,
    challenge_type,
    is_auto_generated,
    is_active,
    leaderboard_enabled,
    reward_points,
    start_date,
    end_date
  ) VALUES (
    v_topic_id,
    v_challenge_title,
    'Join today''s voice challenge! Share your thoughts and compete with others.',
    'daily',
    true,
    true,
    true,
    50,
    NOW(),
    (v_today + INTERVAL '1 day')::TIMESTAMPTZ
  )
  RETURNING id INTO v_challenge_id;

  RETURN v_challenge_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant access to leaderboard view
GRANT SELECT ON public.challenge_leaderboard TO authenticated, anon;

-- Add index for daily challenges
CREATE INDEX IF NOT EXISTS idx_challenges_daily ON public.challenges(challenge_type, start_date) 
WHERE challenge_type = 'daily' AND is_auto_generated = true;

-- Add index for leaderboard queries
CREATE INDEX IF NOT EXISTS idx_challenge_participations_challenge_profile ON public.challenge_participations(challenge_id, profile_id);

COMMENT ON COLUMN public.challenges.is_auto_generated IS 'True if challenge was automatically generated';
COMMENT ON COLUMN public.challenges.challenge_type IS 'Type of challenge: manual, daily, weekly, monthly';
COMMENT ON COLUMN public.challenges.leaderboard_enabled IS 'Whether leaderboard is enabled for this challenge';
COMMENT ON COLUMN public.challenges.reward_points IS 'Points awarded for participating in this challenge';
COMMENT ON COLUMN public.challenges.criteria IS 'JSONB object with challenge criteria and requirements';

