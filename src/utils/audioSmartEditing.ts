/**
 * Smart audio editing utilities
 * Provides auto-remove silence, auto-level volume, and auto-transition features
 */

export interface SilenceDetectionOptions {
  threshold: number; // RMS threshold below which audio is considered silence (0 to 1)
  minSilenceDuration: number; // Minimum duration of silence to remove (seconds)
  padding: number; // Padding to keep around detected silence (seconds)
}

export interface AutoLevelOptions {
  targetPeak: number; // Target peak level (0 to 1, default 0.95)
  normalizeRMS?: boolean; // Also normalize RMS level
  targetRMS?: number; // Target RMS level (0 to 1)
}

export interface AutoTransitionOptions {
  duration: number; // Transition duration in seconds
  curve?: "linear" | "exponential" | "sigmoid"; // Transition curve
}

/**
 * Automatically remove silence from audio
 */
export async function autoRemoveSilence(
  audioBlob: Blob,
  options: SilenceDetectionOptions = {
    threshold: 0.02,
    minSilenceDuration: 0.3,
    padding: 0.1,
  }
): Promise<Blob> {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const sampleRate = audioBuffer.sampleRate;
    const numberOfChannels = audioBuffer.numberOfChannels;
    const channelData = audioBuffer.getChannelData(0); // Use first channel for detection

    // Analyze audio to find silence regions
    const windowSize = Math.floor(sampleRate * 0.1); // 100ms windows
    const silenceRegions: Array<{ start: number; end: number }> = [];
    let currentSilenceStart: number | null = null;

    for (let i = 0; i < channelData.length - windowSize; i += windowSize) {
      const window = channelData.slice(i, i + windowSize);
      const rms = Math.sqrt(
        window.reduce((sum, sample) => sum + sample * sample, 0) / window.length
      );

      if (rms < options.threshold) {
        // Silence detected
        if (currentSilenceStart === null) {
          currentSilenceStart = i;
        }
      } else {
        // Audio detected
        if (currentSilenceStart !== null) {
          const silenceDuration = (i - currentSilenceStart) / sampleRate;
          if (silenceDuration >= options.minSilenceDuration) {
            const startSample = Math.max(
              0,
              currentSilenceStart - Math.floor(options.padding * sampleRate)
            );
            const endSample = Math.min(
              channelData.length,
              i + Math.floor(options.padding * sampleRate)
            );
            silenceRegions.push({
              start: startSample,
              end: endSample,
            });
          }
          currentSilenceStart = null;
        }
      }
    }

    // Handle silence at the end
    if (currentSilenceStart !== null) {
      const silenceDuration =
        (channelData.length - currentSilenceStart) / sampleRate;
      if (silenceDuration >= options.minSilenceDuration) {
        const startSample = Math.max(
          0,
          currentSilenceStart - Math.floor(options.padding * sampleRate)
        );
        silenceRegions.push({
          start: startSample,
          end: channelData.length,
        });
      }
    }

    // If no silence regions found, return original
    if (silenceRegions.length === 0) {
      audioContext.close();
      return audioBlob;
    }

    // Calculate which samples to keep
    const keepSamples = new Set<number>();
    for (let i = 0; i < channelData.length; i++) {
      let shouldKeep = true;
      for (const region of silenceRegions) {
        if (i >= region.start && i < region.end) {
          shouldKeep = false;
          break;
        }
      }
      if (shouldKeep) {
        keepSamples.add(i);
      }
    }

    // Create new buffer with only non-silent samples
    const keptSamples = Array.from(keepSamples).sort((a, b) => a - b);
    if (keptSamples.length === 0) {
      audioContext.close();
      return audioBlob; // All silence, return original
    }

    const newLength = keptSamples.length;
    const trimmedBuffer = audioContext.createBuffer(
      numberOfChannels,
      newLength,
      sampleRate
    );

    // Copy kept samples
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const originalChannel = audioBuffer.getChannelData(channel);
      const trimmedChannel = trimmedBuffer.getChannelData(channel);

      for (let i = 0; i < keptSamples.length; i++) {
        trimmedChannel[i] = originalChannel[keptSamples[i]];
      }
    }

    // Render to blob
    const offlineContext = new OfflineAudioContext(
      numberOfChannels,
      newLength,
      sampleRate
    );

    const source = offlineContext.createBufferSource();
    source.buffer = trimmedBuffer;
    source.connect(offlineContext.destination);
    source.start(0);

    const renderedBuffer = await offlineContext.startRendering();
    const wavBlob = audioBufferToWav(renderedBuffer);

    audioContext.close();
    return wavBlob;
  } catch (error) {
    console.warn("Auto-remove silence failed:", error);
    return audioBlob;
  }
}

/**
 * Automatically level/normalize volume across entire clip
 */
export async function autoLevelVolume(
  audioBlob: Blob,
  options: AutoLevelOptions = {
    targetPeak: 0.95,
    normalizeRMS: false,
  }
): Promise<Blob> {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length;

    // Find peak level
    let peak = 0;
    let rmsSum = 0;

    for (let channel = 0; channel < numberOfChannels; channel++) {
      const channelData = audioBuffer.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        const absValue = Math.abs(channelData[i]);
        if (absValue > peak) {
          peak = absValue;
        }
        rmsSum += channelData[i] * channelData[i];
      }
    }

    const rms = Math.sqrt(rmsSum / (length * numberOfChannels));

    // Calculate gain factors
    let peakGain = 1.0;
    if (peak > 0 && peak < options.targetPeak) {
      peakGain = options.targetPeak / peak;
    } else if (peak > options.targetPeak) {
      peakGain = options.targetPeak / peak; // Reduce if too loud
    }

    let rmsGain = 1.0;
    if (options.normalizeRMS && options.targetRMS) {
      if (rms > 0 && rms < options.targetRMS) {
        rmsGain = options.targetRMS / rms;
      } else if (rms > options.targetRMS) {
        rmsGain = options.targetRMS / rms;
      }
    }

    // Use the more conservative gain to avoid clipping
    const gain = Math.min(peakGain, rmsGain || peakGain);

    // Apply gain
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const channelData = audioBuffer.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        channelData[i] = channelData[i] * gain;
        // Clamp to prevent clipping
        channelData[i] = Math.max(-1, Math.min(1, channelData[i]));
      }
    }

    // Render to blob
    const offlineContext = new OfflineAudioContext(
      numberOfChannels,
      length,
      sampleRate
    );

    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineContext.destination);
    source.start(0);

    const renderedBuffer = await offlineContext.startRendering();
    const wavBlob = audioBufferToWav(renderedBuffer);

    audioContext.close();
    return wavBlob;
  } catch (error) {
    console.warn("Auto-level volume failed:", error);
    return audioBlob;
  }
}

/**
 * Automatically create smooth transitions between audio segments
 */
export async function autoTransition(
  audioBlob: Blob,
  options: AutoTransitionOptions = {
    duration: 0.5,
    curve: "exponential",
  }
): Promise<Blob> {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length;
    const transitionSamples = Math.floor(options.duration * sampleRate);

    // Get transition curve function
    const getCurveValue = (progress: number): number => {
      switch (options.curve) {
        case "exponential":
          return Math.pow(progress, 2);
        case "sigmoid":
          return 1 / (1 + Math.exp(-10 * (progress - 0.5)));
        case "linear":
        default:
          return progress;
      }
    };

    // Apply fade in at start and fade out at end
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const channelData = audioBuffer.getChannelData(channel);

      // Fade in
      for (let i = 0; i < Math.min(transitionSamples, length); i++) {
        const progress = i / transitionSamples;
        const fadeValue = getCurveValue(progress);
        channelData[i] *= fadeValue;
      }

      // Fade out
      for (let i = 0; i < Math.min(transitionSamples, length); i++) {
        const index = length - 1 - i;
        const progress = i / transitionSamples;
        const fadeValue = getCurveValue(progress);
        channelData[index] *= fadeValue;
      }
    }

    // Render to blob
    const offlineContext = new OfflineAudioContext(
      numberOfChannels,
      length,
      sampleRate
    );

    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineContext.destination);
    source.start(0);

    const renderedBuffer = await offlineContext.startRendering();
    const wavBlob = audioBufferToWav(renderedBuffer);

    audioContext.close();
    return wavBlob;
  } catch (error) {
    console.warn("Auto-transition failed:", error);
    return audioBlob;
  }
}

/**
 * Convert AudioBuffer to WAV Blob
 */
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const length = buffer.length;
  const numberOfChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bytesPerSample = 2;
  const blockAlign = numberOfChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = length * blockAlign;
  const bufferSize = 44 + dataSize;

  const arrayBuffer = new ArrayBuffer(bufferSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, bufferSize - 8, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, int16, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

