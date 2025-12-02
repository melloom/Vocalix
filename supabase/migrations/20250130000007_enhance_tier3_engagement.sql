-- Tier 3 Engagement Boosters
-- 1. Enhanced Daily Challenges with more types
-- 2. Live Reactions during Playback (reaction timestamps)
-- 3. Voice AMAs (AMA scheduling in live rooms)

-- ============================================================================
-- 1. ENHANCE DAILY CHALLENGES
-- ============================================================================

-- Add more challenge criteria types
ALTER TABLE public.challenges
ADD COLUMN IF NOT EXISTS challenge_template TEXT DEFAULT 'topic_based' 
  CHECK (challenge_template IN ('topic_based', 'record_memory', 'react_to_clips', 'daily_streak', 'community_engagement'));

-- Add challenge progress tracking
CREATE TABLE IF NOT EXISTS public.challenge_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID REFERENCES public.challenges(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  progress_data JSONB DEFAULT '{}'::jsonb, -- Flexible progress tracking
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(challenge_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_challenge_progress_challenge_profile ON public.challenge_progress(challenge_id, profile_id);

-- Function to generate daily challenges with different types
CREATE OR REPLACE FUNCTION public.generate_daily_challenges()
RETURNS TABLE(challenge_id UUID, challenge_type TEXT) AS $$
DECLARE
  v_topic_id UUID;
  v_challenge_id UUID;
  v_today DATE := CURRENT_DATE;
  v_challenge_title TEXT;
  v_memory_challenge_id UUID;
  v_react_challenge_id UUID;
  v_streak_challenge_id UUID;
BEGIN
  -- 1. Topic-based daily challenge (existing)
  SELECT id INTO v_topic_id
  FROM public.topics
  WHERE date = v_today
    AND is_active = true
  LIMIT 1;

  IF v_topic_id IS NOT NULL THEN
    SELECT id INTO v_challenge_id
    FROM public.challenges
    WHERE topic_id = v_topic_id
      AND challenge_type = 'daily'
      AND challenge_template = 'topic_based'
      AND start_date::DATE = v_today
    LIMIT 1;

    IF v_challenge_id IS NULL THEN
      SELECT 'Daily Challenge: ' || title INTO v_challenge_title
      FROM public.topics
      WHERE id = v_topic_id;

      INSERT INTO public.challenges (
        topic_id,
        title,
        description,
        challenge_type,
        challenge_template,
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
        'topic_based',
        true,
        true,
        true,
        50,
        NOW(),
        (v_today + INTERVAL '1 day')::TIMESTAMPTZ
      )
      RETURNING id INTO v_challenge_id;
    END IF;

    RETURN QUERY SELECT v_challenge_id, 'topic_based'::TEXT;
  END IF;

  -- 2. Record about your favorite memory challenge
  SELECT id INTO v_memory_challenge_id
  FROM public.challenges
  WHERE challenge_type = 'daily'
    AND challenge_template = 'record_memory'
    AND start_date::DATE = v_today
  LIMIT 1;

  IF v_memory_challenge_id IS NULL THEN
    INSERT INTO public.challenges (
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
      'Daily Challenge: Record about your favorite memory',
      'Share a voice clip about your favorite memory. What made it special?',
      'daily',
      'record_memory',
      true,
      true,
      true,
      30,
      NOW(),
      (v_today + INTERVAL '1 day')::TIMESTAMPTZ,
      '{"type": "record_clip", "min_duration": 10, "max_duration": 300}'::jsonb
    )
    RETURNING id INTO v_memory_challenge_id;

    RETURN QUERY SELECT v_memory_challenge_id, 'record_memory'::TEXT;
  END IF;

  -- 3. React to 5 clips challenge
  SELECT id INTO v_react_challenge_id
  FROM public.challenges
  WHERE challenge_type = 'daily'
    AND challenge_template = 'react_to_clips'
    AND start_date::DATE = v_today
  LIMIT 1;

  IF v_react_challenge_id IS NULL THEN
    INSERT INTO public.challenges (
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
      'Daily Challenge: React to 5 clips',
      'Engage with the community! React to 5 different clips today.',
      'daily',
      'react_to_clips',
      true,
      true,
      true,
      20,
      NOW(),
      (v_today + INTERVAL '1 day')::TIMESTAMPTZ,
      '{"type": "react_to_clips", "target_count": 5}'::jsonb
    )
    RETURNING id INTO v_react_challenge_id;

    RETURN QUERY SELECT v_react_challenge_id, 'react_to_clips'::TEXT;
  END IF;

  -- 4. Daily Streak Challenge
  SELECT id INTO v_streak_challenge_id
  FROM public.challenges
  WHERE challenge_type = 'daily'
    AND challenge_template = 'daily_streak'
    AND start_date::DATE = v_today
  LIMIT 1;

  IF v_streak_challenge_id IS NULL THEN
    INSERT INTO public.challenges (
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
      'Daily Streak Challenge 🔥',
      'Post a clip today to maintain your streak! Build your daily posting habit and compete with others.',
      'daily',
      'daily_streak',
      true,
      true,
      true,
      25,
      NOW(),
      (v_today + INTERVAL '1 day')::TIMESTAMPTZ,
      '{"type": "daily_streak", "target_days": 1, "bonus_for_streak": true}'::jsonb
    )
    RETURNING id INTO v_streak_challenge_id;

    RETURN QUERY SELECT v_streak_challenge_id, 'daily_streak'::TEXT;
  END IF;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check challenge progress
CREATE OR REPLACE FUNCTION public.check_challenge_progress(
  p_challenge_id UUID,
  p_profile_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_challenge RECORD;
  v_progress JSONB;
  v_clips_count INTEGER;
  v_reactions_count INTEGER;
  v_current_streak INTEGER;
  v_posted_today BOOLEAN;
BEGIN
  SELECT * INTO v_challenge
  FROM public.challenges
  WHERE id = p_challenge_id;

  IF NOT FOUND THEN
    RETURN '{"error": "Challenge not found"}'::jsonb;
  END IF;

  v_progress := '{}'::jsonb;

  CASE v_challenge.challenge_template
    WHEN 'record_memory' THEN
      -- Count clips created today for this challenge
      SELECT COUNT(*) INTO v_clips_count
      FROM public.clips
      WHERE profile_id = p_profile_id
        AND challenge_id = p_challenge_id
        AND created_at::DATE = CURRENT_DATE
        AND status = 'live';

      v_progress := jsonb_build_object(
        'type', 'record_memory',
        'clips_count', v_clips_count,
        'target', 1,
        'completed', v_clips_count >= 1
      );

    WHEN 'react_to_clips' THEN
      -- Count unique clips reacted to today
      SELECT COUNT(DISTINCT clip_id) INTO v_reactions_count
      FROM public.clip_reactions
      WHERE profile_id = p_profile_id
        AND created_at::DATE = CURRENT_DATE;

      v_progress := jsonb_build_object(
        'type', 'react_to_clips',
        'reactions_count', v_reactions_count,
        'target', (v_challenge.criteria->>'target_count')::INTEGER,
        'completed', v_reactions_count >= (v_challenge.criteria->>'target_count')::INTEGER
      );

    WHEN 'daily_streak' THEN
      -- Check if user posted a clip today
      SELECT COUNT(*) INTO v_clips_count
      FROM public.clips
      WHERE profile_id = p_profile_id
        AND created_at::DATE = CURRENT_DATE
        AND status = 'live';

      -- Get user's current streak
      SELECT current_streak_days INTO v_current_streak
      FROM public.profiles
      WHERE id = p_profile_id;

      v_posted_today := v_clips_count > 0;

      v_progress := jsonb_build_object(
        'type', 'daily_streak',
        'posted_today', v_posted_today,
        'clips_count', v_clips_count,
        'current_streak', COALESCE(v_current_streak, 0),
        'target', 1,
        'completed', v_posted_today
      );

    ELSE
      -- Topic-based challenge - count participations
      SELECT COUNT(*) INTO v_clips_count
      FROM public.challenge_participations
      WHERE challenge_id = p_challenge_id
        AND profile_id = p_profile_id;

      v_progress := jsonb_build_object(
        'type', 'topic_based',
        'participated', v_clips_count > 0,
        'clips_count', v_clips_count
      );
  END CASE;

  -- Update or insert progress
  INSERT INTO public.challenge_progress (
    challenge_id,
    profile_id,
    progress_data,
    completed_at
  ) VALUES (
    p_challenge_id,
    p_profile_id,
    v_progress,
    CASE WHEN (v_progress->>'completed')::BOOLEAN THEN NOW() ELSE NULL END
  )
  ON CONFLICT (challenge_id, profile_id) DO UPDATE
  SET 
    progress_data = v_progress,
    completed_at = CASE WHEN (v_progress->>'completed')::BOOLEAN THEN NOW() ELSE challenge_progress.completed_at END,
    updated_at = NOW();

  RETURN v_progress;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 2. LIVE REACTIONS DURING PLAYBACK
-- ============================================================================

-- Add reaction timestamp (when in the clip the reaction happened)
ALTER TABLE public.clip_reactions
ADD COLUMN IF NOT EXISTS reaction_timestamp_seconds NUMERIC DEFAULT NULL;

-- Add index for querying reactions by timestamp
CREATE INDEX IF NOT EXISTS idx_clip_reactions_timestamp ON public.clip_reactions(clip_id, reaction_timestamp_seconds)
WHERE reaction_timestamp_seconds IS NOT NULL;

-- Function to get live reactions for a clip during playback
CREATE OR REPLACE FUNCTION public.get_live_reactions(
  p_clip_id UUID,
  p_current_time_seconds NUMERIC,
  p_time_window_seconds NUMERIC DEFAULT 5
)
RETURNS TABLE (
  emoji TEXT,
  reaction_count BIGINT,
  timestamp_seconds NUMERIC,
  recent_reactions JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cr.emoji,
    COUNT(*)::BIGINT as reaction_count,
    cr.reaction_timestamp_seconds,
    jsonb_agg(
      jsonb_build_object(
        'profile_id', cr.profile_id,
        'created_at', cr.created_at
      )
      ORDER BY cr.created_at DESC
    ) FILTER (WHERE cr.created_at > NOW() - INTERVAL '1 minute') as recent_reactions
  FROM public.clip_reactions cr
  WHERE cr.clip_id = p_clip_id
    AND cr.reaction_timestamp_seconds IS NOT NULL
    AND cr.reaction_timestamp_seconds >= (p_current_time_seconds - p_time_window_seconds)
    AND cr.reaction_timestamp_seconds <= (p_current_time_seconds + p_time_window_seconds)
  GROUP BY cr.emoji, cr.reaction_timestamp_seconds
  ORDER BY reaction_count DESC, cr.reaction_timestamp_seconds;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function to get reaction heatmap for a clip
CREATE OR REPLACE FUNCTION public.get_reaction_heatmap(
  p_clip_id UUID,
  p_bucket_size_seconds NUMERIC DEFAULT 5
)
RETURNS TABLE (
  time_bucket NUMERIC,
  reaction_count BIGINT,
  top_emoji TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    FLOOR(cr.reaction_timestamp_seconds / p_bucket_size_seconds) * p_bucket_size_seconds as time_bucket,
    COUNT(*)::BIGINT as reaction_count,
    MODE() WITHIN GROUP (ORDER BY cr.emoji) as top_emoji
  FROM public.clip_reactions cr
  WHERE cr.clip_id = p_clip_id
    AND cr.reaction_timestamp_seconds IS NOT NULL
  GROUP BY time_bucket
  ORDER BY time_bucket;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================================
-- 3. VOICE AMAs (Ask Me Anything)
-- ============================================================================

-- Add AMA fields to live_rooms
ALTER TABLE public.live_rooms
ADD COLUMN IF NOT EXISTS is_ama BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS ama_host_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS ama_scheduled_start_time TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS ama_question_submission_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS ama_question_deadline TIMESTAMPTZ;

-- Create AMA questions table
CREATE TABLE IF NOT EXISTS public.ama_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES public.live_rooms(id) ON DELETE CASCADE,
  questioner_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  audio_question_path TEXT, -- Path to audio file for voice questions
  text_question TEXT, -- Optional text question
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'answered', 'skipped', 'archived')),
  answered_at TIMESTAMPTZ,
  answer_clip_id UUID REFERENCES public.clips(id) ON DELETE SET NULL, -- Link to answer clip
  upvotes INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ama_questions_room ON public.ama_questions(room_id, status);
CREATE INDEX IF NOT EXISTS idx_ama_questions_questioner ON public.ama_questions(questioner_profile_id);

-- Enable RLS on new tables
ALTER TABLE public.challenge_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ama_questions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for challenge_progress
DROP POLICY IF EXISTS "Challenge progress viewable by everyone" ON public.challenge_progress;
CREATE POLICY "Challenge progress viewable by everyone"
ON public.challenge_progress FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Users can insert their own challenge progress" ON public.challenge_progress;
CREATE POLICY "Users can insert their own challenge progress"
ON public.challenge_progress FOR INSERT
WITH CHECK (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

DROP POLICY IF EXISTS "Users can update their own challenge progress" ON public.challenge_progress;
CREATE POLICY "Users can update their own challenge progress"
ON public.challenge_progress FOR UPDATE
USING (
  profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

-- RLS Policies for ama_questions
DROP POLICY IF EXISTS "AMA questions viewable by everyone" ON public.ama_questions;
CREATE POLICY "AMA questions viewable by everyone"
ON public.ama_questions FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Users can insert their own AMA questions" ON public.ama_questions;
CREATE POLICY "Users can insert their own AMA questions"
ON public.ama_questions FOR INSERT
WITH CHECK (
  questioner_profile_id IN (
    SELECT id FROM public.profiles
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  )
);

DROP POLICY IF EXISTS "AMA hosts can update questions" ON public.ama_questions;
CREATE POLICY "AMA hosts can update questions"
ON public.ama_questions FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.live_rooms
    WHERE id = ama_questions.room_id
      AND (host_profile_id IN (
        SELECT id FROM public.profiles
        WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
      ) OR ama_host_profile_id IN (
        SELECT id FROM public.profiles
        WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
      ))
  )
);

-- Grant access
GRANT SELECT ON public.challenge_progress TO authenticated, anon;
GRANT INSERT, UPDATE ON public.challenge_progress TO authenticated;
GRANT SELECT ON public.ama_questions TO authenticated, anon;
GRANT INSERT ON public.ama_questions TO authenticated;
GRANT UPDATE ON public.ama_questions TO authenticated;

COMMENT ON COLUMN public.challenges.challenge_template IS 'Template type for the challenge: topic_based, record_memory, react_to_clips, etc.';
COMMENT ON COLUMN public.clip_reactions.reaction_timestamp_seconds IS 'Timestamp in seconds when the reaction was made during clip playback';
COMMENT ON COLUMN public.live_rooms.is_ama IS 'Whether this live room is an AMA session';
COMMENT ON COLUMN public.live_rooms.ama_host_profile_id IS 'Profile ID of the AMA host (can be different from room host)';

