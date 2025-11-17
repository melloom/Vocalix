import React, { createContext, useContext, useState, useRef, useEffect, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logError, logWarn } from "@/lib/logger";
import { offlineStorage } from "@/utils/offlineStorage";
import { useProfile } from "@/hooks/useProfile";

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
  const wasPlayingBeforeInterruptionRef = useRef(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();
  const { profile, updateProfile } = useProfile();

  // Load playback speed from user profile on mount or when profile changes
  useEffect(() => {
    if (profile?.playback_speed !== undefined && profile.playback_speed !== null) {
      const speed = Number(profile.playback_speed);
      // Validate speed is within allowed range (0.5 to 2.0)
      if (speed >= 0.5 && speed <= 2.0) {
        setPlaybackRate(speed);
        // Apply to audio element if it exists
        if (audioRef.current) {
          audioRef.current.playbackRate = speed;
        }
      }
    }
  }, [profile?.playback_speed]);

  // Handle page visibility changes - continue playing in background
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!audioRef.current || !currentClip) return;

      // When page becomes visible again, restore playback state if needed
      if (!document.hidden && wasPlayingBeforeInterruptionRef.current) {
        // Only auto-resume if it was playing before and wasn't manually paused
        // This prevents auto-resuming after user explicitly paused
        if (audioRef.current.paused && wasPlayingBeforeInterruptionRef.current) {
          audioRef.current.play().catch((error) => {
            logWarn("Could not auto-resume playback", error);
          });
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [currentClip]);

  // Handle audio interruptions (calls, other audio apps)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleSuspend = () => {
      // Audio was suspended (e.g., by another app or system)
      // This happens when audio is interrupted by phone calls, other apps, etc.
      if (isPlaying && !audio.paused) {
        wasPlayingBeforeInterruptionRef.current = true;
        // The pause event will be fired automatically, which will update state
      }
    };

    const handleResume = () => {
      // Audio can resume (interruption ended)
      // Don't auto-resume here - let user control it via Media Session controls
      // This allows users to decide if they want to continue listening
    };

    audio.addEventListener("suspend", handleSuspend);
    audio.addEventListener("resume", handleResume);

    return () => {
      audio.removeEventListener("suspend", handleSuspend);
      audio.removeEventListener("resume", handleResume);
    };
  }, [isPlaying]);

  // Initialize Media Session API with proper handlers
  useEffect(() => {
    if (!("mediaSession" in navigator)) {
      logWarn("Media Session API not supported");
      return;
    }

    const mediaSession = navigator.mediaSession;

    // Set action handlers - these will be updated when pause/resume functions are available
    const setupMediaSessionHandlers = () => {
      mediaSession.setActionHandler("play", () => {
        if (audioRef.current) {
          audioRef.current.play().catch((error) => {
            logError("Error resuming from media session", error);
          });
        }
      });

      mediaSession.setActionHandler("pause", () => {
        if (audioRef.current) {
          audioRef.current.pause();
        }
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
    };

    setupMediaSessionHandlers();
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
      // Reset interruption flag if user manually paused
      wasPlayingBeforeInterruptionRef.current = false;
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
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
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

      let urlToUse: string;

      // Check if offline and clip is downloaded
      const isOffline = !navigator.onLine;
      if (isOffline) {
        const audioBlob = await offlineStorage.getAudioBlob(clip.id);
        if (audioBlob) {
          // Use offline version
          urlToUse = URL.createObjectURL(audioBlob);
          setAudioUrl(urlToUse);
        } else {
          throw new Error("Clip not available offline. Please connect to the internet to play this clip.");
        }
      } else {
        // Try to use offline version first if available (faster, no network request)
        const audioBlob = await offlineStorage.getAudioBlob(clip.id);
        if (audioBlob) {
          urlToUse = URL.createObjectURL(audioBlob);
          setAudioUrl(urlToUse);
        } else {
          // Load from Supabase
          const { data, error } = await supabase.storage
            .from("audio")
            .createSignedUrl(clip.audio_path, 3600); // 1 hour expiry

          if (error) throw error;
          if (!data?.signedUrl) throw new Error("Failed to get signed URL");

          urlToUse = data.signedUrl;
          setAudioUrl(urlToUse);
        }
      }
      
      // Create or get audio element
      if (!audioRef.current) {
        audioRef.current = new Audio();
        // Configure for background playback
        audioRef.current.crossOrigin = "anonymous"; // Allow CORS for better compatibility
        audioRef.current.preload = "auto"; // Preload for smoother playback
      }
      
      audioRef.current.src = urlToUse;
      audioRef.current.playbackRate = playbackRate;
      // Ensure audio continues playing in background
      audioRef.current.setAttribute("playsinline", "true");
      
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
      const errorMessage = error instanceof Error ? error.message : "Could not load audio. Please try again.";
      toast({
        title: "Error loading audio",
        description: errorMessage,
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
      // Mark as manually paused (not interrupted)
      wasPlayingBeforeInterruptionRef.current = false;
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
          preload="auto"
          crossOrigin="anonymous"
          playsInline
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

