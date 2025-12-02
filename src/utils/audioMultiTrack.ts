/**
 * Multi-track audio editing utilities
 * Provides functions for layering, mixing, volume control, and crossfading
 */

export interface AudioTrack {
  blob: Blob;
  volume: number; // 0 to 1
  startTime: number; // Start offset in seconds
  fadeIn?: number; // Fade in duration in seconds
  fadeOut?: number; // Fade out duration in seconds
}

export interface CrossfadeOptions {
  duration: number; // Crossfade duration in seconds
  curve?: "linear" | "exponential" | "logarithmic"; // Fade curve type
}

/**
 * Mix multiple audio tracks together
 */
export async function mixAudioTracks(
  tracks: AudioTrack[]
): Promise<Blob> {
  if (tracks.length === 0) {
    throw new Error("No tracks provided");
  }

  if (tracks.length === 1) {
    return tracks[0].blob;
  }

  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Decode all tracks
    const decodedTracks = await Promise.all(
      tracks.map(async (track) => {
        const arrayBuffer = await track.blob.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        return {
          buffer: audioBuffer,
          volume: track.volume,
          startTime: track.startTime,
          fadeIn: track.fadeIn || 0,
          fadeOut: track.fadeOut || 0,
        };
      })
    );

    // Find the maximum duration and sample rate
    const maxDuration = Math.max(
      ...decodedTracks.map(
        (track) => track.startTime + track.buffer.duration
      )
    );
    const sampleRate = decodedTracks[0].buffer.sampleRate;
    const numberOfChannels = Math.max(
      ...decodedTracks.map((track) => track.buffer.numberOfChannels)
    );
    const totalSamples = Math.ceil(maxDuration * sampleRate);

    // Create output buffer
    const outputBuffer = audioContext.createBuffer(
      numberOfChannels,
      totalSamples,
      sampleRate
    );

    // Mix all tracks
    for (const track of decodedTracks) {
      const startSample = Math.floor(track.startTime * sampleRate);
      const trackLength = track.buffer.length;
      const trackChannels = track.buffer.numberOfChannels;

      for (let channel = 0; channel < numberOfChannels; channel++) {
        const outputChannel = outputBuffer.getChannelData(channel);
        const trackChannel = track.buffer.getChannelData(
          Math.min(channel, trackChannels - 1)
        );

        for (let i = 0; i < trackLength; i++) {
          const outputIndex = startSample + i;
          if (outputIndex >= 0 && outputIndex < totalSamples) {
            // Calculate volume with fade in/out
            let volume = track.volume;

            // Apply fade in
            if (track.fadeIn > 0 && i < track.fadeIn * sampleRate) {
              const fadeProgress = i / (track.fadeIn * sampleRate);
              volume *= fadeProgress;
            }

            // Apply fade out
            if (track.fadeOut > 0 && i > trackLength - track.fadeOut * sampleRate) {
              const fadeProgress =
                (trackLength - i) / (track.fadeOut * sampleRate);
              volume *= fadeProgress;
            }

            // Mix samples (sum with clamping)
            const sample = trackChannel[i] * volume;
            outputChannel[outputIndex] = Math.max(
              -1,
              Math.min(1, outputChannel[outputIndex] + sample)
            );
          }
        }
      }
    }

    // Normalize to prevent clipping
    let maxPeak = 0;
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const channelData = outputBuffer.getChannelData(channel);
      for (let i = 0; i < totalSamples; i++) {
        const absValue = Math.abs(channelData[i]);
        if (absValue > maxPeak) {
          maxPeak = absValue;
        }
      }
    }

    // Apply normalization if needed
    if (maxPeak > 0.95) {
      const normalizationFactor = 0.95 / maxPeak;
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const channelData = outputBuffer.getChannelData(channel);
        for (let i = 0; i < totalSamples; i++) {
          channelData[i] *= normalizationFactor;
        }
      }
    }

    // Render to blob
    const offlineContext = new OfflineAudioContext(
      numberOfChannels,
      totalSamples,
      sampleRate
    );

    const source = offlineContext.createBufferSource();
    source.buffer = outputBuffer;
    source.connect(offlineContext.destination);
    source.start(0);

    const renderedBuffer = await offlineContext.startRendering();
    const wavBlob = audioBufferToWav(renderedBuffer);

    audioContext.close();
    return wavBlob;
  } catch (error) {
    console.error("Multi-track mixing failed:", error);
    throw error;
  }
}

/**
 * Apply crossfade between two audio clips
 */
export async function crossfadeAudio(
  audio1: Blob,
  audio2: Blob,
  options: CrossfadeOptions
): Promise<Blob> {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    const [arrayBuffer1, arrayBuffer2] = await Promise.all([
      audio1.arrayBuffer(),
      audio2.arrayBuffer(),
    ]);

    const [buffer1, buffer2] = await Promise.all([
      audioContext.decodeAudioData(arrayBuffer1),
      audioContext.decodeAudioData(arrayBuffer2),
    ]);

    const sampleRate = buffer1.sampleRate;
    const numberOfChannels = Math.max(
      buffer1.numberOfChannels,
      buffer2.numberOfChannels
    );

    const fadeSamples = Math.floor(options.duration * sampleRate);
    const totalLength = buffer1.length + buffer2.length - fadeSamples;
    const outputBuffer = audioContext.createBuffer(
      numberOfChannels,
      totalLength,
      sampleRate
    );

    // Determine fade curve function
    const getFadeValue = (progress: number): number => {
      switch (options.curve) {
        case "exponential":
          return Math.pow(progress, 2);
        case "logarithmic":
          return 1 - Math.pow(1 - progress, 2);
        case "linear":
        default:
          return progress;
      }
    };

    // Mix the two buffers with crossfade
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const outputChannel = outputBuffer.getChannelData(channel);
      const channel1 = buffer1.getChannelData(
        Math.min(channel, buffer1.numberOfChannels - 1)
      );
      const channel2 = buffer2.getChannelData(
        Math.min(channel, buffer2.numberOfChannels - 1)
      );

      // Copy first buffer (with fade out at the end)
      for (let i = 0; i < buffer1.length; i++) {
        let volume = 1.0;
        if (i >= buffer1.length - fadeSamples) {
          const fadeProgress =
            (i - (buffer1.length - fadeSamples)) / fadeSamples;
          volume = 1.0 - getFadeValue(fadeProgress);
        }
        outputChannel[i] = channel1[i] * volume;
      }

      // Mix second buffer (with fade in at the start)
      const startIndex = buffer1.length - fadeSamples;
      for (let i = 0; i < buffer2.length; i++) {
        const outputIndex = startIndex + i;
        if (outputIndex < totalLength) {
          let volume = 1.0;
          if (i < fadeSamples) {
            const fadeProgress = i / fadeSamples;
            volume = getFadeValue(fadeProgress);
          }
          outputChannel[outputIndex] = Math.max(
            -1,
            Math.min(1, outputChannel[outputIndex] + channel2[i] * volume)
          );
        }
      }
    }

    // Render to blob
    const offlineContext = new OfflineAudioContext(
      numberOfChannels,
      totalLength,
      sampleRate
    );

    const source = offlineContext.createBufferSource();
    source.buffer = outputBuffer;
    source.connect(offlineContext.destination);
    source.start(0);

    const renderedBuffer = await offlineContext.startRendering();
    const wavBlob = audioBufferToWav(renderedBuffer);

    audioContext.close();
    return wavBlob;
  } catch (error) {
    console.error("Crossfade failed:", error);
    throw error;
  }
}

/**
 * Adjust volume of a specific track in a multi-track mix
 */
export async function adjustTrackVolume(
  audioBlob: Blob,
  volume: number // 0 to 1
): Promise<Blob> {
  if (volume === 1.0) {
    return audioBlob;
  }

  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length;

    // Apply volume to all channels
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const channelData = audioBuffer.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        channelData[i] = channelData[i] * volume;
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
    console.warn("Volume adjustment failed:", error);
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

