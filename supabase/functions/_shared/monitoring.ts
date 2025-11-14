/**
 * Monitoring and error tracking utilities for Supabase Edge Functions
 * Integrates with Sentry for error tracking and performance monitoring
 */

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

/**
 * Initialize Sentry for Deno Edge Functions
 * Note: This is a placeholder implementation. For production, use @sentry/deno
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
  console.log("[Monitoring] Sentry initialized successfully");
}

/**
 * Capture exception to Sentry
 * In production, this would integrate with @sentry/deno
 */
export async function captureException(
  error: Error | unknown,
  context?: ErrorContext
): Promise<void> {
  if (!sentryEnabled) {
    // Fallback to console logging if Sentry is not enabled
    console.error("[Error]", error, context);
    return;
  }

  try {
    // In production, replace this with actual Sentry SDK call:
    // Sentry.captureException(error, {
    //   tags: {
    //     function: context?.functionName,
    //   },
    //   user: context?.userId ? { id: context.userId } : undefined,
    //   contexts: {
    //     device: context?.deviceId ? { id: context.deviceId } : undefined,
    //   },
    //   extra: context?.additionalData,
    // });

    // For now, log to console with structured format
    console.error("[Sentry]", {
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name,
      } : String(error),
      context: {
        function: context?.functionName,
        userId: context?.userId,
        deviceId: context?.deviceId,
        requestId: context?.requestId,
        ...context?.additionalData,
      },
      timestamp: new Date().toISOString(),
    });

    // Optionally send to Sentry API directly
    if (sentryDsn) {
      await sendToSentry(error, context);
    }
  } catch (sentryError) {
    // Don't fail the request if Sentry fails
    console.error("[Monitoring] Failed to capture exception:", sentryError);
  }
}

/**
 * Send error to Sentry API directly (fallback method)
 */
async function sendToSentry(error: Error | unknown, context?: ErrorContext): Promise<void> {
  if (!sentryDsn) return;

  try {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    const sentryEvent = {
      message: errorMessage,
      level: "error",
      platform: "deno",
      timestamp: Math.floor(Date.now() / 1000),
      exception: {
        values: [
          {
            type: error instanceof Error ? error.name : "Error",
            value: errorMessage,
            stacktrace: errorStack
              ? {
                  frames: errorStack
                    .split("\n")
                    .slice(1)
                    .map((line) => ({
                      filename: line.trim(),
                      function: "unknown",
                    })),
                }
              : undefined,
          },
        ],
      },
      tags: {
        function: context?.functionName || "unknown",
      },
      user: context?.userId ? { id: context.userId } : undefined,
      contexts: {
        device: context?.deviceId ? { id: context.deviceId } : undefined,
      },
      extra: context?.additionalData || {},
    };

    // Note: This is a simplified implementation. Production should use Sentry SDK
    // For now, we'll just log it in a format that can be easily integrated later
    console.log("[Sentry Event]", JSON.stringify(sentryEvent));
  } catch (err) {
    console.error("[Monitoring] Failed to send to Sentry:", err);
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
export function trackPerformance(metric: PerformanceMetric): void {
  if (!sentryEnabled) {
    console.log("[Performance]", metric);
    return;
  }

  try {
    // In production, use: Sentry.metrics.distribution(metric.name, metric.value, { ...metric.tags })
    console.log("[Performance Metric]", JSON.stringify(metric));
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
 * Initialize monitoring from environment variables
 */
export function initializeMonitoring(functionName: string): void {
  const sentryDsn = Deno.env.get("SENTRY_DSN");
  initializeSentry(sentryDsn || null);

  // Log initialization
  console.log(`[Monitoring] Monitoring initialized for function: ${functionName}`);
}

