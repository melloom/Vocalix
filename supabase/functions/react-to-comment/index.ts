import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0?target=deno";
import { checkRateLimit, getRateLimitKey, createRateLimitHeaders } from "../_shared/rate-limit.ts";
import { createErrorResponse, logErrorSafely } from "../_shared/error-handler.ts";
import { 
  getRequestIPAddress, 
  logIPActivity, 
  checkIPRateLimit, 
  isIPBlacklisted,
  detectSuspiciousIPPattern,
  checkReputationFarming,
  logReputationAction
} from "../_shared/security.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase configuration for react-to-comment.");
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


const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ORIGIN") || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-device-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Credentials": "true",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

// Allowed emojis for reactions (same as clip reactions)
const ALLOWED_EMOJIS = new Set([
  "👍", "❤️", "😂", "😮", "😢", "🔥", "👏", "🎉", "💯", "✨",
  "🤔", "😍", "🙌", "💪", "🎯", "🚀", "⭐", "💖", "😊", "🤝"
]);

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

    const { commentId, emoji } = await req.json();

    if (!commentId || !emoji) {
      return new Response(JSON.stringify({ error: "commentId and emoji are required" }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    // Check per-comment reaction cooldown (2 seconds between reactions)
    const { data: lastReaction } = await supabase
      .from("comment_reactions")
      .select("created_at")
      .eq("comment_id", commentId)
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

    // Rate limiting: 10 reactions per minute per profile (reduced from 20)
    const rateLimitKey = getRateLimitKey("profileId", "comment-reaction", profileId);
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
      .from("comment_reactions")
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

    // Get IP address for tracking and rate limiting
    const ipAddress = getRequestIPAddress(req);
    const userAgent = req.headers.get("user-agent") || req.headers.get("x-user-agent") || null;

    // Check if IP is blacklisted
    if (ipAddress) {
      const isBlacklisted = await isIPBlacklisted(supabase, ipAddress);
      if (isBlacklisted) {
        return new Response(
          JSON.stringify({ error: "Access denied" }),
          { status: 403, headers: { ...corsHeaders, "content-type": "application/json" } }
        );
      }
    }

    // IP-based rate limiting: 50 reactions per minute per IP
    if (ipAddress) {
      const ipRateLimitResult = await checkIPRateLimit(supabase, ipAddress, "comment_reaction", 50, 1);
      if (!ipRateLimitResult.allowed) {
        return new Response(
          JSON.stringify({
            error: "IP rate limit exceeded. Please wait before reacting again.",
            retryAfter: ipRateLimitResult.resetAt ? Math.ceil((new Date(ipRateLimitResult.resetAt).getTime() - Date.now()) / 1000) : 60,
          }),
          {
            status: 429,
            headers: {
              ...corsHeaders,
              "content-type": "application/json",
              "Retry-After": ipRateLimitResult.resetAt ? Math.ceil((new Date(ipRateLimitResult.resetAt).getTime() - Date.now()) / 1000).toString() : "60",
            },
          }
        );
      }
    }

    // Detect suspicious IP patterns
    if (ipAddress) {
      const suspiciousPattern = await detectSuspiciousIPPattern(supabase, ipAddress, "comment_reaction", 60);
      if (suspiciousPattern.isSuspicious && suspiciousPattern.severity === "critical") {
        return new Response(
          JSON.stringify({ error: "Suspicious activity detected. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "content-type": "application/json" } }
        );
      }
    }

    if (!ALLOWED_EMOJIS.has(emoji)) {
      return new Response(JSON.stringify({ error: "Emoji not allowed" }), { status: 400 });
    }

    const { data: comment, error: commentError } = await supabase
      .from("comments")
      .select("id, profile_id")
      .eq("id", commentId)
      .is("deleted_at", null)
      .single();

    if (commentError || !comment) {
      return new Response(JSON.stringify({ error: "Comment not found" }), { status: 404 });
    }

    // Check reputation farming (prevent same user giving multiple reactions to boost karma)
    const commentOwnerId = comment.profile_id as string;
    if (commentOwnerId && commentOwnerId !== profileId) {
      const farmingCheck = await checkReputationFarming(
        supabase,
        commentOwnerId,
        profileId,
        "comment_reaction_received",
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

    // Check if reaction already exists
    const { data: existingReaction } = await supabase
      .from("comment_reactions")
      .select("id")
      .eq("comment_id", commentId)
      .eq("profile_id", profileId)
      .eq("emoji", emoji)
      .single();

    if (existingReaction) {
      // Remove reaction (toggle off)
      const { error: deleteError } = await supabase
        .from("comment_reactions")
        .delete()
        .eq("id", existingReaction.id);

      if (deleteError) {
        throw deleteError;
      }
    } else {
      // Add reaction
      const { error: insertError } = await supabase.from("comment_reactions").insert({
        comment_id: commentId,
        profile_id: profileId,
        emoji,
      });

      if (insertError) {
        throw insertError;
      }
    }

    // Get updated reactions
    const { data: reactionRows, error: reactionsError } = await supabase
      .from("comment_reactions")
      .select("emoji")
      .eq("comment_id", commentId);

    if (reactionsError || !reactionRows) {
      throw reactionsError ?? new Error("Failed to compute reactions");
    }

    const reactions: Record<string, number> = {};
    for (const row of reactionRows) {
      const reactionEmoji = row.emoji as string;
      reactions[reactionEmoji] = (reactions[reactionEmoji] ?? 0) + 1;
    }

    // Update comment reactions JSONB (trigger will handle this, but we can also do it here)
    await supabase.from("comments").update({ reactions }).eq("id", commentId);

    // Log reputation action (reaction received by comment owner) - only if adding, not removing
    if (!existingReaction && commentOwnerId && commentOwnerId !== profileId) {
      await logReputationAction(
        supabase,
        commentOwnerId,
        "comment_reaction_received",
        profileId,
        commentId,
        1 // 1 reputation point per reaction
      );
    }

    // Log IP activity for abuse detection
    if (ipAddress) {
      await logIPActivity(
        supabase,
        ipAddress,
        "comment_reaction",
        profileId,
        commentId,
        null, // deviceId not available in this function
        userAgent,
        { emoji, isToggle: !!existingReaction }
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
    logErrorSafely("react-to-comment", error);
    const isDevelopment = Deno.env.get("ENVIRONMENT") === "development";
    const errorResponse = createErrorResponse(error, 500, isDevelopment);
    return new Response(errorResponse.body, {
      ...errorResponse,
      headers: { ...corsHeaders, ...errorResponse.headers },
    });
  }
});

