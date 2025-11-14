import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from './useProfile';

export interface Community {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  avatar_emoji: string;
  created_by_profile_id: string | null;
  member_count: number;
  clip_count: number;
  follower_count?: number;
  is_public: boolean;
  is_active: boolean;
  guidelines: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommunityWithDetails extends Community {
  is_member?: boolean;
  is_moderator?: boolean;
  is_creator?: boolean;
  is_following?: boolean;
}

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

  const {
    data: community,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['community', communityId],
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
      let isMember = false;
      let isModerator = false;
      const isCreator = currentProfile?.id === community.created_by_profile_id;

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
    }) => {
      if (!currentProfile?.id) {
        throw new Error('Must be logged in to create a community');
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

