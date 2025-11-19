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
  // Playlist queue support
  playlistQueue: Clip[];
  setPlaylistQueue: (clips: Clip[], startIndex?: number) => void;
  clearPlaylistQueue: () => void;
  playNext: () => void;
  playPrevious: () => void;
  hasNext: boolean;
  hasPrevious: boolean;
  currentQueueIndex: number;
  autoPlayEnabled: boolean;
  setAutoPlayEnabled: (enabled: boolean) => void;
  shuffleEnabled: boolean;
  setShuffleEnabled: (enabled: boolean) => void;
}

export const AudioPlayerContext = createContext<AudioPlayerContextType | undefined>(undefined);

export const AudioPlayerProvider = ({ children }: { children: ReactNode }) => {
  const [currentClip, setCurrentClip] = useState<Clip | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [playlistQueue, setPlaylistQueueState] = useState<Clip[]>([]);
  const [currentQueueIndex, setCurrentQueueIndex] = useState(-1);
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(true);
  const [shuffleEnabled, setShuffleEnabled] = useState(false);
  const [shuffledQueue, setShuffledQueue] = useState<Clip[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressUpdateRef = useRef<number | null>(null);
  const wasPlayingBeforeInterruptionRef = useRef(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();
  const { profile, updateProfile } = useProfile();
  const clipStartTimeRef = useRef<number | null>(null);
  const clipStartProgressRef = useRef<number>(0);

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
        // Will be handled by the effect that updates handlers
      });

      mediaSession.setActionHandler("nexttrack", () => {
        // Will be handled by the effect that updates handlers
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
          // Load from Supabase Storage CDN
          const { getAudioUrl } = await import("@/utils/audioUrl");
          urlToUse = await getAudioUrl(clip.audio_path, {
            checkOffline: false, // Already checked above
            clipId: clip.id,
            expiresIn: 86400, // 24 hours for better CDN caching
          });
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
      
      // Use progressive loading for better performance
      const { loadAudioProgressively } = await import("@/utils/progressiveAudioLoader");
      audioRef.current.playbackRate = playbackRate;
      // Ensure audio continues playing in background
      audioRef.current.setAttribute("playsinline", "true");
      
      // Load audio progressively (browser handles Range requests automatically)
      await loadAudioProgressively(urlToUse, audioRef.current, (loaded, total) => {
        // Optional: Track loading progress if needed
        if (total > 0) {
          const progress = (loaded / total) * 100;
          // Can be used for loading indicators if needed
          console.debug(`Audio loading progress: ${progress.toFixed(1)}%`);
        }
      });
      
      // Set duration after metadata is loaded
      if (audioRef.current.duration) {
        setDuration(audioRef.current.duration);
      }
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
      // Track skip if switching clips early
      if (currentClip?.id && currentClip.id !== clip.id && profile?.id && audioRef.current) {
        const currentTime = audioRef.current.currentTime;
        const duration = audioRef.current.duration || currentClip.duration_seconds || 0;
        const completionPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;
        
        // If user listened less than 50% before switching, consider it a skip
        if (completionPercentage < 50 && currentTime > 0) {
          try {
            const { trackClipSkip } = await import("@/lib/personalization");
            await trackClipSkip(currentClip.id, profile.id, {
              skipReason: 'not_interested',
              listenDurationSeconds: currentTime,
            });
          } catch (error) {
            // Silent failure - non-critical
          }
        }
      }

      // If same clip, just resume
      if (currentClip?.id === clip.id && audioRef.current) {
        await audioRef.current.play();
        clipStartTimeRef.current = Date.now();
        clipStartProgressRef.current = audioRef.current.currentTime;
        return;
      }

      // Load and play new clip
      setCurrentClip(clip);
      await loadAudio(clip);
      
      if (audioRef.current) {
        await audioRef.current.play();
        clipStartTimeRef.current = Date.now();
        clipStartProgressRef.current = 0;
      }
    } catch (error) {
      logError("Error playing clip", error);
      toast({
        title: "Playback error",
        description: "Could not play audio. Please try again.",
        variant: "destructive",
      });
    }
  }, [currentClip, profile, loadAudio, toast]);

  // Handle audio events - must be after playClip is defined
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      if (!isNaN(audio.duration) && audio.duration > 0) {
        const currentProgress = (audio.currentTime / audio.duration) * 100;
        setProgress(currentProgress);
        setDuration(audio.duration);

        // Sync listening progress to cloud (debounced)
        if (currentClip?.id && profile?.id) {
          // Only sync every 5 seconds to avoid too many requests
          if (!saveTimeoutRef.current) {
            saveTimeoutRef.current = setTimeout(async () => {
              try {
                const { syncListeningProgress } = await import("@/utils/offlineSync");
                const deviceId = localStorage.getItem("deviceId");
                await syncListeningProgress(
                  profile.id,
                  currentClip.id,
                  audio.currentTime,
                  currentProgress,
                  deviceId || null
                );
              } catch (error) {
                // Silent failure - progress sync is non-critical
                logWarn("Failed to sync listening progress", error);
              } finally {
                saveTimeoutRef.current = null;
              }
            }, 5000); // Sync every 5 seconds
          }
        }

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

    const handleEnded = async () => {
      setIsPlaying(false);
      setProgress(0);
      
      // Track listening pattern when clip completes
      if (currentClip?.id && profile?.id && audio) {
        try {
          const { updateListeningPattern } = await import("@/lib/personalization");
          const durationSeconds = audio.duration || currentClip.duration_seconds || 0;
          await updateListeningPattern(profile.id, durationSeconds);
        } catch (error) {
          // Silent failure - non-critical
        }
      }
      
      // Reset tracking refs
      clipStartTimeRef.current = null;
      clipStartProgressRef.current = 0;
      
      // Auto-play next clip if enabled and queue exists
      if (autoPlayEnabled && playlistQueue.length > 0 && currentQueueIndex >= 0) {
        const effectiveQueue = shuffleEnabled ? shuffledQueue : playlistQueue;
        const nextIndex = currentQueueIndex + 1;
        if (nextIndex < effectiveQueue.length) {
          // Auto-play next clip
          const nextClip = effectiveQueue[nextIndex];
          setCurrentQueueIndex(nextIndex);
          playClip(nextClip).catch((error) => {
            logError("Error auto-playing next clip", error);
          });
          return; // Don't clear current clip yet
        }
      }
      
      // No next clip, clear current
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
  }, [toast, playbackRate, audioUrl, autoPlayEnabled, playlistQueue, currentQueueIndex, shuffleEnabled, shuffledQueue, playClip, currentClip, profile]);

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

  const stop = useCallback(async () => {
    // Track skip if stopping early
    if (currentClip?.id && profile?.id && audioRef.current) {
      const currentTime = audioRef.current.currentTime;
      const duration = audioRef.current.duration || currentClip.duration_seconds || 0;
      const completionPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;
      
      // If user listened less than 50% before stopping, consider it a skip
      if (completionPercentage < 50 && currentTime > 0) {
        try {
          const { trackClipSkip } = await import("@/lib/personalization");
          await trackClipSkip(currentClip.id, profile.id, {
            skipReason: 'not_interested',
            listenDurationSeconds: currentTime,
          });
        } catch (error) {
          // Silent failure - non-critical
        }
      }
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    setProgress(0);
    setCurrentClip(null);
    setCurrentQueueIndex(-1);
    clipStartTimeRef.current = null;
    clipStartProgressRef.current = 0;
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "none";
      navigator.mediaSession.metadata = null;
    }
  }, [audioUrl]);

  // Shuffle array helper
  const shuffleArray = useCallback(<T,>(array: T[]): T[] => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }, []);

  // Set playlist queue
  const setPlaylistQueue = useCallback((clips: Clip[], startIndex: number = 0) => {
    setPlaylistQueueState(clips);
    if (shuffleEnabled) {
      const shuffled = shuffleArray(clips);
      setShuffledQueue(shuffled);
      setCurrentQueueIndex(startIndex < shuffled.length ? startIndex : 0);
    } else {
      setCurrentQueueIndex(startIndex < clips.length ? startIndex : 0);
    }
  }, [shuffleEnabled, shuffleArray]);

  // Clear playlist queue
  const clearPlaylistQueue = useCallback(() => {
    setPlaylistQueueState([]);
    setShuffledQueue([]);
    setCurrentQueueIndex(-1);
  }, []);

  // Play next clip in queue
  const playNext = useCallback(async () => {
    const effectiveQueue = shuffleEnabled ? shuffledQueue : playlistQueue;
    if (effectiveQueue.length === 0 || currentQueueIndex < 0) return;
    
    const nextIndex = currentQueueIndex + 1;
    if (nextIndex < effectiveQueue.length) {
      const nextClip = effectiveQueue[nextIndex];
      setCurrentQueueIndex(nextIndex);
      await playClip(nextClip);
    } else {
      toast({
        title: "End of playlist",
        description: "You've reached the end of the playlist",
      });
    }
  }, [playlistQueue, shuffledQueue, shuffleEnabled, currentQueueIndex, playClip, toast]);

  // Play previous clip in queue
  const playPrevious = useCallback(async () => {
    const effectiveQueue = shuffleEnabled ? shuffledQueue : playlistQueue;
    if (effectiveQueue.length === 0 || currentQueueIndex < 0) return;
    
    const prevIndex = currentQueueIndex - 1;
    if (prevIndex >= 0) {
      const prevClip = effectiveQueue[prevIndex];
      setCurrentQueueIndex(prevIndex);
      await playClip(prevClip);
    } else {
      // Restart current clip
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        await audioRef.current.play();
      }
    }
  }, [playlistQueue, shuffledQueue, shuffleEnabled, currentQueueIndex, playClip]);

  // Update media session handlers when playlist functions are available
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    const mediaSession = navigator.mediaSession;
    mediaSession.setActionHandler("previoustrack", () => {
      playPrevious();
    });

    mediaSession.setActionHandler("nexttrack", () => {
      playNext();
    });
  }, [playNext, playPrevious]);

  // Update shuffled queue when shuffle is toggled
  useEffect(() => {
    if (shuffleEnabled && playlistQueue.length > 0) {
      const shuffled = shuffleArray(playlistQueue);
      setShuffledQueue(shuffled);
      // Update current index if needed
      if (currentQueueIndex >= 0 && currentQueueIndex < playlistQueue.length) {
        const currentClipId = currentClip?.id;
        if (currentClipId) {
          const newIndex = shuffled.findIndex(c => c.id === currentClipId);
          if (newIndex >= 0) {
            setCurrentQueueIndex(newIndex);
          }
        }
      }
    }
  }, [shuffleEnabled, playlistQueue, shuffleArray, currentQueueIndex, currentClip]);

  const effectiveQueue = shuffleEnabled ? shuffledQueue : playlistQueue;
  const hasNext = currentQueueIndex >= 0 && currentQueueIndex < effectiveQueue.length - 1;
  const hasPrevious = currentQueueIndex > 0;

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
        playlistQueue,
        setPlaylistQueue,
        clearPlaylistQueue,
        playNext,
        playPrevious,
        hasNext,
        hasPrevious,
        currentQueueIndex,
        autoPlayEnabled,
        setAutoPlayEnabled,
        shuffleEnabled,
        setShuffleEnabled,
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

