import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, X, Play, Pause, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Waves } from "lucide-react";
import { logError, logWarn } from "@/lib/logger";

interface VoiceReactionRecorderProps {
  clipId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const MAX_DURATION = 5; // Maximum 5 seconds for voice reactions
const MIN_DURATION = 1; // Minimum 1 second
const WAVEFORM_BINS = 16;

export const VoiceReactionRecorder = ({
  clipId,
  isOpen,
  onClose,
  onSuccess,
}: VoiceReactionRecorderProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [waveform, setWaveform] = useState<number[]>(Array(WAVEFORM_BINS).fill(0.5));

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timerRef = useRef<number | null>(null);
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const { toast } = useToast();

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
      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyserRef.current.getByteFrequencyData(dataArray);

      const sliceSize = Math.floor(bufferLength / WAVEFORM_BINS);
      const newWaveform = Array.from({ length: WAVEFORM_BINS }, (_, binIndex) => {
        const start = binIndex * sliceSize;
        const end = Math.min(start + sliceSize, bufferLength);
        let sum = 0;
        let count = 0;
        for (let i = start; i < end; i++) {
          sum += dataArray[i];
          count++;
        }
        const average = count > 0 ? sum / count : 0;
        const normalized = average / 255;
        return Math.min(1, normalized * 2.5);
      });

      setWaveform((previous) =>
        newWaveform.map((value, index) => {
          const smoothed = previous[index] * 0.3 + value * 0.7;
          if (value < 0.05 && smoothed < 0.05) {
            return Math.max(0, smoothed * 0.8);
          }
          return Math.min(1, Math.max(smoothed, 0));
        }),
      );

      animationRef.current = requestAnimationFrame(animateWaveform);
    } catch (error) {
      logError("Error animating waveform", error);
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
        mediaRecorderRef.current.requestData();
        mediaRecorderRef.current.stop();
      } catch (error) {
        logWarn("Failed to stop media recorder", error);
      }
    }

    stopTracking();
  }, [stopTracking]);

  const handleReset = useCallback(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
    }
    setIsPlaying(false);
    setAudioBlob(null);
    setDuration(0);
    setWaveform(Array(WAVEFORM_BINS).fill(0.5));
    stopTracking();
    cleanupAudio();
    mediaRecorderRef.current = null;
  }, [cleanupAudio, stopTracking]);

  const handlePlayback = useCallback(() => {
    if (!audioBlob) return;

    if (isPlaying && audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      setIsPlaying(false);
    } else {
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audioPlayerRef.current = audio;

      audio.onended = () => {
        setIsPlaying(false);
        URL.revokeObjectURL(audioUrl);
        audioPlayerRef.current = null;
      };

      audio.onerror = () => {
        setIsPlaying(false);
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
  }, [audioBlob, isPlaying, toast]);

  useEffect(() => {
    return () => {
      stopTracking();
      cleanupAudio();
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }
    };
  }, [cleanupAudio, stopTracking]);

  useEffect(() => {
    if (!isOpen) {
      stopRecording();
      handleReset();
    }
  }, [handleReset, isOpen, stopRecording]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();

      if (audioContextRef.current.state === "suspended") {
        await audioContextRef.current.resume();
      }

      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 2048;
      analyserRef.current.smoothingTimeConstant = 0.8;
      analyserRef.current.minDecibels = -90;
      analyserRef.current.maxDecibels = -10;
      source.connect(analyserRef.current);

      const mimeTypes = ["audio/webm", "audio/webm;codecs=opus", "audio/ogg;codecs=opus"];
      let selectedMimeType = "audio/webm";
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

      mediaRecorder.start(100);
      setIsRecording(true);
      setDuration(0);
      startTimeRef.current = Date.now();

      timerRef.current = window.setInterval(() => {
        if (!startTimeRef.current) return;
        const elapsed = Math.min(MAX_DURATION, Math.round((Date.now() - startTimeRef.current) / 1000));
        setDuration(elapsed);
        if (elapsed >= MAX_DURATION) {
          stopRecording();
        }
      }, 100);

      if (analyserRef.current) {
        animationRef.current = requestAnimationFrame(animateWaveform);
      }
    } catch (error) {
      logError("Error accessing microphone", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast({
        title: "Microphone access denied",
        description: errorMessage.includes("Permission")
          ? "Please allow microphone access in your browser settings"
          : "Please check your microphone and try again",
        variant: "destructive",
      });
      setIsRecording(false);
    }
  }, [animateWaveform, cleanupAudio, stopRecording, toast]);

  const handleUpload = async () => {
    if (!audioBlob || duration < MIN_DURATION) {
      toast({
        title: "Recording too short",
        description: `Record at least ${MIN_DURATION} second for your voice reaction.`,
        variant: "destructive",
      });
      return;
    }

    if (duration > MAX_DURATION) {
      toast({
        title: "Recording too long",
        description: `Voice reactions must be ${MAX_DURATION} seconds or less.`,
        variant: "destructive",
      });
      return;
    }

    const profileId = localStorage.getItem("profileId");
    const deviceId = localStorage.getItem("deviceId");

    if (!profileId || !deviceId) {
      toast({
        title: "Sign in required",
        description: "Please complete onboarding to add voice reactions.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    try {
      // Convert blob to base64 for edge function
      const reader = new FileReader();
      const audioBase64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          // Remove data URL prefix (data:audio/webm;base64,)
          const base64 = result.split(",")[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(audioBlob);
      });

      const { data, error } = await supabase.functions.invoke("add-voice-reaction", {
        body: {
          clipId,
          audioBase64,
          audioType: audioBlob.type || "audio/webm",
          durationSeconds: duration,
        },
        headers: deviceId ? { "x-device-id": deviceId } : undefined,
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: "Voice reaction added!",
          description: "Your voice reaction has been posted.",
        });
        onSuccess();
        handleReset();
        onClose();
      } else {
        throw new Error(data?.error || "Failed to upload voice reaction");
      }
    } catch (err) {
      logError("Error uploading voice reaction", err);
      toast({
        title: "Couldn't add voice reaction",
        description: err instanceof Error ? err.message : "Please try again",
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
          <DialogTitle className="text-center text-xl">Record Voice Reaction</DialogTitle>
          <DialogDescription className="text-center text-xs">
            Record a 3-5 second voice reaction to this clip
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!audioBlob ? (
            <>
              <div className="rounded-3xl bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4 shadow-inner">
                <div className="flex flex-col items-center gap-3">
                  <div className="flex items-center gap-2 rounded-full bg-background/80 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                    <Waves className="h-3 w-3 text-primary" aria-hidden="true" />
                    Live waveform
                  </div>
                  <div className="flex justify-center items-center h-16 gap-1 px-2">
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
                  <div className="text-center">
                    <p className="text-2xl font-semibold text-foreground">{duration}s</p>
                    <p className="text-xs text-muted-foreground">
                      {MAX_DURATION - duration}s remaining
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-center">
                <div className="relative h-20 w-20">
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
                    onMouseDown={(e) => {
                      e.preventDefault();
                      if (!isRecording) {
                        void startRecording();
                      }
                    }}
                    onMouseUp={(e) => {
                      e.preventDefault();
                      if (isRecording) {
                        stopRecording();
                      }
                    }}
                    onTouchStart={(e) => {
                      e.preventDefault();
                      if (!isRecording) {
                        void startRecording();
                      }
                    }}
                    onTouchEnd={(e) => {
                      e.preventDefault();
                      if (isRecording) {
                        stopRecording();
                      }
                    }}
                  >
                    <span className="flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-2xl">
                      <Mic className="h-6 w-6" />
                    </span>
                  </Button>
                </div>
              </div>

              <p className="text-center text-xs text-muted-foreground">
                Hold to record (up to {MAX_DURATION} seconds)
              </p>
            </>
          ) : (
            <>
              <div className="rounded-3xl bg-gradient-to-br from-primary/10 via-background to-accent/10 p-3 shadow-inner">
                <div className="flex flex-col items-center gap-2">
                  <div className="flex items-center gap-2 rounded-full bg-background/80 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                    <Waves className="h-3 w-3 text-primary" aria-hidden="true" />
                    Review
                  </div>
                  <div className="flex justify-center items-center h-12 gap-1 px-2 w-full">
                    {waveform.map((height, i) => (
                      <div
                        key={i}
                        className="w-1.5 rounded-full bg-primary transition-all duration-75"
                        style={{
                          height: `${Math.max(height * 60, 8)}%`,
                          opacity: isPlaying ? Math.max(height, 0.4) : 0.3,
                        }}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-3 w-full">
                    <Button
                      onClick={handlePlayback}
                      size="sm"
                      variant={isPlaying ? "outline" : "default"}
                      className="flex-1"
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
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleReset}
                  className="flex-1"
                  disabled={isUploading}
                >
                  <X className="mr-2 h-4 w-4" />
                  Re-record
                </Button>
                <Button
                  onClick={handleUpload}
                  disabled={isUploading || duration < MIN_DURATION}
                  className="flex-1"
                >
                  <Send className="mr-2 h-4 w-4" />
                  {isUploading ? "Posting..." : "Post Reaction"}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

