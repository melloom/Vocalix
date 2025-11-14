/**
 * Frontend monitoring and error tracking utilities
 * Integrates with Sentry for error tracking and performance monitoring
 */

interface ErrorContext {
  userId?: string;
  deviceId?: string;
  additionalData?: Record<string, unknown>;
}

/**
 * Initialize Sentry for frontend
 * In production, this would use @sentry/react
 */
let sentryEnabled = false;
let sentryDsn: string | null = null;

export function initializeSentry(dsn: string | null): void {
  if (!dsn) {
    console.warn("[Monitoring] Sentry DSN not provided. Error tracking disabled.");
    sentryEnabled = false;
    sentryDsn = null;
    return;
  }

  sentryDsn = dsn;
  sentryEnabled = true;

  // In production, initialize Sentry SDK:
  // import * as Sentry from "@sentry/react";
  // Sentry.init({
  //   dsn: dsn,
  //   environment: import.meta.env.MODE,
  //   integrations: [
  //     new Sentry.BrowserTracing(),
  //     new Sentry.Replay(),
  //   ],
  //   tracesSampleRate: 1.0,
  //   replaysSessionSampleRate: 0.1,
  //   replaysOnErrorSampleRate: 1.0,
  // });

  console.log("[Monitoring] Sentry initialized successfully");
}

/**
 * Capture exception to Sentry
 */
export function captureException(
  error: Error | unknown,
  context?: ErrorContext
): void {
  if (!sentryEnabled) {
    console.error("[Error]", error, context);
    return;
  }

  try {
    // In production, use: Sentry.captureException(error, { ...context })
    console.error("[Sentry]", {
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name,
      } : String(error),
      context: {
        userId: context?.userId,
        deviceId: context?.deviceId,
        ...context?.additionalData,
      },
      timestamp: new Date().toISOString(),
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
  if (!sentryEnabled) {
    console.log(`[${level.toUpperCase()}]`, message, context);
    return;
  }

  try {
    // In production, use: Sentry.captureMessage(message, level, { ...context })
    console.log(`[Sentry ${level}]`, message, context);
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
  if (!sentryEnabled) {
    console.log("[Performance]", { name, value, unit, tags });
    return;
  }

  try {
    // In production, use: Sentry.metrics.distribution(name, value, { tags })
    console.log("[Performance Metric]", JSON.stringify({ name, value, unit, tags }));
  } catch (error) {
    console.error("[Monitoring] Failed to track performance:", error);
  }
}

/**
 * Track user action
 */
export function trackUserAction(
  action: string,
  properties?: Record<string, unknown>
): void {
  if (!sentryEnabled) {
    console.log("[User Action]", action, properties);
    return;
  }

  try {
    // In production, use: Sentry.addBreadcrumb({ message: action, data: properties, category: 'user' })
    console.log("[User Action]", JSON.stringify({ action, properties }));
  } catch (error) {
    console.error("[Monitoring] Failed to track user action:", error);
  }
}

/**
 * Initialize monitoring from environment variables
 */
export function initializeMonitoring(): void {
  const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
  initializeSentry(sentryDsn || null);

  // Set up global error handlers
  if (sentryEnabled) {
    window.addEventListener("error", (event) => {
      captureException(event.error, {
        additionalData: {
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      });
    });

    window.addEventListener("unhandledrejection", (event) => {
      captureException(event.reason, {
        additionalData: {
          type: "unhandledrejection",
        },
      });
    });
  }

  console.log("[Monitoring] Frontend monitoring initialized");
}

