import { Settings, Gauge, Volume2, SkipForward, Highlighter } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AudioEnhancements } from "@/hooks/useAudioEnhancements";

interface AudioEnhancementControlsProps {
  enhancements: AudioEnhancements;
  onUpdate: <K extends keyof AudioEnhancements>(
    key: K,
    value: AudioEnhancements[K]
  ) => void;
  compact?: boolean;
}

export const AudioEnhancementControls = ({
  enhancements,
  onUpdate,
  compact = false,
}: AudioEnhancementControlsProps) => {
  if (compact) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 rounded-full p-0">
            <Settings className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="end">
          <AudioEnhancementContent enhancements={enhancements} onUpdate={onUpdate} />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2">
        <Settings className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Audio Enhancements</h3>
      </div>
      <AudioEnhancementContent enhancements={enhancements} onUpdate={onUpdate} />
    </div>
  );
};

const AudioEnhancementContent = ({
  enhancements,
  onUpdate,
}: {
  enhancements: AudioEnhancements;
  onUpdate: <K extends keyof AudioEnhancements>(
    key: K,
    value: AudioEnhancements[K]
  ) => void;
}) => {
  return (
    <div className="space-y-4">
      {/* Playback Speed */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="playback-speed" className="flex items-center gap-2 text-sm">
            <Gauge className="h-4 w-4" />
            Playback Speed
          </Label>
          <span className="text-xs text-muted-foreground">{enhancements.playbackSpeed}x</span>
        </div>
        <Select
          value={enhancements.playbackSpeed.toString()}
          onValueChange={(value) => onUpdate("playbackSpeed", parseFloat(value))}
        >
          <SelectTrigger id="playback-speed" className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0.5">0.5x (Slow)</SelectItem>
            <SelectItem value="1">1x (Normal)</SelectItem>
            <SelectItem value="1.5">1.5x (Fast)</SelectItem>
            <SelectItem value="2">2x (Very Fast)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Volume Boost */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="volume-boost" className="flex items-center gap-2 text-sm">
            <Volume2 className="h-4 w-4" />
            Volume Boost
          </Label>
          <span className="text-xs text-muted-foreground">
            {Math.round(enhancements.volumeBoost * 100)}%
          </span>
        </div>
        <Slider
          id="volume-boost"
          min={0.5}
          max={2}
          step={0.1}
          value={[enhancements.volumeBoost]}
          onValueChange={(value) => onUpdate("volumeBoost", value[0])}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-muted-foreground px-1">
          <span>50%</span>
          <span>100%</span>
          <span>200%</span>
        </div>
      </div>

      {/* Skip Silence */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SkipForward className="h-4 w-4 text-muted-foreground" />
          <Label htmlFor="skip-silence" className="text-sm">
            Skip Silence
          </Label>
        </div>
        <Switch
          id="skip-silence"
          checked={enhancements.skipSilence}
          onCheckedChange={(checked) => onUpdate("skipSilence", checked)}
        />
      </div>

      {/* Audio Quality */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="audio-quality" className="flex items-center gap-2 text-sm">
            <Highlighter className="h-4 w-4" />
            Audio Quality
          </Label>
        </div>
        <Select
          value={enhancements.audioQuality}
          onValueChange={(value) =>
            onUpdate("audioQuality", value as "low" | "medium" | "high")
          }
        >
          <SelectTrigger id="audio-quality" className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="low">Low (Faster)</SelectItem>
            <SelectItem value="medium">Medium (Balanced)</SelectItem>
            <SelectItem value="high">High (Best Quality)</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};

