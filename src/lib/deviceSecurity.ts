/**
 * Device security utilities for client-side security enhancements
 */

// Cache for WebGL fingerprint to avoid creating too many contexts
let cachedWebGLFingerprint: string | null = null;

/**
 * Generate a device fingerprint based on browser characteristics
 * This helps detect device changes and suspicious activity
 * Enhanced with canvas, WebGL, and audio context fingerprints
 */
export function generateDeviceFingerprint(): string {
  const components: string[] = [];

  // Screen resolution
  if (typeof screen !== "undefined") {
    components.push(`${screen.width}x${screen.height}x${screen.colorDepth}`);
    // Add availWidth/availHeight for more precision
    components.push(`${screen.availWidth}x${screen.availHeight}`);
    components.push(String(screen.pixelDepth || 0));
  }

  // Timezone
  try {
    components.push(Intl.DateTimeFormat().resolvedOptions().timeZone);
    components.push(String(new Date().getTimezoneOffset()));
  } catch {
    // Ignore timezone errors
  }

  // Language
  if (typeof navigator !== "undefined") {
    components.push(navigator.language || navigator.languages?.[0] || "unknown");
    if (navigator.languages && navigator.languages.length > 0) {
      components.push(navigator.languages.slice(0, 3).join(","));
    }
  }

  // Platform
  if (typeof navigator !== "undefined") {
    components.push(navigator.platform || "unknown");
    components.push(navigator.vendor || "unknown");
    if ("maxTouchPoints" in navigator) {
      components.push(String(navigator.maxTouchPoints || 0));
    }
  }

  // Hardware concurrency
  if (typeof navigator !== "undefined" && "hardwareConcurrency" in navigator) {
    components.push(String(navigator.hardwareConcurrency || 0));
  }

  // Memory (if available)
  if (typeof navigator !== "undefined" && "deviceMemory" in navigator) {
    components.push(String((navigator as any).deviceMemory || 0));
  }

  // Enhanced Canvas fingerprint
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.textBaseline = "top";
      ctx.font = "14px 'Arial'";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#f60";
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = "#069";
      ctx.fillText("Device fingerprint 🔒", 2, 15);
      ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
      ctx.fillText("Device fingerprint 🔒", 4, 17);
      // Get canvas fingerprint
      const canvasHash = canvas.toDataURL();
      // Create simple hash from canvas data
      let hash = 0;
      for (let i = 0; i < canvasHash.length; i++) {
        const char = canvasHash.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
      }
      components.push(String(Math.abs(hash)));
    }
  } catch {
    // Ignore canvas errors
  }

  // WebGL fingerprint (cached to avoid creating too many contexts)
  try {
    if (cachedWebGLFingerprint) {
      components.push(cachedWebGLFingerprint);
    } else {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl", { 
        failIfMajorPerformanceCaveat: false,
        preserveDrawingBuffer: false 
      }) || canvas.getContext("experimental-webgl");
      if (gl) {
        const webGLComponents: string[] = [];
        const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
        if (debugInfo) {
          const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
          const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
          webGLComponents.push(vendor || "");
          webGLComponents.push(renderer || "");
        }
        // Get WebGL parameters
        const params = [
          "VERSION",
          "SHADING_LANGUAGE_VERSION",
          "ALIASED_LINE_WIDTH_RANGE",
          "ALIASED_POINT_SIZE_RANGE",
          "MAX_VIEWPORT_DIMS",
        ];
        for (const param of params) {
          try {
            const value = gl.getParameter(gl[param]);
            if (Array.isArray(value)) {
              webGLComponents.push(value.join(","));
            } else {
              webGLComponents.push(String(value || ""));
            }
          } catch {
            // Ignore errors
          }
        }
        // Cache the WebGL fingerprint
        cachedWebGLFingerprint = webGLComponents.join("|");
        components.push(cachedWebGLFingerprint);
      }
    }
  } catch {
    // Ignore WebGL errors
  }

  // Audio context fingerprint (simplified to avoid deprecation warnings and user gesture requirements)
  try {
    const AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (AudioContext) {
      // Create AudioContext in suspended state (doesn't require user gesture)
      const audioContext = new AudioContext({ latencyHint: 'interactive' });
      
      // Only use properties that don't require starting the context
      // Sample rate is available even when suspended
      const sampleRate = audioContext.sampleRate;
      components.push(String(sampleRate || 0));
      
      // Add context state as fingerprint component
      components.push(audioContext.state || 'unknown');
      
      // Get max channel count if available
      if ('maxChannelCount' in audioContext.destination) {
        components.push(String((audioContext.destination as any).maxChannelCount || 0));
      }
      
      // Close the context to free resources
      audioContext.close().catch(() => {
        // Ignore close errors
      });
    }
  } catch {
    // Ignore audio context errors
  }

  // Combine and hash
  const fingerprint = components.join("|");
  // Use better hashing for fingerprint
  let hash = 0;
  for (let i = 0; i < fingerprint.length; i++) {
    const char = fingerprint.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36).padStart(8, "0");
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

// Track if we've already warned about fingerprint change in this session
let hasWarnedAboutFingerprintChange = false;

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
      // Only warn once per session to avoid spam
      if (!hasWarnedAboutFingerprintChange) {
        hasWarnedAboutFingerprintChange = true;
        // Use debug level instead of warn to reduce noise
        if (import.meta.env.DEV) {
          console.debug("Device fingerprint changed (updating stored fingerprint)", {
            old: metadata.fingerprint,
            new: currentFingerprint,
          });
        }
      }
      // Update stored fingerprint to match current (browser updates, etc. can cause legitimate changes)
      metadata.fingerprint = currentFingerprint;
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
 * Enhanced bot detection for automation tools and headless browsers
 */
export function detectSuspiciousEnvironment(): {
  isSuspicious: boolean;
  reasons: string[];
  riskScore: number; // 0-100, higher = more suspicious
} {
  const reasons: string[] = [];
  let riskScore = 0;

  // Check for automation tools in user agent
  if (typeof navigator !== "undefined") {
    const ua = navigator.userAgent.toLowerCase();
    const botPatterns = [
      "selenium",
      "webdriver",
      "headless",
      "puppeteer",
      "playwright",
      "phantomjs",
      "chromium",
      "automation",
      "bot",
      "crawler",
      "spider",
      "scraper",
      "curl",
      "wget",
      "python-requests",
      "go-http-client",
      "java",
      "httpclient",
    ];
    
    for (const pattern of botPatterns) {
      if (ua.includes(pattern)) {
        reasons.push(`Automation tool detected: ${pattern}`);
        riskScore += 30;
      }
    }

    // Check for WebDriver property (Selenium/Puppeteer)
    if ((window as any).navigator?.webdriver) {
      reasons.push("WebDriver property detected");
      riskScore += 40;
    }

    // Check for Chrome automation
    if ((window as any).navigator?.webdriver === true) {
      reasons.push("Chrome automation detected");
      riskScore += 35;
    }

    // Check for missing Chrome runtime
    if (ua.includes("chrome") && !(window as any).chrome) {
      reasons.push("Chrome without chrome object");
      riskScore += 20;
    }

    // Check for PhantomJS
    if ((window as any).callPhantom || (window as any)._phantom) {
      reasons.push("PhantomJS detected");
      riskScore += 50;
    }

    // Check for missing navigator properties that bots often omit
    if (!navigator.languages || navigator.languages.length === 0) {
      reasons.push("Missing language preferences");
      riskScore += 10;
    }

    // Check for suspicious user agent patterns
    if (ua.length < 20) {
      reasons.push("Suspiciously short user agent");
      riskScore += 15;
    }
  }

  // Check for missing common browser APIs
  if (typeof window !== "undefined") {
    if (!window.localStorage) {
      reasons.push("No localStorage");
      riskScore += 10;
    }
    if (!window.sessionStorage) {
      reasons.push("No sessionStorage");
      riskScore += 10;
    }
    if (!window.indexedDB) {
      reasons.push("No IndexedDB");
      riskScore += 10;
    }
    if (!document.createElement) {
      reasons.push("No createElement");
      riskScore += 25;
    }
  }

  // Check for unusual screen size (common in headless browsers)
  if (typeof screen !== "undefined") {
    if (screen.width === 0 || screen.height === 0) {
      reasons.push("Invalid screen dimensions");
      riskScore += 30;
    }
    // Very common headless browser sizes
    if ((screen.width === 1366 && screen.height === 768) || 
        (screen.width === 1920 && screen.height === 1080)) {
      // This alone isn't suspicious, but combined with other factors it is
      riskScore += 5;
    }
  }

  // Check for missing plugins (headless browsers often have no plugins)
  if (typeof navigator !== "undefined" && navigator.plugins) {
    if (navigator.plugins.length === 0) {
      reasons.push("No browser plugins");
      riskScore += 15;
    }
  }

  // Check for missing permissions API
  if (typeof navigator !== "undefined" && !navigator.permissions) {
    reasons.push("No permissions API");
    riskScore += 10;
  }

  // Check for automation detection evasion attempts
  if (typeof window !== "undefined") {
    // Check if common properties are missing (bot evasion)
    const props = ["chrome", "outerHeight", "outerWidth"];
    for (const prop of props) {
      if (!(prop in window)) {
        riskScore += 5;
      }
    }
  }

  // Check for timing anomalies (too fast interactions)
  try {
    const timingData = (performance as any).timing;
    if (timingData) {
      const loadTime = timingData.loadEventEnd - timingData.navigationStart;
      // Suspiciously fast load times (less than 100ms) might indicate automation
      if (loadTime > 0 && loadTime < 100) {
        reasons.push("Unusually fast page load");
        riskScore += 15;
      }
    }
  } catch {
    // Ignore timing errors
  }

  return {
    isSuspicious: reasons.length > 0 || riskScore > 30,
    reasons,
    riskScore: Math.min(100, riskScore),
  };
}

/**
 * Track behavioral patterns for bot detection
 * Detects too fast interactions, perfect timing, etc.
 */
export function trackBehavioralPattern(action: string): {
  isSuspicious: boolean;
  reason?: string;
} {
  try {
    const key = `behavior_tracking_${action}`;
    const stored = sessionStorage.getItem(key);
    const now = Date.now();
    
    if (stored) {
      const data = JSON.parse(stored);
      const timeSinceLastAction = now - data.lastAction;
      const actions = data.actions || [];
      
      // Too fast interactions (< 50ms apart)
      if (timeSinceLastAction < 50) {
        return {
          isSuspicious: true,
          reason: "Actions too fast (potential automation)",
        };
      }

      // Perfect timing (exactly same intervals)
      if (actions.length >= 3) {
        const intervals = [];
        for (let i = 1; i < actions.length; i++) {
          intervals.push(actions[i] - actions[i - 1]);
        }
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const variance = intervals.reduce((sum, val) => sum + Math.pow(val - avgInterval, 2), 0) / intervals.length;
        // Very low variance suggests automation (perfect timing)
        if (variance < 100) {
          return {
            isSuspicious: true,
            reason: "Perfect timing pattern detected",
          };
        }
      }

      // Update tracking
      actions.push(now);
      if (actions.length > 10) {
        actions.shift(); // Keep last 10 actions
      }
      sessionStorage.setItem(key, JSON.stringify({
        lastAction: now,
        actions,
      }));
    } else {
      sessionStorage.setItem(key, JSON.stringify({
        lastAction: now,
        actions: [now],
      }));
    }

    return { isSuspicious: false };
  } catch {
    // If tracking fails, don't block
    return { isSuspicious: false };
  }
}

