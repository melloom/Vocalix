import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from './useProfile';
import { useEffect } from 'react';

export interface PrivateChat {
  id: string;
  name: string;
  description: string | null;
  created_by_profile_id: string | null;
  avatar_emoji: string;
  is_active: boolean;
  message_count: number;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PrivateChatParticipant {
  id: string;
  chat_id: string;
  profile_id: string;
  joined_at: string;
  is_admin: boolean;
  profiles: {
    handle: string;
    emoji_avatar: string;
  } | null;
}

export interface PrivateChatMessage {
  id: string;
  chat_id: string;
  profile_id: string | null;
  message: string;
  is_edited: boolean;
  is_deleted: boolean;
  reply_to_message_id: string | null;
  created_at: string;
  updated_at: string;
  profiles: {
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

// Hook to get all private chats for the current user
export const usePrivateChats = () => {
  const { profile } = useProfile();

  const {
    data: chats,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['private-chats', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];

      const { data, error: queryError } = await supabase
        .from('private_chats')
        .select('*')
        .eq('is_active', true)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });

      if (queryError) throw queryError;
      return (data || []) as PrivateChat[];
    },
    enabled: !!profile?.id,
  });

  return {
    chats: chats || [],
    isLoading,
    error,
    refetch,
  };
};

// Hook to get a single private chat with participants
export const usePrivateChat = (chatId: string | null) => {
  const { profile } = useProfile();

  const {
    data: chat,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['private-chat', chatId, profile?.id],
    queryFn: async () => {
      if (!chatId || !profile?.id) return null;

      // Get chat
      const { data: chatData, error: chatError } = await supabase
        .from('private_chats')
        .select('*')
        .eq('id', chatId)
        .eq('is_active', true)
        .single();

      if (chatError) throw chatError;
      if (!chatData) return null;

      // Get participants
      const { data: participantsData, error: participantsError } = await supabase
        .from('private_chat_participants')
        .select(`
          *,
          profiles!profile_id (
            handle,
            emoji_avatar
          )
        `)
        .eq('chat_id', chatId);

      if (participantsError) throw participantsError;

      return {
        ...chatData,
        participants: (participantsData || []) as PrivateChatParticipant[],
      } as PrivateChat & { participants: PrivateChatParticipant[] };
    },
    enabled: !!chatId && !!profile?.id,
  });

  return {
    chat,
    isLoading,
    error,
    refetch,
  };
};

// Hook to get messages for a private chat with real-time updates
export const usePrivateChatMessages = (chatId: string | null, limit: number = 50) => {
  const { profile } = useProfile();
  const queryClient = useQueryClient();

  const {
    data: messages,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['private-chat-messages', chatId, limit],
    queryFn: async () => {
      if (!chatId) return [];

      const { data, error: queryError } = await supabase
        .from('private_chat_messages')
        .select(`
          *,
          profiles!profile_id (
            handle,
            emoji_avatar
          ),
          reply_to:private_chat_messages!reply_to_message_id (
            id,
            message,
            profiles!profile_id (
              handle
            )
          )
        `)
        .eq('chat_id', chatId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true })
        .limit(limit);

      if (queryError) throw queryError;
      return (data || []) as PrivateChatMessage[];
    },
    enabled: !!chatId,
  });

  // Real-time subscription for new messages
  useEffect(() => {
    if (!chatId || !profile?.id) return;

    const channel = supabase
      .channel(`private-chat-messages-${chatId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'private_chat_messages',
          filter: `chat_id=eq.${chatId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['private-chat-messages', chatId] });
          queryClient.invalidateQueries({ queryKey: ['private-chat', chatId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatId, profile?.id, queryClient]);

  return {
    messages: messages || [],
    isLoading,
    error,
    refetch,
  };
};

// Hook to create a private chat
export const useCreatePrivateChat = () => {
  const { profile } = useProfile();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      name: string;
      description?: string;
      avatar_emoji?: string;
      participant_ids: string[]; // Profile IDs to add as participants
    }) => {
      if (!profile?.id) {
        throw new Error('Must be logged in to create a private chat');
      }

      // Create chat
      const { data: chat, error: chatError } = await supabase
        .from('private_chats')
        .insert({
          name: data.name,
          description: data.description || null,
          avatar_emoji: data.avatar_emoji || '💬',
          created_by_profile_id: profile.id,
        })
        .select()
        .single();

      if (chatError) throw chatError;

      // Add participants (creator is auto-added as admin by trigger)
      if (data.participant_ids.length > 0) {
        const participants = data.participant_ids
          .filter(id => id !== profile.id) // Don't add creator again
          .map(profile_id => ({
            chat_id: chat.id,
            profile_id,
            is_admin: false,
          }));

        if (participants.length > 0) {
          const { error: participantsError } = await supabase
            .from('private_chat_participants')
            .insert(participants);

          if (participantsError) throw participantsError;
        }
      }

      return chat as PrivateChat;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['private-chats'] });
    },
  });
};

// Hook to send a message in a private chat
export const useSendPrivateChatMessage = () => {
  const { profile } = useProfile();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      chat_id: string;
      message: string;
      reply_to_message_id?: string;
    }) => {
      if (!profile?.id) {
        throw new Error('Must be logged in to send a message');
      }

      const { data: message, error } = await supabase
        .from('private_chat_messages')
        .insert({
          chat_id: data.chat_id,
          profile_id: profile.id,
          message: data.message,
          reply_to_message_id: data.reply_to_message_id || null,
        })
        .select()
        .single();

      if (error) throw error;
      return message as PrivateChatMessage;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['private-chat-messages', variables.chat_id] });
      queryClient.invalidateQueries({ queryKey: ['private-chat', variables.chat_id] });
      queryClient.invalidateQueries({ queryKey: ['private-chats'] });
    },
  });
};

// Hook to edit a message in a private chat
export const useEditPrivateChatMessage = () => {
  const { profile } = useProfile();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      message_id: string;
      message?: string;
      is_deleted?: boolean;
    }) => {
      if (!profile?.id) {
        throw new Error('Must be logged in to edit a message');
      }

      const updateData: any = {};
      if (data.message !== undefined) {
        updateData.message = data.message;
        updateData.is_edited = true;
      }
      if (data.is_deleted !== undefined) {
        updateData.is_deleted = data.is_deleted;
      }

      const { data: message, error } = await supabase
        .from('private_chat_messages')
        .update(updateData)
        .eq('id', data.message_id)
        .eq('profile_id', profile.id) // Only allow editing own messages
        .select()
        .single();

      if (error) throw error;
      return message as PrivateChatMessage;
    },
    onSuccess: (message) => {
      queryClient.invalidateQueries({ queryKey: ['private-chat-messages', message.chat_id] });
    },
  });
};

// Hook to add participants to a private chat
export const useAddPrivateChatParticipants = (chatId: string | null) => {
  const { profile } = useProfile();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (participant_ids: string[]) => {
      if (!chatId || !profile?.id) {
        throw new Error('Chat ID and profile are required');
      }

      // Verify user is a participant (any participant can invite others)
      const { data: participant } = await supabase
        .from('private_chat_participants')
        .select('id')
        .eq('chat_id', chatId)
        .eq('profile_id', profile.id)
        .single();

      if (!participant) {
        throw new Error('You must be a participant to invite others');
      }

      const participants = participant_ids.map(profile_id => ({
        chat_id: chatId,
        profile_id,
        is_admin: false,
      }));

      const { error } = await supabase
        .from('private_chat_participants')
        .insert(participants);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['private-chat', chatId] });
    },
  });
};

// Hook to remove a participant from a private chat
export const useRemovePrivateChatParticipant = (chatId: string | null) => {
  const { profile } = useProfile();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (participant_id: string) => {
      if (!chatId || !profile?.id) {
        throw new Error('Chat ID and profile are required');
      }

      // Verify user is admin, creator, or removing themselves
      const isRemovingSelf = participant_id === profile.id;

      if (!isRemovingSelf) {
        const { data: chat } = await supabase
          .from('private_chats')
          .select('created_by_profile_id')
          .eq('id', chatId)
          .single();

        if (!chat) throw new Error('Chat not found');

        const { data: participant } = await supabase
          .from('private_chat_participants')
          .select('is_admin')
          .eq('chat_id', chatId)
          .eq('profile_id', profile.id)
          .single();

        const isAdmin = chat.created_by_profile_id === profile.id || participant?.is_admin;

        if (!isAdmin) {
          throw new Error('Only admins can remove participants');
        }
      }

      const { error } = await supabase
        .from('private_chat_participants')
        .delete()
        .eq('chat_id', chatId)
        .eq('profile_id', participant_id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['private-chat', chatId] });
      queryClient.invalidateQueries({ queryKey: ['private-chats'] });
    },
  });
};

// Hook to update private chat details
export const useUpdatePrivateChat = (chatId: string | null) => {
  const { profile } = useProfile();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      name?: string;
      description?: string;
      avatar_emoji?: string;
    }) => {
      if (!chatId || !profile?.id) {
        throw new Error('Chat ID and profile are required');
      }

      // Verify user is admin or creator
      const { data: chat } = await supabase
        .from('private_chats')
        .select('created_by_profile_id')
        .eq('id', chatId)
        .single();

      if (!chat) throw new Error('Chat not found');

      const { data: participant } = await supabase
        .from('private_chat_participants')
        .select('is_admin')
        .eq('chat_id', chatId)
        .eq('profile_id', profile.id)
        .single();

      const isAdmin = chat.created_by_profile_id === profile.id || participant?.is_admin;

      if (!isAdmin) {
        throw new Error('Only admins can update chat details');
      }

      const { data: updatedChat, error } = await supabase
        .from('private_chats')
        .update(data)
        .eq('id', chatId)
        .select()
        .single();

      if (error) throw error;
      return updatedChat as PrivateChat;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['private-chat', chatId] });
      queryClient.invalidateQueries({ queryKey: ['private-chats'] });
    },
  });
};

