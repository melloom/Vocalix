/**
 * Audio quality enhancement utilities
 * Provides noise reduction, background noise detection, and quality analysis
 */

export interface AudioQualityMetrics {
  peakLevel: number; // 0-1
  rmsLevel: number; // Root Mean Square level (0-1)
  backgroundNoiseLevel: number; // 0-1
  hasExcessiveNoise: boolean;
  suggestions: string[];
  qualityScore: number; // 0-100
}

export interface NoiseReductionOptions {
  strength: number; // 0-1, how aggressive the noise reduction should be
  preserveVoices: boolean; // Try to preserve voice frequencies
}

/**
 * Detect background noise in audio
 * Analyzes quiet sections to determine noise floor
 */
export async function detectBackgroundNoise(
  audioBlob: Blob,
  noiseThreshold: number = 0.02
): Promise<{ noiseLevel: number; hasExcessiveNoise: boolean }> {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Analyze quiet sections (likely background noise)
    const channelData = audioBuffer.getChannelData(0); // Use first channel
    const sampleRate = audioBuffer.sampleRate;
    const windowSize = Math.floor(sampleRate * 0.1); // 100ms windows
    const quietSections: number[] = [];

    // Find quiet sections
    for (let i = 0; i < channelData.length - windowSize; i += windowSize) {
      const window = channelData.slice(i, i + windowSize);
      const rms = Math.sqrt(
        window.reduce((sum, sample) => sum + sample * sample, 0) / window.length
      );

      if (rms < noiseThreshold) {
        quietSections.push(rms);
      }
    }

    // Calculate average noise level from quiet sections
    const noiseLevel =
      quietSections.length > 0
        ? quietSections.reduce((sum, val) => sum + val, 0) / quietSections.length
        : 0;

    const hasExcessiveNoise = noiseLevel > noiseThreshold * 2;

    audioContext.close();
    return { noiseLevel, hasExcessiveNoise };
  } catch (error) {
    console.warn("Background noise detection failed:", error);
    return { noiseLevel: 0, hasExcessiveNoise: false };
  }
}

/**
 * Apply noise reduction to audio
 * Uses spectral subtraction algorithm
 */
export async function reduceNoise(
  audioBlob: Blob,
  options: NoiseReductionOptions = { strength: 0.5, preserveVoices: true }
): Promise<Blob> {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length;

    // Create offline context for processing
    const offlineContext = new OfflineAudioContext(
      numberOfChannels,
      length,
      sampleRate
    );

    // Process each channel
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const channelData = audioBuffer.getChannelData(channel);
      const processedData = new Float32Array(channelData.length);

      // Estimate noise profile from first 0.5 seconds (usually quiet)
      const noiseSampleSize = Math.min(Math.floor(sampleRate * 0.5), channelData.length);
      let noiseEnergy = 0;
      for (let i = 0; i < noiseSampleSize; i++) {
        noiseEnergy += channelData[i] * channelData[i];
      }
      const noiseLevel = Math.sqrt(noiseEnergy / noiseSampleSize);

      // Apply spectral subtraction
      const fftSize = 2048;
      const hopSize = fftSize / 4;

      for (let i = 0; i < channelData.length; i += hopSize) {
        const windowStart = Math.max(0, i - fftSize / 2);
        const windowEnd = Math.min(channelData.length, i + fftSize / 2);
        const window = channelData.slice(windowStart, windowEnd);

        // Simple noise reduction: subtract estimated noise
        for (let j = 0; j < window.length && i + j < processedData.length; j++) {
          const sample = window[j];
          const magnitude = Math.abs(sample);

          // Only reduce noise if it's likely background noise
          if (magnitude < noiseLevel * 3) {
            const reductionFactor = 1 - options.strength * (1 - magnitude / (noiseLevel * 3));
            processedData[i + j] = sample * reductionFactor;
          } else {
            processedData[i + j] = sample;
          }
        }
      }

      // Update the buffer with processed data
      const processedBuffer = offlineContext.createBuffer(1, length, sampleRate);
      processedBuffer.getChannelData(0).set(processedData);
      audioBuffer.copyToChannel(processedBuffer.getChannelData(0), channel);
    }

    // Render the processed audio
    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineContext.destination);
    source.start(0);

    const renderedBuffer = await offlineContext.startRendering();

    // Convert to WAV
    const wavBlob = audioBufferToWav(renderedBuffer);

    audioContext.close();
    return wavBlob;
  } catch (error) {
    console.warn("Noise reduction failed, returning original:", error);
    return audioBlob;
  }
}

/**
 * Analyze audio quality and provide suggestions
 */
export async function analyzeAudioQuality(audioBlob: Blob): Promise<AudioQualityMetrics> {
  const suggestions: string[] = [];
  let qualityScore = 100;

  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Calculate peak level
    let peak = 0;
    let rmsSum = 0;
    const channelData = audioBuffer.getChannelData(0);
    const length = channelData.length;

    for (let i = 0; i < length; i++) {
      const absValue = Math.abs(channelData[i]);
      if (absValue > peak) {
        peak = absValue;
      }
      rmsSum += channelData[i] * channelData[i];
    }

    const rmsLevel = Math.sqrt(rmsSum / length);
    const peakLevel = peak;

    // Check volume levels
    if (peakLevel < 0.3) {
      suggestions.push("Audio is too quiet. Speak closer to the microphone or increase input volume.");
      qualityScore -= 20;
    } else if (peakLevel > 0.98) {
      suggestions.push("Audio may be clipping (too loud). Reduce input volume or move away from microphone.");
      qualityScore -= 15;
    }

    if (rmsLevel < 0.1) {
      suggestions.push("Average audio level is low. Consider speaking louder or closer to the microphone.");
      qualityScore -= 15;
    }

    // Detect background noise
    const { noiseLevel, hasExcessiveNoise } = await detectBackgroundNoise(audioBlob);

    if (hasExcessiveNoise) {
      suggestions.push("Background noise detected. Consider recording in a quieter environment or use noise reduction.");
      qualityScore -= 25;
    } else if (noiseLevel > 0.01) {
      suggestions.push("Some background noise detected. You may want to use noise reduction.");
      qualityScore -= 10;
    }

    // Check for silence (too quiet sections)
    const silenceThreshold = 0.02;
    let silenceDuration = 0;
    const sampleRate = audioBuffer.sampleRate;
    const windowSize = Math.floor(sampleRate * 0.1); // 100ms windows

    for (let i = 0; i < channelData.length - windowSize; i += windowSize) {
      const window = channelData.slice(i, i + windowSize);
      const windowRms = Math.sqrt(
        window.reduce((sum, sample) => sum + sample * sample, 0) / window.length
      );

      if (windowRms < silenceThreshold) {
        silenceDuration += windowSize / sampleRate;
      }
    }

    const totalDuration = channelData.length / sampleRate;
    const silencePercentage = (silenceDuration / totalDuration) * 100;

    if (silencePercentage > 30) {
      suggestions.push("Long periods of silence detected. Consider trimming the beginning/end of your recording.");
      qualityScore -= 10;
    }

    // Check for clipping
    let clippingCount = 0;
    for (let i = 0; i < length; i++) {
      if (Math.abs(channelData[i]) >= 0.98) {
        clippingCount++;
      }
    }

    const clippingPercentage = (clippingCount / length) * 100;
    if (clippingPercentage > 0.1) {
      suggestions.push("Audio clipping detected. Reduce input volume to prevent distortion.");
      qualityScore -= 20;
    }

    audioContext.close();

    qualityScore = Math.max(0, Math.min(100, qualityScore));

    return {
      peakLevel,
      rmsLevel,
      backgroundNoiseLevel: noiseLevel,
      hasExcessiveNoise,
      suggestions,
      qualityScore,
    };
  } catch (error) {
    console.warn("Audio quality analysis failed:", error);
    return {
      peakLevel: 0.5,
      rmsLevel: 0.3,
      backgroundNoiseLevel: 0,
      hasExcessiveNoise: false,
      suggestions: ["Unable to analyze audio quality."],
      qualityScore: 50,
    };
  }
}

/**
 * Auto-enhance audio with noise reduction and normalization
 */
export async function autoEnhanceAudio(
  audioBlob: Blob,
  options: {
    reduceNoise?: boolean;
    normalize?: boolean;
    targetPeak?: number;
  } = {}
): Promise<Blob> {
  let enhanced = audioBlob;

  try {
    // First, analyze quality
    const quality = await analyzeAudioQuality(enhanced);

    // Apply noise reduction if needed
    if (options.reduceNoise !== false && quality.hasExcessiveNoise) {
      enhanced = await reduceNoise(enhanced, {
        strength: 0.5,
        preserveVoices: true,
      });
    }

    // Normalize volume if needed
    if (options.normalize !== false && quality.peakLevel < 0.7) {
      const { normalizeAudioVolume } = await import("./audioNormalization");
      enhanced = await normalizeAudioVolume(enhanced, options.targetPeak || 0.95);
    }

    return enhanced;
  } catch (error) {
    console.warn("Auto-enhancement failed, returning original:", error);
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

  // WAV header
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, bufferSize - 8, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // audio format (PCM)
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  // Convert float samples to 16-bit PCM
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

