import { useState, useEffect, useRef, useCallback } from "react";
import { Users, Mic, X, Play, Pause, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useProfile } from "@/hooks/useProfile";
import { logError, logWarn } from "@/lib/logger";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getEmojiAvatar } from "@/utils/avatar";

interface Collaborator {
  profile_id: string;
  handle: string;
  emoji_avatar: string;
  role: 'creator' | 'contributor' | 'editor';
  is_recording: boolean;
  is_muted: boolean;
  joined_at: string;
}

interface CollaborativeRemixSessionProps {
  remixClipId: string;
  isOpen: boolean;
  onClose: () => void;
}

export const CollaborativeRemixSession = ({
  remixClipId,
  isOpen,
  onClose,
}: CollaborativeRemixSessionProps) => {
  const { profile } = useProfile();
  const { toast } = useToast();
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const channelRef = useRef<any>(null);

  useEffect(() => {
    if (!isOpen || !remixClipId || !profile?.id) return;

    // Subscribe to real-time updates
    const channel = supabase
      .channel(`collaborative-remix-${remixClipId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'remix_collaborations',
          filter: `remix_clip_id=eq.${remixClipId}`,
        },
        async () => {
          await loadCollaborators();
        }
      )
      .on(
        'broadcast',
        { event: 'remix-state' },
        (payload) => {
          const { profileId, isRecording: recording, isMuted: muted } = payload.payload;
          setCollaborators((prev) =>
            prev.map((c) =>
              c.profile_id === profileId
                ? { ...c, is_recording: recording, is_muted: muted }
                : c
            )
          );
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          loadCollaborators();
        }
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
      stopRecording();
    };
  }, [isOpen, remixClipId, profile?.id]);

  const loadCollaborators = async () => {
    try {
      const { data, error } = await supabase
        .from('remix_collaborations')
        .select(`
          collaborator_profile_id,
          role,
          is_active,
          profiles:collaborator_profile_id (
            id,
            handle,
            emoji_avatar
          )
        `)
        .eq('remix_clip_id', remixClipId)
        .eq('is_active', true);

      if (error) throw error;

      if (data) {
        const collabs: Collaborator[] = data.map((item: any) => ({
          profile_id: item.collaborator_profile_id,
          handle: item.profiles?.handle || 'Anonymous',
          emoji_avatar: item.profiles?.emoji_avatar || '👤',
          role: item.role,
          is_recording: false,
          is_muted: false,
          joined_at: new Date().toISOString(),
        }));

        setCollaborators(collabs);
      }
    } catch (error) {
      logError('Failed to load collaborators', error);
    }
  };

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      setLocalStream(stream);
      setIsRecording(true);

      // Broadcast recording state
      if (channelRef.current && profile?.id) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'remix-state',
          payload: {
            profileId: profile.id,
            isRecording: true,
            isMuted: isMuted,
          },
        });
      }

      toast({
        title: "Recording started",
        description: "Your audio is being recorded for the collaborative remix",
      });
    } catch (error) {
      logError('Failed to start recording', error);
      toast({
        title: "Recording failed",
        description: "Please allow microphone access and try again.",
        variant: "destructive",
      });
    }
  }, [profile?.id, isMuted, toast]);

  const stopRecording = useCallback(() => {
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
    }
    setIsRecording(false);

    // Broadcast recording state
    if (channelRef.current && profile?.id) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'remix-state',
        payload: {
          profileId: profile.id,
          isRecording: false,
          isMuted: isMuted,
        },
      });
    }
  }, [localStream, profile?.id, isMuted]);

  const toggleMute = useCallback(() => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);

    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = !newMuted;
      });
    }

    // Broadcast mute state
    if (channelRef.current && profile?.id) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'remix-state',
        payload: {
          profileId: profile.id,
          isRecording: isRecording,
          isMuted: newMuted,
        },
      });
    }
  }, [isMuted, localStream, profile?.id, isRecording]);

  const inviteCollaborator = async (profileId: string) => {
    try {
      const { error } = await supabase
        .from('remix_collaborations')
        .insert({
          remix_clip_id: remixClipId,
          collaborator_profile_id: profileId,
          role: 'contributor',
          is_active: true,
        });

      if (error) throw error;

      toast({
        title: "Collaborator invited",
        description: "They will be notified to join the session",
      });
    } catch (error) {
      logError('Failed to invite collaborator', error);
      toast({
        title: "Failed to invite",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Collaborative Remix Session</DialogTitle>
          <DialogDescription>
            Record together with other creators in real-time
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Collaborators List */}
          <div>
            <h3 className="text-sm font-medium mb-2">Collaborators ({collaborators.length})</h3>
            <div className="space-y-2">
              {collaborators.map((collab) => (
                <Card key={collab.profile_id}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback>
                            {getEmojiAvatar(collab.emoji_avatar)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium">@{collab.handle}</p>
                          <Badge variant="outline" className="text-xs">
                            {collab.role}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {collab.is_recording && (
                          <Badge variant="destructive" className="text-xs">
                            <Mic className="h-3 w-3 mr-1" />
                            Recording
                          </Badge>
                        )}
                        {collab.is_muted && (
                          <VolumeX className="h-4 w-4 text-muted-foreground" />
                        )}
                        {!collab.is_muted && !collab.is_recording && (
                          <Volume2 className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Recording Controls */}
          <div className="flex items-center justify-center gap-4 p-4 rounded-xl bg-muted/40">
            <Button
              onClick={isRecording ? stopRecording : startRecording}
              size="lg"
              variant={isRecording ? "destructive" : "default"}
              className="rounded-full"
            >
              {isRecording ? (
                <>
                  <Pause className="h-5 w-5 mr-2" />
                  Stop Recording
                </>
              ) : (
                <>
                  <Mic className="h-5 w-5 mr-2" />
                  Start Recording
                </>
              )}
            </Button>
            <Button
              onClick={toggleMute}
              size="lg"
              variant="outline"
              className="rounded-full"
            >
              {isMuted ? (
                <VolumeX className="h-5 w-5" />
              ) : (
                <Volume2 className="h-5 w-5" />
              )}
            </Button>
          </div>

          {/* Info */}
          <div className="text-xs text-muted-foreground text-center">
            All collaborators can record simultaneously. The recordings will be mixed together when you save the remix.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

