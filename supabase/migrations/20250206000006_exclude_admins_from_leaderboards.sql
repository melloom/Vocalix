-- Exclude admins from all leaderboard functions
-- Admins should not appear in public leaderboards

-- 1. Update get_top_creators to exclude admins
CREATE OR REPLACE FUNCTION public.get_top_creators(
  p_period TEXT DEFAULT 'all_time',
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE(
  profile_id UUID,
  handle TEXT,
  emoji_avatar TEXT,
  clips_count BIGINT,
  total_listens BIGINT,
  reputation INTEGER,
  rank BIGINT
) AS $$
DECLARE
  v_start_date TIMESTAMPTZ;
BEGIN
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
    COUNT(c.id)::BIGINT AS clips_count,
    COALESCE(SUM(c.listens_count), 0)::BIGINT AS total_listens,
    COALESCE(p.reputation, 0) AS reputation,
    ROW_NUMBER() OVER (ORDER BY COUNT(c.id) DESC, COALESCE(SUM(c.listens_count), 0) DESC) AS rank
  FROM public.profiles p
  LEFT JOIN public.clips c ON c.profile_id = p.id 
    AND c.status = 'live'
    AND (p_period = 'all_time' OR c.created_at >= v_start_date)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.admins a WHERE a.profile_id = p.id
  )
  GROUP BY p.id, p.handle, p.emoji_avatar, p.reputation
  ORDER BY clips_count DESC, total_listens DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- 2. Update get_top_listeners to exclude admins
CREATE OR REPLACE FUNCTION public.get_top_listeners(
  p_period TEXT DEFAULT 'all_time',
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE(
  profile_id UUID,
  handle TEXT,
  emoji_avatar TEXT,
  listens_count BIGINT,
  rank BIGINT
) AS $$
DECLARE
  v_start_date TIMESTAMPTZ;
BEGIN
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
    COUNT(l.id)::BIGINT AS listens_count,
    ROW_NUMBER() OVER (ORDER BY COUNT(l.id) DESC) AS rank
  FROM public.profiles p
  LEFT JOIN public.listens l ON l.profile_id = p.id
    AND (p_period = 'all_time' OR l.listened_at >= v_start_date)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.admins a WHERE a.profile_id = p.id
  )
  GROUP BY p.id, p.handle, p.emoji_avatar
  ORDER BY listens_count DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- 3. Update get_top_reactors to exclude admins
CREATE OR REPLACE FUNCTION public.get_top_reactors(
  p_period TEXT DEFAULT 'all_time',
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE(
  profile_id UUID,
  handle TEXT,
  emoji_avatar TEXT,
  reactions_count BIGINT,
  rank BIGINT
) AS $$
DECLARE
  v_start_date TIMESTAMPTZ;
BEGIN
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
    COUNT(cr.id)::BIGINT AS reactions_count,
    ROW_NUMBER() OVER (ORDER BY COUNT(cr.id) DESC) AS rank
  FROM public.profiles p
  LEFT JOIN public.clip_reactions cr ON cr.profile_id = p.id
    AND (p_period = 'all_time' OR cr.created_at >= v_start_date)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.admins a WHERE a.profile_id = p.id
  )
  GROUP BY p.id, p.handle, p.emoji_avatar
  ORDER BY reactions_count DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- 4. Update get_top_streaks to exclude admins
CREATE OR REPLACE FUNCTION public.get_top_streaks(
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE(
  profile_id UUID,
  handle TEXT,
  emoji_avatar TEXT,
  current_streak_days INTEGER,
  longest_streak_days INTEGER,
  rank BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id AS profile_id,
    p.handle,
    p.emoji_avatar,
    COALESCE(p.current_streak_days, 0) AS current_streak_days,
    COALESCE(p.longest_streak_days, 0) AS longest_streak_days,
    ROW_NUMBER() OVER (ORDER BY COALESCE(p.current_streak_days, 0) DESC, COALESCE(p.longest_streak_days, 0) DESC) AS rank
  FROM public.profiles p
  WHERE (p.current_streak_days > 0 OR p.longest_streak_days > 0)
    AND NOT EXISTS (
      SELECT 1 FROM public.admins a WHERE a.profile_id = p.id
    )
  ORDER BY current_streak_days DESC, longest_streak_days DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_top_creators(TEXT, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_top_listeners(TEXT, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_top_reactors(TEXT, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_top_streaks(INTEGER) TO authenticated, anon;

