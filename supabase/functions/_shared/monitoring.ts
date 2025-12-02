/**
 * Monitoring and error tracking utilities for Supabase Edge Functions
 * Integrates with Sentry for error tracking and performance monitoring
 */

// Import Sentry SDK for Deno
// Note: Use index.mjs for better compatibility with Supabase Edge Functions
import * as Sentry from "https://deno.land/x/sentry/index.mjs";

interface ErrorContext {
  functionName?: string;
  userId?: string;
  deviceId?: string;
  requestId?: string;
  additionalData?: Record<string, unknown>;
}

interface PerformanceMetric {
  name: string;
  value: number;
  unit: "ms" | "bytes" | "count";
  tags?: Record<string, string>;
}

let sentryInitialized = false;

/**
 * Initialize Sentry for Deno Edge Functions
 */
export function initializeSentry(dsn: string | null): void {
  if (!dsn) {
    console.warn("[Monitoring] Sentry DSN not provided. Error tracking disabled.");
    sentryInitialized = false;
    return;
  }

  try {
    Sentry.init({
      dsn: dsn,
      environment: Deno.env.get("ENVIRONMENT") || "production",
      // Performance monitoring - sample 10% of transactions in production
      tracesSampleRate: Deno.env.get("ENVIRONMENT") === "development" ? 1.0 : 0.1,
      // Release tracking
      release: Deno.env.get("RELEASE_VERSION") || undefined,
      // Filter sensitive data
      beforeSend(event, hint) {
        // Filter out sensitive information from event
        if (event.extra) {
          const sensitiveKeys = ["password", "token", "secret", "apiKey", "authorization"];
          for (const key of sensitiveKeys) {
            if (key in event.extra) {
              event.extra[key] = "[REDACTED]";
            }
          }
        }
        return event;
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
export async function captureException(
  error: Error | unknown,
  context?: ErrorContext
): Promise<void> {
  if (!sentryInitialized) {
    // Fallback to console logging if Sentry is not enabled
    console.error("[Error]", error, context);
    return;
  }

  try {
    Sentry.captureException(error, {
      tags: {
        function: context?.functionName || "unknown",
        requestId: context?.requestId,
      },
      user: context?.userId
        ? {
            id: context.userId,
          }
        : undefined,
      contexts: {
        device: context?.deviceId
          ? {
              id: context.deviceId,
            }
          : undefined,
      },
      extra: context?.additionalData || {},
    });
  } catch (sentryError) {
    // Don't fail the request if Sentry fails
    console.error("[Monitoring] Failed to capture exception:", sentryError);
  }
}

/**
 * Capture message to Sentry
 */
export async function captureMessage(
  message: string,
  level: "info" | "warning" | "error" = "info",
  context?: ErrorContext
): Promise<void> {
  if (!sentryInitialized) {
    console.log(`[${level.toUpperCase()}]`, message, context);
    return;
  }

  try {
    Sentry.captureMessage(message, {
      level: level === "info" ? "info" : level === "warning" ? "warning" : "error",
      tags: {
        function: context?.functionName,
        requestId: context?.requestId,
      },
      user: context?.userId
        ? {
            id: context.userId,
          }
        : undefined,
      extra: context?.additionalData || {},
    });
  } catch (error) {
    console.error("[Monitoring] Failed to capture message:", error);
  }
}

/**
 * Track performance metric
 */
export function trackPerformance(metric: PerformanceMetric): void {
  if (!sentryInitialized) {
    console.log("[Performance]", metric);
    return;
  }

  try {
    // Sentry metrics API for Deno
    Sentry.metrics.distribution(metric.name, metric.value, {
      unit: metric.unit,
      tags: metric.tags || {},
    });
  } catch (error) {
    console.error("[Monitoring] Failed to track performance:", error);
  }
}

/**
 * Track security incident
 */
export async function trackSecurityIncident(
  incidentType: string,
  severity: "low" | "medium" | "high" | "critical",
  details: Record<string, unknown>,
  context?: ErrorContext
): Promise<void> {
  await captureMessage(
    `Security Incident: ${incidentType}`,
    severity === "critical" || severity === "high" ? "error" : "warning",
    {
      ...context,
      additionalData: {
        ...context?.additionalData,
        incidentType,
        severity,
        ...details,
      },
    }
  );
}

/**
 * Extract context from request
 */
export function extractRequestContext(req: Request): Partial<ErrorContext> {
  const deviceId = req.headers.get("x-device-id");
  const userId = req.headers.get("x-user-id");
  const requestId = req.headers.get("x-request-id") || crypto.randomUUID();

  return {
    deviceId: deviceId || undefined,
    userId: userId || undefined,
    requestId,
  };
}

/**
 * Start a Sentry transaction for performance monitoring
 */
export function startTransaction(
  name: string,
  operation: string,
  context?: ErrorContext
): Sentry.Transaction | null {
  if (!sentryInitialized) return null;

  try {
    const transaction = Sentry.startTransaction({
      name,
      op: operation,
      tags: {
        function: context?.functionName,
      },
      data: context?.additionalData || {},
    });

    return transaction;
  } catch (error) {
    console.error("[Monitoring] Failed to start transaction:", error);
    return null;
  }
}

/**
 * Initialize monitoring from environment variables
 */
export function initializeMonitoring(functionName: string): void {
  const sentryDsn = Deno.env.get("SENTRY_DSN");
  initializeSentry(sentryDsn || null);

  // Log initialization
  console.log(`[Monitoring] Monitoring initialized for function: ${functionName}`);
}
