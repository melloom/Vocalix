/**
 * Shared security utilities for Supabase Edge Functions
 * Includes IP tracking, abuse detection, content quality checks, etc.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0?target=deno";

/**
 * Get IP address from request headers
 */
export function getRequestIPAddress(req: Request): string | null {
  // Try x-forwarded-for first (most common in proxies/load balancers)
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    // If x-forwarded-for contains multiple IPs (comma-separated), take the first one
    const firstIP = forwardedFor.split(",")[0].trim();
    if (firstIP) return firstIP;
  }
  
  // Fallback to x-real-ip
  const realIP = req.headers.get("x-real-ip");
  if (realIP) return realIP;
  
  // Fallback to cf-connecting-ip (Cloudflare)
  const cfIP = req.headers.get("cf-connecting-ip");
  if (cfIP) return cfIP;
  
  return null;
}

/**
 * Log IP activity for abuse detection
 */
export async function logIPActivity(
  supabase: ReturnType<typeof createClient>,
  ipAddress: string | null,
  actionType: string,
  profileId?: string | null,
  resourceId?: string | null,
  deviceId?: string | null,
  userAgent?: string | null,
  metadata?: Record<string, unknown>
): Promise<void> {
  if (!ipAddress) return;
  
  try {
    const { error } = await supabase.rpc("log_ip_activity", {
      p_ip_address: ipAddress,
      p_action_type: actionType,
      p_profile_id: profileId || null,
      p_resource_id: resourceId || null,
      p_device_id: deviceId || null,
      p_user_agent: userAgent || null,
      p_metadata: metadata || {},
    });
    
    if (error) {
      console.error("Error logging IP activity:", error);
    }
  } catch (error) {
    console.error("Error logging IP activity:", error);
  }
}

/**
 * Check if IP is blacklisted
 */
export async function isIPBlacklisted(
  supabase: ReturnType<typeof createClient>,
  ipAddress: string | null
): Promise<boolean> {
  if (!ipAddress) return false;
  
  try {
    const { data, error } = await supabase.rpc("is_ip_blacklisted", {
      p_ip_address: ipAddress,
    });
    
    if (error) {
      console.error("Error checking IP blacklist:", error);
      return false; // On error, allow the request
    }
    
    return data === true;
  } catch (error) {
    console.error("Error checking IP blacklist:", error);
    return false;
  }
}

/**
 * Check IP-based rate limit
 */
export async function checkIPRateLimit(
  supabase: ReturnType<typeof createClient>,
  ipAddress: string | null,
  actionType: string,
  maxRequests: number = 60,
  windowMinutes: number = 60
): Promise<{ allowed: boolean; remaining: number; resetAt: string | null }> {
  if (!ipAddress) {
    return { allowed: true, remaining: maxRequests, resetAt: null };
  }
  
  try {
    const { data, error } = await supabase.rpc("check_ip_rate_limit", {
      p_ip_address: ipAddress,
      p_action_type: actionType,
      p_max_requests: maxRequests,
      p_window_minutes: windowMinutes,
    });
    
    if (error) {
      console.error("Error checking IP rate limit:", error);
      return { allowed: true, remaining: maxRequests, resetAt: null };
    }
    
    if (data && data.length > 0) {
      const result = data[0];
      return {
        allowed: result.allowed,
        remaining: result.remaining || 0,
        resetAt: result.reset_at || null,
      };
    }
    
    return { allowed: true, remaining: maxRequests, resetAt: null };
  } catch (error) {
    console.error("Error checking IP rate limit:", error);
    return { allowed: true, remaining: maxRequests, resetAt: null };
  }
}

/**
 * Detect suspicious IP patterns
 */
export async function detectSuspiciousIPPattern(
  supabase: ReturnType<typeof createClient>,
  ipAddress: string | null,
  actionType: string,
  timeWindowMinutes: number = 60
): Promise<{ isSuspicious: boolean; patternType: string | null; severity: string | null }> {
  if (!ipAddress) {
    return { isSuspicious: false, patternType: null, severity: null };
  }
  
  try {
    const { data, error } = await supabase.rpc("detect_suspicious_ip_pattern", {
      p_ip_address: ipAddress,
      p_action_type: actionType,
      p_time_window_minutes: timeWindowMinutes,
    });
    
    if (error) {
      console.error("Error detecting suspicious IP pattern:", error);
      return { isSuspicious: false, patternType: null, severity: null };
    }
    
    if (data && data.length > 0) {
      const result = data[0];
      return {
        isSuspicious: result.is_suspicious || false,
        patternType: result.pattern_type || null,
        severity: result.severity || null,
      };
    }
    
    return { isSuspicious: false, patternType: null, severity: null };
  } catch (error) {
    console.error("Error detecting suspicious IP pattern:", error);
    return { isSuspicious: false, patternType: null, severity: null };
  }
}

/**
 * Check audio quality and flag low-quality content
 */
export async function checkAudioQuality(
  supabase: ReturnType<typeof createClient>,
  clipId: string,
  qualityScore: number | null,
  durationSeconds: number,
  fileSizeBytes: number | null
): Promise<{ isValid: boolean; reason: string | null; shouldReview: boolean }> {
  try {
    const { data, error } = await supabase.rpc("check_audio_quality", {
      p_clip_id: clipId,
      p_quality_score: qualityScore,
      p_duration_seconds: durationSeconds,
      p_file_size_bytes: fileSizeBytes,
    });
    
    if (error) {
      console.error("Error checking audio quality:", error);
      return { isValid: true, reason: null, shouldReview: false };
    }
    
    if (data && data.length > 0) {
      const result = data[0];
      return {
        isValid: result.is_valid || false,
        reason: result.reason || null,
        shouldReview: result.should_review || false,
      };
    }
    
    return { isValid: true, reason: null, shouldReview: false };
  } catch (error) {
    console.error("Error checking audio quality:", error);
    return { isValid: true, reason: null, shouldReview: false };
  }
}

/**
 * Flag content for review
 */
export async function flagContentForReview(
  supabase: ReturnType<typeof createClient>,
  clipId: string,
  reason: string,
  qualityScore?: number | null
): Promise<void> {
  try {
    const { error } = await supabase.rpc("flag_content_for_review", {
      p_clip_id: clipId,
      p_reason: reason,
      p_quality_score: qualityScore || null,
    });
    
    if (error) {
      console.error("Error flagging content for review:", error);
    }
  } catch (error) {
    console.error("Error flagging content for review:", error);
  }
}

/**
 * Check reputation farming
 */
export async function checkReputationFarming(
  supabase: ReturnType<typeof createClient>,
  profileId: string,
  sourceProfileId: string,
  actionType: string,
  cooldownMinutes: number = 60
): Promise<{ isFarming: boolean; reason: string | null; count: number }> {
  try {
    const { data, error } = await supabase.rpc("check_reputation_farming", {
      p_profile_id: profileId,
      p_source_profile_id: sourceProfileId,
      p_action_type: actionType,
      p_cooldown_minutes: cooldownMinutes,
    });
    
    if (error) {
      console.error("Error checking reputation farming:", error);
      return { isFarming: false, reason: null, count: 0 };
    }
    
    if (data && data.length > 0) {
      const result = data[0];
      return {
        isFarming: result.is_farming || false,
        reason: result.reason || null,
        count: result.count || 0,
      };
    }
    
    return { isFarming: false, reason: null, count: 0 };
  } catch (error) {
    console.error("Error checking reputation farming:", error);
    return { isFarming: false, reason: null, count: 0 };
  }
}

/**
 * Log reputation action
 */
export async function logReputationAction(
  supabase: ReturnType<typeof createClient>,
  profileId: string,
  actionType: string,
  sourceProfileId?: string | null,
  resourceId?: string | null,
  reputationGained: number = 0
): Promise<void> {
  try {
    const { error } = await supabase.rpc("log_reputation_action", {
      p_profile_id: profileId,
      p_action_type: actionType,
      p_source_profile_id: sourceProfileId || null,
      p_resource_id: resourceId || null,
      p_reputation_gained: reputationGained,
    });
    
    if (error) {
      console.error("Error logging reputation action:", error);
    }
  } catch (error) {
    console.error("Error logging reputation action:", error);
  }
}

/**
 * Validate email address (check if disposable)
 */
export async function validateEmailAddress(
  supabase: ReturnType<typeof createClient>,
  email: string
): Promise<{ isValid: boolean; reason: string | null }> {
  try {
    const { data, error } = await supabase.rpc("validate_email_address", {
      p_email: email,
    });
    
    if (error) {
      console.error("Error validating email:", error);
      return { isValid: true, reason: null }; // On error, allow
    }
    
    if (data && data.length > 0) {
      const result = data[0];
      return {
        isValid: result.is_valid || false,
        reason: result.reason || null,
      };
    }
    
    return { isValid: true, reason: null };
  } catch (error) {
    console.error("Error validating email:", error);
    return { isValid: true, reason: null };
  }
}

/**
 * Check digest request rate limit
 */
export async function checkDigestRequestRateLimit(
  supabase: ReturnType<typeof createClient>,
  email: string,
  ipAddress: string | null,
  maxPerEmailPerDay: number = 3,
  maxPerIPPerDay: number = 10
): Promise<{ allowed: boolean; reason: string | null; retryAfter: string | null }> {
  try {
    const { data, error } = await supabase.rpc("check_digest_request_rate_limit", {
      p_email: email,
      p_ip_address: ipAddress,
      p_max_per_email_per_day: maxPerEmailPerDay,
      p_max_per_ip_per_day: maxPerIPPerDay,
    });
    
    if (error) {
      console.error("Error checking digest rate limit:", error);
      return { allowed: true, reason: null, retryAfter: null };
    }
    
    if (data && data.length > 0) {
      const result = data[0];
      return {
        allowed: result.allowed || false,
        reason: result.reason || null,
        retryAfter: result.retry_after || null,
      };
    }
    
    return { allowed: true, reason: null, retryAfter: null };
  } catch (error) {
    console.error("Error checking digest rate limit:", error);
    return { allowed: true, reason: null, retryAfter: null };
  }
}

/**
 * Log digest request
 */
export async function logDigestRequest(
  supabase: ReturnType<typeof createClient>,
  profileId: string,
  email: string,
  ipAddress?: string | null
): Promise<void> {
  try {
    const { error } = await supabase.rpc("log_digest_request", {
      p_profile_id: profileId,
      p_email: email,
      p_ip_address: ipAddress || null,
    });
    
    if (error) {
      console.error("Error logging digest request:", error);
    }
  } catch (error) {
    console.error("Error logging digest request:", error);
  }
}

/**
 * Detect VPN/proxy usage based on IP address
 * This is a basic heuristic - in production, use a proper IP geolocation service
 */
export async function detectVPNProxy(
  supabase: ReturnType<typeof createClient>,
  ipAddress: string | null
): Promise<{ isVPN: boolean; isProxy: boolean; confidence: string }> {
  if (!ipAddress) {
    return { isVPN: false, isProxy: false, confidence: "unknown" };
  }
  
  try {
    // Check if IP is in known VPN/proxy ranges
    // This is a simplified check - in production, use a service like MaxMind, IPinfo, etc.
    // For now, we'll check suspicious patterns:
    // - Private IP ranges (shouldn't appear in production)
    // - Known VPN/proxy patterns (can be enhanced with external API)
    
    // Check if IP is private/local (suspicious in production)
    const isPrivateIP = /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.)/.test(ipAddress);
    
    if (isPrivateIP) {
      return { isVPN: false, isProxy: true, confidence: "high" };
    }
    
    // In production, you would:
    // 1. Query an IP geolocation service (MaxMind, IPinfo, etc.)
    // 2. Check against known VPN/proxy databases
    // 3. Analyze ASN information
    
    // For now, return false (no VPN/proxy detected)
    // This can be enhanced with actual VPN/proxy detection service
    return { isVPN: false, isProxy: false, confidence: "low" };
  } catch (error) {
    console.error("Error detecting VPN/proxy:", error);
    return { isVPN: false, isProxy: false, confidence: "unknown" };
  }
}

/**
 * Check reputation cooldown - prevent rapid reputation gain from same source
 */
export async function checkReputationCooldown(
  supabase: ReturnType<typeof createClient>,
  profileId: string,
  sourceProfileId: string,
  actionType: string,
  cooldownMinutes: number = 5
): Promise<{ allowed: boolean; reason: string | null; retryAfter: number | null }> {
  try {
    const { data, error } = await supabase.rpc("check_reputation_farming", {
      p_profile_id: profileId,
      p_source_profile_id: sourceProfileId,
      p_action_type: actionType,
      p_cooldown_minutes: cooldownMinutes,
    });
    
    if (error) {
      console.error("Error checking reputation cooldown:", error);
      return { allowed: true, reason: null, retryAfter: null };
    }
    
    if (data && data.length > 0) {
      const result = data[0];
      if (result.is_farming) {
        // Calculate retry after time
        const retryAfter = Math.ceil(cooldownMinutes * 60); // Convert to seconds
        return {
          allowed: false,
          reason: result.reason || "Reputation cooldown active",
          retryAfter,
        };
      }
    }
    
    return { allowed: true, reason: null, retryAfter: null };
  } catch (error) {
    console.error("Error checking reputation cooldown:", error);
    return { allowed: true, reason: null, retryAfter: null };
  }
}

