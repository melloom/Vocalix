-- Automated NSFW Analysis Triggers and Admin Reporting
-- Sets up automatic analysis on upload and comprehensive reporting for admin dashboard

-- ============================================================================
-- 1. CREATE NSFW ANALYSIS LOG TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.nsfw_analysis_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type TEXT NOT NULL CHECK (content_type IN ('clip', 'post', 'comment')),
  content_id UUID NOT NULL,
  is_nsfw BOOLEAN NOT NULL DEFAULT false,
  confidence NUMERIC(3,2) NOT NULL DEFAULT 0,
  detected_issues TEXT[],
  auto_tagged BOOLEAN NOT NULL DEFAULT false,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  analyzer_version TEXT DEFAULT '1.0',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT unique_content_analysis UNIQUE (content_type, content_id)
);

CREATE INDEX idx_nsfw_logs_content ON public.nsfw_analysis_logs(content_type, content_id);
CREATE INDEX idx_nsfw_logs_nsfw ON public.nsfw_analysis_logs(is_nsfw, analyzed_at) WHERE is_nsfw = true;
CREATE INDEX idx_nsfw_logs_analyzed_at ON public.nsfw_analysis_logs(analyzed_at DESC);

ALTER TABLE public.nsfw_analysis_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can read analysis logs
DROP POLICY IF EXISTS "nsfw_logs_readable_by_admins" ON public.nsfw_analysis_logs;
CREATE POLICY "nsfw_logs_readable_by_admins"
ON public.nsfw_analysis_logs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.admins
    WHERE profile_id = auth.uid()
  )
);

-- ============================================================================
-- 2. FUNCTION TO TRIGGER NSFW ANALYSIS VIA EDGE FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_nsfw_analysis(
  p_content_type TEXT,
  p_content_id UUID,
  p_text_content TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_supabase_url TEXT;
  v_access_code TEXT;
  v_response JSONB;
BEGIN
  -- Get Supabase URL and access code from environment
  v_supabase_url := current_setting('app.settings.supabase_url', true);
  IF v_supabase_url IS NULL OR v_supabase_url = '' THEN
    v_supabase_url := 'https://xgblxtopsapvacyaurcr.supabase.co';
  END IF;
  
  -- Get access code from secrets (will be set in edge function)
  v_access_code := current_setting('app.settings.nsfw_analyzer_access_code', true);
  
  -- Call the edge function asynchronously via pg_net (if available)
  -- For now, we'll use a simpler approach - log the analysis request
  -- The actual analysis will happen via database trigger calling detect_and_tag_nsfw_content
  
  -- Use the database function for immediate analysis
  SELECT detect_and_tag_nsfw_content(
    p_content_type,
    p_content_id,
    COALESCE(p_text_content, '')
  ) INTO v_response;
  
  -- Log the analysis result
  INSERT INTO public.nsfw_analysis_logs (
    content_type,
    content_id,
    is_nsfw,
    confidence,
    detected_issues,
    auto_tagged,
    analyzer_version
  )
  VALUES (
    p_content_type,
    p_content_id,
    (v_response->>'is_nsfw')::BOOLEAN,
    (v_response->>'confidence')::NUMERIC,
    ARRAY[]::TEXT[], -- Will be populated if we enhance the function
    (v_response->>'is_nsfw')::BOOLEAN,
    '1.0'
  )
  ON CONFLICT (content_type, content_id) 
  DO UPDATE SET
    is_nsfw = EXCLUDED.is_nsfw,
    confidence = EXCLUDED.confidence,
    auto_tagged = EXCLUDED.auto_tagged,
    analyzed_at = now();
    
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the transaction
    RAISE WARNING 'NSFW analysis failed for % %: %', p_content_type, p_content_id, SQLERRM;
END;
$$;

-- ============================================================================
-- 3. TRIGGER FUNCTION TO AUTO-ANALYZE CLIPS ON INSERT/UPDATE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_analyze_clip_nsfw()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_text_content TEXT;
BEGIN
  -- Only analyze when clip becomes live or when content changes
  IF (NEW.status = 'live' AND (OLD.status IS DISTINCT FROM 'live' OR OLD.captions IS DISTINCT FROM NEW.captions OR OLD.title IS DISTINCT FROM NEW.title)) THEN
    -- Combine title, summary, and captions for analysis
    v_text_content := COALESCE(NEW.title || ' ', '') || 
                      COALESCE(NEW.summary || ' ', '') || 
                      COALESCE(NEW.captions, '');
    
    -- Trigger analysis (non-blocking)
    PERFORM public.trigger_nsfw_analysis('clip', NEW.id, v_text_content);
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS auto_analyze_clip_nsfw_trigger ON public.clips;
CREATE TRIGGER auto_analyze_clip_nsfw_trigger
  AFTER INSERT OR UPDATE OF status, captions, title, summary
  ON public.clips
  FOR EACH ROW
  WHEN (NEW.status = 'live' OR NEW.status = 'processing')
  EXECUTE FUNCTION public.auto_analyze_clip_nsfw();

-- ============================================================================
-- 4. TRIGGER FUNCTION TO AUTO-ANALYZE POSTS ON INSERT/UPDATE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_analyze_post_nsfw()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_text_content TEXT;
BEGIN
  -- Only analyze when post becomes live or when content changes
  IF (NEW.status = 'live' AND (OLD.status IS DISTINCT FROM 'live' OR OLD.title IS DISTINCT FROM NEW.title OR OLD.content IS DISTINCT FROM NEW.content)) THEN
    -- Combine title and content for analysis
    v_text_content := COALESCE(NEW.title || ' ', '') || COALESCE(NEW.content, '');
    
    -- Trigger analysis (non-blocking)
    PERFORM public.trigger_nsfw_analysis('post', NEW.id, v_text_content);
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS auto_analyze_post_nsfw_trigger ON public.posts;
CREATE TRIGGER auto_analyze_post_nsfw_trigger
  AFTER INSERT OR UPDATE OF status, title, content
  ON public.posts
  FOR EACH ROW
  WHEN (NEW.status = 'live' OR NEW.status = 'pending')
  EXECUTE FUNCTION public.auto_analyze_post_nsfw();

-- ============================================================================
-- 5. ADMIN REPORTING FUNCTIONS FOR NSFW CONTENT
-- ============================================================================

-- Get NSFW statistics summary
CREATE OR REPLACE FUNCTION public.get_nsfw_statistics_summary(
  p_days INTEGER DEFAULT 7
)
RETURNS TABLE (
  total_nsfw_clips BIGINT,
  total_nsfw_posts BIGINT,
  nsfw_clips_today BIGINT,
  nsfw_posts_today BIGINT,
  auto_tagged_count BIGINT,
  high_confidence_count BIGINT,
  avg_confidence NUMERIC,
  top_creators JSONB,
  recent_detections JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH nsfw_clips AS (
    SELECT COUNT(*)::BIGINT AS total
    FROM public.clips
    WHERE content_rating = 'sensitive'
      AND status = 'live'
  ),
  nsfw_posts AS (
    SELECT COUNT(*)::BIGINT AS total
    FROM public.posts
    WHERE is_nsfw = true
      AND status = 'live'
      AND deleted_at IS NULL
  ),
  nsfw_clips_today AS (
    SELECT COUNT(*)::BIGINT AS total
    FROM public.clips
    WHERE content_rating = 'sensitive'
      AND status = 'live'
      AND DATE(created_at) = CURRENT_DATE
  ),
  nsfw_posts_today AS (
    SELECT COUNT(*)::BIGINT AS total
    FROM public.posts
    WHERE is_nsfw = true
      AND status = 'live'
      AND deleted_at IS NULL
      AND DATE(created_at) = CURRENT_DATE
  ),
  auto_tagged AS (
    SELECT COUNT(*)::BIGINT AS total
    FROM public.nsfw_analysis_logs
    WHERE auto_tagged = true
      AND analyzed_at >= CURRENT_DATE - (p_days || ' days')::INTERVAL
  ),
  high_confidence AS (
    SELECT COUNT(*)::BIGINT AS total
    FROM public.nsfw_analysis_logs
    WHERE confidence >= 0.7
      AND analyzed_at >= CURRENT_DATE - (p_days || ' days')::INTERVAL
  ),
  avg_conf AS (
    SELECT COALESCE(AVG(confidence), 0)::NUMERIC(5,2) AS avg
    FROM public.nsfw_analysis_logs
    WHERE is_nsfw = true
      AND analyzed_at >= CURRENT_DATE - (p_days || ' days')::INTERVAL
  ),
  top_creators_data AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'profile_id', p.id,
        'handle', p.handle,
        'emoji_avatar', p.emoji_avatar,
        'nsfw_clip_count', COUNT(c.id)
      ) ORDER BY COUNT(c.id) DESC
    ) AS creators
    FROM (
      SELECT DISTINCT c.profile_id
      FROM public.clips c
      WHERE c.content_rating = 'sensitive'
        AND c.status = 'live'
        AND c.created_at >= CURRENT_DATE - (p_days || ' days')::INTERVAL
      GROUP BY c.profile_id
      ORDER BY COUNT(*) DESC
      LIMIT 10
    ) top_profiles
    INNER JOIN public.profiles p ON p.id = top_profiles.profile_id
    INNER JOIN public.clips c ON c.profile_id = p.id AND c.content_rating = 'sensitive'
    GROUP BY p.id, p.handle, p.emoji_avatar
    LIMIT 10
  ),
  recent_data AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', log.id,
        'content_type', log.content_type,
        'content_id', log.content_id,
        'is_nsfw', log.is_nsfw,
        'confidence', log.confidence,
        'analyzed_at', log.analyzed_at
      ) ORDER BY log.analyzed_at DESC
    ) AS recent
    FROM public.nsfw_analysis_logs log
    WHERE log.analyzed_at >= CURRENT_DATE - (p_days || ' days')::INTERVAL
      AND log.is_nsfw = true
    ORDER BY log.analyzed_at DESC
    LIMIT 50
  )
  SELECT 
    (SELECT total FROM nsfw_clips),
    (SELECT total FROM nsfw_posts),
    (SELECT total FROM nsfw_clips_today),
    (SELECT total FROM nsfw_posts_today),
    (SELECT total FROM auto_tagged),
    (SELECT total FROM high_confidence),
    (SELECT avg FROM avg_conf),
    COALESCE((SELECT creators FROM top_creators_data), '[]'::jsonb),
    COALESCE((SELECT recent FROM recent_data), '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_nsfw_statistics_summary TO authenticated;

-- Get NSFW content by time period
CREATE OR REPLACE FUNCTION public.get_nsfw_content_timeline(
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  date DATE,
  clips_count BIGINT,
  posts_count BIGINT,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH date_range AS (
    SELECT generate_series(
      CURRENT_DATE - (p_days - 1)::INTEGER,
      CURRENT_DATE,
      '1 day'::INTERVAL
    )::DATE AS date
  ),
  clips_by_date AS (
    SELECT 
      DATE(created_at) AS date,
      COUNT(*)::BIGINT AS count
    FROM public.clips
    WHERE content_rating = 'sensitive'
      AND status = 'live'
      AND DATE(created_at) >= CURRENT_DATE - (p_days - 1)::INTEGER
    GROUP BY DATE(created_at)
  ),
  posts_by_date AS (
    SELECT 
      DATE(created_at) AS date,
      COUNT(*)::BIGINT AS count
    FROM public.posts
    WHERE is_nsfw = true
      AND status = 'live'
      AND deleted_at IS NULL
      AND DATE(created_at) >= CURRENT_DATE - (p_days - 1)::INTEGER
    GROUP BY DATE(created_at)
  )
  SELECT 
    dr.date,
    COALESCE(c.count, 0)::BIGINT AS clips_count,
    COALESCE(p.count, 0)::BIGINT AS posts_count,
    (COALESCE(c.count, 0) + COALESCE(p.count, 0))::BIGINT AS total_count
  FROM date_range dr
  LEFT JOIN clips_by_date c ON c.date = dr.date
  LEFT JOIN posts_by_date p ON p.date = dr.date
  ORDER BY dr.date ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_nsfw_content_timeline TO authenticated;

-- Get detailed NSFW content list for admin review
CREATE OR REPLACE FUNCTION public.get_nsfw_content_list(
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0,
  p_content_type TEXT DEFAULT NULL,
  p_min_confidence NUMERIC DEFAULT 0.0
)
RETURNS TABLE (
  id UUID,
  content_type TEXT,
  content_id UUID,
  is_nsfw BOOLEAN,
  confidence NUMERIC,
  auto_tagged BOOLEAN,
  analyzed_at TIMESTAMPTZ,
  title TEXT,
  creator_handle TEXT,
  creator_emoji TEXT,
  created_at TIMESTAMPTZ,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH clip_content AS (
    SELECT 
      log.id,
      'clip'::TEXT AS content_type,
      log.content_id,
      log.is_nsfw,
      log.confidence,
      log.auto_tagged,
      log.analyzed_at,
      c.title,
      p.handle AS creator_handle,
      p.emoji_avatar AS creator_emoji,
      c.created_at,
      c.status::TEXT
    FROM public.nsfw_analysis_logs log
    INNER JOIN public.clips c ON c.id = log.content_id
    INNER JOIN public.profiles p ON p.id = c.profile_id
    WHERE log.content_type = 'clip'
      AND log.is_nsfw = true
      AND log.confidence >= p_min_confidence
      AND (p_content_type IS NULL OR p_content_type = 'clip')
  ),
  post_content AS (
    SELECT 
      log.id,
      'post'::TEXT AS content_type,
      log.content_id,
      log.is_nsfw,
      log.confidence,
      log.auto_tagged,
      log.analyzed_at,
      po.title,
      pr.handle AS creator_handle,
      pr.emoji_avatar AS creator_emoji,
      po.created_at,
      po.status::TEXT
    FROM public.nsfw_analysis_logs log
    INNER JOIN public.posts po ON po.id = log.content_id
    INNER JOIN public.profiles pr ON pr.id = po.profile_id
    WHERE log.content_type = 'post'
      AND log.is_nsfw = true
      AND log.confidence >= p_min_confidence
      AND (p_content_type IS NULL OR p_content_type = 'post')
      AND po.deleted_at IS NULL
  )
  SELECT * FROM clip_content
  UNION ALL
  SELECT * FROM post_content
  ORDER BY analyzed_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_nsfw_content_list TO authenticated;

-- ============================================================================
-- 6. INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_nsfw_logs_analyzed ON public.nsfw_analysis_logs(analyzed_at DESC) WHERE is_nsfw = true;
CREATE INDEX IF NOT EXISTS idx_nsfw_logs_confidence ON public.nsfw_analysis_logs(confidence DESC) WHERE is_nsfw = true;
CREATE INDEX IF NOT EXISTS idx_clips_analysis_trigger ON public.clips(status, created_at) WHERE status IN ('live', 'processing');
CREATE INDEX IF NOT EXISTS idx_posts_analysis_trigger ON public.posts(status, created_at) WHERE status IN ('live', 'pending');

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.nsfw_analysis_logs IS 'Logs all NSFW content analysis results for admin reporting and monitoring';
COMMENT ON FUNCTION public.trigger_nsfw_analysis IS 'Triggers NSFW analysis for content (called automatically on upload)';
COMMENT ON FUNCTION public.get_nsfw_statistics_summary IS 'Get comprehensive NSFW statistics for admin dashboard';
COMMENT ON FUNCTION public.get_nsfw_content_timeline IS 'Get NSFW content timeline by day for charts';
COMMENT ON FUNCTION public.get_nsfw_content_list IS 'Get detailed list of NSFW content for admin review';

