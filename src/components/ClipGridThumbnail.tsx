import { useState } from "react";
import { Link } from "react-router-dom";
import { Play, Pause, Volume2, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAudioPlayer } from "@/context/AudioPlayerContext";
import { formatDuration } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface ClipGridThumbnailProps {
  clip: {
    id: string;
    audio_path: string;
    duration_seconds: number;
    mood_emoji: string;
    cover_emoji?: string | null;
    listens_count?: number;
    title?: string | null;
    is_private?: boolean;
    status?: string;
  };
  onClick?: () => void;
}

export const ClipGridThumbnail = ({ clip, onClick }: ClipGridThumbnailProps) => {
  const [isHovered, setIsHovered] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const { currentClipId, isPlaying, play, pause } = useAudioPlayer();
  const isCurrentlyPlaying = currentClipId === clip.id && isPlaying;

  // Get audio URL on hover
  const handleMouseEnter = async () => {
    setIsHovered(true);
    if (!audioUrl) {
      const { data } = await supabase.storage
        .from("clips")
        .createSignedUrl(clip.audio_path, 3600);
      if (data?.signedUrl) {
        setAudioUrl(data.signedUrl);
      }
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (onClick) {
      onClick();
    } else {
      // Navigate to clip detail or play
      if (isCurrentlyPlaying) {
        pause();
      } else if (audioUrl) {
        play(audioUrl, clip.id);
      }
    }
  };

  const displayEmoji = clip.cover_emoji || clip.mood_emoji || "🎵";

  return (
    <Link
      to={`/clip/${clip.id}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleClick}
      className="block group"
    >
      <Card className="relative aspect-square overflow-hidden rounded-lg border-0 bg-gradient-to-br from-primary/10 via-accent/5 to-primary/5 hover:from-primary/20 hover:via-accent/10 hover:to-primary/10 transition-all duration-300 cursor-pointer">
        {/* Emoji/Image Background */}
        <div className="absolute inset-0 flex items-center justify-center text-6xl md:text-7xl opacity-60 group-hover:opacity-80 transition-opacity">
          {displayEmoji}
        </div>

        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

        {/* Play/Pause Button Overlay */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-background/90 backdrop-blur-sm flex items-center justify-center shadow-lg">
            {isCurrentlyPlaying ? (
              <Pause className="h-6 w-6 md:h-7 md:w-7 text-foreground ml-0.5" />
            ) : (
              <Play className="h-6 w-6 md:h-7 md:w-7 text-foreground ml-1" />
            )}
          </div>
        </div>

        {/* Bottom Info Bar */}
        <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              {clip.is_private || clip.status === "hidden" ? (
                <Lock className="h-3 w-3 text-white/90 flex-shrink-0" />
              ) : (
                <Volume2 className="h-3 w-3 text-white/90 flex-shrink-0" />
              )}
              <span className="text-[10px] md:text-xs text-white/90 font-medium truncate">
                {formatDuration(clip.duration_seconds)}
              </span>
            </div>
            {clip.listens_count !== undefined && clip.listens_count > 0 && (
              <Badge
                variant="secondary"
                className="h-5 px-1.5 text-[9px] bg-white/20 text-white border-0 backdrop-blur-sm"
              >
                {clip.listens_count}
              </Badge>
            )}
          </div>
        </div>

        {/* Title Overlay (if exists) */}
        {clip.title && (
          <div className="absolute top-2 left-2 right-2">
            <p className="text-[10px] md:text-xs font-medium text-white line-clamp-1 drop-shadow-lg">
              {clip.title}
            </p>
          </div>
        )}
      </Card>
    </Link>
  );
};

