-- Emotions & Voice Characteristics Features
-- This migration adds support for:
-- 1. Emotion detection in audio (beyond sentiment)
-- 2. Voice characteristics analysis (pitch, speed, tone)
-- 3. Voice similarity matching
-- 4. Voice diversity metrics

-- ============================================================================
-- EMOTION DETECTION
-- ============================================================================

-- Add emotion fields to clips table
ALTER TABLE public.clips
ADD COLUMN IF NOT EXISTS detected_emotion TEXT DEFAULT NULL CHECK (detected_emotion IN ('joy', 'sadness', 'anger', 'fear', 'surprise', 'disgust', 'neutral', 'excited', 'calm', 'frustrated', 'happy', 'melancholic', NULL)),
ADD COLUMN IF NOT EXISTS emotion_confidence NUMERIC(3,2) DEFAULT NULL CHECK (emotion_confidence >= 0 AND emotion_confidence <= 1),
ADD COLUMN IF NOT EXISTS emotion_scores JSONB DEFAULT NULL; -- Stores detailed emotion scores: {joy: 0.8, sadness: 0.1, ...}

-- Create index for emotion filtering
CREATE INDEX IF NOT EXISTS idx_clips_detected_emotion ON public.clips(detected_emotion) WHERE detected_emotion IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clips_emotion_scores ON public.clips USING gin(emotion_scores) WHERE emotion_scores IS NOT NULL;

-- ============================================================================
-- VOICE CHARACTERISTICS
-- ============================================================================

-- Add voice characteristics fields to clips table
ALTER TABLE public.clips
ADD COLUMN IF NOT EXISTS voice_characteristics JSONB DEFAULT NULL, -- Stores: {pitch: 0-1, speed: words_per_minute, tone: 'warm'|'cool'|'neutral', timbre: description}
ADD COLUMN IF NOT EXISTS voice_fingerprint TEXT DEFAULT NULL; -- Hash/identifier for voice similarity matching

-- Create index for voice characteristics
CREATE INDEX IF NOT EXISTS idx_clips_voice_characteristics ON public.clips USING gin(voice_characteristics) WHERE voice_characteristics IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clips_voice_fingerprint ON public.clips(voice_fingerprint) WHERE voice_fingerprint IS NOT NULL;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to find similar voices based on voice characteristics
CREATE OR REPLACE FUNCTION public.find_similar_voices(
  p_clip_id UUID,
  p_limit INT DEFAULT 10
)
RETURNS TABLE(
  clip_id UUID,
  similarity_score NUMERIC,
  profile_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_clip RECORD;
  v_target_characteristics JSONB;
  v_target_fingerprint TEXT;
BEGIN
  -- Get target clip's voice characteristics
  SELECT voice_characteristics, voice_fingerprint INTO v_target_characteristics, v_target_fingerprint
  FROM public.clips
  WHERE id = p_clip_id
    AND status = 'live'
    AND voice_characteristics IS NOT NULL;
  
  IF NOT FOUND OR v_target_characteristics IS NULL THEN
    RETURN;
  END IF;
  
  -- Find similar voices based on fingerprint (exact match) or characteristics (similarity)
  RETURN QUERY
  SELECT 
    c.id,
    CASE
      -- Exact fingerprint match gets highest score
      WHEN c.voice_fingerprint = v_target_fingerprint AND c.voice_fingerprint IS NOT NULL THEN 1.0
      -- Similarity based on pitch and tone
      WHEN c.voice_characteristics IS NOT NULL THEN
        (
          -- Pitch similarity (within 0.1 range)
          CASE 
            WHEN ABS((c.voice_characteristics->>'pitch')::NUMERIC - (v_target_characteristics->>'pitch')::NUMERIC) < 0.1 THEN 0.4
            WHEN ABS((c.voice_characteristics->>'pitch')::NUMERIC - (v_target_characteristics->>'pitch')::NUMERIC) < 0.2 THEN 0.2
            ELSE 0.0
          END +
          -- Tone match
          CASE 
            WHEN c.voice_characteristics->>'tone' = v_target_characteristics->>'tone' THEN 0.3
            ELSE 0.0
          END +
          -- Speed similarity (within 20 words/min)
          CASE 
            WHEN ABS((c.voice_characteristics->>'speed')::NUMERIC - (v_target_characteristics->>'speed')::NUMERIC) < 20 THEN 0.3
            WHEN ABS((c.voice_characteristics->>'speed')::NUMERIC - (v_target_characteristics->>'speed')::NUMERIC) < 40 THEN 0.15
            ELSE 0.0
          END
        )
      ELSE 0.0
    END as similarity_score,
    c.profile_id
  FROM public.clips c
  WHERE c.id != p_clip_id
    AND c.status = 'live'
    AND c.voice_characteristics IS NOT NULL
    AND (
      c.voice_fingerprint = v_target_fingerprint
      OR c.voice_characteristics IS NOT NULL
    )
  ORDER BY similarity_score DESC, c.created_at DESC
  LIMIT p_limit;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.find_similar_voices TO authenticated, anon;

-- Function to get voice diversity metrics for a topic or profile
CREATE OR REPLACE FUNCTION public.get_voice_diversity_metrics(
  p_topic_id UUID DEFAULT NULL,
  p_profile_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 100
)
RETURNS TABLE(
  total_clips BIGINT,
  unique_voices BIGINT,
  pitch_diversity NUMERIC,
  tone_diversity NUMERIC,
  speed_diversity NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clips RECORD;
  v_pitches NUMERIC[];
  v_tones TEXT[];
  v_speeds NUMERIC[];
  v_unique_fingerprints TEXT[];
BEGIN
  -- Get clips with voice characteristics
  FOR v_clips IN
    SELECT voice_characteristics, voice_fingerprint
    FROM public.clips
    WHERE status = 'live'
      AND voice_characteristics IS NOT NULL
      AND (p_topic_id IS NULL OR topic_id = p_topic_id)
      AND (p_profile_id IS NULL OR profile_id = p_profile_id)
    LIMIT p_limit
  LOOP
    -- Collect pitch values
    IF v_clips.voice_characteristics->>'pitch' IS NOT NULL THEN
      v_pitches := array_append(v_pitches, (v_clips.voice_characteristics->>'pitch')::NUMERIC);
    END IF;
    
    -- Collect tone values
    IF v_clips.voice_characteristics->>'tone' IS NOT NULL THEN
      v_tones := array_append(v_tones, v_clips.voice_characteristics->>'tone');
    END IF;
    
    -- Collect speed values
    IF v_clips.voice_characteristics->>'speed' IS NOT NULL THEN
      v_speeds := array_append(v_speeds, (v_clips.voice_characteristics->>'speed')::NUMERIC);
    END IF;
    
    -- Collect unique fingerprints
    IF v_clips.voice_fingerprint IS NOT NULL AND NOT (v_clips.voice_fingerprint = ANY(v_unique_fingerprints)) THEN
      v_unique_fingerprints := array_append(v_unique_fingerprints, v_clips.voice_fingerprint);
    END IF;
  END LOOP;
  
  -- Calculate diversity metrics
  RETURN QUERY
  SELECT
    array_length(v_pitches, 1)::BIGINT as total_clips,
    array_length(v_unique_fingerprints, 1)::BIGINT as unique_voices,
    -- Pitch diversity: standard deviation
    CASE 
      WHEN array_length(v_pitches, 1) > 1 THEN
        (SELECT stddev(unnest) FROM unnest(v_pitches))
      ELSE 0.0
    END as pitch_diversity,
    -- Tone diversity: number of unique tones
    (SELECT COUNT(DISTINCT unnest) FROM unnest(v_tones))::NUMERIC as tone_diversity,
    -- Speed diversity: standard deviation
    CASE 
      WHEN array_length(v_speeds, 1) > 1 THEN
        (SELECT stddev(unnest) FROM unnest(v_speeds))
      ELSE 0.0
    END as speed_diversity;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_voice_diversity_metrics TO authenticated, anon;

-- ============================================================================
-- UPDATE SEARCH FUNCTION
-- ============================================================================

-- Update search_clips_enhanced to support emotion filtering
-- Note: This function signature already exists, so we'll create a new version
CREATE OR REPLACE FUNCTION search_clips_enhanced(
  search_text TEXT DEFAULT NULL,
  duration_min INT DEFAULT NULL,
  duration_max INT DEFAULT NULL,
  date_from TIMESTAMPTZ DEFAULT NULL,
  date_to TIMESTAMPTZ DEFAULT NULL,
  mood_emoji_filter TEXT DEFAULT NULL,
  city_filter TEXT DEFAULT NULL,
  topic_id_filter UUID DEFAULT NULL,
  min_reactions INT DEFAULT NULL,
  min_listens INT DEFAULT NULL,
  quality_badge_filter TEXT DEFAULT NULL,
  emotion_filter TEXT DEFAULT NULL,
  limit_results INT DEFAULT 100
)
RETURNS TABLE(clip_id UUID, rank REAL) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id, 
    COALESCE(
      CASE 
        WHEN search_text IS NOT NULL AND search_text != '' THEN
          ts_rank(
            to_tsvector('english', COALESCE(c.captions, '') || ' ' || COALESCE(c.summary, '') || ' ' || COALESCE(c.title, '')),
            plainto_tsquery('english', search_text)
          )
        ELSE 1.0
      END,
      1.0
    ) as rank
  FROM clips c
  WHERE c.status = 'live'
    AND c.captions IS NOT NULL
    AND c.captions != ''
    -- Text search condition
    AND (
      search_text IS NULL 
      OR search_text = ''
      OR to_tsvector('english', COALESCE(c.captions, '') || ' ' || COALESCE(c.summary, '') || ' ' || COALESCE(c.title, '')) 
         @@ plainto_tsquery('english', search_text)
    )
    -- Duration filter
    AND (duration_min IS NULL OR c.duration_seconds >= duration_min)
    AND (duration_max IS NULL OR c.duration_seconds <= duration_max)
    -- Date filter
    AND (date_from IS NULL OR c.created_at >= date_from)
    AND (date_to IS NULL OR c.created_at <= date_to)
    -- Mood filter
    AND (mood_emoji_filter IS NULL OR c.mood_emoji = mood_emoji_filter)
    -- City filter
    AND (city_filter IS NULL OR c.city = city_filter)
    -- Topic filter
    AND (topic_id_filter IS NULL OR c.topic_id = topic_id_filter)
    -- Reactions filter
    AND (
      min_reactions IS NULL 
      OR (
        SELECT COALESCE(SUM((value::text)::int), 0)
        FROM jsonb_each(c.reactions)
      ) >= min_reactions
    )
    -- Listens filter
    AND (min_listens IS NULL OR c.listens_count >= min_listens)
    -- Quality badge filter
    AND (quality_badge_filter IS NULL OR c.quality_badge = quality_badge_filter)
    -- Emotion filter
    AND (emotion_filter IS NULL OR c.detected_emotion = emotion_filter)
  ORDER BY rank DESC, c.created_at DESC
  LIMIT limit_results;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION search_clips_enhanced(TEXT, INT, INT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, UUID, INT, INT, TEXT, TEXT, INT) TO anon;
GRANT EXECUTE ON FUNCTION search_clips_enhanced(TEXT, INT, INT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, UUID, INT, INT, TEXT, TEXT, INT) TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN public.clips.detected_emotion IS 'Primary emotion detected in audio: joy, sadness, anger, fear, surprise, disgust, neutral, excited, calm, frustrated, happy, melancholic';
COMMENT ON COLUMN public.clips.emotion_confidence IS 'Confidence score (0-1) for detected emotion';
COMMENT ON COLUMN public.clips.emotion_scores IS 'Detailed emotion scores: {joy: 0.8, sadness: 0.1, anger: 0.05, ...}';
COMMENT ON COLUMN public.clips.voice_characteristics IS 'Voice characteristics: {pitch: 0-1, speed: words_per_minute, tone: warm|cool|neutral, timbre: description}';
COMMENT ON COLUMN public.clips.voice_fingerprint IS 'Hash/identifier for voice similarity matching';

