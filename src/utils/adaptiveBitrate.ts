/**
 * Adaptive bitrate utilities for audio loading
 * Detects connection speed and adjusts audio quality accordingly
 */

/**
 * Network connection information
 */
interface ConnectionInfo {
  effectiveType: 'slow-2g' | '2g' | '3g' | '4g';
  downlink: number; // Mbps
  rtt: number; // ms
  saveData: boolean;
}

/**
 * Audio quality levels based on connection speed
 */
export type AudioQuality = 'low' | 'medium' | 'high' | 'original';

/**
 * Get current network connection information
 */
export function getConnectionInfo(): ConnectionInfo | null {
  // @ts-ignore - Connection API is experimental but widely supported
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  
  if (!connection) {
    // Fallback: assume good connection if API not available
    return {
      effectiveType: '4g',
      downlink: 10,
      rtt: 50,
      saveData: false,
    };
  }

  return {
    effectiveType: connection.effectiveType || '4g',
    downlink: connection.downlink || 10,
    rtt: connection.rtt || 50,
    saveData: connection.saveData || false,
  };
}

/**
 * Determine optimal audio quality based on connection
 */
export function getOptimalAudioQuality(): AudioQuality {
  const connection = getConnectionInfo();
  
  if (!connection) {
    return 'medium'; // Safe default
  }

  // If save data mode is enabled, use lower quality
  if (connection.saveData) {
    return 'low';
  }

  // Determine quality based on effective type
  switch (connection.effectiveType) {
    case 'slow-2g':
    case '2g':
      return 'low';
    case '3g':
      return connection.downlink < 1.5 ? 'low' : 'medium';
    case '4g':
    default:
      // Use high quality if downlink is good and RTT is low
      if (connection.downlink >= 5 && connection.rtt < 100) {
        return 'high';
      }
      return 'medium';
  }
}

/**
 * Get audio URL parameters for quality adjustment
 * This works with CDN that supports quality parameters
 */
export function getAudioQualityParams(quality: AudioQuality): Record<string, string> {
  switch (quality) {
    case 'low':
      return { quality: 'low', bitrate: '64k' };
    case 'medium':
      return { quality: 'medium', bitrate: '128k' };
    case 'high':
      return { quality: 'high', bitrate: '192k' };
    case 'original':
    default:
      return {};
  }
}

/**
 * Subscribe to connection changes
 */
export function subscribeToConnectionChanges(
  callback: (quality: AudioQuality, connection: ConnectionInfo) => void
): () => void {
  // @ts-ignore - Connection API is experimental
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  
  if (!connection) {
    // No connection API, call with current default
    const info = getConnectionInfo();
    if (info) {
      callback(getOptimalAudioQuality(), info);
    }
    return () => {}; // No-op cleanup
  }

  const handleChange = () => {
    const info = getConnectionInfo();
    if (info) {
      callback(getOptimalAudioQuality(), info);
    }
  };

  connection.addEventListener('change', handleChange);
  
  // Initial call
  handleChange();

  return () => {
    connection.removeEventListener('change', handleChange);
  };
}

/**
 * Check if connection is stable enough for high quality
 */
export function isConnectionStable(): boolean {
  const connection = getConnectionInfo();
  
  if (!connection) {
    return true; // Assume stable if can't detect
  }

  // Consider stable if:
  // - Not in save data mode
  // - Effective type is 3g or better
  // - RTT is reasonable (< 200ms)
  return (
    !connection.saveData &&
    (connection.effectiveType === '3g' || connection.effectiveType === '4g') &&
    connection.rtt < 200
  );
}

/**
 * Estimate download time for audio file
 */
export function estimateDownloadTime(fileSizeMB: number, connection?: ConnectionInfo): number {
  const info = connection || getConnectionInfo();
  
  if (!info) {
    return 0; // Unknown
  }

  // Account for connection overhead (use 80% of theoretical max)
  const effectiveSpeed = info.downlink * 0.8;
  
  if (effectiveSpeed === 0) {
    return Infinity; // No connection
  }

  // Convert file size to Mb and calculate time
  const fileSizeMb = fileSizeMB * 8; // MB to Mb
  const timeSeconds = fileSizeMb / effectiveSpeed;
  
  return Math.max(timeSeconds, 0);
}

