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
  throw new Error("Missing Supabase configuration for react-to-clip.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const ALLOWED_EMOJIS = new Set(["😊", "🔥", "❤️", "🙏", "😔", "😂", "😮", "🧘", "💡"]);

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

    const { clipId, emoji } = await req.json();

    if (!clipId || !emoji) {
      return new Response(JSON.stringify({ error: "clipId and emoji are required" }), { 
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    // Check per-clip reaction cooldown (can't react to same clip multiple times quickly)
    const { data: lastReaction } = await supabase
      .from("clip_reactions")
      .select("created_at")
      .eq("clip_id", clipId)
      .eq("profile_id", profileId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (lastReaction) {
      const lastReactionTime = new Date(lastReaction.created_at).getTime();
      const timeSinceLastReaction = Date.now() - lastReactionTime;
      const cooldownMs = 2000; // 2 seconds cooldown between reactions
      
      if (timeSinceLastReaction < cooldownMs) {
        const remainingCooldown = Math.ceil((cooldownMs - timeSinceLastReaction) / 1000);
        return new Response(
          JSON.stringify({
            error: `Please wait ${remainingCooldown} second(s) before reacting again.`,
            retryAfter: remainingCooldown,
          }),
          {
            status: 429,
            headers: {
              ...corsHeaders,
              "content-type": "application/json",
              "Retry-After": remainingCooldown.toString(),
            },
          }
        );
      }
    }

    // Rate limiting: 10 reactions per minute per profile (reduced from 30)
    const rateLimitKey = getRateLimitKey("profileId", "react", profileId);
    const rateLimitResult = await checkRateLimit(supabase, rateLimitKey, {
      maxRequests: 10,
      windowMs: 60000, // 1 minute
      identifier: profileId,
    });

    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({ 
          error: "Rate limit exceeded. Please wait before reacting again.",
          retryAfter: rateLimitResult.retryAfter,
        }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            ...createRateLimitHeaders(rateLimitResult),
            "content-type": "application/json",
          },
        }
      );
    }

    // Daily limit: 500 reactions per day per profile
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { count: dailyCount, error: dailyCountError } = await supabase
      .from("clip_reactions")
      .select("*", { count: "exact", head: true })
      .eq("profile_id", profileId)
      .gte("created_at", today.toISOString());

    if (!dailyCountError && dailyCount !== null && dailyCount >= 500) {
      return new Response(
        JSON.stringify({
          error: "Daily reaction limit reached. Maximum 500 reactions per day.",
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

    // IP-based rate limiting: 50 reactions per minute per IP
    const ip = getClientIP(req);
    if (ip) {
      const ipRateLimitKey = getRateLimitKey("ip", "react", ip);
      const ipRateLimitResult = await checkRateLimit(supabase, ipRateLimitKey, {
        maxRequests: 50,
        windowMs: 60000, // 1 minute
        identifier: ip,
      });

      if (!ipRateLimitResult.allowed) {
        return new Response(
          JSON.stringify({
            error: "IP rate limit exceeded. Please wait before reacting again.",
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

    if (!ALLOWED_EMOJIS.has(emoji)) {
      return new Response(JSON.stringify({ error: "Emoji not allowed" }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const { data: clip, error: clipError } = await supabase
      .from("clips")
      .select("id, profile_id")
      .eq("id", clipId)
      .single();

    if (clipError || !clip) {
      return new Response(JSON.stringify({ error: "Clip not found" }), { status: 404 });
    }

    // Check reputation farming (prevent same user giving multiple reactions to boost karma)
    const clipOwnerId = clip.profile_id as string;
    if (clipOwnerId) {
      const farmingCheck = await checkReputationFarming(
        supabase,
        clipOwnerId,
        profileId,
        "reaction_received",
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

    const { error: insertError } = await supabase.from("clip_reactions").insert({
      clip_id: clipId,
      profile_id: profileId,
      emoji,
    });

    if (insertError) {
      throw insertError;
    }

    const { data: reactionRows, error: reactionsError } = await supabase
      .from("clip_reactions")
      .select("emoji")
      .eq("clip_id", clipId);

    if (reactionsError || !reactionRows) {
      throw reactionsError ?? new Error("Failed to compute reactions");
    }

    const reactions: Record<string, number> = {};
    for (const row of reactionRows) {
      const reactionEmoji = row.emoji as string;
      reactions[reactionEmoji] = (reactions[reactionEmoji] ?? 0) + 1;
    }

    await supabase.from("clips").update({ reactions }).eq("id", clipId);

    // Log reputation action (reaction received by clip owner)
    if (clipOwnerId) {
      await logReputationAction(
        supabase,
        clipOwnerId,
        "reaction_received",
        profileId,
        clipId,
        1 // 1 reputation point per reaction
      );
    }

    // Log IP activity
    const ipAddress = getRequestIPAddress(req);
    const userAgent = req.headers.get("user-agent") || req.headers.get("x-user-agent") || null;
    if (ipAddress) {
      await logIPActivity(
        supabase,
        ipAddress,
        "reaction",
        profileId,
        clipId,
        deviceId,
        userAgent
      );
    }

    return new Response(JSON.stringify({ reactions }), {
      headers: { 
        ...corsHeaders, 
        ...createRateLimitHeaders(rateLimitResult),
        "content-type": "application/json" 
      },
      status: 200,
    });
  } catch (error) {
    logErrorSafely("react-to-clip", error);
    const isDevelopment = Deno.env.get("ENVIRONMENT") === "development";
    const errorResponse = createErrorResponse(error, 500, isDevelopment);
    return new Response(errorResponse.body, {
      ...errorResponse,
      headers: { ...corsHeaders, ...errorResponse.headers },
    });
  }
});

