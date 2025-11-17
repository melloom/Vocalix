/**
 * Session Management Utilities
 * Handles device session timeout, refresh, and validation
 */

import { supabase } from "@/integrations/supabase/client";
import { logError, logWarn } from "@/lib/logger";

export interface SessionStatus {
  isValid: boolean;
  expiresAt: string | null;
  expiresInSeconds: number | null;
  lastActivityAt: string | null;
  sessionRefreshCount: number;
}

const SESSION_CHECK_INTERVAL = 60000; // Check every minute
const SESSION_REFRESH_THRESHOLD = 3600; // Refresh if expires in less than 1 hour

let sessionCheckInterval: number | null = null;
let lastSessionCheck: number = 0;
const SESSION_CHECK_THROTTLE = 30000; // Don't check more than once per 30 seconds

/**
 * Check if device session is valid
 */
export async function checkSessionStatus(deviceId: string | null): Promise<SessionStatus | null> {
  if (!deviceId) {
    return null;
  }

  try {
    const { data, error } = await supabase.rpc("get_session_status", {
      p_device_id: deviceId,
    });

    if (error) {
      // Function might not exist yet (backward compatibility)
      if (error.code === "42883" || error.message?.includes("does not exist")) {
        return null; // Session management not available
      }
      logError("Failed to check session status", error);
      return null;
    }

    if (!data || data.length === 0) {
      return null;
    }

    const result = data[0];
    return {
      isValid: result.is_valid ?? true, // Default to true for backward compatibility
      expiresAt: result.expires_at,
      expiresInSeconds: result.expires_in_seconds,
      lastActivityAt: result.last_activity_at,
      sessionRefreshCount: result.session_refresh_count ?? 0,
    };
  } catch (error) {
    logError("Error checking session status", error);
    return null;
  }
}

/**
 * Refresh device session
 */
export async function refreshSession(
  deviceId: string | null,
  timeoutHours?: number
): Promise<string | null> {
  if (!deviceId) {
    return null;
  }

  try {
    const { data, error } = await supabase.rpc("refresh_device_session", {
      p_device_id: deviceId,
      p_timeout_hours: timeoutHours || null,
    });

    if (error) {
      // Function might not exist yet (backward compatibility)
      if (error.code === "42883" || error.message?.includes("does not exist")) {
        return null;
      }
      logError("Failed to refresh session", error);
      return null;
    }

    return data as string | null;
  } catch (error) {
    logError("Error refreshing session", error);
    return null;
  }
}

/**
 * Initialize device session (called on first login/device creation)
 */
export async function initializeSession(
  deviceId: string | null,
  timeoutHours: number = 24
): Promise<string | null> {
  if (!deviceId) {
    return null;
  }

  try {
    const { data, error } = await supabase.rpc("initialize_device_session", {
      p_device_id: deviceId,
      p_timeout_hours: timeoutHours,
    });

    if (error) {
      // Function might not exist yet (backward compatibility)
      if (error.code === "42883" || error.message?.includes("does not exist")) {
        return null;
      }
      logError("Failed to initialize session", error);
      return null;
    }

    return data as string | null;
  } catch (error) {
    logError("Error initializing session", error);
    return null;
  }
}

/**
 * Check and refresh session if needed
 */
export async function checkAndRefreshSession(deviceId: string | null): Promise<boolean> {
  if (!deviceId) {
    return false;
  }

  // Throttle session checks
  const now = Date.now();
  if (now - lastSessionCheck < SESSION_CHECK_THROTTLE) {
    return true; // Assume valid if we checked recently
  }
  lastSessionCheck = now;

  const status = await checkSessionStatus(deviceId);
  
  if (!status) {
    // Session management not available or error - assume valid for backward compatibility
    return true;
  }

  if (!status.isValid) {
    logWarn("Session expired", { deviceId, expiresAt: status.expiresAt });
    return false;
  }

  // Auto-refresh if session expires soon
  if (
    status.expiresInSeconds !== null &&
    status.expiresInSeconds < SESSION_REFRESH_THRESHOLD
  ) {
    const newExpiresAt = await refreshSession(deviceId);
    if (newExpiresAt) {
      if (import.meta.env.DEV) {
        console.debug("Session auto-refreshed", { deviceId, newExpiresAt });
      }
    }
  }

  return status.isValid;
}

/**
 * Start periodic session checking
 */
export function startSessionMonitoring(deviceId: string | null, onExpired?: () => void) {
  if (!deviceId) {
    return;
  }

  // Clear existing interval
  stopSessionMonitoring();

  // Check immediately
  checkAndRefreshSession(deviceId).then((isValid) => {
    if (!isValid && onExpired) {
      onExpired();
    }
  });

  // Set up periodic checking
  sessionCheckInterval = window.setInterval(async () => {
    const isValid = await checkAndRefreshSession(deviceId);
    if (!isValid && onExpired) {
      onExpired();
    }
  }, SESSION_CHECK_INTERVAL);
}

/**
 * Stop periodic session checking
 */
export function stopSessionMonitoring() {
  if (sessionCheckInterval !== null) {
    clearInterval(sessionCheckInterval);
    sessionCheckInterval = null;
  }
}

/**
 * Handle session expiration (clear auth state, redirect, etc.)
 */
export function handleSessionExpiration() {
  // Clear profile from localStorage
  try {
    localStorage.removeItem("profileId");
  } catch (error) {
    logError("Failed to clear profileId on session expiration", error);
  }

  // Stop session monitoring
  stopSessionMonitoring();

  // Log the expiration
  logWarn("Session expired - user needs to re-authenticate");

  // Optionally redirect to login or show a message
  // This can be customized based on app requirements
  if (typeof window !== "undefined") {
    // Dispatch custom event that components can listen to
    window.dispatchEvent(new CustomEvent("session-expired"));
  }
}

