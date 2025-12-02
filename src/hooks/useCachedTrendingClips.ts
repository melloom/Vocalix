import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cache, CACHE_TTL } from "@/utils/cache";

interface TrendingClipsParams {
  limit?: number;
  topicId?: string | null;
  city?: string | null;
}

/**
 * Hook to fetch trending clips with caching (5 min TTL)
 */
export const useCachedTrendingClips = (params: TrendingClipsParams = {}) => {
  const { limit = 100, topicId, city } = params;
  const cacheKey = `trending_clips_${topicId || 'all'}_${city || 'global'}_${limit}`;

  return useQuery({
    queryKey: ["trending-clips", topicId, city, limit],
    queryFn: async () => {
      // Check cache first
      const cached = cache.get<any[]>(cacheKey);
      if (cached) {
        return cached;
      }

      // Fetch from database
      let query = supabase
        .from("clips")
        .select(`
          *,
          profiles (
            handle,
            emoji_avatar
          )
        `)
        .eq("status", "live")
        .is("parent_clip_id", null)
        .order("trending_score", { ascending: false })
        .limit(limit);

      if (topicId) {
        query = query.eq("topic_id", topicId);
      }

      if (city) {
        query = query.eq("city", city);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Cache the result
      if (data) {
        cache.set(cacheKey, data, CACHE_TTL.TRENDING_CLIPS);
      }

      return data || [];
    },
    staleTime: CACHE_TTL.TRENDING_CLIPS,
    gcTime: CACHE_TTL.TRENDING_CLIPS * 2, // Keep in cache for 10 minutes
  });
};

