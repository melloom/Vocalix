/**
 * Audio normalization utilities
 * Provides functions to normalize audio volume and adjust gain
 */

/**
 * Normalize audio blob to a target peak level
 * @param audioBlob - The audio blob to normalize
 * @param targetPeak - Target peak level (0-1, default 0.95)
 * @returns Promise resolving to normalized audio blob
 */
export async function normalizeAudioVolume(
  audioBlob: Blob,
  targetPeak: number = 0.95
): Promise<Blob> {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Find the peak level across all channels
    let peak = 0;
    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
      const channelData = audioBuffer.getChannelData(channel);
      for (let i = 0; i < channelData.length; i++) {
        const absValue = Math.abs(channelData[i]);
        if (absValue > peak) {
          peak = absValue;
        }
      }
    }

    // If already at or above target, return original
    if (peak >= targetPeak || peak === 0) {
      audioContext.close();
      return audioBlob;
    }

    // Calculate gain factor (with safety margin to avoid clipping)
    const gainFactor = targetPeak / peak;

    // Apply gain to all channels
    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
      const channelData = audioBuffer.getChannelData(channel);
      for (let i = 0; i < channelData.length; i++) {
        channelData[i] = channelData[i] * gainFactor;
        // Clamp to prevent clipping
        channelData[i] = Math.max(-1, Math.min(1, channelData[i]));
      }
    }

    // Convert back to blob
    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length;

    // Use OfflineAudioContext to render the processed audio
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

    // Convert to WAV format
    const wavBlob = audioBufferToWav(renderedBuffer);
    
    audioContext.close();
    return wavBlob;
  } catch (error) {
    console.warn("Audio normalization failed, returning original:", error);
    return audioBlob;
  }
}

/**
 * Apply manual volume adjustment to audio blob
 * @param audioBlob - The audio blob to adjust
 * @param volumeMultiplier - Volume multiplier (0-2, where 1 is original)
 * @returns Promise resolving to adjusted audio blob
 */
export async function adjustAudioVolume(
  audioBlob: Blob,
  volumeMultiplier: number
): Promise<Blob> {
  if (volumeMultiplier === 1) {
    return audioBlob;
  }

  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Apply volume multiplier to all channels
    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
      const channelData = audioBuffer.getChannelData(channel);
      for (let i = 0; i < channelData.length; i++) {
        channelData[i] = channelData[i] * volumeMultiplier;
        // Clamp to prevent clipping
        channelData[i] = Math.max(-1, Math.min(1, channelData[i]));
      }
    }

    // Use OfflineAudioContext to render the processed audio
    const offlineContext = new OfflineAudioContext(
      audioBuffer.numberOfChannels,
      audioBuffer.length,
      audioBuffer.sampleRate
    );

    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineContext.destination);
    source.start(0);

    const renderedBuffer = await offlineContext.startRendering();

    // Convert to WAV format
    const wavBlob = audioBufferToWav(renderedBuffer);
    
    audioContext.close();
    return wavBlob;
  } catch (error) {
    console.warn("Audio volume adjustment failed, returning original:", error);
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

/**
 * Get audio peak level for visualization
 * @param audioBlob - The audio blob to analyze
 * @returns Promise resolving to peak level (0-1)
 */
export async function getAudioPeakLevel(audioBlob: Blob): Promise<number> {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    let peak = 0;
    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
      const channelData = audioBuffer.getChannelData(channel);
      for (let i = 0; i < channelData.length; i++) {
        const absValue = Math.abs(channelData[i]);
        if (absValue > peak) {
          peak = absValue;
        }
      }
    }

    audioContext.close();
    return peak;
  } catch (error) {
    console.warn("Failed to get audio peak level:", error);
    return 0.5; // Default to medium level
  }
}

