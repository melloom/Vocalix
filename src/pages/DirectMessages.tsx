import { useEffect, useState, useRef } from "react";
import { ArrowLeft, Send, Mic, Play, Pause, Loader2 } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useProfile } from "@/hooks/useProfile";
import { useToast } from "@/hooks/use-toast";
import { logError } from "@/lib/logger";
import { RecordButton } from "@/components/RecordButton";
import { useAudioPlayer } from "@/context/AudioPlayerContext";
import { generateWaveformFromUrl } from "@/utils/audioWaveform";

interface Conversation {
  other_user_id: string;
  other_user_handle: string;
  other_user_avatar: string;
  last_message_id: string;
  last_message_audio_path: string;
  last_message_duration_seconds: number;
  last_message_created_at: string;
  unread_count: number;
  is_sender: boolean;
}

interface Message {
  id: string;
  sender_id: string;
  recipient_id: string;
  audio_path: string;
  duration_seconds: number;
  transcript: string | null;
  read_at: string | null;
  created_at: string;
  sender?: {
    handle: string;
    emoji_avatar: string;
  } | null;
  recipient?: {
    handle: string;
    emoji_avatar: string;
  } | null;
  waveform?: number[];
}

const DirectMessages = () => {
  const { profile, isLoading: isProfileLoading } = useProfile();
  const { userId } = useParams<{ userId?: string }>();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(userId || null);
  const [isSending, setIsSending] = useState(false);
  const [loadingWaveforms, setLoadingWaveforms] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { playAudio, stopAudio, isPlaying, currentAudioId } = useAudioPlayer();

  useEffect(() => {
    if (!profile?.id) return;

    loadConversations();

    // Subscribe to new messages
    const channel = supabase
      .channel('direct-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'direct_messages',
          filter: `sender_id=eq.${profile.id} OR recipient_id=eq.${profile.id}`,
        },
        () => {
          loadConversations();
          if (selectedUserId) {
            loadMessages(selectedUserId);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, selectedUserId]);

  useEffect(() => {
    if (selectedUserId && profile?.id) {
      loadMessages(selectedUserId);
      markAsRead(selectedUserId);
    }
  }, [selectedUserId, profile?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadConversations = async () => {
    if (!profile?.id) return;

    try {
      const { data, error } = await supabase.rpc('get_conversations', {
        profile_id_param: profile.id,
      });

      if (error) throw error;
      setConversations(data || []);
    } catch (err) {
      logError('Error loading conversations', err);
      toast({
        title: 'Error',
        description: 'Failed to load conversations',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadMessages = async (otherUserId: string) => {
    if (!profile?.id) return;

    setIsLoadingMessages(true);
    try {
      const { data, error } = await supabase.rpc('get_conversation', {
        user1_id: profile.id,
        user2_id: otherUserId,
        limit_count: 100,
      });

      if (error) throw error;

      // Fetch sender/recipient profiles
      const messagesWithProfiles = await Promise.all(
        (data || []).map(async (msg: any) => {
          const [sender, recipient] = await Promise.all([
            supabase.from('profiles').select('handle, emoji_avatar').eq('id', msg.sender_id).single(),
            supabase.from('profiles').select('handle, emoji_avatar').eq('id', msg.recipient_id).single(),
          ]);

          return {
            ...msg,
            sender: sender.data,
            recipient: recipient.data,
          };
        })
      );

      setMessages(messagesWithProfiles);

      // Generate waveforms for all messages
      messagesWithProfiles.forEach((msg) => {
        if (!msg.waveform && msg.audio_path) {
          loadWaveformForMessage(msg.id, msg.audio_path);
        }
      });
    } catch (err) {
      logError('Error loading messages', err);
      toast({
        title: 'Error',
        description: 'Failed to load messages',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingMessages(false);
    }
  };

  const loadWaveformForMessage = async (messageId: string, audioPath: string) => {
    if (loadingWaveforms.has(messageId)) return;
    
    setLoadingWaveforms((prev) => new Set(prev).add(messageId));
    
    try {
      const waveform = await generateWaveformFromUrl(audioPath, 20);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, waveform } : msg
        )
      );
    } catch (err) {
      logError('Error loading waveform', err);
    } finally {
      setLoadingWaveforms((prev) => {
        const next = new Set(prev);
        next.delete(messageId);
        return next;
      });
    }
  };

  const markAsRead = async (otherUserId: string) => {
    if (!profile?.id) return;

    try {
      await supabase.rpc('mark_conversation_read', {
        current_user_id: profile.id,
        other_user_id: otherUserId,
      });
      loadConversations();
    } catch (err) {
      logError('Error marking as read', err);
    }
  };

  const handleSendVoiceMessage = async (audioBlob: Blob, durationSeconds: number) => {
    if (!profile?.id || !selectedUserId || isSending) return;

    setIsSending(true);
    try {
      // Upload audio file
      const audioFile = new File([audioBlob], `voice-message-${Date.now()}.webm`, {
        type: 'audio/webm',
      });

      const filePath = `direct-messages/${profile.id}/${selectedUserId}/${Date.now()}.webm`;
      const { error: uploadError } = await supabase.storage
        .from('clips')
        .upload(filePath, audioFile, {
          contentType: 'audio/webm',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage.from('clips').getPublicUrl(filePath);
      const audioPath = urlData.publicUrl;

      // Create message
      const { error: messageError } = await supabase.from('direct_messages').insert({
        sender_id: profile.id,
        recipient_id: selectedUserId,
        audio_path: audioPath,
        duration_seconds: Math.round(durationSeconds),
      });

      if (messageError) throw messageError;

      // Reload messages and conversations
      await loadMessages(selectedUserId);
      await loadConversations();

      toast({
        title: 'Message sent',
        description: 'Your voice message has been sent',
      });
    } catch (err) {
      logError('Error sending message', err);
      toast({
        title: 'Error',
        description: 'Failed to send message',
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

  const handlePlayMessage = (message: Message) => {
    if (isPlaying && currentAudioId === message.id) {
      stopAudio();
    } else {
      playAudio(message.audio_path, message.id);
    }
  };

  if (isProfileLoading) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border">
          <div className="max-w-4xl mx-auto px-4 py-4">
            <Skeleton className="h-10 w-32" />
          </div>
        </header>
        <main className="max-w-4xl mx-auto px-4 py-6">
          <Skeleton className="h-96 w-full rounded-3xl" />
        </main>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border">
          <div className="max-w-4xl mx-auto px-4 py-4">
            <Button variant="ghost" size="icon" asChild className="rounded-full">
              <Link to="/">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
          </div>
        </header>
        <main className="max-w-4xl mx-auto px-4 py-6">
          <Card className="p-6 rounded-3xl text-center">
            <p className="text-muted-foreground">Please sign in to view messages.</p>
          </Card>
        </main>
      </div>
    );
  }

  const selectedConversation = conversations.find(
    (c) => c.other_user_id === selectedUserId
  );

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild className="rounded-full">
            <Link to="/">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">Messages</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-[calc(100vh-200px)]">
          {/* Conversations List */}
          <div className="border-r border-border pr-4 overflow-y-auto">
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-2xl" />
                ))}
              </div>
            ) : conversations.length === 0 ? (
              <Card className="p-6 rounded-3xl text-center text-muted-foreground">
                <p>No conversations yet</p>
                <p className="text-sm mt-2">Start a conversation by messaging someone!</p>
              </Card>
            ) : (
              <div className="space-y-2">
                {conversations.map((conv) => (
                  <Card
                    key={conv.other_user_id}
                    className={`p-3 rounded-2xl cursor-pointer hover:bg-card/80 transition-colors ${
                      selectedUserId === conv.other_user_id ? 'bg-primary/10 border-primary' : ''
                    }`}
                    onClick={() => setSelectedUserId(conv.other_user_id)}
                  >
                    <div className="flex items-start gap-3">
                      <div className="text-2xl">{conv.other_user_avatar}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-semibold text-sm truncate">
                            @{conv.other_user_handle}
                          </p>
                          {conv.unread_count > 0 && (
                            <span className="bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full">
                              {conv.unread_count}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {new Date(conv.last_message_created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Messages View */}
          <div className="md:col-span-2 flex flex-col">
            {!selectedUserId ? (
              <Card className="flex-1 p-6 rounded-3xl flex items-center justify-center text-center text-muted-foreground">
                <div>
                  <p className="text-lg font-semibold mb-2">Select a conversation</p>
                  <p className="text-sm">Choose a conversation from the list to view messages</p>
                </div>
              </Card>
            ) : (
              <>
                {/* Conversation Header */}
                <Card className="p-4 rounded-2xl mb-4">
                  <div className="flex items-center gap-3">
                    <div className="text-3xl">
                      {selectedConversation?.other_user_avatar || '👤'}
                    </div>
                    <div>
                      <p className="font-semibold">
                        @{selectedConversation?.other_user_handle || 'Unknown'}
                      </p>
                      <p className="text-sm text-muted-foreground">Direct message</p>
                    </div>
                  </div>
                </Card>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto space-y-4 mb-4">
                  {isLoadingMessages ? (
                    <div className="space-y-4">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-20 w-full rounded-2xl" />
                      ))}
                    </div>
                  ) : messages.length === 0 ? (
                    <Card className="p-6 rounded-3xl text-center text-muted-foreground">
                      <p>No messages yet</p>
                      <p className="text-sm mt-2">Send a voice message to start the conversation!</p>
                    </Card>
                  ) : (
                    messages.map((message) => {
                      const isOwn = message.sender_id === profile.id;
                      return (
                        <div
                          key={message.id}
                          className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                        >
                          <Card
                            className={`p-4 rounded-2xl max-w-[80%] ${
                              isOwn ? 'bg-primary text-primary-foreground' : ''
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <Button
                                variant="ghost"
                                size="icon"
                                className={`rounded-full flex-shrink-0 ${
                                  isOwn ? 'text-primary-foreground hover:bg-primary-foreground/20' : ''
                                }`}
                                onClick={() => handlePlayMessage(message)}
                              >
                                {isPlaying && currentAudioId === message.id ? (
                                  <Pause className="h-4 w-4" />
                                ) : (
                                  <Play className="h-4 w-4" />
                                )}
                              </Button>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1">
                                  <p className="text-sm font-medium">
                                    {isOwn ? 'You' : `@${message.sender?.handle || 'Unknown'}`}
                                  </p>
                                  <p className="text-xs opacity-80">
                                    {message.duration_seconds}s
                                  </p>
                                </div>
                                
                                {/* Waveform visualization */}
                                {message.waveform ? (
                                  <div className="flex items-center gap-1 h-8 mb-2">
                                    {message.waveform.map((value, index) => (
                                      <div
                                        key={index}
                                        className={`flex-1 rounded-sm transition-all ${
                                          isOwn
                                            ? 'bg-primary-foreground/30'
                                            : 'bg-muted-foreground/30'
                                        }`}
                                        style={{
                                          height: `${Math.max(4, value * 100)}%`,
                                          minHeight: '4px',
                                        }}
                                      />
                                    ))}
                                  </div>
                                ) : loadingWaveforms.has(message.id) ? (
                                  <div className="flex items-center gap-1 h-8 mb-2">
                                    {Array.from({ length: 20 }).map((_, index) => (
                                      <div
                                        key={index}
                                        className="flex-1 bg-muted-foreground/20 rounded-sm animate-pulse"
                                        style={{
                                          height: `${Math.random() * 60 + 20}%`,
                                          minHeight: '4px',
                                        }}
                                      />
                                    ))}
                                  </div>
                                ) : null}
                                
                                <p className="text-xs opacity-80 mb-1">
                                  {new Date(message.created_at).toLocaleTimeString()}
                                </p>
                                {message.transcript && (
                                  <p className="text-sm mt-2 opacity-90 line-clamp-2">{message.transcript}</p>
                                )}
                              </div>
                            </div>
                          </Card>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Record Button */}
                <Card className="p-4 rounded-2xl">
                  {isSending ? (
                    <Button
                      className="w-full rounded-2xl"
                      disabled={true}
                    >
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </Button>
                  ) : (
                    <RecordButton onRecordingComplete={handleSendVoiceMessage} />
                  )}
                </Card>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default DirectMessages;

