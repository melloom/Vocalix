import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from './useProfile';
import { useEffect } from 'react';

export interface Notification {
  id: string;
  recipient_id: string;
  actor_id: string | null;
  type: 'comment' | 'reply' | 'follow' | 'reaction' | 'mention' | 'challenge_update' | 'badge_unlocked';
  entity_type: 'clip' | 'comment' | 'challenge' | 'profile' | 'badge';
  entity_id: string;
  metadata: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
  actor?: {
    handle: string;
    emoji_avatar: string;
  } | null;
}

export const useNotifications = (limit: number = 50) => {
  const { profile } = useProfile();
  const queryClient = useQueryClient();

  const {
    data: notifications,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['notifications', profile?.id, limit],
    queryFn: async () => {
      if (!profile?.id) return [];

      const { data, error } = await supabase
        .from('notifications')
        .select(`
          *,
          actor:profiles!notifications_actor_id_fkey (
            handle,
            emoji_avatar
          )
        `)
        .eq('recipient_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      // Normalize actor data (can be array or object)
      return (data || []).map((notif: any) => ({
        ...notif,
        actor: Array.isArray(notif.actor) ? notif.actor[0] : notif.actor,
      })) as Notification[];
    },
    enabled: !!profile?.id,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Real-time subscription for new notifications
  useEffect(() => {
    if (!profile?.id) return;

    const channel = supabase
      .channel(`notifications-${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${profile.id}`,
        },
        () => {
          // Refetch notifications when new one arrives
          queryClient.invalidateQueries({ queryKey: ['notifications', profile.id] });
          queryClient.invalidateQueries({ queryKey: ['notification-count', profile.id] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${profile.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['notifications', profile.id] });
          queryClient.invalidateQueries({ queryKey: ['notification-count', profile.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, queryClient]);

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationIds?: string[]) => {
      if (!profile?.id) throw new Error('No profile');

      const { error } = await supabase.rpc('mark_notifications_read', {
        p_profile_id: profile.id,
        p_notification_ids: notificationIds || null,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', profile?.id] });
      queryClient.invalidateQueries({ queryKey: ['notification-count', profile?.id] });
    },
  });

  const markAllAsRead = () => {
    markAsReadMutation.mutate();
  };

  const markAsRead = (notificationId: string) => {
    markAsReadMutation.mutate([notificationId]);
  };

  return {
    notifications: notifications || [],
    isLoading,
    error,
    refetch,
    markAsRead,
    markAllAsRead,
    isMarkingAsRead: markAsReadMutation.isPending,
  };
};

export const useNotificationCount = () => {
  const { profile } = useProfile();
  const queryClient = useQueryClient();

  const {
    data: count,
    isLoading,
  } = useQuery({
    queryKey: ['notification-count', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return 0;

      const { data, error } = await supabase.rpc('get_unread_notification_count', {
        p_profile_id: profile.id,
      });

      if (error) throw error;
      return (data as number) || 0;
    },
    enabled: !!profile?.id,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Real-time subscription for unread count
  useEffect(() => {
    if (!profile?.id) return;

    const channel = supabase
      .channel(`notification-count-${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${profile.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['notification-count', profile.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, queryClient]);

  return {
    count: count || 0,
    isLoading,
  };
};

export interface NotificationDigest {
  unread_count: number;
  by_type: Record<string, number>;
  priority_notifications: Array<{
    id: string;
    type: string;
    message: string;
    created_at: string;
  }>;
}

export const useNotificationDigest = (sinceHours: number = 24) => {
  const { profile } = useProfile();
  const queryClient = useQueryClient();

  const {
    data: digest,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['notification-digest', profile?.id, sinceHours],
    queryFn: async () => {
      if (!profile?.id) return null;

      const since = new Date();
      since.setHours(since.getHours() - sinceHours);

      const { data, error } = await supabase.rpc('get_smart_notification_digest', {
        p_profile_id: profile.id,
        p_since: since.toISOString(),
      });

      if (error) throw error;
      return data as NotificationDigest | null;
    },
    enabled: !!profile?.id,
    refetchInterval: 60000, // Refetch every minute
  });

  // Real-time subscription for digest updates
  useEffect(() => {
    if (!profile?.id) return;

    const channel = supabase
      .channel(`notification-digest-${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${profile.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['notification-digest', profile.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, queryClient, sinceHours]);

  return {
    digest: digest || null,
    isLoading,
    error,
  };
};

