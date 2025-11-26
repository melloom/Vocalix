import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from './useProfile';

// Hook to check if a user is blocked
export const useBlock = (targetProfileId: string | null) => {
  const { profile: currentProfile } = useProfile();
  const queryClient = useQueryClient();

  const {
    data: isBlocked,
    isLoading: isLoadingBlockStatus,
    refetch: refetchBlockStatus,
  } = useQuery({
    queryKey: ['block', currentProfile?.id, targetProfileId],
    queryFn: async () => {
      if (!currentProfile?.id || !targetProfileId) return false;
      if (currentProfile.id === targetProfileId) return false;

      const { data, error } = await supabase
        .from('user_blocks')
        .select('id')
        .eq('blocker_id', currentProfile.id)
        .eq('blocked_id', targetProfileId)
        .maybeSingle();

      if (error) throw error;
      return !!data;
    },
    enabled: !!currentProfile?.id && !!targetProfileId && currentProfile.id !== targetProfileId,
  });

  // Block mutation
  const blockMutation = useMutation({
    mutationFn: async () => {
      if (!currentProfile?.id || !targetProfileId) {
        throw new Error('Missing profile or target profile');
      }
      if (currentProfile.id === targetProfileId) {
        throw new Error('Cannot block yourself');
      }

      const { error } = await supabase
        .from('user_blocks')
        .insert({
          blocker_id: currentProfile.id,
          blocked_id: targetProfileId,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['block', currentProfile?.id] });
      queryClient.invalidateQueries({ queryKey: ['block', currentProfile?.id, targetProfileId] });
      queryClient.invalidateQueries({ queryKey: ['follow', currentProfile?.id] });
      queryClient.invalidateQueries({ queryKey: ['blocked-users', currentProfile?.id] });
      queryClient.invalidateQueries({ queryKey: ['clips'] });
      queryClient.invalidateQueries({ queryKey: ['following-feed', currentProfile?.id] });
    },
  });

  // Unblock mutation
  const unblockMutation = useMutation({
    mutationFn: async () => {
      if (!currentProfile?.id || !targetProfileId) {
        throw new Error('Missing profile or target profile');
      }

      const { error } = await supabase
        .from('user_blocks')
        .delete()
        .eq('blocker_id', currentProfile.id)
        .eq('blocked_id', targetProfileId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['block', currentProfile?.id] });
      queryClient.invalidateQueries({ queryKey: ['block', currentProfile?.id, targetProfileId] });
      queryClient.invalidateQueries({ queryKey: ['blocked-users', currentProfile?.id] });
      queryClient.invalidateQueries({ queryKey: ['clips'] });
      queryClient.invalidateQueries({ queryKey: ['following-feed', currentProfile?.id] });
    },
  });

  const toggleBlock = () => {
    if (isBlocked) {
      unblockMutation.mutate();
    } else {
      blockMutation.mutate();
    }
  };

  return {
    isBlocked: isBlocked ?? false,
    isLoadingBlockStatus,
    toggleBlock,
    isBlocking: blockMutation.isPending,
    isUnblocking: unblockMutation.isPending,
    refetchBlockStatus,
  };
};

// Empty array constant to avoid creating new array references on each render
const EMPTY_BLOCKED_USERS: any[] = [];

// Hook to get list of blocked users
export const useBlockedUsers = () => {
  const { profile: currentProfile } = useProfile();

  const {
    data: blockedUsers,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['blocked-users', currentProfile?.id],
    queryFn: async () => {
      if (!currentProfile?.id) return [];

      const { data, error: queryError } = await supabase
        .from('user_blocks')
        .select(`
          id,
          blocked_id,
          created_at,
          profiles:blocked_id (
            id,
            handle,
            emoji_avatar
          )
        `)
        .eq('blocker_id', currentProfile.id)
        .order('created_at', { ascending: false });

      if (queryError) throw queryError;

      return (data || []).map((block: any) => ({
        id: block.id,
        blocked_id: block.blocked_id,
        created_at: block.created_at,
        profile: Array.isArray(block.profiles) ? block.profiles[0] : block.profiles,
      }));
    },
    enabled: !!currentProfile?.id,
  });

  // Memoize the blockedUsers array to prevent unnecessary re-renders
  // Use a stable empty array constant instead of creating a new array on each render
  const memoizedBlockedUsers = useMemo(() => {
    return blockedUsers ?? EMPTY_BLOCKED_USERS;
  }, [blockedUsers]);

  return {
    blockedUsers: memoizedBlockedUsers,
    isLoading,
    error,
    refetch,
  };
};

// Hook to check if current user is blocked by another user
export const useIsBlockedBy = (targetProfileId: string | null) => {
  const { profile: currentProfile } = useProfile();

  const {
    data: isBlockedBy,
    isLoading,
  } = useQuery({
    queryKey: ['blocked-by', currentProfile?.id, targetProfileId],
    queryFn: async () => {
      if (!currentProfile?.id || !targetProfileId) return false;

      const { data, error } = await supabase
        .from('user_blocks')
        .select('id')
        .eq('blocker_id', targetProfileId)
        .eq('blocked_id', currentProfile.id)
        .maybeSingle();

      if (error) throw error;
      return !!data;
    },
    enabled: !!currentProfile?.id && !!targetProfileId,
  });

  return {
    isBlockedBy: isBlockedBy ?? false,
    isLoading,
  };
};

