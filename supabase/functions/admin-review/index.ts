import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0?target=deno";
import { createErrorResponse, logErrorSafely } from "../_shared/error-handler.ts";
import { initializeMonitoring, captureException, extractRequestContext, trackSecurityIncident } from "../_shared/monitoring.ts";
import { parseApiVersion, createVersionHeaders } from "../_shared/api-versioning.ts";

// Initialize monitoring
initializeMonitoring("admin-review");

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase configuration for admin-review.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Generate CORS headers dynamically based on request origin
// When Access-Control-Allow-Credentials is true, we cannot use "*" - must use specific origin
const getCorsHeaders = (req: Request): Record<string, string> => {
  const origin = req.headers.get("origin");
  
  // Get allowed origins from environment
  const envOrigins = Deno.env.get("ALLOWED_ORIGINS");
  const envOrigin = Deno.env.get("ORIGIN");
  
  let allowOrigin = "*";
  
  // If we have a specific origin from the request
  if (origin) {
    // Check if it's in the allowed list
    if (envOrigins) {
      const allowedList = envOrigins.split(",").map(o => o.trim());
      if (allowedList.includes(origin)) {
        allowOrigin = origin;
      }
    }
    
    // For development: allow localhost origins (common dev ports)
    if (allowOrigin === "*" && (origin.includes("localhost") || origin.includes("127.0.0.1"))) {
      allowOrigin = origin;
    }
    
    // If still "*" and we have a single ORIGIN env var, use it
    if (allowOrigin === "*" && envOrigin) {
      allowOrigin = envOrigin;
    }
  } else if (envOrigin) {
    // No origin header, use env var
    allowOrigin = envOrigin;
  }
  
  // If still "*", we need a fallback (use first allowed origin or request origin)
  // Since credentials are required, we can't use "*"
  if (allowOrigin === "*" && origin) {
    allowOrigin = origin; // Use the request origin as fallback
  }
  
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-device-id, x-api-version",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Credentials": "true",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
};

const getAdminProfileId = async (deviceId: string | null) => {
  if (!deviceId) return null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("device_id", deviceId)
    .single();

  if (profileError || !profile) return null;

  const { data: admin } = await supabase
    .from("admins")
    .select("profile_id")
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (!admin) return null;
  return profile.id as string;
};

/**
 * Log admin action to security audit log
 */
const logAdminAction = async (
  adminProfileId: string,
  deviceId: string | null,
  action: string,
  details: Record<string, unknown>,
  req: Request
) => {
  try {
    const ipAddress = req.headers.get("x-forwarded-for") || 
                     req.headers.get("x-real-ip") || 
                     null;
    const userAgent = req.headers.get("user-agent") || null;

    await supabase.rpc("log_security_event", {
      p_device_id: deviceId || "unknown",
      p_event_type: `admin_${action}`,
      p_profile_id: adminProfileId,
      p_event_details: details,
      p_ip_address: ipAddress,
      p_user_agent: userAgent,
      p_severity: "info",
    });
  } catch (error) {
    // Don't fail the request if logging fails
    console.error("Failed to log admin action:", error);
  }
};

const fetchModerationQueues = async (
  sortBy: string = "priority",
  filters?: {
    riskLevel?: string; // 'low', 'medium', 'high', 'critical'
    source?: string; // 'ai', 'community'
    type?: string; // 'clip', 'profile'
    reason?: string;
    workflowState?: string; // 'pending', 'in_review', 'resolved', 'actioned'
    assignedTo?: string; // profile_id
    search?: string;
  }
) => {
  // Auto-escalate old items first (this will trigger notifications via triggers)
  await supabase.rpc("auto_escalate_old_moderation_items");

  // Fetch flags with enhanced filtering
  let flagsQuery = supabase
    .from("moderation_flags")
    .select(
      `
      id,
      reasons,
      risk,
      source,
      status,
      workflow_state,
      assigned_to,
      assigned_to_profile:profiles!moderation_flags_assigned_to_fkey (
        id,
        handle,
        emoji_avatar
      ),
      moderation_notes,
      priority,
      reviewed_at,
      reviewed_by,
      created_at,
      clips (
        *,
        profiles (
          handle,
          emoji_avatar
        )
      )
    `,
    );

  // Apply workflow state filter (default to pending/in_review)
  if (filters?.workflowState) {
    flagsQuery = flagsQuery.eq("workflow_state", filters.workflowState);
  } else {
    flagsQuery = flagsQuery.in("workflow_state", ["pending", "in_review"]);
  }

  // Apply source filter
  if (filters?.source) {
    flagsQuery = flagsQuery.eq("source", filters.source);
  }

  // Apply risk level filter
  if (filters?.riskLevel) {
    if (filters.riskLevel === "low") {
      flagsQuery = flagsQuery.lt("risk", 3);
    } else if (filters.riskLevel === "medium") {
      flagsQuery = flagsQuery.gte("risk", 3).lt("risk", 7);
    } else if (filters.riskLevel === "high") {
      flagsQuery = flagsQuery.gte("risk", 7).lt("risk", 9);
    } else if (filters.riskLevel === "critical") {
      flagsQuery = flagsQuery.gte("risk", 9);
    }
  }

  // Apply reason filter (search in reasons array)
  if (filters?.reason) {
    flagsQuery = flagsQuery.contains("reasons", [filters.reason]);
  }

  // Apply assignment filter
  if (filters?.assignedTo) {
    if (filters.assignedTo === "unassigned") {
      flagsQuery = flagsQuery.is("assigned_to", null);
    } else {
      flagsQuery = flagsQuery.eq("assigned_to", filters.assignedTo);
    }
  }

  // Apply search filter (search in clip titles, captions, or reasons)
  if (filters?.search) {
    const searchTerm = filters.search.toLowerCase();
    // We'll filter in memory for now since we need to search nested fields
    // In production, you might want to use full-text search
  }

  // Apply sorting
  if (sortBy === "priority") {
    flagsQuery = flagsQuery.order("priority", { ascending: false }).order("created_at", { ascending: true });
  } else if (sortBy === "newest") {
    flagsQuery = flagsQuery.order("created_at", { ascending: false });
  } else if (sortBy === "oldest") {
    flagsQuery = flagsQuery.order("created_at", { ascending: true });
  } else {
    flagsQuery = flagsQuery.order("priority", { ascending: false }).order("created_at", { ascending: true });
  }

  const { data: flags, error: flagsError } = await flagsQuery;

  if (flagsError) {
    throw flagsError;
  }

  // Apply search filter in memory if needed
  let filteredFlags = flags || [];
  if (filters?.search && flags) {
    const searchTerm = filters.search.toLowerCase();
    filteredFlags = flags.filter((flag: any) => {
      const clip = flag.clips;
      if (!clip) return false;
      const title = (clip.title || "").toLowerCase();
      const captions = (clip.captions || "").toLowerCase();
      const reasons = (flag.reasons || []).join(" ").toLowerCase();
      return title.includes(searchTerm) || captions.includes(searchTerm) || reasons.includes(searchTerm);
    });
  }

  // Fetch reports with enhanced filtering
  let reportsQuery = supabase
    .from("reports")
    .select(
      `
      id,
      reason,
      details,
      status,
      workflow_state,
      assigned_to,
      assigned_to_profile:profiles!reports_assigned_to_fkey (
        id,
        handle,
        emoji_avatar
      ),
      moderation_notes,
      priority,
      reviewed_at,
      reviewed_by,
      created_at,
      clip_id,
      profile_id,
      clip:clips (
        *,
        profiles (
          handle,
          emoji_avatar
        )
      ),
      profile:profiles!reports_profile_id_fkey (
        id,
        handle,
        emoji_avatar
      ),
      reporter:profiles!reports_reporter_profile_id_fkey (
        handle,
        emoji_avatar
      )
    `,
    );

  // Apply workflow state filter (default to pending/in_review)
  if (filters?.workflowState) {
    reportsQuery = reportsQuery.eq("workflow_state", filters.workflowState);
  } else {
    reportsQuery = reportsQuery.in("workflow_state", ["pending", "in_review"]);
  }

  // Apply type filter
  if (filters?.type) {
    if (filters.type === "clip") {
      reportsQuery = reportsQuery.not("clip_id", "is", null);
    } else if (filters.type === "profile") {
      reportsQuery = reportsQuery.not("profile_id", "is", null);
    }
  }

  // Apply reason filter
  if (filters?.reason) {
    reportsQuery = reportsQuery.eq("reason", filters.reason);
  }

  // Apply assignment filter
  if (filters?.assignedTo) {
    if (filters.assignedTo === "unassigned") {
      reportsQuery = reportsQuery.is("assigned_to", null);
    } else {
      reportsQuery = reportsQuery.eq("assigned_to", filters.assignedTo);
    }
  }

  // Apply sorting
  if (sortBy === "priority") {
    reportsQuery = reportsQuery.order("priority", { ascending: false }).order("created_at", { ascending: true });
  } else if (sortBy === "newest") {
    reportsQuery = reportsQuery.order("created_at", { ascending: false });
  } else if (sortBy === "oldest") {
    reportsQuery = reportsQuery.order("created_at", { ascending: true });
  } else {
    reportsQuery = reportsQuery.order("priority", { ascending: false }).order("created_at", { ascending: true });
  }

  const { data: reports, error: reportsError } = await reportsQuery;

  if (reportsError) {
    throw reportsError;
  }

  // Apply search filter in memory if needed
  let filteredReports = reports || [];
  if (filters?.search && reports) {
    const searchTerm = filters.search.toLowerCase();
    filteredReports = reports.filter((report: any) => {
      const reason = (report.reason || "").toLowerCase();
      const details = (report.details || "").toLowerCase();
      const clip = report.clip;
      const profile = report.profile;
      const clipTitle = clip?.title?.toLowerCase() || "";
      const clipCaptions = clip?.captions?.toLowerCase() || "";
      const profileHandle = profile?.handle?.toLowerCase() || "";
      return (
        reason.includes(searchTerm) ||
        details.includes(searchTerm) ||
        clipTitle.includes(searchTerm) ||
        clipCaptions.includes(searchTerm) ||
        profileHandle.includes(searchTerm)
      );
    });
  }

  return { flags: filteredFlags, reports: filteredReports };
};

const fetchAbuseMetrics = async () => {
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Get security audit log metrics
  const { data: recentEvents, error: eventsError } = await supabase
    .from("security_audit_log")
    .select("severity, event_type, created_at")
    .gte("created_at", last7d.toISOString());

  if (eventsError) {
    console.error("Error fetching security events:", eventsError);
  }

  // Get ban statistics
  const { data: banStats, error: banError } = await supabase
    .from("profiles")
    .select("is_banned, banned_at, ban_count")
    .eq("is_banned", true);

  if (banError) {
    console.error("Error fetching ban stats:", banError);
  }

  // Get suspicious devices
  const { data: suspiciousDevices, error: devicesError } = await supabase
    .from("devices")
    .select("is_suspicious, is_revoked")
    .or("is_suspicious.eq.true,is_revoked.eq.true");

  if (devicesError) {
    console.error("Error fetching suspicious devices:", devicesError);
  }

  // Calculate metrics
  const criticalEvents24h = recentEvents?.filter(
    (e) => e.severity === "critical" && new Date(e.created_at) >= last24h
  ).length || 0;

  const errorEvents24h = recentEvents?.filter(
    (e) => e.severity === "error" && new Date(e.created_at) >= last24h
  ).length || 0;

  const totalBanned = banStats?.length || 0;
  const recentlyBanned = banStats?.filter(
    (b) => b.banned_at && new Date(b.banned_at) >= last24h
  ).length || 0;

  const suspiciousCount = suspiciousDevices?.filter((d) => d.is_suspicious).length || 0;
  const revokedCount = suspiciousDevices?.filter((d) => d.is_revoked).length || 0;

  // Get moderation queue counts
  const { data: pendingFlags } = await supabase
    .from("moderation_flags")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  const { data: openReports } = await supabase
    .from("reports")
    .select("id", { count: "exact", head: true })
    .eq("status", "open");

  // ===== ABUSE PATTERN MONITORING =====
  
  // Get suspicious IP patterns (last 7 days)
  const { data: suspiciousIPs, error: ipError } = await supabase
    .from("suspicious_ip_patterns")
    .select("ip_address, pattern_type, severity, count, last_seen_at")
    .gte("last_seen_at", last7d.toISOString())
    .order("last_seen_at", { ascending: false })
    .limit(50);

  if (ipError) {
    console.error("Error fetching suspicious IPs:", ipError);
  }

  // Get IP activity logs for pattern analysis (last 24h)
  const { data: ipActivity, error: activityError } = await supabase
    .from("ip_activity_logs")
    .select("action_type, created_at")
    .gte("created_at", last24h.toISOString());

  if (activityError) {
    console.error("Error fetching IP activity:", activityError);
  }

  // Analyze action types from IP activity
  const actionTypeCounts: Record<string, number> = {};
  ipActivity?.forEach((log) => {
    actionTypeCounts[log.action_type] = (actionTypeCounts[log.action_type] || 0) + 1;
  });

  // Get account creation patterns (last 7 days)
  const { data: accountCreations, error: accountError } = await supabase
    .from("ip_activity_logs")
    .select("ip_address, profile_id, created_at")
    .eq("action_type", "account_creation")
    .gte("created_at", last7d.toISOString());

  if (accountError) {
    console.error("Error fetching account creations:", accountError);
  }

  // Count accounts per IP
  const accountsPerIP: Record<string, number> = {};
  accountCreations?.forEach((log) => {
    if (log.ip_address) {
      accountsPerIP[log.ip_address] = (accountsPerIP[log.ip_address] || 0) + 1;
    }
  });

  // Get top IPs by account creation (potential multi-account abuse)
  const topAccountCreationIPs = Object.entries(accountsPerIP)
    .map(([ip, count]) => ({ ip, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Get clip upload patterns (last 24h)
  const { data: clipUploads, error: uploadError } = await supabase
    .from("ip_activity_logs")
    .select("ip_address, profile_id, created_at")
    .eq("action_type", "clip_upload")
    .gte("created_at", last24h.toISOString());

  if (uploadError) {
    console.error("Error fetching clip uploads:", uploadError);
  }

  // Count uploads per profile/IP
  const uploadsPerProfile: Record<string, number> = {};
  const uploadsPerIP: Record<string, number> = {};
  clipUploads?.forEach((log) => {
    if (log.profile_id) {
      uploadsPerProfile[log.profile_id] = (uploadsPerProfile[log.profile_id] || 0) + 1;
    }
    if (log.ip_address) {
      uploadsPerIP[log.ip_address] = (uploadsPerIP[log.ip_address] || 0) + 1;
    }
  });

  // Get top uploaders (potential spam)
  const topUploaders = Object.entries(uploadsPerProfile)
    .map(([profileId, count]) => ({ profileId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Get reaction patterns (last 24h)
  const { data: reactions, error: reactionError } = await supabase
    .from("ip_activity_logs")
    .select("ip_address, profile_id, created_at")
    .in("action_type", ["reaction", "voice_reaction"])
    .gte("created_at", last24h.toISOString());

  if (reactionError) {
    console.error("Error fetching reactions:", reactionError);
  }

  // Count reactions per profile
  const reactionsPerProfile: Record<string, number> = {};
  reactions?.forEach((log) => {
    if (log.profile_id) {
      reactionsPerProfile[log.profile_id] = (reactionsPerProfile[log.profile_id] || 0) + 1;
    }
  });

  // Get top reactors (potential spam)
  const topReactors = Object.entries(reactionsPerProfile)
    .map(([profileId, count]) => ({ profileId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Get rate limit violations from security audit log
  const rateLimitViolations = recentEvents?.filter(
    (e) => e.event_type?.includes("rate_limit") || e.event_type?.includes("rate_limit_exceeded")
  ) || [];

  // Group rate limit violations by action type
  const rateLimitByAction: Record<string, number> = {};
  rateLimitViolations.forEach((violation) => {
    const actionType = violation.event_type?.split("_")[0] || "unknown";
    rateLimitByAction[actionType] = (rateLimitByAction[actionType] || 0) + 1;
  });

  // Get IP blacklist count
  const { data: blacklistedIPs, error: blacklistError } = await supabase
    .from("ip_blacklist")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);

  if (blacklistError) {
    console.error("Error fetching blacklisted IPs:", blacklistError);
  }

  // Get time-series data for trends (last 7 days, hourly buckets)
  const hourlyTrends: Record<string, Record<string, number>> = {};
  for (let i = 0; i < 7 * 24; i++) {
    const hourStart = new Date(now.getTime() - (i + 1) * 60 * 60 * 1000);
    const hourEnd = new Date(now.getTime() - i * 60 * 60 * 1000);
    const hourKey = hourStart.toISOString().slice(0, 13) + ":00:00Z";
    
    hourlyTrends[hourKey] = {
      events: recentEvents?.filter(
        (e) => new Date(e.created_at) >= hourStart && new Date(e.created_at) < hourEnd
      ).length || 0,
      uploads: clipUploads?.filter(
        (u) => new Date(u.created_at) >= hourStart && new Date(u.created_at) < hourEnd
      ).length || 0,
      reactions: reactions?.filter(
        (r) => new Date(r.created_at) >= hourStart && new Date(r.created_at) < hourEnd
      ).length || 0,
    };
  }

  return {
    security: {
      criticalEvents24h,
      errorEvents24h,
      totalBanned,
      recentlyBanned,
      suspiciousDevices: suspiciousCount,
      revokedDevices: revokedCount,
      blacklistedIPs: blacklistedIPs?.length || 0,
    },
    moderation: {
      pendingFlags: pendingFlags?.length || 0,
      openReports: openReports?.length || 0,
    },
    abusePatterns: {
      suspiciousIPs: suspiciousIPs || [],
      topAccountCreationIPs,
      topUploaders,
      topReactors,
      actionTypeCounts,
      rateLimitViolations: rateLimitViolations.length,
      rateLimitByAction,
      hourlyTrends,
      totalIPActivity24h: ipActivity?.length || 0,
    },
  };
};

serve(async (req) => {
  const requestContext = extractRequestContext(req);
  const apiVersion = parseApiVersion(req);
  const corsHeaders = getCorsHeaders(req);
  
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { 
        status: 405,
        headers: {
          ...corsHeaders,
          ...createVersionHeaders(apiVersion),
        },
      });
    }

    const deviceId = req.headers.get("x-device-id");
    const adminProfileId = await getAdminProfileId(deviceId);

    if (!adminProfileId) {
      // Track security incident for unauthorized admin access attempt
      await trackSecurityIncident(
        "unauthorized_admin_access_attempt",
        "high",
        {
          deviceId,
          endpoint: "admin-review",
        },
        requestContext
      );
      
      return new Response(
        JSON.stringify({ error: "Admin access required" }), 
        { 
          status: 403,
          headers: {
            ...corsHeaders,
            ...createVersionHeaders(apiVersion),
            "content-type": "application/json",
          },
        }
      );
    }

    const body = await req.json();
    const action = body?.action as string;

    if (!action) {
      return new Response(
        JSON.stringify({ error: "Action is required" }), 
        { 
          status: 400,
          headers: {
            ...corsHeaders,
            ...createVersionHeaders(apiVersion),
            "content-type": "application/json",
          },
        }
      );
    }

    if (action === "list") {
      const sortBy = body?.sortBy || "priority";
      const filters = body?.filters || {};
      const { flags, reports } = await fetchModerationQueues(sortBy, filters);
      
      // Handle different API versions if needed
      if (apiVersion === "2.0.0") {
        // Example: v2.0.0 might return additional fields
        return new Response(JSON.stringify({ 
          flags, 
          reports,
          version: "2.0.0",
        }), {
          headers: {
            ...corsHeaders,
            ...createVersionHeaders(apiVersion),
            "content-type": "application/json",
          },
        });
      }
      
      return new Response(JSON.stringify({ flags, reports }), {
        headers: {
          ...corsHeaders,
          ...createVersionHeaders(apiVersion),
          "content-type": "application/json",
        },
      });
    }

    if (action === "getMetrics") {
      const metrics = await fetchAbuseMetrics();
      
      return new Response(JSON.stringify(metrics), {
        headers: {
          ...corsHeaders,
          ...createVersionHeaders(apiVersion),
          "content-type": "application/json",
        },
      });
    }

    if (action === "getAllUsers") {
      const { limit = 50, offset = 0, search = "", filterBanned = false } = body;

      let usersQuery = supabase
        .from("profiles")
        .select(
          `
          id,
          handle,
          emoji_avatar,
          city,
          consent_city,
          joined_at,
          is_banned,
          banned_at,
          banned_until,
          ban_count,
          created_at
        `
        )
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (search) {
        usersQuery = usersQuery.ilike("handle", `%${search}%`);
      }

      if (filterBanned) {
        usersQuery = usersQuery.eq("is_banned", true);
      }

      const { data: users, error: usersError } = await usersQuery;

      if (usersError) throw usersError;

      // Get user stats for each user
      const userIds = users?.map((u) => u.id) || [];
      
      // Get clips count per user
      const { data: clipsData } = await supabase
        .from("clips")
        .select("profile_id")
        .in("profile_id", userIds);

      const clipsCountByUser: Record<string, number> = {};
      clipsData?.forEach((clip) => {
        clipsCountByUser[clip.profile_id] = (clipsCountByUser[clip.profile_id] || 0) + 1;
      });

      // Get reports made count per user
      const { data: reportsMadeData } = await supabase
        .from("reports")
        .select("reporter_profile_id")
        .in("reporter_profile_id", userIds);

      const reportsMadeByUser: Record<string, number> = {};
      reportsMadeData?.forEach((report) => {
        if (report.reporter_profile_id) {
          reportsMadeByUser[report.reporter_profile_id] = (reportsMadeByUser[report.reporter_profile_id] || 0) + 1;
        }
      });

      // Get reports against count per user
      const { data: reportsAgainstData } = await supabase
        .from("reports")
        .select("profile_id")
        .in("profile_id", userIds);

      const reportsAgainstByUser: Record<string, number> = {};
      reportsAgainstData?.forEach((report) => {
        if (report.profile_id) {
          reportsAgainstByUser[report.profile_id] = (reportsAgainstByUser[report.profile_id] || 0) + 1;
        }
      });

      // Get device counts and IP addresses per user
      const { data: devicesData } = await supabase
        .from("devices")
        .select("profile_id, is_suspicious, is_revoked, ip_address")
        .in("profile_id", userIds);

      const devicesCountByUser: Record<string, number> = {};
      const suspiciousDevicesByUser: Record<string, number> = {};
      const ipAddressesByUser: Record<string, string[]> = {};
      
      devicesData?.forEach((device) => {
        if (device.profile_id) {
          devicesCountByUser[device.profile_id] = (devicesCountByUser[device.profile_id] || 0) + 1;
          if (device.is_suspicious) {
            suspiciousDevicesByUser[device.profile_id] = (suspiciousDevicesByUser[device.profile_id] || 0) + 1;
          }
          if (device.ip_address) {
            if (!ipAddressesByUser[device.profile_id]) {
              ipAddressesByUser[device.profile_id] = [];
            }
            if (!ipAddressesByUser[device.profile_id].includes(device.ip_address)) {
              ipAddressesByUser[device.profile_id].push(device.ip_address);
            }
          }
        }
      });

      // Check which IPs are blacklisted
      const allIPs = Array.from(new Set(Object.values(ipAddressesByUser).flat()));
      const blacklistedIPsSet = new Set<string>();
      
      for (const ip of allIPs) {
        const { data: isBlacklisted } = await supabase.rpc("is_ip_blacklisted", {
          p_ip_address: ip,
        });
        if (isBlacklisted) {
          blacklistedIPsSet.add(ip);
        }
      }

      // Enrich users with statistics and IP addresses
      const usersWithStats = users?.map((user) => ({
        ...user,
        statistics: {
          clipsCount: clipsCountByUser[user.id] || 0,
          reportsMadeCount: reportsMadeByUser[user.id] || 0,
          reportsAgainstCount: reportsAgainstByUser[user.id] || 0,
          devicesCount: devicesCountByUser[user.id] || 0,
          suspiciousDevicesCount: suspiciousDevicesByUser[user.id] || 0,
        },
        ipAddresses: ipAddressesByUser[user.id] || [],
        blacklistedIPs: (ipAddressesByUser[user.id] || []).filter(ip => blacklistedIPsSet.has(ip)),
      })) || [];

      // Get total count
      let countQuery = supabase
        .from("profiles")
        .select("id", { count: "exact", head: true });

      if (search) {
        countQuery = countQuery.ilike("handle", `%${search}%`);
      }

      if (filterBanned) {
        countQuery = countQuery.eq("is_banned", true);
      }

      const { count: totalCount } = await countQuery;

      return new Response(
        JSON.stringify({
          users: usersWithStats,
          totalCount: totalCount || 0,
          limit,
          offset,
        }),
        {
          headers: {
            ...corsHeaders,
            ...createVersionHeaders(apiVersion),
            "content-type": "application/json",
          },
        }
      );
    }

    if (action === "getUserDetails") {
      const { profileId } = body;

      if (!profileId) {
        return new Response(JSON.stringify({ error: "profileId is required" }), {
          status: 400,
          headers: {
            ...corsHeaders,
            ...createVersionHeaders(apiVersion),
            "content-type": "application/json",
          },
        });
      }

      // Get user profile
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", profileId)
        .single();

      if (profileError) throw profileError;

      // Get user clips
      const { data: clips, error: clipsError } = await supabase
        .from("clips")
        .select("*")
        .eq("profile_id", profileId)
        .order("created_at", { ascending: false })
        .limit(100);

      if (clipsError) throw clipsError;

      // Get user reports
      const { data: reports, error: reportsError } = await supabase
        .from("reports")
        .select("*")
        .eq("reporter_profile_id", profileId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (reportsError) throw reportsError;

      // Get security audit logs
      const { data: auditLogs, error: auditError } = await supabase
        .from("security_audit_log")
        .select("*")
        .eq("profile_id", profileId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (auditError) throw auditError;

      // Get ban history
      const { data: banHistory, error: banError } = await supabase
        .from("ban_history")
        .select("*")
        .eq("profile_id", profileId)
        .order("banned_at", { ascending: false });

      if (banError) throw banError;

      // Get user statistics
      const { count: clipsCount } = await supabase
        .from("clips")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", profileId);

      const { count: reportsMadeCount } = await supabase
        .from("reports")
        .select("id", { count: "exact", head: true })
        .eq("reporter_profile_id", profileId);

      const { count: reportsAgainstCount } = await supabase
        .from("reports")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", profileId);

      // Get device info with IP addresses
      const { data: devices } = await supabase
        .from("devices")
        .select("id, device_id, is_suspicious, is_revoked, created_at, ip_address, user_agent, last_seen_at")
        .eq("profile_id", profileId);

      // Get unique IP addresses from devices
      const ipAddresses = devices?.filter(d => d.ip_address).map(d => d.ip_address) || [];
      const uniqueIPs = Array.from(new Set(ipAddresses));

      // Check which IPs are blacklisted
      const blacklistedIPs: string[] = [];
      for (const ip of uniqueIPs) {
        const { data: isBlacklisted } = await supabase.rpc("is_ip_blacklisted", {
          p_ip_address: ip,
        });
        if (isBlacklisted) {
          blacklistedIPs.push(ip);
        }
      }

      // Get IP blacklist entries for this user's IPs
      const { data: ipBlacklistEntries } = await supabase
        .from("ip_blacklist")
        .select("ip_address, reason, banned_at, expires_at, is_active")
        .in("ip_address", uniqueIPs);

      return new Response(
        JSON.stringify({
          profile,
          clips: clips || [],
          reports: reports || [],
          auditLogs: auditLogs || [],
          banHistory: banHistory || [],
          statistics: {
            clipsCount: clipsCount || 0,
            reportsMadeCount: reportsMadeCount || 0,
            reportsAgainstCount: reportsAgainstCount || 0,
            devicesCount: devices?.length || 0,
            suspiciousDevices: devices?.filter(d => d.is_suspicious).length || 0,
            revokedDevices: devices?.filter(d => d.is_revoked).length || 0,
          },
          devices: devices || [],
          ipAddresses: uniqueIPs,
          blacklistedIPs,
          ipBlacklistEntries: ipBlacklistEntries || [],
        }),
        {
          headers: {
            ...corsHeaders,
            ...createVersionHeaders(apiVersion),
            "content-type": "application/json",
          },
        }
      );
    }

    if (action === "updateUser") {
      const { profileId, updates } = body;

      if (!profileId || !updates) {
        return new Response(JSON.stringify({ error: "profileId and updates are required" }), {
          status: 400,
          headers: {
            ...corsHeaders,
            ...createVersionHeaders(apiVersion),
            "content-type": "application/json",
          },
        });
      }

      // Prevent updating admin status through this endpoint
      const allowedFields = ["handle", "emoji_avatar", "city", "consent_city", "is_banned", "banned_at", "banned_until"];
      const filteredUpdates: Record<string, unknown> = {};
      
      for (const key of allowedFields) {
        if (key in updates) {
          filteredUpdates[key] = updates[key];
        }
      }

      const { data: profile, error: updateError } = await supabase
        .from("profiles")
        .update(filteredUpdates)
        .eq("id", profileId)
        .select()
        .single();

      if (updateError) throw updateError;

      // Log admin action
      await logAdminAction(adminProfileId, deviceId, "updateUser", {
        profileId,
        updates: filteredUpdates,
      }, req);

      return new Response(JSON.stringify({ success: true, profile }), {
        headers: {
          ...corsHeaders,
          ...createVersionHeaders(apiVersion),
          "content-type": "application/json",
        },
      });
    }

    if (action === "deleteUser") {
      const { profileId, reason } = body;

      if (!profileId) {
        return new Response(JSON.stringify({ error: "profileId is required" }), {
          status: 400,
          headers: {
            ...corsHeaders,
            ...createVersionHeaders(apiVersion),
            "content-type": "application/json",
          },
        });
      }

      // Check if user is an admin - prevent deleting admins
      const { data: isAdmin } = await supabase
        .from("admins")
        .select("profile_id")
        .eq("profile_id", profileId)
        .maybeSingle();

      if (isAdmin) {
        return new Response(JSON.stringify({ error: "Cannot delete admin users" }), {
          status: 403,
          headers: {
            ...corsHeaders,
            ...createVersionHeaders(apiVersion),
            "content-type": "application/json",
          },
        });
      }

      // Delete user data (cascade should handle related records)
      // First, delete clips
      await supabase
        .from("clips")
        .delete()
        .eq("profile_id", profileId);

      // Delete reports made by user
      await supabase
        .from("reports")
        .delete()
        .eq("reporter_profile_id", profileId);

      // Delete devices
      await supabase
        .from("devices")
        .delete()
        .eq("profile_id", profileId);

      // Delete profile
      const { error: deleteError } = await supabase
        .from("profiles")
        .delete()
        .eq("id", profileId);

      if (deleteError) throw deleteError;

      // Log admin action
      await logAdminAction(adminProfileId, deviceId, "deleteUser", {
        profileId,
        reason: reason || "No reason provided",
      }, req);

      return new Response(JSON.stringify({ success: true }), {
        headers: {
          ...corsHeaders,
          ...createVersionHeaders(apiVersion),
          "content-type": "application/json",
        },
      });
    }

    if (action === "banIP") {
      const { ipAddress, reason, expiresAt } = body;

      if (!ipAddress) {
        return new Response(JSON.stringify({ error: "ipAddress is required" }), {
          status: 400,
          headers: {
            ...corsHeaders,
            ...createVersionHeaders(apiVersion),
            "content-type": "application/json",
          },
        });
      }

      // Check if IP is already blacklisted
      const { data: existing } = await supabase
        .from("ip_blacklist")
        .select("id, is_active")
        .eq("ip_address", ipAddress)
        .maybeSingle();

      if (existing) {
        // Update existing entry
        const { error: updateError } = await supabase
          .from("ip_blacklist")
          .update({
            reason: reason || existing.reason,
            expires_at: expiresAt || null,
            is_active: true,
            banned_by: adminProfileId,
            banned_at: new Date().toISOString(),
          })
          .eq("id", existing.id);

        if (updateError) throw updateError;
      } else {
        // Create new blacklist entry
        const { error: insertError } = await supabase
          .from("ip_blacklist")
          .insert({
            ip_address: ipAddress,
            reason: reason || "Banned by admin",
            expires_at: expiresAt || null,
            banned_by: adminProfileId,
            is_active: true,
          });

        if (insertError) throw insertError;
      }

      // Log admin action
      await logAdminAction(adminProfileId, deviceId, "banIP", {
        ipAddress,
        reason: reason || "Banned by admin",
        expiresAt: expiresAt || null,
      }, req);

      return new Response(JSON.stringify({ success: true }), {
        headers: {
          ...corsHeaders,
          ...createVersionHeaders(apiVersion),
          "content-type": "application/json",
        },
      });
    }

    if (action === "unbanIP") {
      const { ipAddress } = body;

      if (!ipAddress) {
        return new Response(JSON.stringify({ error: "ipAddress is required" }), {
          status: 400,
          headers: {
            ...corsHeaders,
            ...createVersionHeaders(apiVersion),
            "content-type": "application/json",
          },
        });
      }

      // Deactivate IP ban
      const { error: updateError } = await supabase
        .from("ip_blacklist")
        .update({ is_active: false })
        .eq("ip_address", ipAddress)
        .eq("is_active", true);

      if (updateError) throw updateError;

      // Log admin action
      await logAdminAction(adminProfileId, deviceId, "unbanIP", {
        ipAddress,
      }, req);

      return new Response(JSON.stringify({ success: true }), {
        headers: {
          ...corsHeaders,
          ...createVersionHeaders(apiVersion),
          "content-type": "application/json",
        },
      });
    }

    if (action === "getAllIPBans") {
      const { limit = 100, offset = 0 } = body;

      const { data: ipBans, error } = await supabase
        .from("ip_blacklist")
        .select(`
          *,
          banned_by_profile:profiles!ip_blacklist_banned_by_fkey (
            id,
            handle,
            emoji_avatar
          )
        `)
        .eq("is_active", true)
        .order("banned_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      const { count: totalCount } = await supabase
        .from("ip_blacklist")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true);

      return new Response(
        JSON.stringify({
          ipBans: ipBans || [],
          totalCount: totalCount || 0,
          limit,
          offset,
        }),
        {
          headers: {
            ...corsHeaders,
            ...createVersionHeaders(apiVersion),
            "content-type": "application/json",
          },
        }
      );
    }

    if (action === "getAllReports") {
      const { limit = 50, offset = 0, status = "all" } = body;

      let reportsQuery = supabase
        .from("reports")
        .select(
          `
          *,
          clip:clips (
            *,
            profiles (
              handle,
              emoji_avatar
            )
          ),
          reporter:profiles!reports_reporter_profile_id_fkey (
            handle,
            emoji_avatar
          )
        `
        )
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (status !== "all") {
        reportsQuery = reportsQuery.eq("status", status);
      }

      const { data: reports, error: reportsError } = await reportsQuery;

      if (reportsError) throw reportsError;

      // Get total count
      let countQuery = supabase.from("reports").select("id", { count: "exact", head: true });

      if (status !== "all") {
        countQuery = countQuery.eq("status", status);
      }

      const { count: totalCount } = await countQuery;

      return new Response(
        JSON.stringify({
          reports,
          totalCount: totalCount || 0,
          limit,
          offset,
        }),
        {
          headers: {
            ...corsHeaders,
            ...createVersionHeaders(apiVersion),
            "content-type": "application/json",
          },
        }
      );
    }

    if (action === "getAllClips") {
      const { limit = 50, offset = 0, status = "all", search = "" } = body;

      let clipsQuery = supabase
        .from("clips")
        .select(
          `
          *,
          profiles (
            handle,
            emoji_avatar
          )
        `
        )
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (status !== "all") {
        clipsQuery = clipsQuery.eq("status", status);
      }

      if (search) {
        clipsQuery = clipsQuery.or(`title.ilike.%${search}%,captions.ilike.%${search}%`);
      }

      const { data: clips, error: clipsError } = await clipsQuery;

      if (clipsError) throw clipsError;

      // Get total count
      let countQuery = supabase.from("clips").select("id", { count: "exact", head: true });

      if (status !== "all") {
        countQuery = countQuery.eq("status", status);
      }

      if (search) {
        countQuery = countQuery.or(`title.ilike.%${search}%,captions.ilike.%${search}%`);
      }

      const { count: totalCount } = await countQuery;

      return new Response(
        JSON.stringify({
          clips,
          totalCount: totalCount || 0,
          limit,
          offset,
        }),
        {
          headers: {
            ...corsHeaders,
            ...createVersionHeaders(apiVersion),
            "content-type": "application/json",
          },
        }
      );
    }

    if (action === "getSystemStats") {
      // Get total users
      const { count: totalUsers } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true });

      // Get total clips
      const { count: totalClips } = await supabase
        .from("clips")
        .select("id", { count: "exact", head: true });

      // Get total reports
      const { count: totalReports } = await supabase
        .from("reports")
        .select("id", { count: "exact", head: true });

      // Get clips by status
      const { data: clipsData } = await supabase
        .from("clips")
        .select("status");

      const clipsByStatus: Record<string, number> = {};
      clipsData?.forEach((clip) => {
        clipsByStatus[clip.status] = (clipsByStatus[clip.status] || 0) + 1;
      });

      // Get reports by status
      const { data: reportsData } = await supabase
        .from("reports")
        .select("status");

      const reportsByStatus: Record<string, number> = {};
      reportsData?.forEach((report) => {
        reportsByStatus[report.status] = (reportsByStatus[report.status] || 0) + 1;
      });

      // Get users by ban status
      const { count: bannedUsers } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("is_banned", true);

      // Get app settings (e.g., daily topic AI toggle)
      const { data: settingsData, error: settingsError } = await supabase
        .from("app_settings")
        .select("key, value")
        .in("key", ["use_ai_daily_topics"]);

      if (settingsError) {
        console.warn("[admin-review] Error loading app_settings:", settingsError);
      }

      const useAiDailyTopicsSetting = settingsData?.find((s: any) => s.key === "use_ai_daily_topics");
      const useAiDailyTopics =
        useAiDailyTopicsSetting && useAiDailyTopicsSetting.value && typeof useAiDailyTopicsSetting.value.value === "boolean"
          ? useAiDailyTopicsSetting.value.value
          : true;

      return new Response(
        JSON.stringify({
          totalUsers: totalUsers || 0,
          totalClips: totalClips || 0,
          totalReports: totalReports || 0,
          bannedUsers: bannedUsers || 0,
          clipsByStatus: clipsByStatus || {},
          reportsByStatus: reportsByStatus || {},
          appSettings: {
            useAiDailyTopics,
          },
        }),
        {
          headers: {
            ...corsHeaders,
            ...createVersionHeaders(apiVersion),
            "content-type": "application/json",
          },
        }
      );
    }

    if (action === "updateAppSettings") {
      const { key, value } = body as { key?: string; value?: unknown };

      if (!key || typeof key !== "string") {
        return new Response(
          JSON.stringify({ error: "Setting key is required" }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              ...createVersionHeaders(apiVersion),
              "content-type": "application/json",
            },
          }
        );
      }

      // Only allow known keys to be updated for safety
      const allowedKeys = ["use_ai_daily_topics"];
      if (!allowedKeys.includes(key)) {
        return new Response(
          JSON.stringify({ error: "Unsupported setting key" }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              ...createVersionHeaders(apiVersion),
              "content-type": "application/json",
            },
          }
        );
      }

      // Upsert app setting
      const { error: upsertError } = await supabase
        .from("app_settings")
        .upsert(
          {
            key,
            value: { value },
          },
          { onConflict: "key" }
        );

      if (upsertError) {
        console.error("[admin-review] Failed to update app_settings:", upsertError);
        return new Response(
          JSON.stringify({ error: "Failed to update setting" }),
          {
            status: 500,
            headers: {
              ...corsHeaders,
              ...createVersionHeaders(apiVersion),
              "content-type": "application/json",
            },
          }
        );
      }

      await logAdminAction(adminProfileId, deviceId, "update_app_settings", { key, value }, req);

      return new Response(
        JSON.stringify({ success: true }),
        {
          headers: {
            ...corsHeaders,
            ...createVersionHeaders(apiVersion),
            "content-type": "application/json",
          },
        }
      );
    }

    if (action === "bulkUpdateClips") {
      const { clipIds, status, flagIds, reportIds } = body;

      if (!Array.isArray(clipIds) || clipIds.length === 0 || !status) {
        return new Response(
          JSON.stringify({ error: "clipIds array and status are required" }), 
          { 
            status: 400,
            headers: {
              ...corsHeaders,
              ...createVersionHeaders(apiVersion),
              "content-type": "application/json",
            },
          }
        );
      }

      // Update all clips
      const { error: clipError } = await supabase
        .from("clips")
        .update({ status })
        .in("id", clipIds);

      if (clipError) throw clipError;

      // Update flags if provided
      if (Array.isArray(flagIds) && flagIds.length > 0) {
        const flagWorkflowState = status === "live" ? "resolved" : "actioned";
        const { error: flagError } = await supabase
          .from("moderation_flags")
          .update({ 
            status: status === "live" ? "resolved" : "actioned",
            workflow_state: flagWorkflowState,
            reviewed_at: new Date().toISOString(),
            reviewed_by: adminProfileId,
          })
          .in("id", flagIds);
        if (flagError) throw flagError;

        // Log to moderation history
        for (const flagId of flagIds) {
          await supabase.rpc("log_moderation_history", {
            p_item_type: "flag",
            p_item_id: flagId,
            p_action: flagWorkflowState,
            p_admin_profile_id: adminProfileId,
            p_new_value: JSON.stringify({ status, workflow_state: flagWorkflowState }),
          });
        }
      }

      // Update reports if provided
      if (Array.isArray(reportIds) && reportIds.length > 0) {
        const reportWorkflowState = status === "live" ? "resolved" : "actioned";
        const reportStatus = status === "live" ? "reviewed" : "actioned";
        const { error: reportError } = await supabase
          .from("reports")
          .update({ 
            status: reportStatus,
            workflow_state: reportWorkflowState,
            reviewed_at: new Date().toISOString(),
            reviewed_by: adminProfileId,
          })
          .in("id", reportIds);
        if (reportError) throw reportError;

        // Log to moderation history
        for (const reportId of reportIds) {
          await supabase.rpc("log_moderation_history", {
            p_item_type: "report",
            p_item_id: reportId,
            p_action: reportWorkflowState,
            p_admin_profile_id: adminProfileId,
            p_new_value: JSON.stringify({ status: reportStatus, workflow_state: reportWorkflowState }),
          });
        }
      }

      // Log admin action
      await logAdminAction(adminProfileId, deviceId, "bulkUpdateClips", {
        clipIds,
        status,
        flagIds: flagIds || [],
        reportIds: reportIds || [],
        count: clipIds.length,
      }, req);

      return new Response(JSON.stringify({ success: true, count: clipIds.length }), {
        headers: {
          ...corsHeaders,
          ...createVersionHeaders(apiVersion),
          "content-type": "application/json",
        },
      });
    }

    if (action === "updateClip") {
      const { clipId, status, flagId, reportIds, contentRating } = body;

      if (!clipId || !status) {
        return new Response(
          JSON.stringify({ error: "clipId and status are required" }), 
          { 
            status: 400,
            headers: {
              ...corsHeaders,
              ...createVersionHeaders(apiVersion),
              "content-type": "application/json",
            },
          }
        );
      }

      const updateData: any = { status };
      if (contentRating) {
        updateData.content_rating = contentRating;
      }

      const { error: clipError } = await supabase
        .from("clips")
        .update(updateData)
        .eq("id", clipId);

      if (clipError) throw clipError;

      if (flagId) {
        const flagWorkflowState = status === "live" ? "resolved" : "actioned";
        const { error: flagError } = await supabase
          .from("moderation_flags")
          .update({ 
            status: flagWorkflowState,
            workflow_state: flagWorkflowState,
            reviewed_at: new Date().toISOString(),
            reviewed_by: adminProfileId,
          })
          .eq("id", flagId);
        if (flagError) throw flagError;

        // Log to moderation history
        await supabase.rpc("log_moderation_history", {
          p_item_type: "flag",
          p_item_id: flagId,
          p_action: flagWorkflowState,
          p_admin_profile_id: adminProfileId,
          p_new_value: JSON.stringify({ status, workflow_state: flagWorkflowState }),
        });
      }

      if (Array.isArray(reportIds) && reportIds.length > 0) {
        const reportWorkflowState = status === "live" ? "resolved" : "actioned";
        const reportStatus = status === "live" ? "reviewed" : "actioned";
        const { error: reportError } = await supabase
          .from("reports")
          .update({ 
            status: reportStatus,
            workflow_state: reportWorkflowState,
            reviewed_at: new Date().toISOString(),
            reviewed_by: adminProfileId,
          })
          .in("id", reportIds);
        if (reportError) throw reportError;

        // Log to moderation history
        for (const reportId of reportIds) {
          await supabase.rpc("log_moderation_history", {
            p_item_type: "report",
            p_item_id: reportId,
            p_action: reportWorkflowState,
            p_admin_profile_id: adminProfileId,
            p_new_value: JSON.stringify({ status: reportStatus, workflow_state: reportWorkflowState }),
          });
        }
      }

      // Log admin action
      await logAdminAction(adminProfileId, deviceId, "updateClip", {
        clipId,
        status,
        contentRating: contentRating || null,
        flagId: flagId || null,
        reportIds: reportIds || [],
      }, req);

      return new Response(JSON.stringify({ success: true }), {
        headers: {
          ...corsHeaders,
          ...createVersionHeaders(apiVersion),
          "content-type": "application/json",
        },
      });
    }

    if (action === "markAs18Plus") {
      const { clipId, reportIds, flagId } = body;

      if (!clipId) {
        return new Response(
          JSON.stringify({ error: "clipId is required" }), 
          { 
            status: 400,
            headers: {
              ...corsHeaders,
              ...createVersionHeaders(apiVersion),
              "content-type": "application/json",
            },
          }
        );
      }

      // Update clip to mark as sensitive (18+)
      const { error: clipError } = await supabase
        .from("clips")
        .update({ content_rating: "sensitive" })
        .eq("id", clipId);

      if (clipError) throw clipError;

      // Update reports if provided
      if (Array.isArray(reportIds) && reportIds.length > 0) {
        const { error: reportError } = await supabase
          .from("reports")
          .update({ 
            status: "actioned",
            workflow_state: "actioned",
            reviewed_at: new Date().toISOString(),
            reviewed_by: adminProfileId,
          })
          .in("id", reportIds);
        if (reportError) throw reportError;

        // Log to moderation history
        for (const reportId of reportIds) {
          await supabase.rpc("log_moderation_history", {
            p_item_type: "report",
            p_item_id: reportId,
            p_action: "marked_as_18_plus",
            p_admin_profile_id: adminProfileId,
            p_new_value: JSON.stringify({ content_rating: "sensitive" }),
          });
        }
      }

      // Update flag if provided
      if (flagId) {
        const { error: flagError } = await supabase
          .from("moderation_flags")
          .update({ 
            status: "actioned",
            workflow_state: "actioned",
            reviewed_at: new Date().toISOString(),
            reviewed_by: adminProfileId,
          })
          .eq("id", flagId);
        if (flagError) throw flagError;

        // Log to moderation history
        await supabase.rpc("log_moderation_history", {
          p_item_type: "flag",
          p_item_id: flagId,
          p_action: "marked_as_18_plus",
          p_admin_profile_id: adminProfileId,
          p_new_value: JSON.stringify({ content_rating: "sensitive" }),
        });
      }

      // Log admin action
      await logAdminAction(adminProfileId, deviceId, "markAs18Plus", {
        clipId,
        reportIds: reportIds || [],
        flagId: flagId || null,
      }, req);

      return new Response(JSON.stringify({ success: true }), {
        headers: {
          ...corsHeaders,
          ...createVersionHeaders(apiVersion),
          "content-type": "application/json",
        },
      });
    }

    if (action === "scanReport") {
      const { reportId } = body;

      if (!reportId) {
        return new Response(JSON.stringify({ error: "reportId is required" }), {
          status: 400,
          headers: {
            ...corsHeaders,
            ...createVersionHeaders(apiVersion),
            "content-type": "application/json",
          },
        });
      }

      // Get report details
      const { data: report, error: reportError } = await supabase
        .from("reports")
        .select(`
          *,
          clip:clips (
            *,
            profiles (
              handle,
              emoji_avatar
            )
          ),
          profile:profiles!reports_profile_id_fkey (
            handle,
            emoji_avatar
          ),
          reporter:profiles!reports_reporter_profile_id_fkey (
            handle,
            emoji_avatar
          )
        `)
        .eq("id", reportId)
        .single();

      if (reportError) throw reportError;

      // Perform AI scan on report content
      const scanResults: any = {
        scanId: crypto.randomUUID(),
        reportId,
        timestamp: new Date().toISOString(),
        flags: [],
        riskScore: 0,
        summary: "",
        recommendations: [],
        details: {},
      };

      // Scan clip content if it's a clip report
      if (report.clip_id && report.clip) {
        const clip = report.clip;
        const textToScan = [
          clip.title || "",
          clip.captions || "",
          clip.summary || "",
          report.reason || "",
          report.details || "",
        ].filter(Boolean).join(" ");

        if (textToScan) {
          try {
            // Use OpenAI moderation API
            const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
            if (OPENAI_API_KEY) {
              const moderationResponse = await fetch("https://api.openai.com/v1/moderations", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${OPENAI_API_KEY}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  model: "omni-moderation-latest",
                  input: textToScan,
                }),
              });

              if (moderationResponse.ok) {
                const moderationData = await moderationResponse.json();
                const result = moderationData.results?.[0];
                
                if (result) {
                  scanResults.flags = Object.entries(result.categories || {})
                    .filter(([, value]) => value)
                    .map(([key]) => key.replace(/_/g, " "));
                  
                  scanResults.riskScore = Math.max(...Object.values(result.category_scores || { default: 0 })) * 10;
                  
                  scanResults.summary = result.flagged
                    ? `Content flagged for: ${scanResults.flags.join(", ")}`
                    : "Content appears safe based on automated scan";
                  
                  scanResults.details = {
                    flagged: result.flagged,
                    categoryScores: result.category_scores,
                    categories: result.categories,
                  };
                }
              }
            }
          } catch (error: any) {
            console.error("Error during AI moderation scan:", error);
            scanResults.summary = "Scan completed with errors. Manual review recommended.";
            scanResults.details.error = error?.message || "Unknown error";
          }
        }
      }

      // Analyze report patterns
      if (report.profile_id) {
        // Check if profile has multiple reports
        const { count: reportCount } = await supabase
          .from("reports")
          .select("id", { count: "exact", head: true })
          .eq("profile_id", report.profile_id)
          .eq("status", "open");

        if (reportCount && reportCount > 3) {
          scanResults.flags.push("Multiple reports against profile");
          scanResults.riskScore = Math.max(scanResults.riskScore, 6);
          scanResults.recommendations.push(`Profile has ${reportCount} open reports. Consider reviewing profile history.`);
        }
      }

      // Check reporter history
      if (report.reporter_profile_id) {
        const { count: reporterReportCount } = await supabase
          .from("reports")
          .select("id", { count: "exact", head: true })
          .eq("reporter_profile_id", report.reporter_profile_id);

        if (reporterReportCount && reporterReportCount > 10) {
          scanResults.flags.push("High reporter activity");
          scanResults.recommendations.push("Reporter has submitted many reports. Verify report validity.");
        }
      }

      // Generate recommendations based on risk score
      if (scanResults.riskScore >= 8) {
        scanResults.recommendations.push("High risk detected. Immediate review recommended.");
        scanResults.recommendations.push("Consider taking action on reported content.");
      } else if (scanResults.riskScore >= 5) {
        scanResults.recommendations.push("Moderate risk detected. Review recommended.");
      } else if (scanResults.riskScore > 0) {
        scanResults.recommendations.push("Low risk detected. Standard review process.");
      } else {
        scanResults.recommendations.push("No issues detected in automated scan.");
      }

      // Log admin action
      await logAdminAction(adminProfileId, deviceId, "scanReport", {
        reportId,
        scanId: scanResults.scanId,
        riskScore: scanResults.riskScore,
      }, req);

      return new Response(JSON.stringify(scanResults), {
        headers: {
          ...corsHeaders,
          ...createVersionHeaders(apiVersion),
          "content-type": "application/json",
        },
      });
    }

    if (action === "resolveReport") {
      const { reportId } = body;
      if (!reportId) {
        return new Response(
          JSON.stringify({ error: "reportId is required" }), 
          { 
            status: 400,
            headers: {
              ...corsHeaders,
              ...createVersionHeaders(apiVersion),
              "content-type": "application/json",
            },
          }
        );
      }

      const { error } = await supabase
        .from("reports")
        .update({ 
          status: "reviewed",
          workflow_state: "resolved",
          reviewed_at: new Date().toISOString(),
          reviewed_by: adminProfileId,
        })
        .eq("id", reportId);

      if (error) throw error;

      // Log to moderation history
      await supabase.rpc("log_moderation_history", {
        p_item_type: "report",
        p_item_id: reportId,
        p_action: "resolved",
        p_admin_profile_id: adminProfileId,
        p_new_value: JSON.stringify({ status: "reviewed", workflow_state: "resolved" }),
      });

      // Log admin action
      await logAdminAction(adminProfileId, deviceId, "resolveReport", {
        reportId,
      }, req);

      return new Response(JSON.stringify({ success: true }), {
        headers: {
          ...corsHeaders,
          ...createVersionHeaders(apiVersion),
          "content-type": "application/json",
        },
      });
    }

    if (action === "assignItem") {
      const { itemType, itemId, assignedTo } = body;
      if (!itemType || !itemId) {
        return new Response(
          JSON.stringify({ error: "itemType and itemId are required" }), 
          { 
            status: 400,
            headers: {
              ...corsHeaders,
              ...createVersionHeaders(apiVersion),
              "content-type": "application/json",
            },
          }
        );
      }

      const tableName = itemType === "flag" ? "moderation_flags" : "reports";
      const previousData = await supabase
        .from(tableName)
        .select("assigned_to, workflow_state")
        .eq("id", itemId)
        .single();

      const updateData: any = {
        assigned_to: assignedTo || null,
        workflow_state: assignedTo ? "in_review" : "pending",
      };

      const { error } = await supabase
        .from(tableName)
        .update(updateData)
        .eq("id", itemId);

      if (error) throw error;

      // Log to moderation history
      await supabase.rpc("log_moderation_history", {
        p_item_type: itemType,
        p_item_id: itemId,
        p_action: assignedTo ? "assigned" : "unassigned",
        p_admin_profile_id: adminProfileId,
        p_previous_value: JSON.stringify(previousData.data),
        p_new_value: JSON.stringify(updateData),
      });

      // Send notification to assigned admin
      if (assignedTo) {
        await supabase.rpc("notify_admin_assigned_item", {
          p_admin_profile_id: assignedTo,
          p_item_type: itemType,
          p_item_id: itemId,
        });
      }

      await logAdminAction(adminProfileId, deviceId, "assignItem", {
        itemType,
        itemId,
        assignedTo,
      }, req);

      return new Response(JSON.stringify({ success: true }), {
        headers: {
          ...corsHeaders,
          ...createVersionHeaders(apiVersion),
          "content-type": "application/json",
        },
      });
    }

    if (action === "updateNotes") {
      const { itemType, itemId, notes } = body;
      if (!itemType || !itemId) {
        return new Response(
          JSON.stringify({ error: "itemType and itemId are required" }), 
          { 
            status: 400,
            headers: {
              ...corsHeaders,
              ...createVersionHeaders(apiVersion),
              "content-type": "application/json",
            },
          }
        );
      }

      const tableName = itemType === "flag" ? "moderation_flags" : "reports";
      const { error } = await supabase
        .from(tableName)
        .update({ moderation_notes: notes || null })
        .eq("id", itemId);

      if (error) throw error;

      // Log to moderation history
      await supabase.rpc("log_moderation_history", {
        p_item_type: itemType,
        p_item_id: itemId,
        p_action: "note_added",
        p_admin_profile_id: adminProfileId,
        p_notes: notes,
      });

      await logAdminAction(adminProfileId, deviceId, "updateNotes", {
        itemType,
        itemId,
      }, req);

      return new Response(JSON.stringify({ success: true }), {
        headers: {
          ...corsHeaders,
          ...createVersionHeaders(apiVersion),
          "content-type": "application/json",
        },
      });
    }

    if (action === "updateWorkflowState") {
      const { itemType, itemId, workflowState } = body;
      if (!itemType || !itemId || !workflowState) {
        return new Response(
          JSON.stringify({ error: "itemType, itemId, and workflowState are required" }), 
          { 
            status: 400,
            headers: {
              ...corsHeaders,
              ...createVersionHeaders(apiVersion),
              "content-type": "application/json",
            },
          }
        );
      }

      const tableName = itemType === "flag" ? "moderation_flags" : "reports";
      const previousData = await supabase
        .from(tableName)
        .select("workflow_state")
        .eq("id", itemId)
        .single();

      const updateData: any = {
        workflow_state: workflowState,
      };

      if (workflowState === "resolved" || workflowState === "actioned") {
        updateData.reviewed_at = new Date().toISOString();
        updateData.reviewed_by = adminProfileId;
      }

      const { error } = await supabase
        .from(tableName)
        .update(updateData)
        .eq("id", itemId);

      if (error) throw error;

      // Log to moderation history
      await supabase.rpc("log_moderation_history", {
        p_item_type: itemType,
        p_item_id: itemId,
        p_action: "state_changed",
        p_admin_profile_id: adminProfileId,
        p_previous_value: JSON.stringify(previousData.data),
        p_new_value: JSON.stringify(updateData),
      });

      await logAdminAction(adminProfileId, deviceId, "updateWorkflowState", {
        itemType,
        itemId,
        workflowState,
      }, req);

      return new Response(JSON.stringify({ success: true }), {
        headers: {
          ...corsHeaders,
          ...createVersionHeaders(apiVersion),
          "content-type": "application/json",
        },
      });
    }

    if (action === "getModerationHistory") {
      const { itemType, itemId } = body;
      if (!itemType || !itemId) {
        return new Response(
          JSON.stringify({ error: "itemType and itemId are required" }), 
          { 
            status: 400,
            headers: {
              ...corsHeaders,
              ...createVersionHeaders(apiVersion),
              "content-type": "application/json",
            },
          }
        );
      }

      const { data: history, error } = await supabase
        .from("moderation_history")
        .select(`
          *,
          admin_profile:profiles (
            id,
            handle,
            emoji_avatar
          )
        `)
        .eq("item_type", itemType)
        .eq("item_id", itemId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      return new Response(JSON.stringify({ history: history || [] }), {
        headers: {
          ...corsHeaders,
          ...createVersionHeaders(apiVersion),
          "content-type": "application/json",
        },
      });
    }

    if (action === "handleProfileReport") {
      const { reportId, action: profileAction, banDuration, warningMessage } = body;
      if (!reportId || !profileAction) {
        return new Response(
          JSON.stringify({ error: "reportId and action are required" }), 
          { 
            status: 400,
            headers: {
              ...corsHeaders,
              ...createVersionHeaders(apiVersion),
              "content-type": "application/json",
            },
          }
        );
      }

      // Get the report to find the profile_id
      const { data: report, error: reportError } = await supabase
        .from("reports")
        .select("profile_id")
        .eq("id", reportId)
        .single();

      if (reportError || !report?.profile_id) {
        return new Response(
          JSON.stringify({ error: "Report not found or not a profile report" }), 
          { 
            status: 404,
            headers: {
              ...corsHeaders,
              ...createVersionHeaders(apiVersion),
              "content-type": "application/json",
            },
          }
        );
      }

      const profileId = report.profile_id;

      if (profileAction === "ban") {
        const bannedUntil = banDuration 
          ? new Date(Date.now() + banDuration * 60 * 60 * 1000).toISOString()
          : null;

        // Get current ban_count first
        const { data: profile } = await supabase
          .from("profiles")
          .select("ban_count")
          .eq("id", profileId)
          .single();

        const { error: banError } = await supabase
          .from("profiles")
          .update({
            is_banned: true,
            banned_at: new Date().toISOString(),
            banned_until: bannedUntil,
            ban_count: (profile?.ban_count || 0) + 1,
          })
          .eq("id", profileId);

        if (banError) throw banError;
      } else if (profileAction === "warn") {
        // You might want to create a warnings table or add a warnings field
        // For now, we'll just log it in the moderation history
        await supabase.rpc("log_moderation_history", {
          p_item_type: "report",
          p_item_id: reportId,
          p_action: "warned",
          p_admin_profile_id: adminProfileId,
          p_notes: warningMessage || "User warned",
        });
      }

      // Update report status
      const { error: updateError } = await supabase
        .from("reports")
        .update({
          status: "actioned",
          workflow_state: "actioned",
          reviewed_at: new Date().toISOString(),
          reviewed_by: adminProfileId,
        })
        .eq("id", reportId);

      if (updateError) throw updateError;

      // Log to moderation history
      await supabase.rpc("log_moderation_history", {
        p_item_type: "report",
        p_item_id: reportId,
        p_action: `profile_${profileAction}`,
        p_admin_profile_id: adminProfileId,
        p_new_value: JSON.stringify({ action: profileAction, profileId }),
        p_notes: profileAction === "warn" ? warningMessage : null,
      });

      await logAdminAction(adminProfileId, deviceId, "handleProfileReport", {
        reportId,
        profileAction,
        profileId,
      }, req);

      return new Response(JSON.stringify({ success: true }), {
        headers: {
          ...corsHeaders,
          ...createVersionHeaders(apiVersion),
          "content-type": "application/json",
        },
      });
    }

    if (action === "getModerationStatistics") {
      const { startDate, endDate } = body;
      const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate) : new Date();

      const { data: stats, error } = await supabase.rpc("get_moderation_statistics", {
        p_start_date: start.toISOString(),
        p_end_date: end.toISOString(),
      });

      if (error) {
        // Log the error for debugging
        console.error("Error calling get_moderation_statistics:", error);
        // If the function doesn't exist, return empty stats instead of failing
        if (error.code === "42883" || error.message?.includes("does not exist")) {
          return new Response(JSON.stringify({ statistics: {} }), {
            headers: {
              ...corsHeaders,
              ...createVersionHeaders(apiVersion),
              "content-type": "application/json",
            },
          });
        }
        throw error;
      }

      return new Response(JSON.stringify({ statistics: stats?.[0] || {} }), {
        headers: {
          ...corsHeaders,
          ...createVersionHeaders(apiVersion),
          "content-type": "application/json",
        },
      });
    }

    if (action === "getModerationNotifications") {
      const { data: notifications, error } = await supabase.rpc("get_unread_moderation_notifications", {
        p_admin_profile_id: adminProfileId,
      });

      if (error) {
        // If the function doesn't exist, return empty array instead of failing
        if (error.code === "42883" || error.message?.includes("does not exist")) {
          return new Response(JSON.stringify({ notifications: [] }), {
            headers: {
              ...corsHeaders,
              ...createVersionHeaders(apiVersion),
              "content-type": "application/json",
            },
          });
        }
        throw error;
      }

      return new Response(JSON.stringify({ notifications: notifications || [] }), {
        headers: {
          ...corsHeaders,
          ...createVersionHeaders(apiVersion),
          "content-type": "application/json",
        },
      });
    }

    if (action === "markNotificationRead") {
      const { notificationId } = body;
      if (!notificationId) {
        return new Response(
          JSON.stringify({ error: "notificationId is required" }), 
          { 
            status: 400,
            headers: {
              ...corsHeaders,
              ...createVersionHeaders(apiVersion),
              "content-type": "application/json",
            },
          }
        );
      }

      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", notificationId)
        .eq("recipient_id", adminProfileId);

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: {
          ...corsHeaders,
          ...createVersionHeaders(apiVersion),
          "content-type": "application/json",
        },
      });
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }), 
      { 
        status: 400,
        headers: {
          ...corsHeaders,
          ...createVersionHeaders(apiVersion),
          "content-type": "application/json",
        },
      }
    );
  } catch (error) {
    logErrorSafely("admin-review", error);
    
    // Capture error to Sentry
    await captureException(error, {
      functionName: "admin-review",
      ...requestContext,
      additionalData: {
        apiVersion,
        method: req.method,
      },
    });
    
    const isDevelopment = Deno.env.get("ENVIRONMENT") === "development";
    const errorResponse = createErrorResponse(error, 500, isDevelopment);
    return new Response(errorResponse.body, {
      status: errorResponse.status,
      headers: {
        ...corsHeaders,
        ...createVersionHeaders(apiVersion),
        "content-type": "application/json",
        ...errorResponse.headers,
      },
    });
  }
});

