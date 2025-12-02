/**
 * Error handling utilities for Supabase Edge Functions
 * Sanitizes error messages to prevent information leakage
 */

/**
 * Patterns that indicate sensitive information in error messages
 */
const SENSITIVE_PATTERNS = [
  /password/gi,
  /token/gi,
  /secret/gi,
  /api[_-]?key/gi,
  /credential/gi,
  /connection[_-]?string/gi,
  /database[_-]?url/gi,
  /supabase[_-]?url/gi,
  /service[_-]?role/gi,
  /private[_-]?key/gi,
  /access[_-]?token/gi,
  /refresh[_-]?token/gi,
  /authorization/gi,
  /bearer/gi,
  /jwt/gi,
  /session[_-]?id/gi,
  /cookie/gi,
];

/**
 * Sanitize error message to prevent exposing sensitive information
 * @param error The error object or message
 * @param isDevelopment Whether we're in development mode
 * @returns Sanitized error message safe for client consumption
 */
export function sanitizeErrorMessage(
  error: unknown,
  isDevelopment: boolean = false
): string {
  let message = "An unexpected error occurred";

  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === "string") {
    message = error;
  } else if (error && typeof error === "object" && "message" in error) {
    message = String((error as { message: unknown }).message);
  }

  // In development, show more details but still sanitize sensitive info
  if (isDevelopment) {
    // Remove sensitive patterns but keep other details
    let sanitized = message;
    SENSITIVE_PATTERNS.forEach((pattern) => {
      sanitized = sanitized.replace(pattern, "[REDACTED]");
    });
    return sanitized;
  }

  // In production, return generic messages based on error type
  const lowerMessage = message.toLowerCase();

  // Database errors
  if (
    lowerMessage.includes("database") ||
    lowerMessage.includes("connection") ||
    lowerMessage.includes("query") ||
    lowerMessage.includes("sql")
  ) {
    return "A database error occurred. Please try again later.";
  }

  // Authentication errors
  if (
    lowerMessage.includes("auth") ||
    lowerMessage.includes("unauthorized") ||
    lowerMessage.includes("forbidden") ||
    lowerMessage.includes("permission")
  ) {
    return "Authentication failed. Please check your credentials.";
  }

  // Network errors
  if (
    lowerMessage.includes("network") ||
    lowerMessage.includes("fetch") ||
    lowerMessage.includes("timeout")
  ) {
    return "A network error occurred. Please check your connection.";
  }

  // Validation errors - these are usually safe to show
  if (
    lowerMessage.includes("validation") ||
    lowerMessage.includes("invalid") ||
    lowerMessage.includes("required") ||
    lowerMessage.includes("missing")
  ) {
    // Remove sensitive patterns but keep validation message
    let sanitized = message;
    SENSITIVE_PATTERNS.forEach((pattern) => {
      sanitized = sanitized.replace(pattern, "[REDACTED]");
    });
    return sanitized;
  }

  // Check for sensitive patterns
  const hasSensitiveInfo = SENSITIVE_PATTERNS.some((pattern) =>
    pattern.test(message)
  );

  if (hasSensitiveInfo) {
    return "An error occurred. Please contact support if the problem persists.";
  }

  // For other errors, return a generic message
  return "An unexpected error occurred. Please try again later.";
}

/**
 * Create a safe error response for Edge Functions
 * @param error The error object
 * @param status HTTP status code (default: 500)
 * @param isDevelopment Whether we're in development mode
 * @returns Response object with sanitized error
 */
export function createErrorResponse(
  error: unknown,
  status: number = 500,
  isDevelopment: boolean = false
): Response {
  const sanitizedMessage = sanitizeErrorMessage(error, isDevelopment);

  return new Response(
    JSON.stringify({
      error: sanitizedMessage,
      ...(isDevelopment && error instanceof Error
        ? { details: error.message }
        : {}),
    }),
    {
      status,
      headers: {
        "content-type": "application/json",
      },
    }
  );
}

/**
 * Log error safely without exposing sensitive information
 * @param context Context where the error occurred (e.g., function name)
 * @param error The error object
 * @param additionalData Optional additional data to log
 */
export function logErrorSafely(
  context: string,
  error: unknown,
  additionalData?: Record<string, unknown>
): void {
  let errorMessage = "Unknown error";
  let errorStack: string | undefined;

  if (error instanceof Error) {
    errorMessage = error.message;
    errorStack = error.stack;
  } else if (typeof error === "string") {
    errorMessage = error;
  }

  // Remove sensitive information from logs
  let sanitizedMessage = errorMessage;
  SENSITIVE_PATTERNS.forEach((pattern) => {
    sanitizedMessage = sanitizedMessage.replace(pattern, "[REDACTED]");
  });

  // Sanitize additional data
  const sanitizedData = additionalData
    ? Object.fromEntries(
        Object.entries(additionalData).map(([key, value]) => {
          const keyLower = key.toLowerCase();
          const isSensitive =
            SENSITIVE_PATTERNS.some((pattern) => pattern.test(key)) ||
            keyLower.includes("password") ||
            keyLower.includes("token") ||
            keyLower.includes("secret") ||
            keyLower.includes("key");

          if (isSensitive && typeof value === "string") {
            return [key, "[REDACTED]"];
          }
          return [key, value];
        })
      )
    : undefined;

  console.error(`[${context}] Error:`, sanitizedMessage, {
    ...sanitizedData,
    ...(errorStack && { stack: errorStack }),
  });
}

