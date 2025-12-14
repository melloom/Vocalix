-- AI-Powered Content Creation Feature
-- This migration adds tables and functions for AI content suggestions, optimization, and analysis

-- Table to store AI-generated content suggestions
CREATE TABLE IF NOT EXISTS public.ai_content_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  suggestion_type TEXT NOT NULL CHECK (suggestion_type IN ('topic', 'script', 'content_idea', 'title', 'hashtag', 'posting_time')),
  content TEXT NOT NULL,
  context JSONB, -- Additional context (e.g., trending topics, user interests)
  metadata JSONB, -- Additional metadata (e.g., confidence score, reasoning)
  created_at TIMESTAMPTZ DEFAULT now(),
  used_at TIMESTAMPTZ, -- When the suggestion was used
  clip_id UUID REFERENCES public.clips(id) ON DELETE SET NULL -- If used for a clip
);

CREATE INDEX idx_ai_suggestions_profile ON public.ai_content_suggestions(profile_id);
CREATE INDEX idx_ai_suggestions_type ON public.ai_content_suggestions(suggestion_type);
CREATE INDEX idx_ai_suggestions_created ON public.ai_content_suggestions(created_at DESC);

ALTER TABLE public.ai_content_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own suggestions"
  ON public.ai_content_suggestions FOR SELECT
  USING (profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  ));

CREATE POLICY "Users can insert their own suggestions"
  ON public.ai_content_suggestions FOR INSERT
  WITH CHECK (profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  ));

CREATE POLICY "Users can update their own suggestions"
  ON public.ai_content_suggestions FOR UPDATE
  USING (profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  ));

-- Table to store AI content analysis results
CREATE TABLE IF NOT EXISTS public.ai_content_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  sentiment_score NUMERIC(3, 2) CHECK (sentiment_score >= -1 AND sentiment_score <= 1),
  sentiment_label TEXT CHECK (sentiment_label IN ('positive', 'negative', 'neutral', 'mixed')),
  engagement_prediction NUMERIC(5, 2), -- Predicted listens/reactions
  quality_score NUMERIC(3, 2) CHECK (quality_score >= 0 AND quality_score <= 1),
  improvement_suggestions TEXT[],
  analysis_metadata JSONB, -- Additional analysis data
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ai_analysis_clip ON public.ai_content_analysis(clip_id);
CREATE INDEX idx_ai_analysis_profile ON public.ai_content_analysis(profile_id);
CREATE INDEX idx_ai_analysis_created ON public.ai_content_analysis(created_at DESC);

ALTER TABLE public.ai_content_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view analysis for live clips"
  ON public.ai_content_analysis FOR SELECT
  USING (clip_id IN (
    SELECT id FROM public.clips WHERE status = 'live'
  ) OR profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  ));

CREATE POLICY "Users can insert analysis for their clips"
  ON public.ai_content_analysis FOR INSERT
  WITH CHECK (profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  ));

CREATE POLICY "Users can update analysis for their clips"
  ON public.ai_content_analysis FOR UPDATE
  USING (profile_id IN (
    SELECT id FROM public.profiles 
    WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
  ));

-- Table to store trending topics identified by AI
CREATE TABLE IF NOT EXISTS public.ai_trending_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_title TEXT NOT NULL,
  topic_description TEXT,
  trend_score NUMERIC(5, 2), -- How trending this topic is
  category TEXT,
  suggested_hashtags TEXT[],
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ -- When this trend expires
);

CREATE INDEX idx_ai_trending_created ON public.ai_trending_topics(created_at DESC);
CREATE INDEX idx_ai_trending_score ON public.ai_trending_topics(trend_score DESC);

ALTER TABLE public.ai_trending_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view trending topics"
  ON public.ai_trending_topics FOR SELECT
  USING (expires_at IS NULL OR expires_at > now());

-- Function to get AI suggestions for a user
CREATE OR REPLACE FUNCTION public.get_ai_content_suggestions(
  p_profile_id UUID,
  p_suggestion_type TEXT DEFAULT NULL,
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  suggestion_type TEXT,
  content TEXT,
  context JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    s.suggestion_type,
    s.content,
    s.context,
    s.metadata,
    s.created_at,
    s.used_at
  FROM public.ai_content_suggestions s
  WHERE s.profile_id = p_profile_id
    AND (p_suggestion_type IS NULL OR s.suggestion_type = p_suggestion_type)
    AND s.used_at IS NULL
  ORDER BY s.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark a suggestion as used
CREATE OR REPLACE FUNCTION public.mark_suggestion_used(
  p_suggestion_id UUID,
  p_clip_id UUID DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  UPDATE public.ai_content_suggestions
  SET used_at = now(),
      clip_id = p_clip_id
  WHERE id = p_suggestion_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get content analysis for a clip
CREATE OR REPLACE FUNCTION public.get_clip_ai_analysis(
  p_clip_id UUID
)
RETURNS TABLE (
  id UUID,
  sentiment_score NUMERIC,
  sentiment_label TEXT,
  engagement_prediction NUMERIC,
  quality_score NUMERIC,
  improvement_suggestions TEXT[],
  analysis_metadata JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.sentiment_score,
    a.sentiment_label,
    a.engagement_prediction,
    a.quality_score,
    a.improvement_suggestions,
    a.analysis_metadata,
    a.created_at,
    a.updated_at
  FROM public.ai_content_analysis a
  WHERE a.clip_id = p_clip_id
  ORDER BY a.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get trending topics
CREATE OR REPLACE FUNCTION public.get_ai_trending_topics(
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  topic_title TEXT,
  topic_description TEXT,
  trend_score NUMERIC,
  category TEXT,
  suggested_hashtags TEXT[],
  metadata JSONB,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id,
    t.topic_title,
    t.topic_description,
    t.trend_score,
    t.category,
    t.suggested_hashtags,
    t.metadata,
    t.created_at
  FROM public.ai_trending_topics t
  WHERE t.expires_at IS NULL OR t.expires_at > now()
  ORDER BY t.trend_score DESC, t.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update updated_at for ai_content_analysis
CREATE TRIGGER set_updated_at_ai_analysis
BEFORE UPDATE ON public.ai_content_analysis
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

COMMENT ON TABLE public.ai_content_suggestions IS 'Stores AI-generated content suggestions for creators';
COMMENT ON TABLE public.ai_content_analysis IS 'Stores AI analysis results for clips (sentiment, engagement prediction, quality)';
COMMENT ON TABLE public.ai_trending_topics IS 'Stores AI-identified trending topics';

