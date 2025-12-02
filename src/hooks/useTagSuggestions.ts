import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface TagSuggestion {
  tag: string;
  clip_count: number;
  recent_count?: number;
}

/**
 * Hook to fetch and manage tag suggestions for auto-complete
 */
export const useTagSuggestions = (searchQuery: string = "") => {
  const [suggestions, setSuggestions] = useState<TagSuggestion[]>([]);
  const [popularTags, setPopularTags] = useState<TagSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch popular tags (for initial suggestions)
  const fetchPopularTags = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase.rpc("get_popular_tags", {
        limit_count: 20,
        min_clip_count: 3,
      });

      if (error) throw error;
      setPopularTags(data || []);
    } catch (error) {
      console.error("Error fetching popular tags:", error);
      setPopularTags([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Search tags based on query
  const searchTags = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSuggestions([]);
      return;
    }

    try {
      setIsLoading(true);
      const { data, error } = await supabase.rpc("search_tags", {
        search_query: query.trim(),
        limit_count: 10,
      });

      if (error) throw error;
      setSuggestions(data || []);
    } catch (error) {
      console.error("Error searching tags:", error);
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load popular tags on mount
  useEffect(() => {
    fetchPopularTags();
  }, [fetchPopularTags]);

  // Search when query changes
  useEffect(() => {
    if (searchQuery.trim()) {
      searchTags(searchQuery);
    } else {
      setSuggestions([]);
    }
  }, [searchQuery, searchTags]);

  return {
    suggestions: searchQuery.trim() ? suggestions : popularTags,
    isLoading,
    refetch: fetchPopularTags,
  };
};

