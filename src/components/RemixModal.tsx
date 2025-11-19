import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, X, Play, Pause, Waves, Volume2, VolumeX, Scissors, Sparkles, Layers, FileAudio, Zap, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useUploadQueue } from "@/context/UploadQueueContext";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { EmojiPicker } from "@/components/EmojiPicker";
import { logError, logWarn } from "@/lib/logger";
import { supabase } from "@/integrations/supabase/client";
import { trimAudio, getAudioDuration } from "@/utils/audioTrimming";
import { normalizeAudioVolume, adjustAudioVolume } from "@/utils/audioNormalization";
import { mixAudioTracks, AudioTrack } from "@/utils/audioMultiTrack";
import { applyEcho, applyReverb, applyVoiceFilter, EchoOptions, ReverbOptions, VoiceFilterOptions } from "@/utils/audioEffects";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface RemixModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  originalClipId: string;
  originalClip?: {
    id: string;
    audio_path: string;
    title?: string | null;
    summary?: string | null;
    profiles?: {
      handle: string;
      emoji_avatar: string;
    } | null;
  };
  remixChallengeId?: string; // Optional: if remixing for a challenge
}

interface RemixTemplate {
  id: string;
  name: string;
  description: string;
  template_type: 'overlay' | 'sequential' | 'custom';
  original_volume: number;
  remix_volume: number;
}

interface AdditionalClip {
  id: string;
  audio_path: string;
  title?: string | null;
  blob?: Blob;
  volume: number;
  startOffset: number;
  effectType?: string;
}

const WAVEFORM_BINS = 50;

export const RemixModal = ({
  isOpen,
  onClose,
  onSuccess,
  originalClipId,
  originalClip,
}: RemixModalProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [originalAudioBlob, setOriginalAudioBlob] = useState<Blob | null>(null);
  const [mixedAudioBlob, setMixedAudioBlob] = useState<Blob | null>(null);
  const [duration, setDuration] = useState(0);
  const [originalDuration, setOriginalDuration] = useState(0);
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [waveform, setWaveform] = useState<number[]>(Array(WAVEFORM_BINS).fill(0.5));
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [originalVolume, setOriginalVolume] = useState(0.5); // 0-1, volume of original clip
  const [remixVolume, setRemixVolume] = useState(1.0); // 0-1, volume of remix recording
  const [mixMode, setMixMode] = useState<"overlay" | "sequential">("overlay"); // Overlay or play sequentially
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  
  // Enhanced features
  const [realTimeRemix, setRealTimeRemix] = useState(false); // Record while listening
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [templates, setTemplates] = useState<RemixTemplate[]>([]);
  const [additionalClips, setAdditionalClips] = useState<AdditionalClip[]>([]); // Multi-clip support
  const [showMultiClip, setShowMultiClip] = useState(false);
  const [remixEffect, setRemixEffect] = useState<{
    type: 'none' | 'echo' | 'reverb' | 'filter';
    enabled: boolean;
    params: any;
  }>({ type: 'none', enabled: false, params: {} });
  const [isPreviewing, setIsPreviewing] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timerRef = useRef<number | null>(null);
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const playbackTimerRef = useRef<number | null>(null);
  const originalAudioRef = useRef<HTMLAudioElement | null>(null);

  const { toast } = useToast();
  const { enqueueUpload } = useUploadQueue();

  // Load remix templates
  useEffect(() => {
    if (!isOpen) return;
    
    const loadTemplates = async () => {
      try {
        const { data, error } = await supabase
          .from('remix_templates')
          .select('*')
          .eq('is_public', true)
          .order('usage_count', { ascending: false })
          .limit(10);
        
        if (error) throw error;
        if (data) {
          setTemplates(data as RemixTemplate[]);
        }
      } catch (error) {
        logWarn('Failed to load remix templates', error);
      }
    };
    
    loadTemplates();
  }, [isOpen]);

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
    setMixedAudioBlob(null);
    setDuration(0);
    setWaveform(Array(WAVEFORM_BINS).fill(0.5));
    setPlaybackProgress(0);
    setIsPlaying(false);
    setTrimStart(0);
    setTrimEnd(0);
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

      // Real-time remix: play original while recording
      if (realTimeRemix && originalAudioBlob && originalAudioRef.current === null) {
        const originalAudio = new Audio(URL.createObjectURL(originalAudioBlob));
        originalAudioRef.current = originalAudio;
        originalAudio.volume = originalVolume;
        originalAudio.loop = false;
        originalAudio.play().catch(() => {
          // Auto-play may be blocked, user can start manually
        });
      }

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
          setAudioDuration(duration);
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
  }, [animateWaveform, cleanupAudio, toast, realTimeRemix, originalAudioBlob, originalVolume]);

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

  // Enhanced mix audio function with multi-clip and effects support
  const mixAudio = useCallback(async () => {
    if (!recordedBlob || !originalAudioBlob) return;

    try {
      // Apply template if selected
      let templateOriginalVolume = originalVolume;
      let templateRemixVolume = remixVolume;
      if (selectedTemplate) {
        const template = templates.find(t => t.id === selectedTemplate);
        if (template) {
          templateOriginalVolume = template.original_volume;
          templateRemixVolume = template.remix_volume;
        }
      }

      // Prepare tracks for mixing
      const tracks: AudioTrack[] = [];
      
      // Add original clip
      let processedOriginal = originalAudioBlob;
      if (remixEffect.enabled && remixEffect.type !== 'none') {
        // Apply effect to original if specified
        try {
          if (remixEffect.type === 'echo') {
            processedOriginal = await applyEcho(processedOriginal, remixEffect.params as EchoOptions);
          } else if (remixEffect.type === 'reverb') {
            processedOriginal = await applyReverb(processedOriginal, remixEffect.params as ReverbOptions);
          } else if (remixEffect.type === 'filter') {
            processedOriginal = await applyVoiceFilter(processedOriginal, remixEffect.params as VoiceFilterOptions);
          }
        } catch (error) {
          logWarn('Failed to apply effect to original', error);
        }
      }
      
      tracks.push({
        blob: processedOriginal,
        volume: templateOriginalVolume,
        startTime: 0,
      });

      // Add recorded remix
      let processedRemix = recordedBlob;
      tracks.push({
        blob: processedRemix,
        volume: templateRemixVolume,
        startTime: mixMode === 'sequential' ? (await getAudioDuration(processedOriginal)) : 0,
      });

      // Add additional clips if multi-clip mode
      if (additionalClips.length > 0) {
        for (const clip of additionalClips) {
          if (clip.blob) {
            tracks.push({
              blob: clip.blob,
              volume: clip.volume,
              startTime: clip.startOffset,
              fadeIn: 0.2,
              fadeOut: 0.2,
            });
          }
        }
      }

      // Mix all tracks
      const mixedBlob = await mixAudioTracks(tracks);
      setMixedAudioBlob(mixedBlob);
      
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Decode both audio buffers (for duration calculation)
      const originalArrayBuffer = await originalAudioBlob.arrayBuffer();
      const remixArrayBuffer = await recordedBlob.arrayBuffer();
      
      const originalBuffer = await audioContext.decodeAudioData(originalArrayBuffer);
      const remixBuffer = await audioContext.decodeAudioData(remixArrayBuffer);

      // Duration is already calculated from mixedBlob
      const finalDuration = await getAudioDuration(mixedBlob);
      setDuration(Math.floor(finalDuration));
      
      audioContext.close();
    } catch (error) {
      logError("Failed to mix audio", error);
      toast({
        title: "Mixing failed",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  }, [recordedBlob, originalAudioBlob, mixMode, originalVolume, remixVolume, toast, selectedTemplate, templates, additionalClips, remixEffect]);

  // Auto-mix when volumes change
  useEffect(() => {
    if (recordedBlob && originalAudioBlob) {
      mixAudio();
    }
  }, [recordedBlob, originalAudioBlob, mixMode, originalVolume, remixVolume, mixAudio]);

  const handlePlayback = useCallback(() => {
    if (!mixedAudioBlob) {
      toast({
        title: "No audio to play",
        description: "Please record your remix first.",
        variant: "destructive",
      });
      return;
    }

    if (!audioPlayerRef.current) {
      const audio = new Audio(URL.createObjectURL(mixedAudioBlob));
      audioPlayerRef.current = audio;

      audio.addEventListener("ended", () => {
        setIsPlaying(false);
        setPlaybackProgress(0);
        if (playbackTimerRef.current) {
          clearInterval(playbackTimerRef.current);
          playbackTimerRef.current = null;
        }
      });

      audio.addEventListener("timeupdate", () => {
        if (audio.duration) {
          setPlaybackProgress((audio.currentTime / audio.duration) * 100);
        }
      });
    }

    const audio = audioPlayerRef.current;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      if (playbackTimerRef.current) {
        clearInterval(playbackTimerRef.current);
        playbackTimerRef.current = null;
      }
    } else {
      audio.play();
      setIsPlaying(true);
    }
  }, [mixedAudioBlob, isPlaying, toast]);

  const handlePost = async () => {
    if (!mixedAudioBlob || !selectedMood) {
      toast({
        title: "Complete your remix",
        description: "Please record your remix and select a mood.",
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
          description: "Please finish onboarding before remixing.",
          variant: "destructive",
        });
        return;
      }

      // Apply trimming if needed
      let finalBlob = mixedAudioBlob;
      let finalDuration = duration;
      if ((trimStart > 0 || trimEnd > 0) && mixedAudioBlob) {
        try {
          finalBlob = await trimAudio(mixedAudioBlob, trimStart, trimEnd);
          const newDuration = await getAudioDuration(finalBlob);
          finalDuration = Math.floor(newDuration);
        } catch (error) {
          logWarn("Trimming failed, using original", error);
        }
      }

      await enqueueUpload({
        topicId: null, // Will use original clip's topic
        profileId,
        deviceId,
        duration: finalDuration,
        moodEmoji: selectedMood,
        waveform,
        audioBlob: finalBlob,
        title: title.trim() || null,
        caption: caption.trim() || null,
        remixOfClipId: originalClipId,
        challengeId: undefined, // TODO: Pass remixChallengeId from props if available
        contentRating: "general", // Default
      });

      // Save remix sources and template usage after upload (will be handled by backend trigger or separate call)
      // Note: This will be saved after the clip is created via a separate API call or trigger
      
      // Increment template usage if template was used
      if (selectedTemplate) {
        try {
          await supabase.rpc('increment_template_usage', {
            p_template_id: selectedTemplate,
          });
        } catch (error) {
          logWarn('Failed to increment template usage', error);
        }
      }

      toast({
        title: "Remix created!",
        description: "Your remix is being processed.",
      });

      onSuccess();
      onClose();
    } catch (error) {
      logError("Error posting remix", error);
      toast({
        title: "Failed to create remix",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Convert AudioBuffer to WAV Blob
  const audioBufferToWav = (buffer: AudioBuffer): Blob => {
    const length = buffer.length;
    const numberOfChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const bytesPerSample = 2;
    const blockAlign = numberOfChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = length * blockAlign;
    const bufferSize = 44 + dataSize;

    const arrayBuffer = new ArrayBuffer(bufferSize);
    const view = new DataView(arrayBuffer);

    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, "RIFF");
    view.setUint32(4, bufferSize - 8, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    writeString(36, "data");
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let i = 0; i < length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
        const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        view.setInt16(offset, int16, true);
        offset += 2;
      }
    }

    return new Blob([arrayBuffer], { type: "audio/wav" });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Remix</DialogTitle>
          <DialogDescription>
            {originalClip
              ? `Remixing clip by @${originalClip.profiles?.handle || "Anonymous"}`
              : "Record your voice overlay on the original clip"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Original Clip Info */}
          {originalClip && (
            <div className="rounded-xl bg-muted/60 p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium">Original Clip</span>
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2">
                {originalClip.title || originalClip.summary || "No description"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Duration: {originalDuration.toFixed(1)}s
              </p>
            </div>
          )}

          {/* Enhanced Remix Features Tabs */}
          {!recordedBlob && (
            <Tabs defaultValue="basic" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="basic" className="text-xs">Basic</TabsTrigger>
                <TabsTrigger value="templates" className="text-xs">Templates</TabsTrigger>
                <TabsTrigger value="multi" className="text-xs">Multi-Clip</TabsTrigger>
                <TabsTrigger value="effects" className="text-xs">Effects</TabsTrigger>
              </TabsList>

              <TabsContent value="basic" className="space-y-3">
                <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/40">
                  <input
                    type="checkbox"
                    id="realtime"
                    checked={realTimeRemix}
                    onChange={(e) => setRealTimeRemix(e.target.checked)}
                    className="rounded"
                  />
                  <label htmlFor="realtime" className="text-sm cursor-pointer flex-1">
                    <span className="font-medium">Real-time Remix</span>
                    <span className="text-xs text-muted-foreground block">
                      Record while listening to the original
                    </span>
                  </label>
                </div>
              </TabsContent>

              <TabsContent value="templates" className="space-y-3">
                {templates.length > 0 ? (
                  <div className="grid gap-2 max-h-48 overflow-y-auto">
                    {templates.map((template) => (
                      <Card
                        key={template.id}
                        className={`cursor-pointer transition-all ${
                          selectedTemplate === template.id
                            ? 'ring-2 ring-primary'
                            : ''
                        }`}
                        onClick={() => {
                          setSelectedTemplate(template.id);
                          setMixMode(template.template_type === 'custom' ? 'overlay' : template.template_type);
                          setOriginalVolume(template.original_volume);
                          setRemixVolume(template.remix_volume);
                        }}
                      >
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="text-sm font-medium">{template.name}</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {template.description}
                              </p>
                            </div>
                            {selectedTemplate === template.id && (
                              <Badge variant="default" className="ml-2">Selected</Badge>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No templates available
                  </p>
                )}
              </TabsContent>

              <TabsContent value="multi" className="space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium">Add More Clips</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowMultiClip(!showMultiClip)}
                  >
                    <Layers className="h-4 w-4 mr-1" />
                    {showMultiClip ? 'Hide' : 'Add Clips'}
                  </Button>
                </div>
                {showMultiClip && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      You can add up to 3 additional clips to your remix
                    </p>
                    {additionalClips.map((clip, index) => (
                      <div key={clip.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/40">
                        <span className="text-xs flex-1">{clip.title || `Clip ${index + 1}`}</span>
                        <Slider
                          value={[clip.volume]}
                          onValueChange={([v]) => {
                            const updated = [...additionalClips];
                            updated[index].volume = v;
                            setAdditionalClips(updated);
                          }}
                          max={1}
                          step={0.1}
                          className="w-24"
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setAdditionalClips(additionalClips.filter((_, i) => i !== index));
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    {additionalClips.length < 3 && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full"
                        onClick={async () => {
                          // TODO: Open clip selector modal
                          toast({
                            title: "Feature coming soon",
                            description: "Clip selector will be available soon",
                          });
                        }}
                      >
                        <FileAudio className="h-4 w-4 mr-2" />
                        Add Clip
                      </Button>
                    )}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="effects" className="space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="enable-effect"
                      checked={remixEffect.enabled}
                      onChange={(e) => setRemixEffect({ ...remixEffect, enabled: e.target.checked })}
                      className="rounded"
                    />
                    <label htmlFor="enable-effect" className="text-sm font-medium cursor-pointer">
                      Apply Effect to Remix
                    </label>
                  </div>
                  {remixEffect.enabled && (
                    <Select
                      value={remixEffect.type}
                      onValueChange={(value: 'none' | 'echo' | 'reverb' | 'filter') => {
                        setRemixEffect({
                          type: value,
                          enabled: true,
                          params: value === 'echo' ? { delay: 0.2, feedback: 0.3, wetLevel: 0.5 } :
                                  value === 'reverb' ? { roomSize: 0.5, damping: 0.5, wetLevel: 0.3 } :
                                  value === 'filter' ? { type: 'robot', intensity: 0.5 } : {}
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="echo">Echo</SelectItem>
                        <SelectItem value="reverb">Reverb</SelectItem>
                        <SelectItem value="filter">Voice Filter</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          )}

          {/* Recording Section */}
          {!recordedBlob ? (
            <div className="rounded-3xl bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4">
              <div className="flex flex-col items-center gap-3">
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
                <Button
                  onClick={isRecording ? stopRecording : startRecording}
                  size="lg"
                  className="rounded-full w-20 h-20"
                  variant={isRecording ? "destructive" : "default"}
                >
                  {isRecording ? (
                    <Pause className="h-8 w-8" />
                  ) : (
                    <Mic className="h-8 w-8" />
                  )}
                </Button>
                <p className="text-sm text-muted-foreground">
                  {isRecording ? `Recording... ${duration}s` : "Click to start recording"}
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Mix Controls */}
              <div className="rounded-xl bg-muted/60 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium">Mix Settings</label>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={mixMode === "overlay" ? "default" : "outline"}
                      onClick={() => setMixMode("overlay")}
                      className="text-xs"
                    >
                      Overlay
                    </Button>
                    <Button
                      size="sm"
                      variant={mixMode === "sequential" ? "default" : "outline"}
                      onClick={() => setMixMode("sequential")}
                      className="text-xs"
                    >
                      Sequential
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Original Volume</span>
                      <span className="font-medium">{Math.round(originalVolume * 100)}%</span>
                    </div>
                    <Slider
                      value={[originalVolume]}
                      onValueChange={([value]) => setOriginalVolume(value)}
                      max={1}
                      step={0.05}
                      className="w-full"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Your Remix Volume</span>
                      <span className="font-medium">{Math.round(remixVolume * 100)}%</span>
                    </div>
                    <Slider
                      value={[remixVolume]}
                      onValueChange={([value]) => setRemixVolume(value)}
                      max={1}
                      step={0.05}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>

              {/* Playback with Preview */}
              <div className="rounded-3xl bg-gradient-to-br from-primary/10 via-background to-accent/10 p-3">
                <div className="flex items-center gap-3">
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
                        {isPreviewing ? 'Preview Remix' : 'Play Mixed'}
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={async () => {
                      setIsPreviewing(true);
                      await mixAudio();
                      setTimeout(() => {
                        handlePlayback();
                        setIsPreviewing(false);
                      }, 100);
                    }}
                    size="sm"
                    variant="outline"
                    className="h-10"
                  >
                    <Zap className="h-4 w-4 mr-1" />
                    Preview
                  </Button>
                  <div className="text-center min-w-[50px]">
                    <p className="text-xs text-muted-foreground">Duration</p>
                    <p className="text-sm font-semibold">{duration}s</p>
                  </div>
                </div>
                {isPlaying && (
                  <div className="w-full h-0.5 bg-muted rounded-full overflow-hidden mt-2">
                    <div
                      className="h-full bg-primary transition-all duration-100"
                      style={{ width: `${playbackProgress}%` }}
                    />
                  </div>
                )}
              </div>

              {/* Trim Controls */}
              {audioDuration > 0 && (
                <div className="rounded-xl bg-muted/60 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Scissors className="h-4 w-4 text-muted-foreground" />
                    <label className="text-xs font-medium">Trim Remix</label>
                  </div>
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Trim from start</span>
                        <span className="font-medium">{trimStart.toFixed(1)}s</span>
                      </div>
                      <Slider
                        value={[trimStart]}
                        onValueChange={([value]) => {
                          const maxTrim = audioDuration - trimEnd - 0.5;
                          setTrimStart(Math.min(value, maxTrim));
                        }}
                        max={Math.max(0, audioDuration - trimEnd - 0.5)}
                        step={0.1}
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Trim from end</span>
                        <span className="font-medium">{trimEnd.toFixed(1)}s</span>
                      </div>
                      <Slider
                        value={[trimEnd]}
                        onValueChange={([value]) => {
                          const maxTrim = audioDuration - trimStart - 0.5;
                          setTrimEnd(Math.min(value, maxTrim));
                        }}
                        max={Math.max(0, audioDuration - trimStart - 0.5)}
                        step={0.1}
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Mood & Details */}
              <div className="space-y-2">
                <label className="text-xs font-medium">Mood emoji</label>
                <EmojiPicker
                  value={selectedMood}
                  onChange={(emoji) => setSelectedMood(emoji)}
                  placeholder="😊"
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium">Title (optional)</label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Give your remix a title"
                  maxLength={80}
                  className="rounded-xl h-9"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium">Caption (optional)</label>
                <Textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Add a caption..."
                  maxLength={500}
                  className="rounded-xl min-h-[100px]"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleReset}
                  className="flex-1 rounded-xl"
                >
                  <X className="mr-2 h-4 w-4" />
                  Start Over
                </Button>
                <Button
                  onClick={handlePost}
                  disabled={!selectedMood || isUploading}
                  className="flex-1 rounded-xl"
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  {isUploading ? "Publishing..." : "Publish Remix"}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

