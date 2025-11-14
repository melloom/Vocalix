/**
 * Security utilities for input validation and sanitization
 */

import { z } from "zod";

/**
 * Sanitize string input to prevent XSS and injection attacks
 */
export function sanitizeInput(input: string): string {
  if (typeof input !== "string") {
    return "";
  }
  
  // Remove potentially dangerous characters
  return input
    .trim()
    .replace(/[<>]/g, "") // Remove angle brackets
    .replace(/javascript:/gi, "") // Remove javascript: protocol
    .replace(/on\w+=/gi, ""); // Remove event handlers
}

/**
 * Validate and sanitize handle/username
 */
export const handleSchema = z
  .string()
  .min(1, "Handle cannot be empty")
  .max(30, "Handle must be 30 characters or less")
  .regex(/^[a-zA-Z0-9_-]+$/, "Handle can only contain letters, numbers, underscores, and hyphens")
  .transform((val) => sanitizeInput(val));

/**
 * Validate clip title
 */
export const clipTitleSchema = z
  .string()
  .max(100, "Title must be 100 characters or less")
  .transform((val) => sanitizeInput(val))
  .optional();

/**
 * Validate search query
 */
export const searchQuerySchema = z
  .string()
  .max(200, "Search query must be 200 characters or less")
  .transform((val) => sanitizeInput(val));

/**
 * Validate email (for magic login links)
 */
export const emailSchema = z
  .string()
  .email("Invalid email address")
  .max(255, "Email must be 255 characters or less")
  .transform((val) => val.toLowerCase().trim());

/**
 * Validate device ID format
 */
export const deviceIdSchema = z
  .string()
  .uuid("Invalid device ID format")
  .or(z.string().length(36)); // Allow UUID format

/**
 * Validate profile ID format
 */
export const profileIdSchema = z.string().uuid("Invalid profile ID format");

/**
 * Validate clip ID format
 */
export const clipIdSchema = z.string().uuid("Invalid clip ID format");

/**
 * Validate topic ID format
 */
export const topicIdSchema = z.string().uuid("Invalid topic ID format");

/**
 * Rate limiting helper - simple in-memory store (use Redis in production)
 */
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

/**
 * Check if an action should be rate limited
 * @param key Unique identifier for the rate limit (e.g., deviceId:action)
 * @param maxRequests Maximum requests allowed
 * @param windowMs Time window in milliseconds
 * @returns true if rate limit exceeded, false otherwise
 */
export function checkRateLimit(
  key: string,
  maxRequests: number = 10,
  windowMs: number = 60000 // 1 minute default
): boolean {
  const now = Date.now();
  const record = rateLimitStore.get(key);

  if (!record || now > record.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  if (record.count >= maxRequests) {
    return true; // Rate limit exceeded
  }

  record.count++;
  return false;
}

/**
 * Clean up expired rate limit records
 */
export function cleanupRateLimitStore(): void {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    if (now > record.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}

// Clean up expired records every 5 minutes
if (typeof window !== "undefined") {
  setInterval(cleanupRateLimitStore, 5 * 60 * 1000);
}

/**
 * Allowed audio file extensions
 */
const ALLOWED_AUDIO_EXTENSIONS = [".webm", ".mp3", ".wav", ".ogg", ".m4a", ".aac"];

/**
 * Validate file upload with comprehensive checks
 */
export function validateFileUpload(
  file: File,
  maxSizeBytes: number = 10 * 1024 * 1024, // 10MB default
  allowedTypes: string[] = ["audio/webm", "audio/mp3", "audio/wav", "audio/ogg", "audio/m4a", "audio/aac"]
): { valid: boolean; error?: string } {
  // Check file size
  if (file.size === 0) {
    return { valid: false, error: "File is empty" };
  }

  if (file.size > maxSizeBytes) {
    return { valid: false, error: `File size exceeds ${maxSizeBytes / 1024 / 1024}MB limit` };
  }

  // Check MIME type
  if (!allowedTypes.includes(file.type)) {
    return { valid: false, error: `File type ${file.type} is not allowed. Allowed types: ${allowedTypes.join(", ")}` };
  }

  // Check file extension (additional security layer)
  const fileName = file.name.toLowerCase();
  const hasValidExtension = ALLOWED_AUDIO_EXTENSIONS.some(ext => fileName.endsWith(ext));
  
  if (!hasValidExtension) {
    return { valid: false, error: `File extension not allowed. Allowed extensions: ${ALLOWED_AUDIO_EXTENSIONS.join(", ")}` };
  }

  // Validate that MIME type matches extension (basic check)
  const extension = fileName.substring(fileName.lastIndexOf("."));
  const mimeTypeMatchesExtension = 
    (extension === ".webm" && file.type === "audio/webm") ||
    (extension === ".mp3" && file.type === "audio/mp3") ||
    (extension === ".wav" && file.type === "audio/wav") ||
    (extension === ".ogg" && file.type === "audio/ogg") ||
    (extension === ".m4a" && (file.type === "audio/m4a" || file.type === "audio/mp4")) ||
    (extension === ".aac" && file.type === "audio/aac");

  if (!mimeTypeMatchesExtension) {
    // Warning but not blocking - some browsers may report different MIME types
    console.warn(`MIME type ${file.type} doesn't match extension ${extension} for file ${file.name}`);
  }

  return { valid: true };
}

/**
 * Escape HTML to prevent XSS
 */
export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

