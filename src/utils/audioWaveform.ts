/**
 * Audio waveform generation utilities
 * Generates waveform data from audio files for visualization
 */

const WAVEFORM_BINS = 24; // Number of bars in waveform

/**
 * Generate waveform data from an audio URL
 * @param audioUrl - URL of the audio file
 * @param bins - Number of waveform bins (default 24)
 * @returns Promise resolving to array of normalized values (0-1)
 */
export async function generateWaveformFromUrl(
  audioUrl: string,
  bins: number = WAVEFORM_BINS
): Promise<number[]> {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const response = await fetch(audioUrl);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Use first channel for waveform
    const channelData = audioBuffer.getChannelData(0);
    const samplesPerBin = Math.floor(channelData.length / bins);
    
    const waveform = Array.from({ length: bins }, (_, i) => {
      const start = i * samplesPerBin;
      const end = start + samplesPerBin;
      let sum = 0;
      let count = 0;
      
      for (let j = start; j < end && j < channelData.length; j++) {
        sum += Math.abs(channelData[j]);
        count++;
      }
      
      const avg = count > 0 ? sum / count : 0;
      // Normalize to 0-1 range with minimum height
      return Math.min(1, Math.max(0.1, avg * 2));
    });

    audioContext.close();
    return waveform;
  } catch (error) {
    console.warn("Failed to generate waveform from URL:", error);
    // Return default waveform
    return Array.from({ length: bins }, () => Math.random() * 0.5 + 0.3);
  }
}

/**
 * Generate waveform data from an audio blob
 * @param audioBlob - Audio blob
 * @param bins - Number of waveform bins (default 24)
 * @returns Promise resolving to array of normalized values (0-1)
 */
export async function generateWaveformFromBlob(
  audioBlob: Blob,
  bins: number = WAVEFORM_BINS
): Promise<number[]> {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Use first channel for waveform
    const channelData = audioBuffer.getChannelData(0);
    const samplesPerBin = Math.floor(channelData.length / bins);
    
    const waveform = Array.from({ length: bins }, (_, i) => {
      const start = i * samplesPerBin;
      const end = start + samplesPerBin;
      let sum = 0;
      let count = 0;
      
      for (let j = start; j < end && j < channelData.length; j++) {
        sum += Math.abs(channelData[j]);
        count++;
      }
      
      const avg = count > 0 ? sum / count : 0;
      // Normalize to 0-1 range with minimum height
      return Math.min(1, Math.max(0.1, avg * 2));
    });

    audioContext.close();
    return waveform;
  } catch (error) {
    console.warn("Failed to generate waveform from blob:", error);
    // Return default waveform
    return Array.from({ length: bins }, () => Math.random() * 0.5 + 0.3);
  }
}

