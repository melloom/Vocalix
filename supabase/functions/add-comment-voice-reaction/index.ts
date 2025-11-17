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
  throw new Error("Missing Supabase configuration for add-comment-voice-reaction.");
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

const MAX_DURATION_SECONDS = 5;
const MIN_DURATION_SECONDS = 1;

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

    // IP-based rate limiting: 20 voice reactions per minute per IP
    if (ipAddress) {
      const ipRateLimitResult = await checkIPRateLimit(supabase, ipAddress, "comment_voice_reaction", 20, 1);
      if (!ipRateLimitResult.allowed) {
        return new Response(
          JSON.stringify({
            error: "IP rate limit exceeded. Please wait before adding another voice reaction.",
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

    // Rate limiting: 10 voice reactions per minute per profile
    const rateLimitKey = getRateLimitKey("profileId", "comment-voice-reaction", profileId);
    const rateLimitResult = await checkRateLimit(supabase, rateLimitKey, {
      maxRequests: 10,
      windowMs: 60000, // 1 minute
      identifier: profileId,
    });

    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({ 
          error: "Rate limit exceeded. Please wait before adding another voice reaction.",
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

    // Detect suspicious IP patterns
    if (ipAddress) {
      const suspiciousPattern = await detectSuspiciousIPPattern(supabase, ipAddress, "comment_voice_reaction", 60);
      if (suspiciousPattern.isSuspicious && suspiciousPattern.severity === "critical") {
        return new Response(
          JSON.stringify({ error: "Suspicious activity detected. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "content-type": "application/json" } }
        );
      }
    }

    const { commentId, audioBase64, audioType, durationSeconds } = await req.json();

    if (!commentId || !audioBase64 || !durationSeconds) {
      return new Response(
        JSON.stringify({ error: "commentId, audioBase64, and durationSeconds are required" }), 
        { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

    // Validate duration
    if (durationSeconds < MIN_DURATION_SECONDS || durationSeconds > MAX_DURATION_SECONDS) {
      return new Response(
        JSON.stringify({ error: `Duration must be between ${MIN_DURATION_SECONDS} and ${MAX_DURATION_SECONDS} seconds` }), 
        { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

    // Verify comment exists and get owner
    const { data: comment, error: commentError } = await supabase
      .from("comments")
      .select("id, profile_id")
      .eq("id", commentId)
      .is("deleted_at", null)
      .single();

    if (commentError || !comment) {
      return new Response(JSON.stringify({ error: "Comment not found" }), { status: 404, headers: { ...corsHeaders, "content-type": "application/json" } });
    }

    // Check reputation farming (prevent same user giving multiple voice reactions to boost karma)
    const commentOwnerId = comment.profile_id as string;
    if (commentOwnerId && commentOwnerId !== profileId) {
      const farmingCheck = await checkReputationFarming(
        supabase,
        commentOwnerId,
        profileId,
        "comment_voice_reaction_received",
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

    // Convert base64 to buffer
    const audioBuffer = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));

    // Upload audio file to storage
    const fileName = `${profileId}/comment-voice-reactions/${Date.now()}.webm`;
    const { error: uploadError } = await supabase.storage
      .from("audio")
      .upload(fileName, audioBuffer, {
        contentType: audioType || "audio/webm",
        upsert: false,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return new Response(
        JSON.stringify({ error: "Failed to upload audio file" }), 
        { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

    // Insert voice reaction record
    const { data: voiceReaction, error: insertError } = await supabase
      .from("comment_voice_reactions")
      .insert({
        comment_id: commentId,
        profile_id: profileId,
        audio_path: fileName,
        duration_seconds: durationSeconds,
      })
      .select()
      .single();

    if (insertError) {
      // Clean up uploaded file if insert fails
      await supabase.storage.from("audio").remove([fileName]);
      console.error("Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to save voice reaction" }), 
        { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

    // Log reputation action (voice reaction received by comment owner)
    if (commentOwnerId && commentOwnerId !== profileId) {
      await logReputationAction(
        supabase,
        commentOwnerId,
        "comment_voice_reaction_received",
        profileId,
        commentId,
        1 // 1 reputation point per voice reaction
      );
    }

    // Log IP activity for abuse detection
    if (ipAddress) {
      await logIPActivity(
        supabase,
        ipAddress,
        "comment_voice_reaction",
        profileId,
        voiceReaction.id,
        deviceId,
        userAgent,
        { commentId }
      );
    }

    return new Response(JSON.stringify({ 
      success: true,
      voiceReaction: {
        id: voiceReaction.id,
        comment_id: voiceReaction.comment_id,
        profile_id: voiceReaction.profile_id,
        audio_path: voiceReaction.audio_path,
        duration_seconds: voiceReaction.duration_seconds,
        created_at: voiceReaction.created_at,
      }
    }), {
      headers: { 
        ...corsHeaders, 
        ...createRateLimitHeaders(rateLimitResult),
        "content-type": "application/json" 
      },
      status: 200,
    });
  } catch (error) {
    logErrorSafely("add-comment-voice-reaction", error);
    const isDevelopment = Deno.env.get("ENVIRONMENT") === "development";
    const errorResponse = createErrorResponse(error, 500, isDevelopment);
    return new Response(errorResponse.body, {
      ...errorResponse,
      headers: { ...corsHeaders, ...errorResponse.headers },
    });
  }
});

