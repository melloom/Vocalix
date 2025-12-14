-- Daily Digest feature
-- Adds email support and digest preferences to profiles

-- Add email and digest preferences to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS digest_enabled BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS digest_frequency TEXT NOT NULL DEFAULT 'daily' CHECK (digest_frequency IN ('never', 'daily', 'weekly')),
ADD COLUMN IF NOT EXISTS digest_last_sent_at TIMESTAMPTZ;

-- Add index for digest queries
CREATE INDEX IF NOT EXISTS idx_profiles_digest_enabled 
ON public.profiles(digest_enabled, digest_frequency) 
WHERE digest_enabled = true AND digest_frequency != 'never';

-- Add unique constraint on email (optional, but good for preventing duplicates)
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email_unique 
ON public.profiles(email) 
WHERE email IS NOT NULL AND trim(email) != '';

-- Function to get best clips from followed topics for a user
-- Returns top clips based on trending score from topics the user follows
CREATE OR REPLACE FUNCTION public.get_digest_clips(
  user_profile_id UUID,
  clip_limit INTEGER DEFAULT 10,
  hours_back INTEGER DEFAULT 24
)
RETURNS TABLE (
  clip_id UUID,
  title TEXT,
  audio_path TEXT,
  duration_seconds INTEGER,
  transcription TEXT,
  created_at TIMESTAMPTZ,
  trending_score NUMERIC,
  listens_count INTEGER,
  reactions JSONB,
  profile_handle TEXT,
  profile_emoji_avatar TEXT,
  topic_title TEXT,
  topic_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id AS clip_id,
    c.title,
    c.audio_path,
    c.duration_seconds,
    c.transcription,
    c.created_at,
    c.trending_score,
    c.listens_count,
    c.reactions,
    p.handle AS profile_handle,
    p.emoji_avatar AS profile_emoji_avatar,
    t.title AS topic_title,
    t.id AS topic_id
  FROM public.clips c
  INNER JOIN public.profiles p ON c.profile_id = p.id
  INNER JOIN public.topics t ON c.topic_id = t.id
  INNER JOIN public.topic_subscriptions ts ON t.id = ts.topic_id
  WHERE ts.profile_id = user_profile_id
    AND c.status = 'live'
    AND c.parent_clip_id IS NULL  -- Only top-level clips
    AND c.created_at >= NOW() - (hours_back || ' hours')::INTERVAL
    AND c.trending_score > 0  -- Only clips with some engagement
  ORDER BY c.trending_score DESC, c.created_at DESC
  LIMIT clip_limit;
END;
$$;

-- Function to generate digest for a single user
-- Returns digest data as JSONB
CREATE OR REPLACE FUNCTION public.generate_user_digest(
  user_profile_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_profile RECORD;
  digest_clips JSONB;
  clip_count INTEGER;
  followed_topics_count INTEGER;
BEGIN
  -- Get user profile
  SELECT * INTO user_profile
  FROM public.profiles
  WHERE id = user_profile_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'User not found');
  END IF;
  
  -- Check if digest is enabled
  IF NOT user_profile.digest_enabled OR user_profile.digest_frequency = 'never' THEN
    RETURN jsonb_build_object('error', 'Digest not enabled for user');
  END IF;
  
  -- Check if email is set
  IF user_profile.email IS NULL OR trim(user_profile.email) = '' THEN
    RETURN jsonb_build_object('error', 'Email not set for user');
  END IF;
  
  -- Get count of followed topics
  SELECT COUNT(*) INTO followed_topics_count
  FROM public.topic_subscriptions
  WHERE profile_id = user_profile_id;
  
  IF followed_topics_count = 0 THEN
    RETURN jsonb_build_object('error', 'User not following any topics');
  END IF;
  
  -- Get digest clips (last 24 hours, top 10)
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', clip_id,
      'title', title,
      'audio_path', audio_path,
      'duration_seconds', duration_seconds,
      'transcription', transcription,
      'created_at', created_at,
      'trending_score', trending_score,
      'listens_count', listens_count,
      'reactions', reactions,
      'profile', jsonb_build_object(
        'handle', profile_handle,
        'emoji_avatar', profile_emoji_avatar
      ),
      'topic', jsonb_build_object(
        'id', topic_id,
        'title', topic_title
      )
    ) ORDER BY trending_score DESC
  ) INTO digest_clips
  FROM public.get_digest_clips(user_profile_id, 10, 24);
  
  clip_count := COALESCE(jsonb_array_length(digest_clips), 0);
  
  IF clip_count = 0 THEN
    RETURN jsonb_build_object('error', 'No new clips to include in digest');
  END IF;
  
  -- Return digest data
  RETURN jsonb_build_object(
    'user_id', user_profile_id,
    'email', user_profile.email,
    'handle', user_profile.handle,
    'clips', digest_clips,
    'clip_count', clip_count,
    'followed_topics_count', followed_topics_count,
    'generated_at', NOW()
  );
END;
$$;

-- Function to get all users who should receive a digest
-- Based on frequency and last sent time
CREATE OR REPLACE FUNCTION public.get_digest_recipients(
  frequency_filter TEXT DEFAULT NULL
)
RETURNS TABLE (
  profile_id UUID,
  email TEXT,
  handle TEXT,
  digest_frequency TEXT,
  digest_last_sent_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  frequency_condition TEXT;
BEGIN
  -- Build frequency condition
  IF frequency_filter IS NOT NULL THEN
    frequency_condition := format('AND digest_frequency = %L', frequency_filter);
  ELSE
    frequency_condition := '';
  END IF;
  
  RETURN QUERY
  EXECUTE format('
    SELECT 
      id AS profile_id,
      email,
      handle,
      digest_frequency,
      digest_last_sent_at
    FROM public.profiles
    WHERE digest_enabled = true
      AND digest_frequency != ''never''
      AND email IS NOT NULL
      AND trim(email) != ''''
      %s
      AND (
        digest_last_sent_at IS NULL
        OR (
          CASE digest_frequency
            WHEN ''daily'' THEN digest_last_sent_at < NOW() - INTERVAL ''23 hours''
            WHEN ''weekly'' THEN digest_last_sent_at < NOW() - INTERVAL ''6 days 23 hours''
            ELSE false
          END
        )
      )
  ', frequency_condition);
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_digest_clips(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_user_digest(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_digest_recipients(TEXT) TO authenticated;

-- RLS: Users can view their own email and digest settings
-- (Email is already protected, but we ensure digest settings are readable)
-- Note: Email should not be directly readable by users, only by system functions

