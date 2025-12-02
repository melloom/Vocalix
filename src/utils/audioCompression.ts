/**
 * Audio compression and optimization utilities
 * Provides utilities for optimizing audio file sizes and quality
 */

interface CompressionOptions {
  quality?: number; // 0-1, higher is better quality
  bitrate?: number; // Target bitrate in kbps
  format?: "mp3" | "opus" | "aac" | "ogg";
  sampleRate?: number; // Target sample rate in Hz
}

interface CompressionResult {
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  url: string;
}

/**
 * Estimate audio file size based on duration and bitrate
 */
export function estimateAudioSize(
  durationSeconds: number,
  bitrateKbps: number = 128
): number {
  // Size in bytes = (bitrate in bits per second * duration in seconds) / 8
  return (bitrateKbps * 1000 * durationSeconds) / 8;
}

/**
 * Get optimal audio format based on browser support
 */
export function getOptimalAudioFormat(): "mp3" | "opus" | "aac" | "ogg" {
  const audio = document.createElement("audio");
  
  if (audio.canPlayType("audio/opus")) {
    return "opus"; // Best compression
  }
  if (audio.canPlayType("audio/mp4")) {
    return "aac"; // Good compression, wide support
  }
  if (audio.canPlayType("audio/mpeg")) {
    return "mp3"; // Universal support
  }
  return "ogg"; // Fallback
}

/**
 * Compress audio using Web Audio API (client-side)
 * Note: This is a simplified version. Full compression requires server-side processing.
 */
export async function compressAudioClientSide(
  audioFile: File,
  options: CompressionOptions = {}
): Promise<CompressionResult> {
  const {
    quality = 0.7,
    bitrate = 96,
    sampleRate = 44100,
  } = options;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        
        // Decode audio data
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        // Create offline context for processing
        const offlineContext = new OfflineAudioContext(
          audioBuffer.numberOfChannels,
          Math.floor(audioBuffer.duration * sampleRate),
          sampleRate
        );
        
        // Create buffer source
        const source = offlineContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(offlineContext.destination);
        source.start();
        
        // Render to new buffer
        const renderedBuffer = await offlineContext.startRendering();
        
        // Convert to WAV (simplified - in production, use proper encoder)
        const wav = audioBufferToWav(renderedBuffer);
        const blob = new Blob([wav], { type: "audio/wav" });
        
        const originalSize = audioFile.size;
        const compressedSize = blob.size;
        
        resolve({
          originalSize,
          compressedSize,
          compressionRatio: compressedSize / originalSize,
          url: URL.createObjectURL(blob),
        });
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = reject;
    reader.readAsArrayBuffer(audioFile);
  });
}

/**
 * Convert AudioBuffer to WAV format
 */
function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
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
  
  // Write audio data
  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  
  return arrayBuffer;
}

/**
 * Get recommended compression settings based on use case
 */
export function getRecommendedCompressionSettings(
  useCase: "voice" | "music" | "podcast"
): CompressionOptions {
  switch (useCase) {
    case "voice":
      return {
        quality: 0.6,
        bitrate: 64,
        sampleRate: 22050,
        format: "opus",
      };
    case "podcast":
      return {
        quality: 0.7,
        bitrate: 96,
        sampleRate: 44100,
        format: "mp3",
      };
    case "music":
      return {
        quality: 0.8,
        bitrate: 128,
        sampleRate: 44100,
        format: "mp3",
      };
    default:
      return {
        quality: 0.7,
        bitrate: 96,
        sampleRate: 44100,
        format: "mp3",
      };
  }
}

/**
 * Validate audio file before upload
 */
export function validateAudioFile(file: File): {
  valid: boolean;
  error?: string;
  recommendations?: string[];
} {
  const recommendations: string[] = [];
  const maxSize = 50 * 1024 * 1024; // 50MB
  const maxDuration = 10 * 60; // 10 minutes
  
  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File size (${(file.size / 1024 / 1024).toFixed(2)}MB) exceeds maximum (50MB)`,
      recommendations: ["Compress the audio file", "Reduce recording duration"],
    };
  }
  
  // Check file type
  const validTypes = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/webm", "audio/mp4"];
  if (!validTypes.includes(file.type)) {
    recommendations.push(`Consider converting to MP3 or Opus format for better compatibility`);
  }
  
  return {
    valid: true,
    recommendations: recommendations.length > 0 ? recommendations : undefined,
  };
}

/**
 * Get audio file metadata
 */
export async function getAudioMetadata(file: File): Promise<{
  duration: number;
  sampleRate: number;
  channels: number;
  bitrate: number;
}> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    const url = URL.createObjectURL(file);
    
    audio.addEventListener("loadedmetadata", () => {
      const duration = audio.duration;
      // Estimate bitrate from file size and duration
      const bitrate = (file.size * 8) / duration / 1000; // kbps
      
      URL.revokeObjectURL(url);
      
      resolve({
        duration,
        sampleRate: 44100, // Default, actual would need AudioContext
        channels: 2, // Default, actual would need AudioContext
        bitrate: Math.round(bitrate),
      });
    });
    
    audio.addEventListener("error", () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load audio file"));
    });
    
    audio.src = url;
  });
}
