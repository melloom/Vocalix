import React, { createContext, useContext, useState, useRef, useEffect, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logError, logWarn } from "@/lib/logger";

interface Clip {
  id: string;
  title?: string;
  summary?: string;
  audio_path: string;
  profiles?: {
    handle?: string;
    emoji_avatar?: string;
  };
}

interface AudioPlayerContextType {
  currentClip: Clip | null;
  isPlaying: boolean;
  progress: number;
  duration: number;
  playClip: (clip: Clip) => Promise<void>;
  pause: () => void;
  resume: () => void;
  togglePlayPause: () => void;
  seek: (time: number) => void;
  setPlaybackRate: (rate: number) => void;
  playbackRate: number;
  stop: () => void;
}

export const AudioPlayerContext = createContext<AudioPlayerContextType | undefined>(undefined);

export const AudioPlayerProvider = ({ children }: { children: ReactNode }) => {
  const [currentClip, setCurrentClip] = useState<Clip | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressUpdateRef = useRef<number | null>(null);
  const { toast } = useToast();

  // Initialize Media Session API
  useEffect(() => {
    if (!("mediaSession" in navigator)) {
      logWarn("Media Session API not supported");
      return;
    }

    const mediaSession = navigator.mediaSession;

    // Set action handlers
    mediaSession.setActionHandler("play", () => {
      resume();
    });

    mediaSession.setActionHandler("pause", () => {
      pause();
    });

    mediaSession.setActionHandler("seekto", (details) => {
      if (details.seekTime !== undefined && audioRef.current) {
        audioRef.current.currentTime = details.seekTime;
      }
    });

    mediaSession.setActionHandler("seekbackward", (details) => {
      if (audioRef.current) {
        const seekTime = details.seekTime || 10;
        audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - seekTime);
      }
    });

    mediaSession.setActionHandler("seekforward", (details) => {
      if (audioRef.current && audioRef.current.duration) {
        const seekTime = details.seekTime || 10;
        audioRef.current.currentTime = Math.min(
          audioRef.current.duration,
          audioRef.current.currentTime + seekTime
        );
      }
    });

    // Handle interruptions
    mediaSession.setActionHandler("previoustrack", () => {
      // Could implement previous clip in playlist
    });

    mediaSession.setActionHandler("nexttrack", () => {
      // Could implement next clip in playlist
    });
  }, []);

  // Update Media Session metadata when clip changes
  useEffect(() => {
    if (!("mediaSession" in navigator) || !currentClip) return;

    const mediaSession = navigator.mediaSession;

    mediaSession.metadata = new MediaMetadata({
      title: currentClip.title || "Audio Clip",
      artist: currentClip.profiles?.handle || "Anonymous",
      artwork: currentClip.profiles?.emoji_avatar
        ? [
            {
              src: `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"><text y="50%" x="50%" font-size="64" text-anchor="middle" dominant-baseline="middle">${currentClip.profiles.emoji_avatar}</text></svg>`,
              sizes: "512x512",
              type: "image/svg+xml",
            },
          ]
        : [],
    });

    // Update playback state
    mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [currentClip, isPlaying]);

  // Update progress
  useEffect(() => {
    if (!audioRef.current || !isPlaying) {
      if (progressUpdateRef.current) {
        cancelAnimationFrame(progressUpdateRef.current);
        progressUpdateRef.current = null;
      }
      return;
    }

    const updateProgress = () => {
      if (audioRef.current) {
        const current = audioRef.current.currentTime;
        const dur = audioRef.current.duration;
        if (!isNaN(dur) && dur > 0) {
          setProgress((current / dur) * 100);
          setDuration(dur);
        }
      }
      progressUpdateRef.current = requestAnimationFrame(updateProgress);
    };

    progressUpdateRef.current = requestAnimationFrame(updateProgress);

    return () => {
      if (progressUpdateRef.current) {
        cancelAnimationFrame(progressUpdateRef.current);
        progressUpdateRef.current = null;
      }
    };
  }, [isPlaying]);

  // Handle audio events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      if (!isNaN(audio.duration) && audio.duration > 0) {
        setProgress((audio.currentTime / audio.duration) * 100);
        setDuration(audio.duration);

        // Update Media Session position state
        if ("mediaSession" in navigator && navigator.mediaSession.setPositionState) {
          try {
            navigator.mediaSession.setPositionState({
              duration: audio.duration,
              playbackRate: playbackRate,
              position: audio.currentTime,
            });
          } catch (error) {
            // Position state may not be supported on all browsers
            logWarn("Failed to set position state", error);
          }
        }
      }
    };

    const handlePlay = () => {
      setIsPlaying(true);
      if ("mediaSession" in navigator) {
        navigator.mediaSession.playbackState = "playing";
      }
    };

    const handlePause = () => {
      setIsPlaying(false);
      if ("mediaSession" in navigator) {
        navigator.mediaSession.playbackState = "paused";
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setProgress(0);
      setCurrentClip(null);
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
        setAudioUrl(null);
      }
      if ("mediaSession" in navigator) {
        navigator.mediaSession.playbackState = "none";
        navigator.mediaSession.metadata = null;
      }
    };

    const handleError = () => {
      setIsPlaying(false);
      toast({
        title: "Playback error",
        description: "Could not play audio. Please try again.",
        variant: "destructive",
      });
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
  }, [toast, playbackRate, audioUrl]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      if (progressUpdateRef.current) {
        cancelAnimationFrame(progressUpdateRef.current);
      }
    };
  }, [audioUrl]);

  const loadAudio = useCallback(async (clip: Clip) => {
    try {
      // Clean up previous audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
        setAudioUrl(null);
      }

      // Load new audio
      const { data, error } = await supabase.storage
        .from("audio")
        .createSignedUrl(clip.audio_path, 3600); // 1 hour expiry

      if (error) throw error;
      if (!data?.signedUrl) throw new Error("Failed to get signed URL");

      setAudioUrl(data.signedUrl);
      
      // Create or get audio element
      if (!audioRef.current) {
        audioRef.current = new Audio();
      }
      
      audioRef.current.src = data.signedUrl;
      audioRef.current.playbackRate = playbackRate;
      
      // Wait for metadata to load
      await new Promise<void>((resolve, reject) => {
        if (!audioRef.current) {
          reject(new Error("Audio element not available"));
          return;
        }

        const handleLoadedMetadata = () => {
          if (audioRef.current) {
            setDuration(audioRef.current.duration);
          }
          audioRef.current?.removeEventListener("loadedmetadata", handleLoadedMetadata);
          resolve();
        };

        const handleError = () => {
          audioRef.current?.removeEventListener("error", handleError);
          reject(new Error("Failed to load audio"));
        };

        audioRef.current.addEventListener("loadedmetadata", handleLoadedMetadata);
        audioRef.current.addEventListener("error", handleError);

        // Timeout after 10 seconds
        setTimeout(() => {
          if (audioRef.current) {
            audioRef.current.removeEventListener("loadedmetadata", handleLoadedMetadata);
            audioRef.current.removeEventListener("error", handleError);
          }
          reject(new Error("Timeout loading audio"));
        }, 10000);
      });
    } catch (error) {
      logError("Error loading audio", error);
      toast({
        title: "Error loading audio",
        description: "Could not load audio. Please try again.",
        variant: "destructive",
      });
      throw error;
    }
  }, [audioUrl, playbackRate, toast]);

  const playClip = useCallback(async (clip: Clip) => {
    try {
      // If same clip, just resume
      if (currentClip?.id === clip.id && audioRef.current) {
        await audioRef.current.play();
        return;
      }

      // Load and play new clip
      setCurrentClip(clip);
      await loadAudio(clip);
      
      if (audioRef.current) {
        await audioRef.current.play();
      }
    } catch (error) {
      logError("Error playing clip", error);
      toast({
        title: "Playback error",
        description: "Could not play audio. Please try again.",
        variant: "destructive",
      });
    }
  }, [currentClip, loadAudio, toast]);

  const pause = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
  }, []);

  const resume = useCallback(async () => {
    if (audioRef.current) {
      try {
        await audioRef.current.play();
      } catch (error) {
        logError("Error resuming playback", error);
        toast({
          title: "Playback error",
          description: "Could not resume playback.",
          variant: "destructive",
        });
      }
    }
  }, [toast]);

  const togglePlayPause = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      resume();
    }
  }, [isPlaying, pause, resume]);

  const seek = useCallback((time: number) => {
    if (audioRef.current && !isNaN(audioRef.current.duration)) {
      audioRef.current.currentTime = Math.max(0, Math.min(time, audioRef.current.duration));
    }
  }, []);

  const handleSetPlaybackRate = useCallback((rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    setProgress(0);
    setCurrentClip(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "none";
      navigator.mediaSession.metadata = null;
    }
  }, [audioUrl]);

  return (
    <AudioPlayerContext.Provider
      value={{
        currentClip,
        isPlaying,
        progress,
        duration,
        playClip,
        pause,
        resume,
        togglePlayPause,
        seek,
        setPlaybackRate: handleSetPlaybackRate,
        playbackRate,
        stop,
      }}
    >
      {children}
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="metadata"
          style={{ display: "none" }}
        />
      )}
    </AudioPlayerContext.Provider>
  );
};

export const useAudioPlayer = () => {
  const context = useContext(AudioPlayerContext);
  if (context === undefined) {
    throw new Error("useAudioPlayer must be used within an AudioPlayerProvider");
  }
  return context;
};

