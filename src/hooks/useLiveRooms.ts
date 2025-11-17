import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from './useProfile';

export interface LiveRoom {
  id: string;
  title: string;
  description: string | null;
  host_profile_id: string | null;
  community_id: string | null;
  status: 'scheduled' | 'live' | 'ended';
  is_public: boolean;
  max_speakers: number;
  max_listeners: number;
  scheduled_start_time: string | null;
  started_at: string | null;
  ended_at: string | null;
  participant_count: number;
  speaker_count: number;
  listener_count: number;
  recording_enabled: boolean;
  transcription_enabled: boolean;
  webrtc_room_id: string | null;
  created_at: string;
  updated_at: string;
  profiles?: {
    handle: string;
    emoji_avatar: string;
  } | null;
}

export interface RoomParticipant {
  id: string;
  room_id: string;
  profile_id: string;
  role: 'host' | 'speaker' | 'listener' | 'moderator';
  is_muted: boolean;
  is_speaking: boolean;
  joined_at: string;
  left_at: string | null;
  webrtc_connection_id: string | null;
  profiles?: {
    handle: string;
    emoji_avatar: string;
  } | null;
}

// Hook to get live rooms for a community
export const useCommunityLiveRooms = (communityId: string | null) => {
  const {
    data: rooms,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['community-live-rooms', communityId],
    queryFn: async () => {
      if (!communityId) return [];

      const { data, error: queryError } = await supabase
        .from('live_rooms')
        .select(`
          *,
          profiles (
            handle,
            emoji_avatar
          )
        `)
        .eq('community_id', communityId)
        .in('status', ['scheduled', 'live'])
        .order('created_at', { ascending: false });

      if (queryError) throw queryError;
      return (data || []) as LiveRoom[];
    },
    enabled: !!communityId,
  });

  return {
    rooms: rooms || [],
    isLoading,
    error,
    refetch,
  };
};

// Hook to get a single live room
export const useLiveRoom = (roomId: string | null) => {
  const { profile } = useProfile();

  const {
    data: room,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['live-room', roomId],
    queryFn: async () => {
      if (!roomId) return null;

      const { data, error: queryError } = await supabase
        .from('live_rooms')
        .select(`
          *,
          profiles (
            handle,
            emoji_avatar
          )
        `)
        .eq('id', roomId)
        .single();

      if (queryError) throw queryError;
      return data as LiveRoom;
    },
    enabled: !!roomId,
  });

  return {
    room,
    isLoading,
    error,
    refetch,
  };
};

// Hook to get room participants
export const useRoomParticipants = (roomId: string | null) => {
  const {
    data: participants,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['room-participants', roomId],
    queryFn: async () => {
      if (!roomId) return [];

      const { data, error: queryError } = await supabase
        .from('room_participants')
        .select(`
          *,
          profiles (
            handle,
            emoji_avatar
          )
        `)
        .eq('room_id', roomId)
        .is('left_at', null)
        .order('joined_at', { ascending: true });

      if (queryError) throw queryError;
      return (data || []) as RoomParticipant[];
    },
    enabled: !!roomId,
    refetchInterval: 3000, // Refetch every 3 seconds for better real-time feel
  });

  return {
    participants: participants || [],
    isLoading,
    error,
    refetch,
  };
};

// Hook to check if user can access a community room
export const useCanAccessCommunityRoom = (roomId: string | null) => {
  const { profile } = useProfile();
  
  const {
    data: canAccess,
    isLoading,
  } = useQuery({
    queryKey: ['can-access-room', roomId, profile?.id],
    queryFn: async () => {
      if (!roomId || !profile?.id) return false;
      
      // Get room to check if it's a community room
      const { data: roomData } = await supabase
        .from('live_rooms')
        .select('community_id')
        .eq('id', roomId)
        .single();
      
      if (!roomData?.community_id) return true; // Not a community room, accessible
      
      // Check membership
      const { data: membership } = await supabase
        .from('community_members')
        .select('id')
        .eq('community_id', roomData.community_id)
        .eq('profile_id', profile.id)
        .maybeSingle();
      
      return !!membership;
    },
    enabled: !!roomId && !!profile?.id,
  });
  
  return {
    canAccess: canAccess ?? false,
    isLoading,
  };
};

// Hook to create a live room
export const useCreateLiveRoom = () => {
  const { profile } = useProfile();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      title: string;
      description?: string;
      community_id: string;
      scheduled_start_time?: string;
      max_speakers?: number;
      max_listeners?: number;
      max_duration_minutes?: number;
      recording_enabled?: boolean;
      transcription_enabled?: boolean;
    }) => {
      if (!profile?.id) {
        throw new Error('Must be logged in to create a live room');
      }

      // Validate room limits
      const { data: limitsValidation, error: limitsError } = await supabase
        .rpc('validate_room_limits', {
          max_speakers_param: data.max_speakers || 10,
          max_listeners_param: data.max_listeners || 100,
        });

      if (limitsError) throw limitsError;
      if (!limitsValidation || limitsValidation.length === 0 || !limitsValidation[0].is_valid) {
        throw new Error(limitsValidation?.[0]?.reason || 'Invalid room limits');
      }

      // Check if user can create a live room (rate limiting with duration validation)
      const maxDurationMinutes = data.max_duration_minutes || 120; // Default 2 hours
      const { data: canCreate, error: canCreateError } = await supabase
        .rpc('can_create_live_room', { 
          profile_id_param: profile.id,
          max_duration_minutes_param: maxDurationMinutes
        });

      if (canCreateError) throw canCreateError;
      if (!canCreate || canCreate.length === 0 || !canCreate[0].can_create) {
        throw new Error(canCreate?.[0]?.reason || 'Cannot create live room at this time');
      }

      const { data: room, error } = await supabase
        .from('live_rooms')
        .insert({
          title: data.title,
          description: data.description || null,
          host_profile_id: profile.id,
          community_id: data.community_id,
          scheduled_start_time: data.scheduled_start_time || null,
          max_speakers: data.max_speakers || 10,
          max_listeners: data.max_listeners || 100,
          max_duration_minutes: maxDurationMinutes,
          recording_enabled: data.recording_enabled !== false,
          transcription_enabled: data.transcription_enabled !== false,
          status: data.scheduled_start_time ? 'scheduled' : 'live',
          started_at: data.scheduled_start_time ? null : new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      // Auto-join as host
      await supabase.from('room_participants').insert({
        room_id: room.id,
        profile_id: profile.id,
        role: 'host',
      });

      return room as LiveRoom;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['community-live-rooms', variables.community_id] });
    },
  });
};

// Hook to join/leave a room
export const useRoomParticipation = (roomId: string | null) => {
  const { profile } = useProfile();
  const queryClient = useQueryClient();

  const {
    data: participation,
    isLoading: isLoadingParticipation,
  } = useQuery({
    queryKey: ['room-participation', roomId, profile?.id],
    queryFn: async () => {
      if (!roomId || !profile?.id) return null;

      const { data, error } = await supabase
        .from('room_participants')
        .select('*')
        .eq('room_id', roomId)
        .eq('profile_id', profile.id)
        .is('left_at', null)
        .maybeSingle();

      if (error) throw error;
      return data as RoomParticipant | null;
    },
    enabled: !!roomId && !!profile?.id,
  });

  const joinMutation = useMutation({
    mutationFn: async (role: 'speaker' | 'listener' = 'listener') => {
      if (!roomId || !profile?.id) {
        throw new Error('Missing room or profile');
      }

      // Check if this is a community room and verify membership
      const { data: roomData } = await supabase
        .from('live_rooms')
        .select('community_id')
        .eq('id', roomId)
        .single();

      if (roomData?.community_id) {
        // Verify community membership
        const { data: membership, error: membershipError } = await supabase
          .from('community_members')
          .select('id')
          .eq('community_id', roomData.community_id)
          .eq('profile_id', profile.id)
          .maybeSingle();

        if (membershipError) throw membershipError;
        if (!membership) {
          throw new Error('You must be a member of this community to join its live rooms');
        }
      }

      const { error } = await supabase.from('room_participants').insert({
        room_id: roomId,
        profile_id: profile.id,
        role,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['room-participants', roomId] });
      queryClient.invalidateQueries({ queryKey: ['room-participation', roomId, profile?.id] });
      queryClient.invalidateQueries({ queryKey: ['live-room', roomId] });
    },
  });

  const leaveMutation = useMutation({
    mutationFn: async () => {
      if (!roomId || !profile?.id) {
        throw new Error('Missing room or profile');
      }

      const { error } = await supabase
        .from('room_participants')
        .update({ left_at: new Date().toISOString() })
        .eq('room_id', roomId)
        .eq('profile_id', profile.id)
        .is('left_at', null);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['room-participants', roomId] });
      queryClient.invalidateQueries({ queryKey: ['room-participation', roomId, profile?.id] });
      queryClient.invalidateQueries({ queryKey: ['live-room', roomId] });
    },
  });

  const toggleMuteMutation = useMutation({
    mutationFn: async (muted: boolean) => {
      if (!roomId || !profile?.id) {
        throw new Error('Missing room or profile');
      }

      const { error } = await supabase
        .from('room_participants')
        .update({ is_muted: muted })
        .eq('room_id', roomId)
        .eq('profile_id', profile.id)
        .is('left_at', null);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['room-participants', roomId] });
      queryClient.invalidateQueries({ queryKey: ['room-participation', roomId, profile?.id] });
    },
  });

  return {
    participation,
    isParticipating: !!participation,
    isLoadingParticipation,
    join: async (role?: 'speaker' | 'listener') => {
      return joinMutation.mutateAsync(role);
    },
    leave: async () => {
      return leaveMutation.mutateAsync();
    },
    toggleMute: async (muted: boolean) => {
      return toggleMuteMutation.mutateAsync(muted);
    },
    isJoining: joinMutation.isPending,
    isLeaving: leaveMutation.isPending,
    isTogglingMute: toggleMuteMutation.isPending,
  };
};

// Hook to set live room successor
export const useSetLiveRoomSuccessor = (roomId: string | null) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (successorProfileId: string) => {
      if (!roomId) {
        throw new Error('Room ID is required');
      }

      const { data, error } = await supabase
        .rpc('set_live_room_successor', {
          p_room_id: roomId,
          p_successor_profile_id: successorProfileId,
        });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['live-room', roomId] });
      queryClient.invalidateQueries({ queryKey: ['community-live-rooms'] });
    },
  });
};

// Hook to clear live room successor
export const useClearLiveRoomSuccessor = (roomId: string | null) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!roomId) {
        throw new Error('Room ID is required');
      }

      const { data, error } = await supabase
        .rpc('clear_live_room_successor', {
          p_room_id: roomId,
        });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['live-room', roomId] });
      queryClient.invalidateQueries({ queryKey: ['community-live-rooms'] });
    },
  });
};

