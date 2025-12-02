-- Migration: Enhanced Discovery Features
-- Implements smart recommendations, advanced discovery, and personalized discovery features
-- Based on FEATURE_SUGGESTIONS_AND_IMPROVEMENTS.md section 14

-- ============================================================================
-- SMART RECOMMENDATIONS
-- ============================================================================

-- Function: Get "Hidden Gems" - High quality, low visibility clips
CREATE OR REPLACE FUNCTION public.get_hidden_gems(
  p_profile_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  clip_id UUID,
  quality_score NUMERIC,
  visibility_score NUMERIC,
  recommendation_reason TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH scored_clips AS (
    SELECT 
      c.id,
      COALESCE(c.quality_score, 0) as quality_score,
      -- Visibility: based on listens, reactions, trending score
      COALESCE(
        (c.listens_count * 0.1) + 
        (COALESCE((SELECT SUM((value::text)::int) FROM jsonb_each(c.reactions)), 0) * 0.5) +
        (COALESCE(c.trending_score, 0) * 0.01),
        0
      ) as visibility_score,
      COALESCE(c.completion_rate, 0) as completion_rate
    FROM public.clips c
    WHERE c.status = 'live'
      AND c.quality_score >= 7.0 -- High quality threshold
      AND c.listens_count < 50 -- Low visibility threshold
      AND c.created_at > NOW() - INTERVAL '30 days' -- Recent
      AND (p_profile_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.listens l 
        WHERE l.clip_id = c.id AND l.profile_id = p_profile_id
      ))
  )
  SELECT 
    sc.id as clip_id,
    sc.quality_score,
    sc.visibility_score,
    'High quality clip with low visibility' as recommendation_reason
  FROM scored_clips sc
  ORDER BY sc.quality_score DESC, sc.completion_rate DESC, sc.visibility_score ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function: Get "Throwback" - Great clips from the past
CREATE OR REPLACE FUNCTION public.get_throwback_clips(
  p_profile_id UUID DEFAULT NULL,
  p_days_ago_min INTEGER DEFAULT 30,
  p_days_ago_max INTEGER DEFAULT 365,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  clip_id UUID,
  age_days INTEGER,
  engagement_score NUMERIC,
  recommendation_reason TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH throwback_clips AS (
    SELECT 
      c.id,
      EXTRACT(DAY FROM (NOW() - c.created_at))::INTEGER as age_days,
      -- Engagement score: listens, reactions, completion rate
      COALESCE(c.listens_count, 0) * 0.1 +
      COALESCE((SELECT SUM((value::text)::int) FROM jsonb_each(c.reactions)), 0) * 0.5 +
      COALESCE(c.completion_rate, 0) * 0.01 +
      COALESCE(c.trending_score, 0) * 0.001 as engagement_score,
      COALESCE(c.completion_rate, 0) as completion_rate
    FROM public.clips c
    WHERE c.status = 'live'
      AND c.created_at >= NOW() - (p_days_ago_max || ' days')::INTERVAL
      AND c.created_at <= NOW() - (p_days_ago_min || ' days')::INTERVAL
      AND c.listens_count >= 10 -- Minimum engagement threshold
      AND COALESCE(c.completion_rate, 0) >= 0.5 -- Good completion rate
      AND (p_profile_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.listens l 
        WHERE l.clip_id = c.id AND l.profile_id = p_profile_id
      ))
  )
  SELECT 
    tc.id as clip_id,
    tc.age_days,
    tc.engagement_score,
    CASE 
      WHEN tc.age_days >= 180 THEN 'Great clip from ' || (tc.age_days / 30)::INTEGER || ' months ago'
      WHEN tc.age_days >= 60 THEN 'Throwback from ' || (tc.age_days / 30)::INTEGER || ' months ago'
      ELSE 'From ' || tc.age_days || ' days ago'
    END as recommendation_reason
  FROM throwback_clips tc
  ORDER BY tc.engagement_score DESC, tc.completion_rate DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function: Get "Trending in your network" - What your network is listening to
CREATE OR REPLACE FUNCTION public.get_trending_in_network(
  p_profile_id UUID,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  clip_id UUID,
  network_listens INTEGER,
  recommendation_reason TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH user_network AS (
    -- Get users you follow
    SELECT following_id as profile_id
    FROM public.follows
    WHERE follower_id = p_profile_id
    UNION
    -- Get users who follow you (mutual connections)
    SELECT follower_id as profile_id
    FROM public.follows
    WHERE following_id = p_profile_id
  ),
  network_listens AS (
    SELECT 
      l.clip_id,
      COUNT(DISTINCT l.profile_id) as network_listens
    FROM public.listens l
    INNER JOIN user_network un ON l.profile_id = un.profile_id
    WHERE l.listened_at > NOW() - INTERVAL '7 days' -- Recent listens
      AND NOT EXISTS (
        SELECT 1 FROM public.listens l2 
        WHERE l2.clip_id = l.clip_id AND l2.profile_id = p_profile_id
      )
    GROUP BY l.clip_id
    HAVING COUNT(DISTINCT l.profile_id) >= 2 -- At least 2 network members listened
  )
  SELECT 
    c.id as clip_id,
    nl.network_listens,
    nl.network_listens || ' people in your network listened' as recommendation_reason
  FROM network_listens nl
  INNER JOIN public.clips c ON c.id = nl.clip_id
  WHERE c.status = 'live'
  ORDER BY nl.network_listens DESC, COALESCE(c.trending_score, 0) DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function: Get "New voices to discover" - Fresh creators to follow
CREATE OR REPLACE FUNCTION public.get_new_voices_to_discover(
  p_profile_id UUID,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  profile_id UUID,
  clips_count INTEGER,
  avg_quality_score NUMERIC,
  total_listens INTEGER,
  recommendation_reason TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH new_creators AS (
    SELECT 
      c.profile_id,
      COUNT(DISTINCT c.id) as clips_count,
      AVG(COALESCE(c.quality_score, 0)) as avg_quality_score,
      SUM(COALESCE(c.listens_count, 0)) as total_listens,
      MIN(c.created_at) as first_clip_date
    FROM public.clips c
    WHERE c.status = 'live'
      AND c.created_at > NOW() - INTERVAL '30 days' -- Recent clips
      AND c.profile_id != p_profile_id
      AND NOT EXISTS (
        SELECT 1 FROM public.follows f 
        WHERE f.follower_id = p_profile_id AND f.following_id = c.profile_id
      )
    GROUP BY c.profile_id
    HAVING COUNT(DISTINCT c.id) >= 3 -- At least 3 clips
      AND AVG(COALESCE(c.quality_score, 0)) >= 6.0 -- Good quality
      AND SUM(COALESCE(c.listens_count, 0)) < 200 -- Not too popular yet
  )
  SELECT 
    nc.profile_id,
    nc.clips_count,
    nc.avg_quality_score,
    nc.total_listens,
    CASE 
      WHEN nc.clips_count >= 10 THEN 'Active new creator with ' || nc.clips_count || ' clips'
      ELSE 'New voice with ' || nc.clips_count || ' quality clips'
    END as recommendation_reason
  FROM new_creators nc
  ORDER BY nc.avg_quality_score DESC, nc.clips_count DESC, nc.first_clip_date DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function: Get "Similar to [clip]" - Find similar content
CREATE OR REPLACE FUNCTION public.get_similar_clips(
  p_clip_id UUID,
  p_profile_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  clip_id UUID,
  similarity_score NUMERIC,
  similarity_reasons TEXT[]
) AS $$
DECLARE
  v_clip_record RECORD;
BEGIN
  -- Get the reference clip
  SELECT 
    c.id,
    c.topic_id,
    c.tags,
    c.profile_id,
    c.mood_emoji,
    c.detected_emotion,
    c.city,
    c.duration_seconds,
    c.voice_characteristics
  INTO v_clip_record
  FROM public.clips c
  WHERE c.id = p_clip_id AND c.status = 'live';
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  RETURN QUERY
  WITH similar_clips AS (
    SELECT 
      c.id,
      -- Calculate similarity score
      (
        CASE WHEN c.topic_id = v_clip_record.topic_id THEN 3.0 ELSE 0.0 END +
        CASE WHEN c.profile_id = v_clip_record.profile_id THEN 2.0 ELSE 0.0 END +
        CASE WHEN c.mood_emoji = v_clip_record.mood_emoji THEN 1.5 ELSE 0.0 END +
        CASE WHEN c.detected_emotion = v_clip_record.detected_emotion THEN 1.5 ELSE 0.0 END +
        CASE WHEN c.city = v_clip_record.city THEN 1.0 ELSE 0.0 END +
        CASE 
          WHEN ABS(c.duration_seconds - v_clip_record.duration_seconds) <= 5 THEN 1.0
          WHEN ABS(c.duration_seconds - v_clip_record.duration_seconds) <= 10 THEN 0.5
          ELSE 0.0
        END +
        -- Tag overlap
        COALESCE(
          (SELECT COUNT(*)::NUMERIC 
           FROM unnest(COALESCE(c.tags, ARRAY[]::TEXT[])) tag
           WHERE tag = ANY(COALESCE(v_clip_record.tags, ARRAY[]::TEXT[]))),
          0
        ) * 0.5
      ) as similarity_score,
      ARRAY[]::TEXT[] as reasons
    FROM public.clips c
    WHERE c.status = 'live'
      AND c.id != p_clip_id
      AND (p_profile_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.listens l 
        WHERE l.clip_id = c.id AND l.profile_id = p_profile_id
      ))
  )
  SELECT 
    sc.id as clip_id,
    sc.similarity_score,
    ARRAY[
      CASE WHEN EXISTS (
        SELECT 1 FROM public.clips c2 
        WHERE c2.id = sc.id AND c2.topic_id = v_clip_record.topic_id
      ) THEN 'Same topic' ELSE NULL END,
      CASE WHEN EXISTS (
        SELECT 1 FROM public.clips c2 
        WHERE c2.id = sc.id AND c2.profile_id = v_clip_record.profile_id
      ) THEN 'Same creator' ELSE NULL END,
      CASE WHEN EXISTS (
        SELECT 1 FROM public.clips c2 
        WHERE c2.id = sc.id AND c2.mood_emoji = v_clip_record.mood_emoji
      ) THEN 'Similar mood' ELSE NULL END
    ]::TEXT[] as similarity_reasons
  FROM similar_clips sc
  WHERE sc.similarity_score > 0
  ORDER BY sc.similarity_score DESC, (SELECT created_at FROM public.clips WHERE id = sc.id) DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================================
-- DISCOVERY FEATURES
-- ============================================================================

-- Function: Get daily discovery - Personalized daily recommendations
CREATE OR REPLACE FUNCTION public.get_daily_discovery(
  p_profile_id UUID,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  clip_id UUID,
  discovery_type TEXT,
  recommendation_reason TEXT,
  priority_score NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH discovery_sources AS (
    -- Hidden gems (30% of recommendations)
    SELECT 
      hg.clip_id,
      'hidden_gem' as discovery_type,
      hg.recommendation_reason,
      hg.quality_score * 10 as priority_score
    FROM public.get_hidden_gems(p_profile_id, (p_limit * 0.3)::INTEGER) hg
    
    UNION ALL
    
    -- Trending in network (25% of recommendations)
    SELECT 
      tn.clip_id,
      'trending_network' as discovery_type,
      tn.recommendation_reason,
      tn.network_listens * 5 as priority_score
    FROM public.get_trending_in_network(p_profile_id, (p_limit * 0.25)::INTEGER) tn
    
    UNION ALL
    
    -- Throwback clips (20% of recommendations)
    SELECT 
      tb.clip_id,
      'throwback' as discovery_type,
      tb.recommendation_reason,
      tb.engagement_score as priority_score
    FROM public.get_throwback_clips(p_profile_id, 30, 180, (p_limit * 0.2)::INTEGER) tb
    
    UNION ALL
    
    -- Similar to clips user engaged with (25% of recommendations)
    SELECT 
      sc.clip_id,
      'similar' as discovery_type,
      'Similar to clips you enjoyed' as recommendation_reason,
      sc.similarity_score * 2 as priority_score
    FROM public.listens l
    CROSS JOIN LATERAL public.get_similar_clips(l.clip_id, p_profile_id, 2) sc
    WHERE l.profile_id = p_profile_id
      AND l.completion_percentage >= 0.7 -- High engagement
      AND l.listened_at > NOW() - INTERVAL '7 days' -- Recent
    LIMIT (p_limit * 0.25)::INTEGER
  )
  SELECT 
    ds.clip_id,
    ds.discovery_type,
    ds.recommendation_reason,
    ds.priority_score
  FROM discovery_sources ds
  ORDER BY ds.priority_score DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function: Get weekly digest - Best clips of the week
CREATE OR REPLACE FUNCTION public.get_weekly_digest(
  p_profile_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  clip_id UUID,
  week_performance NUMERIC,
  digest_category TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH weekly_clips AS (
    SELECT 
      c.id,
      -- Week performance score
      COALESCE(c.listens_count, 0) * 0.1 +
      COALESCE((SELECT SUM((value::text)::int) FROM jsonb_each(c.reactions)), 0) * 0.5 +
      COALESCE(c.completion_rate, 0) * 0.01 +
      COALESCE(c.trending_score, 0) * 0.001 as week_performance,
      CASE 
        WHEN COALESCE(c.trending_score, 0) > 500 THEN 'trending'
        WHEN COALESCE(c.completion_rate, 0) > 0.8 THEN 'highly_engaging'
        WHEN COALESCE(c.quality_score, 0) > 8.0 THEN 'high_quality'
        ELSE 'popular'
      END as digest_category
    FROM public.clips c
    WHERE c.status = 'live'
      AND c.created_at >= NOW() - INTERVAL '7 days'
      AND (p_profile_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.listens l 
        WHERE l.clip_id = c.id AND l.profile_id = p_profile_id
      ))
  )
  SELECT 
    wc.id as clip_id,
    wc.week_performance,
    wc.digest_category
  FROM weekly_clips wc
  ORDER BY wc.week_performance DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function: Get topic suggestions - AI-suggested topics to explore
CREATE OR REPLACE FUNCTION public.get_topic_suggestions(
  p_profile_id UUID,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  topic_id UUID,
  title TEXT,
  clips_count INTEGER,
  trending_score NUMERIC,
  suggestion_reason TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH user_topics AS (
    -- Topics user has engaged with
    SELECT DISTINCT c.topic_id
    FROM public.listens l
    INNER JOIN public.clips c ON c.id = l.clip_id
    WHERE l.profile_id = p_profile_id
      AND l.completion_percentage >= 0.5
      AND c.topic_id IS NOT NULL
  ),
  suggested_topics AS (
    SELECT 
      t.id,
      t.title,
      t.clips_count,
      t.trending_score,
      CASE 
        WHEN t.trending_score > 100 THEN 'Trending topic'
        WHEN t.clips_count > 50 THEN 'Popular topic with many clips'
        WHEN NOT EXISTS (SELECT 1 FROM user_topics ut WHERE ut.topic_id = t.id) THEN 'New topic to explore'
        ELSE 'Similar to your interests'
      END as suggestion_reason
    FROM public.topics t
    WHERE t.is_active = true
      AND t.trending_score > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.topic_subscriptions ts 
        WHERE ts.profile_id = p_profile_id AND ts.topic_id = t.id
      )
  )
  SELECT 
    st.id as topic_id,
    st.title,
    st.clips_count,
    st.trending_score,
    st.suggestion_reason
  FROM suggested_topics st
  ORDER BY st.trending_score DESC, st.clips_count DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function: Get creator suggestions - Similar creators to follow
CREATE OR REPLACE FUNCTION public.get_creator_suggestions(
  p_profile_id UUID,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  profile_id UUID,
  handle TEXT,
  emoji_avatar TEXT,
  clips_count INTEGER,
  avg_quality_score NUMERIC,
  suggestion_reason TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH user_creators AS (
    -- Creators user has engaged with
    SELECT DISTINCT c.profile_id
    FROM public.listens l
    INNER JOIN public.clips c ON c.id = l.clip_id
    WHERE l.profile_id = p_profile_id
      AND l.completion_percentage >= 0.5
      AND c.profile_id IS NOT NULL
  ),
  suggested_creators AS (
    SELECT 
      p.id,
      p.handle,
      p.emoji_avatar,
      COUNT(DISTINCT c.id) as clips_count,
      AVG(COALESCE(c.quality_score, 0)) as avg_quality_score,
      CASE 
        WHEN COUNT(DISTINCT c.id) >= 20 THEN 'Active creator with many clips'
        WHEN AVG(COALESCE(c.quality_score, 0)) > 7.5 THEN 'High-quality content creator'
        WHEN COUNT(DISTINCT c.id) >= 10 THEN 'Regular creator'
        ELSE 'New creator to discover'
      END as suggestion_reason
    FROM public.profiles p
    INNER JOIN public.clips c ON c.profile_id = p.id
    WHERE c.status = 'live'
      AND p.id != p_profile_id
      AND NOT EXISTS (
        SELECT 1 FROM public.follows f 
        WHERE f.follower_id = p_profile_id AND f.following_id = p.id
      )
      AND (
        -- Similar topics
        EXISTS (
          SELECT 1 FROM user_creators uc
          INNER JOIN public.clips c2 ON c2.profile_id = uc.profile_id
          WHERE c2.topic_id = c.topic_id
        )
        OR
        -- Similar tags
        EXISTS (
          SELECT 1 FROM user_creators uc
          INNER JOIN public.clips c2 ON c2.profile_id = uc.profile_id
          WHERE c2.tags && c.tags
        )
      )
    GROUP BY p.id, p.handle, p.emoji_avatar
    HAVING COUNT(DISTINCT c.id) >= 3
  )
  SELECT 
    sc.id as profile_id,
    sc.handle,
    sc.emoji_avatar,
    sc.clips_count,
    sc.avg_quality_score,
    sc.suggestion_reason
  FROM suggested_creators sc
  ORDER BY sc.avg_quality_score DESC, sc.clips_count DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function: Get community suggestions - Communities you might like
CREATE OR REPLACE FUNCTION public.get_community_suggestions(
  p_profile_id UUID,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  community_id UUID,
  name TEXT,
  slug TEXT,
  avatar_emoji TEXT,
  member_count INTEGER,
  clips_count INTEGER,
  suggestion_reason TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH user_communities AS (
    -- Communities user is in
    SELECT DISTINCT cm.community_id
    FROM public.community_members cm
    WHERE cm.profile_id = p_profile_id
  ),
  user_topics AS (
    -- Topics user has engaged with
    SELECT DISTINCT c.topic_id
    FROM public.listens l
    INNER JOIN public.clips c ON c.id = l.clip_id
    WHERE l.profile_id = p_profile_id
      AND c.topic_id IS NOT NULL
  ),
  suggested_communities AS (
    SELECT 
      c.id,
      c.name,
      c.slug,
      c.avatar_emoji,
      (SELECT COUNT(*) FROM public.community_members cm WHERE cm.community_id = c.id) as member_count,
      (SELECT COUNT(*) FROM public.clips cl WHERE cl.community_id = c.id AND cl.status = 'live') as clips_count,
      CASE 
        WHEN EXISTS (
          SELECT 1 FROM public.topics t 
          WHERE t.community_id = c.id AND t.id = ANY(SELECT topic_id FROM user_topics)
        ) THEN 'Has topics you engage with'
        WHEN (SELECT COUNT(*) FROM public.community_members cm WHERE cm.community_id = c.id) > 100 THEN 'Popular community'
        WHEN (SELECT COUNT(*) FROM public.clips cl WHERE cl.community_id = c.id AND cl.status = 'live') > 50 THEN 'Active community'
        ELSE 'Community you might like'
      END as suggestion_reason
    FROM public.communities c
    WHERE c.is_public = true
      AND NOT EXISTS (
        SELECT 1 FROM user_communities uc WHERE uc.community_id = c.id
      )
  )
  SELECT 
    sc.id as community_id,
    sc.name,
    sc.slug,
    sc.avatar_emoji,
    sc.member_count,
    sc.clips_count,
    sc.suggestion_reason
  FROM suggested_communities sc
  ORDER BY sc.member_count DESC, sc.clips_count DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.get_hidden_gems(UUID, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_throwback_clips(UUID, INTEGER, INTEGER, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_trending_in_network(UUID, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_new_voices_to_discover(UUID, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_similar_clips(UUID, UUID, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_discovery(UUID, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_weekly_digest(UUID, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_topic_suggestions(UUID, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_creator_suggestions(UUID, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_community_suggestions(UUID, INTEGER) TO anon, authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION public.get_hidden_gems IS 'Returns high quality clips with low visibility (hidden gems)';
COMMENT ON FUNCTION public.get_throwback_clips IS 'Returns great clips from the past (throwback recommendations)';
COMMENT ON FUNCTION public.get_trending_in_network IS 'Returns clips trending in the user''s network (people they follow/followers)';
COMMENT ON FUNCTION public.get_new_voices_to_discover IS 'Returns fresh creators to follow';
COMMENT ON FUNCTION public.get_similar_clips IS 'Returns clips similar to a given clip based on topic, tags, mood, etc.';
COMMENT ON FUNCTION public.get_daily_discovery IS 'Returns personalized daily discovery recommendations';
COMMENT ON FUNCTION public.get_weekly_digest IS 'Returns best clips of the week';
COMMENT ON FUNCTION public.get_topic_suggestions IS 'Returns AI-suggested topics to explore';
COMMENT ON FUNCTION public.get_creator_suggestions IS 'Returns similar creators to follow';
COMMENT ON FUNCTION public.get_community_suggestions IS 'Returns communities you might like';

