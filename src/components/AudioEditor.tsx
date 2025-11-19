import { useState, useRef, useEffect, useCallback } from "react";
import { Play, Pause, Scissors, Volume2, Waves, Sparkles, RotateCcw, Check, X, Music, Zap, Layers, Filter, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { trimAudio, getAudioDuration } from "@/utils/audioTrimming";
import { normalizeAudioVolume, adjustAudioVolume } from "@/utils/audioNormalization";
import { reduceNoise, detectBackgroundNoise, type NoiseReductionOptions } from "@/utils/audioQuality";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { 
  adjustPitch, 
  adjustSpeed, 
  applyEcho, 
  applyReverb, 
  applyVoiceFilter,
  type VoiceFilterType 
} from "@/utils/audioEffects";
import { 
  mixAudioTracks, 
  crossfadeAudio, 
  adjustTrackVolume,
  type AudioTrack 
} from "@/utils/audioMultiTrack";
import { 
  autoRemoveSilence, 
  autoLevelVolume, 
  autoTransition 
} from "@/utils/audioSmartEditing";
import { 
  getBackgroundMusic, 
  getSoundEffects, 
  loadLibraryAudio,
  type BackgroundMusicItem,
  type SoundEffectItem 
} from "@/utils/audioLibrary";

interface AudioEditorProps {
  isOpen: boolean;
  onClose: () => void;
  audioBlob: Blob | null;
  onSave: (editedBlob: Blob) => void;
  originalDuration?: number;
}

export function AudioEditor({
  isOpen,
  onClose,
  audioBlob,
  onSave,
  originalDuration = 0,
}: AudioEditorProps) {
  const [editedBlob, setEditedBlob] = useState<Blob | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  
  // Editing parameters
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [fadeInDuration, setFadeInDuration] = useState(0);
  const [fadeOutDuration, setFadeOutDuration] = useState(0);
  const [normalizeVolume, setNormalizeVolume] = useState(true);
  const [noiseReduction, setNoiseReduction] = useState(false);
  const [noiseReductionStrength, setNoiseReductionStrength] = useState(0.5);
  const [volumeAdjustment, setVolumeAdjustment] = useState(1.0);
  
  // Advanced Effects
  const [pitchAdjustment, setPitchAdjustment] = useState(0); // -12 to +12 semitones
  const [speedAdjustment, setSpeedAdjustment] = useState(1.0); // 0.5 to 2.0
  const [preservePitch, setPreservePitch] = useState(false);
  const [echoEnabled, setEchoEnabled] = useState(false);
  const [echoDelay, setEchoDelay] = useState(0.2);
  const [echoFeedback, setEchoFeedback] = useState(0.3);
  const [reverbEnabled, setReverbEnabled] = useState(false);
  const [reverbRoomSize, setReverbRoomSize] = useState(0.3);
  const [reverbDamping, setReverbDamping] = useState(0.5);
  const [voiceFilter, setVoiceFilter] = useState<VoiceFilterType>("none");
  const [voiceFilterIntensity, setVoiceFilterIntensity] = useState(0.5);
  
  // Multi-Track
  const [backgroundMusic, setBackgroundMusic] = useState<BackgroundMusicItem | null>(null);
  const [backgroundMusicVolume, setBackgroundMusicVolume] = useState(0.3);
  const [soundEffects, setSoundEffects] = useState<SoundEffectItem[]>([]);
  const [crossfadeEnabled, setCrossfadeEnabled] = useState(false);
  const [crossfadeDuration, setCrossfadeDuration] = useState(0.5);
  
  // Smart Editing
  const [autoRemoveSilenceEnabled, setAutoRemoveSilenceEnabled] = useState(false);
  const [autoLevelEnabled, setAutoLevelEnabled] = useState(false);
  const [autoTransitionEnabled, setAutoTransitionEnabled] = useState(false);
  
  // Analysis
  const [noiseLevel, setNoiseLevel] = useState<number | null>(null);
  const [hasExcessiveNoise, setHasExcessiveNoise] = useState(false);
  
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const playbackTimerRef = useRef<number | null>(null);
  const { toast } = useToast();

  // Load audio and get duration
  useEffect(() => {
    if (!isOpen || !audioBlob) return;
    
    const loadAudio = async () => {
      const dur = originalDuration || await getAudioDuration(audioBlob);
      setDuration(dur);
      setTrimStart(0);
      setTrimEnd(0);
      setEditedBlob(audioBlob);
      
      // Analyze noise
      const { noiseLevel: level, hasExcessiveNoise: excessive } = await detectBackgroundNoise(audioBlob);
      setNoiseLevel(level);
      setHasExcessiveNoise(excessive);
      
      if (excessive) {
        toast({
          title: "Background noise detected",
          description: "Consider enabling noise reduction for better quality.",
        });
      }
    };
    
    loadAudio();
  }, [isOpen, audioBlob, originalDuration, toast]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (playbackTimerRef.current) {
        clearInterval(playbackTimerRef.current);
      }
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }
    };
  }, []);

  // Preview edited audio
  const previewEdited = useCallback(async () => {
    if (!audioBlob) return;
    
    setIsProcessing(true);
    try {
      let processed = audioBlob;
      
      // Apply smart editing first (auto-remove silence, auto-level)
      if (autoRemoveSilenceEnabled) {
        processed = await autoRemoveSilence(processed);
      }
      
      if (autoLevelEnabled) {
        processed = await autoLevelVolume(processed);
      }
      
      // Apply trim
      if (trimStart > 0 || trimEnd > 0) {
        processed = await trimAudio(processed, trimStart, trimEnd);
      }
      
      // Apply fade in/out
      if (fadeInDuration > 0 || fadeOutDuration > 0) {
        processed = await applyFade(processed, fadeInDuration, fadeOutDuration);
      }
      
      // Apply auto-transition
      if (autoTransitionEnabled) {
        processed = await autoTransition(processed, {
          duration: crossfadeDuration,
          curve: "exponential",
        });
      }
      
      // Apply advanced effects
      if (pitchAdjustment !== 0) {
        processed = await adjustPitch(processed, { semitones: pitchAdjustment });
      }
      
      if (speedAdjustment !== 1.0) {
        processed = await adjustSpeed(processed, {
          speed: speedAdjustment,
          preservePitch: preservePitch,
        });
      }
      
      if (echoEnabled) {
        processed = await applyEcho(processed, {
          delay: echoDelay,
          feedback: echoFeedback,
          wetLevel: 0.5,
        });
      }
      
      if (reverbEnabled) {
        processed = await applyReverb(processed, {
          roomSize: reverbRoomSize,
          damping: reverbDamping,
          wetLevel: 0.5,
        });
      }
      
      if (voiceFilter !== "none") {
        processed = await applyVoiceFilter(processed, {
          type: voiceFilter,
          intensity: voiceFilterIntensity,
        });
      }
      
      // Apply volume normalization
      if (normalizeVolume) {
        processed = await normalizeAudioVolume(processed);
      }
      
      // Apply volume adjustment
      if (volumeAdjustment !== 1.0) {
        processed = await adjustAudioVolume(processed, volumeAdjustment);
      }
      
      // Apply noise reduction
      if (noiseReduction) {
        processed = await reduceNoise(processed, {
          strength: noiseReductionStrength,
          preserveVoices: true,
        });
      }
      
      // Apply multi-track mixing (background music and sound effects)
      if (backgroundMusic || soundEffects.length > 0) {
        const tracks: AudioTrack[] = [
          {
            blob: processed,
            volume: 1.0,
            startTime: 0,
          },
        ];
        
        if (backgroundMusic) {
          try {
            const musicBlob = await loadLibraryAudio(backgroundMusic);
            tracks.push({
              blob: musicBlob,
              volume: backgroundMusicVolume,
              startTime: 0,
            });
          } catch (error) {
            console.warn("Failed to load background music:", error);
          }
        }
        
        for (const effect of soundEffects) {
          try {
            const effectBlob = await loadLibraryAudio(effect);
            tracks.push({
              blob: effectBlob,
              volume: 0.5,
              startTime: 0,
            });
          } catch (error) {
            console.warn("Failed to load sound effect:", error);
          }
        }
        
        if (tracks.length > 1) {
          processed = await mixAudioTracks(tracks);
        }
      }
      
      setEditedBlob(processed);
      toast({
        title: "Preview ready",
        description: "Click play to hear the edited version.",
      });
    } catch (error) {
      console.error("Error processing audio:", error);
      toast({
        title: "Processing failed",
        description: "Could not process audio. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  }, [
    audioBlob,
    trimStart,
    trimEnd,
    fadeInDuration,
    fadeOutDuration,
    normalizeVolume,
    volumeAdjustment,
    noiseReduction,
    noiseReductionStrength,
    pitchAdjustment,
    speedAdjustment,
    preservePitch,
    echoEnabled,
    echoDelay,
    echoFeedback,
    reverbEnabled,
    reverbRoomSize,
    reverbDamping,
    voiceFilter,
    voiceFilterIntensity,
    backgroundMusic,
    backgroundMusicVolume,
    soundEffects,
    autoRemoveSilenceEnabled,
    autoLevelEnabled,
    autoTransitionEnabled,
    crossfadeDuration,
    toast,
  ]);

  // Play/pause preview
  const togglePlayback = useCallback(() => {
    if (!editedBlob) {
      previewEdited();
      return;
    }
    
    if (!audioPlayerRef.current) {
      const url = URL.createObjectURL(editedBlob);
      const audio = new Audio(url);
      audioPlayerRef.current = audio;
      
      audio.addEventListener("ended", () => {
        setIsPlaying(false);
        setPlaybackProgress(0);
        if (playbackTimerRef.current) {
          clearInterval(playbackTimerRef.current);
        }
      });
      
      audio.addEventListener("timeupdate", () => {
        if (audio.duration) {
          setPlaybackProgress((audio.currentTime / audio.duration) * 100);
        }
      });
    }
    
    if (isPlaying) {
      audioPlayerRef.current.pause();
      if (playbackTimerRef.current) {
        clearInterval(playbackTimerRef.current);
      }
    } else {
      audioPlayerRef.current.play();
    }
    
    setIsPlaying(!isPlaying);
  }, [editedBlob, isPlaying, previewEdited]);

  // Apply fade in/out
  const applyFade = async (blob: Blob, fadeIn: number, fadeOut: number): Promise<Blob> => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const arrayBuffer = await blob.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      const sampleRate = audioBuffer.sampleRate;
      const fadeInSamples = Math.floor(fadeIn * sampleRate);
      const fadeOutSamples = Math.floor(fadeOut * sampleRate);
      
      for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
        const channelData = audioBuffer.getChannelData(channel);
        
        // Fade in
        for (let i = 0; i < fadeInSamples && i < channelData.length; i++) {
          const fadeValue = i / fadeInSamples;
          channelData[i] *= fadeValue;
        }
        
        // Fade out
        for (let i = 0; i < fadeOutSamples && i < channelData.length; i++) {
          const fadeValue = i / fadeOutSamples;
          const index = channelData.length - 1 - i;
          channelData[index] *= fadeValue;
        }
      }
      
      // Render to blob
      const offlineContext = new OfflineAudioContext(
        audioBuffer.numberOfChannels,
        audioBuffer.length,
        sampleRate
      );
      
      const source = offlineContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(offlineContext.destination);
      source.start(0);
      
      const renderedBuffer = await offlineContext.startRendering();
      const wavBlob = audioBufferToWav(renderedBuffer);
      
      audioContext.close();
      return wavBlob;
    } catch (error) {
      console.warn("Fade application failed:", error);
      return blob;
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

  // Reset all edits
  const handleReset = () => {
    setTrimStart(0);
    setTrimEnd(0);
    setFadeInDuration(0);
    setFadeOutDuration(0);
    setNormalizeVolume(true);
    setNoiseReduction(false);
    setNoiseReductionStrength(0.5);
    setVolumeAdjustment(1.0);
    setPitchAdjustment(0);
    setSpeedAdjustment(1.0);
    setPreservePitch(false);
    setEchoEnabled(false);
    setReverbEnabled(false);
    setVoiceFilter("none");
    setBackgroundMusic(null);
    setSoundEffects([]);
    setAutoRemoveSilenceEnabled(false);
    setAutoLevelEnabled(false);
    setAutoTransitionEnabled(false);
    setEditedBlob(audioBlob);
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
    }
    setIsPlaying(false);
    setPlaybackProgress(0);
  };

  // Save edited audio
  const handleSave = async () => {
    if (!editedBlob) {
      await previewEdited();
      return;
    }
    
    onSave(editedBlob);
    onClose();
    toast({
      title: "Audio edited",
      description: "Your edited audio has been saved.",
    });
  };

  const finalDuration = duration - trimStart - trimEnd;
  const maxTrim = duration * 0.9; // Can trim up to 90% of audio

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Audio Editor</DialogTitle>
          <DialogDescription>
            Edit your audio recording: trim, fade, normalize, and reduce noise
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Preview Controls */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <Button
                  onClick={togglePlayback}
                  disabled={isProcessing || !audioBlob}
                  variant={isPlaying ? "outline" : "default"}
                >
                  {isProcessing ? (
                    <>Processing...</>
                  ) : isPlaying ? (
                    <>
                      <Pause className="h-4 w-4 mr-2" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Play Preview
                    </>
                  )}
                </Button>
                
                <Button onClick={previewEdited} disabled={isProcessing} variant="outline">
                  <Sparkles className="h-4 w-4 mr-2" />
                  Apply Edits
                </Button>
                
                <Button onClick={handleReset} variant="outline" size="sm">
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reset
                </Button>
              </div>
              
              {playbackProgress > 0 && (
                <div className="space-y-2">
                  <Progress value={playbackProgress} />
                  <div className="text-sm text-muted-foreground text-center">
                    {Math.floor((playbackProgress / 100) * finalDuration)}s / {Math.floor(finalDuration)}s
                  </div>
                </div>
              )}
              
              {hasExcessiveNoise && (
                <Badge variant="destructive" className="w-fit">
                  High background noise detected
                </Badge>
              )}
            </CardContent>
          </Card>

          <Tabs defaultValue="trim" className="w-full">
            <TabsList className="grid w-full grid-cols-8">
              <TabsTrigger value="trim">
                <Scissors className="h-4 w-4 mr-2" />
                Trim
              </TabsTrigger>
              <TabsTrigger value="fade">
                <Waves className="h-4 w-4 mr-2" />
                Fade
              </TabsTrigger>
              <TabsTrigger value="volume">
                <Volume2 className="h-4 w-4 mr-2" />
                Volume
              </TabsTrigger>
              <TabsTrigger value="noise">
                <Sparkles className="h-4 w-4 mr-2" />
                Noise
              </TabsTrigger>
              <TabsTrigger value="effects">
                <Zap className="h-4 w-4 mr-2" />
                Effects
              </TabsTrigger>
              <TabsTrigger value="multitrack">
                <Layers className="h-4 w-4 mr-2" />
                Multi-Track
              </TabsTrigger>
              <TabsTrigger value="smart">
                <Gauge className="h-4 w-4 mr-2" />
                Smart
              </TabsTrigger>
            </TabsList>

            {/* Trim Tab */}
            <TabsContent value="trim" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Trim Audio</CardTitle>
                  <CardDescription>
                    Remove silence or unwanted parts from the start and end
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Trim from start: {trimStart.toFixed(1)}s</Label>
                    <Slider
                      value={[trimStart]}
                      onValueChange={([value]) => setTrimStart(value)}
                      max={maxTrim}
                      step={0.1}
                      min={0}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Trim from end: {trimEnd.toFixed(1)}s</Label>
                    <Slider
                      value={[trimEnd]}
                      onValueChange={([value]) => setTrimEnd(value)}
                      max={maxTrim}
                      step={0.1}
                      min={0}
                    />
                  </div>
                  
                  <div className="text-sm text-muted-foreground">
                    Original: {duration.toFixed(1)}s → Final: {finalDuration.toFixed(1)}s
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Fade Tab */}
            <TabsContent value="fade" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Fade In/Out</CardTitle>
                  <CardDescription>
                    Add smooth transitions at the beginning and end
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Fade in duration: {fadeInDuration.toFixed(1)}s</Label>
                    <Slider
                      value={[fadeInDuration]}
                      onValueChange={([value]) => setFadeInDuration(value)}
                      max={Math.min(3, finalDuration / 2)}
                      step={0.1}
                      min={0}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Fade out duration: {fadeOutDuration.toFixed(1)}s</Label>
                    <Slider
                      value={[fadeOutDuration]}
                      onValueChange={([value]) => setFadeOutDuration(value)}
                      max={Math.min(3, finalDuration / 2)}
                      step={0.1}
                      min={0}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Volume Tab */}
            <TabsContent value="volume" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Volume Control</CardTitle>
                  <CardDescription>
                    Normalize and adjust audio volume
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="normalize">Auto-normalize volume</Label>
                    <Switch
                      id="normalize"
                      checked={normalizeVolume}
                      onCheckedChange={setNormalizeVolume}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Manual volume adjustment: {(volumeAdjustment * 100).toFixed(0)}%</Label>
                    <Slider
                      value={[volumeAdjustment]}
                      onValueChange={([value]) => setVolumeAdjustment(value)}
                      max={2}
                      step={0.1}
                      min={0}
                    />
                    <div className="text-xs text-muted-foreground">
                      100% = original volume
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Noise Reduction Tab */}
            <TabsContent value="noise" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Noise Reduction</CardTitle>
                  <CardDescription>
                    Reduce background noise and improve clarity
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {noiseLevel !== null && (
                    <div className="text-sm">
                      <div className="flex items-center justify-between mb-2">
                        <span>Background noise level:</span>
                        <Badge variant={hasExcessiveNoise ? "destructive" : "secondary"}>
                          {(noiseLevel * 100).toFixed(1)}%
                        </Badge>
                      </div>
                      <Progress value={noiseLevel * 100} className="h-2" />
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between">
                    <Label htmlFor="noise-reduction">Enable noise reduction</Label>
                    <Switch
                      id="noise-reduction"
                      checked={noiseReduction}
                      onCheckedChange={setNoiseReduction}
                    />
                  </div>
                  
                  {noiseReduction && (
                    <div className="space-y-2">
                      <Label>Reduction strength: {(noiseReductionStrength * 100).toFixed(0)}%</Label>
                      <Slider
                        value={[noiseReductionStrength]}
                        onValueChange={([value]) => setNoiseReductionStrength(value)}
                        max={1}
                        step={0.1}
                        min={0}
                      />
                      <div className="text-xs text-muted-foreground">
                        Higher values remove more noise but may affect voice quality
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Advanced Effects Tab */}
            <TabsContent value="effects" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Pitch Adjustment</CardTitle>
                  <CardDescription>
                    Change voice pitch without affecting speed
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Pitch: {pitchAdjustment > 0 ? "+" : ""}{pitchAdjustment.toFixed(1)} semitones</Label>
                    <Slider
                      value={[pitchAdjustment]}
                      onValueChange={([value]) => setPitchAdjustment(value)}
                      max={12}
                      min={-12}
                      step={0.5}
                    />
                    <div className="text-xs text-muted-foreground">
                      Positive = higher pitch, Negative = lower pitch
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Speed Adjustment</CardTitle>
                  <CardDescription>
                    Change playback speed (with optional pitch preservation)
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Speed: {(speedAdjustment * 100).toFixed(0)}%</Label>
                    <Slider
                      value={[speedAdjustment]}
                      onValueChange={([value]) => setSpeedAdjustment(value)}
                      max={2}
                      min={0.5}
                      step={0.1}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="preserve-pitch">Preserve pitch when changing speed</Label>
                    <Switch
                      id="preserve-pitch"
                      checked={preservePitch}
                      onCheckedChange={setPreservePitch}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Echo Effect</CardTitle>
                  <CardDescription>
                    Add echo/delay to your audio
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="echo">Enable echo</Label>
                    <Switch
                      id="echo"
                      checked={echoEnabled}
                      onCheckedChange={setEchoEnabled}
                    />
                  </div>
                  {echoEnabled && (
                    <>
                      <div className="space-y-2">
                        <Label>Delay: {echoDelay.toFixed(2)}s</Label>
                        <Slider
                          value={[echoDelay]}
                          onValueChange={([value]) => setEchoDelay(value)}
                          max={1}
                          min={0.1}
                          step={0.05}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Feedback: {(echoFeedback * 100).toFixed(0)}%</Label>
                        <Slider
                          value={[echoFeedback]}
                          onValueChange={([value]) => setEchoFeedback(value)}
                          max={0.9}
                          min={0}
                          step={0.1}
                        />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Reverb Effect</CardTitle>
                  <CardDescription>
                    Add reverb to simulate different room sizes
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="reverb">Enable reverb</Label>
                    <Switch
                      id="reverb"
                      checked={reverbEnabled}
                      onCheckedChange={setReverbEnabled}
                    />
                  </div>
                  {reverbEnabled && (
                    <>
                      <div className="space-y-2">
                        <Label>Room size: {(reverbRoomSize * 100).toFixed(0)}%</Label>
                        <Slider
                          value={[reverbRoomSize]}
                          onValueChange={([value]) => setReverbRoomSize(value)}
                          max={1}
                          min={0}
                          step={0.1}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Damping: {(reverbDamping * 100).toFixed(0)}%</Label>
                        <Slider
                          value={[reverbDamping]}
                          onValueChange={([value]) => setReverbDamping(value)}
                          max={1}
                          min={0}
                          step={0.1}
                        />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Voice Filters</CardTitle>
                  <CardDescription>
                    Apply fun voice effects
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Filter type</Label>
                    <Select value={voiceFilter} onValueChange={(value) => setVoiceFilter(value as VoiceFilterType)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="robot">Robot</SelectItem>
                        <SelectItem value="chipmunk">Chipmunk</SelectItem>
                        <SelectItem value="deep">Deep Voice</SelectItem>
                        <SelectItem value="alien">Alien</SelectItem>
                        <SelectItem value="telephone">Telephone</SelectItem>
                        <SelectItem value="radio">Radio</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {voiceFilter !== "none" && (
                    <div className="space-y-2">
                      <Label>Intensity: {(voiceFilterIntensity * 100).toFixed(0)}%</Label>
                      <Slider
                        value={[voiceFilterIntensity]}
                        onValueChange={([value]) => setVoiceFilterIntensity(value)}
                        max={1}
                        min={0}
                        step={0.1}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Multi-Track Tab */}
            <TabsContent value="multitrack" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Background Music</CardTitle>
                  <CardDescription>
                    Add royalty-free background music to your recording
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Select background music</Label>
                    <Select
                      value={backgroundMusic?.id || "none"}
                      onValueChange={(value) => {
                        if (value === "none") {
                          setBackgroundMusic(null);
                        } else {
                          const music = getBackgroundMusic().find((m) => m.id === value);
                          if (music) setBackgroundMusic(music);
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="No background music" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No background music</SelectItem>
                        {getBackgroundMusic().map((music) => (
                          <SelectItem key={music.id} value={music.id}>
                            {music.name} ({music.category})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {backgroundMusic && (
                    <>
                      <div className="space-y-2">
                        <Label>Music volume: {(backgroundMusicVolume * 100).toFixed(0)}%</Label>
                        <Slider
                          value={[backgroundMusicVolume]}
                          onValueChange={([value]) => setBackgroundMusicVolume(value)}
                          max={1}
                          min={0}
                          step={0.1}
                        />
                        <div className="text-xs text-muted-foreground">
                          Lower volume keeps your voice prominent
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setBackgroundMusic(null)}
                      >
                        Remove background music
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Sound Effects</CardTitle>
                  <CardDescription>
                    Add sound effects to enhance your audio
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Add sound effect</Label>
                    <Select
                      value=""
                      onValueChange={(value) => {
                        const effect = getSoundEffects().find((e) => e.id === value);
                        if (effect && !soundEffects.find((e) => e.id === effect.id)) {
                          setSoundEffects([...soundEffects, effect]);
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a sound effect" />
                      </SelectTrigger>
                      <SelectContent>
                        {getSoundEffects().map((effect) => (
                          <SelectItem key={effect.id} value={effect.id}>
                            {effect.name} ({effect.category})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {soundEffects.length > 0 && (
                    <div className="space-y-2">
                      <Label>Added sound effects:</Label>
                      <div className="space-y-2">
                        {soundEffects.map((effect) => (
                          <div key={effect.id} className="flex items-center justify-between p-2 border rounded">
                            <span className="text-sm">{effect.name}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSoundEffects(soundEffects.filter((e) => e.id !== effect.id))}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Crossfade</CardTitle>
                  <CardDescription>
                    Smooth transitions between audio segments
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="crossfade">Enable crossfade</Label>
                    <Switch
                      id="crossfade"
                      checked={crossfadeEnabled}
                      onCheckedChange={setCrossfadeEnabled}
                    />
                  </div>
                  {crossfadeEnabled && (
                    <div className="space-y-2">
                      <Label>Crossfade duration: {crossfadeDuration.toFixed(1)}s</Label>
                      <Slider
                        value={[crossfadeDuration]}
                        onValueChange={([value]) => setCrossfadeDuration(value)}
                        max={2}
                        min={0.1}
                        step={0.1}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Smart Editing Tab */}
            <TabsContent value="smart" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Auto-Remove Silence</CardTitle>
                  <CardDescription>
                    Automatically detect and remove silent sections
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="auto-silence">Enable auto-remove silence</Label>
                    <Switch
                      id="auto-silence"
                      checked={autoRemoveSilenceEnabled}
                      onCheckedChange={setAutoRemoveSilenceEnabled}
                    />
                  </div>
                  {autoRemoveSilenceEnabled && (
                    <div className="text-xs text-muted-foreground">
                      This will automatically detect and remove silent sections from your audio
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Auto-Level Volume</CardTitle>
                  <CardDescription>
                    Automatically normalize volume levels across the entire clip
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="auto-level">Enable auto-level</Label>
                    <Switch
                      id="auto-level"
                      checked={autoLevelEnabled}
                      onCheckedChange={setAutoLevelEnabled}
                    />
                  </div>
                  {autoLevelEnabled && (
                    <div className="text-xs text-muted-foreground">
                      This will normalize the volume to optimal levels automatically
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Auto-Transition</CardTitle>
                  <CardDescription>
                    Automatically add smooth transitions at the beginning and end
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="auto-transition">Enable auto-transition</Label>
                    <Switch
                      id="auto-transition"
                      checked={autoTransitionEnabled}
                      onCheckedChange={setAutoTransitionEnabled}
                    />
                  </div>
                  {autoTransitionEnabled && (
                    <div className="text-xs text-muted-foreground">
                      This will add smooth fade transitions automatically
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2">
            <Button onClick={onClose} variant="outline">
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isProcessing}>
              <Check className="h-4 w-4 mr-2" />
              Save Edited Audio
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

