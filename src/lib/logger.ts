/**
 * Centralized logging service
 * Replaces console statements with a proper logging system
 * Filters sensitive data from logs
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

/**
 * Patterns that indicate sensitive information
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
 * Sanitize data to remove sensitive information
 */
function sanitizeData(data: unknown): unknown {
  if (typeof data === "string") {
    let sanitized = data;
    SENSITIVE_PATTERNS.forEach((pattern) => {
      sanitized = sanitized.replace(pattern, "[REDACTED]");
    });
    return sanitized;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeData(item));
  }

  if (data && typeof data === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      const keyLower = key.toLowerCase();
      const isSensitive =
        SENSITIVE_PATTERNS.some((pattern) => pattern.test(key)) ||
        keyLower.includes("password") ||
        keyLower.includes("token") ||
        keyLower.includes("secret") ||
        keyLower.includes("key") ||
        keyLower.includes("credential");

      if (isSensitive) {
        sanitized[key] = "[REDACTED]";
      } else {
        sanitized[key] = sanitizeData(value);
      }
    }
    return sanitized;
  }

  return data;
}

class Logger {
  private logLevel: LogLevel;
  private isDevelopment: boolean;

  constructor() {
    this.isDevelopment = import.meta.env.DEV;
    // In production, only show WARN and ERROR
    // In development, show all logs
    this.logLevel = this.isDevelopment ? LogLevel.DEBUG : LogLevel.WARN;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.logLevel;
  }

  private formatMessage(level: string, message: string, ...args: unknown[]): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level}] ${message}`;
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      const sanitizedArgs = args.map((arg) => sanitizeData(arg));
      console.debug(this.formatMessage('DEBUG', message), ...sanitizedArgs);
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.INFO)) {
      const sanitizedArgs = args.map((arg) => sanitizeData(arg));
      console.info(this.formatMessage('INFO', message), ...sanitizedArgs);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.WARN)) {
      const sanitizedArgs = args.map((arg) => sanitizeData(arg));
      console.warn(this.formatMessage('WARN', message), ...sanitizedArgs);
    }
  }

  error(message: string, error?: Error | unknown, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const errorDetails = error instanceof Error 
        ? { message: error.message, stack: error.stack, name: error.name }
        : error;
      // Sanitize error details and additional args
      const sanitizedError = sanitizeData(errorDetails);
      const sanitizedArgs = args.map((arg) => sanitizeData(arg));
      console.error(this.formatMessage('ERROR', message), sanitizedError, ...sanitizedArgs);
    }
  }

  log(message: string, ...args: unknown[]): void {
    // Alias for info, for backward compatibility
    // Sanitize message and args
    const sanitizedMessage = typeof message === "string" 
      ? (sanitizeData(message) as string)
      : message;
    const sanitizedArgs = args.map((arg) => sanitizeData(arg));
    this.info(sanitizedMessage, ...sanitizedArgs);
  }
}

// Export singleton instance
export const logger = new Logger();

// Export convenience functions
export const log = logger.log.bind(logger);
export const logDebug = logger.debug.bind(logger);
export const logInfo = logger.info.bind(logger);
export const logWarn = logger.warn.bind(logger);
export const logError = logger.error.bind(logger);

