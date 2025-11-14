import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cache, CACHE_TTL } from "@/utils/cache";

/**
 * Hook to fetch badge definitions with caching (1 hour TTL)
 */
export const useCachedBadges = (communityId?: string | null) => {
  const cacheKey = `badges_${communityId || 'global'}`;

  return useQuery({
    queryKey: ["badges", communityId],
    queryFn: async () => {
      // Check cache first
      const cached = cache.get<any[]>(cacheKey);
      if (cached) {
        return cached;
      }

      // Fetch from database
      let query = supabase
        .from("badges")
        .select("*")
        .order("criteria_value", { ascending: true })
        .limit(100);

      if (communityId) {
        query = query.eq("community_id", communityId);
      } else {
        query = query.is("community_id", null);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Cache the result
      if (data) {
        cache.set(cacheKey, data, CACHE_TTL.BADGE_DEFINITIONS);
      }

      return data || [];
    },
    staleTime: CACHE_TTL.BADGE_DEFINITIONS,
    gcTime: CACHE_TTL.BADGE_DEFINITIONS * 2, // Keep in cache for 2 hours
  });
};

