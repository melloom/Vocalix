/**
 * Audio trimming utilities
 * Provides functions to trim audio from start and end
 */

/**
 * Trim audio blob by removing samples from start and/or end
 * @param audioBlob - The audio blob to trim
 * @param trimStartSeconds - Seconds to trim from start (default 0)
 * @param trimEndSeconds - Seconds to trim from end (default 0)
 * @returns Promise resolving to trimmed audio blob
 */
export async function trimAudio(
  audioBlob: Blob,
  trimStartSeconds: number = 0,
  trimEndSeconds: number = 0
): Promise<Blob> {
  if (trimStartSeconds === 0 && trimEndSeconds === 0) {
    return audioBlob;
  }

  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const sampleRate = audioBuffer.sampleRate;
    const numberOfChannels = audioBuffer.numberOfChannels;
    const totalSamples = audioBuffer.length;

    // Calculate trim points in samples
    const trimStartSamples = Math.floor(trimStartSeconds * sampleRate);
    const trimEndSamples = Math.floor(trimEndSeconds * sampleRate);
    const newLength = totalSamples - trimStartSamples - trimEndSamples;

    // Validate trim points
    if (trimStartSamples < 0 || trimEndSamples < 0 || newLength <= 0) {
      audioContext.close();
      return audioBlob; // Return original if invalid trim
    }

    if (trimStartSamples + trimEndSamples >= totalSamples) {
      audioContext.close();
      return audioBlob; // Can't trim more than total length
    }

    // Create new audio buffer with trimmed length
    const trimmedBuffer = audioContext.createBuffer(
      numberOfChannels,
      newLength,
      sampleRate
    );

    // Copy trimmed portion from original buffer
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const originalData = audioBuffer.getChannelData(channel);
      const trimmedData = trimmedBuffer.getChannelData(channel);
      
      for (let i = 0; i < newLength; i++) {
        trimmedData[i] = originalData[trimStartSamples + i];
      }
    }

    // Use OfflineAudioContext to render the trimmed audio
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

    // Convert to WAV format
    const wavBlob = audioBufferToWav(renderedBuffer);
    
    audioContext.close();
    return wavBlob;
  } catch (error) {
    console.warn("Audio trimming failed, returning original:", error);
    return audioBlob;
  }
}

/**
 * Get audio duration in seconds
 * @param audioBlob - The audio blob to analyze
 * @returns Promise resolving to duration in seconds
 */
export async function getAudioDuration(audioBlob: Blob): Promise<number> {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const duration = audioBuffer.duration;
    audioContext.close();
    return duration;
  } catch (error) {
    console.warn("Failed to get audio duration:", error);
    return 0;
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

