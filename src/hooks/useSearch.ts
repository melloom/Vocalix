import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SearchFilters } from "@/components/AdvancedSearchFilters";

export interface SearchResult {
  clip_id: string;
  rank: number;
}

export interface SearchSuggestion {
  suggestion: string;
  source: "popular" | "recent";
  count: number;
}

export interface SearchHistoryItem {
  id: string;
  query: string;
  search_type: string;
  filters: Record<string, unknown>;
  result_count: number;
  created_at: string;
}

export interface SavedSearch {
  id: string;
  name: string;
  filters: SearchFilters;
  created_at: string;
}

export const useSearch = (profileId: string | null | undefined) => {
  const queryClient = useQueryClient();

  // Enhanced search with filters
  const searchClips = useMutation({
    mutationFn: async ({
      searchText,
      filters,
      limit = 100,
    }: {
      searchText?: string;
      filters?: Partial<SearchFilters>;
      limit?: number;
    }) => {
      const { data, error } = await supabase.rpc("search_clips_enhanced", {
        search_text: searchText || null,
        duration_min: filters?.durationMin || null,
        duration_max: filters?.durationMax || null,
        date_from: filters?.dateFrom ? new Date(filters.dateFrom).toISOString() : null,
        date_to: filters?.dateTo ? new Date(filters.dateTo).toISOString() : null,
        mood_emoji_filter: filters?.moodEmoji || null,
        city_filter: filters?.city || null,
        topic_id_filter: filters?.topicId || null,
        min_reactions: null, // Can be added later
        min_listens: null, // Can be added later
        quality_badge_filter: filters?.qualityBadge || null,
        emotion_filter: filters?.emotion || null,
        limit_results: limit,
      });

      if (error) throw error;
      return (data || []) as SearchResult[];
    },
  });

  // Save search to history
  const saveSearchHistory = useMutation({
    mutationFn: async ({
      query,
      searchType = "text",
      filters = {},
      resultCount = 0,
    }: {
      query: string;
      searchType?: string;
      filters?: Record<string, unknown>;
      resultCount?: number;
    }) => {
      if (!profileId || !query.trim()) return null;

      const { data, error } = await supabase
        .from("search_history")
        .insert({
          profile_id: profileId,
          query: query.trim(),
          search_type: searchType,
          filters,
          result_count: resultCount,
        })
        .select()
        .single();

      if (error) throw error;
      return data as SearchHistoryItem;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["searchHistory", profileId] });
      queryClient.invalidateQueries({ queryKey: ["searchSuggestions", profileId] });
    },
  });

  // Get search history
  const searchHistory = useQuery({
    queryKey: ["searchHistory", profileId],
    queryFn: async () => {
      if (!profileId) return [];

      const { data, error } = await supabase
        .from("search_history")
        .select("*")
        .eq("profile_id", profileId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      return (data || []) as SearchHistoryItem[];
    },
    enabled: !!profileId,
  });

  // Get search suggestions - function to call manually
  const getSearchSuggestions = useCallback(async (queryPrefix: string = "") => {
    const { data, error } = await supabase.rpc("get_search_suggestions", {
      user_profile_id: profileId || null,
      query_prefix: queryPrefix,
      limit_suggestions: 10,
    });

    if (error) throw error;
    return (data || []) as SearchSuggestion[];
  }, [profileId]);

  // Voice characteristics search - find similar voices
  const searchByVoiceCharacteristics = useMutation({
    mutationFn: async ({
      clipId,
      limit = 100,
    }: {
      clipId: string;
      limit?: number;
    }) => {
      const { data, error } = await supabase.rpc("find_similar_voices", {
        p_clip_id: clipId,
        p_limit: limit,
      });

      if (error) throw error;
      return (data || []).map((item) => ({
        clip_id: item.clip_id,
        rank: item.similarity_score || 0,
      })) as SearchResult[];
    },
  });

  // Semantic search improvements - enhanced text matching
  // This uses the enhanced search function which already includes better text matching
  // via PostgreSQL's full-text search with ranking
  const semanticSearch = useMutation({
    mutationFn: async ({
      query,
      filters,
      limit = 100,
    }: {
      query: string;
      filters?: Partial<SearchFilters>;
      limit?: number;
    }) => {
      // Use the enhanced search which already has semantic capabilities via full-text search
      const { data, error } = await supabase.rpc("search_clips_enhanced", {
        search_text: query,
        duration_min: filters?.durationMin || null,
        duration_max: filters?.durationMax || null,
        date_from: filters?.dateFrom ? new Date(filters.dateFrom).toISOString() : null,
        date_to: filters?.dateTo ? new Date(filters.dateTo).toISOString() : null,
        mood_emoji_filter: filters?.moodEmoji || null,
        city_filter: filters?.city || null,
        topic_id_filter: filters?.topicId || null,
        min_reactions: null,
        min_listens: null,
        quality_badge_filter: filters?.qualityBadge || null,
        emotion_filter: filters?.emotion || null,
        limit_results: limit,
      });

      if (error) throw error;
      return (data || []) as SearchResult[];
    },
  });

  // Get trending searches
  const trendingSearches = useQuery({
    queryKey: ["trendingSearches"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_trending_searches", {
        hours_back: 24,
        limit_results: 10,
      });

      if (error) throw error;
      return (data || []) as Array<{ query: string; search_count: number }>;
    },
  });

  // Delete search history item
  const deleteSearchHistory = useMutation({
    mutationFn: async (historyId: string) => {
      const { error } = await supabase
        .from("search_history")
        .delete()
        .eq("id", historyId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["searchHistory", profileId] });
    },
  });

  // Clear all search history
  const clearSearchHistory = useMutation({
    mutationFn: async () => {
      if (!profileId) return;

      const { error } = await supabase
        .from("search_history")
        .delete()
        .eq("profile_id", profileId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["searchHistory", profileId] });
    },
  });

  // Get saved searches
  const savedSearches = useQuery({
    queryKey: ["savedSearches", profileId],
    queryFn: async () => {
      if (!profileId) return [];

      const { data, error } = await supabase
        .from("saved_searches")
        .select("*")
        .eq("profile_id", profileId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []).map((item) => ({
        id: item.id,
        name: item.name,
        filters: item.filters as SearchFilters,
        created_at: item.created_at,
      })) as SavedSearch[];
    },
    enabled: !!profileId,
  });

  // Save a search
  const saveSearch = useMutation({
    mutationFn: async ({ name, filters }: { name: string; filters: SearchFilters }) => {
      if (!profileId) throw new Error("No profile ID");

      const { data, error } = await supabase
        .from("saved_searches")
        .insert({
          profile_id: profileId,
          name,
          filters: filters as unknown as Record<string, unknown>,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["savedSearches", profileId] });
    },
  });

  // Delete a saved search
  const deleteSavedSearch = useMutation({
    mutationFn: async (searchId: string) => {
      const { error } = await supabase
        .from("saved_searches")
        .delete()
        .eq("id", searchId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["savedSearches", profileId] });
    },
  });

  return {
    searchClips,
    saveSearchHistory,
    searchHistory,
    getSearchSuggestions,
    trendingSearches,
    deleteSearchHistory,
    clearSearchHistory,
    savedSearches,
    saveSearch,
    deleteSavedSearch,
    searchByVoiceCharacteristics, // Voice search (placeholder for future)
    semanticSearch, // Enhanced semantic search
  };
};

