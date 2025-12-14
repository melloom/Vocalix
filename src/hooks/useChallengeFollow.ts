import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from './useProfile';
import { logError, logWarn } from '@/lib/logger';

export const useChallengeFollow = (challengeId: string | null) => {
  const { profile: currentProfile } = useProfile();
  const queryClient = useQueryClient();

  // Check if current user is following the challenge
  const {
    data: isFollowing,
    isLoading: isLoadingFollowStatus,
    refetch: refetchFollowStatus,
  } = useQuery({
    queryKey: ['challenge-follow', currentProfile?.id, challengeId],
    queryFn: async () => {
      if (!currentProfile?.id || !challengeId) return false;

      const { data, error } = await supabase
        .from('challenge_follows')
        .select('id')
        .eq('profile_id', currentProfile.id)
        .eq('challenge_id', challengeId)
        .maybeSingle();

      if (error) throw error;
      return !!data;
    },
    enabled: !!currentProfile?.id && !!challengeId,
  });

  // Follow mutation
  const followMutation = useMutation({
    mutationFn: async () => {
      if (!currentProfile?.id || !challengeId) {
        throw new Error('Missing profile or challenge');
      }

      const { error } = await supabase
        .from('challenge_follows')
        .insert({
          profile_id: currentProfile.id,
          challenge_id: challengeId,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['challenge-follow', currentProfile?.id] });
      queryClient.invalidateQueries({ queryKey: ['challenge-follow', currentProfile?.id, challengeId] });
      queryClient.invalidateQueries({ queryKey: ['challenge', challengeId] });
      queryClient.invalidateQueries({ queryKey: ['followed-challenges', currentProfile?.id] });
    },
  });

  // Unfollow mutation
  const unfollowMutation = useMutation({
    mutationFn: async () => {
      if (!currentProfile?.id || !challengeId) {
        throw new Error('Missing profile or challenge');
      }

      const { error } = await supabase
        .from('challenge_follows')
        .delete()
        .eq('profile_id', currentProfile.id)
        .eq('challenge_id', challengeId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['challenge-follow', currentProfile?.id] });
      queryClient.invalidateQueries({ queryKey: ['challenge-follow', currentProfile?.id, challengeId] });
      queryClient.invalidateQueries({ queryKey: ['challenge', challengeId] });
      queryClient.invalidateQueries({ queryKey: ['followed-challenges', currentProfile?.id] });
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

// Hook to get list of challenges the current user follows
export const useFollowedChallenges = () => {
  const { profile: currentProfile } = useProfile();

  const {
    data: followedChallenges,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['followed-challenges', currentProfile?.id],
    queryFn: async () => {
      if (!currentProfile?.id) return [];

      try {
        const { data: followsData, error: followsError } = await supabase
          .from('challenge_follows')
          .select(`
            challenge_id,
            created_at,
            challenges (
              id,
              title,
              description,
              start_date,
              end_date,
              is_active,
              topic_id,
              topics (
                id,
                title,
                date
              )
            )
          `)
          .eq('profile_id', currentProfile.id)
          .order('created_at', { ascending: false });

        if (followsError) {
          if (followsError.code === 403 || followsError.code === "403" || followsError.code === "PGRST301") {
            logWarn("Access denied loading challenge follows (RLS)", followsError);
            return [];
          }
          throw followsError;
        }

        return (followsData || [])
          .map((follow: any) => ({
            ...follow.challenges,
            followed_at: follow.created_at,
          }))
          .filter((challenge: any) => challenge.id); // Filter out null challenges
      } catch (error: any) {
        logError("Error loading followed challenges", error);
        return [];
      }
    },
    enabled: !!currentProfile?.id,
  });

  return {
    followedChallenges: followedChallenges ?? [],
    isLoading,
    error,
  };
};

