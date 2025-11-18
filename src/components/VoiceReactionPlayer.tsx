import { useState, useRef, useEffect } from "react";
import { Play, Pause, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { logError } from "@/lib/logger";
import { useProfile } from "@/hooks/useProfile";

interface VoiceReaction {
  id: string;
  clip_id: string;
  profile_id: string | null;
  audio_path: string;
  duration_seconds: number;
  created_at: string;
  profiles?: {
    handle: string;
    emoji_avatar: string;
  } | null;
}

interface VoiceReactionPlayerProps {
  voiceReaction: VoiceReaction;
}

export const VoiceReactionPlayer = ({ voiceReaction }: VoiceReactionPlayerProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { profile } = useProfile();
  
  // Get playback speed from user profile (default to 1.0)
  const playbackSpeed = profile?.playback_speed ? Number(profile.playback_speed) : 1.0;

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  const handlePlayPause = async () => {
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }

    if (!audioUrl) {
      setIsLoading(true);
      try {
        const { getAudioUrl } = await import("@/utils/audioUrl");
        const audioUrl = await getAudioUrl(voiceReaction.audio_path, {
          expiresIn: 86400, // 24 hours for better CDN caching
        });

        setAudioUrl(audioUrl);
        const audio = new Audio(audioUrl);
        audioRef.current = audio;
        // Apply user's playback speed preference
        audio.playbackRate = playbackSpeed;

        audio.onended = () => {
          setIsPlaying(false);
        };

        audio.onerror = () => {
          setIsPlaying(false);
          setIsLoading(false);
          logError("Error playing audio");
        };

        await audio.play();
        setIsPlaying(true);
        setIsLoading(false);
      } catch (error) {
        logError("Error loading audio", error);
        setIsLoading(false);
      }
    } else {
      if (audioRef.current) {
        // Ensure playback speed is applied
        audioRef.current.playbackRate = playbackSpeed;
        await audioRef.current.play();
        setIsPlaying(true);
      }
    }
  };
  
  // Update playback speed when profile changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  const handle = voiceReaction.profiles?.handle || "Anonymous";
  const emoji = voiceReaction.profiles?.emoji_avatar || "🎤";
  const timeAgo = formatDistanceToNow(new Date(voiceReaction.created_at), { addSuffix: true });

  return (
    <div className="flex items-center gap-2 rounded-xl bg-muted/50 p-2 hover:bg-muted/70 transition-colors">
      <Button
        variant="ghost"
        size="sm"
        onClick={handlePlayPause}
        disabled={isLoading}
        className="h-8 w-8 rounded-full p-0"
      >
        {isLoading ? (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : isPlaying ? (
          <Pause className="h-3.5 w-3.5" />
        ) : (
          <Play className="h-3.5 w-3.5" />
        )}
      </Button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">{emoji}</span>
          <span className="text-xs font-medium truncate">{handle}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{Math.round(voiceReaction.duration_seconds)}s</span>
          <span>•</span>
          <span className="truncate">{timeAgo}</span>
        </div>
      </div>
      {isPlaying && (
        <div className="flex gap-0.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-1 w-1 rounded-full bg-primary animate-pulse"
              style={{
                animationDelay: `${i * 0.1}s`,
                animationDuration: "0.8s",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};

