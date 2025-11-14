/**
 * Device security utilities for client-side security enhancements
 */

/**
 * Generate a device fingerprint based on browser characteristics
 * This helps detect device changes and suspicious activity
 */
export function generateDeviceFingerprint(): string {
  const components: string[] = [];

  // Screen resolution
  if (typeof screen !== "undefined") {
    components.push(`${screen.width}x${screen.height}x${screen.colorDepth}`);
  }

  // Timezone
  try {
    components.push(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    // Ignore timezone errors
  }

  // Language
  if (typeof navigator !== "undefined") {
    components.push(navigator.language || navigator.languages?.[0] || "unknown");
  }

  // Platform
  if (typeof navigator !== "undefined") {
    components.push(navigator.platform || "unknown");
  }

  // Hardware concurrency
  if (typeof navigator !== "undefined" && "hardwareConcurrency" in navigator) {
    components.push(String(navigator.hardwareConcurrency || 0));
  }

  // Canvas fingerprint (basic)
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.textBaseline = "top";
      ctx.font = "14px Arial";
      ctx.fillText("Device fingerprint", 2, 2);
      const canvasHash = canvas.toDataURL().slice(0, 50);
      components.push(canvasHash);
    }
  } catch {
    // Ignore canvas errors
  }

  // Combine and hash
  const fingerprint = components.join("|");
  return btoa(fingerprint).slice(0, 32);
}

/**
 * Get user agent string
 */
export function getUserAgent(): string {
  if (typeof navigator === "undefined") return "unknown";
  return navigator.userAgent || "unknown";
}

/**
 * Validate device ID format (UUID)
 */
export function isValidDeviceId(deviceId: string | null): boolean {
  if (!deviceId) return false;
  // UUID format: 8-4-4-4-12 hex characters
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(deviceId);
}

/**
 * Check if device ID is suspicious (too short, invalid format, etc.)
 */
export function isSuspiciousDeviceId(deviceId: string | null): boolean {
  if (!deviceId) return true;
  if (deviceId.length < 30) return true; // UUIDs are 36 chars
  if (!isValidDeviceId(deviceId)) return true;
  return false;
}

/**
 * Store device metadata in localStorage (for security tracking)
 */
export function storeDeviceMetadata(deviceId: string): void {
  try {
    const metadata = {
      deviceId,
      fingerprint: generateDeviceFingerprint(),
      userAgent: getUserAgent(),
      createdAt: new Date().toISOString(),
      lastValidated: new Date().toISOString(),
    };
    localStorage.setItem("device_metadata", JSON.stringify(metadata));
  } catch (error) {
    console.error("Failed to store device metadata:", error);
  }
}

/**
 * Validate device metadata hasn't changed suspiciously
 */
export function validateDeviceMetadata(deviceId: string): {
  isValid: boolean;
  reason?: string;
} {
  try {
    const stored = localStorage.getItem("device_metadata");
    if (!stored) {
      // First time, store it
      storeDeviceMetadata(deviceId);
      return { isValid: true };
    }

    const metadata = JSON.parse(stored);
    
    // Check if device ID matches
    if (metadata.deviceId !== deviceId) {
      return { isValid: false, reason: "Device ID mismatch" };
    }

    // Check if fingerprint changed significantly (might indicate device change)
    const currentFingerprint = generateDeviceFingerprint();
    if (metadata.fingerprint && metadata.fingerprint !== currentFingerprint) {
      // Fingerprint changed - might be legitimate (browser update) or suspicious
      // Log but don't block (could be false positive)
      console.warn("Device fingerprint changed", {
        old: metadata.fingerprint,
        new: currentFingerprint,
      });
    }

    // Update last validated
    metadata.lastValidated = new Date().toISOString();
    localStorage.setItem("device_metadata", JSON.stringify(metadata));

    return { isValid: true };
  } catch (error) {
    console.error("Failed to validate device metadata:", error);
    return { isValid: true }; // Don't block on validation errors
  }
}

/**
 * Detect if running in suspicious environment
 */
export function detectSuspiciousEnvironment(): {
  isSuspicious: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];

  // Check for automation tools
  if (typeof navigator !== "undefined") {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("selenium") || ua.includes("webdriver") || ua.includes("headless")) {
      reasons.push("Automation tools detected");
    }
  }

  // Check for missing common browser APIs
  if (typeof window !== "undefined") {
    if (!window.localStorage) reasons.push("No localStorage");
    if (!window.sessionStorage) reasons.push("No sessionStorage");
    if (!window.indexedDB) reasons.push("No IndexedDB");
  }

  // Check for unusual screen size (common in headless browsers)
  if (typeof screen !== "undefined") {
    if (screen.width === 0 || screen.height === 0) {
      reasons.push("Invalid screen dimensions");
    }
  }

  return {
    isSuspicious: reasons.length > 0,
    reasons,
  };
}

