import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from './useProfile';
import type { CommunityWithDetails } from './useCommunity';
import { logError, logWarn } from '@/lib/logger';

// Hook to check if user is following a community
export const useCommunityFollow = (communityId: string | null) => {
  const { profile: currentProfile } = useProfile();
  const queryClient = useQueryClient();

  const {
    data: isFollowing,
    isLoading: isLoadingFollowStatus,
    refetch: refetchFollowStatus,
  } = useQuery({
    queryKey: ['community-follow', currentProfile?.id, communityId],
    queryFn: async () => {
      if (!currentProfile?.id || !communityId) return false;

      const { data, error } = await supabase
        .from('community_follows')
        .select('id')
        .eq('profile_id', currentProfile.id)
        .eq('community_id', communityId)
        .maybeSingle();

      if (error) throw error;
      return !!data;
    },
    enabled: !!currentProfile?.id && !!communityId,
  });

  // Follow mutation
  const followMutation = useMutation({
    mutationFn: async () => {
      if (!currentProfile?.id || !communityId) {
        throw new Error('Missing profile or community');
      }

      const { error } = await supabase
        .from('community_follows')
        .insert({
          profile_id: currentProfile.id,
          community_id: communityId,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community-follow', currentProfile?.id] });
      queryClient.invalidateQueries({ queryKey: ['community-follow', currentProfile?.id, communityId] });
      queryClient.invalidateQueries({ queryKey: ['community', communityId] });
      queryClient.invalidateQueries({ queryKey: ['communities'] });
      queryClient.invalidateQueries({ queryKey: ['followed-communities', currentProfile?.id] });
    },
  });

  // Unfollow mutation
  const unfollowMutation = useMutation({
    mutationFn: async () => {
      if (!currentProfile?.id || !communityId) {
        throw new Error('Missing profile or community');
      }

      const { error } = await supabase
        .from('community_follows')
        .delete()
        .eq('profile_id', currentProfile.id)
        .eq('community_id', communityId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community-follow', currentProfile?.id] });
      queryClient.invalidateQueries({ queryKey: ['community-follow', currentProfile?.id, communityId] });
      queryClient.invalidateQueries({ queryKey: ['community', communityId] });
      queryClient.invalidateQueries({ queryKey: ['communities'] });
      queryClient.invalidateQueries({ queryKey: ['followed-communities', currentProfile?.id] });
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
    isFollowingCommunity: followMutation.isPending,
    isUnfollowingCommunity: unfollowMutation.isPending,
    followError: followMutation.error ?? null,
    unfollowError: unfollowMutation.error ?? null,
    refetchFollowStatus,
  };
};

// Hook to get list of communities the current user follows
export const useFollowedCommunities = () => {
  const { profile: currentProfile } = useProfile();

  const {
    data: followedCommunities,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['followed-communities', currentProfile?.id],
    queryFn: async () => {
      if (!currentProfile?.id) return [];

      try {
        // First get the community IDs
        const { data: followsData, error: followsError } = await supabase
          .from('community_follows')
          .select('community_id')
          .eq('profile_id', currentProfile.id)
          .order('created_at', { ascending: false });

        if (followsError) {
          if (followsError.code === 403 || followsError.code === "403" || followsError.code === "PGRST301") {
            logWarn("Access denied loading community follows (RLS)", followsError);
            return [];
          }
          throw followsError;
        }
        if (!followsData || followsData.length === 0) return [];

        const communityIds = followsData.map((f: any) => f.community_id);

        // Then get the communities
        const { data: communitiesData, error: communitiesError } = await supabase
          .from('communities')
          .select('*')
          .in('id', communityIds)
          .eq('is_active', true);

        if (communitiesError) {
          if (communitiesError.code === 403 || communitiesError.code === "403" || communitiesError.code === "PGRST301") {
            logWarn("Access denied loading communities (RLS)", communitiesError);
            return [];
          }
          throw communitiesError;
        }

        // Check memberships for current user
        const { data: memberships } = await supabase
          .from('community_members')
          .select('community_id')
          .eq('profile_id', currentProfile.id)
          .in('community_id', communityIds);

        const memberCommunityIds = new Set(memberships?.map((m) => m.community_id) || []);

        return (communitiesData || []).map((community: any) => ({
          ...community,
          is_member: memberCommunityIds.has(community.id),
          is_following: true, // All communities returned are followed
        })) as CommunityWithDetails[];
      } catch (error: any) {
        logError("Error loading followed communities", error);
        return [];
      }
    },
    enabled: !!currentProfile?.id,
    retry: false,
  });

  return {
    followedCommunities: followedCommunities || [],
    isLoading,
    error,
    refetch,
  };
};

// Hook to get follower count for a community
export const useCommunityFollowerCount = (communityId: string | null) => {
  const {
    data: count,
    isLoading,
  } = useQuery({
    queryKey: ['community-follower-count', communityId],
    queryFn: async () => {
      if (!communityId) return 0;

      const { count, error } = await supabase
        .from('community_follows')
        .select('*', { count: 'exact', head: true })
        .eq('community_id', communityId);

      if (error) throw error;
      return count || 0;
    },
    enabled: !!communityId,
  });

  return {
    count: count || 0,
    isLoading,
  };
};

