import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Mic,
  MicOff,
  Users,
  X,
  Crown,
  Volume2,
  VolumeX,
  UserPlus,
  UserMinus,
  Settings,
  Hand,
  Radio,
  ChevronDown,
  ChevronUp,
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
import {
  useLiveRoom,
  useRoomParticipants,
  useRoomParticipation,
  usePromoteViewerToSpeaker,
  useInviteViewerToSpeak,
  useRequestToSpeak,
  RoomParticipant,
} from "@/hooks/useLiveRooms";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useWebRTC } from "@/hooks/useWebRTC";

export const TikTokLiveRoom = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { isAdmin } = useAdminStatus();
  const { toast } = useToast();
  const [isMuted, setIsMuted] = useState(true);
  const [showParticipants, setShowParticipants] = useState(false);
  const [showHostControls, setShowHostControls] = useState(false);

  const { room, isLoading: isLoadingRoom } = useLiveRoom(id || null);
  const { participants, isLoading: isLoadingParticipants } = useRoomParticipants(id || null);
  const {
    participation,
    isParticipating,
    join,
    leave,
    toggleMute: toggleMuteDB,
    isJoining,
  } = useRoomParticipation(id || null);

  const promoteViewer = usePromoteViewerToSpeaker(id || null);
  const inviteViewer = useInviteViewerToSpeak(id || null);
  const requestToSpeak = useRequestToSpeak(id || null);

  // Get user's participation status
  const userParticipation = participants.find((p) => p.profile_id === profile?.id);
  const isHost = isAdmin || (userParticipation?.role === 'host');
  const isSpeaker = userParticipation?.role === 'speaker' || isHost;
  const isViewer = userParticipation?.role === 'viewer' || (!userParticipation && room);
  const canSpeak = isSpeaker && !userParticipation?.is_muted;

  // Initialize WebRTC when participating as speaker
  const {
    localStream,
    remoteStreams,
    isSpeaking: isUserSpeaking,
    speakingParticipants,
    connectToParticipant,
    toggleMute: toggleMuteWebRTC,
  } = useWebRTC({
    roomId: id || '',
    profileId: profile?.id || '',
    isSpeaker: isSpeaker && isParticipating,
    enabled: isParticipating && isSpeaker,
  });

  // Auto-join as viewer if not participating
  useEffect(() => {
    if (!id || !profile?.id || isParticipating || isJoining) return;
    if (room?.status === 'live' || room?.status === 'scheduled') {
      join('viewer');
    }
  }, [id, profile?.id, room?.status, isParticipating, isJoining, join]);

  // Connect to other speakers when they join
  useEffect(() => {
    if (!isParticipating || !isSpeaker) return;

    const otherSpeakers = participants.filter(
      (p) => (p.role === 'speaker' || p.role === 'host') && p.profile_id !== profile?.id && !p.left_at
    );

    otherSpeakers.forEach((speaker) => {
      connectToParticipant(speaker.profile_id, true);
    });
  }, [participants, isParticipating, isSpeaker, profile?.id, connectToParticipant]);

  // Update speaking status in database
  useEffect(() => {
    if (!isParticipating || !userParticipation?.id) return;

    const updateSpeakingStatus = async () => {
      await supabase
        .from('room_participants')
        .update({ is_speaking: isUserSpeaking })
        .eq('id', userParticipation.id);
    };

    updateSpeakingStatus();
  }, [isUserSpeaking, isParticipating, userParticipation?.id]);

  const handleToggleMute = async () => {
    if (!isSpeaker) {
      toast({
        title: "Cannot speak",
        description: "You must be a speaker to unmute",
        variant: "destructive",
      });
      return;
    }

    const newMutedState = !isMuted;
    setIsMuted(newMutedState);
    toggleMuteWebRTC(newMutedState);
    await toggleMuteDB(newMutedState);
  };

  const handleRequestToSpeak = async () => {
    try {
      await requestToSpeak.mutateAsync();
      toast({
        title: "Request sent",
        description: "You can now speak in this room",
      });
    } catch (error: any) {
      toast({
        title: "Failed to request",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    }
  };

  const handlePromoteViewer = async (viewerId: string) => {
    try {
      await promoteViewer.mutateAsync(viewerId);
      toast({
        title: "Promoted",
        description: "Viewer is now a speaker",
      });
    } catch (error: any) {
      toast({
        title: "Failed to promote",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    }
  };

  const handleInviteViewer = async (viewerId: string) => {
    try {
      await inviteViewer.mutateAsync(viewerId);
      toast({
        title: "Invited",
        description: "Viewer has been invited to speak",
      });
    } catch (error: any) {
      toast({
        title: "Failed to invite",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    }
  };

  const handleLeave = async () => {
    await leave();
    navigate("/live-rooms");
  };

  if (isLoadingRoom) {
    return (
      <div className="fixed inset-0 bg-black z-50 flex items-center justify-center">
        <Skeleton className="h-full w-full" />
      </div>
    );
  }

  if (!room) {
    return null;
  }

  const speakers = participants.filter((p) => 
    (p.role === 'host' || p.role === 'speaker' || p.role === 'moderator') && !p.left_at
  );
  const listeners = participants.filter((p) => 
    p.role === 'listener' && !p.left_at
  );
  const viewers = participants.filter((p) => 
    p.role === 'viewer' && !p.left_at
  );

  // Get counts from room data or calculate from participants
  const speakerCount = room.speaker_count || speakers.length;
  const listenerCount = room.listener_count || listeners.length;
  const viewerCount = room.viewer_count || viewers.length;
  const totalCount = room.participant_count || (speakerCount + listenerCount + viewerCount);

  return (
    <div className="fixed inset-0 bg-gradient-to-b from-black via-gray-900 to-black z-50 overflow-hidden">
      {/* Header - Minimal, TikTok-style */}
      <div className="absolute top-0 left-0 right-0 z-20 bg-gradient-to-b from-black/80 to-transparent p-4">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/live-rooms")}
            className="rounded-full bg-black/50 backdrop-blur-sm text-white hover:bg-black/70"
          >
            <X className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            {room.status === "live" && (
              <Badge variant="destructive" className="gap-1.5 bg-red-500/90">
                <div className="h-2 w-2 rounded-full bg-current animate-pulse" />
                LIVE
              </Badge>
            )}
            {/* Participant Counts */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 text-white text-xs bg-black/50 backdrop-blur-sm px-2 py-1 rounded-full">
                <Mic className="h-3 w-3" />
                <span>{speakerCount}</span>
              </div>
              <div className="flex items-center gap-1 text-white text-xs bg-black/50 backdrop-blur-sm px-2 py-1 rounded-full">
                <Users className="h-3 w-3" />
                <span>{listenerCount}</span>
              </div>
              <div className="flex items-center gap-1 text-white text-xs bg-black/50 backdrop-blur-sm px-2 py-1 rounded-full">
                <Users className="h-3 w-3" />
                <span>{viewerCount}</span>
              </div>
              <div className="flex items-center gap-1 text-white text-sm bg-black/50 backdrop-blur-sm px-3 py-1.5 rounded-full">
                <Users className="h-4 w-4" />
                <span>{totalCount}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - TikTok-style vertical layout */}
      <div className="h-full flex flex-col pt-16 pb-24">
        {/* Room Title & Host Info */}
        <div className="px-4 pt-4 pb-2">
          <h1 className="text-2xl font-bold text-white mb-1">{room.title}</h1>
          {room.description && (
            <p className="text-sm text-gray-300 line-clamp-2">{room.description}</p>
          )}
          <div className="flex items-center gap-2 mt-2">
            <Avatar className="h-6 w-6">
              <AvatarFallback className="text-xs">
                {room.profiles?.emoji_avatar || "🎙️"}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm text-gray-300">
              {room.profiles?.handle || "Unknown"}
            </span>
            {isHost && <Crown className="h-4 w-4 text-yellow-400" />}
          </div>
        </div>

        {/* Role-based UI Sections */}
        {isHost ? (
          /* HOST UI */
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="space-y-4">
              {/* Stats Cards for Host */}
              <div className="grid grid-cols-3 gap-2">
                <Card className="p-3 rounded-xl bg-gradient-to-br from-purple-600/20 to-purple-800/20 border-purple-500/30">
                  <div className="flex flex-col items-center">
                    <Mic className="h-5 w-5 text-purple-400 mb-1" />
                    <span className="text-2xl font-bold text-white">{speakerCount}</span>
                    <span className="text-xs text-gray-400">Speakers</span>
                  </div>
                </Card>
                <Card className="p-3 rounded-xl bg-gradient-to-br from-blue-600/20 to-blue-800/20 border-blue-500/30">
                  <div className="flex flex-col items-center">
                    <Users className="h-5 w-5 text-blue-400 mb-1" />
                    <span className="text-2xl font-bold text-white">{listenerCount}</span>
                    <span className="text-xs text-gray-400">Listeners</span>
                  </div>
                </Card>
                <Card className="p-3 rounded-xl bg-gradient-to-br from-green-600/20 to-green-800/20 border-green-500/30">
                  <div className="flex flex-col items-center">
                    <Users className="h-5 w-5 text-green-400 mb-1" />
                    <span className="text-2xl font-bold text-white">{viewerCount}</span>
                    <span className="text-xs text-gray-400">Viewers</span>
                  </div>
                </Card>
              </div>

              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Mic className="h-5 w-5" />
                  Speakers ({speakers.length})
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowHostControls(!showHostControls)}
                  className="text-white"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </div>

              {/* Speakers Grid */}
              <div className="grid grid-cols-2 gap-3">
                {speakers.map((speaker) => (
                  <Card
                    key={speaker.id}
                    className="p-4 rounded-2xl bg-gradient-to-br from-gray-800/50 to-gray-900/50 backdrop-blur-sm border-gray-700/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <Avatar className="h-12 w-12">
                          <AvatarFallback className="text-lg">
                            {speaker.profiles?.emoji_avatar || "👤"}
                          </AvatarFallback>
                        </Avatar>
                        {speakingParticipants.has(speaker.profile_id) && (
                          <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-green-500 animate-pulse border-2 border-gray-900" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="font-medium text-white text-sm truncate">
                            {speaker.profiles?.handle || "Unknown"}
                          </span>
                          {speaker.role === "host" && (
                            <Crown className="h-3 w-3 text-yellow-400 flex-shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          {speaker.is_speaking && (
                            <Badge variant="secondary" className="gap-1 text-xs px-1.5 py-0">
                              <div className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                              Speaking
                            </Badge>
                          )}
                          {speaker.is_muted && (
                            <Badge variant="outline" className="text-xs px-1.5 py-0">
                              <MicOff className="h-3 w-3" />
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              {/* Listeners Section */}
              {listeners.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-md font-semibold text-white flex items-center gap-2 mb-2">
                    <Users className="h-4 w-4" />
                    Listeners ({listeners.length})
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    {listeners.slice(0, 6).map((listener) => (
                      <Card
                        key={listener.id}
                        className="p-2 rounded-lg bg-gray-800/30 backdrop-blur-sm border-gray-700/30"
                      >
                        <div className="flex flex-col items-center gap-1">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs">
                              {listener.profiles?.emoji_avatar || "👤"}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-xs text-white truncate w-full text-center">
                            {listener.profiles?.handle || "Unknown"}
                          </span>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Viewers Section - Collapsible */}
              <div className="mt-4">
                <Button
                  variant="ghost"
                  onClick={() => setShowParticipants(!showParticipants)}
                  className="w-full justify-between text-white hover:bg-gray-800/50"
                >
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    <span>Viewers ({viewerCount})</span>
                  </div>
                  {showParticipants ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>

                {showParticipants && (
                  <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
                    {viewers.slice(0, 20).map((viewer) => (
                      <Card
                        key={viewer.id}
                        className="p-3 rounded-xl bg-gray-800/30 backdrop-blur-sm border-gray-700/30"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="text-sm">
                                {viewer.profiles?.emoji_avatar || "👤"}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm text-white">
                              {viewer.profiles?.handle || "Unknown"}
                            </span>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full">
                                <Settings className="h-3 w-3 text-white" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuItem onClick={() => handlePromoteViewer(viewer.profile_id)}>
                                <UserPlus className="h-4 w-4 mr-2" />
                                Promote to Speaker
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleInviteViewer(viewer.profile_id)}>
                                <Mic className="h-4 w-4 mr-2" />
                                Invite to Speak
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : isSpeaker ? (
          /* SPEAKER UI */
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="space-y-4">
              {/* Stats for Speaker */}
              <div className="grid grid-cols-3 gap-2">
                <Card className="p-3 rounded-xl bg-gradient-to-br from-purple-600/20 to-purple-800/20 border-purple-500/30">
                  <div className="flex flex-col items-center">
                    <Mic className="h-5 w-5 text-purple-400 mb-1" />
                    <span className="text-xl font-bold text-white">{speakerCount}</span>
                    <span className="text-xs text-gray-400">Speakers</span>
                  </div>
                </Card>
                <Card className="p-3 rounded-xl bg-gradient-to-br from-blue-600/20 to-blue-800/20 border-blue-500/30">
                  <div className="flex flex-col items-center">
                    <Users className="h-5 w-5 text-blue-400 mb-1" />
                    <span className="text-xl font-bold text-white">{listenerCount}</span>
                    <span className="text-xs text-gray-400">Listeners</span>
                  </div>
                </Card>
                <Card className="p-3 rounded-xl bg-gradient-to-br from-green-600/20 to-green-800/20 border-green-500/30">
                  <div className="flex flex-col items-center">
                    <Users className="h-5 w-5 text-green-400 mb-1" />
                    <span className="text-xl font-bold text-white">{viewerCount}</span>
                    <span className="text-xs text-gray-400">Viewers</span>
                  </div>
                </Card>
              </div>

              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Mic className="h-5 w-5" />
                Speakers ({speakers.length})
              </h2>

              {/* Speakers Grid */}
              <div className="grid grid-cols-2 gap-3">
                {speakers.map((speaker) => (
                  <Card
                    key={speaker.id}
                    className="p-4 rounded-2xl bg-gradient-to-br from-gray-800/50 to-gray-900/50 backdrop-blur-sm border-gray-700/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <Avatar className="h-12 w-12">
                          <AvatarFallback className="text-lg">
                            {speaker.profiles?.emoji_avatar || "👤"}
                          </AvatarFallback>
                        </Avatar>
                        {speakingParticipants.has(speaker.profile_id) && (
                          <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-green-500 animate-pulse border-2 border-gray-900" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="font-medium text-white text-sm truncate">
                            {speaker.profiles?.handle || "Unknown"}
                          </span>
                          {speaker.role === "host" && (
                            <Crown className="h-3 w-3 text-yellow-400 flex-shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          {speaker.is_speaking && (
                            <Badge variant="secondary" className="gap-1 text-xs px-1.5 py-0">
                              <div className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                              Speaking
                            </Badge>
                          )}
                          {speaker.is_muted && (
                            <Badge variant="outline" className="text-xs px-1.5 py-0">
                              <MicOff className="h-3 w-3" />
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* VIEWER UI */
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="space-y-4">
              {/* Stats for Viewer */}
              <div className="grid grid-cols-3 gap-2">
                <Card className="p-3 rounded-xl bg-gradient-to-br from-purple-600/20 to-purple-800/20 border-purple-500/30">
                  <div className="flex flex-col items-center">
                    <Mic className="h-5 w-5 text-purple-400 mb-1" />
                    <span className="text-xl font-bold text-white">{speakerCount}</span>
                    <span className="text-xs text-gray-400">Speakers</span>
                  </div>
                </Card>
                <Card className="p-3 rounded-xl bg-gradient-to-br from-blue-600/20 to-blue-800/20 border-blue-500/30">
                  <div className="flex flex-col items-center">
                    <Users className="h-5 w-5 text-blue-400 mb-1" />
                    <span className="text-xl font-bold text-white">{listenerCount}</span>
                    <span className="text-xs text-gray-400">Listeners</span>
                  </div>
                </Card>
                <Card className="p-3 rounded-xl bg-gradient-to-br from-green-600/20 to-green-800/20 border-green-500/30">
                  <div className="flex flex-col items-center">
                    <Users className="h-5 w-5 text-green-400 mb-1" />
                    <span className="text-xl font-bold text-white">{viewerCount}</span>
                    <span className="text-xs text-gray-400">Viewers</span>
                  </div>
                </Card>
              </div>

              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Mic className="h-5 w-5" />
                Speakers ({speakers.length})
              </h2>

              {/* Speakers Grid - Viewers see speakers prominently */}
              <div className="grid grid-cols-2 gap-3">
                {speakers.map((speaker) => (
                  <Card
                    key={speaker.id}
                    className="p-4 rounded-2xl bg-gradient-to-br from-gray-800/50 to-gray-900/50 backdrop-blur-sm border-gray-700/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <Avatar className="h-12 w-12">
                          <AvatarFallback className="text-lg">
                            {speaker.profiles?.emoji_avatar || "👤"}
                          </AvatarFallback>
                        </Avatar>
                        {speakingParticipants.has(speaker.profile_id) && (
                          <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-green-500 animate-pulse border-2 border-gray-900" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="font-medium text-white text-sm truncate">
                            {speaker.profiles?.handle || "Unknown"}
                          </span>
                          {speaker.role === "host" && (
                            <Crown className="h-3 w-3 text-yellow-400 flex-shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          {speaker.is_speaking && (
                            <Badge variant="secondary" className="gap-1 text-xs px-1.5 py-0">
                              <div className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                              Speaking
                            </Badge>
                          )}
                          {speaker.is_muted && (
                            <Badge variant="outline" className="text-xs px-1.5 py-0">
                              <MicOff className="h-3 w-3" />
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              {/* Viewers see other viewers */}
              {viewerCount > 0 && (
                <div className="mt-4">
                  <h3 className="text-md font-semibold text-white flex items-center gap-2 mb-2">
                    <Users className="h-4 w-4" />
                    Other Viewers ({viewerCount})
                  </h3>
                  <div className="grid grid-cols-4 gap-2">
                    {viewers.slice(0, 8).map((viewer) => (
                      <Card
                        key={viewer.id}
                        className="p-2 rounded-lg bg-gray-800/30 backdrop-blur-sm border-gray-700/30"
                      >
                        <div className="flex flex-col items-center gap-1">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs">
                              {viewer.profiles?.emoji_avatar || "👤"}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-xs text-white truncate w-full text-center">
                            {viewer.profiles?.handle || "Unknown"}
                          </span>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

        {/* Bottom Controls - Role-specific TikTok-style fixed bottom */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-4 space-y-3">
          {isHost ? (
            /* HOST CONTROLS */
            <>
              <Button
                onClick={handleToggleMute}
                variant={isMuted ? "outline" : "default"}
                className="w-full rounded-full h-14 text-lg font-semibold bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-700 hover:to-orange-700 border-0"
                disabled={!canSpeak}
              >
                {isMuted ? (
                  <>
                    <MicOff className="h-5 w-5 mr-2" />
                    Tap to Unmute (Host)
                  </>
                ) : (
                  <>
                    <Mic className="h-5 w-5 mr-2" />
                    Tap to Mute (Host)
                  </>
                )}
              </Button>
              <div className="flex gap-2">
                <Button
                  onClick={() => setShowHostControls(!showHostControls)}
                  variant="outline"
                  className="flex-1 rounded-full border-yellow-500/50 text-white hover:bg-yellow-500/20"
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Manage Room
                </Button>
                <Button
                  onClick={handleLeave}
                  variant="outline"
                  className="flex-1 rounded-full border-gray-700 text-white hover:bg-gray-800"
                >
                  Leave
                </Button>
              </div>
            </>
          ) : isSpeaker ? (
            /* SPEAKER CONTROLS */
            <>
              <Button
                onClick={handleToggleMute}
                variant={isMuted ? "outline" : "default"}
                className="w-full rounded-full h-14 text-lg font-semibold bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 border-0"
                disabled={!canSpeak}
              >
                {isMuted ? (
                  <>
                    <MicOff className="h-5 w-5 mr-2" />
                    Tap to Unmute
                  </>
                ) : (
                  <>
                    <Mic className="h-5 w-5 mr-2" />
                    Tap to Mute
                  </>
                )}
              </Button>
              <div className="flex gap-2">
                <Button
                  onClick={handleLeave}
                  variant="outline"
                  className="flex-1 rounded-full border-gray-700 text-white hover:bg-gray-800"
                >
                  Leave
                </Button>
                {room.recording_enabled && (
                  <Button
                    variant="outline"
                    className="rounded-full border-gray-700 text-white hover:bg-gray-800"
                    size="icon"
                  >
                    <Radio className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </>
          ) : (
            /* VIEWER CONTROLS */
            <>
              <Button
                onClick={handleRequestToSpeak}
                variant="default"
                className="w-full rounded-full h-14 text-lg font-semibold bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700"
                disabled={requestToSpeak.isPending}
              >
                <Hand className="h-5 w-5 mr-2" />
                {requestToSpeak.isPending ? "Requesting..." : "Request to Speak"}
              </Button>
              <div className="flex gap-2">
                <Button
                  onClick={handleLeave}
                  variant="outline"
                  className="flex-1 rounded-full border-gray-700 text-white hover:bg-gray-800"
                >
                  Leave
                </Button>
                {room.recording_enabled && (
                  <Button
                    variant="outline"
                    className="rounded-full border-gray-700 text-white hover:bg-gray-800"
                    size="icon"
                  >
                    <Radio className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Host Controls Modal */}
      {showHostControls && isHost && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-30 flex items-end">
          <Card className="w-full rounded-t-3xl p-6 bg-gray-900 border-t border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-white">Host Controls</h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowHostControls(false)}
                className="text-white"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="space-y-3">
              <div>
                <h4 className="text-sm font-medium text-gray-300 mb-2">Manage Speakers</h4>
                <div className="space-y-2">
                  {speakers.map((speaker) => (
                    <div
                      key={speaker.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-gray-800"
                    >
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {speaker.profiles?.emoji_avatar || "👤"}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm text-white">
                          {speaker.profiles?.handle || "Unknown"}
                        </span>
                      </div>
                      {speaker.profile_id !== profile?.id && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <Settings className="h-4 w-4 text-white" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem onClick={() => {
                              supabase
                                .from('room_participants')
                                .update({ is_muted: !speaker.is_muted })
                                .eq('id', speaker.id);
                            }}>
                              {speaker.is_muted ? (
                                <>
                                  <Volume2 className="h-4 w-4 mr-2" />
                                  Unmute
                                </>
                              ) : (
                                <>
                                  <VolumeX className="h-4 w-4 mr-2" />
                                  Mute
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => {
                                supabase
                                  .from('room_participants')
                                  .update({ left_at: new Date().toISOString() })
                                  .eq('id', speaker.id);
                              }}
                              className="text-red-400"
                            >
                              <UserMinus className="h-4 w-4 mr-2" />
                              Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

