import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0?target=deno";
import { checkRateLimit, getRateLimitKey, createRateLimitHeaders } from "../_shared/rate-limit.ts";
import { createErrorResponse, logErrorSafely } from "../_shared/error-handler.ts";
import { 
  getRequestIPAddress, 
  logIPActivity, 
  checkReputationFarming,
  logReputationAction
} from "../_shared/security.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase configuration for increment-listen.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const getProfileIdFromDevice = async (deviceId: string | null) => {
  if (!deviceId) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("device_id", deviceId)
    .single();

  if (error || !data) {
    return null;
  }

  return data.id as string;
};

/**
 * Get client IP address from request
 */
function getClientIP(req: Request): string | null {
  const headers = req.headers;
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  const realIP = headers.get("x-real-ip");
  if (realIP) {
    return realIP.trim();
  }
  const cfConnectingIP = headers.get("cf-connecting-ip");
  if (cfConnectingIP) {
    return cfConnectingIP.trim();
  }
  return null;
}

const MIN_DURATION_SECONDS = 1; // Minimum duration to count as a real listen
const MAX_DURATION_SECONDS = 3600; // Maximum reasonable duration (1 hour)

// SECURITY: CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ORIGIN") || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-device-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Credentials": "true",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { 
        status: 405,
        headers: corsHeaders,
      });
    }

    const deviceId = req.headers.get("x-device-id");
    const profileId = await getProfileIdFromDevice(deviceId);
    if (!profileId) {
      return new Response(JSON.stringify({ error: "Profile not found" }), { 
        status: 403,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const { clipId, seconds = 0 } = await req.json();

    if (!clipId) {
      return new Response(JSON.stringify({ error: "clipId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    // Validate duration: must be a number and within reasonable bounds
    if (typeof seconds !== "number" || seconds < 0 || seconds > MAX_DURATION_SECONDS) {
      return new Response(
        JSON.stringify({ error: `seconds must be between 0 and ${MAX_DURATION_SECONDS}` }),
        {
          status: 400,
          headers: { ...corsHeaders, "content-type": "application/json" },
        }
      );
    }

    // Server-side validation: clip must have been played for minimum duration
    // Prevents fake listens where duration is 0 or too short
    if (seconds < MIN_DURATION_SECONDS) {
      return new Response(
        JSON.stringify({
          error: `Listen duration too short. Minimum ${MIN_DURATION_SECONDS} second(s) required to count as a listen.`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "content-type": "application/json" },
        }
      );
    }

    const { data: clipExists, error: clipError } = await supabase
      .from("clips")
      .select("id, listens_count")
      .eq("id", clipId)
      .single();

    if (clipError || !clipExists) {
      return new Response(JSON.stringify({ error: "Clip not found" }), { status: 404 });
    }

    // Check reputation farming (prevent same user giving multiple listens to boost karma)
    const clipOwnerId = clipExists.profile_id as string;
    if (clipOwnerId && clipOwnerId !== profileId) {
      const farmingCheck = await checkReputationFarming(
        supabase,
        clipOwnerId,
        profileId,
        "listen_received",
        60 // 60 minute cooldown
      );

      if (farmingCheck.isFarming) {
        return new Response(
          JSON.stringify({
            error: farmingCheck.reason || "Suspicious activity detected. Please try again later.",
          }),
          {
            status: 429,
            headers: { ...corsHeaders, "content-type": "application/json" },
          }
        );
      }
    }

    // Stronger throttling: 30 seconds between listens for same clip (increased from 5 seconds)
    const { data: lastListen } = await supabase
      .from("listens")
      .select("listened_at")
      .eq("clip_id", clipId)
      .eq("profile_id", profileId)
      .order("listened_at", { ascending: false })
      .limit(1)
      .single();

    if (lastListen) {
      const lastTime = new Date(lastListen.listened_at).getTime();
      const throttleMs = 30000; // 30 seconds throttle (increased from 5 seconds)
      
      if (Date.now() - lastTime < throttleMs) {
        const remainingThrottle = Math.ceil((throttleMs - (Date.now() - lastTime)) / 1000);
        return new Response(
          JSON.stringify({
            listensCount: clipExists.listens_count ?? 0,
            throttled: true,
            retryAfter: remainingThrottle,
            error: `Please wait ${remainingThrottle} second(s) before tracking another listen for this clip.`,
          }),
          {
            status: 429,
            headers: {
              ...corsHeaders,
              "content-type": "application/json",
              "Retry-After": remainingThrottle.toString(),
            },
          }
        );
      }
    }

    // Daily listen limit per clip per profile: max 10 listens per clip per day
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { count: dailyListenCount, error: dailyCountError } = await supabase
      .from("listens")
      .select("*", { count: "exact", head: true })
      .eq("clip_id", clipId)
      .eq("profile_id", profileId)
      .gte("listened_at", today.toISOString());

    if (!dailyCountError && dailyListenCount !== null && dailyListenCount >= 10) {
      return new Response(
        JSON.stringify({
          error: "Daily listen limit reached for this clip. Maximum 10 listens per clip per day.",
          listensCount: clipExists.listens_count ?? 0,
        }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            "content-type": "application/json",
          },
        }
      );
    }

    // IP-based rate limiting: 200 listens per minute per IP
    const ip = getClientIP(req);
    if (ip) {
      const ipRateLimitKey = getRateLimitKey("ip", "listen", ip);
      const ipRateLimitResult = await checkRateLimit(supabase, ipRateLimitKey, {
        maxRequests: 200,
        windowMs: 60000, // 1 minute
        identifier: ip,
      });

      if (!ipRateLimitResult.allowed) {
        return new Response(
          JSON.stringify({
            error: "IP rate limit exceeded. Please wait before tracking listens.",
            retryAfter: ipRateLimitResult.retryAfter,
          }),
          {
            status: 429,
            headers: {
              ...corsHeaders,
              ...createRateLimitHeaders(ipRateLimitResult),
              "content-type": "application/json",
            },
          }
        );
      }
    }

    // Extract device type from user agent
    const userAgent = req.headers.get("user-agent") || req.headers.get("x-user-agent") || "";
    let deviceType = "unknown";
    if (userAgent) {
      if (/mobile|android|iphone|ipad|ipod/i.test(userAgent)) {
        deviceType = "mobile";
      } else if (/tablet|ipad/i.test(userAgent)) {
        deviceType = "tablet";
      } else {
        deviceType = "desktop";
      }
    }

    // Get geographic data from headers (if available from CDN/proxy)
    const countryCode = req.headers.get("cf-ipcountry") || 
                       req.headers.get("x-country-code") || 
                       null;
    const city = req.headers.get("cf-ipcity") || 
                 req.headers.get("x-city") || 
                 null;

    // Calculate completion percentage
    const clipDuration = clipExists.duration_seconds || 0;
    const completionPercentage = clipDuration > 0 
      ? Math.min(100, (seconds / clipDuration) * 100) 
      : null;

    const { error: listenError } = await supabase.from("listens").insert({
      clip_id: clipId,
      profile_id: profileId,
      seconds,
      device_type: deviceType,
      user_agent: userAgent || null,
      country_code: countryCode,
      city: city,
      completion_percentage: completionPercentage,
    });

    if (listenError) {
      throw listenError;
    }

    const newCount = (clipExists.listens_count ?? 0) + 1;
    const { error: updateError } = await supabase
      .from("clips")
      .update({ listens_count: newCount })
      .eq("id", clipId);

    if (updateError) {
      throw updateError;
    }

    // Log reputation action (listen received by clip owner)
    if (clipOwnerId && clipOwnerId !== profileId) {
      await logReputationAction(
        supabase,
        clipOwnerId,
        "listen_received",
        profileId,
        clipId,
        1 // 1 reputation point per listen
      );
    }

    // Log IP activity
    const ipAddress = getRequestIPAddress(req);
    const userAgent = req.headers.get("user-agent") || req.headers.get("x-user-agent") || null;
    if (ipAddress) {
      await logIPActivity(
        supabase,
        ipAddress,
        "listen",
        profileId,
        clipId,
        deviceId,
        userAgent,
        { seconds }
      );
    }

    return new Response(JSON.stringify({ listensCount: newCount }), {
      headers: { 
        ...corsHeaders, 
        ...createRateLimitHeaders(rateLimitResult),
        "content-type": "application/json" 
      },
    });
  } catch (error) {
    logErrorSafely("increment-listen", error);
    const isDevelopment = Deno.env.get("ENVIRONMENT") === "development";
    const errorResponse = createErrorResponse(error, 500, isDevelopment);
    return new Response(errorResponse.body, {
      ...errorResponse,
      headers: { ...corsHeaders, ...errorResponse.headers },
    });
  }
});

