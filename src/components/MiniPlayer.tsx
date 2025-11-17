import { useContext, useState } from "react";
import { AudioPlayerContext } from "@/context/AudioPlayerContext";
import { Play, Pause, X, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useNavigate } from "react-router-dom";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const MiniPlayer = () => {
  const context = useContext(AudioPlayerContext);
  const navigate = useNavigate();

  // Safely handle missing context
  if (!context) return null;
  
  const { currentClip, isPlaying, progress, duration, togglePlayPause, seek, stop, playbackRate, setPlaybackRate } = context;
  const [speedPopoverOpen, setSpeedPopoverOpen] = useState(false);

  if (!currentClip) return null;

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const currentTime = duration > 0 ? (progress / 100) * duration : 0;
  const remainingTime = duration > 0 ? duration - currentTime : 0;

  const handleSeek = (values: number[]) => {
    if (duration <= 0) return;
    const newProgress = values[0];
    const newTime = (newProgress / 100) * duration;
    seek(newTime);
  };

  const handleClose = () => {
    stop();
  };

  const handleClick = () => {
    navigate(`/clip/${currentClip.id}`);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 py-2">
        <div className="flex items-center gap-3">
          {/* Play/Pause Button */}
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0 rounded-full"
            onClick={togglePlayPause}
          >
            {isPlaying ? (
              <Pause className="h-5 w-5" />
            ) : (
              <Play className="h-5 w-5" />
            )}
          </Button>

          {/* Clip Info */}
          <div
            className="flex-1 min-w-0 cursor-pointer"
            onClick={handleClick}
            title={currentClip.title || "Audio Clip"}
          >
            <div className="flex items-center gap-2">
              <div className="text-lg shrink-0">
                {currentClip.profiles?.emoji_avatar || "🎧"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {currentClip.title || "Audio Clip"}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {currentClip.profiles?.handle || "Anonymous"}
                </p>
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="hidden md:flex flex-1 items-center gap-2 max-w-xs">
            <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
              {formatTime(currentTime)}
            </span>
            <Slider
              value={[progress]}
              onValueChange={handleSeek}
              max={100}
              step={0.1}
              className="flex-1"
            />
            <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
              -{formatTime(remainingTime)}
            </span>
          </div>

          {/* Playback Speed Selector */}
          <Popover open={speedPopoverOpen} onOpenChange={setSpeedPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 shrink-0 text-xs"
                title={`Playback Speed: ${playbackRate}x`}
              >
                <Gauge className="h-3.5 w-3.5 mr-1" />
                <span className="hidden sm:inline">{playbackRate}x</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2" align="end">
              <div className="space-y-2">
                <div className="text-xs font-medium px-2 py-1">Playback Speed</div>
                <Select
                  value={playbackRate.toString()}
                  onValueChange={(value) => {
                    setPlaybackRate(parseFloat(value));
                    setSpeedPopoverOpen(false);
                  }}
                >
                  <SelectTrigger className="h-9">
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
            </PopoverContent>
          </Popover>

          {/* Close Button */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={handleClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Mobile Progress Bar */}
        <div className="md:hidden mt-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
              {formatTime(currentTime)}
            </span>
            <Slider
              value={[progress]}
              onValueChange={handleSeek}
              max={100}
              step={0.1}
              className="flex-1"
            />
            <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
              -{formatTime(remainingTime)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

