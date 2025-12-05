/**
 * Device ID Management for Pseudonymity
 * 
 * Handles device ID generation and storage for web and mobile platforms.
 * Web: Generates and stores UUID in localStorage
 * Mobile: Uses device-specific ID or generates UUID (via React Native libraries)
 */

const DEVICE_ID_KEY = 'vocalix_device_id';
const DEVICE_ID_VERSION = '1.0';

/**
 * Generate a random UUID v4
 */
function generateUUID(): string {
  // @ts-ignore - crypto.randomUUID is available in modern browsers
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Get or generate device ID
 * 
 * For web: Uses localStorage to store a generated UUID
 * For mobile: Would use device-specific ID (IDFV/Android ID) or generate UUID
 * 
 * @returns Promise<string> - The device ID
 */
export async function getOrCreateDeviceId(): Promise<string> {
  try {
    // Check if we already have a device ID stored
    const stored = localStorage.getItem(DEVICE_ID_KEY);
    if (stored) {
      try {
        const data = JSON.parse(stored);
        if (data.id && data.version === DEVICE_ID_VERSION) {
          return data.id;
        }
      } catch (e) {
        // Invalid stored data, generate new one
      }
    }

    // Generate new device ID
    const deviceId = generateUUID();
    
    // Store it
    const data = {
      id: deviceId,
      version: DEVICE_ID_VERSION,
      created_at: new Date().toISOString(),
    };
    
    localStorage.setItem(DEVICE_ID_KEY, JSON.stringify(data));
    
    return deviceId;
  } catch (error) {
    console.error('Error getting/creating device ID:', error);
    // Fallback: generate a temporary ID (won't persist across sessions)
    return generateUUID();
  }
}

/**
 * Reset device ID (for "burn persona" feature)
 * Generates a new device ID and clears the old one
 */
export async function resetDeviceId(): Promise<string> {
  try {
    localStorage.removeItem(DEVICE_ID_KEY);
    return await getOrCreateDeviceId();
  } catch (error) {
    console.error('Error resetting device ID:', error);
    return generateUUID();
  }
}

/**
 * Get current device ID without creating a new one
 * Returns null if no device ID exists
 */
export function getDeviceId(): string | null {
  try {
    const stored = localStorage.getItem(DEVICE_ID_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      if (data.id && data.version === DEVICE_ID_VERSION) {
        return data.id;
      }
    }
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Check if device ID exists
 */
export function hasDeviceId(): boolean {
  return getDeviceId() !== null;
}

