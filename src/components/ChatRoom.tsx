import { useState, useRef, useEffect } from 'react';
import { Send, MessageSquare, X, Edit2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useChatMessages, useSendChatMessage, useEditChatMessage, ChatMessage } from '@/hooks/useChatRooms';
import { useProfile } from '@/hooks/useProfile';
import { formatDistanceToNow } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { logError } from '@/lib/logger';

interface ChatRoomProps {
  chatRoomId: string;
  onClose?: () => void;
}

export const ChatRoom = ({ chatRoomId, onClose }: ChatRoomProps) => {
  const { profile } = useProfile();
  const [message, setMessage] = useState('');
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, isLoading } = useChatMessages(chatRoomId, 100);
  const sendMessage = useSendChatMessage();
  const editMessage = useEditChatMessage();

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
        chat_room_id: chatRoomId,
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

  return (
    <Card className="flex flex-col h-[600px] rounded-3xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Chat Room</h3>
        </div>
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-2xl" />
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
            <MessageSquare className="w-12 h-12 mb-3 opacity-50" />
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => {
              const isOwnMessage = msg.profile_id === profile?.id;
              const isDeleted = msg.is_deleted;

              return (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${isOwnMessage ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  <div className="text-2xl shrink-0">
                    {msg.profiles?.emoji_avatar || '👤'}
                  </div>
                  <div className={`flex-1 space-y-1 ${isOwnMessage ? 'items-end' : 'items-start'}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        @{msg.profiles?.handle || 'Anonymous'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    {msg.reply_to && (
                      <Card className="p-2 text-xs bg-muted/50 rounded-xl mb-1">
                        <p className="text-muted-foreground">
                          Replying to @{msg.reply_to.profiles?.handle || 'Anonymous'}: {msg.reply_to.message}
                        </p>
                      </Card>
                    )}
                    <Card
                      className={`p-3 rounded-2xl ${
                        isOwnMessage
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted'
                      }`}
                    >
                      {isDeleted ? (
                        <p className="text-sm italic opacity-50">Message deleted</p>
                      ) : (
                        <>
                          <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                          {msg.is_edited && (
                            <p className="text-xs opacity-70 mt-1">(edited)</p>
                          )}
                        </>
                      )}
                    </Card>
                    {isOwnMessage && !isDeleted && !editingMessage && (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingMessage(msg);
                            setMessage(msg.message);
                            setReplyingTo(null);
                          }}
                          className="h-6 px-2 text-xs"
                        >
                          <Edit2 className="w-3 h-3 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(msg.id)}
                          className="h-6 px-2 text-xs text-destructive"
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          Delete
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      {/* Reply indicator */}
      {replyingTo && (
        <div className="px-4 py-2 bg-muted/50 border-t border-border flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <MessageSquare className="w-4 h-4" />
            <span className="text-muted-foreground">
              Replying to @{replyingTo.profiles?.handle || 'Anonymous'}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setReplyingTo(null)}
            className="h-6 px-2"
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      )}

      {/* Edit indicator */}
      {editingMessage && (
        <div className="px-4 py-2 bg-muted/50 border-t border-border flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <Edit2 className="w-4 h-4" />
            <span className="text-muted-foreground">Editing message</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setEditingMessage(null);
              setMessage('');
            }}
            className="h-6 px-2"
          >
            <X className="w-3 h-3" />
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
            placeholder={editingMessage ? 'Edit your message...' : replyingTo ? 'Reply to message...' : 'Type a message...'}
            className="rounded-2xl"
            disabled={sendMessage.isPending || editMessage.isPending}
          />
          <Button
            onClick={editingMessage ? handleEdit : handleSend}
            disabled={!message.trim() || sendMessage.isPending || editMessage.isPending}
            className="rounded-2xl"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
};

