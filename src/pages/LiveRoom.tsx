import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Mic,
  MicOff,
  Users,
  Settings,
  X,
  Crown,
  Volume2,
  VolumeX,
  UserPlus,
  UserMinus,
  Shield,
  Radio,
  Play,
  Square,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useProfile } from "@/hooks/useProfile";
import { useAdminStatus } from "@/hooks/useAdminStatus";
import { supabase } from "@/integrations/supabase/client";
import { logError, logInfo } from "@/lib/logger";
import { AMAQuestions } from "@/components/AMAQuestions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface RoomParticipant {
  id: string;
  room_id: string;
  profile_id: string;
  role: "host" | "speaker" | "listener" | "moderator";
  is_muted: boolean;
  is_speaking: boolean;
  joined_at: string;
  profiles?: {
    handle: string;
    emoji_avatar: string;
  } | null;
}

interface LiveRoom {
  id: string;
  title: string;
  description: string | null;
  host_profile_id: string | null;
  status: "scheduled" | "live" | "ended";
  participant_count: number;
  speaker_count: number;
  listener_count: number;
  recording_enabled: boolean;
  transcription_enabled: boolean;
  started_at: string | null;
  is_ama?: boolean;
  ama_question_submission_enabled?: boolean;
  ama_question_deadline?: string | null;
  profiles?: {
    handle: string;
    emoji_avatar: string;
  } | null;
}

const LiveRoom = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { isAdmin } = useAdminStatus();
  const { toast } = useToast();
  const [room, setRoom] = useState<LiveRoom | null>(null);
  const [participants, setParticipants] = useState<RoomParticipant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const localAudioRef = useRef<HTMLAudioElement>(null);
  const remoteAudioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const [currentParticipant, setCurrentParticipant] = useState<RoomParticipant | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [isModerator, setIsModerator] = useState(false);

  // Initialize WebRTC (simplified - in production, use a service like Daily.co, Agora, or build a signaling server)
  const initializeWebRTC = async () => {
    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setLocalStream(stream);

      // Set up local audio element
      if (localAudioRef.current) {
        localAudioRef.current.srcObject = stream;
        localAudioRef.current.muted = true; // Mute to avoid feedback
      }

      // In a real implementation, you would:
      // 1. Connect to a signaling server (WebSocket)
      // 2. Exchange SDP offers/answers
      // 3. Exchange ICE candidates
      // 4. Create peer connections for each participant
      // 5. Handle audio tracks from remote peers

      // For now, we'll just track the local stream
      // The actual WebRTC implementation would require a signaling server
      logInfo("WebRTC initialized (simplified version)");
    } catch (error: any) {
      logError("Error initializing WebRTC", error);
      toast({
        title: "Microphone access required",
        description: "Please allow microphone access to join the room",
        variant: "destructive",
      });
    }
  };

  const cleanupWebRTC = () => {
    // Stop local stream
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
    }

    // Close peer connections
    peerConnections.current.forEach((pc) => pc.close());
    peerConnections.current.clear();

    // Clear remote streams
    remoteStreams.forEach((stream) => {
      stream.getTracks().forEach((track) => track.stop());
    });
    setRemoteStreams(new Map());
  };

  const fetchRoom = async () => {
    if (!id) return;

    try {
      const { data, error } = await supabase
        .from("live_rooms")
        .select(
          `
          *,
          host_profile:host_profile_id (
            handle,
            emoji_avatar
          )
        `
        )
        .eq("id", id)
        .single();

      if (error) throw error;

      const formattedRoom: LiveRoom = {
        ...data,
        profiles: Array.isArray(data.host_profile) ? data.host_profile[0] : data.host_profile,
      };

      setRoom(formattedRoom);
      // Admins are treated as hosts
      setIsHost(isAdmin || (profile?.id === formattedRoom.host_profile_id));
    } catch (error: any) {
      logError("Error fetching room", error);
      toast({
        title: "Room not found",
        description: "This room may have been deleted or doesn't exist",
        variant: "destructive",
      });
      navigate("/live-rooms");
    }
  };

  const fetchParticipants = async () => {
    if (!id) return;

    try {
      const { data, error } = await supabase
        .from("room_participants")
        .select(
          `
          *,
          profiles (
            handle,
            emoji_avatar
          )
        `
        )
        .eq("room_id", id)
        .is("left_at", null)
        .order("joined_at", { ascending: true });

      if (error) throw error;

      const formattedParticipants: RoomParticipant[] = (data || []).map((p: any) => ({
        ...p,
        profiles: Array.isArray(p.profiles) ? p.profiles[0] : p.profiles,
      }));

      setParticipants(formattedParticipants);

      // Find current user's participant record
      const current = formattedParticipants.find((p) => p.profile_id === profile?.id);
      setCurrentParticipant(current || null);
      setIsModerator(current?.role === "moderator" || current?.role === "host" || false);
    } catch (error: any) {
      logError("Error fetching participants", error);
    }
  };

  const joinRoom = async () => {
    if (!id || !profile?.id) return;

    try {
      // If this is a community room, check if user is a member
      if (room?.community_id) {
        const { data: membership, error: membershipError } = await supabase
          .from("community_members")
          .select("id")
          .eq("community_id", room.community_id)
          .eq("profile_id", profile.id)
          .maybeSingle();

        if (membershipError) throw membershipError;

        if (!membership) {
          toast({
            title: "Community membership required",
            description: "You must be a member of this community to join its live rooms",
            variant: "destructive",
          });
          // Navigate to community page
          const { data: communityData } = await supabase
            .from("communities")
            .select("slug")
            .eq("id", room.community_id)
            .single();
          
          if (communityData?.slug) {
            navigate(`/community/${communityData.slug}`);
          } else {
            navigate("/communities");
          }
          return;
        }
      }

      // Check if already a participant
      const { data: existing } = await supabase
        .from("room_participants")
        .select("*")
        .eq("room_id", id)
        .eq("profile_id", profile.id)
        .is("left_at", null)
        .single();

      if (!existing) {
        // Join as listener by default
        const { error } = await supabase.from("room_participants").insert({
          room_id: id,
          profile_id: profile.id,
          role: "listener",
        });

        if (error) throw error;
      }

      // Initialize WebRTC
      await initializeWebRTC();

      // Update room status to live if it's scheduled
      if (room?.status === "scheduled") {
        await supabase
          .from("live_rooms")
          .update({ status: "live", started_at: new Date().toISOString() })
          .eq("id", id);
      }

      await fetchParticipants();
      toast({
        title: "Joined room",
        description: "You're now in the room",
      });
    } catch (error: any) {
      logError("Error joining room", error);
      toast({
        title: "Failed to join room",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    }
  };

  const leaveRoom = async () => {
    if (!id || !profile?.id) return;

    try {
      await supabase
        .from("room_participants")
        .update({ left_at: new Date().toISOString() })
        .eq("room_id", id)
        .eq("profile_id", profile.id)
        .is("left_at", null);

      cleanupWebRTC();
      toast({
        title: "Left room",
        description: "You've left the room",
      });
      navigate("/live-rooms");
    } catch (error: any) {
      logError("Error leaving room", error);
    }
  };

  const toggleMute = async () => {
    if (!id || !profile?.id || !currentParticipant) return;

    const newMutedState = !isMuted;

    try {
      // Update local stream
      if (localStream) {
        localStream.getAudioTracks().forEach((track) => {
          track.enabled = newMutedState;
        });
      }

      // Update database
      await supabase
        .from("room_participants")
        .update({ is_muted: newMutedState })
        .eq("id", currentParticipant.id);

      setIsMuted(newMutedState);
    } catch (error: any) {
      logError("Error toggling mute", error);
    }
  };

  const promoteToSpeaker = async (participantId: string) => {
    // Admins can manage participants
    if (!id || (!isHost && !isModerator && !isAdmin)) return;

    try {
      await supabase
        .from("room_participants")
        .update({ role: "speaker" })
        .eq("id", participantId);

      toast({
        title: "Promoted to speaker",
        description: "User can now speak in the room",
      });
      await fetchParticipants();
    } catch (error: any) {
      logError("Error promoting user", error);
    }
  };

  const removeParticipant = async (participantId: string) => {
    // Admins can manage participants
    if (!id || (!isHost && !isModerator && !isAdmin)) return;

    try {
      await supabase
        .from("room_participants")
        .update({ left_at: new Date().toISOString() })
        .eq("id", participantId);

      toast({
        title: "Removed participant",
        description: "User has been removed from the room",
      });
      await fetchParticipants();
    } catch (error: any) {
      logError("Error removing participant", error);
    }
  };

  const muteParticipant = async (participantId: string) => {
    // Admins can manage participants
    if (!id || (!isHost && !isModerator && !isAdmin)) return;

    try {
      await supabase
        .from("room_participants")
        .update({ is_muted: true })
        .eq("id", participantId);

      toast({
        title: "Muted participant",
        description: "User has been muted",
      });
      await fetchParticipants();
    } catch (error: any) {
      logError("Error muting participant", error);
    }
  };

  const endRoom = async () => {
    // Admins can end rooms
    if (!id || (!isHost && !isAdmin)) return;

    if (!confirm("Are you sure you want to end this room? All participants will be disconnected.")) {
      return;
    }

    try {
      await supabase
        .from("live_rooms")
        .update({
          status: "ended",
          ended_at: new Date().toISOString(),
        })
        .eq("id", id);

      cleanupWebRTC();
      toast({
        title: "Room ended",
        description: "The room has been ended",
      });
      navigate("/live-rooms");
    } catch (error: any) {
      logError("Error ending room", error);
    }
  };

  useEffect(() => {
    if (!id || !profile) return;

    setIsLoading(true);
    fetchRoom().then(() => {
      fetchParticipants().then(() => {
        setIsLoading(false);
        joinRoom();
      });
    });

    // Subscribe to room updates
    const roomChannel = supabase
      .channel(`room-${id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "live_rooms",
          filter: `id=eq.${id}`,
        },
        () => {
          fetchRoom();
        }
      )
      .subscribe((status, err) => {
        // Suppress WebSocket errors - non-critical
        if (err && (err.message?.includes("WebSocket") || err.message?.includes("websocket"))) {
          return;
        }
      });

    // Subscribe to participant updates
    const participantsChannel = supabase
      .channel(`room-participants-${id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "room_participants",
          filter: `room_id=eq.${id}`,
        },
        () => {
          fetchParticipants();
        }
      )
      .subscribe((status, err) => {
        // Suppress WebSocket errors - non-critical
        if (err && (err.message?.includes("WebSocket") || err.message?.includes("websocket"))) {
          return;
        }
      });

    return () => {
      cleanupWebRTC();
      supabase.removeChannel(roomChannel);
      supabase.removeChannel(participantsChannel);
    };
  }, [id, profile?.id]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <div className="w-full px-4 lg:px-8 py-6 space-y-6">
          <Skeleton className="h-32 w-full rounded-3xl" />
          <Skeleton className="h-64 w-full rounded-3xl" />
        </div>
      </div>
    );
  }

  if (!room) {
    return null;
  }

  const speakers = participants.filter((p) => p.role === "host" || p.role === "speaker" || p.role === "moderator");
  const listeners = participants.filter((p) => p.role === "listener");

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="w-full px-4 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/live-rooms")} className="rounded-full">
              <X className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-lg font-semibold">{room.title}</h1>
              {room.description && (
                <p className="text-sm text-muted-foreground line-clamp-1">{room.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {room.status === "live" && (
              <Badge variant="destructive" className="gap-1">
                <div className="h-2 w-2 rounded-full bg-current animate-pulse" />
                LIVE
              </Badge>
            )}
            {(isHost || isAdmin) && (
              <Button variant="destructive" size="sm" onClick={endRoom} className="rounded-full">
                End Room
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="w-full px-4 lg:px-8 py-6 space-y-6">
        {/* Room Info */}
        <Card className="p-6 rounded-3xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="text-4xl">{room.profiles?.emoji_avatar || "🎙️"}</div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold">{room.title}</h2>
                  {isHost && <Crown className="h-4 w-4 text-yellow-500" />}
                </div>
                <p className="text-sm text-muted-foreground">
                  Hosted by {room.profiles?.handle || "Unknown"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                <span>{room.participant_count}</span>
              </div>
              {room.recording_enabled && (
                <div className="flex items-center gap-1">
                  <Radio className="h-4 w-4" />
                  <span>Recording</span>
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Participants */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Speakers */}
          <div className="lg:col-span-2 space-y-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Mic className="h-5 w-5" />
              Speakers ({speakers.length})
            </h3>
            <div className="space-y-3">
              {speakers.map((participant) => (
                <Card key={participant.id} className="p-4 rounded-2xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarFallback className="text-xl">
                          {participant.profiles?.emoji_avatar || "👤"}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{participant.profiles?.handle || "Unknown"}</span>
                          {participant.role === "host" && <Crown className="h-3 w-3 text-yellow-500" />}
                          {participant.role === "moderator" && <Shield className="h-3 w-3 text-blue-500" />}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {participant.is_speaking && (
                            <Badge variant="secondary" className="gap-1">
                              <div className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                              Speaking
                            </Badge>
                          )}
                          {participant.is_muted && (
                            <Badge variant="outline" className="gap-1">
                              <MicOff className="h-3 w-3" />
                              Muted
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    {((isHost || isAdmin) || isModerator) && participant.profile_id !== profile?.id && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="rounded-full">
                            <Settings className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => muteParticipant(participant.id)}>
                            <MicOff className="h-4 w-4 mr-2" />
                            Mute
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => removeParticipant(participant.id)}>
                            <UserMinus className="h-4 w-4 mr-2" />
                            Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </Card>
              ))}
            </div>

            {/* Listeners */}
            <div className="mt-6">
              <h3 className="font-semibold flex items-center gap-2 mb-3">
                <Users className="h-5 w-5" />
                Listeners ({listeners.length})
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {listeners.map((participant) => (
                  <Card key={participant.id} className="p-3 rounded-xl">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-sm">
                            {participant.profiles?.emoji_avatar || "👤"}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium truncate">
                          {participant.profiles?.handle || "Unknown"}
                        </span>
                      </div>
                      {((isHost || isAdmin) || isModerator) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full">
                              <Settings className="h-3 w-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem onClick={() => promoteToSpeaker(participant.id)}>
                              <UserPlus className="h-4 w-4 mr-2" />
                              Promote to Speaker
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => removeParticipant(participant.id)}>
                              <UserMinus className="h-4 w-4 mr-2" />
                              Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="space-y-4">
            <Card className="p-6 rounded-3xl space-y-4">
              <h3 className="font-semibold">Controls</h3>
              {currentParticipant && (
                <>
                  <Button
                    onClick={toggleMute}
                    variant={isMuted ? "outline" : "default"}
                    className="w-full rounded-full"
                    size="lg"
                  >
                    {isMuted ? (
                      <>
                        <MicOff className="h-5 w-5 mr-2" />
                        Unmute
                      </>
                    ) : (
                      <>
                        <Mic className="h-5 w-5 mr-2" />
                        Mute
                      </>
                    )}
                  </Button>
                  {(currentParticipant.role === "listener") && (
                    <Button
                      onClick={() => promoteToSpeaker(currentParticipant.id)}
                      variant="outline"
                      className="w-full rounded-full"
                    >
                      <Mic className="h-4 w-4 mr-2" />
                      Request to Speak
                    </Button>
                  )}
                </>
              )}
              <Button
                onClick={leaveRoom}
                variant="destructive"
                className="w-full rounded-full"
              >
                Leave Room
              </Button>
            </Card>

            {room.recording_enabled && (
              <Card className="p-6 rounded-3xl">
                <h3 className="font-semibold mb-3">Recording</h3>
                <div className="space-y-2">
                  {isRecording ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                      Recording in progress...
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      Recording will be available after the room ends
                    </div>
                  )}
                </div>
              </Card>
            )}

            {room.is_ama && (
              <Card className="p-6 rounded-3xl">
                <h3 className="font-semibold mb-4">AMA Questions</h3>
                <AMAQuestions
                  roomId={room.id}
                  isHost={isHost || isAdmin}
                  questionDeadline={room.ama_question_deadline}
                  questionSubmissionEnabled={room.ama_question_submission_enabled}
                />
              </Card>
            )}
          </div>
        </div>
      </main>

      {/* Hidden audio elements for WebRTC */}
      <audio ref={localAudioRef} autoPlay muted />
      {Array.from(remoteStreams.entries()).map(([participantId, stream]) => (
        <audio
          key={participantId}
          ref={(el) => {
            if (el) {
              remoteAudioRefs.current.set(participantId, el);
              el.srcObject = stream;
            }
          }}
          autoPlay
        />
      ))}
    </div>
  );
};

export default LiveRoom;

