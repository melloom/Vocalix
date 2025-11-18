/**
 * Audio snippet utilities
 * Extract and share short highlights from audio clips
 */

/**
 * Extract a 10-second snippet from an audio blob
 * @param audioBlob - The audio blob to extract from
 * @param startTime - Start time in seconds (default: beginning)
 * @param duration - Duration in seconds (default: 10)
 * @returns Promise resolving to snippet audio blob
 */
export async function extractAudioSnippet(
  audioBlob: Blob,
  startTime: number = 0,
  duration: number = 10
): Promise<Blob> {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const sampleRate = audioBuffer.sampleRate;
    const numberOfChannels = audioBuffer.numberOfChannels;
    const totalSamples = audioBuffer.length;
    const totalDuration = audioBuffer.duration;

    // Validate start time
    const startSeconds = Math.max(0, Math.min(startTime, totalDuration - 1));
    const snippetDuration = Math.min(duration, totalDuration - startSeconds);

    // Calculate sample positions
    const startSamples = Math.floor(startSeconds * sampleRate);
    const snippetSamples = Math.floor(snippetDuration * sampleRate);
    const endSamples = Math.min(startSamples + snippetSamples, totalSamples);

    // Create new audio buffer for snippet
    const snippetBuffer = audioContext.createBuffer(
      numberOfChannels,
      snippetSamples,
      sampleRate
    );

    // Copy snippet portion from original buffer
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const originalData = audioBuffer.getChannelData(channel);
      const snippetData = snippetBuffer.getChannelData(channel);
      
      for (let i = 0; i < snippetSamples && (startSamples + i) < totalSamples; i++) {
        snippetData[i] = originalData[startSamples + i];
      }
    }

    // Use OfflineAudioContext to render the snippet
    const offlineContext = new OfflineAudioContext(
      numberOfChannels,
      snippetSamples,
      sampleRate
    );

    const source = offlineContext.createBufferSource();
    source.buffer = snippetBuffer;
    source.connect(offlineContext.destination);
    source.start(0);

    const renderedBuffer = await offlineContext.startRendering();

    // Convert to WAV format
    const wavBlob = audioBufferToWav(renderedBuffer);
    
    audioContext.close();
    return wavBlob;
  } catch (error) {
    console.warn("Audio snippet extraction failed:", error);
    throw error;
  }
}

/**
 * Find the best 10-second snippet (highest energy/activity)
 * @param audioBlob - The audio blob to analyze
 * @param duration - Duration of snippet in seconds (default: 10)
 * @returns Promise resolving to { startTime, snippetBlob }
 */
export async function findBestSnippet(
  audioBlob: Blob,
  duration: number = 10
): Promise<{ startTime: number; snippetBlob: Blob }> {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const sampleRate = audioBuffer.sampleRate;
    const totalDuration = audioBuffer.duration;
    const snippetDuration = Math.min(duration, totalDuration);

    // Analyze audio in 1-second windows
    const windowSize = sampleRate; // 1 second
    const windows: Array<{ start: number; energy: number }> = [];

    for (let start = 0; start <= totalDuration - snippetDuration; start += 1) {
      const startSample = Math.floor(start * sampleRate);
      const endSample = Math.min(startSample + Math.floor(snippetDuration * sampleRate), audioBuffer.length);
      
      let energy = 0;
      let count = 0;
      
      for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
        const channelData = audioBuffer.getChannelData(channel);
        for (let i = startSample; i < endSample; i++) {
          energy += Math.abs(channelData[i]);
          count++;
        }
      }
      
      const avgEnergy = count > 0 ? energy / count : 0;
      windows.push({ start, energy: avgEnergy });
    }

    // Find window with highest energy
    const bestWindow = windows.reduce((best, current) => 
      current.energy > best.energy ? current : best
    );

    // Extract snippet at best position
    const snippetBlob = await extractAudioSnippet(audioBlob, bestWindow.start, snippetDuration);
    
    audioContext.close();
    return { startTime: bestWindow.start, snippetBlob };
  } catch (error) {
    console.warn("Failed to find best snippet, using beginning:", error);
    // Fallback to beginning
    const snippetBlob = await extractAudioSnippet(audioBlob, 0, duration);
    return { startTime: 0, snippetBlob };
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

