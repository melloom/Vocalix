import { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Users, Radio, X, UserPlus, Volume2, VolumeX, Waves } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useLiveRoom, useRoomParticipants, useRoomParticipation } from '@/hooks/useLiveRooms';
import { useProfile } from '@/hooks/useProfile';
import { useWebRTC } from '@/hooks/useWebRTC';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

interface LiveRoomProps {
  roomId: string;
  onClose?: () => void;
}

export const LiveRoom = ({ roomId, onClose }: LiveRoomProps) => {
  const { profile } = useProfile();
  const { room, isLoading: isLoadingRoom } = useLiveRoom(roomId);
  const { participants, isLoading: isLoadingParticipants } = useRoomParticipants(roomId);
  const {
    participation,
    isParticipating,
    join,
    leave,
    toggleMute: toggleMuteDB,
    isJoining,
    isLeaving,
  } = useRoomParticipation(roomId);

  // Get user's participation status
  const userParticipation = participants.find((p) => p.profile_id === profile?.id);
  const isHost = userParticipation?.role === 'host';
  const isSpeaker = userParticipation?.role === 'speaker' || isHost;
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
    roomId,
    profileId: profile?.id || '',
    isSpeaker: isSpeaker && isParticipating,
    enabled: isParticipating && isSpeaker,
  });

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
    if (!isParticipating || !userParticipation) return;

    // Update is_speaking status periodically
    const interval = setInterval(async () => {
      if (isUserSpeaking !== userParticipation.is_speaking) {
        // This would ideally be done through a mutation, but for now we'll just track it locally
        // The WebRTC hook handles the real-time speaking detection
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isParticipating, userParticipation, isUserSpeaking]);

  const handleJoin = async (role: 'speaker' | 'listener' = 'listener') => {
    if (isJoining) return; // Prevent double-clicks
    
    try {
      await join(role);
      toast.success(`Joined as ${role}`);
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to join room';
      toast.error(errorMessage);
      
      // If it's a membership error, we might want to navigate or show additional info
      if (errorMessage.includes('member') || errorMessage.includes('community')) {
        // The error is already shown, but we could add navigation here if needed
      }
    }
  };

  const handleLeave = async () => {
    if (isLeaving) return; // Prevent double-clicks
    
    try {
      await leave();
      toast.success('Left the room');
      // Call onClose if provided (for modal)
      if (onClose) {
        onClose();
      }
    } catch (error: any) {
      toast.error(error?.message || 'Failed to leave room');
    }
  };

  const handleToggleMute = async () => {
    if (!isSpeaker || !userParticipation) return;
    const newMutedState = !userParticipation.is_muted;
    try {
      // Update database
      await toggleMuteDB(newMutedState);
      // Update WebRTC stream
      toggleMuteWebRTC(newMutedState);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to toggle mute');
    }
  };

  if (isLoadingRoom) {
    return (
      <Card className="p-6 rounded-3xl">
        <div className="space-y-4">
          <Skeleton className="h-8 w-3/4 rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </Card>
    );
  }

  if (!room) {
    return (
      <Card className="p-6 rounded-3xl text-center space-y-4">
        <p className="text-muted-foreground">Room not found or you don't have access</p>
        {onClose && (
          <Button onClick={onClose} variant="outline" className="rounded-2xl">
            Close
          </Button>
        )}
      </Card>
    );
  }

  const speakers = participants.filter((p) => p.role === 'host' || p.role === 'speaker');
  const listeners = participants.filter((p) => p.role === 'listener');

  return (
    <Card className="flex flex-col h-[600px] sm:h-[700px] rounded-3xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-gradient-to-r from-primary/10 to-primary/5">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Radio className="w-6 h-6 text-primary" />
            {room.status === 'live' && (
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
            )}
          </div>
          <div>
            <h3 className="font-semibold">{room.title}</h3>
            {room.description && (
              <p className="text-xs text-muted-foreground">{room.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={room.status === 'live' ? 'default' : 'secondary'}>
            {room.status === 'live' ? 'LIVE' : 'Scheduled'}
          </Badge>
          {onClose && (
            <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Room Stats */}
      <div className="p-4 border-b border-border bg-muted/30">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Users className="w-4 h-4 text-primary" />
              <span className="font-medium">{room.participant_count} participants</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Mic className="w-4 h-4 text-primary" />
              <span className="font-medium">{room.speaker_count} speakers</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Volume2 className="w-4 h-4 text-primary" />
              <span className="font-medium">{room.listener_count} listeners</span>
            </div>
          </div>
          {room.started_at && (
            <span className="text-xs text-muted-foreground">
              Started {formatDistanceToNow(new Date(room.started_at), { addSuffix: true })}
            </span>
          )}
        </div>
      </div>

      {/* Participants */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Speakers */}
        {speakers.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <Mic className="w-4 h-4" />
              Speakers ({speakers.length})
            </h4>
            <div className="space-y-2">
              {speakers.map((participant) => {
                const isCurrentlySpeaking = speakingParticipants.has(participant.profile_id) || 
                  (participant.profile_id === profile?.id && isUserSpeaking);
                const isRemote = participant.profile_id !== profile?.id;
                const hasAudio = isRemote ? remoteStreams.has(participant.profile_id) : true;
                
                return (
                  <Card
                    key={participant.id}
                    className={`p-3 rounded-2xl flex items-center justify-between transition-all ${
                      isCurrentlySpeaking ? 'ring-2 ring-primary bg-primary/10' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="text-2xl">{participant.profiles?.emoji_avatar || '👤'}</div>
                        {isCurrentlySpeaking && (
                          <div className="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full animate-pulse" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-sm flex items-center gap-2">
                          @{participant.profiles?.handle || 'Anonymous'}
                          {participant.role === 'host' && (
                            <Badge variant="default" className="text-xs">Host</Badge>
                          )}
                          {participant.profile_id === profile?.id && (
                            <Badge variant="outline" className="text-xs">You</Badge>
                          )}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          {isCurrentlySpeaking && (
                            <div className="flex items-center gap-1 text-xs text-primary">
                              <Waves className="w-3 h-3" />
                              Speaking
                            </div>
                          )}
                          {!hasAudio && isRemote && (
                            <span className="text-xs text-muted-foreground">Connecting...</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {participant.is_muted ? (
                        <MicOff className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <Mic className={`w-4 h-4 ${isCurrentlySpeaking ? 'text-primary' : 'text-foreground'}`} />
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Listeners */}
        {listeners.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <Volume2 className="w-4 h-4" />
              Listeners ({listeners.length})
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {listeners.map((participant) => (
                <Card key={participant.id} className="p-2 rounded-xl text-center">
                  <div className="text-xl mb-1">{participant.profiles?.emoji_avatar || '👤'}</div>
                  <p className="text-xs truncate">@{participant.profiles?.handle || 'Anonymous'}</p>
                </Card>
              ))}
            </div>
          </div>
        )}

        {isLoadingParticipants && (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-2xl" />
            ))}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="p-4 border-t border-border bg-muted/30">
        {!isParticipating ? (
          <div className="flex gap-2">
            {room.status === 'scheduled' ? (
              <div className="w-full space-y-2">
                <p className="text-sm text-muted-foreground text-center">
                  {room.scheduled_start_time 
                    ? `Room starts ${formatDistanceToNow(new Date(room.scheduled_start_time), { addSuffix: true })}`
                    : 'Room is scheduled to start soon'}
                </p>
                <Button
                  onClick={() => handleJoin('listener')}
                  disabled={isJoining || isLoadingRoom}
                  className="w-full rounded-2xl"
                  variant="outline"
                >
                  <Volume2 className="w-4 h-4 mr-2" />
                  {isJoining ? 'Joining...' : 'Join as Listener (Wait for Start)'}
                </Button>
              </div>
            ) : (
              <>
                <Button
                  onClick={() => handleJoin('listener')}
                  disabled={isJoining || room.status !== 'live' || isLoadingRoom}
                  className="flex-1 rounded-2xl"
                  variant="outline"
                >
                  <Volume2 className="w-4 h-4 mr-2" />
                  {isJoining ? 'Joining...' : 'Join as Listener'}
                </Button>
                {room.speaker_count < room.max_speakers && (
                  <Button
                    onClick={() => handleJoin('speaker')}
                    disabled={isJoining || room.status !== 'live' || isLoadingRoom}
                    className="flex-1 rounded-2xl"
                  >
                    <Mic className="w-4 h-4 mr-2" />
                    {isJoining ? 'Joining...' : 'Join as Speaker'}
                  </Button>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="flex gap-2">
            {isSpeaker && (
              <Button
                onClick={handleToggleMute}
                variant={userParticipation?.is_muted ? 'destructive' : 'default'}
                className="flex-1 rounded-2xl"
                disabled={!isSpeaker}
              >
                {userParticipation?.is_muted ? (
                  <>
                    <MicOff className="w-4 h-4 mr-2" />
                    Unmute
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4 mr-2" />
                    Mute
                  </>
                )}
              </Button>
            )}
            <Button
              onClick={handleLeave}
              disabled={isLeaving}
              variant="outline"
              className="flex-1 rounded-2xl"
            >
              <X className="w-4 h-4 mr-2" />
              {isLeaving ? 'Leaving...' : 'Leave Room'}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
};

