import { useState, useRef, useEffect } from 'react';
import { Send, MessageSquare, X, Edit2, Trash2, Users, Settings, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { usePrivateChatMessages, useSendPrivateChatMessage, useEditPrivateChatMessage, PrivateChatMessage } from '@/hooks/usePrivateChats';
import { useProfile } from '@/hooks/useProfile';
import { formatDistanceToNow } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { logError } from '@/lib/logger';
import { usePrivateChat } from '@/hooks/usePrivateChats';
import { Badge } from '@/components/ui/badge';
import { InviteParticipantsModal } from '@/components/InviteParticipantsModal';

interface PrivateChatRoomProps {
  chatId: string;
  onClose?: () => void;
}

export const PrivateChatRoom = ({ chatId, onClose }: PrivateChatRoomProps) => {
  const { profile } = useProfile();
  const [message, setMessage] = useState('');
  const [replyingTo, setReplyingTo] = useState<PrivateChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<PrivateChatMessage | null>(null);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { chat, isLoading: isLoadingChat, refetch: refetchChat } = usePrivateChat(chatId);
  const { messages, isLoading } = usePrivateChatMessages(chatId, 100);
  const sendMessage = useSendPrivateChatMessage();
  const editMessage = useEditPrivateChatMessage();

  // Check if user is a participant (all participants can invite)
  const isParticipant = chat && chat.participants?.some(p => p.profile_id === profile?.id);
  
  // Check if user is admin (creator or has admin role) - for future admin features
  const isAdmin = chat && (
    chat.created_by_profile_id === profile?.id ||
    chat.participants?.some(p => p.profile_id === profile?.id && p.is_admin)
  );

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSend = async () => {
    if (!message.trim() || sendMessage.isPending) return;

    try {
      await sendMessage.mutateAsync({
        chat_id: chatId,
        message: message.trim(),
        reply_to_message_id: replyingTo?.id,
      });
      setMessage('');
      setReplyingTo(null);
    } catch (error) {
      logError('Failed to send message', error);
    }
  };

  const handleEdit = async () => {
    if (!editingMessage || !message.trim() || editMessage.isPending) return;

    try {
      await editMessage.mutateAsync({
        message_id: editingMessage.id,
        message: message.trim(),
      });
      setMessage('');
      setEditingMessage(null);
    } catch (error) {
      logError('Failed to edit message', error);
    }
  };

  const handleDelete = async (messageId: string) => {
    if (editMessage.isPending) return;

    try {
      await editMessage.mutateAsync({
        message_id: messageId,
        is_deleted: true,
      });
    } catch (error) {
      logError('Failed to delete message', error);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (editingMessage) {
        handleEdit();
      } else {
        handleSend();
      }
    }
  };

  const isOwnMessage = (msg: PrivateChatMessage) => msg.profile_id === profile?.id;

  if (isLoadingChat) {
    return (
      <Card className="flex flex-col h-[600px] rounded-3xl overflow-hidden">
        <div className="p-4 border-b border-border">
          <Skeleton className="h-6 w-32" />
        </div>
        <div className="flex-1 p-4 space-y-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-3/4" />
          <Skeleton className="h-16 w-full" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col h-[600px] rounded-3xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="text-2xl shrink-0">{chat?.avatar_emoji || '💬'}</div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold truncate">{chat?.name || 'Private Chat'}</h3>
            {chat && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Users className="w-3 h-3" />
                <span>{chat.participants?.length || 0} participants</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isParticipant && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsInviteModalOpen(true)}
              className="rounded-full"
            >
              <UserPlus className="w-4 h-4 mr-1" />
              Invite
            </Button>
          )}
          {onClose && (
            <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0">
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-3/4" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No messages yet. Start the conversation!</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${isOwnMessage(msg) ? 'flex-row-reverse' : ''}`}
              >
                <div className={`flex flex-col gap-1 max-w-[75%] ${isOwnMessage(msg) ? 'items-end' : 'items-start'}`}>
                  {!isOwnMessage(msg) && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="text-lg">{msg.profiles?.emoji_avatar || '👤'}</span>
                      <span className="font-medium">{msg.profiles?.handle || 'Unknown'}</span>
                    </div>
                  )}
                  
                  {msg.reply_to && (
                    <div className={`text-xs text-muted-foreground mb-1 ${isOwnMessage(msg) ? 'text-right' : 'text-left'}`}>
                      Replying to {msg.reply_to.profiles?.handle || 'Unknown'}
                    </div>
                  )}

                  <div
                    className={`rounded-2xl px-4 py-2 ${
                      isOwnMessage(msg)
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap break-words">{msg.message}</p>
                    <div className={`flex items-center gap-2 mt-1 text-xs ${
                      isOwnMessage(msg) ? 'text-primary-foreground/70' : 'text-muted-foreground'
                    }`}>
                      <span>{formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}</span>
                      {msg.is_edited && <span>(edited)</span>}
                    </div>
                  </div>

                  {isOwnMessage(msg) && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => {
                          setEditingMessage(msg);
                          setMessage(msg.message);
                          setReplyingTo(null);
                        }}
                      >
                        <Edit2 className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => handleDelete(msg.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  )}

                  {!isOwnMessage(msg) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => {
                        setReplyingTo(msg);
                        setEditingMessage(null);
                      }}
                    >
                      Reply
                    </Button>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      {/* Reply indicator */}
      {replyingTo && (
        <div className="px-4 py-2 bg-muted border-t border-border flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Replying to {replyingTo.profiles?.handle || 'Unknown'}: {replyingTo.message.substring(0, 50)}...
          </div>
          <Button variant="ghost" size="sm" onClick={() => setReplyingTo(null)}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Edit indicator */}
      {editingMessage && (
        <div className="px-4 py-2 bg-muted border-t border-border flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Editing message
          </div>
          <Button variant="ghost" size="sm" onClick={() => {
            setEditingMessage(null);
            setMessage('');
          }}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-border">
        <div className="flex gap-2">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={editingMessage ? "Edit your message..." : replyingTo ? "Reply to message..." : "Type a message..."}
            disabled={sendMessage.isPending || editMessage.isPending}
            className="flex-1"
          />
          <Button
            onClick={editingMessage ? handleEdit : handleSend}
            disabled={!message.trim() || sendMessage.isPending || editMessage.isPending}
            size="icon"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Invite Participants Modal */}
      {chat && (
        <InviteParticipantsModal
          isOpen={isInviteModalOpen}
          onClose={() => setIsInviteModalOpen(false)}
          chatId={chatId}
          existingParticipantIds={chat.participants?.map(p => p.profile_id) || []}
          onSuccess={() => {
            refetchChat();
          }}
        />
      )}
    </Card>
  );
};

