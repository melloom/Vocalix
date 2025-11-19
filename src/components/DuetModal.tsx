import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, X, Play, Pause, Waves, Users, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useUploadQueue } from "@/context/UploadQueueContext";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { EmojiPicker } from "@/components/EmojiPicker";
import { logError } from "@/lib/logger";
import { supabase } from "@/integrations/supabase/client";
import { trimAudio, getAudioDuration } from "@/utils/audioTrimming";
import { Badge } from "@/components/ui/badge";
import { useProfile } from "@/hooks/useProfile";

interface DuetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  originalClipId: string;
  originalClip?: {
    id: string;
    audio_path: string;
    title?: string | null;
    summary?: string | null;
    duration_seconds?: number | null;
    profiles?: {
      handle: string;
      emoji_avatar: string;
    } | null;
  };
}

const WAVEFORM_BINS = 50;
const MIN_DURATION = 1; // Minimum 1 second

export const DuetModal = ({
  isOpen,
  onClose,
  onSuccess,
  originalClipId,
  originalClip,
}: DuetModalProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [originalAudioBlob, setOriginalAudioBlob] = useState<Blob | null>(null);
  const [duration, setDuration] = useState(0);
  const [originalDuration, setOriginalDuration] = useState(0);
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [waveform, setWaveform] = useState<number[]>(Array(WAVEFORM_BINS).fill(0.5));
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [isPlayingOriginal, setIsPlayingOriginal] = useState(false);
  const [originalPlaybackProgress, setOriginalPlaybackProgress] = useState(0);
  const [originalVolume, setOriginalVolume] = useState(0.5);
  const [duetVolume, setDuetVolume] = useState(1.0);
  const [syncPlayback, setSyncPlayback] = useState(true); // Play both together

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timerRef = useRef<number | null>(null);
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const originalAudioRef = useRef<HTMLAudioElement | null>(null);
  const playbackTimerRef = useRef<number | null>(null);

  const { toast } = useToast();
  const { profile } = useProfile();
  const { enqueueUpload } = useUploadQueue();

  // Load original clip audio
  useEffect(() => {
    if (!isOpen || !originalClip?.audio_path) return;

    const loadOriginalAudio = async () => {
      try {
        const { data, error } = await supabase.storage
          .from("clips")
          .download(originalClip.audio_path);

        if (error) throw error;
        if (data) {
          setOriginalAudioBlob(data);
          const duration = await getAudioDuration(data);
          setOriginalDuration(duration);
        }
      } catch (error) {
        logError("Failed to load original audio", error);
        toast({
          title: "Failed to load original clip",
          description: "Please try again.",
          variant: "destructive",
        });
      }
    };

    loadOriginalAudio();
  }, [isOpen, originalClip, toast]);

  // Cleanup
  const cleanupAudio = useCallback(() => {
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }
    analyserRef.current = null;
  }, []);

  const handleReset = useCallback(() => {
    setIsRecording(false);
    setRecordedBlob(null);
    setDuration(0);
    setWaveform(Array(WAVEFORM_BINS).fill(0.5));
    setPlaybackProgress(0);
    setOriginalPlaybackProgress(0);
    setIsPlaying(false);
    setIsPlayingOriginal(false);
    setTitle("");
    setCaption("");
    setSelectedMood(null);
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
    }
    if (originalAudioRef.current) {
      originalAudioRef.current.pause();
      originalAudioRef.current = null;
    }
    cleanupAudio();
  }, [cleanupAudio]);

  useEffect(() => {
    if (!isOpen) {
      handleReset();
    }
  }, [isOpen, handleReset]);

  // Animate waveform
  const animateWaveform = useCallback(() => {
    if (!analyserRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    const bins = WAVEFORM_BINS;
    const samplesPerBin = Math.floor(dataArray.length / bins);
    const newWaveform = Array.from({ length: bins }, (_, i) => {
      const start = i * samplesPerBin;
      const end = start + samplesPerBin;
      let sum = 0;
      for (let j = start; j < end && j < dataArray.length; j++) {
        sum += dataArray[j];
      }
      const avg = sum / samplesPerBin;
      return Math.min(1, Math.max(0.1, avg / 255));
    });

    setWaveform(newWaveform);
    animationRef.current = requestAnimationFrame(animateWaveform);
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

      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 2048;
      analyserRef.current.smoothingTimeConstant = 0.8;
      source.connect(analyserRef.current);

      const mimeTypes = ['audio/webm', 'audio/webm;codecs=opus', 'audio/ogg;codecs=opus'];
      let selectedMimeType = 'audio/webm';
      for (const mimeType of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          selectedMimeType = mimeType;
          break;
        }
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType: selectedMimeType });
      mediaRecorderRef.current = mediaRecorder;
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: selectedMimeType });
        if (blob.size > 0) {
          setRecordedBlob(blob);
          const duration = await getAudioDuration(blob);
          setDuration(Math.floor(duration));
        }
        stream.getTracks().forEach((track) => track.stop());
        cleanupAudio();
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      startTimeRef.current = Date.now();

      timerRef.current = window.setInterval(() => {
        if (!startTimeRef.current) return;
        const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000);
        setDuration(elapsed);
      }, 100);

      if (analyserRef.current) {
        animationRef.current = requestAnimationFrame(animateWaveform);
      }
    } catch (error) {
      logError("Error accessing microphone", error);
      toast({
        title: "Microphone access denied",
        description: "Please allow microphone access and try again.",
        variant: "destructive",
      });
      setIsRecording(false);
    }
  }, [animateWaveform, cleanupAudio, toast]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  }, [isRecording]);

  // Playback controls
  const togglePlayback = useCallback(() => {
    if (!recordedBlob) return;

    if (isPlaying) {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }
      if (syncPlayback && originalAudioRef.current) {
        originalAudioRef.current.pause();
      }
      setIsPlaying(false);
      setIsPlayingOriginal(false);
      if (playbackTimerRef.current) {
        clearInterval(playbackTimerRef.current);
        playbackTimerRef.current = null;
      }
    } else {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.play();
      }
      if (syncPlayback && originalAudioRef.current) {
        originalAudioRef.current.currentTime = 0;
        originalAudioRef.current.volume = originalVolume;
        originalAudioRef.current.play();
      }
      setIsPlaying(true);
      setIsPlayingOriginal(syncPlayback);

      playbackTimerRef.current = window.setInterval(() => {
        if (audioPlayerRef.current) {
          setPlaybackProgress(audioPlayerRef.current.currentTime);
        }
        if (originalAudioRef.current && syncPlayback) {
          setOriginalPlaybackProgress(originalAudioRef.current.currentTime);
        }
      }, 100);
    }
  }, [recordedBlob, isPlaying, syncPlayback, originalVolume]);

  const toggleOriginalPlayback = useCallback(() => {
    if (!originalAudioBlob) return;

    if (isPlayingOriginal) {
      if (originalAudioRef.current) {
        originalAudioRef.current.pause();
      }
      setIsPlayingOriginal(false);
    } else {
      if (originalAudioRef.current) {
        originalAudioRef.current.currentTime = 0;
        originalAudioRef.current.volume = originalVolume;
        originalAudioRef.current.play();
      }
      setIsPlayingOriginal(true);

      const timer = window.setInterval(() => {
        if (originalAudioRef.current) {
          setOriginalPlaybackProgress(originalAudioRef.current.currentTime);
          if (originalAudioRef.current.ended) {
            setIsPlayingOriginal(false);
            clearInterval(timer);
          }
        }
      }, 100);
    }
  }, [originalAudioBlob, isPlayingOriginal, originalVolume]);

  const handleSubmit = useCallback(async () => {
    if (!recordedBlob || duration < MIN_DURATION) {
      toast({
        title: "Recording too short",
        description: `Recording must be at least ${MIN_DURATION} second`,
        variant: "destructive",
      });
      return;
    }

    if (!selectedMood || selectedMood.trim() === "") {
      toast({
        title: "Add a mood emoji",
        description: "Enter an emoji to represent your mood",
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
        return;
      }

      setIsUploading(true);

      // Get topic ID from original clip
      const { data: originalClipData } = await supabase
        .from("clips")
        .select("topic_id")
        .eq("id", originalClipId)
        .single();

      if (!originalClipData?.topic_id) {
        throw new Error("Original clip topic not found");
      }

      const profileCity = localStorage.getItem("profileCity");
      const profileConsentCity = localStorage.getItem("profileConsentCity") === "true";

      // Generate waveform (simplified - in production use actual audio analysis)
      const waveform = Array(24).fill(0.5);

      // Use upload queue
      await enqueueUpload({
        topicId: originalClipData.topic_id,
        profileId,
        deviceId,
        duration,
        moodEmoji: selectedMood,
        waveform,
        audioBlob: recordedBlob,
        city: profileCity,
        consentCity: profileConsentCity,
        contentRating: "general",
        title: title.trim() || null,
        caption: caption.trim() || null,
        duetOfClipId: originalClipId,
      });

      toast({
        title: "Duet queued!",
        description: "Your duet is being uploaded",
      });

      handleReset();
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error("Error submitting duet:", error);
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload duet",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  }, [recordedBlob, duration, selectedMood, title, caption, originalClipId, toast, onSuccess, onClose, handleReset]);

  // Setup audio elements
  useEffect(() => {
    if (recordedBlob && !audioPlayerRef.current) {
      const audio = new Audio(URL.createObjectURL(recordedBlob));
      audio.volume = duetVolume;
      audio.onended = () => {
        setIsPlaying(false);
        if (playbackTimerRef.current) {
          clearInterval(playbackTimerRef.current);
          playbackTimerRef.current = null;
        }
      };
      audioPlayerRef.current = audio;
    }

    if (originalAudioBlob && !originalAudioRef.current) {
      const audio = new Audio(URL.createObjectURL(originalAudioBlob));
      audio.volume = originalVolume;
      audio.onended = () => {
        setIsPlayingOriginal(false);
      };
      originalAudioRef.current = audio;
    }

    return () => {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }
      if (originalAudioRef.current) {
        originalAudioRef.current.pause();
        originalAudioRef.current = null;
      }
    };
  }, [recordedBlob, originalAudioBlob, duetVolume, originalVolume]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Create Duet
          </DialogTitle>
          <DialogDescription>
            Record your voice alongside {originalClip?.profiles?.handle || "this clip"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Original Clip Preview */}
          {originalClip && (
            <div className="p-4 rounded-2xl bg-muted border border-border">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline">Original</Badge>
                <span className="text-sm text-muted-foreground">
                  {originalClip.profiles?.handle || "Unknown"}
                </span>
              </div>
              {originalClip.title && (
                <h4 className="font-semibold mb-1">{originalClip.title}</h4>
              )}
              {originalClip.summary && (
                <p className="text-sm text-muted-foreground mb-3">{originalClip.summary}</p>
              )}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleOriginalPlayback}
                  className="rounded-full"
                >
                  {isPlayingOriginal ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </Button>
                <div className="flex-1">
                  <Slider
                    value={[originalVolume]}
                    onValueChange={([value]) => {
                      setOriginalVolume(value);
                      if (originalAudioRef.current) {
                        originalAudioRef.current.volume = value;
                      }
                    }}
                    min={0}
                    max={1}
                    step={0.1}
                    className="w-full"
                  />
                </div>
                <span className="text-xs text-muted-foreground w-16 text-right">
                  {Math.round(originalPlaybackProgress)}s / {Math.round(originalDuration)}s
                </span>
              </div>
            </div>
          )}

          {/* Recording Section */}
          <div className="p-6 rounded-2xl border border-border">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Your Duet</h3>
              <Badge variant="secondary">Right Side</Badge>
            </div>

            {!recordedBlob ? (
              <div className="space-y-4">
                <div className="flex items-center justify-center h-32 rounded-2xl bg-muted">
                  {isRecording ? (
                    <div className="text-center">
                      <Waves className="h-12 w-12 mx-auto mb-2 animate-pulse text-primary" />
                      <div className="text-2xl font-bold">{duration}s</div>
                    </div>
                  ) : (
                    <div className="text-center">
                      <Mic className="h-12 w-12 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Ready to record</p>
                    </div>
                  )}
                </div>

                {/* Waveform */}
                {isRecording && (
                  <div className="flex items-center justify-center gap-1 h-16">
                    {waveform.map((value, i) => (
                      <div
                        key={i}
                        className="w-2 bg-primary rounded-full transition-all"
                        style={{ height: `${value * 100}%` }}
                      />
                    ))}
                  </div>
                )}

                <div className="flex justify-center gap-4">
                  {!isRecording ? (
                    <Button
                      onClick={startRecording}
                      size="lg"
                      className="rounded-full"
                    >
                      <Mic className="h-5 w-5 mr-2" />
                      Start Recording
                    </Button>
                  ) : (
                    <Button
                      onClick={stopRecording}
                      size="lg"
                      variant="destructive"
                      className="rounded-full"
                    >
                      <Pause className="h-5 w-5 mr-2" />
                      Stop Recording
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={togglePlayback}
                    className="rounded-full"
                  >
                    {isPlaying ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </Button>
                  <div className="flex-1">
                    <Slider
                      value={[duetVolume]}
                      onValueChange={([value]) => {
                        setDuetVolume(value);
                        if (audioPlayerRef.current) {
                          audioPlayerRef.current.volume = value;
                        }
                      }}
                      min={0}
                      max={1}
                      step={0.1}
                      className="w-full"
                    />
                  </div>
                  <span className="text-xs text-muted-foreground w-16 text-right">
                    {Math.round(playbackProgress)}s / {duration}s
                  </span>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setRecordedBlob(null);
                    setDuration(0);
                  }}
                  className="w-full"
                >
                  Record Again
                </Button>
              </div>
            )}
          </div>

          {/* Sync Playback Toggle */}
          {recordedBlob && originalAudioBlob && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-muted">
              <input
                type="checkbox"
                checked={syncPlayback}
                onChange={(e) => setSyncPlayback(e.target.checked)}
                className="rounded"
              />
              <label className="text-sm">Play both tracks together</label>
            </div>
          )}

          {/* Metadata */}
          {recordedBlob && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Mood Emoji *</label>
                <EmojiPicker
                  value={selectedMood || ""}
                  onChange={setSelectedMood}
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Title (optional)</label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Give your duet a title"
                  className="rounded-2xl"
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Caption (optional)</label>
                <Textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Add a caption..."
                  rows={3}
                  className="rounded-2xl"
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={onClose} className="rounded-full">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!recordedBlob || !selectedMood || isUploading}
              className="rounded-full"
            >
              {isUploading ? "Uploading..." : "Post Duet"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

