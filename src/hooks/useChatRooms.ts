import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from './useProfile';
import { useEffect } from 'react';

export interface ChatRoom {
  id: string;
  community_id: string;
  name: string;
  description: string | null;
  created_by_profile_id: string | null;
  is_public: boolean;
  is_active: boolean;
  message_count: number;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
  profiles?: {
    handle: string;
    emoji_avatar: string;
  } | null;
}

export interface ChatMessage {
  id: string;
  chat_room_id: string;
  profile_id: string | null;
  message: string;
  is_edited: boolean;
  is_deleted: boolean;
  reply_to_message_id: string | null;
  created_at: string;
  updated_at: string;
  profiles?: {
    handle: string;
    emoji_avatar: string;
  } | null;
  reply_to?: {
    id: string;
    message: string;
    profiles: {
      handle: string;
    } | null;
  } | null;
}

// Hook to get chat rooms for a community
export const useCommunityChatRooms = (communityId: string | null) => {
  const {
    data: rooms,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['community-chat-rooms', communityId],
    queryFn: async () => {
      if (!communityId) return [];

      const { data, error: queryError } = await supabase
        .from('community_chat_rooms')
        .select(`
          *,
          profiles (
            handle,
            emoji_avatar
          )
        `)
        .eq('community_id', communityId)
        .eq('is_active', true)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });

      if (queryError) throw queryError;
      return (data || []) as ChatRoom[];
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

// Hook to get messages for a chat room with real-time updates
export const useChatMessages = (chatRoomId: string | null, limit: number = 50) => {
  const { profile } = useProfile();
  const queryClient = useQueryClient();

  const {
    data: messages,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['chat-messages', chatRoomId, limit],
    queryFn: async () => {
      if (!chatRoomId) return [];

      const { data, error: queryError } = await supabase
        .from('community_chat_messages')
        .select(`
          *,
          profiles (
            handle,
            emoji_avatar
          ),
          reply_to:community_chat_messages!reply_to_message_id (
            id,
            message,
            profiles (
              handle
            )
          )
        `)
        .eq('chat_room_id', chatRoomId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true })
        .limit(limit);

      if (queryError) throw queryError;
      return (data || []) as ChatMessage[];
    },
    enabled: !!chatRoomId,
  });

  // Real-time subscription for new messages
  useEffect(() => {
    if (!chatRoomId) return;

    const channel = supabase
      .channel(`chat-messages-${chatRoomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'community_chat_messages',
          filter: `chat_room_id=eq.${chatRoomId}`,
        },
        async (payload) => {
          // Fetch the new message with all relations
          const { data: newMessage, error: fetchError } = await supabase
            .from('community_chat_messages')
            .select(`
              *,
              profiles (
                handle,
                emoji_avatar
              ),
              reply_to:community_chat_messages!reply_to_message_id (
                id,
                message,
                profiles (
                  handle
                )
              )
            `)
            .eq('id', payload.new.id)
            .single();

          if (!fetchError && newMessage) {
            queryClient.setQueryData(['chat-messages', chatRoomId, limit], (old: ChatMessage[] = []) => {
              const exists = old.some((msg) => msg.id === newMessage.id);
              if (exists) return old;
              return [...old, newMessage as ChatMessage];
            });
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'community_chat_messages',
          filter: `chat_room_id=eq.${chatRoomId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['chat-messages', chatRoomId, limit] });
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'community_chat_messages',
          filter: `chat_room_id=eq.${chatRoomId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['chat-messages', chatRoomId, limit] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatRoomId, limit, queryClient]);

  return {
    messages: messages || [],
    isLoading,
    error,
    refetch,
  };
};

// Hook to send a chat message
export const useSendChatMessage = () => {
  const { profile } = useProfile();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      chat_room_id: string;
      message: string;
      reply_to_message_id?: string;
    }) => {
      if (!profile?.id) {
        throw new Error('Must be logged in to send messages');
      }

      if (!data.message.trim()) {
        throw new Error('Message cannot be empty');
      }

      const { data: chatMessage, error } = await supabase
        .from('community_chat_messages')
        .insert({
          chat_room_id: data.chat_room_id,
          profile_id: profile.id,
          message: data.message.trim(),
          reply_to_message_id: data.reply_to_message_id || null,
        })
        .select()
        .single();

      if (error) throw error;
      return chatMessage as ChatMessage;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['chat-messages', variables.chat_room_id] });
      queryClient.invalidateQueries({ queryKey: ['community-chat-rooms'] });
    },
  });
};

// Hook to create a chat room
export const useCreateChatRoom = () => {
  const { profile } = useProfile();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      community_id: string;
      name: string;
      description?: string;
      is_public?: boolean;
    }) => {
      if (!profile?.id) {
        throw new Error('Must be logged in to create a chat room');
      }

      const { data: chatRoom, error } = await supabase
        .from('community_chat_rooms')
        .insert({
          community_id: data.community_id,
          name: data.name,
          description: data.description || null,
          created_by_profile_id: profile.id,
          is_public: data.is_public !== false,
        })
        .select()
        .single();

      if (error) throw error;
      return chatRoom as ChatRoom;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['community-chat-rooms', variables.community_id] });
    },
  });
};

// Hook to edit/delete a message
export const useEditChatMessage = () => {
  const { profile } = useProfile();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      message_id: string;
      message?: string;
      is_deleted?: boolean;
    }) => {
      if (!profile?.id) {
        throw new Error('Must be logged in to edit messages');
      }

      const updateData: any = {};
      if (data.message !== undefined) {
        updateData.message = data.message.trim();
        updateData.is_edited = true;
      }
      if (data.is_deleted !== undefined) {
        updateData.is_deleted = data.is_deleted;
      }

      const { error } = await supabase
        .from('community_chat_messages')
        .update(updateData)
        .eq('id', data.message_id)
        .eq('profile_id', profile.id);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      // Get chat_room_id from the message
      queryClient.invalidateQueries({ queryKey: ['chat-messages'] });
    },
  });
};

