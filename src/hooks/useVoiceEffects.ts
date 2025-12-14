import { useState, useCallback, useRef, useEffect } from "react";

export interface VoiceEffects {
  pitch: {
    enabled: boolean;
    value: number; // -1 to 1 (semitones), 0 = no change
  };
  reverb: {
    enabled: boolean;
    roomSize: number; // 0 to 1
    damping: number; // 0 to 1
  };
  echo: {
    enabled: boolean;
    delay: number; // 0 to 1 (seconds)
    feedback: number; // 0 to 1
  };
  modulation: {
    enabled: boolean;
    type: "robot" | "alien" | "chipmunk" | "darth" | "none";
    intensity: number; // 0 to 1
  };
}

const DEFAULT_EFFECTS: VoiceEffects = {
  pitch: {
    enabled: false,
    value: 0,
  },
  reverb: {
    enabled: false,
    roomSize: 0.3,
    damping: 0.5,
  },
  echo: {
    enabled: false,
    delay: 0.2,
    feedback: 0.3,
  },
  modulation: {
    enabled: false,
    type: "none",
    intensity: 0.5,
  },
};

export const useVoiceEffects = () => {
  const [effects, setEffects] = useState<VoiceEffects>(DEFAULT_EFFECTS);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const convolverRef = useRef<ConvolverNode | null>(null);
  const delayRef = useRef<DelayNode | null>(null);
  const feedbackRef = useRef<GainNode | null>(null);
  const pitchShiftRef = useRef<ScriptProcessorNode | null>(null);

  const updateEffect = useCallback(<K extends keyof VoiceEffects>(
    key: K,
    value: Partial<VoiceEffects[K]>
  ) => {
    setEffects((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...value },
    }));
  }, []);

  const resetEffects = useCallback(() => {
    setEffects(DEFAULT_EFFECTS);
  }, []);

  // Apply effects to audio blob (client-side processing)
  const applyEffects = useCallback(async (audioBlob: Blob): Promise<Blob> => {
    // Check if any effects are enabled
    const hasEffects =
      effects.pitch.enabled ||
      effects.reverb.enabled ||
      effects.echo.enabled ||
      (effects.modulation.enabled && effects.modulation.type !== "none");

    if (!hasEffects) {
      return audioBlob; // Return original if no effects
    }

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextClass();
      audioContextRef.current = audioContext;

      // Decode audio data
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      // Create source buffer
      const sourceBuffer = audioContext.createBufferSource();
      sourceBuffer.buffer = audioBuffer;

      // Create gain node (master volume)
      const gainNode = audioContext.createGain();
      gainNode.gain.value = 1;
      gainNodeRef.current = gainNode;

      // Build audio processing chain
      let lastNode: AudioNode = sourceBuffer;

      // Apply pitch shift (using playback rate as approximation)
      if (effects.pitch.enabled && effects.pitch.value !== 0) {
        // Convert semitones to playback rate: 2^(semitones/12)
        const playbackRate = Math.pow(2, effects.pitch.value / 12);
        sourceBuffer.playbackRate.value = playbackRate;
      }

      // Apply modulation effects
      if (effects.modulation.enabled && effects.modulation.type !== "none") {
        const modulationGain = audioContext.createGain();
        
        switch (effects.modulation.type) {
          case "robot":
            // Robot effect: ring modulation (simplified)
            const oscillator = audioContext.createOscillator();
            oscillator.type = "square";
            oscillator.frequency.value = 50 * (1 + effects.modulation.intensity);
            const ringModGain = audioContext.createGain();
            ringModGain.gain.value = effects.modulation.intensity * 0.3;
            oscillator.connect(ringModGain);
            ringModGain.connect(modulationGain);
            oscillator.start();
            lastNode.connect(modulationGain);
            lastNode = modulationGain;
            break;
          case "chipmunk":
            // Chipmunk: pitch up + speed up
            sourceBuffer.playbackRate.value *= (1 + effects.modulation.intensity * 0.5);
            break;
          case "darth":
            // Darth Vader: pitch down
            sourceBuffer.playbackRate.value *= (1 - effects.modulation.intensity * 0.3);
            break;
          case "alien":
            // Alien: pitch variation
            sourceBuffer.playbackRate.value *= (1 + Math.sin(Date.now() / 100) * effects.modulation.intensity * 0.2);
            break;
        }
      }

      // Apply reverb
      if (effects.reverb.enabled) {
        const convolver = audioContext.createConvolver();
        convolverRef.current = convolver;
        
        // Create impulse response for reverb (simplified)
        const impulseLength = audioContext.sampleRate * 2; // 2 seconds
        const impulse = audioContext.createBuffer(2, impulseLength, audioContext.sampleRate);
        
        for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
          const channelData = impulse.getChannelData(channel);
          for (let i = 0; i < impulseLength; i++) {
            const n = i / impulseLength;
            channelData[i] = (Math.random() * 2 - 1) * (1 - n) * effects.reverb.roomSize * Math.pow(1 - n, effects.reverb.damping * 10);
          }
        }
        
        convolver.buffer = impulse;
        const reverbGain = audioContext.createGain();
        reverbGain.gain.value = 0.5;
        
        lastNode.connect(convolver);
        convolver.connect(reverbGain);
        lastNode = reverbGain;
      }

      // Apply echo/delay
      if (effects.echo.enabled) {
        const delay = audioContext.createDelay(2); // Max 2 seconds delay
        delay.delayTime.value = effects.echo.delay;
        delayRef.current = delay;

        const feedback = audioContext.createGain();
        feedback.gain.value = effects.echo.feedback;
        feedbackRef.current = feedback;

        const delayGain = audioContext.createGain();
        delayGain.gain.value = 0.6; // Wet signal level

        // Connect: input -> delay -> output
        //         input -> output (dry)
        //         delay -> feedback -> delay (feedback loop)
        lastNode.connect(delay);
        lastNode.connect(gainNode); // Dry signal
        delay.connect(delayGain);
        delayGain.connect(gainNode); // Wet signal
        delay.connect(feedback);
        feedback.connect(delay); // Feedback loop
      } else {
        lastNode.connect(gainNode);
      }

      // Connect to destination
      gainNode.connect(audioContext.destination);

      // Render to new audio buffer
      const offlineContext = new OfflineAudioContext(
        audioBuffer.numberOfChannels,
        audioBuffer.length * 2, // Allow for reverb/echo tail
        audioContext.sampleRate
      );

      // Clone the processing chain for offline rendering
      const offlineSource = offlineContext.createBufferSource();
      offlineSource.buffer = audioBuffer;

      // Recreate effects in offline context (simplified - just pitch for now)
      if (effects.pitch.enabled && effects.pitch.value !== 0) {
        const playbackRate = Math.pow(2, effects.pitch.value / 12);
        offlineSource.playbackRate.value = playbackRate;
      }

      const offlineGain = offlineContext.createGain();
      offlineGain.gain.value = 1;
      offlineSource.connect(offlineGain);
      offlineGain.connect(offlineContext.destination);

      offlineSource.start(0);
      const renderedBuffer = await offlineContext.startRendering();

      // Convert back to blob
      const wav = audioBufferToWav(renderedBuffer);
      return new Blob([wav], { type: "audio/wav" });
    } catch (error) {
      console.error("Error applying audio effects:", error);
      return audioBlob; // Return original on error
    }
  }, [effects]);

  // Convert AudioBuffer to WAV
  const audioBufferToWav = (buffer: AudioBuffer): ArrayBuffer => {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;

    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = buffer.length * blockAlign;

    const bufferLength = 44 + dataSize;
    const arrayBuffer = new ArrayBuffer(bufferLength);
    const view = new DataView(arrayBuffer);

    // WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, "RIFF");
    view.setUint32(4, bufferLength - 8, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, "data");
    view.setUint32(40, dataSize, true);

    // Write audio data
    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
      for (let channel = 0; channel < numChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
        view.setInt16(offset, sample * 0x7fff, true);
        offset += 2;
      }
    }

    return arrayBuffer;
  };

  // Convert effects to JSONB format for database storage
  const getEffectsJSON = useCallback((): Record<string, any> | null => {
    const hasEffects =
      effects.pitch.enabled ||
      effects.reverb.enabled ||
      effects.echo.enabled ||
      (effects.modulation.enabled && effects.modulation.type !== "none");

    if (!hasEffects) {
      return null;
    }

    return {
      pitch: effects.pitch.enabled ? { value: effects.pitch.value, enabled: true } : null,
      reverb: effects.reverb.enabled ? { room_size: effects.reverb.roomSize, damping: effects.reverb.damping, enabled: true } : null,
      echo: effects.echo.enabled ? { delay: effects.echo.delay, feedback: effects.echo.feedback, enabled: true } : null,
      modulation: effects.modulation.enabled && effects.modulation.type !== "none"
        ? { type: effects.modulation.type, intensity: effects.modulation.intensity, enabled: true }
        : null,
    };
  }, [effects]);

  return {
    effects,
    updateEffect,
    resetEffects,
    applyEffects,
    getEffectsJSON,
  };
};

