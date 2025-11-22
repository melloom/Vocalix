-- Fix get_daily_discovery function to ensure proper admin access
-- This ensures the function works correctly even with RLS policies

CREATE OR REPLACE FUNCTION public.get_daily_discovery(
  p_profile_id UUID,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  clip_id UUID,
  discovery_type TEXT,
  recommendation_reason TEXT,
  priority_score NUMERIC
) 
LANGUAGE plpgsql 
STABLE 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH discovery_sources AS (
    -- Hidden gems (30% of recommendations)
    SELECT 
      hg.clip_id,
      'hidden_gem' as discovery_type,
      hg.recommendation_reason,
      hg.quality_score * 10 as priority_score
    FROM public.get_hidden_gems(p_profile_id, GREATEST((p_limit * 0.3)::INTEGER, 1)) hg
    
    UNION ALL
    
    -- Trending in network (25% of recommendations)
    SELECT 
      tn.clip_id,
      'trending_network' as discovery_type,
      tn.recommendation_reason,
      tn.network_listens * 5 as priority_score
    FROM public.get_trending_in_network(p_profile_id, GREATEST((p_limit * 0.25)::INTEGER, 1)) tn
    
    UNION ALL
    
    -- Throwback clips (20% of recommendations)
    SELECT 
      tb.clip_id,
      'throwback' as discovery_type,
      tb.recommendation_reason,
      tb.engagement_score as priority_score
    FROM public.get_throwback_clips(p_profile_id, 30, 180, GREATEST((p_limit * 0.2)::INTEGER, 1)) tb
    
    UNION ALL
    
    -- Similar to clips user engaged with (25% of recommendations)
    -- Only include this if user has listens, otherwise skip
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
    LIMIT GREATEST((p_limit * 0.25)::INTEGER, 1)
  )
  SELECT 
    ds.clip_id,
    ds.discovery_type,
    ds.recommendation_reason,
    ds.priority_score
  FROM discovery_sources ds
  WHERE ds.clip_id IS NOT NULL -- Filter out null clip_ids
  ORDER BY ds.priority_score DESC
  LIMIT p_limit;
END;
$$;

-- Ensure proper grants
GRANT EXECUTE ON FUNCTION public.get_daily_discovery(UUID, INTEGER) TO authenticated, anon;

-- Add comment
COMMENT ON FUNCTION public.get_daily_discovery(UUID, INTEGER) IS 
'Returns personalized daily discovery recommendations. Uses SECURITY DEFINER to bypass RLS for admin access.';

