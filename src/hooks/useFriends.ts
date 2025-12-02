import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from './useProfile';
import { useToast } from './use-toast';
import { logError } from '@/lib/logger';

interface Friend {
  id: string;
  profile_id_1: string;
  profile_id_2: string;
  status: 'pending' | 'accepted' | 'blocked';
  requested_by: string;
  created_at: string;
  accepted_at: string | null;
  friend_profile: {
    id: string;
    handle: string;
    emoji_avatar: string;
  };
}

export const useFriends = (status?: 'pending' | 'accepted' | 'blocked') => {
  const { profile } = useProfile();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ['friends', profile?.id, status],
    queryFn: async () => {
      if (!profile?.id) return [];

      let query = supabase
        .from('friends')
        .select(`
          *,
          friend_profile:profiles!friends_profile_id_2_fkey(
            id,
            handle,
            emoji_avatar
          )
        `)
        .or(`profile_id_1.eq.${profile.id},profile_id_2.eq.${profile.id}`);

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query;

      if (error) {
        logError('Error fetching friends', error);
        throw error;
      }

      // Transform to include friend profile info
      const friends = (data || []).map((friend: any) => {
        const friendId = friend.profile_id_1 === profile.id 
          ? friend.profile_id_2 
          : friend.profile_id_1;
        
        return {
          ...friend,
          friend_profile: friend.friend_profile || {
            id: friendId,
            handle: 'Unknown',
            emoji_avatar: '👤',
          },
        };
      });

      return friends as Friend[];
    },
    enabled: !!profile?.id,
  });
};

export const useSendFriendRequest = () => {
  const { profile } = useProfile();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (friendProfileId: string) => {
      if (!profile?.id) throw new Error('Not authenticated');

      // Ensure profile_id_1 < profile_id_2 for consistency
      const [profileId1, profileId2] = [profile.id, friendProfileId].sort();
      
      const { data, error } = await supabase
        .from('friends')
        .insert({
          profile_id_1: profileId1,
          profile_id_2: profileId2,
          requested_by: profile.id,
          status: 'pending',
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error('Friend request already sent');
        }
        throw error;
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      toast({
        title: 'Friend request sent',
        description: 'Your friend request has been sent.',
      });
    },
    onError: (error: any) => {
      logError('Error sending friend request', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to send friend request',
        variant: 'destructive',
      });
    },
  });
};

export const useAcceptFriendRequest = () => {
  const { profile } = useProfile();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (friendRequestId: string) => {
      if (!profile?.id) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('friends')
        .update({
          status: 'accepted',
          accepted_at: new Date().toISOString(),
        })
        .eq('id', friendRequestId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      toast({
        title: 'Friend request accepted',
        description: 'You are now friends!',
      });
    },
    onError: (error: any) => {
      logError('Error accepting friend request', error);
      toast({
        title: 'Error',
        description: 'Failed to accept friend request',
        variant: 'destructive',
      });
    },
  });
};

export const useRemoveFriend = () => {
  const { profile } = useProfile();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (friendId: string) => {
      if (!profile?.id) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('friends')
        .delete()
        .or(`profile_id_1.eq.${profile.id},profile_id_2.eq.${profile.id}`)
        .or(`profile_id_1.eq.${friendId},profile_id_2.eq.${friendId}`);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      toast({
        title: 'Friend removed',
        description: 'Friend has been removed.',
      });
    },
    onError: (error: any) => {
      logError('Error removing friend', error);
      toast({
        title: 'Error',
        description: 'Failed to remove friend',
        variant: 'destructive',
      });
    },
  });
};

