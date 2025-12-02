import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, X, Play, Pause, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Waves } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

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
  const [textContent, setTextContent] = useState(""); // Optional text to accompany voice comment

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
      console.error("Waveform animation error:", error);
    }
  }, [isRecording]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Initialize audio context for waveform
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AudioContextClass();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.8;
      source.connect(analyserRef.current);

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });

      chunksRef.current = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        stream.getTracks().forEach((track) => track.stop());
        cleanupAudio();
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100); // Collect data every 100ms

      setIsRecording(true);
      startTimeRef.current = Date.now();

      // Start timer
      timerRef.current = window.setInterval(() => {
        const elapsed = (Date.now() - (startTimeRef.current || 0)) / 1000;
        setDuration(elapsed);

        // Auto-stop at max duration
        if (elapsed >= MAX_DURATION) {
          stopRecording();
        }
      }, 100);

      // Start waveform animation
      animateWaveform();
    } catch (error: any) {
      console.error("Error starting recording:", error);
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

  const playPreview = useCallback(() => {
    if (!audioBlob) return;

    if (isPlaying && audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      setIsPlaying(false);
      return;
    }

    const url = URL.createObjectURL(audioBlob);
    const audio = new Audio(url);
    audioPlayerRef.current = audio;

    audio.onended = () => {
      setIsPlaying(false);
      URL.revokeObjectURL(url);
    };

    audio.onerror = () => {
      setIsPlaying(false);
      URL.revokeObjectURL(url);
      toast({
        title: "Playback failed",
        description: "Could not play audio preview",
        variant: "destructive",
      });
    };

    audio.play().catch((error) => {
      console.error("Error playing audio:", error);
      setIsPlaying(false);
      URL.revokeObjectURL(url);
    });

    setIsPlaying(true);
  }, [audioBlob, isPlaying, toast]);

  const resetRecording = useCallback(() => {
    stopRecording();
    setAudioBlob(null);
    setDuration(0);
    setWaveform(Array(WAVEFORM_BINS).fill(0.5));
    setTextContent("");
    chunksRef.current = [];
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
    }
    setIsPlaying(false);
  }, [stopRecording]);

  const handleSubmit = useCallback(async () => {
    if (!audioBlob || duration < MIN_DURATION) {
      toast({
        title: "Recording too short",
        description: `Recording must be at least ${MIN_DURATION} second`,
        variant: "destructive",
      });
      return;
    }

    try {
      setIsUploading(true);

      // Convert blob to base64
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      
      const base64Audio = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          // Remove data URL prefix
          const base64 = result.split(",")[1];
          resolve(base64);
        };
        reader.onerror = reject;
      });

      const { data, error } = await supabase.functions.invoke("add-voice-comment", {
        body: {
          clipId,
          parentCommentId: parentCommentId || null,
          audioBase64: base64Audio,
          audioType: "audio/webm",
          durationSeconds: Math.round(duration * 10) / 10, // Round to 1 decimal
          content: textContent.trim() || null,
        },
      });

      if (error) throw error;

      toast({
        title: "Voice comment posted!",
        description: "Your voice comment has been added",
      });

      resetRecording();
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error("Error submitting voice comment:", error);
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload voice comment",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  }, [audioBlob, duration, clipId, parentCommentId, textContent, resetRecording, onSuccess, onClose, toast]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTracking();
      cleanupAudio();
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }
    };
  }, [stopTracking, cleanupAudio]);

  // Reset when dialog opens
  useEffect(() => {
    if (isOpen) {
      resetRecording();
    }
  }, [isOpen, resetRecording]);

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
            Record up to {MAX_DURATION} seconds. You can add optional text below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Waveform Display */}
          <div className="flex items-center justify-center h-24 bg-muted/50 rounded-2xl p-4">
            <div className="flex items-end justify-center gap-1 w-full h-full">
              {waveform.map((value, index) => (
                <div
                  key={index}
                  className="flex-1 bg-primary rounded-t transition-all duration-75"
                  style={{
                    height: `${Math.max(8, value * 100)}%`,
                    minHeight: "4px",
                  }}
                />
              ))}
            </div>
          </div>

          {/* Timer and Controls */}
          <div className="flex items-center justify-center gap-4">
            <div className="text-2xl font-mono font-bold">
              {formatTime(duration)} / {formatTime(MAX_DURATION)}
            </div>
          </div>

          {/* Recording Controls */}
          <div className="flex items-center justify-center gap-3">
            {!audioBlob ? (
              <>
                {!isRecording ? (
                  <Button
                    onClick={startRecording}
                    size="lg"
                    className="rounded-full h-16 w-16"
                  >
                    <Mic className="h-6 w-6" />
                  </Button>
                ) : (
                  <Button
                    onClick={stopRecording}
                    size="lg"
                    variant="destructive"
                    className="rounded-full h-16 w-16"
                  >
                    <Pause className="h-6 w-6" />
                  </Button>
                )}
              </>
            ) : (
              <div className="flex items-center gap-3">
                <Button
                  onClick={playPreview}
                  size="lg"
                  variant="outline"
                  className="rounded-full h-12 w-12"
                >
                  {isPlaying ? (
                    <Pause className="h-5 w-5" />
                  ) : (
                    <Play className="h-5 w-5" />
                  )}
                </Button>
                <Button
                  onClick={resetRecording}
                  size="lg"
                  variant="outline"
                  className="rounded-full h-12 w-12"
                >
                  <Trash2 className="h-5 w-5" />
                </Button>
                <Button
                  onClick={handleSubmit}
                  size="lg"
                  disabled={isUploading}
                  className="rounded-full h-12 px-6"
                >
                  {isUploading ? (
                    <>Uploading...</>
                  ) : (
                    <>
                      <Send className="mr-2 h-5 w-5" />
                      Post Comment
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>

          {/* Optional Text Content */}
          {audioBlob && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Optional text (max 500 chars):</label>
              <Textarea
                value={textContent}
                onChange={(e) => setTextContent(e.target.value.slice(0, 500))}
                placeholder="Add some context to your voice comment..."
                className="min-h-[80px] rounded-xl"
                maxLength={500}
              />
              <div className="text-xs text-muted-foreground text-right">
                {textContent.length}/500
              </div>
            </div>
          )}

          <div className="text-xs text-muted-foreground text-center">
            {isRecording && "Recording... Click pause to stop"}
            {audioBlob && !isRecording && "Preview your recording, then post"}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

