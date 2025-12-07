import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, X, Play, Pause, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Waves } from "lucide-react";
import { logError, logWarn } from "@/lib/logger";

interface VoiceCommentRecorderProps {
  clipId: string;
  parentCommentId?: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const MAX_DURATION = 30; // Maximum 30 seconds for voice comments
const MIN_DURATION = 1; // Minimum 1 second
const WAVEFORM_BINS = 24;

export const VoiceCommentRecorder = ({
  clipId,
  parentCommentId,
  isOpen,
  onClose,
  onSuccess,
}: VoiceCommentRecorderProps) => {
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
  const chunksRef = useRef<Blob[]>([]);

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
      logWarn("Error animating waveform", error);
      stopTracking();
    }
  }, [isRecording, stopTracking]);

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
      await audioContextRef.current.resume();

      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);

      const options = { mimeType: "audio/webm" };
      const recorder = new MediaRecorder(stream, options);
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        stream.getTracks().forEach((track) => track.stop());
        cleanupAudio();
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      startTimeRef.current = Date.now();

      // Update duration every 100ms
      timerRef.current = window.setInterval(() => {
        if (startTimeRef.current) {
          const elapsed = (Date.now() - startTimeRef.current) / 1000;
          setDuration(Math.min(elapsed, MAX_DURATION));

          // Auto-stop at max duration
          if (elapsed >= MAX_DURATION) {
            stopRecording();
          }
        }
      }, 100);

      animateWaveform();
    } catch (error: any) {
      logError("Error starting recording", error);
      toast({
        title: "Recording failed",
        description: error.message || "Could not access microphone",
        variant: "destructive",
      });
    }
  }, [animateWaveform, cleanupAudio, toast]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      stopTracking();
    }
  }, [isRecording, stopTracking]);

  const handleReset = useCallback(() => {
    stopRecording();
    setAudioBlob(null);
    setDuration(0);
    setWaveform(Array(WAVEFORM_BINS).fill(0.5));
    chunksRef.current = [];
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
      setIsPlaying(false);
    }
  }, [stopRecording]);

  const handlePlayPause = useCallback(() => {
    if (!audioBlob) return;

    if (!audioPlayerRef.current) {
      const url = URL.createObjectURL(audioBlob);
      audioPlayerRef.current = new Audio(url);
      audioPlayerRef.current.onended = () => {
        setIsPlaying(false);
        if (audioPlayerRef.current) {
          audioPlayerRef.current.currentTime = 0;
        }
      };
    }

    if (isPlaying) {
      audioPlayerRef.current.pause();
      setIsPlaying(false);
    } else {
      audioPlayerRef.current.play().catch((error) => {
        logWarn("Error playing audio", error);
        toast({
          title: "Playback failed",
          description: "Could not play audio",
          variant: "destructive",
        });
      });
      setIsPlaying(true);
    }
  }, [audioBlob, isPlaying, toast]);

  const handleSubmit = useCallback(async () => {
    if (!audioBlob || duration < MIN_DURATION) {
      toast({
        title: "Recording too short",
        description: `Recording must be at least ${MIN_DURATION} second`,
        variant: "destructive",
      });
      return;
    }

    const profileId = localStorage.getItem("profileId");
    if (!profileId) {
      toast({
        title: "Profile missing",
        description: "Please finish onboarding before commenting",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsUploading(true);

      // Upload audio file
      const fileName = `comments/${profileId}/${Date.now()}.webm`;
      const { error: uploadError } = await supabase.storage
        .from("audio")
        .upload(fileName, audioBlob);

      if (uploadError) throw uploadError;

      // Generate waveform (simplified)
      const waveformData = waveform.map((value) => Number(value.toFixed(2)));

      // Insert comment with voice audio (use audio_path, not audio_url)
      const { error: insertError } = await supabase.from("comments").insert({
        clip_id: clipId,
        profile_id: profileId,
        parent_comment_id: parentCommentId || null,
        content: null, // Voice comments have no text content
        audio_path: fileName, // Store the storage path
        duration_seconds: Math.round(duration),
        waveform: waveformData,
      });

      if (insertError) throw insertError;

      toast({
        title: "Comment posted!",
        description: "Your voice comment has been added",
      });

      handleReset();
      onSuccess();
      onClose();
    } catch (error: any) {
      logError("Error submitting voice comment", error);
      toast({
        title: "Failed to post comment",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  }, [audioBlob, duration, clipId, parentCommentId, waveform, toast, handleReset, onSuccess, onClose]);

  useEffect(() => {
    return () => {
      stopTracking();
      cleanupAudio();
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        URL.revokeObjectURL(audioPlayerRef.current.src);
      }
    };
  }, [stopTracking, cleanupAudio]);

  useEffect(() => {
    if (!isOpen) {
      handleReset();
    }
  }, [isOpen, handleReset]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="rounded-3xl max-w-md">
        <DialogHeader>
          <DialogTitle>Record Voice Comment</DialogTitle>
          <DialogDescription>
            Record up to {MAX_DURATION} seconds of audio
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Waveform Display */}
          <div className="flex items-center justify-center h-24 px-4">
            <div className="flex items-end justify-center gap-1 w-full h-full">
              {waveform.map((value, index) => (
                <div
                  key={index}
                  className="flex-1 bg-primary rounded-t transition-all duration-75"
                  style={{
                    height: `${Math.max(4, value * 100)}%`,
                    minHeight: "4px",
                  }}
                />
              ))}
            </div>
          </div>

          {/* Duration Display */}
          <div className="text-center">
            <div className="text-2xl font-mono font-semibold">
              {formatTime(duration)}
            </div>
            <div className="text-sm text-muted-foreground">
              {duration >= MAX_DURATION ? "Maximum duration reached" : `Max ${MAX_DURATION}s`}
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-4">
            {!audioBlob ? (
              <>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={onClose}
                  className="rounded-full h-12 w-12"
                >
                  <X className="h-5 w-5" />
                </Button>
                {!isRecording ? (
                  <Button
                    onClick={startRecording}
                    size="icon"
                    className="rounded-full h-16 w-16 bg-primary"
                  >
                    <Mic className="h-6 w-6" />
                  </Button>
                ) : (
                  <Button
                    onClick={stopRecording}
                    size="icon"
                    className="rounded-full h-16 w-16 bg-destructive"
                  >
                    <div className="h-6 w-6 rounded-full bg-background" />
                  </Button>
                )}
                <div className="w-12 h-12" /> {/* Spacer */}
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleReset}
                  className="rounded-full h-12 w-12"
                >
                  <X className="h-5 w-5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handlePlayPause}
                  className="rounded-full h-12 w-12"
                >
                  {isPlaying ? (
                    <Pause className="h-5 w-5" />
                  ) : (
                    <Play className="h-5 w-5" />
                  )}
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={isUploading || duration < MIN_DURATION}
                  size="icon"
                  className="rounded-full h-12 w-12 bg-primary"
                >
                  {isUploading ? (
                    <Waves className="h-5 w-5 animate-pulse" />
                  ) : (
                    <Send className="h-5 w-5" />
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
