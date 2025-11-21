import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { logError } from "@/lib/logger";

export type FeedFilterType = 
  | "for_you" 
  | "best" 
  | "rising" 
  | "controversial" 
  | "top_by_topic" 
  | "from_city" 
  | "from_followed" 
  | "unheard";

export type TimePeriod = "hour" | "day" | "week" | "month" | "year" | "all";

interface FeedClip {
  clip_id: string;
  relevance_score?: number;
  score?: number;
  velocity_score?: number;
  controversy_score?: number;
  clip_data: {
    id: string;
    profile_id: string;
    audio_path: string;
    duration_seconds: number;
    title: string | null;
    captions: string | null;
    summary: string | null;
    tags: string[] | null;
    mood_emoji: string;
    status: string;
    listens_count: number;
    reactions: Record<string, number>;
    created_at: string;
    topic_id: string | null;
    completion_rate: number;
    trending_score: number | null;
    city: string | null;
    parent_clip_id: string | null;
    reply_count: number;
    remix_of_clip_id: string | null;
    remix_count: number;
    chain_id: string | null;
    challenge_id: string | null;
    is_podcast: boolean | null;
  };
}

interface UseFeedFiltersOptions {
  filterType: FeedFilterType;
  limit?: number;
  offset?: number;
  timePeriod?: TimePeriod;
  topicId?: string;
  city?: string;
}

export function useFeedFilters(options: UseFeedFiltersOptions) {
  const { profile } = useProfile();
  const { filterType, limit = 50, offset = 0, timePeriod = "day", topicId, city } = options;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["feed-filters", filterType, profile?.id, limit, offset, timePeriod, topicId, city],
    queryFn: async () => {
      if (!profile?.id && filterType !== "best" && filterType !== "rising" && filterType !== "controversial") {
        return [];
      }

      try {
        let result;

        switch (filterType) {
          case "best":
            result = await supabase.rpc("get_best_clips", {
              p_profile_id: profile?.id || null,
              p_time_period: timePeriod,
              p_limit: limit,
              p_offset: offset,
            });
            break;

          case "rising":
            result = await supabase.rpc("get_rising_clips", {
              p_profile_id: profile?.id || null,
              p_limit: limit,
              p_offset: offset,
            });
            break;

          case "controversial":
            result = await supabase.rpc("get_controversial_clips", {
              p_profile_id: profile?.id || null,
              p_limit: limit,
              p_offset: offset,
            });
            break;

          case "top_by_topic":
            if (!topicId) {
              return [];
            }
            result = await supabase.rpc("get_top_clips_by_topic", {
              p_profile_id: profile?.id || null,
              p_topic_id: topicId,
              p_limit: limit,
              p_offset: offset,
            });
            break;

          case "from_city":
            if (!city) {
              return [];
            }
            result = await supabase.rpc("get_clips_from_city", {
              p_profile_id: profile?.id || null,
              p_city: city,
              p_limit: limit,
              p_offset: offset,
            });
            break;

          case "from_followed":
            if (!profile?.id) {
              return [];
            }
            result = await supabase.rpc("get_clips_from_followed_creators", {
              p_profile_id: profile.id,
              p_limit: limit,
              p_offset: offset,
            });
            break;

          case "unheard":
            if (!profile?.id) {
              return [];
            }
            result = await supabase.rpc("get_unheard_clips", {
              p_profile_id: profile.id,
              p_limit: limit,
              p_offset: offset,
            });
            break;

          default:
            return [];
        }

        if (result.error) {
          logError("useFeedFilters", result.error);
          return [];
        }

        return (result.data || []) as FeedClip[];
      } catch (err) {
        logError("useFeedFilters", err);
        return [];
      }
    },
    enabled: filterType !== "top_by_topic" || !!topicId,
    staleTime: 30000, // 30 seconds
  });

  return {
    clips: data || [],
    isLoading,
    error,
    refetch,
  };
}

// Helper function to mute a topic
export async function muteTopic(profileId: string, topicId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("muted_topics")
      .insert({
        profile_id: profileId,
        topic_id: topicId,
      });

    if (error) {
      logError("muteTopic", error);
      return false;
    }

    return true;
  } catch (err) {
    logError("muteTopic", err);
    return false;
  }
}

// Helper function to unmute a topic
export async function unmuteTopic(profileId: string, topicId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("muted_topics")
      .delete()
      .eq("profile_id", profileId)
      .eq("topic_id", topicId);

    if (error) {
      logError("unmuteTopic", error);
      return false;
    }

    return true;
  } catch (err) {
    logError("unmuteTopic", err);
    return false;
  }
}

// Helper function to mute a creator
export async function muteCreator(profileId: string, creatorId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("muted_creators")
      .insert({
        profile_id: profileId,
        creator_id: creatorId,
      });

    if (error) {
      logError("muteCreator", error);
      return false;
    }

    return true;
  } catch (err) {
    logError("muteCreator", err);
    return false;
  }
}

// Helper function to unmute a creator
export async function unmuteCreator(profileId: string, creatorId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("muted_creators")
      .delete()
      .eq("profile_id", profileId)
      .eq("creator_id", creatorId);

    if (error) {
      logError("unmuteCreator", error);
      return false;
    }

    return true;
  } catch (err) {
    logError("unmuteCreator", err);
    return false;
  }
}

// Hook to get muted topics
export function useMutedTopics(profileId: string | undefined) {
  return useQuery({
    queryKey: ["muted-topics", profileId],
    queryFn: async () => {
      if (!profileId) return [];

      const { data, error } = await supabase
        .from("muted_topics")
        .select("topic_id")
        .eq("profile_id", profileId);

      if (error) {
        logError("useMutedTopics", error);
        return [];
      }

      return (data || []).map((item) => item.topic_id);
    },
    enabled: !!profileId,
  });
}

// Hook to get muted creators
export function useMutedCreators(profileId: string | undefined) {
  return useQuery({
    queryKey: ["muted-creators", profileId],
    queryFn: async () => {
      if (!profileId) return [];

      const { data, error } = await supabase
        .from("muted_creators")
        .select("creator_id")
        .eq("profile_id", profileId);

      if (error) {
        logError("useMutedCreators", error);
        return [];
      }

      return (data || []).map((item) => item.creator_id);
    },
    enabled: !!profileId,
  });
}

