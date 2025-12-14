import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logError, logInfo } from '@/lib/logger';

interface PeerConnection {
  peerConnection: RTCPeerConnection;
  profileId: string;
  audioElement: HTMLAudioElement;
}

interface UseWebRTCOptions {
  roomId: string;
  profileId: string;
  isSpeaker: boolean;
  enabled?: boolean;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export const useWebRTC = ({ roomId, profileId, isSpeaker, enabled = true }: UseWebRTCOptions) => {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakingParticipants, setSpeakingParticipants] = useState<Set<string>>(new Set());
  
  const peerConnectionsRef = useRef<Map<string, PeerConnection>>(new Map());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const localAudioRef = useRef<HTMLAudioElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const speakingCheckIntervalRef = useRef<number | null>(null);

  // Initialize local audio stream
  const initializeLocalStream = useCallback(async () => {
    if (!isSpeaker || localStream) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
        },
      });

      setLocalStream(stream);

      // Create audio context for speaking detection (in suspended state)
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AudioContextClass();
      
      // Resume if suspended (after user interaction)
      if (audioContextRef.current.state === 'suspended') {
        try {
          await audioContextRef.current.resume();
        } catch (err) {
          // Ignore resume errors - context will work when user interacts
          console.debug('[useWebRTC] AudioContext resume deferred:', err);
        }
      }
      
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.8;
      source.connect(analyserRef.current);

      // Start speaking detection
      startSpeakingDetection();

      return stream;
    } catch (error: any) {
      logError('Error accessing microphone', error);
      toast.error('Could not access microphone. Please check permissions.');
      throw error;
    }
  }, [isSpeaker, localStream]);

  // Speaking detection
  const startSpeakingDetection = useCallback(() => {
    if (speakingCheckIntervalRef.current) {
      clearInterval(speakingCheckIntervalRef.current);
    }

    speakingCheckIntervalRef.current = window.setInterval(() => {
      if (!analyserRef.current || !isSpeaker) {
        setIsSpeaking(false);
        return;
      }

      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyserRef.current.getByteFrequencyData(dataArray);

      // Calculate average volume
      const average = dataArray.reduce((sum, value) => sum + value, 0) / bufferLength;
      const isCurrentlySpeaking = average > 30; // Threshold for speaking

      if (isCurrentlySpeaking !== isSpeaking) {
        setIsSpeaking(isCurrentlySpeaking);
        // Broadcast speaking status
        if (channelRef.current) {
          channelRef.current.send({
            type: 'broadcast',
            event: 'webrtc-signal',
            payload: {
              type: 'speaking',
              profileId,
              isSpeaking: isCurrentlySpeaking,
            },
          });
        }
      }
    }, 200); // Check every 200ms
  }, [isSpeaker, profileId, isSpeaking]);

  // Create peer connection
  const createPeerConnection = useCallback((remoteProfileId: string): RTCPeerConnection => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    // Add local stream tracks to peer connection
    if (localStream && isSpeaker) {
      localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
      });
    }

    // Handle remote stream
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      setRemoteStreams((prev) => {
        const newMap = new Map(prev);
        newMap.set(remoteProfileId, remoteStream);
        return newMap;
      });

      // Create audio element for remote stream
      const audio = document.createElement('audio');
      audio.srcObject = remoteStream;
      audio.autoplay = true;
      audio.volume = 1.0;
      document.body.appendChild(audio);

      // Store audio element
      const peerConn = peerConnectionsRef.current.get(remoteProfileId);
      if (peerConn) {
        peerConn.audioElement = audio;
      }
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'webrtc-signal',
          payload: {
            type: 'ice-candidate',
            profileId,
            targetProfileId: remoteProfileId,
            candidate: event.candidate,
          },
        });
      }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      logInfo(`Connection state with ${remoteProfileId}: ${pc.connectionState}`);
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        // Cleanup
        cleanupPeerConnection(remoteProfileId);
      }
    };

    return pc;
  }, [localStream, isSpeaker, profileId]);

  // Cleanup peer connection
  const cleanupPeerConnection = useCallback((remoteProfileId: string) => {
    const peerConn = peerConnectionsRef.current.get(remoteProfileId);
    if (peerConn) {
      peerConn.peerConnection.close();
      if (peerConn.audioElement) {
        peerConn.audioElement.pause();
        peerConn.audioElement.srcObject = null;
        peerConn.audioElement.remove();
      }
      peerConnectionsRef.current.delete(remoteProfileId);
    }

    setRemoteStreams((prev) => {
      const newMap = new Map(prev);
      newMap.delete(remoteProfileId);
      return newMap;
    });
  }, []);

    // Handle SDP offer
  const handleOffer = useCallback(async (data: any) => {
    if (data.fromProfileId === profileId) return; // Ignore own messages

    let peerConn = peerConnectionsRef.current.get(data.fromProfileId);
    if (!peerConn) {
      const pc = createPeerConnection(data.fromProfileId);
      peerConn = {
        peerConnection: pc,
        profileId: data.fromProfileId,
        audioElement: document.createElement('audio'),
      };
      peerConnectionsRef.current.set(data.fromProfileId, peerConn);
    }

    try {
      await peerConn.peerConnection.setRemoteDescription(
        new RTCSessionDescription(typeof data.offer === 'string' ? JSON.parse(data.offer) : data.offer)
      );
      const answer = await peerConn.peerConnection.createAnswer();
      await peerConn.peerConnection.setLocalDescription(answer);

      // Send answer
      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'webrtc-signal',
          payload: {
            type: 'answer',
            profileId,
            targetProfileId: data.fromProfileId,
            answer: answer.toJSON ? answer.toJSON() : answer,
          },
        });
      }
    } catch (error) {
      logError('Error handling offer', error);
    }
  }, [profileId, createPeerConnection]);

  // Handle SDP answer
  const handleAnswer = useCallback(async (data: any) => {
    if (data.fromProfileId === profileId) return;

    const peerConn = peerConnectionsRef.current.get(data.fromProfileId);
    if (peerConn) {
      try {
        await peerConn.peerConnection.setRemoteDescription(
          new RTCSessionDescription(typeof data.answer === 'string' ? JSON.parse(data.answer) : data.answer)
        );
      } catch (error) {
        logError('Error setting remote description (answer)', error);
      }
    }
  }, [profileId]);

  // Handle ICE candidate
  const handleIceCandidate = useCallback(async (data: any) => {
    if (data.fromProfileId === profileId) return;

    const peerConn = peerConnectionsRef.current.get(data.fromProfileId);
    if (peerConn && data.candidate) {
      try {
        await peerConn.peerConnection.addIceCandidate(
          new RTCIceCandidate(typeof data.candidate === 'string' ? JSON.parse(data.candidate) : data.candidate)
        );
      } catch (error) {
        logError('Error adding ICE candidate', error);
      }
    }
  }, [profileId]);

  // Handle speaking status
  const handleSpeaking = useCallback((data: any) => {
    if (data.profileId === profileId) return;

    setSpeakingParticipants((prev) => {
      const newSet = new Set(prev);
      if (data.isSpeaking) {
        newSet.add(data.profileId);
      } else {
        newSet.delete(data.profileId);
      }
      return newSet;
    });
  }, [profileId]);

  // Connect to new participant
  const connectToParticipant = useCallback(async (remoteProfileId: string, isRemoteSpeaker: boolean) => {
    if (remoteProfileId === profileId) return;
    if (peerConnectionsRef.current.has(remoteProfileId)) return;

    // Only speakers connect to other speakers
    if (!isSpeaker || !isRemoteSpeaker) return;

    const pc = createPeerConnection(remoteProfileId);
    const peerConn: PeerConnection = {
      peerConnection: pc,
      profileId: remoteProfileId,
      audioElement: document.createElement('audio'),
    };
    peerConnectionsRef.current.set(remoteProfileId, peerConn);

    // Create and send offer
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'webrtc-signal',
          payload: {
            type: 'offer',
            profileId,
            targetProfileId: remoteProfileId,
            offer: offer.toJSON ? offer.toJSON() : offer,
          },
        });
      }
    } catch (error) {
      logError('Error creating offer', error);
    }
  }, [profileId, isSpeaker, createPeerConnection]);

  // Initialize WebRTC
  useEffect(() => {
    if (!enabled || !roomId || !profileId) return;

    // Initialize local stream if speaker
    if (isSpeaker) {
      initializeLocalStream().catch((error) => logError('Error initializing local stream', error));
    }

    // Subscribe to Supabase Realtime channel for signaling
    const channel = supabase.channel(`live-room-${roomId}`, {
      config: {
        presence: {
          key: profileId,
        },
      },
    });

    // Handle incoming messages
    channel.on('broadcast', { event: 'webrtc-signal' }, (payload) => {
      const data = payload.payload;
      
      // Check if message is for us
      if (data.targetProfileId && data.targetProfileId !== profileId) {
        return; // Not for us
      }
      
      // Don't process our own messages
      if (data.profileId === profileId || data.fromProfileId === profileId) {
        return;
      }

      switch (data.type) {
        case 'offer':
          handleOffer({ ...data, fromProfileId: data.profileId });
          break;
        case 'answer':
          handleAnswer({ ...data, fromProfileId: data.profileId });
          break;
        case 'ice-candidate':
          handleIceCandidate({ ...data, fromProfileId: data.profileId });
          break;
        case 'speaking':
          handleSpeaking(data);
          break;
      }
    });

    // Track presence
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const participants = Object.keys(state);
      
      // Connect to other speakers
      participants.forEach((participantId) => {
        if (participantId !== profileId) {
          // We'll connect when we know their role from the participants list
          // This is handled by the parent component
        }
      });
    });

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        channel.track({
          profileId,
          isSpeaker,
          joinedAt: new Date().toISOString(),
        });
      }
    });

    channelRef.current = channel;

    return () => {
      // Cleanup
      if (speakingCheckIntervalRef.current) {
        clearInterval(speakingCheckIntervalRef.current);
      }

      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }

      if (audioContextRef.current) {
        audioContextRef.current.close();
      }

      peerConnectionsRef.current.forEach((peerConn) => {
        peerConn.peerConnection.close();
        if (peerConn.audioElement) {
          peerConn.audioElement.pause();
          peerConn.audioElement.srcObject = null;
          peerConn.audioElement.remove();
        }
      });
      peerConnectionsRef.current.clear();

      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [enabled, roomId, profileId, isSpeaker, initializeLocalStream, handleOffer, handleAnswer, handleIceCandidate, handleSpeaking, localStream]);

  // Mute/unmute local stream
  const toggleMute = useCallback((muted: boolean) => {
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }
  }, [localStream]);

  return {
    localStream,
    remoteStreams,
    isSpeaking,
    speakingParticipants,
    connectToParticipant,
    toggleMute,
  };
};

