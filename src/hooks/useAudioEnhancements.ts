import React, { useRef, useCallback, useEffect, useState } from "react";

export interface AudioEnhancements {
  playbackSpeed: number;
  skipSilence: boolean;
  volumeBoost: number; // 0-2 (0 = no boost, 2 = 2x volume)
  audioQuality: "low" | "medium" | "high";
}

const DEFAULT_ENHANCEMENTS: AudioEnhancements = {
  playbackSpeed: 1,
  skipSilence: false,
  volumeBoost: 1,
  audioQuality: "high",
};

export const useAudioEnhancements = (audioElementRef: React.RefObject<HTMLAudioElement> | HTMLAudioElement | null) => {
  const [enhancements, setEnhancements] = useState<AudioEnhancements>(DEFAULT_ENHANCEMENTS);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const skipSilenceIntervalRef = useRef<number | null>(null);
  const isInitializedRef = useRef(false);

  // Get the actual audio element
  const audioElement = audioElementRef instanceof HTMLAudioElement 
    ? audioElementRef 
    : audioElementRef?.current || null;

  // Initialize Web Audio API nodes
  const initializeAudioNodes = useCallback(() => {
    if (!audioElement || isInitializedRef.current) return;

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AudioContextClass();
      
      sourceNodeRef.current = audioContextRef.current.createMediaElementSource(audioElement);
      gainNodeRef.current = audioContextRef.current.createGain();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 2048;
      analyserRef.current.smoothingTimeConstant = 0.8;

      // Connect: source -> gain -> analyser -> destination
      sourceNodeRef.current.connect(gainNodeRef.current);
      gainNodeRef.current.connect(analyserRef.current);
      analyserRef.current.connect(audioContextRef.current.destination);

      isInitializedRef.current = true;
    } catch (error) {
      console.warn("Could not initialize Web Audio API:", error);
      // Fallback to basic HTML5 audio if Web Audio API fails
    }
  }, [audioElement]);

  // Apply playback speed
  useEffect(() => {
    if (audioElement) {
      audioElement.playbackRate = enhancements.playbackSpeed;
    }
  }, [audioElement, enhancements.playbackSpeed]);

  // Apply volume boost
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = enhancements.volumeBoost;
    } else if (audioElement) {
      // Fallback to HTML5 volume if Web Audio API not available
      audioElement.volume = Math.min(enhancements.volumeBoost, 1);
    }
  }, [audioElement, enhancements.volumeBoost]);

  // Skip silence functionality
  useEffect(() => {
    if (!enhancements.skipSilence || !audioElement) {
      if (skipSilenceIntervalRef.current) {
        clearInterval(skipSilenceIntervalRef.current);
        skipSilenceIntervalRef.current = null;
      }
      return;
    }

    // Wait for analyser to be initialized
    if (!analyserRef.current) {
      // Try to initialize if audio is playing
      if (!audioElement.paused) {
        initializeAudioNodes();
      }
      return;
    }

    const SILENCE_THRESHOLD = 0.015; // Adjust based on testing
    const CHECK_INTERVAL = 150; // Check every 150ms
    const SKIP_DURATION = 0.3; // Skip 0.3 seconds of silence
    const MIN_SILENCE_DURATION = 0.5; // Minimum silence duration before skipping
    let silenceStartTime: number | null = null;

    skipSilenceIntervalRef.current = window.setInterval(() => {
      if (!audioElement || !analyserRef.current || audioElement.paused) {
        silenceStartTime = null;
        return;
      }

      try {
        const bufferLength = analyserRef.current.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyserRef.current.getByteFrequencyData(dataArray);

        // Calculate average volume
        const sum = dataArray.reduce((acc, val) => acc + val, 0);
        const average = sum / bufferLength / 255; // Normalize to 0-1

        const currentTime = audioElement.currentTime;

        // If silence detected
        if (average < SILENCE_THRESHOLD) {
          if (silenceStartTime === null) {
            silenceStartTime = currentTime;
          } else {
            // Check if we've been in silence long enough
            const silenceDuration = currentTime - silenceStartTime;
            if (silenceDuration >= MIN_SILENCE_DURATION) {
              // Skip ahead
              const newTime = Math.min(
                currentTime + SKIP_DURATION,
                audioElement.duration - 0.1 // Don't skip to the very end
              );
              audioElement.currentTime = newTime;
              silenceStartTime = newTime; // Reset silence start
            }
          }
        } else {
          // Not silent, reset silence tracking
          silenceStartTime = null;
        }
      } catch (error) {
        console.warn("Error in skip silence:", error);
        silenceStartTime = null;
      }
    }, CHECK_INTERVAL);

    return () => {
      if (skipSilenceIntervalRef.current) {
        clearInterval(skipSilenceIntervalRef.current);
        skipSilenceIntervalRef.current = null;
      }
      silenceStartTime = null;
    };
  }, [enhancements.skipSilence, audioElement, initializeAudioNodes]);

  // Reset initialization when audio element changes
  useEffect(() => {
    if (!audioElement) {
      isInitializedRef.current = false;
      return;
    }

    // Reset initialization flag when element changes
    isInitializedRef.current = false;
    
    // Resume audio context on user interaction
    const resumeContext = async () => {
      if (audioContextRef.current?.state === "suspended") {
        await audioContextRef.current.resume();
      }
    };
    
    const handlePlay = () => {
      if (!isInitializedRef.current) {
        initializeAudioNodes();
      }
      resumeContext();
    };
    
    audioElement.addEventListener("play", handlePlay);

    return () => {
      // Cleanup
      audioElement.removeEventListener("play", handlePlay);
      // Reset initialization for next audio element
      isInitializedRef.current = false;
    };
  }, [audioElement, initializeAudioNodes]);

  const updateEnhancement = useCallback(<K extends keyof AudioEnhancements>(
    key: K,
    value: AudioEnhancements[K]
  ) => {
    setEnhancements((prev) => ({ ...prev, [key]: value }));
  }, []);

  const resetEnhancements = useCallback(() => {
    setEnhancements(DEFAULT_ENHANCEMENTS);
  }, []);

  return {
    enhancements,
    updateEnhancement,
    resetEnhancements,
  };
};

