import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from './useProfile';
import { logError, logWarn } from '@/lib/logger';

export const useTopicFollow = (topicId: string | null) => {
  const { profile: currentProfile } = useProfile();
  const queryClient = useQueryClient();

  // Check if current user is following the topic
  const {
    data: isFollowing,
    isLoading: isLoadingFollowStatus,
    refetch: refetchFollowStatus,
  } = useQuery({
    queryKey: ['topic-follow', currentProfile?.id, topicId],
    queryFn: async () => {
      if (!currentProfile?.id || !topicId) return false;

      const { data, error } = await supabase
        .from('topic_subscriptions')
        .select('id')
        .eq('profile_id', currentProfile.id)
        .eq('topic_id', topicId)
        .maybeSingle();

      if (error) throw error;
      return !!data;
    },
    enabled: !!currentProfile?.id && !!topicId,
  });

  // Follow mutation
  const followMutation = useMutation({
    mutationFn: async () => {
      if (!currentProfile?.id || !topicId) {
        throw new Error('Missing profile or topic');
      }

      const { error } = await supabase
        .from('topic_subscriptions')
        .insert({
          profile_id: currentProfile.id,
          topic_id: topicId,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['topic-follow', currentProfile?.id] });
      queryClient.invalidateQueries({ queryKey: ['topic-follow', currentProfile?.id, topicId] });
      queryClient.invalidateQueries({ queryKey: ['topic', topicId] });
      queryClient.invalidateQueries({ queryKey: ['followed-topics', currentProfile?.id] });
    },
  });

  // Unfollow mutation
  const unfollowMutation = useMutation({
    mutationFn: async () => {
      if (!currentProfile?.id || !topicId) {
        throw new Error('Missing profile or topic');
      }

      const { error } = await supabase
        .from('topic_subscriptions')
        .delete()
        .eq('profile_id', currentProfile.id)
        .eq('topic_id', topicId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['topic-follow', currentProfile?.id] });
      queryClient.invalidateQueries({ queryKey: ['topic-follow', currentProfile?.id, topicId] });
      queryClient.invalidateQueries({ queryKey: ['topic', topicId] });
      queryClient.invalidateQueries({ queryKey: ['followed-topics', currentProfile?.id] });
    },
  });

  const toggleFollow = () => {
    if (isFollowing) {
      unfollowMutation.mutate();
    } else {
      followMutation.mutate();
    }
  };

  return {
    isFollowing: isFollowing ?? false,
    isLoadingFollowStatus,
    toggleFollow,
    isToggling: followMutation.isPending || unfollowMutation.isPending,
    refetchFollowStatus,
  };
};

// Hook to get list of topics the current user follows
export const useFollowedTopics = () => {
  const { profile: currentProfile } = useProfile();

  const {
    data: followedTopics,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['followed-topics', currentProfile?.id],
    queryFn: async () => {
      if (!currentProfile?.id) return [];

      try {
        const { data: subscriptionsData, error: subscriptionsError } = await supabase
          .from('topic_subscriptions')
          .select(`
            topic_id,
            created_at,
            topics (
              id,
              title,
              date,
              description,
              is_active
            )
          `)
          .eq('profile_id', currentProfile.id)
          .order('created_at', { ascending: false });

        if (subscriptionsError) {
          if (subscriptionsError.code === 403 || subscriptionsError.code === "403" || subscriptionsError.code === "PGRST301") {
            logWarn("Access denied loading topic subscriptions (RLS)", subscriptionsError);
            return [];
          }
          throw subscriptionsError;
        }

        return (subscriptionsData || [])
          .map((sub: any) => ({
            ...sub.topics,
            subscribed_at: sub.created_at,
          }))
          .filter((topic: any) => topic.id); // Filter out null topics
      } catch (error: any) {
        logError("Error loading followed topics", error);
        return [];
      }
    },
    enabled: !!currentProfile?.id,
  });

  return {
    followedTopics: followedTopics ?? [],
    isLoading,
    error,
  };
};

