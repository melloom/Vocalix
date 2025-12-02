/**
 * Frontend monitoring and error tracking utilities
 * Integrates with Sentry for error tracking and performance monitoring
 */

import * as Sentry from "@sentry/react";

interface ErrorContext {
  userId?: string;
  deviceId?: string;
  additionalData?: Record<string, unknown>;
}

/**
 * Initialize Sentry for frontend
 */
let sentryInitialized = false;

export function initializeSentry(dsn: string | null): void {
  if (!dsn) {
    // Only show warning in development mode
    if (import.meta.env.DEV) {
      console.debug("[Monitoring] Sentry DSN not provided. Error tracking disabled.");
    }
    sentryInitialized = false;
    return;
  }

  try {
    Sentry.init({
      dsn: dsn,
      environment: import.meta.env.MODE,
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration({
          maskAllText: false,
          blockAllMedia: false,
        }),
      ],
      // Performance Monitoring
      tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0, // 10% in production, 100% in dev
      // Session Replay
      replaysSessionSampleRate: 0.1, // 10% of sessions
      replaysOnErrorSampleRate: 1.0, // 100% of sessions with errors
      // Release tracking
      release: import.meta.env.VITE_APP_VERSION || undefined,
      // Filter sensitive data
      beforeSend(event, hint) {
        // Don't send events in development (optional)
        if (import.meta.env.DEV && import.meta.env.VITE_SENTRY_ENABLED !== "true") {
          return null;
        }
        return event;
      },
      // Filter breadcrumbs
      beforeBreadcrumb(breadcrumb, hint) {
        // Filter out sensitive data from breadcrumbs
        if (breadcrumb.data) {
          const sensitiveKeys = ["password", "token", "secret", "apiKey", "authorization"];
          for (const key of sensitiveKeys) {
            if (key in breadcrumb.data) {
              breadcrumb.data[key] = "[REDACTED]";
            }
          }
        }
        return breadcrumb;
      },
    });

    sentryInitialized = true;
    console.log("[Monitoring] Sentry initialized successfully");
  } catch (error) {
    console.error("[Monitoring] Failed to initialize Sentry:", error);
    sentryInitialized = false;
  }
}

/**
 * Capture exception to Sentry
 */
export function captureException(
  error: Error | unknown,
  context?: ErrorContext
): void {
  if (!sentryInitialized) {
    console.error("[Error]", error, context);
    return;
  }

  try {
    Sentry.captureException(error, {
      tags: {
        userId: context?.userId,
        deviceId: context?.deviceId,
      },
      extra: context?.additionalData,
      user: context?.userId
        ? {
            id: context.userId,
          }
        : undefined,
    });
  } catch (sentryError) {
    console.error("[Monitoring] Failed to capture exception:", sentryError);
  }
}

/**
 * Capture message to Sentry
 */
export function captureMessage(
  message: string,
  level: "info" | "warning" | "error" = "info",
  context?: ErrorContext
): void {
  if (!sentryInitialized) {
    console.log(`[${level.toUpperCase()}]`, message, context);
    return;
  }

  try {
    Sentry.captureMessage(message, {
      level: level === "info" ? "info" : level === "warning" ? "warning" : "error",
      tags: {
        userId: context?.userId,
        deviceId: context?.deviceId,
      },
      extra: context?.additionalData,
    });
  } catch (error) {
    console.error("[Monitoring] Failed to capture message:", error);
  }
}

/**
 * Track performance metric
 */
export function trackPerformance(
  name: string,
  value: number,
  unit: "ms" | "bytes" | "count" = "ms",
  tags?: Record<string, string>
): void {
  if (!sentryInitialized) {
    console.log("[Performance]", { name, value, unit, tags });
    return;
  }

  try {
    // Use Sentry's metrics API
    Sentry.metrics.distribution(name, value, {
      unit: unit,
      tags: tags || {},
    });
  } catch (error) {
    console.error("[Monitoring] Failed to track performance:", error);
  }
}

/**
 * Track user action as breadcrumb
 */
export function trackUserAction(
  action: string,
  properties?: Record<string, unknown>
): void {
  if (!sentryInitialized) {
    console.log("[User Action]", action, properties);
    return;
  }

  try {
    Sentry.addBreadcrumb({
      message: action,
      data: properties,
      category: "user",
      level: "info",
    });
  } catch (error) {
    console.error("[Monitoring] Failed to track user action:", error);
  }
}

/**
 * Set user context for Sentry
 */
export function setUserContext(userId: string, additionalData?: Record<string, unknown>): void {
  if (!sentryInitialized) return;

  try {
    Sentry.setUser({
      id: userId,
      ...additionalData,
    });
  } catch (error) {
    console.error("[Monitoring] Failed to set user context:", error);
  }
}

/**
 * Clear user context
 */
export function clearUserContext(): void {
  if (!sentryInitialized) return;

  try {
    Sentry.setUser(null);
  } catch (error) {
    console.error("[Monitoring] Failed to clear user context:", error);
  }
}

/**
 * Initialize monitoring from environment variables
 */
export function initializeMonitoring(): void {
  const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
  initializeSentry(sentryDsn || null);

  // Note: Global error handlers are automatically set up by Sentry
  // when using @sentry/react, but we keep them for non-Sentry logging
  console.log("[Monitoring] Frontend monitoring initialized");
}
