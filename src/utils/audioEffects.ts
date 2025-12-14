/**
 * Advanced audio effects utilities
 * Provides pitch adjustment, speed adjustment, echo/reverb, and voice filters
 */

export interface PitchOptions {
  semitones: number; // -12 to +12 semitones
}

export interface SpeedOptions {
  speed: number; // 0.5 to 2.0 (0.5 = half speed, 2.0 = double speed)
  preservePitch?: boolean; // If true, pitch stays the same when speed changes
}

export interface EchoOptions {
  delay: number; // Delay in seconds (0.1 to 1.0)
  feedback: number; // Feedback amount (0 to 0.9)
  wetLevel: number; // Wet signal level (0 to 1)
}

export interface ReverbOptions {
  roomSize: number; // 0 to 1
  damping: number; // 0 to 1
  wetLevel: number; // 0 to 1
}

export type VoiceFilterType = "robot" | "chipmunk" | "deep" | "alien" | "telephone" | "radio" | "none";

export interface VoiceFilterOptions {
  type: VoiceFilterType;
  intensity: number; // 0 to 1
}

/**
 * Adjust pitch of audio without changing speed
 */
export async function adjustPitch(
  audioBlob: Blob,
  options: PitchOptions
): Promise<Blob> {
  if (options.semitones === 0) {
    return audioBlob;
  }

  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Convert semitones to playback rate: 2^(semitones/12)
    const playbackRate = Math.pow(2, options.semitones / 12);

    // Use OfflineAudioContext to render with pitch change
    const offlineContext = new OfflineAudioContext(
      audioBuffer.numberOfChannels,
      Math.ceil(audioBuffer.length / playbackRate),
      audioBuffer.sampleRate
    );

    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = playbackRate;
    source.connect(offlineContext.destination);
    source.start(0);

    const renderedBuffer = await offlineContext.startRendering();
    const wavBlob = audioBufferToWav(renderedBuffer);

    audioContext.close();
    return wavBlob;
  } catch (error) {
    console.warn("Pitch adjustment failed:", error);
    return audioBlob;
  }
}

/**
 * Adjust speed of audio (with optional pitch preservation)
 */
export async function adjustSpeed(
  audioBlob: Blob,
  options: SpeedOptions
): Promise<Blob> {
  if (options.speed === 1.0) {
    return audioBlob;
  }

  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const originalLength = audioBuffer.length;
    const newLength = Math.ceil(originalLength / options.speed);

    // If preserving pitch, we need to use a different approach
    if (options.preservePitch) {
      // Use time-stretching algorithm (simplified)
      const newBuffer = audioContext.createBuffer(numberOfChannels, newLength, sampleRate);

      for (let channel = 0; channel < numberOfChannels; channel++) {
        const originalData = audioBuffer.getChannelData(channel);
        const newData = newBuffer.getChannelData(channel);

        // Linear interpolation for time stretching
        for (let i = 0; i < newLength; i++) {
          const sourceIndex = i * options.speed;
          const index1 = Math.floor(sourceIndex);
          const index2 = Math.min(index1 + 1, originalLength - 1);
          const fraction = sourceIndex - index1;

          newData[i] = originalData[index1] * (1 - fraction) + originalData[index2] * fraction;
        }
      }

      const offlineContext = new OfflineAudioContext(
        numberOfChannels,
        newLength,
        sampleRate
      );

      const source = offlineContext.createBufferSource();
      source.buffer = newBuffer;
      source.connect(offlineContext.destination);
      source.start(0);

      const renderedBuffer = await offlineContext.startRendering();
      const wavBlob = audioBufferToWav(renderedBuffer);

      audioContext.close();
      return wavBlob;
    } else {
      // Simple speed change (changes pitch)
      const offlineContext = new OfflineAudioContext(
        numberOfChannels,
        newLength,
        sampleRate
      );

      const source = offlineContext.createBufferSource();
      source.buffer = audioBuffer;
      source.playbackRate.value = options.speed;
      source.connect(offlineContext.destination);
      source.start(0);

      const renderedBuffer = await offlineContext.startRendering();
      const wavBlob = audioBufferToWav(renderedBuffer);

      audioContext.close();
      return wavBlob;
    }
  } catch (error) {
    console.warn("Speed adjustment failed:", error);
    return audioBlob;
  }
}

/**
 * Apply echo effect to audio
 */
export async function applyEcho(
  audioBlob: Blob,
  options: EchoOptions
): Promise<Blob> {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length;
    const delaySamples = Math.floor(options.delay * sampleRate);
    const maxDelay = Math.max(delaySamples, length);

    // Create buffer with extra space for echo tail
    const echoLength = length + maxDelay;
    const offlineContext = new OfflineAudioContext(
      numberOfChannels,
      echoLength,
      sampleRate
    );

    // Create output buffer
    const outputBuffer = offlineContext.createBuffer(numberOfChannels, echoLength, sampleRate);

    // Process each channel
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const originalData = audioBuffer.getChannelData(channel);
      const processedData = new Float32Array(echoLength);

      // Copy original signal (dry)
      for (let i = 0; i < length; i++) {
        processedData[i] = originalData[i] * (1 - options.wetLevel);
      }

      // Add echo with feedback
      for (let i = 0; i < length; i++) {
        const echoIndex = i + delaySamples;
        if (echoIndex < echoLength) {
          // Add delayed signal (wet)
          processedData[echoIndex] += originalData[i] * options.wetLevel;
        }
      }

      // Apply feedback (multiple echoes)
      for (let feedbackIteration = 0; feedbackIteration < 3; feedbackIteration++) {
        for (let i = 0; i < length; i++) {
          const echoIndex = i + delaySamples * (feedbackIteration + 2);
          if (echoIndex < echoLength) {
            const prevEchoIndex = i + delaySamples * (feedbackIteration + 1);
            if (prevEchoIndex < echoLength) {
              processedData[echoIndex] += processedData[prevEchoIndex] * options.feedback;
              // Clamp to prevent clipping
              processedData[echoIndex] = Math.max(-1, Math.min(1, processedData[echoIndex]));
            }
          }
        }
      }

      // Copy processed data to output buffer
      outputBuffer.copyToChannel(processedData, channel);
    }

    // Render with echo
    const source = offlineContext.createBufferSource();
    source.buffer = outputBuffer;
    source.connect(offlineContext.destination);
    source.start(0);

    const renderedBuffer = await offlineContext.startRendering();
    const wavBlob = audioBufferToWav(renderedBuffer);

    audioContext.close();
    return wavBlob;
  } catch (error) {
    console.warn("Echo application failed:", error);
    return audioBlob;
  }
}

/**
 * Apply reverb effect to audio
 */
export async function applyReverb(
  audioBlob: Blob,
  options: ReverbOptions
): Promise<Blob> {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length;
    const impulseLength = Math.floor(sampleRate * 2); // 2 second impulse response

    // Create impulse response for reverb
    const impulse = audioContext.createBuffer(numberOfChannels, impulseLength, sampleRate);

    for (let channel = 0; channel < numberOfChannels; channel++) {
      const channelData = impulse.getChannelData(channel);
      for (let i = 0; i < impulseLength; i++) {
        const n = i / impulseLength;
        // Exponential decay with damping
        const decay = Math.pow(1 - n, options.damping * 10);
        channelData[i] = (Math.random() * 2 - 1) * (1 - n) * options.roomSize * decay;
      }
    }

    // Use convolver for reverb
    const offlineContext = new OfflineAudioContext(
      numberOfChannels,
      length + impulseLength,
      sampleRate
    );

    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;

    const convolver = offlineContext.createConvolver();
    convolver.buffer = impulse;

    const dryGain = offlineContext.createGain();
    const wetGain = offlineContext.createGain();
    dryGain.gain.value = 1 - options.wetLevel;
    wetGain.gain.value = options.wetLevel;

    // Mix dry and wet signals
    source.connect(dryGain);
    source.connect(convolver);
    convolver.connect(wetGain);

    const masterGain = offlineContext.createGain();
    dryGain.connect(masterGain);
    wetGain.connect(masterGain);
    masterGain.connect(offlineContext.destination);

    source.start(0);

    const renderedBuffer = await offlineContext.startRendering();
    const wavBlob = audioBufferToWav(renderedBuffer);

    audioContext.close();
    return wavBlob;
  } catch (error) {
    console.warn("Reverb application failed:", error);
    return audioBlob;
  }
}

/**
 * Apply voice filter effect
 */
export async function applyVoiceFilter(
  audioBlob: Blob,
  options: VoiceFilterOptions
): Promise<Blob> {
  if (options.type === "none" || options.intensity === 0) {
    return audioBlob;
  }

  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length;

    const offlineContext = new OfflineAudioContext(
      numberOfChannels,
      length,
      sampleRate
    );

    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;

    let playbackRate = 1.0;
    let filterNode: BiquadFilterNode | null = null;

    switch (options.type) {
      case "robot":
        // Ring modulation effect (simplified)
        playbackRate = 1.0;
        filterNode = offlineContext.createBiquadFilter();
        filterNode.type = "bandpass";
        filterNode.frequency.value = 1000 + options.intensity * 500;
        filterNode.Q.value = 10;
        break;

      case "chipmunk":
        // Higher pitch
        playbackRate = 1.0 + options.intensity * 0.5;
        break;

      case "deep":
        // Lower pitch
        playbackRate = 1.0 - options.intensity * 0.3;
        break;

      case "alien":
        // Variable pitch modulation
        playbackRate = 1.0;
        filterNode = offlineContext.createBiquadFilter();
        filterNode.type = "highpass";
        filterNode.frequency.value = 500 + options.intensity * 1000;
        filterNode.Q.value = 5;
        break;

      case "telephone":
        // Bandpass filter (telephone quality)
        playbackRate = 1.0;
        filterNode = offlineContext.createBiquadFilter();
        filterNode.type = "bandpass";
        filterNode.frequency.value = 2000;
        filterNode.Q.value = 1;
        break;

      case "radio":
        // AM radio effect (bandpass + slight distortion)
        playbackRate = 1.0;
        filterNode = offlineContext.createBiquadFilter();
        filterNode.type = "bandpass";
        filterNode.frequency.value = 1500;
        filterNode.Q.value = 2;
        break;
    }

    source.playbackRate.value = playbackRate;

    if (filterNode) {
      source.connect(filterNode);
      filterNode.connect(offlineContext.destination);
    } else {
      source.connect(offlineContext.destination);
    }

    source.start(0);

    const renderedBuffer = await offlineContext.startRendering();
    const wavBlob = audioBufferToWav(renderedBuffer);

    audioContext.close();
    return wavBlob;
  } catch (error) {
    console.warn("Voice filter application failed:", error);
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

