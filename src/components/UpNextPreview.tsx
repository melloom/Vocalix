import { useAudioPlayer } from "@/context/AudioPlayerContext";
import { Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getEmojiAvatar } from "@/utils/avatar";
import { formatDuration } from "@/lib/utils";

/**
 * Up Next preview component
 * Shows the next clip in queue with preview and quick actions
 */
export const UpNextPreview = () => {
  const {
    playlistQueue,
    currentQueueIndex,
    autoPlayEnabled,
    setAutoPlayEnabled,
    playNext,
    hasNext,
  } = useAudioPlayer();

  if (!hasNext || !autoPlayEnabled || playlistQueue.length === 0) {
    return null;
  }

  const nextIndex = currentQueueIndex + 1;
  const nextClip = playlistQueue[nextIndex];

  if (!nextClip) {
    return null;
  }

  const emojiAvatar = getEmojiAvatar(nextClip.profiles?.emoji_avatar, "🎧");
  const profileHandle = nextClip.profiles?.handle || "Anonymous";

  return (
    <Card className="p-3 border-primary/20 bg-primary/5">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Avatar className="h-6 w-6 border border-border/50">
              <AvatarFallback className="text-xs bg-muted/50">
                {emojiAvatar}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-muted-foreground truncate">
                Up Next
              </p>
              <p className="text-sm font-semibold truncate">
                {nextClip.title || "Audio Clip"}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {profileHandle} • {formatDuration(nextClip.duration_seconds)}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={playNext}
            className="h-8 px-3"
          >
            <Play className="h-3 w-3 mr-1" />
            Play Now
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setAutoPlayEnabled(false)}
            title="Disable auto-play"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
};

