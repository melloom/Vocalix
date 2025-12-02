/**
 * Shared rate limiting utility for Supabase Edge Functions
 * Uses Supabase database for persistent rate limiting across function invocations
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0?target=deno";

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  identifier: string; // e.g., "deviceId", "profileId", "ip"
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

/**
 * Check rate limit using Supabase database
 * Creates a rate_limit_logs table if it doesn't exist
 */
export async function checkRateLimit(
  supabase: ReturnType<typeof createClient>,
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = now - config.windowMs;

  try {
    // Clean up old entries (older than the current window)
    await supabase
      .from("rate_limit_logs")
      .delete()
      .lt("created_at", new Date(windowStart).toISOString());

    // Count requests in the current window
    const { count, error: countError } = await supabase
      .from("rate_limit_logs")
      .select("*", { count: "exact", head: true })
      .eq("key", key)
      .gte("created_at", new Date(windowStart).toISOString());

    if (countError) {
      console.error("Rate limit check error:", countError);
      // On error, allow the request but log it
      return {
        allowed: true,
        remaining: config.maxRequests,
        resetAt: now + config.windowMs,
      };
    }

    const currentCount = count ?? 0;
    const remaining = Math.max(0, config.maxRequests - currentCount);
    const allowed = currentCount < config.maxRequests;
    const resetAt = now + config.windowMs;

    if (allowed) {
      // Log this request
      await supabase.from("rate_limit_logs").insert({
        key,
        identifier: config.identifier,
        created_at: new Date(now).toISOString(),
      });
    }

    return {
      allowed,
      remaining,
      resetAt,
      retryAfter: allowed ? undefined : Math.ceil((resetAt - now) / 1000),
    };
  } catch (error) {
    console.error("Rate limit error:", error);
    // On error, allow the request
    return {
      allowed: true,
      remaining: config.maxRequests,
      resetAt: now + config.windowMs,
    };
  }
}

/**
 * Get rate limit key from request
 */
export function getRateLimitKey(
  identifier: string,
  action: string,
  value: string | null
): string {
  if (!value) {
    return `anonymous:${action}:${Date.now()}`;
  }
  return `${identifier}:${action}:${value}`;
}

/**
 * Create rate limit response headers
 */
export function createRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": result.remaining.toString(),
    "X-RateLimit-Remaining": result.remaining.toString(),
    "X-RateLimit-Reset": new Date(result.resetAt).toISOString(),
    ...(result.retryAfter && { "Retry-After": result.retryAfter.toString() }),
  };
}

