/**
 * Audio compression utilities
 * Provides utilities for client-side audio compression hints and quality selection
 */

import { AudioQuality, getOptimalAudioQuality } from './adaptiveBitrate';

/**
 * Audio compression options
 */
export interface CompressionOptions {
  quality: AudioQuality;
  bitrate?: number;
  sampleRate?: number;
  channels?: 1 | 2;
}

/**
 * Get recommended compression settings based on quality level
 */
export function getCompressionSettings(quality: AudioQuality): CompressionOptions {
  const settings: Record<AudioQuality, CompressionOptions> = {
    low: {
      quality: 'low',
      bitrate: 64000, // 64 kbps
      sampleRate: 22050,
      channels: 1, // Mono for low quality
    },
    medium: {
      quality: 'medium',
      bitrate: 128000, // 128 kbps
      sampleRate: 44100,
      channels: 2, // Stereo
    },
    high: {
      quality: 'high',
      bitrate: 192000, // 192 kbps
      sampleRate: 44100,
      channels: 2, // Stereo
    },
    original: {
      quality: 'original',
      // No compression hints - use original
    },
  };

  return settings[quality];
}

/**
 * Compress audio using Web Audio API (client-side)
 * Note: This is a simplified implementation. Full compression may require server-side processing.
 */
export async function compressAudio(
  audioBlob: Blob,
  options: CompressionOptions
): Promise<Blob> {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Create offline context with target sample rate
    const targetSampleRate = options.sampleRate || audioBuffer.sampleRate;
    const offlineContext = new OfflineAudioContext(
      options.channels || audioBuffer.numberOfChannels,
      Math.floor((audioBuffer.length * targetSampleRate) / audioBuffer.sampleRate),
      targetSampleRate
    );

    // Create buffer source
    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;

    // Connect to destination
    source.connect(offlineContext.destination);
    source.start(0);

    // Render to new buffer
    const renderedBuffer = await offlineContext.startRendering();

    // Convert back to WAV format (simplified - full implementation would encode to MP3/OGG)
    // Note: For production, you'd want to use a library like lamejs for MP3 encoding
    // This is a placeholder that returns a resampled version
    return new Promise((resolve) => {
      // For now, just return the original blob
      // Full compression would require server-side processing or a library
      // This function serves as a placeholder for future implementation
      resolve(audioBlob);
    });
  } catch (error) {
    console.warn('Audio compression failed, using original:', error);
    return audioBlob;
  }
}

/**
 * Get optimal compression options based on current connection
 */
export function getOptimalCompression(): CompressionOptions {
  const quality = getOptimalAudioQuality();
  return getCompressionSettings(quality);
}

/**
 * Estimate file size reduction with compression
 */
export function estimateSizeReduction(
  originalSizeMB: number,
  quality: AudioQuality
): number {
  const reductionRatios: Record<AudioQuality, number> = {
    low: 0.15, // ~85% reduction
    medium: 0.35, // ~65% reduction
    high: 0.55, // ~45% reduction
    original: 1.0, // No reduction
  };

  return originalSizeMB * reductionRatios[quality];
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Check if audio compression is supported
 */
export function isCompressionSupported(): boolean {
  return (
    typeof AudioContext !== 'undefined' ||
    typeof (window as any).webkitAudioContext !== 'undefined'
  );
}

