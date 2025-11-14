import { useState, useEffect, useCallback } from 'react';
import { useProfile } from './useProfile';
import { useNotifications } from './useNotifications';
import { useToast } from './use-toast';
import { logWarn, logError } from '@/lib/logger';

export const usePushNotifications = () => {
  const { profile } = useProfile();
  // Safely get notifications - handle errors gracefully through return value
  const notificationsResult = useNotifications(10);
  const notifications = notificationsResult?.notifications || [];
  const { toast } = useToast();
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);

  useEffect(() => {
    // Check if browser supports push notifications (only in browser environment)
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined') {
      if ('Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window) {
        setIsSupported(true);
        try {
          setPermission(Notification.permission);
        } catch (error) {
          // Notification API might not be available
          logWarn('Notification API not available', error);
        }
      }
    }
  }, []);

  // Request permission
  const requestPermission = useCallback(async () => {
    if (!isSupported) {
      toast({
        title: 'Not supported',
        description: 'Push notifications are not supported in your browser.',
        variant: 'destructive',
      });
      return false;
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      
      if (result === 'granted') {
        // Register service worker and get subscription
        const registration = await navigator.serviceWorker.ready;
        const sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(
            import.meta.env.VITE_VAPID_PUBLIC_KEY || ''
          ),
        });
        setSubscription(sub);
        
        toast({
          title: 'Notifications enabled',
          description: 'You will receive push notifications for new activity.',
        });
        return true;
      } else {
        toast({
          title: 'Permission denied',
          description: 'Push notifications were not enabled.',
          variant: 'destructive',
        });
        return false;
      }
    } catch (error) {
      logError('Error requesting notification permission', error);
      toast({
        title: 'Error',
        description: 'Failed to enable push notifications.',
        variant: 'destructive',
      });
      return false;
    }
  }, [isSupported, toast]);

  // Show local notification for new notifications
  useEffect(() => {
    if (permission !== 'granted' || !notifications.length) return;

    // Get the most recent unread notification
    const unreadNotifications = notifications.filter(n => !n.read_at);
    if (unreadNotifications.length === 0) return;

    const latestNotification = unreadNotifications[0];
    
    // Only show notification if it's very recent (within last 5 seconds)
    const notificationAge = Date.now() - new Date(latestNotification.created_at).getTime();
    if (notificationAge > 5000) return; // Don't show old notifications

    const actorName = latestNotification.actor?.handle || 'Someone';
    let title = '';
    let body = '';

    switch (latestNotification.type) {
      case 'comment':
        title = 'New comment';
        body = `${actorName} commented on your clip`;
        break;
      case 'reply':
        title = 'New reply';
        body = `${actorName} replied to your comment`;
        break;
      case 'follow':
        title = 'New follower';
        body = `${actorName} started following you`;
        break;
      case 'reaction': {
        const emoji = (latestNotification.metadata?.emoji as string) || '❤️';
        title = 'New reaction';
        body = `${actorName} reacted with ${emoji} to your clip`;
        break;
      }
      case 'mention':
        title = 'You were mentioned';
        body = `${actorName} mentioned you in a comment`;
        break;
      case 'challenge_update':
        title = 'Challenge update';
        body = 'New update on a challenge you\'re following';
        break;
      case 'badge_unlocked': {
        const badgeName = (latestNotification.metadata?.badge_name as string) || 'Badge';
        const badgeIcon = (latestNotification.metadata?.badge_icon as string) || '🏆';
        title = 'Badge Unlocked!';
        body = `You unlocked ${badgeIcon} ${badgeName}!`;
        break;
      }
    }

    // Show browser notification
    if (title && body) {
      new Notification(title, {
        body,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: latestNotification.id, // Prevent duplicate notifications
        requireInteraction: false,
      });
    }
  }, [notifications, permission]);

  return {
    isSupported,
    permission,
    subscription,
    requestPermission,
    isEnabled: permission === 'granted',
  };
};

// Helper function to convert VAPID key
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  if (!base64String) {
    // Return a dummy key if not provided (for development)
    return new Uint8Array(65);
  }
  
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

