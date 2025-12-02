-- Migration: Add Creator Analytics Tracking
-- This migration adds tables and functions for comprehensive creator analytics

-- 1. Enhance listens table with device and geographic data
ALTER TABLE public.listens 
ADD COLUMN IF NOT EXISTS device_type TEXT,
ADD COLUMN IF NOT EXISTS user_agent TEXT,
ADD COLUMN IF NOT EXISTS country_code TEXT,
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS completion_percentage NUMERIC(5,2);

-- Add index for analytics queries
CREATE INDEX IF NOT EXISTS idx_listens_clip_id_listened_at ON public.listens(clip_id, listened_at DESC);
CREATE INDEX IF NOT EXISTS idx_listens_profile_id_listened_at ON public.listens(profile_id, listened_at DESC);
CREATE INDEX IF NOT EXISTS idx_listens_country_code ON public.listens(country_code) WHERE country_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_listens_device_type ON public.listens(device_type) WHERE device_type IS NOT NULL;

-- 2. Create shares table to track clip shares
CREATE TABLE IF NOT EXISTS public.clip_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE NOT NULL,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  share_method TEXT NOT NULL, -- 'link', 'native', 'embed'
  shared_at TIMESTAMPTZ DEFAULT now(),
  device_type TEXT,
  country_code TEXT,
  city TEXT
);

ALTER TABLE public.clip_shares ENABLE ROW LEVEL SECURITY;

-- RLS policies for clip_shares
CREATE POLICY "Anyone can log shares" 
ON public.clip_shares FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Creators can view shares of their clips"
ON public.clip_shares FOR SELECT
USING (
  clip_id IN (
    SELECT id FROM public.clips 
    WHERE profile_id IN (
      SELECT id FROM public.profiles 
      WHERE device_id = current_setting('request.headers', true)::json->>'x-device-id'
    )
  )
);

-- Indexes for shares
CREATE INDEX IF NOT EXISTS idx_clip_shares_clip_id ON public.clip_shares(clip_id, shared_at DESC);
CREATE INDEX IF NOT EXISTS idx_clip_shares_profile_id ON public.clip_shares(profile_id) WHERE profile_id IS NOT NULL;

-- 3. Create analytics functions

-- Function: Get listen-through rates and drop-off points for a clip
CREATE OR REPLACE FUNCTION public.get_clip_listen_through_rates(
  p_clip_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  clip_id UUID,
  total_listens BIGINT,
  completion_buckets JSONB,
  avg_completion_percentage NUMERIC,
  drop_off_points JSONB
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clip_duration INT;
BEGIN
  -- Get clip duration
  SELECT duration_seconds INTO v_clip_duration
  FROM public.clips
  WHERE id = p_clip_id;
  
  IF v_clip_duration IS NULL THEN
    RETURN;
  END IF;
  
  RETURN QUERY
  WITH listen_data AS (
    SELECT 
      l.seconds,
      CASE 
        WHEN l.completion_percentage IS NOT NULL THEN l.completion_percentage
        WHEN v_clip_duration > 0 THEN (l.seconds::NUMERIC / v_clip_duration::NUMERIC * 100)
        ELSE 0
      END as completion_pct,
      CASE 
        WHEN l.seconds < v_clip_duration * 0.1 THEN '0-10%'
        WHEN l.seconds < v_clip_duration * 0.25 THEN '10-25%'
        WHEN l.seconds < v_clip_duration * 0.5 THEN '25-50%'
        WHEN l.seconds < v_clip_duration * 0.75 THEN '50-75%'
        WHEN l.seconds < v_clip_duration * 0.9 THEN '75-90%'
        ELSE '90-100%'
      END as completion_bucket
    FROM public.listens l
    WHERE l.clip_id = p_clip_id
      AND (p_start_date IS NULL OR l.listened_at >= p_start_date)
      AND (p_end_date IS NULL OR l.listened_at <= p_end_date)
  ),
  bucket_counts AS (
    SELECT 
      completion_bucket,
      COUNT(*) as count
    FROM listen_data
    GROUP BY completion_bucket
  ),
  drop_off AS (
    SELECT 
      CASE 
        WHEN seconds < v_clip_duration * 0.1 THEN 0.1
        WHEN seconds < v_clip_duration * 0.25 THEN 0.25
        WHEN seconds < v_clip_duration * 0.5 THEN 0.5
        WHEN seconds < v_clip_duration * 0.75 THEN 0.75
        WHEN seconds < v_clip_duration * 0.9 THEN 0.9
        ELSE 1.0
      END as drop_off_point,
      COUNT(*) as drop_off_count
    FROM public.listens
    WHERE clip_id = p_clip_id
      AND (p_start_date IS NULL OR listened_at >= p_start_date)
      AND (p_end_date IS NULL OR listened_at <= p_end_date)
    GROUP BY drop_off_point
    ORDER BY drop_off_point
  )
  SELECT 
    p_clip_id,
    COUNT(*)::BIGINT as total_listens,
    jsonb_object_agg(completion_bucket, count) as completion_buckets,
    COALESCE(AVG(completion_pct), 0) as avg_completion_percentage,
    jsonb_object_agg(drop_off_point::TEXT, drop_off_count) as drop_off_points
  FROM listen_data
  CROSS JOIN bucket_counts
  CROSS JOIN drop_off
  GROUP BY p_clip_id;
END;
$$;

-- Function: Get engagement metrics for a creator's clips
CREATE OR REPLACE FUNCTION public.get_creator_engagement_metrics(
  p_profile_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  total_listens BIGINT,
  total_reactions BIGINT,
  total_voice_reactions BIGINT,
  total_shares BIGINT,
  total_comments BIGINT,
  avg_listens_per_clip NUMERIC,
  avg_reactions_per_clip NUMERIC,
  engagement_rate NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH clip_stats AS (
    SELECT 
      c.id,
      c.listens_count,
      (SELECT COUNT(*) FROM public.clip_reactions cr WHERE cr.clip_id = c.id) as reactions,
      (SELECT COUNT(*) FROM public.voice_reactions vr WHERE vr.clip_id = c.id) as voice_reactions,
      (SELECT COUNT(*) FROM public.clip_shares cs WHERE cs.clip_id = c.id) as shares,
      (SELECT COUNT(*) FROM public.comments cm WHERE cm.clip_id = c.id) as comments
    FROM public.clips c
    WHERE c.profile_id = p_profile_id
      AND c.status = 'live'
      AND (p_start_date IS NULL OR c.created_at >= p_start_date)
      AND (p_end_date IS NULL OR c.created_at <= p_end_date)
  )
  SELECT 
    COALESCE(SUM(clip_stats.listens_count), 0)::BIGINT as total_listens,
    COALESCE(SUM(clip_stats.reactions), 0)::BIGINT as total_reactions,
    COALESCE(SUM(clip_stats.voice_reactions), 0)::BIGINT as total_voice_reactions,
    COALESCE(SUM(clip_stats.shares), 0)::BIGINT as total_shares,
    COALESCE(SUM(clip_stats.comments), 0)::BIGINT as total_comments,
    COALESCE(AVG(clip_stats.listens_count), 0) as avg_listens_per_clip,
    COALESCE(AVG(clip_stats.reactions), 0) as avg_reactions_per_clip,
    CASE 
      WHEN SUM(clip_stats.listens_count) > 0 THEN
        ((SUM(clip_stats.reactions) + SUM(clip_stats.voice_reactions) + SUM(clip_stats.shares) + SUM(clip_stats.comments))::NUMERIC / SUM(clip_stats.listens_count)::NUMERIC * 100)
      ELSE 0
    END as engagement_rate
  FROM clip_stats;
END;
$$;

-- Function: Get audience insights (peak times, device types, geographic distribution)
CREATE OR REPLACE FUNCTION public.get_creator_audience_insights(
  p_profile_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  peak_listening_times JSONB,
  device_distribution JSONB,
  geographic_distribution JSONB,
  total_unique_listeners BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH clip_listens AS (
    SELECT l.*
    FROM public.listens l
    INNER JOIN public.clips c ON c.id = l.clip_id
    WHERE c.profile_id = p_profile_id
      AND (p_start_date IS NULL OR l.listened_at >= p_start_date)
      AND (p_end_date IS NULL OR l.listened_at <= p_end_date)
  ),
  hour_distribution AS (
    SELECT 
      EXTRACT(HOUR FROM listened_at) as hour,
      COUNT(*) as count
    FROM clip_listens
    GROUP BY hour
    ORDER BY count DESC
  ),
  device_dist AS (
    SELECT 
      COALESCE(device_type, 'unknown') as device_type,
      COUNT(*) as count
    FROM clip_listens
    GROUP BY device_type
  ),
  geo_dist AS (
    SELECT 
      COALESCE(country_code, 'unknown') as country_code,
      COUNT(*) as count
    FROM clip_listens
    GROUP BY country_code
  ),
  unique_listeners_count AS (
    SELECT COUNT(DISTINCT profile_id)::BIGINT as count
    FROM clip_listens
  )
  SELECT 
    (SELECT jsonb_object_agg(hour::TEXT, count) FROM hour_distribution) as peak_listening_times,
    (SELECT jsonb_object_agg(device_type, count) FROM device_dist) as device_distribution,
    (SELECT jsonb_object_agg(country_code, count) FROM geo_dist) as geographic_distribution,
    (SELECT count FROM unique_listeners_count) as total_unique_listeners;
END;
$$;

-- Function: Get performance comparison across clips
CREATE OR REPLACE FUNCTION public.get_clip_performance_comparison(
  p_profile_id UUID,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  clip_id UUID,
  title TEXT,
  created_at TIMESTAMPTZ,
  listens_count INT,
  reactions_count BIGINT,
  voice_reactions_count BIGINT,
  shares_count BIGINT,
  comments_count BIGINT,
  avg_completion_percentage NUMERIC,
  engagement_score NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH clip_metrics AS (
    SELECT 
      c.id as clip_id,
      c.title,
      c.created_at,
      c.listens_count,
      c.duration_seconds,
      (SELECT COUNT(*) FROM public.clip_reactions cr WHERE cr.clip_id = c.id) as reactions_count,
      (SELECT COUNT(*) FROM public.voice_reactions vr WHERE vr.clip_id = c.id) as voice_reactions_count,
      (SELECT COUNT(*) FROM public.clip_shares cs WHERE cs.clip_id = c.id) as shares_count,
      (SELECT COUNT(*) FROM public.comments cm WHERE cm.clip_id = c.id) as comments_count,
      COALESCE(
        AVG(
          CASE 
            WHEN l.completion_percentage IS NOT NULL THEN l.completion_percentage
            WHEN c.duration_seconds > 0 THEN (l.seconds::NUMERIC / c.duration_seconds::NUMERIC * 100)
            ELSE 0
          END
        ),
        0
      ) as avg_completion_percentage
    FROM public.clips c
    LEFT JOIN public.listens l ON l.clip_id = c.id
    WHERE c.profile_id = p_profile_id
      AND c.status = 'live'
    GROUP BY c.id, c.title, c.created_at, c.listens_count, c.duration_seconds
  )
  SELECT 
    cm.clip_id,
    cm.title,
    cm.created_at,
    cm.listens_count,
    cm.reactions_count::BIGINT,
    cm.voice_reactions_count::BIGINT,
    cm.shares_count::BIGINT,
    cm.comments_count::BIGINT,
    cm.avg_completion_percentage,
    -- Engagement score: weighted combination of metrics
    (
      cm.listens_count * 1.0 +
      cm.reactions_count * 2.0 +
      cm.voice_reactions_count * 3.0 +
      cm.shares_count * 2.5 +
      cm.comments_count * 2.0 +
      cm.avg_completion_percentage * 0.1
    ) as engagement_score
  FROM clip_metrics cm
  ORDER BY engagement_score DESC
  LIMIT p_limit;
END;
$$;

-- Function: Get growth trends (followers, engagement over time)
CREATE OR REPLACE FUNCTION public.get_creator_growth_trends(
  p_profile_id UUID,
  p_days INT DEFAULT 30
)
RETURNS TABLE (
  date DATE,
  new_followers INT,
  total_followers INT,
  new_listens BIGINT,
  new_reactions BIGINT,
  new_voice_reactions BIGINT,
  new_shares BIGINT,
  engagement_rate NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH date_range AS (
    SELECT generate_series(
      CURRENT_DATE - (p_days || ' days')::INTERVAL,
      CURRENT_DATE,
      '1 day'::INTERVAL
    )::DATE as date
  ),
  daily_follows AS (
    SELECT 
      DATE(created_at) as date,
      COUNT(*) as new_followers
    FROM public.follows
    WHERE following_id = p_profile_id
      AND created_at >= CURRENT_DATE - (p_days || ' days')::INTERVAL
    GROUP BY DATE(created_at)
  ),
  daily_listens AS (
    SELECT 
      DATE(l.listened_at) as date,
      COUNT(*) as new_listens
    FROM public.listens l
    INNER JOIN public.clips c ON c.id = l.clip_id
    WHERE c.profile_id = p_profile_id
      AND l.listened_at >= CURRENT_DATE - (p_days || ' days')::INTERVAL
    GROUP BY DATE(l.listened_at)
  ),
  daily_reactions AS (
    SELECT 
      DATE(cr.created_at) as date,
      COUNT(*) as new_reactions
    FROM public.clip_reactions cr
    INNER JOIN public.clips c ON c.id = cr.clip_id
    WHERE c.profile_id = p_profile_id
      AND cr.created_at >= CURRENT_DATE - (p_days || ' days')::INTERVAL
    GROUP BY DATE(cr.created_at)
  ),
  daily_voice_reactions AS (
    SELECT 
      DATE(vr.created_at) as date,
      COUNT(*) as new_voice_reactions
    FROM public.voice_reactions vr
    INNER JOIN public.clips c ON c.id = vr.clip_id
    WHERE c.profile_id = p_profile_id
      AND vr.created_at >= CURRENT_DATE - (p_days || ' days')::INTERVAL
    GROUP BY DATE(vr.created_at)
  ),
  daily_shares AS (
    SELECT 
      DATE(cs.shared_at) as date,
      COUNT(*) as new_shares
    FROM public.clip_shares cs
    INNER JOIN public.clips c ON c.id = cs.clip_id
    WHERE c.profile_id = p_profile_id
      AND cs.shared_at >= CURRENT_DATE - (p_days || ' days')::INTERVAL
    GROUP BY DATE(cs.shared_at)
  ),
  follower_counts AS (
    SELECT 
      date,
      SUM(new_followers) OVER (ORDER BY date) as total_followers
    FROM (
      SELECT date, COALESCE(new_followers, 0) as new_followers
      FROM date_range
      LEFT JOIN daily_follows USING (date)
    ) t
  )
  SELECT 
    dr.date,
    COALESCE(df.new_followers, 0)::INT as new_followers,
    COALESCE(fc.total_followers, 0)::INT as total_followers,
    COALESCE(dl.new_listens, 0)::BIGINT as new_listens,
    COALESCE(dr2.new_reactions, 0)::BIGINT as new_reactions,
    COALESCE(dvr.new_voice_reactions, 0)::BIGINT as new_voice_reactions,
    COALESCE(ds.new_shares, 0)::BIGINT as new_shares,
    CASE 
      WHEN COALESCE(dl.new_listens, 0) > 0 THEN
        ((COALESCE(dr2.new_reactions, 0) + COALESCE(dvr.new_voice_reactions, 0) + COALESCE(ds.new_shares, 0))::NUMERIC / dl.new_listens::NUMERIC * 100)
      ELSE 0
    END as engagement_rate
  FROM date_range dr
  LEFT JOIN daily_follows df ON df.date = dr.date
  LEFT JOIN follower_counts fc ON fc.date = dr.date
  LEFT JOIN daily_listens dl ON dl.date = dr.date
  LEFT JOIN daily_reactions dr2 ON dr2.date = dr.date
  LEFT JOIN daily_voice_reactions dvr ON dvr.date = dr.date
  LEFT JOIN daily_shares ds ON ds.date = dr.date
  ORDER BY dr.date;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_clip_listen_through_rates(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_creator_engagement_metrics(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_creator_audience_insights(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_clip_performance_comparison(UUID, INT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_creator_growth_trends(UUID, INT) TO authenticated, anon;

