-- Backend Functions for 18+ Space
-- Provides optimized queries for top creators, statistics, recent activity, etc.

-- ============================================================================
-- 1. GET TOP CREATORS FOR 18+ CONTENT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_18plus_top_creators(
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  profile_id UUID,
  handle TEXT,
  emoji_avatar TEXT,
  clips_count BIGINT,
  total_listens BIGINT,
  rank BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id AS profile_id,
    p.handle,
    p.emoji_avatar,
    COUNT(c.id)::BIGINT AS clips_count,
    COALESCE(SUM(c.listens_count), 0)::BIGINT AS total_listens,
    ROW_NUMBER() OVER (ORDER BY COALESCE(SUM(c.listens_count), 0) DESC, COUNT(c.id) DESC) AS rank
  FROM public.profiles p
  INNER JOIN public.clips c ON c.profile_id = p.id
  WHERE c.status = 'live'
    AND c.content_rating = 'sensitive'
    AND c.profile_id IS NOT NULL
  GROUP BY p.id, p.handle, p.emoji_avatar
  HAVING COUNT(c.id) > 0
  ORDER BY total_listens DESC, clips_count DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_18plus_top_creators TO authenticated, anon;

-- ============================================================================
-- 2. GET 18+ SPACE STATISTICS (Daily/Weekly/Monthly)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_18plus_statistics(
  p_days INTEGER DEFAULT 7
)
RETURNS TABLE (
  date DATE,
  clips_count BIGINT,
  posts_count BIGINT,
  total_listens BIGINT,
  total_views BIGINT
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
      DATE(c.created_at) AS date,
      COUNT(*)::BIGINT AS clips_count,
      COALESCE(SUM(c.listens_count), 0)::BIGINT AS total_listens
    FROM public.clips c
    WHERE c.status = 'live'
      AND c.content_rating = 'sensitive'
      AND DATE(c.created_at) >= CURRENT_DATE - (p_days - 1)::INTEGER
    GROUP BY DATE(c.created_at)
  ),
  posts_by_date AS (
    SELECT 
      DATE(p.created_at) AS date,
      COUNT(*)::BIGINT AS posts_count,
      COALESCE(SUM(p.view_count), 0)::BIGINT AS total_views
    FROM public.posts p
    WHERE p.status = 'live'
      AND p.is_nsfw = true
      AND p.deleted_at IS NULL
      AND DATE(p.created_at) >= CURRENT_DATE - (p_days - 1)::INTEGER
    GROUP BY DATE(p.created_at)
  )
  SELECT 
    dr.date,
    COALESCE(c.clips_count, 0)::BIGINT AS clips_count,
    COALESCE(po.posts_count, 0)::BIGINT AS posts_count,
    COALESCE(c.total_listens, 0)::BIGINT AS total_listens,
    COALESCE(po.total_views, 0)::BIGINT AS total_views
  FROM date_range dr
  LEFT JOIN clips_by_date c ON c.date = dr.date
  LEFT JOIN posts_by_date po ON po.date = dr.date
  ORDER BY dr.date ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_18plus_statistics TO authenticated, anon;

-- ============================================================================
-- 3. GET RECENT ACTIVITY FOR 18+ SPACE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_18plus_recent_activity(
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  type TEXT,
  title TEXT,
  created_at TIMESTAMPTZ,
  profile_handle TEXT,
  profile_emoji TEXT,
  metric_value BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH clips_activity AS (
    SELECT 
      c.id,
      'clip'::TEXT AS type,
      COALESCE(c.title, c.captions) AS title,
      c.created_at,
      p.handle AS profile_handle,
      p.emoji_avatar AS profile_emoji,
      COALESCE(c.listens_count, 0)::BIGINT AS metric_value
    FROM public.clips c
    INNER JOIN public.profiles p ON p.id = c.profile_id
    WHERE c.status = 'live'
      AND c.content_rating = 'sensitive'
      AND c.profile_id IS NOT NULL
    ORDER BY c.created_at DESC
    LIMIT p_limit
  ),
  posts_activity AS (
    SELECT 
      p.id,
      'post'::TEXT AS type,
      COALESCE(p.title, LEFT(p.content, 50)) AS title,
      p.created_at,
      pr.handle AS profile_handle,
      pr.emoji_avatar AS profile_emoji,
      COALESCE(p.view_count, 0)::BIGINT AS metric_value
    FROM public.posts p
    INNER JOIN public.profiles pr ON pr.id = p.profile_id
    WHERE p.status = 'live'
      AND p.is_nsfw = true
      AND p.deleted_at IS NULL
      AND p.profile_id IS NOT NULL
    ORDER BY p.created_at DESC
    LIMIT p_limit
  ),
  combined_activity AS (
    SELECT * FROM clips_activity
    UNION ALL
    SELECT * FROM posts_activity
  )
  SELECT 
    ca.id,
    ca.type,
    ca.title,
    ca.created_at,
    ca.profile_handle,
    ca.profile_emoji,
    ca.metric_value
  FROM combined_activity ca
  ORDER BY ca.created_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_18plus_recent_activity TO authenticated, anon;

-- ============================================================================
-- 4. GET POPULAR TAGS FOR 18+ CONTENT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_18plus_popular_tags(
  p_limit INTEGER DEFAULT 20,
  p_min_count INTEGER DEFAULT 2
)
RETURNS TABLE (
  tag TEXT,
  usage_count BIGINT,
  recent_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH tag_counts AS (
    SELECT 
      unnest(c.tags) AS tag,
      COUNT(*) AS usage_count,
      COUNT(*) FILTER (WHERE c.created_at > NOW() - INTERVAL '7 days') AS recent_count
    FROM public.clips c
    WHERE c.status = 'live'
      AND c.content_rating = 'sensitive'
      AND c.tags IS NOT NULL
      AND array_length(c.tags, 1) > 0
    GROUP BY unnest(c.tags)
    HAVING COUNT(*) >= p_min_count
  )
  SELECT 
    tc.tag,
    tc.usage_count,
    tc.recent_count
  FROM tag_counts tc
  ORDER BY tc.recent_count DESC, tc.usage_count DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_18plus_popular_tags TO authenticated, anon;

-- ============================================================================
-- 5. ENHANCE NSFW AUTO-TAGGING TRIGGER FOR POSTS
-- ============================================================================

-- Function to auto-tag posts as NSFW when content is detected
CREATE OR REPLACE FUNCTION public.auto_tag_post_nsfw()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_content_text TEXT;
  v_is_nsfw BOOLEAN := false;
  v_keyword_count INTEGER := 0;
BEGIN
  -- Combine title and content for analysis
  v_content_text := COALESCE(NEW.title || ' ', '') || COALESCE(NEW.content, '');
  
  -- Enhanced keyword detection for NSFW content (comprehensive patterns for free speech zone)
  -- Count matches across multiple keyword categories
  v_keyword_count := 0;
  
  IF v_content_text ~* '(sex|sexual|nude|naked|porn|xxx|nsfw|explicit|adult|18\+|mature|erotic|sexy|horny|orgasm|masturbat|fap|cum|sperm|ejaculat)' THEN
    v_keyword_count := v_keyword_count + 1;
  END IF;
  
  IF v_content_text ~* '(fuck|fucking|fucked|shit|damn|bitch|ass|dick|pussy|cock|tits|boobs|nipple|vagina|penis|clit|dildo|vibrator|kink|fetish|bdsm)' THEN
    v_keyword_count := v_keyword_count + 1;
  END IF;
  
  IF v_content_text ~* '(violence|gore|blood|death|kill|murder|torture|rape|abuse|assault|weapon|gun|knife)' THEN
    v_keyword_count := v_keyword_count + 1;
  END IF;
  
  IF v_content_text ~* '(drug|alcohol|drunk|high|stoned|weed|cocaine|heroin|meth|addiction|overdose)' THEN
    v_keyword_count := v_keyword_count + 1;
  END IF;
  
  -- If 2+ keyword categories found, mark as NSFW (lower threshold for free speech zone)
  IF v_keyword_count >= 2 THEN
    v_is_nsfw := true;
  END IF;
  
  -- Also check if explicitly marked or has strong single pattern match
  IF v_content_text ~* '(porn|nsfw|explicit|xxx|adult content)' THEN
    v_is_nsfw := true;
  END IF;
  
  -- If NSFW content detected, mark post
  IF v_is_nsfw THEN
    NEW.is_nsfw := true;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for posts
DROP TRIGGER IF EXISTS auto_tag_post_nsfw_trigger ON public.posts;
CREATE TRIGGER auto_tag_post_nsfw_trigger
  BEFORE INSERT OR UPDATE OF title, content, is_nsfw
  ON public.posts
  FOR EACH ROW
  WHEN (NEW.status = 'live' OR NEW.status = 'pending')
  EXECUTE FUNCTION public.auto_tag_post_nsfw();

-- ============================================================================
-- 6. ENHANCED NSFW DETECTION FUNCTION FOR CLIPS AND POSTS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.detect_and_tag_nsfw_content(
  p_content_type TEXT,
  p_content_id UUID,
  p_text_content TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_nsfw BOOLEAN := false;
  v_confidence NUMERIC := 0;
  v_keywords TEXT[] := ARRAY[
    -- Sexual content
    'sex', 'sexual', 'nsfw', 'nude', 'naked', 'porn', 'xxx', 'explicit', 'adult', '18+', 'mature',
    'erotic', 'sexy', 'horny', 'orgasm', 'masturbat', 'fap', 'cum', 'sperm', 'ejaculat',
    'kink', 'fetish', 'bdsm', 'submissive', 'dominant', 'slave', 'master',
    -- Explicit language
    'fuck', 'fucking', 'fucked', 'shit', 'damn', 'bitch', 'ass', 'dick', 'pussy', 'cock',
    'tits', 'boobs', 'nipple', 'vagina', 'penis', 'clit', 'dildo', 'vibrator', 'condom',
    -- Violence/gore
    'violence', 'gore', 'blood', 'death', 'kill', 'murder', 'torture', 'rape', 'abuse',
    'assault', 'weapon', 'gun', 'knife', 'slaughter', 'maimed', 'mutilat',
    -- Substance references
    'drug', 'alcohol', 'drunk', 'high', 'stoned', 'weed', 'cocaine', 'heroin', 'meth',
    'addiction', 'overdose', 'bong', 'joint', 'pills', 'oxy'
  ];
  v_keyword_count INTEGER := 0;
  v_result JSONB;
BEGIN
  IF p_text_content IS NULL OR TRIM(p_text_content) = '' THEN
    RETURN jsonb_build_object('is_nsfw', false, 'confidence', 0);
  END IF;
  
  -- Count keyword matches (case-insensitive)
  SELECT COUNT(*) INTO v_keyword_count
  FROM unnest(v_keywords) AS keyword
  WHERE LOWER(p_text_content) LIKE '%' || LOWER(keyword) || '%';
  
  -- Calculate confidence (0-1 scale)
  v_confidence := LEAST(v_keyword_count::NUMERIC / 5.0, 1.0);
  
  -- Lower threshold for free speech zone - be more inclusive
  -- If 1+ keyword found, consider it NSFW (very permissive for free speech)
  v_is_nsfw := v_keyword_count >= 1;
  
  -- If NSFW, update the content (lower confidence threshold for free speech)
  IF v_is_nsfw AND v_confidence >= 0.25 THEN
    IF p_content_type = 'clip' THEN
      UPDATE public.clips
      SET content_rating = 'sensitive'
      WHERE id = p_content_id;
    ELSIF p_content_type = 'post' THEN
      UPDATE public.posts
      SET is_nsfw = true
      WHERE id = p_content_id;
    END IF;
  END IF;
  
  RETURN jsonb_build_object(
    'is_nsfw', v_is_nsfw,
    'confidence', v_confidence,
    'keyword_count', v_keyword_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.detect_and_tag_nsfw_content TO authenticated, anon;

-- ============================================================================
-- 7. CREATE 18+ SPACE REGULATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.nsfw_space_regulations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_number INTEGER NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT CHECK (severity IN ('info', 'warning', 'critical')) DEFAULT 'info',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert minimal regulations for 18+ space
INSERT INTO public.nsfw_space_regulations (rule_number, title, description, severity) VALUES
(1, 'Age Restriction', 'You must be 18 years or older to access this space. Age verification is required.', 'critical'),
(2, 'Free Speech Zone', 'This is a free speech zone. Almost anything can be said here with minimal restrictions.', 'info'),
(3, 'No Illegal Content', 'Content must comply with applicable laws. Illegal content will be removed and reported.', 'critical'),
(4, 'No Non-Consensual Content', 'Non-consensual or exploitative content is strictly prohibited and will result in immediate ban.', 'critical'),
(5, 'Respect Community', 'While speech is free, harassment and targeted abuse may result in moderation.', 'warning'),
(6, 'User-Generated Content', 'All content is user-generated. Use discretion and report violations.', 'info')
ON CONFLICT (rule_number) DO NOTHING;

ALTER TABLE public.nsfw_space_regulations ENABLE ROW LEVEL SECURITY;

-- Everyone can read regulations
DROP POLICY IF EXISTS "nsfw_regulations_readable_by_all" ON public.nsfw_space_regulations;
CREATE POLICY "nsfw_regulations_readable_by_all"
ON public.nsfw_space_regulations FOR SELECT
USING (is_active = true);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_clips_nsfw_stats 
ON public.clips(content_rating, status, created_at) 
WHERE content_rating = 'sensitive' AND status = 'live';

CREATE INDEX IF NOT EXISTS idx_posts_nsfw_stats 
ON public.posts(is_nsfw, status, created_at) 
WHERE is_nsfw = true AND status = 'live' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_clips_profile_nsfw 
ON public.clips(profile_id, content_rating, status) 
WHERE content_rating = 'sensitive' AND status = 'live';

COMMENT ON FUNCTION public.get_18plus_top_creators IS 'Get top creators for 18+ content by listens and clips count';
COMMENT ON FUNCTION public.get_18plus_statistics IS 'Get daily statistics for 18+ space content';
COMMENT ON FUNCTION public.get_18plus_recent_activity IS 'Get recent activity feed for 18+ space';
COMMENT ON FUNCTION public.get_18plus_popular_tags IS 'Get popular tags used in 18+ content';
COMMENT ON FUNCTION public.detect_and_tag_nsfw_content IS 'Enhanced NSFW detection and auto-tagging function';

