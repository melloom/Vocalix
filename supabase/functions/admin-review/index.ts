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

const fetchModerationQueues = async () => {
  const { data: flags, error: flagsError } = await supabase
    .from("moderation_flags")
    .select(
      `
      id,
      reasons,
      risk,
      source,
      status,
      created_at,
      clips (
        *,
        profiles (
          handle,
          emoji_avatar
        )
      )
    `,
    )
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (flagsError) {
    throw flagsError;
  }

  const { data: reports, error: reportsError } = await supabase
    .from("reports")
    .select(
      `
      id,
      reason,
      details,
      status,
      created_at,
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
    `,
    )
    .eq("status", "open")
    .order("created_at", { ascending: false });

  if (reportsError) {
    throw reportsError;
  }

  return { flags, reports };
};

serve(async (req) => {
  const requestContext = extractRequestContext(req);
  const apiVersion = parseApiVersion(req);
  
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { 
        status: 405,
        headers: createVersionHeaders(apiVersion),
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
            ...createVersionHeaders(apiVersion),
            "content-type": "application/json",
          },
        }
      );
    }

    if (action === "list") {
      const { flags, reports } = await fetchModerationQueues();
      
      // Handle different API versions if needed
      if (apiVersion === "2.0.0") {
        // Example: v2.0.0 might return additional fields
        return new Response(JSON.stringify({ 
          flags, 
          reports,
          version: "2.0.0",
        }), {
          headers: {
            ...createVersionHeaders(apiVersion),
            "content-type": "application/json",
          },
        });
      }
      
      return new Response(JSON.stringify({ flags, reports }), {
        headers: {
          ...createVersionHeaders(apiVersion),
          "content-type": "application/json",
        },
      });
    }

    if (action === "updateClip") {
      const { clipId, status, flagId, reportIds } = body;

      if (!clipId || !status) {
        return new Response(
          JSON.stringify({ error: "clipId and status are required" }), 
          { 
            status: 400,
            headers: {
              ...createVersionHeaders(apiVersion),
              "content-type": "application/json",
            },
          }
        );
      }

      const { error: clipError } = await supabase
        .from("clips")
        .update({ status })
        .eq("id", clipId);

      if (clipError) throw clipError;

      if (flagId) {
        const { error: flagError } = await supabase
          .from("moderation_flags")
          .update({ status: status === "live" ? "resolved" : "actioned" })
          .eq("id", flagId);
        if (flagError) throw flagError;
      }

      if (Array.isArray(reportIds) && reportIds.length > 0) {
        const reportStatus = status === "live" ? "reviewed" : "actioned";
        const { error: reportError } = await supabase
          .from("reports")
          .update({ status: reportStatus })
          .in("id", reportIds);
        if (reportError) throw reportError;
      }

      // Log admin action
      await logAdminAction(adminProfileId, deviceId, "updateClip", {
        clipId,
        status,
        flagId: flagId || null,
        reportIds: reportIds || [],
      }, req);

      return new Response(JSON.stringify({ success: true }), {
        headers: {
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
              ...createVersionHeaders(apiVersion),
              "content-type": "application/json",
            },
          }
        );
      }

      const { error } = await supabase
        .from("reports")
        .update({ status: "reviewed" })
        .eq("id", reportId);

      if (error) throw error;

      // Log admin action
      await logAdminAction(adminProfileId, deviceId, "resolveReport", {
        reportId,
      }, req);

      return new Response(JSON.stringify({ success: true }), {
        headers: {
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
        ...createVersionHeaders(apiVersion),
        "content-type": "application/json",
        ...errorResponse.headers,
      },
    });
  }
});

