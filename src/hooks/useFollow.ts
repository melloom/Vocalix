import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from './useProfile';

export const useFollow = (targetProfileId: string | null) => {
  const { profile: currentProfile } = useProfile();
  const queryClient = useQueryClient();

  // Check if current user is following the target profile
  const {
    data: isFollowing,
    isLoading: isLoadingFollowStatus,
    refetch: refetchFollowStatus,
  } = useQuery({
    queryKey: ['follow', currentProfile?.id, targetProfileId],
    queryFn: async () => {
      if (!currentProfile?.id || !targetProfileId) return false;
      if (currentProfile.id === targetProfileId) return false; // Can't follow yourself

      const { data, error } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_id', currentProfile.id)
        .eq('following_id', targetProfileId)
        .maybeSingle();

      if (error) throw error;
      return !!data;
    },
    enabled: !!currentProfile?.id && !!targetProfileId && currentProfile.id !== targetProfileId,
  });

  // Follow mutation
  const followMutation = useMutation({
    mutationFn: async () => {
      if (!currentProfile?.id || !targetProfileId) {
        throw new Error('Missing profile or target profile');
      }
      if (currentProfile.id === targetProfileId) {
        throw new Error('Cannot follow yourself');
      }

      // Check if user can follow (rate limiting, cooldown)
      const { data: canFollow, error: canFollowError } = await supabase
        .rpc('can_follow_profile', {
          follower_id_param: currentProfile.id,
          following_id_param: targetProfileId,
        });

      if (canFollowError) throw canFollowError;
      if (!canFollow || canFollow.length === 0 || !canFollow[0].can_follow) {
        throw new Error(canFollow?.[0]?.reason || 'Cannot follow at this time');
      }

      const { error } = await supabase
        .from('follows')
        .insert({
          follower_id: currentProfile.id,
          following_id: targetProfileId,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['follow', currentProfile?.id] });
      queryClient.invalidateQueries({ queryKey: ['follow', currentProfile?.id, targetProfileId] });
      queryClient.invalidateQueries({ queryKey: ['following-feed', currentProfile?.id] });
      queryClient.invalidateQueries({ queryKey: ['activity-feed', currentProfile?.id] });
    },
  });

  // Unfollow mutation
  const unfollowMutation = useMutation({
    mutationFn: async () => {
      if (!currentProfile?.id || !targetProfileId) {
        throw new Error('Missing profile or target profile');
      }

      const { error } = await supabase
        .from('follows')
        .delete()
        .eq('follower_id', currentProfile.id)
        .eq('following_id', targetProfileId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['follow', currentProfile?.id] });
      queryClient.invalidateQueries({ queryKey: ['follow', currentProfile?.id, targetProfileId] });
      queryClient.invalidateQueries({ queryKey: ['following-feed', currentProfile?.id] });
      queryClient.invalidateQueries({ queryKey: ['activity-feed', currentProfile?.id] });
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
    isFollowingUser: followMutation.isPending,
    isUnfollowingUser: unfollowMutation.isPending,
    followError: followMutation.error ?? null,
    unfollowError: unfollowMutation.error ?? null,
    refetchFollowStatus,
  };
};

// Hook to get list of profiles the current user follows
export const useFollowing = () => {
  const { profile: currentProfile } = useProfile();

  const {
    data: following,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['following', currentProfile?.id],
    queryFn: async () => {
      if (!currentProfile?.id) return [];

      try {
        // First get the following IDs
        const { data: followsData, error: followsError } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', currentProfile.id);

        if (followsError) {
          // Silently handle 403 errors (RLS issues)
          if (followsError.code === 403 || followsError.code === "403" || followsError.code === "PGRST301") {
            console.warn("Access denied loading follows (RLS):", followsError);
            return [];
          }
          throw followsError;
        }
        if (!followsData || followsData.length === 0) return [];

        const followingIds = followsData.map((f: any) => f.following_id);

        // Then get the profiles
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, handle, emoji_avatar')
          .in('id', followingIds);

        if (profilesError) {
          // Silently handle 403 errors (RLS issues)
          if (profilesError.code === 403 || profilesError.code === "403" || profilesError.code === "PGRST301") {
            console.warn("Access denied loading profiles (RLS):", profilesError);
            return [];
          }
          throw profilesError;
        }

        return (profilesData || []).map((profile: any) => ({
          id: profile.id,
          profile: {
            id: profile.id,
            handle: profile.handle,
            emoji_avatar: profile.emoji_avatar,
          },
        }));
      } catch (error: any) {
        // Catch any other errors and return empty array to prevent crashes
        console.error("Error loading following list:", error);
        return [];
      }
    },
    enabled: !!currentProfile?.id,
    retry: false, // Don't retry on error to prevent infinite loops
  });

  return {
    following: following || [],
    isLoading,
    error,
  };
};

// Hook to get follower count for a profile
export const useFollowerCount = (profileId: string | null) => {
  const {
    data: count,
    isLoading,
  } = useQuery({
    queryKey: ['follower-count', profileId],
    queryFn: async () => {
      if (!profileId) return 0;

      const { count, error } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', profileId);

      if (error) throw error;
      return count || 0;
    },
    enabled: !!profileId,
  });

  return {
    count: count || 0,
    isLoading,
  };
};

// Hook to get following count for a profile
export const useFollowingCount = (profileId: string | null) => {
  const {
    data: count,
    isLoading,
  } = useQuery({
    queryKey: ['following-count', profileId],
    queryFn: async () => {
      if (!profileId) return 0;

      const { count, error } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', profileId);

      if (error) throw error;
      return count || 0;
    },
    enabled: !!profileId,
  });

  return {
    count: count || 0,
    isLoading,
  };
};

// Hook to get mutual follows between current user and target profile
export const useMutualFollows = (targetProfileId: string | null) => {
  const { profile: currentProfile } = useProfile();

  const {
    data: mutualFollows,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['mutual-follows', currentProfile?.id, targetProfileId],
    queryFn: async () => {
      if (!currentProfile?.id || !targetProfileId || currentProfile.id === targetProfileId) {
        return [];
      }

      try {
        // Get who current user follows
        const { data: currentFollowing, error: currentError } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', currentProfile.id);

        if (currentError) throw currentError;

        // Get who target user follows
        const { data: targetFollowing, error: targetError } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', targetProfileId);

        if (targetError) throw targetError;

        // Find mutual follows
        const currentFollowingIds = new Set((currentFollowing || []).map((f: any) => f.following_id));
        const mutualIds = (targetFollowing || [])
          .map((f: any) => f.following_id)
          .filter((id: string) => currentFollowingIds.has(id));

        if (mutualIds.length === 0) return [];

        // Get profile details for mutual follows
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, handle, emoji_avatar')
          .in('id', mutualIds)
          .limit(10); // Limit to 10 mutual follows for display

        if (profilesError) throw profilesError;

        return (profilesData || []).map((profile: any) => ({
          id: profile.id,
          handle: profile.handle,
          emoji_avatar: profile.emoji_avatar,
        }));
      } catch (error: any) {
        console.error("Error loading mutual follows:", error);
        return [];
      }
    },
    enabled: !!currentProfile?.id && !!targetProfileId && currentProfile.id !== targetProfileId,
  });

  return {
    mutualFollows: mutualFollows || [],
    isLoading,
    error,
  };
};

