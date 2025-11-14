import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Mic, X, Check, Waves, Play, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useUploadQueue } from "@/context/UploadQueueContext";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAudioEnhancements } from "@/hooks/useAudioEnhancements";
import { AudioEnhancementControls } from "@/components/AudioEnhancementControls";
import { EmojiPicker } from "@/components/EmojiPicker";
import { logError, logWarn } from "@/lib/logger";

interface RecordModalProps {
  isOpen: boolean;
  onClose: () => void;
  topicId: string;
  onSuccess: () => void;
  profileCity?: string | null;
  profileConsentCity?: boolean;
  tapToRecordPreferred?: boolean;
  parentClipId?: string | null;
  remixOfClipId?: string | null;
  chainId?: string | null;
  challengeId?: string | null;
  communityId?: string | null;
  replyingTo?: {
    id: string;
    handle: string;
    summary?: string | null;
  } | null;
  remixingFrom?: {
    id: string;
    handle: string;
    summary?: string | null;
  } | null;
  continuingChain?: {
    id: string;
    title?: string | null;
  } | null;
}

const MOOD_EMOJIS = ["😊", "😔", "🤯", "🧘‍♀️", "💡", "🔥", "❤️", "😂", "🙏"];
const SILENCE_THRESHOLD = 0.05;
const MAX_DURATION_SHORT = 30; // Regular clips: 30 seconds
const MAX_DURATION_PODCAST = 600; // Podcast mode: 10 minutes
const WAVEFORM_BINS = 24;

export const RecordModal = ({
  isOpen,
  onClose,
  topicId,
  onSuccess,
  profileCity,
  profileConsentCity,
  tapToRecordPreferred = false,
  parentClipId = null,
  remixOfClipId = null,
  chainId = null,
  challengeId = null,
  communityId = null,
  replyingTo = null,
  remixingFrom = null,
  continuingChain = null,
}: RecordModalProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [duration, setDuration] = useState(0);
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [waveform, setWaveform] = useState<number[]>(Array(WAVEFORM_BINS).fill(0.5));
  const [isSensitive, setIsSensitive] = useState(false);
  const [title, setTitle] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [isPodcastMode, setIsPodcastMode] = useState(false);
  
  // Dynamic max duration based on podcast mode
  const MAX_DURATION = isPodcastMode ? MAX_DURATION_PODCAST : MAX_DURATION_SHORT;

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timerRef = useRef<number | null>(null);
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const playbackTimerRef = useRef<number | null>(null);

  const { toast } = useToast();
  const { enqueueUpload, isProcessing } = useUploadQueue();
  
  // Audio enhancements for playback
  const { enhancements, updateEnhancement } = useAudioEnhancements(audioPlayerRef);

  const parseTags = useCallback(
    (value: string) =>
      value
        .split(/[,\s]+/)
        .map((tag) => tag.trim().replace(/^#/, "").toLowerCase())
        .filter((tag, index, all) => tag.length > 0 && all.indexOf(tag) === index),
    [],
  );

  const tagList = useMemo(() => parseTags(tagInput), [parseTags, tagInput]);

  const cleanupAudio = useCallback(() => {
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }
    analyserRef.current = null;
  }, []);

  const stopTracking = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    startTimeRef.current = null;
  }, []);

  const animateWaveform = useCallback(() => {
    if (!analyserRef.current || !isRecording) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    try {
      // Use frequency data for better visualization of audio levels
      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyserRef.current.getByteFrequencyData(dataArray);

      // Convert frequency data to waveform visualization
      // Group frequency bins into waveform bins
      const sliceSize = Math.floor(bufferLength / WAVEFORM_BINS);
      const newWaveform = Array.from({ length: WAVEFORM_BINS }, (_, binIndex) => {
        const start = binIndex * sliceSize;
        const end = Math.min(start + sliceSize, bufferLength);
        let sum = 0;
        let count = 0;
        for (let i = start; i < end; i++) {
          // Frequency data is 0-255, normalize to 0-1
          sum += dataArray[i];
          count++;
        }
        // Average and normalize (0-255 -> 0-1)
        const average = count > 0 ? sum / count : 0;
        const normalized = average / 255;
        // Apply some amplification for better visibility, but don't force minimum
        return Math.min(1, normalized * 2.5);
      });

      setWaveform((previous) =>
        newWaveform.map((value, index) => {
          // Smooth transition with previous values for fluid animation
          // Use more aggressive smoothing to prevent jitter
          const smoothed = previous[index] * 0.3 + value * 0.7;
          // Only apply minimum when there's actual sound (value > 0.05)
          // Otherwise let it decay naturally
          if (value < 0.05 && smoothed < 0.05) {
            return Math.max(0, smoothed * 0.8); // Decay to zero when silent
          }
          return Math.min(1, Math.max(smoothed, 0));
        }),
      );

      // Continue animation loop
      animationRef.current = requestAnimationFrame(animateWaveform);
    } catch (error) {
      logError("Error animating waveform", error);
      // Stop animation on error
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    }
  }, [isRecording]);

  const stopRecording = useCallback(() => {
    setIsRecording(false);
    
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        // Request final data before stopping
        mediaRecorderRef.current.requestData();
        mediaRecorderRef.current.stop();
      } catch (error) {
        logWarn("Failed to stop media recorder", error);
      }
    }
    
    stopTracking();
  }, [stopTracking]);

  const handleReset = useCallback(() => {
    // Stop playback if playing
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
    }
    if (playbackTimerRef.current) {
      clearInterval(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }
    setIsPlaying(false);
    setPlaybackProgress(0);
    
    setAudioBlob(null);
    setDuration(0);
    setSelectedMood(null);
    setWaveform(Array(WAVEFORM_BINS).fill(0.5));
    setIsSensitive(false);
    setTitle("");
    setTagInput("");
    setIsPodcastMode(false);
    stopTracking();
    cleanupAudio();
    mediaRecorderRef.current = null;
  }, [cleanupAudio, stopTracking]);

  const handlePlayback = useCallback(() => {
    if (!audioBlob) return;

    if (isPlaying && audioPlayerRef.current) {
      // Pause
      audioPlayerRef.current.pause();
      setIsPlaying(false);
      if (playbackTimerRef.current) {
        clearInterval(playbackTimerRef.current);
        playbackTimerRef.current = null;
      }
    } else {
      // Play
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audioPlayerRef.current = audio;
      
      // Apply enhancements
      audio.playbackRate = enhancements.playbackSpeed;

      audio.onended = () => {
        setIsPlaying(false);
        setPlaybackProgress(0);
        if (playbackTimerRef.current) {
          clearInterval(playbackTimerRef.current);
          playbackTimerRef.current = null;
        }
        URL.revokeObjectURL(audioUrl);
        audioPlayerRef.current = null;
      };

      audio.onerror = () => {
        setIsPlaying(false);
        setPlaybackProgress(0);
        toast({
          title: "Playback error",
          description: "Could not play audio",
          variant: "destructive",
        });
        URL.revokeObjectURL(audioUrl);
        audioPlayerRef.current = null;
      };

      audio.play().then(() => {
        setIsPlaying(true);
        // Update progress
        playbackTimerRef.current = window.setInterval(() => {
          if (audioPlayerRef.current) {
            const progress = (audioPlayerRef.current.currentTime / audioPlayerRef.current.duration) * 100;
            setPlaybackProgress(isNaN(progress) ? 0 : progress);
          }
        }, 100);
      }).catch((error) => {
        logError("Error playing audio", error);
        toast({
          title: "Playback error",
          description: "Could not play audio",
          variant: "destructive",
        });
        setIsPlaying(false);
        URL.revokeObjectURL(audioUrl);
        audioPlayerRef.current = null;
      });
    }
  }, [audioBlob, isPlaying, toast, enhancements.playbackSpeed]);

  useEffect(() => {
    return () => {
      stopTracking();
      cleanupAudio();
    };
  }, [cleanupAudio, stopTracking]);

  useEffect(() => {
    if (!isOpen) {
      stopRecording();
      handleReset();
    }
  }, [handleReset, isOpen, stopRecording]);

  // Cleanup playback on unmount
  useEffect(() => {
    return () => {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }
      if (playbackTimerRef.current) {
        clearInterval(playbackTimerRef.current);
        playbackTimerRef.current = null;
      }
    };
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // Create audio context and resume it (required in some browsers)
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Resume audio context if suspended (required after user interaction)
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 2048; // Increased for better frequency resolution
      analyserRef.current.smoothingTimeConstant = 0.8;
      analyserRef.current.minDecibels = -90;
      analyserRef.current.maxDecibels = -10;
      source.connect(analyserRef.current);

      // Check for supported MIME types
      const mimeTypes = ['audio/webm', 'audio/webm;codecs=opus', 'audio/ogg;codecs=opus'];
      let selectedMimeType = 'audio/webm';
      for (const mimeType of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          selectedMimeType = mimeType;
          break;
        }
      }

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: selectedMimeType,
      });
      mediaRecorderRef.current = mediaRecorder;
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      };
      
      mediaRecorder.onerror = (event) => {
        logError("MediaRecorder error", event);
        toast({
          title: "Recording error",
          description: "There was a problem recording audio. Please try again.",
          variant: "destructive",
        });
        stopRecording();
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: selectedMimeType });
        if (blob.size > 0) {
          setAudioBlob(blob);
        } else {
          toast({
            title: "No audio recorded",
            description: "Please try recording again.",
            variant: "destructive",
          });
        }
        stream.getTracks().forEach((track) => track.stop());
        cleanupAudio();
      };

      // Start recording with timeslice for better data collection
      mediaRecorder.start(100);
      setIsRecording(true);
      setDuration(0);
      startTimeRef.current = Date.now();

      // Capture podcast mode at start time to avoid stale closure
      const podcastModeAtStart = isPodcastMode;
      const currentMaxDuration = podcastModeAtStart ? MAX_DURATION_PODCAST : MAX_DURATION_SHORT;
      
      timerRef.current = window.setInterval(() => {
        if (!startTimeRef.current) return;
        const elapsed = Math.min(
          currentMaxDuration,
          Math.round((Date.now() - startTimeRef.current) / 1000),
        );
        setDuration((prev) => (prev === elapsed ? prev : elapsed));
        if (elapsed >= currentMaxDuration) {
          stopRecording();
        }
      }, 100);

      // Start waveform animation loop immediately
      if (analyserRef.current) {
        animationRef.current = requestAnimationFrame(animateWaveform);
      }
    } catch (error) {
      logError("Error accessing microphone", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast({
        title: "Microphone access denied",
        description: errorMessage.includes('Permission') 
          ? "Please allow microphone access in your browser settings"
          : "Please check your microphone and try again",
        variant: "destructive",
      });
      setIsRecording(false);
    }
  }, [animateWaveform, cleanupAudio, stopRecording, toast]);

  const handlePressStart = useCallback(() => {
    if (!isRecording) {
      void startRecording();
    }
  }, [isRecording, startRecording]);

  const handlePressEnd = useCallback(() => {
    if (isRecording) {
      stopRecording();
    }
  }, [isRecording, stopRecording]);

  const handleTapToggle = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      void startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  const handlePost = async () => {
    if (!audioBlob || !selectedMood || selectedMood.trim() === "") {
      toast({
        title: "Add a mood emoji",
        description: "Enter an emoji to represent your mood",
        variant: "destructive",
      });
      return;
    }

    if (!topicId) {
      toast({
        title: "Topic unavailable",
        description: "Please refresh and try again.",
        variant: "destructive",
      });
      return;
    }

    try {
      const profileId = localStorage.getItem("profileId");
      const deviceId = localStorage.getItem("deviceId");

      if (!profileId || !deviceId) {
        toast({
          title: "Profile missing",
          description: "Please finish onboarding before recording.",
          variant: "destructive",
        });
        setIsUploading(false);
        return;
      }

      if (!audioBlob.type.startsWith("audio/")) {
        toast({
          title: "Unsupported format",
          description: "Please record audio using your microphone.",
          variant: "destructive",
        });
        return;
      }

      const averageWaveform = waveform.reduce((sum, value) => sum + value, 0) / waveform.length;
      const peakWaveform = Math.max(...waveform);
      if (averageWaveform < SILENCE_THRESHOLD && peakWaveform < SILENCE_THRESHOLD * 2) {
        toast({
          title: "We couldn't hear you",
          description: "Try speaking a little louder or move closer to the mic.",
          variant: "destructive",
        });
        return;
      }

      if (duration <= 1) {
        toast({
          title: "Too short",
          description: "Record at least two seconds to share your voice.",
          variant: "destructive",
        });
        return;
      }

      setIsUploading(true);
      const trimmedTitle = title.trim();
      const tags = parseTags(tagInput);

      await enqueueUpload({
        topicId,
        profileId,
        deviceId,
        duration,
        moodEmoji: selectedMood,
        waveform,
        audioBlob,
        city: profileCity,
        consentCity: profileConsentCity,
        contentRating: isSensitive ? "sensitive" : "general",
        title: trimmedTitle ? trimmedTitle : null,
        tags: tags.length > 0 ? tags : undefined,
        parentClipId: parentClipId || undefined,
        remixOfClipId: remixOfClipId || undefined,
        chainId: chainId || undefined,
        challengeId: challengeId || undefined,
        communityId: communityId || undefined,
        isPodcast: isPodcastMode,
      });

      onSuccess();
      handleReset();
      onClose();
    } catch (error) {
      logError("Error queueing clip", error);
      toast({
        title: "Failed to queue",
        description: "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm rounded-3xl">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-center text-xl">
            {remixingFrom
              ? audioBlob
                ? "Pick your mood"
                : tapToRecordPreferred
                  ? "Remix with your take"
                  : "Hold to remix"
              : continuingChain
              ? audioBlob
                ? "Pick your mood"
                : tapToRecordPreferred
                  ? "Continue the chain"
                  : "Hold to continue"
              : replyingTo
              ? audioBlob
                ? "Pick your mood"
                : tapToRecordPreferred
                  ? "Reply with voice"
                  : "Hold to reply"
              : audioBlob
              ? "Pick your mood"
              : tapToRecordPreferred
              ? "Tap to speak"
              : "Hold to speak"}
          </DialogTitle>
          <DialogDescription className="text-center text-xs">
            {remixingFrom
              ? audioBlob
                ? "Select a mood that represents your remix."
                : (() => {
                    const summaryText = remixingFrom.summary
                      ? `: "${remixingFrom.summary.substring(0, 50)}${remixingFrom.summary.length > 50 ? "..." : ""}"`
                      : "";
                    return `Remixing ${remixingFrom.handle}'s clip${summaryText}`;
                  })()
              : continuingChain
              ? audioBlob
                ? "Select a mood that represents your continuation."
                : `Continuing the conversation chain${continuingChain.title ? `: ${continuingChain.title}` : ""}`
              : replyingTo
              ? audioBlob
                ? "Select a mood that represents your reply."
                : (() => {
                    const summaryText = replyingTo.summary
                      ? `: "${replyingTo.summary.substring(0, 50)}${replyingTo.summary.length > 50 ? "..." : ""}"`
                      : "";
                    return `Replying to ${replyingTo.handle}${summaryText}`;
                  })()
              : audioBlob
              ? "Select a mood that represents your recording."
              : "Record your voice clip to share with the community."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {!audioBlob ? (
            <>
              {/* Podcast Mode Toggle - only show for new recordings (not replies/remixes) */}
              {!replyingTo && !remixingFrom && !continuingChain && (
                <div className="bg-muted/60 rounded-xl p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium">Podcast Mode</p>
                      <p className="text-xs text-muted-foreground">
                        Record up to 10 minutes for longer-form content
                      </p>
                    </div>
                    <Switch
                      checked={isPodcastMode}
                      onCheckedChange={(checked) => setIsPodcastMode(Boolean(checked))}
                      aria-label="Enable podcast mode"
                    />
                  </div>
                </div>
              )}
              
              <div className="rounded-3xl bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4 shadow-inner">
                <div className="flex flex-col items-center gap-3">
                  <div className="flex items-center gap-2 rounded-full bg-background/80 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                    <Waves className="h-3 w-3 text-primary" aria-hidden="true" />
                    Live waveform
                  </div>
                  <div className="flex justify-center items-center h-20 gap-1 px-2">
                    {waveform.map((height, i) => (
                      <div
                        key={i}
                        className={`w-2 rounded-full transition-all duration-150 ${
                          isRecording ? "bg-primary" : "bg-muted-foreground/20"
                        }`}
                        style={{
                          height: `${Math.max(height * 100, 4)}%`,
                          opacity: isRecording ? Math.max(height * 0.8 + 0.2, 0.2) : 0.3,
                        }}
                      />
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-center text-sm text-muted-foreground">
                    <div className="space-y-0.5">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground/70">
                        Capturing
                      </p>
                      <p className="text-2xl font-semibold text-foreground">{duration}s</p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground/70">
                        Time left
                      </p>
                      <p className="text-2xl font-semibold text-foreground">
                        {Math.max(MAX_DURATION - duration, 0)}s
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3 text-center">
                <p className="text-xs text-muted-foreground">
                  {tapToRecordPreferred
                    ? `Tap the mic to start. Tap again to finish — we'll stop automatically at ${MAX_DURATION} seconds.`
                    : `Hold the mic to record. Release to finish — we'll stop automatically at ${MAX_DURATION} seconds.`}
                </p>

                <div className="flex justify-center">
                  <div className="relative h-24 w-24">
                    <div
                      className="absolute inset-0 rounded-full bg-muted/50"
                      style={{
                        background: `conic-gradient(var(--primary) ${
                          Math.min(duration / MAX_DURATION, 1) * 360
                        }deg, rgba(0,0,0,0.08) 0deg)`,
                      }}
                    />
                    <div className="absolute inset-2 rounded-full bg-background shadow-lg" />
                    <Button
                      size="lg"
                      className={`absolute inset-3 h-full w-full rounded-full border-none p-0 text-primary ${
                        isRecording ? "animate-pulse-glow" : ""
                      }`}
                      onClick={
                        tapToRecordPreferred
                          ? (event) => {
                              event.preventDefault();
                              handleTapToggle();
                            }
                          : undefined
                      }
                      onMouseDown={
                        tapToRecordPreferred
                          ? undefined
                          : (event) => {
                              event.preventDefault();
                              handlePressStart();
                            }
                      }
                      onMouseUp={
                        tapToRecordPreferred
                          ? undefined
                          : (event) => {
                              event.preventDefault();
                              handlePressEnd();
                            }
                      }
                      onMouseLeave={
                        tapToRecordPreferred
                          ? undefined
                          : () => {
                              if (isRecording) {
                                handlePressEnd();
                              }
                            }
                      }
                      onTouchStart={
                        tapToRecordPreferred
                          ? undefined
                          : (event) => {
                              event.preventDefault();
                              handlePressStart();
                            }
                      }
                      onTouchEnd={
                        tapToRecordPreferred
                          ? undefined
                          : (event) => {
                              event.preventDefault();
                              handlePressEnd();
                            }
                      }
                      onTouchCancel={
                        tapToRecordPreferred ? undefined : () => handlePressEnd()
                      }
                      onKeyDown={(event) => {
                        if (event.code === "Space" || event.code === "Enter") {
                          event.preventDefault();
                          if (tapToRecordPreferred) {
                            handleTapToggle();
                          } else {
                            handlePressStart();
                          }
                        }
                      }}
                      onKeyUp={
                        tapToRecordPreferred
                          ? undefined
                          : (event) => {
                              if (event.code === "Space" || event.code === "Enter") {
                                event.preventDefault();
                                handlePressEnd();
                              }
                            }
                      }
                    >
                      <span className="flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-2xl">
                        <Mic className="h-8 w-8" />
                      </span>
                    </Button>
                  </div>
                </div>

                <div className="flex justify-center gap-3 text-xs text-muted-foreground">
                  <span className="rounded-full bg-muted px-3 py-1">Tip: Speak close to your mic</span>
                  <span className="rounded-full bg-muted px-3 py-1">
                    {tapToRecordPreferred ? "Tap again to review" : "Release to review"}
                  </span>
                </div>

                <div className="flex justify-center gap-3">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleReset}
                    className="rounded-full px-4"
                    disabled={duration === 0 && !isRecording}
                  >
                    <X className="mr-1 h-4 w-4" />
                    Reset timer
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handlePressEnd}
                    className="rounded-full px-4"
                    disabled={!isRecording}
                  >
                    <Check className="mr-1 h-4 w-4" />
                    {tapToRecordPreferred ? "Stop now" : "Finish now"}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Playback Section */}
              <div className="rounded-3xl bg-gradient-to-br from-primary/10 via-background to-accent/10 p-3 shadow-inner">
                <div className="flex flex-col items-center gap-2">
                  <div className="flex items-center gap-2 rounded-full bg-background/80 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                    <Waves className="h-3 w-3 text-primary" aria-hidden="true" />
                    Playback
                  </div>
                  
                  {/* Waveform visualization during playback */}
                  <div className="flex justify-center items-center h-16 gap-1 px-2 w-full">
                    {waveform.map((height, i) => (
                      <div
                        key={i}
                        className="w-1.5 rounded-full bg-primary transition-all duration-75"
                        style={{
                          height: `${Math.max(height * 80, 8)}%`,
                          opacity: isPlaying ? Math.max(height, 0.4) : 0.3,
                        }}
                      />
                    ))}
                  </div>

                  {/* Playback controls */}
                  <div className="flex items-center gap-3 w-full">
                    <Button
                      onClick={handlePlayback}
                      size="sm"
                      className="flex-1 h-10 rounded-xl"
                      variant={isPlaying ? "outline" : "default"}
                    >
                      {isPlaying ? (
                        <>
                          <Pause className="mr-1.5 h-4 w-4" />
                          Pause
                        </>
                      ) : (
                        <>
                          <Play className="mr-1.5 h-4 w-4" />
                          Play
                        </>
                      )}
                    </Button>
                    <div className="text-center min-w-[50px]">
                      <p className="text-xs text-muted-foreground">Duration</p>
                      <p className="text-sm font-semibold">{duration}s</p>
                    </div>
                    <AudioEnhancementControls
                      enhancements={enhancements}
                      onUpdate={updateEnhancement}
                      compact={true}
                    />
                  </div>

                  {/* Progress bar */}
                  {isPlaying && (
                    <div className="w-full h-0.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-100"
                        style={{ width: `${playbackProgress}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium" htmlFor="clip-mood">
                  Mood emoji{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    (any emoji)
                  </span>
                </label>
                <EmojiPicker
                  value={selectedMood}
                  onChange={(emoji) => setSelectedMood(emoji)}
                  placeholder="😊"
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium" htmlFor="clip-title">
                    Title{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      optional
                    </span>
                  </label>
                  <Input
                    id="clip-title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Give your voice note a title"
                    maxLength={80}
                    className="rounded-xl h-9"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium" htmlFor="clip-tags">
                    Tags{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      use # or commas
                    </span>
                  </label>
                  <Input
                    id="clip-tags"
                    value={tagInput}
                    onChange={(event) => setTagInput(event.target.value)}
                    placeholder="#gratitude #mood"
                    className="rounded-xl h-9"
                  />
                  {tagList.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {tagList.map((tag) => (
                        <Badge key={tag} variant="secondary" className="rounded-full text-xs">
                          #{tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {profileConsentCity && profileCity && (
                <p className="text-xs text-muted-foreground text-center">
                  This clip will include your city: {profileCity}.
                </p>
              )}

              <div className="bg-muted/60 rounded-xl p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium">Mark as sensitive / NSFW</p>
                    <p className="text-xs text-muted-foreground">
                      Flag explicit or adults-only topics.
                    </p>
                  </div>
                  <Switch
                    checked={isSensitive}
                    onCheckedChange={(checked) => setIsSensitive(Boolean(checked))}
                    aria-label="Mark clip as sensitive or NSFW"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleReset}
                  className="flex-1 h-10 rounded-xl text-sm"
                >
                  Re-record
                </Button>
                <Button
                  onClick={handlePost}
                  disabled={!selectedMood || isUploading || isProcessing}
                  className="flex-1 h-10 rounded-xl text-sm"
                >
                  {isUploading ? "Posting..." : isProcessing ? "Uploading..." : "Post"}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
