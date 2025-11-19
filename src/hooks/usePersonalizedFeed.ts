import { useQuery } from '@tanstack/react-query';
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { logError } from '@/lib/logger';

// Utility function to detect device type
function getDeviceType(): string {
  if (typeof navigator === 'undefined') return 'desktop';
  const userAgent = navigator.userAgent.toLowerCase();
  if (/mobile|android|iphone|ipod/i.test(userAgent)) return 'mobile';
  if (/tablet|ipad/i.test(userAgent)) return 'tablet';
  return 'desktop';
}

interface PersonalizedClip {
  id: string;
  profile_id: string | null;
  audio_path: string;
  mood_emoji: string;
  duration_seconds: number;
  captions: string | null;
  summary: string | null;
  status: string;
  reactions: Record<string, number>;
  created_at: string;
  listens_count: number;
  waveform?: number[];
  city: string | null;
  completion_rate?: number | null;
  topic_id: string | null;
  title: string | null;
  tags: string[] | null;
  trending_score?: number | null;
  profiles: {
    handle: string;
    emoji_avatar: string;
  } | null;
  personal_relevance_score?: number;
  parent_clip_id?: string | null;
  reply_count?: number;
  remix_of_clip_id?: string | null;
  remix_count?: number;
  chain_id?: string | null;
  challenge_id?: string | null;
  is_podcast?: boolean;
}

export const usePersonalizedFeed = (limit: number = 50) => {
  const { profile } = useProfile();

  const { data: personalizedClips = [], isLoading, error } = useQuery({
    queryKey: ['personalized-feed', profile?.id, limit],
    queryFn: async () => {
      if (!profile?.id) {
        return [];
      }

      try {
        // Validate inputs
        if (!profile?.id || typeof profile.id !== 'string') {
          logError('usePersonalizedFeed', new Error('Invalid profile ID'));
          return await fallbackPersonalizedFeed(profile?.id || '', limit);
        }

        const validLimit = Number.isInteger(limit) && limit > 0 ? limit : 50;
        const validOffset = 0;
        const currentHour = new Date().getHours();
        const deviceType = getDeviceType();

        // Try enhanced feed first, fallback to basic feed if it doesn't exist
        let data, rpcError;
        try {
          const result = await supabase.rpc('get_enhanced_for_you_feed', {
            p_profile_id: profile.id,
            p_limit: validLimit,
            p_offset: validOffset,
            p_current_hour: currentHour,
            p_device_type: deviceType,
          });
          data = result.data;
          rpcError = result.error;
        } catch (err) {
          // If enhanced function doesn't exist, fall back to basic function
          const result = await supabase.rpc('get_for_you_feed', {
            p_profile_id: profile.id,
            p_limit: validLimit,
            p_offset: validOffset,
          });
          data = result.data;
          rpcError = result.error;
        }

        if (rpcError) {
          console.error('get_enhanced_for_you_feed error:', {
            code: rpcError.code,
            message: rpcError.message,
            details: rpcError.details,
            hint: rpcError.hint,
          });
          logError('usePersonalizedFeed RPC error', {
            error: rpcError,
            profileId: profile.id,
            limit: validLimit,
            offset: validOffset,
          });
          // Fallback to client-side calculation if RPC fails
          return await fallbackPersonalizedFeed(profile.id, validLimit);
        }

        if (!data || data.length === 0) {
          return [];
        }

        // Transform the data from the function result
        const clips: PersonalizedClip[] = data.map((item: any) => {
          const clipData = item.clip_data || item;
          
          // Extract profile data if it's nested
          let profiles = null;
          if (clipData.profiles) {
            profiles = clipData.profiles;
          }

          return {
            id: clipData.id,
            profile_id: clipData.profile_id,
            audio_path: clipData.audio_path,
            duration_seconds: clipData.duration_seconds,
            title: clipData.title,
            captions: clipData.captions,
            summary: clipData.summary,
            tags: clipData.tags,
            mood_emoji: clipData.mood_emoji,
            status: clipData.status,
            listens_count: clipData.listens_count || 0,
            reactions: clipData.reactions || {},
            created_at: clipData.created_at,
            topic_id: clipData.topic_id,
            completion_rate: clipData.completion_rate,
            trending_score: clipData.trending_score,
            city: clipData.city,
            parent_clip_id: clipData.parent_clip_id,
            reply_count: clipData.reply_count,
            remix_of_clip_id: clipData.remix_of_clip_id,
            remix_count: clipData.remix_count,
            chain_id: clipData.chain_id,
            challenge_id: clipData.challenge_id,
            is_podcast: clipData.is_podcast,
            profiles,
            personal_relevance_score: item.relevance_score || 0,
          };
        });

        // Fetch profile data for clips that don't have it
        const clipsNeedingProfiles = clips.filter(c => !c.profiles && c.profile_id);
        if (clipsNeedingProfiles.length > 0) {
          const profileIds = [...new Set(clipsNeedingProfiles.map(c => c.profile_id).filter(Boolean))];
          const { data: profilesData } = await supabase
            .from('profiles')
            .select('id, handle, emoji_avatar')
            .in('id', profileIds);

          if (profilesData) {
            const profilesMap = new Map(profilesData.map(p => [p.id, p]));
            clips.forEach(clip => {
              if (clip.profile_id && profilesMap.has(clip.profile_id) && !clip.profiles) {
                clip.profiles = profilesMap.get(clip.profile_id)!;
              }
            });
          }
        }

        return clips;
      } catch (err: any) {
        logError('usePersonalizedFeed', err);
        // Fallback to client-side calculation
        return await fallbackPersonalizedFeed(profile.id, limit);
      }
    },
    enabled: !!profile?.id,
    staleTime: 60000, // Consider data fresh for 1 minute
    gcTime: 300000, // Keep in cache for 5 minutes
  });

  return {
    personalizedClips,
    isLoading,
    error: error ? (error as Error).message : null,
    refetch: () => {}, // React Query handles refetching automatically
  };
};

// Fallback function for client-side calculation if RPC is unavailable
async function fallbackPersonalizedFeed(profileId: string, limit: number): Promise<PersonalizedClip[]> {
  try {
    // Step 1: Get topics user follows
    const { data: followedTopics } = await supabase
      .from("topic_subscriptions")
      .select("topic_id")
      .eq("profile_id", profileId);

    const followedTopicIds = followedTopics?.map((t) => t.topic_id) || [];

    // Step 2: Get clips from followed topics
    let topicClips: any[] = [];
    if (followedTopicIds.length > 0) {
      const { data: topicClipsData } = await supabase
        .from("clips")
        .select(
          `
          *,
          profiles (
            handle,
            emoji_avatar
          )
        `
        )
        .eq("status", "live")
        .in("topic_id", followedTopicIds)
        .limit(200);

      if (topicClipsData) {
        topicClips = topicClipsData;
      }
    }

    // Step 3: Get clips from creators user follows
    const { data: followsData } = await supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", profileId)
      .limit(100);

    const followingIds = followsData?.map((f) => f.following_id) || [];

    let followingClips: any[] = [];
    if (followingIds.length > 0) {
      const { data: followingClipsData } = await supabase
        .from("clips")
        .select(
          `
          *,
          profiles (
            handle,
            emoji_avatar
          )
        `
        )
        .eq("status", "live")
        .in("profile_id", followingIds)
        .order("created_at", { ascending: false })
        .limit(100);

      if (followingClipsData) {
        followingClips = followingClipsData;
      }
    }

    // Combine and score clips
    const allClips = [...topicClips, ...followingClips];

    // Remove duplicates
    const uniqueClips = Array.from(
      new Map(allClips.map((clip) => [clip.id, clip])).values()
    );

    // Calculate personal relevance scores
    const scoredClips = uniqueClips.map((clip) => {
      let personalScore = 0;

      // Boost for followed topics
      if (followedTopicIds.includes(clip.topic_id)) {
        personalScore += 0.4;
      }

      // Boost for followed creators
      if (followingIds.includes(clip.profile_id)) {
        personalScore += 0.3;
      }

      return {
        ...clip,
        personal_relevance_score: Math.min(1, personalScore),
      };
    });

    // Combine personal relevance with trending score
    const finalClips = scoredClips
      .map((clip) => {
        const trendingScore = clip.trending_score || 0;
        const personalScore = clip.personal_relevance_score || 0;
        const combinedScore = personalScore * 0.6 + (trendingScore / 1000) * 0.4;

        return {
          ...clip,
          combined_score: combinedScore,
        };
      })
      .sort((a, b) => (b.combined_score || 0) - (a.combined_score || 0))
      .slice(0, limit);

    return finalClips;
  } catch (err: any) {
    logError('fallbackPersonalizedFeed', err);
    return [];
  }
}
