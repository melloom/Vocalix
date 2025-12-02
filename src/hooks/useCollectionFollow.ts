import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from './useProfile';
import { logError, logWarn } from '@/lib/logger';

export const useCollectionFollow = (playlistId: string | null) => {
  const { profile: currentProfile } = useProfile();
  const queryClient = useQueryClient();

  // Check if current user is following the collection
  const {
    data: isFollowing,
    isLoading: isLoadingFollowStatus,
    refetch: refetchFollowStatus,
  } = useQuery({
    queryKey: ['collection-follow', currentProfile?.id, playlistId],
    queryFn: async () => {
      if (!currentProfile?.id || !playlistId) return false;

      const { data, error } = await supabase
        .from('collection_follows')
        .select('id')
        .eq('profile_id', currentProfile.id)
        .eq('playlist_id', playlistId)
        .maybeSingle();

      if (error) throw error;
      return !!data;
    },
    enabled: !!currentProfile?.id && !!playlistId,
  });

  // Follow mutation
  const followMutation = useMutation({
    mutationFn: async () => {
      if (!currentProfile?.id || !playlistId) {
        throw new Error('Missing profile or playlist');
      }

      const { error } = await supabase
        .from('collection_follows')
        .insert({
          profile_id: currentProfile.id,
          playlist_id: playlistId,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collection-follow', currentProfile?.id] });
      queryClient.invalidateQueries({ queryKey: ['collection-follow', currentProfile?.id, playlistId] });
      queryClient.invalidateQueries({ queryKey: ['playlist', playlistId] });
      queryClient.invalidateQueries({ queryKey: ['followed-collections', currentProfile?.id] });
    },
  });

  // Unfollow mutation
  const unfollowMutation = useMutation({
    mutationFn: async () => {
      if (!currentProfile?.id || !playlistId) {
        throw new Error('Missing profile or playlist');
      }

      const { error } = await supabase
        .from('collection_follows')
        .delete()
        .eq('profile_id', currentProfile.id)
        .eq('playlist_id', playlistId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collection-follow', currentProfile?.id] });
      queryClient.invalidateQueries({ queryKey: ['collection-follow', currentProfile?.id, playlistId] });
      queryClient.invalidateQueries({ queryKey: ['playlist', playlistId] });
      queryClient.invalidateQueries({ queryKey: ['followed-collections', currentProfile?.id] });
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

// Hook to get list of collections the current user follows
export const useFollowedCollections = () => {
  const { profile: currentProfile } = useProfile();

  const {
    data: followedCollections,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['followed-collections', currentProfile?.id],
    queryFn: async () => {
      if (!currentProfile?.id) return [];

      try {
        // First get the playlist IDs
        const { data: followsData, error: followsError } = await supabase
          .from('collection_follows')
          .select('playlist_id')
          .eq('profile_id', currentProfile.id)
          .order('created_at', { ascending: false });

        if (followsError) {
          if (followsError.code === 403 || followsError.code === "403" || followsError.code === "PGRST301") {
            logWarn("Access denied loading collection follows (RLS)", followsError);
            return [];
          }
          throw followsError;
        }
        if (!followsData || followsData.length === 0) return [];

        const playlistIds = followsData.map((f: any) => f.playlist_id);

        // Then get the playlists with stats
        const { data: playlistsData, error: playlistsError } = await supabase
          .from('playlists')
          .select(`
            *,
            profiles (
              handle,
              emoji_avatar
            ),
            playlist_clips(count)
          `)
          .in('id', playlistIds)
          .eq('is_public', true)
          .order('updated_at', { ascending: false });

        if (playlistsError) {
          if (playlistsError.code === 403 || playlistsError.code === "403" || playlistsError.code === "PGRST301") {
            logWarn("Access denied loading playlists (RLS)", playlistsError);
            return [];
          }
          throw playlistsError;
        }

        return (playlistsData || []).map((playlist: any) => ({
          ...playlist,
          clip_count: Array.isArray(playlist.playlist_clips) 
            ? playlist.playlist_clips[0]?.count || 0 
            : 0,
        }));
      } catch (error: any) {
        logError("Error loading followed collections", error);
        return [];
      }
    },
    enabled: !!currentProfile?.id,
  });

  return {
    followedCollections: followedCollections ?? [],
    isLoading,
    error,
  };
};

// Hook to track collection view
export const useTrackCollectionView = () => {
  const { profile: currentProfile } = useProfile();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (playlistId: string) => {
      if (!playlistId) return;

      // Track view (insert or ignore if already exists)
      // Use a simple insert - the unique constraint will prevent duplicates
      const { error } = await supabase
        .from('collection_views')
        .insert({
          playlist_id: playlistId,
          profile_id: currentProfile?.id || null,
        });

      if (error) {
        // Ignore duplicate key errors (23505 is unique violation)
        if (error.code !== '23505') {
          logWarn("Failed to track collection view", error);
        }
      }
    },
    onSuccess: (_, playlistId) => {
      queryClient.invalidateQueries({ queryKey: ['playlist', playlistId] });
    },
  });
};

