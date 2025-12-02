import React, { useState, useMemo } from 'react';
import { Bell, Check, CheckCheck, MessageCircle, Reply, UserPlus, Heart, AtSign, Trophy, X, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useNotifications, useNotificationCount, useNotificationDigest, Notification } from '@/hooks/useNotifications';
import { useFollow } from '@/hooks/useFollow';
import { formatDistanceToNow } from 'date-fns';
import { Link, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

const NotificationIcon = ({ type }: { type: Notification['type'] }) => {
  const iconClass = 'h-4 w-4';
  switch (type) {
    case 'comment':
      return <MessageCircle className={iconClass} />;
    case 'reply':
      return <Reply className={iconClass} />;
    case 'follow':
      return <UserPlus className={iconClass} />;
    case 'reaction':
      return <Heart className={iconClass} />;
    case 'mention':
      return <AtSign className={iconClass} />;
    case 'challenge_update':
      return <Trophy className={iconClass} />;
    case 'badge_unlocked':
      return <Trophy className={iconClass} />;
    default:
      return <Bell className={iconClass} />;
  }
};

const NotificationMessage = ({ notification }: { notification: Notification }) => {
  const actorName = notification.actor?.handle || 'Someone';
  const actorEmoji = notification.actor?.emoji_avatar || '🎧';

  switch (notification.type) {
    case 'comment':
      return (
        <span>
          <span className="font-medium">{actorName}</span> commented on your clip
        </span>
      );
    case 'reply':
      return (
        <span>
          <span className="font-medium">{actorName}</span> replied to your comment
        </span>
      );
    case 'follow':
      return (
        <span>
          <span className="font-medium">{actorName}</span> started following you
        </span>
      );
    case 'reaction': {
      const emoji = (notification.metadata?.emoji as string) || '❤️';
      return (
        <span>
          <span className="font-medium">{actorName}</span> reacted with {emoji} to your clip
        </span>
      );
    }
    case 'mention':
      return (
        <span>
          <span className="font-medium">{actorName}</span> mentioned you in a comment
        </span>
      );
    case 'challenge_update':
      return (
        <span>
          New update on a challenge you're following
        </span>
      );
    case 'badge_unlocked': {
      const badgeName = (notification.metadata?.badge_name as string) || 'Badge';
      const badgeIcon = (notification.metadata?.badge_icon as string) || '🏆';
      return (
        <span className="flex items-center gap-2">
          <span className="text-lg">{badgeIcon}</span>
          <span>
            You unlocked <span className="font-medium">{badgeName}</span>!
          </span>
        </span>
      );
    }
    default:
      return <span>New notification</span>;
  }
};

interface NotificationItemProps {
  notification: Notification;
  onMarkAsRead: (id: string) => void;
  showQuickActions?: boolean;
  onReply?: (clipId: string) => void;
}

const NotificationItem = ({ 
  notification, 
  onMarkAsRead,
  showQuickActions = true,
  onReply
}: NotificationItemProps) => {
  const isRead = !!notification.read_at;
  const actorEmoji = notification.actor?.emoji_avatar || '🎧';
  const badgeIcon = notification.type === 'badge_unlocked' 
    ? (notification.metadata?.badge_icon as string) || '🏆'
    : actorEmoji;
  const { toggleFollow, isFollowing } = useFollow(notification.actor_id || null);

  const getNotificationLink = () => {
    if (notification.entity_type === 'clip') {
      return `/clip/${notification.entity_id}`;
    }
    if (notification.entity_type === 'comment') {
      const clipId = notification.metadata?.clip_id as string;
      if (clipId) return `/clip/${clipId}`;
    }
    if (notification.entity_type === 'profile') {
      const handle = notification.actor?.handle;
      if (handle) return `/profile/${handle}`;
    }
    if (notification.entity_type === 'challenge') {
      return `/challenges`;
    }
    if (notification.entity_type === 'badge') {
      return `/my-recordings?tab=badges`;
    }
    return '#';
  };

  const handleQuickAction = (e: React.MouseEvent, action: 'reply' | 'follow' | 'view') => {
    e.preventDefault();
    e.stopPropagation();
    
    if (action === 'reply') {
      const clipId = notification.entity_type === 'clip' 
        ? notification.entity_id 
        : (notification.metadata?.clip_id as string | undefined);
      if (clipId && onReply) {
        onReply(clipId);
      }
    } else if (action === 'follow' && notification.actor_id && notification.type === 'follow') {
      toggleFollow();
    } else if (action === 'view') {
      // Navigation handled by Link component
      return;
    }
  };

  const canReply = notification.type === 'comment' || notification.type === 'reply' || notification.type === 'mention';
  const canFollow = notification.type === 'follow' && notification.actor_id;
  const clipId = notification.entity_type === 'clip' ? notification.entity_id : 
                 notification.metadata?.clip_id as string | undefined;

  return (
    <Card
      className={cn(
        'p-3 rounded-xl transition-colors',
        !isRead && 'bg-accent/50 border-primary/20'
      )}
    >
      <Link 
        to={getNotificationLink()} 
        onClick={() => !isRead && onMarkAsRead(notification.id)}
        className="block"
      >
        <div className="flex items-start gap-3">
          <div className="text-2xl flex-shrink-0">{badgeIcon}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <NotificationIcon type={notification.type} />
                <div className="text-sm flex-1 min-w-0">
                  <NotificationMessage notification={notification} />
                </div>
              </div>
              {!isRead && (
                <div className="h-2 w-2 rounded-full bg-primary flex-shrink-0 mt-1" />
              )}
            </div>
            <div className="flex items-center justify-between gap-2 mt-2">
              <div className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
              </div>
              {showQuickActions && (
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  {canReply && clipId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={(e) => handleQuickAction(e, 'reply')}
                      title="Reply"
                    >
                      <Reply className="h-3 w-3 mr-1" />
                      Reply
                    </Button>
                  )}
                  {canFollow && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={(e) => handleQuickAction(e, 'follow')}
                      title={isFollowing ? "Following" : "Follow back"}
                      disabled={isFollowing}
                    >
                      <UserPlus className="h-3 w-3 mr-1" />
                      {isFollowing ? "Following" : "Follow"}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={(e) => handleQuickAction(e, 'view')}
                    title="View"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </Link>
    </Card>
  );
};

interface GroupedNotifications {
  [key: string]: Notification[];
}

const NotificationGroup = ({
  type,
  notifications: groupNotifications,
  count,
  onMarkAsRead,
  onMarkGroupAsRead,
  onReply,
}: {
  type: string;
  notifications: Notification[];
  count: number;
  onMarkAsRead: (id: string) => void;
  onMarkGroupAsRead: () => void;
  onReply?: (clipId: string) => void;
}) => {
  const [isExpanded, setIsExpanded] = useState(count <= 3); // Auto-expand if 3 or fewer
  const typeLabels: Record<string, string> = {
    comment: 'Comments',
    reply: 'Replies',
    reaction: 'Reactions',
    follow: 'Follows',
    mention: 'Mentions',
    challenge_update: 'Challenge Updates',
    badge_unlocked: 'Badges',
  };
  const label = typeLabels[type] || type;

  const unreadCount = groupNotifications.filter(n => !n.read_at).length;

  return (
    <div className="space-y-2">
      <Card className="p-3 rounded-xl bg-accent/30">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-2 flex-1 text-left"
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
            <NotificationIcon type={type as Notification['type']} />
            <span className="font-medium text-sm">{label}</span>
            <Badge variant="secondary" className="text-xs">
              {count} {unreadCount > 0 && `(${unreadCount} new)`}
            </Badge>
          </button>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onMarkGroupAsRead();
              }}
            >
              <Check className="h-3 w-3 mr-1" />
              Mark all read
            </Button>
          )}
        </div>
      </Card>
      {isExpanded && (
        <div className="space-y-2 pl-6">
          {groupNotifications.slice(0, 5).map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onMarkAsRead={onMarkAsRead}
              showQuickActions={true}
              onReply={onReply}
            />
          ))}
          {groupNotifications.length > 5 && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-muted-foreground"
              onClick={() => {
                // Show all notifications (could implement pagination here)
                setIsExpanded(true);
              }}
            >
              View {groupNotifications.length - 5} more...
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export const NotificationCenter = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<Notification['type'] | 'all'>('all');
  const [groupingEnabled, setGroupingEnabled] = useState(true);
  const { notifications, isLoading, markAsRead, markAllAsRead, isMarkingAsRead } = useNotifications();
  const { count } = useNotificationCount();
  const { digest } = useNotificationDigest(24);

  const filteredNotifications = filter === 'all' 
    ? notifications 
    : notifications.filter(n => n.type === filter);

  const unreadNotifications = filteredNotifications.filter(n => !n.read_at);
  const unreadCount = unreadNotifications.length;

  // Group notifications by type
  const groupedNotifications = useMemo(() => {
    if (!groupingEnabled) return null;

    const groups: GroupedNotifications = {};
    filteredNotifications.forEach((notification) => {
      const type = notification.type;
      if (!groups[type]) {
        groups[type] = [];
      }
      groups[type].push(notification);
    });

    // Sort groups by most recent notification and unread count
    const sortedGroups = Object.entries(groups).sort((a, b) => {
      const aUnread = a[1].filter(n => !n.read_at).length;
      const bUnread = b[1].filter(n => !n.read_at).length;
      if (aUnread !== bUnread) return bUnread - aUnread;
      const aLatest = new Date(a[1][0].created_at).getTime();
      const bLatest = new Date(b[1][0].created_at).getTime();
      return bLatest - aLatest;
    });

    return sortedGroups;
  }, [filteredNotifications, groupingEnabled]);

  // Priority notifications (from digest)
  const priorityNotifications = useMemo(() => {
    if (!digest?.priority_notifications) return [];
    return filteredNotifications.filter(n => 
      digest.priority_notifications.some(p => p.id === n.id)
    );
  }, [digest, filteredNotifications]);

  const handleMarkAsRead = (id: string) => {
    markAsRead(id);
  };

  const handleMarkAllAsRead = () => {
    markAllAsRead();
  };

  const handleMarkGroupAsRead = (notificationIds: string[]) => {
    notificationIds.forEach(id => markAsRead(id));
  };

  const navigate = useNavigate();
  const handleReply = (clipId: string) => {
    // Navigate to clip page where user can reply
    setIsOpen(false); // Close notification center
    navigate(`/clip/${clipId}`);
  };

  const filterTypes: Array<{ value: Notification['type'] | 'all'; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'comment', label: 'Comments' },
    { value: 'reply', label: 'Replies' },
    { value: 'follow', label: 'Follows' },
    { value: 'reaction', label: 'Reactions' },
    { value: 'mention', label: 'Mentions' },
    { value: 'challenge_update', label: 'Challenges' },
    { value: 'badge_unlocked', label: 'Badges' },
  ];

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full relative" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {count > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs rounded-full"
            >
              {count > 99 ? '99+' : count}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0 rounded-2xl" align="end">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            <h3 className="font-semibold text-sm">Notifications</h3>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {unreadCount} new
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setGroupingEnabled(!groupingEnabled)}
              className="h-auto px-2 py-1 text-xs rounded-full"
              title={groupingEnabled ? "Disable grouping" : "Enable grouping"}
            >
              {groupingEnabled ? "Ungrouped" : "Grouped"}
            </Button>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleMarkAllAsRead}
                disabled={isMarkingAsRead}
                className="h-auto px-2 py-1 text-xs rounded-full"
              >
                <CheckCheck className="h-3 w-3 mr-1" />
                Mark all read
              </Button>
            )}
          </div>
        </div>

        {/* Filter tabs */}
        <div className="px-4 pt-3 pb-2 border-b">
          <ScrollArea className="w-full">
            <div className="flex gap-2">
              {filterTypes.map((filterType) => (
                <Button
                  key={filterType.value}
                  variant={filter === filterType.value ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setFilter(filterType.value)}
                  className="h-auto px-3 py-1 text-xs rounded-full whitespace-nowrap"
                >
                  {filterType.label}
                </Button>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Notifications list */}
        <ScrollArea className="h-[500px]">
          <div className="p-4 space-y-2">
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Card key={i} className="p-3 rounded-xl">
                    <div className="flex items-start gap-3">
                      <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-3/4 bg-muted rounded animate-pulse" />
                        <div className="h-3 w-1/2 bg-muted rounded animate-pulse" />
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ) : filteredNotifications.length === 0 ? (
              <Card className="p-6 rounded-xl text-center text-muted-foreground">
                <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No notifications yet</p>
              </Card>
            ) : groupingEnabled && groupedNotifications ? (
              <>
                {/* Priority notifications section */}
                {priorityNotifications.length > 0 && (
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-2 px-2">
                      <Badge variant="default" className="text-xs">Priority</Badge>
                      <Separator className="flex-1" />
                    </div>
                    {priorityNotifications.map((notification) => (
                      <NotificationItem
                        key={notification.id}
                        notification={notification}
                        onMarkAsRead={handleMarkAsRead}
                        showQuickActions={true}
                        onReply={handleReply}
                      />
                    ))}
                  </div>
                )}
                
                {/* Grouped notifications */}
                <div className="space-y-3">
                  {groupedNotifications.map(([type, groupNotifications]) => (
                    <NotificationGroup
                      key={type}
                      type={type}
                      notifications={groupNotifications}
                      count={groupNotifications.length}
                      onMarkAsRead={handleMarkAsRead}
                      onMarkGroupAsRead={() => handleMarkGroupAsRead(groupNotifications.map(n => n.id))}
                      onReply={handleReply}
                    />
                  ))}
                </div>
              </>
            ) : (
              <>
                {/* Priority notifications section */}
                {priorityNotifications.length > 0 && (
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-2 px-2">
                      <Badge variant="default" className="text-xs">Priority</Badge>
                      <Separator className="flex-1" />
                    </div>
                    {priorityNotifications.map((notification) => (
                      <NotificationItem
                        key={notification.id}
                        notification={notification}
                        onMarkAsRead={handleMarkAsRead}
                        showQuickActions={true}
                        onReply={handleReply}
                      />
                    ))}
                  </div>
                )}
                
                {/* Ungrouped list */}
                <div className="space-y-2">
                  {filteredNotifications
                    .filter(n => !priorityNotifications.some(p => p.id === n.id))
                    .map((notification) => (
                      <NotificationItem
                        key={notification.id}
                        notification={notification}
                        onMarkAsRead={handleMarkAsRead}
                        showQuickActions={true}
                        onReply={handleReply}
                      />
                    ))}
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};

