import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from './useProfile';
import { useAdminStatus } from './useAdminStatus';

export interface Community {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  avatar_emoji: string;
  created_by_profile_id: string | null;
  successor_profile_id?: string | null;
  member_count: number;
  clip_count: number;
  follower_count?: number;
  is_public: boolean;
  is_visible_publicly?: boolean;
  is_active: boolean;
  guidelines: string | null;
  created_at: string;
  updated_at: string;
  is_voice_based?: boolean;
  voice_cluster_id?: string | null;
  voice_characteristics_summary?: {
    avg_pitch?: number;
    avg_speed?: number;
    common_tone?: string;
  } | null;
}

export interface CommunityWithDetails extends Community {
  is_member?: boolean;
  is_moderator?: boolean;
  is_creator?: boolean;
  is_following?: boolean;
}

// Hook to check community status (dead or alive)
export const useCommunityStatus = (communityId: string | null) => {
  return useQuery({
    queryKey: ['community-status', communityId],
    queryFn: async () => {
      if (!communityId) return null;

      const { data, error } = await supabase
        .rpc('check_community_status', { p_community_id: communityId });

      if (error) throw error;
      return data as { is_dead: boolean; member_count: number; has_creator: boolean } | null;
    },
    enabled: !!communityId,
  });
};

// Hook to check ownership transfer rate limits
export const useOwnershipTransferRateLimit = (profileId: string | null) => {
  return useQuery({
    queryKey: ['ownership-transfer-rate-limit', profileId],
    queryFn: async () => {
      if (!profileId) return null;

      const { data, error } = await supabase
        .rpc('check_ownership_transfer_rate_limit', { p_profile_id: profileId });

      if (error) throw error;
      return data as {
        allowed: boolean;
        reason: string;
        transfers_last_6_hours: number;
        transfers_last_day: number;
        transfers_last_week: number;
        communities_owned: number;
        account_age_days: number;
        hours_since_last_transfer: number | null;
        max_per_6_hours: number;
        max_per_day: number;
        max_per_week: number;
        max_total: number;
        min_account_age_days: number;
        min_hours_between_claims: number;
      } | null;
    },
    enabled: !!profileId,
  });
};

// Hook to transfer community ownership
export const useTransferCommunityOwnership = (communityId: string | null) => {
  const { profile: currentProfile } = useProfile();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!currentProfile?.id || !communityId) {
        throw new Error('Missing profile or community');
      }

      const { data, error } = await supabase
        .rpc('transfer_community_ownership', {
          p_community_id: communityId,
          p_new_owner_profile_id: currentProfile.id,
        });

      if (error) throw error;
      
      // Handle new JSON response format
      if (data && typeof data === 'object') {
        const result = data as { success: boolean; error?: string; message?: string };
        if (!result.success) {
          throw new Error(result.error || 'Failed to transfer ownership');
        }
        return result;
      }
      
      throw new Error('Invalid response from server');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community', communityId] });
      queryClient.invalidateQueries({ queryKey: ['community-status', communityId] });
      queryClient.invalidateQueries({ queryKey: ['communities'] });
      queryClient.invalidateQueries({ queryKey: ['community-membership', currentProfile?.id, communityId] });
      queryClient.invalidateQueries({ queryKey: ['ownership-transfer-rate-limit', currentProfile?.id] });
    },
  });
};

// Hook to check if user is a member of a community
export const useCommunityMembership = (communityId: string | null) => {
  const { profile: currentProfile } = useProfile();
  const queryClient = useQueryClient();

  const {
    data: isMember,
    isLoading: isLoadingMembership,
    refetch: refetchMembership,
  } = useQuery({
    queryKey: ['community-membership', currentProfile?.id, communityId],
    queryFn: async () => {
      if (!currentProfile?.id || !communityId) return false;

      const { data, error } = await supabase
        .from('community_members')
        .select('id')
        .eq('profile_id', currentProfile.id)
        .eq('community_id', communityId)
        .maybeSingle();

      if (error) throw error;
      return !!data;
    },
    enabled: !!currentProfile?.id && !!communityId,
  });

  // Join community mutation
  const joinMutation = useMutation({
    mutationFn: async () => {
      if (!currentProfile?.id || !communityId) {
        throw new Error('Missing profile or community');
      }

      const { error } = await supabase
        .from('community_members')
        .insert({
          profile_id: currentProfile.id,
          community_id: communityId,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community-membership', currentProfile?.id, communityId] });
      queryClient.invalidateQueries({ queryKey: ['community', communityId] });
      queryClient.invalidateQueries({ queryKey: ['community-status', communityId] });
      queryClient.invalidateQueries({ queryKey: ['communities'] });
      if (currentProfile?.id) {
        queryClient.invalidateQueries({ queryKey: ['followed-communities', currentProfile.id] });
      }
    },
  });

  // Leave community mutation
  const leaveMutation = useMutation({
    mutationFn: async () => {
      if (!currentProfile?.id || !communityId) {
        throw new Error('Missing profile or community');
      }

      const { error } = await supabase
        .from('community_members')
        .delete()
        .eq('profile_id', currentProfile.id)
        .eq('community_id', communityId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community-membership', currentProfile?.id, communityId] });
      queryClient.invalidateQueries({ queryKey: ['community', communityId] });
      queryClient.invalidateQueries({ queryKey: ['communities'] });
      if (currentProfile?.id) {
        queryClient.invalidateQueries({ queryKey: ['followed-communities', currentProfile.id] });
      }
    },
  });

  const toggleMembership = () => {
    if (isMember) {
      leaveMutation.mutate();
    } else {
      joinMutation.mutate();
    }
  };

  return {
    isMember: isMember ?? false,
    isLoadingMembership,
    toggleMembership,
    isJoining: joinMutation.isPending,
    isLeaving: leaveMutation.isPending,
    refetchMembership,
  };
};

// Hook to get a single community with details
export const useCommunity = (communityId: string | null) => {
  const { profile: currentProfile } = useProfile();
  const { isAdmin } = useAdminStatus();

  const {
    data: community,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['community', communityId, currentProfile?.id, isAdmin],
    queryFn: async () => {
      if (!communityId) return null;

      // Get community
      const { data: communityData, error: communityError } = await supabase
        .from('communities')
        .select('*')
        .eq('id', communityId)
        .single();

      if (communityError) throw communityError;
      if (!communityData) return null;

      const community = communityData as Community;

      // Check if user is member, moderator, or creator
      // Admins are treated as creators and moderators for all communities
      let isMember = false;
      let isModerator = false;
      const isCreator = isAdmin || (currentProfile?.id === community.created_by_profile_id);

      if (currentProfile?.id) {
        // Check membership
        const { data: memberData } = await supabase
          .from('community_members')
          .select('id')
          .eq('profile_id', currentProfile.id)
          .eq('community_id', communityId)
          .maybeSingle();

        isMember = !!memberData;

        // Check moderation
        const { data: moderatorData } = await supabase
          .from('community_moderators')
          .select('id')
          .eq('moderator_profile_id', currentProfile.id)
          .eq('community_id', communityId)
          .maybeSingle();

        isModerator = !!moderatorData;
      }

      // Admins are also treated as moderators
      if (isAdmin) {
        isModerator = true;
      }

      // Check if following
      let isFollowing = false;
      if (currentProfile?.id) {
        const { data: followData } = await supabase
          .from('community_follows')
          .select('id')
          .eq('profile_id', currentProfile.id)
          .eq('community_id', communityId)
          .maybeSingle();
        isFollowing = !!followData;
      }

      return {
        ...community,
        is_member: isMember,
        is_moderator: isModerator,
        is_creator: isCreator,
        is_following: isFollowing,
      } as CommunityWithDetails;
    },
    enabled: !!communityId,
  });

  return {
    community,
    isLoading,
    error,
    refetch,
  };
};

// Hook to get list of communities
export const useCommunities = (options?: { limit?: number; search?: string }) => {
  const { profile: currentProfile } = useProfile();
  const { limit = 50, search } = options || {};

  const {
    data: communities,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['communities', search, limit],
    queryFn: async () => {
      let query = supabase
        .from('communities')
        .select('*')
        .eq('is_active', true)
        .order('member_count', { ascending: false })
        .limit(limit);

      if (search) {
        query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
      }

      const { data, error: queryError } = await query;

      if (queryError) throw queryError;

      // Check memberships and follows for current user
      if (currentProfile?.id && data && data.length > 0) {
        const communityIds = data.map((c) => c.id);
        
        // Get memberships
        const { data: memberships } = await supabase
          .from('community_members')
          .select('community_id')
          .eq('profile_id', currentProfile.id)
          .in('community_id', communityIds);

        const memberCommunityIds = new Set(memberships?.map((m) => m.community_id) || []);

        // Get follows
        const { data: follows } = await supabase
          .from('community_follows')
          .select('community_id')
          .eq('profile_id', currentProfile.id)
          .in('community_id', communityIds);

        const followedCommunityIds = new Set(follows?.map((f) => f.community_id) || []);

        return data.map((community) => ({
          ...community,
          is_member: memberCommunityIds.has(community.id),
          is_following: followedCommunityIds.has(community.id),
        })) as CommunityWithDetails[];
      }

      return (data || []) as CommunityWithDetails[];
    },
  });

  return {
    communities: communities || [],
    isLoading,
    error,
    refetch,
  };
};

// Hook to create a community
export const useCreateCommunity = () => {
  const { profile: currentProfile } = useProfile();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      name: string;
      slug: string;
      description?: string;
      avatar_emoji?: string;
      guidelines?: string;
      is_public?: boolean;
      is_visible_publicly?: boolean;
    }) => {
      if (!currentProfile?.id) {
        throw new Error('Must be logged in to create a community');
      }

      // Validate slug uniqueness (case-insensitive)
      const { data: slugValidation, error: slugError } = await supabase
        .rpc('validate_community_slug', { slug_param: data.slug });

      if (slugError) throw slugError;
      if (!slugValidation || slugValidation.length === 0 || !slugValidation[0].is_valid) {
        throw new Error(slugValidation?.[0]?.reason || 'Invalid community slug');
      }

      // Check if user can create a community (rate limiting, account age)
      const { data: canCreate, error: canCreateError } = await supabase
        .rpc('can_create_community', { profile_id_param: currentProfile.id });

      if (canCreateError) throw canCreateError;
      if (!canCreate || canCreate.length === 0 || !canCreate[0].can_create) {
        throw new Error(canCreate?.[0]?.reason || 'Cannot create community at this time');
      }

      const { data: community, error } = await supabase
        .from('communities')
        .insert({
          name: data.name,
          slug: data.slug,
          description: data.description || null,
          avatar_emoji: data.avatar_emoji || '🎙️',
          guidelines: data.guidelines || null,
          is_public: data.is_public !== false,
          is_visible_publicly: data.is_visible_publicly || false,
          created_by_profile_id: currentProfile.id,
        })
        .select()
        .single();

      if (error) throw error;

      // Auto-join the creator
      await supabase.from('community_members').insert({
        community_id: community.id,
        profile_id: currentProfile.id,
      });

      return community as Community;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['communities'] });
    },
  });
};

// Hook to add a moderator to a community
export const useAddModerator = (communityId: string | null) => {
  const { profile: currentProfile } = useProfile();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (moderatorProfileId: string) => {
      if (!currentProfile?.id || !communityId) {
        throw new Error('Must be logged in and have a community');
      }

      // Verify user is the creator
      const { data: community, error: communityError } = await supabase
        .from('communities')
        .select('created_by_profile_id')
        .eq('id', communityId)
        .single();

      if (communityError) throw communityError;
      if (community?.created_by_profile_id !== currentProfile.id) {
        throw new Error('Only community creators can add moderators');
      }

      // Check if user is already a moderator
      const { data: existingModerator } = await supabase
        .from('community_moderators')
        .select('id')
        .eq('community_id', communityId)
        .eq('moderator_profile_id', moderatorProfileId)
        .maybeSingle();

      if (existingModerator) {
        throw new Error('User is already a moderator');
      }

      // Add moderator
      const { error } = await supabase
        .from('community_moderators')
        .insert({
          community_id: communityId,
          moderator_profile_id: moderatorProfileId,
          elected_by_profile_id: currentProfile.id,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community', communityId] });
      queryClient.invalidateQueries({ queryKey: ['communities'] });
    },
  });
};

// Hook to remove a moderator from a community
export const useRemoveModerator = (communityId: string | null) => {
  const { profile: currentProfile } = useProfile();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (moderatorProfileId: string) => {
      if (!currentProfile?.id || !communityId) {
        throw new Error('Must be logged in and have a community');
      }

      // Verify user is the creator
      const { data: community, error: communityError } = await supabase
        .from('communities')
        .select('created_by_profile_id')
        .eq('id', communityId)
        .single();

      if (communityError) throw communityError;
      if (community?.created_by_profile_id !== currentProfile.id) {
        throw new Error('Only community creators can remove moderators');
      }

      // Remove moderator
      const { error } = await supabase
        .from('community_moderators')
        .delete()
        .eq('community_id', communityId)
        .eq('moderator_profile_id', moderatorProfileId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community', communityId] });
      queryClient.invalidateQueries({ queryKey: ['communities'] });
    },
  });
};

// Hook to search for users by handle
export const useSearchUsers = (searchQuery: string) => {
  return useQuery({
    queryKey: ['search-users', searchQuery],
    queryFn: async () => {
      if (!searchQuery || searchQuery.length < 2) return [];

      // Get admin profile IDs to exclude them from search
      const { data: adminData } = await supabase
        .from('admins')
        .select('profile_id');
      const adminIds = new Set(adminData?.map((a) => a.profile_id) || []);

      const { data, error } = await supabase
        .from('profiles')
        .select('id, handle, emoji_avatar')
        .ilike('handle', `%${searchQuery}%`)
        .limit(20); // Fetch more to account for filtering

      if (error) throw error;
      
      // Filter out admin accounts
      return (data || []).filter((profile) => !adminIds.has(profile.id)).slice(0, 10);
    },
    enabled: !!searchQuery && searchQuery.length >= 2,
  });
};

// Hook to set community successor
export const useSetCommunitySuccessor = (communityId: string | null) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (successorProfileId: string) => {
      if (!communityId) {
        throw new Error('Community ID is required');
      }

      const { data, error } = await supabase
        .rpc('set_community_successor', {
          p_community_id: communityId,
          p_successor_profile_id: successorProfileId,
        });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community', communityId] });
    },
  });
};

// Hook to clear community successor
export const useClearCommunitySuccessor = (communityId: string | null) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!communityId) {
        throw new Error('Community ID is required');
      }

      const { data, error } = await supabase
        .rpc('clear_community_successor', {
          p_community_id: communityId,
        });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community', communityId] });
    },
  });
};

// Hook to check if user has a specific permission in a community
export const useCommunityPermission = (communityId: string | null, permission: string) => {
  const { profile } = useProfile();

  return useQuery({
    queryKey: ['community-permission', communityId, profile?.id, permission],
    queryFn: async () => {
      if (!communityId || !profile?.id) return false;

      const { data, error } = await supabase
        .rpc('moderator_has_permission', {
          p_community_id: communityId,
          p_profile_id: profile.id,
          p_permission: permission,
        });

      if (error) throw error;
      return data || false;
    },
    enabled: !!communityId && !!profile?.id,
  });
};

// Hook to get voice-based community suggestions for the current user
export const useVoiceBasedCommunitySuggestions = (limit: number = 5) => {
  const { profile } = useProfile();

  return useQuery({
    queryKey: ['voice-based-community-suggestions', profile?.id, limit],
    queryFn: async () => {
      if (!profile?.id) return [];

      const { data, error } = await supabase
        .rpc('suggest_voice_based_communities', {
          p_profile_id: profile.id,
          p_limit: limit,
        });

      if (error) throw error;
      return (data || []) as Array<{
        community_id: string;
        community_name: string;
        community_slug: string;
        community_description: string;
        avatar_emoji: string;
        member_count: number;
        match_score: number;
        voice_similarity: number;
      }>;
    },
    enabled: !!profile?.id,
  });
};

// Hook to trigger discovery of voice-based communities (admin/system use)
export const useDiscoverVoiceBasedCommunities = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (options?: { min_cluster_size?: number; similarity_threshold?: number }) => {
      const { data, error } = await supabase
        .rpc('discover_voice_based_communities', {
          p_min_cluster_size: options?.min_cluster_size || 5,
          p_similarity_threshold: options?.similarity_threshold || 0.6,
        });

      if (error) throw error;
      return data || [];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['communities'] });
      queryClient.invalidateQueries({ queryKey: ['voice-based-community-suggestions'] });
    },
  });
};

// Hook to update moderator permissions
export const useUpdateModeratorPermissions = (communityId: string | null) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ moderatorId, permissions }: { moderatorId: string; permissions: Record<string, boolean> }) => {
      if (!communityId) {
        throw new Error('Community ID is required');
      }

      const { error } = await supabase
        .from('community_moderators')
        .update({ permissions })
        .eq('id', moderatorId)
        .eq('community_id', communityId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community-moderators', communityId] });
      queryClient.invalidateQueries({ queryKey: ['community', communityId] });
    },
  });
};

