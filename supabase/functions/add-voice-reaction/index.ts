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
  throw new Error("Missing Supabase configuration for add-voice-reaction.");
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

    const { clipId, audioBase64, audioType, durationSeconds } = await req.json();

    if (!clipId || !audioBase64 || !durationSeconds) {
      return new Response(
        JSON.stringify({ error: "clipId, audioBase64, and durationSeconds are required" }),
        { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

    // Check per-clip voice reaction cooldown (2 seconds between reactions)
    const { data: lastReaction } = await supabase
      .from("voice_reactions")
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
            error: `Please wait ${remainingCooldown} second(s) before adding another voice reaction.`,
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

    // Rate limiting: 5 voice reactions per minute per profile (reduced from 10)
    const rateLimitKey = getRateLimitKey("profileId", "voice-reaction", profileId);
    const rateLimitResult = await checkRateLimit(supabase, rateLimitKey, {
      maxRequests: 5,
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

    // Daily limit: 200 voice reactions per day per profile
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { count: dailyCount, error: dailyCountError } = await supabase
      .from("voice_reactions")
      .select("*", { count: "exact", head: true })
      .eq("profile_id", profileId)
      .gte("created_at", today.toISOString());

    if (!dailyCountError && dailyCount !== null && dailyCount >= 200) {
      return new Response(
        JSON.stringify({
          error: "Daily voice reaction limit reached. Maximum 200 voice reactions per day.",
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

    // IP-based rate limiting: 20 voice reactions per minute per IP
    if (ipAddress) {
      const ipRateLimitResult = await checkIPRateLimit(supabase, ipAddress, "voice_reaction", 20, 1);
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

    // Detect suspicious IP patterns
    if (ipAddress) {
      const suspiciousPattern = await detectSuspiciousIPPattern(supabase, ipAddress, "voice_reaction", 60);
      if (suspiciousPattern.isSuspicious && suspiciousPattern.severity === "critical") {
        return new Response(
          JSON.stringify({ error: "Suspicious activity detected. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "content-type": "application/json" } }
        );
      }
    }

    if (!clipId || !audioBase64 || !durationSeconds) {
      return new Response(
        JSON.stringify({ error: "clipId, audioBase64, and durationSeconds are required" }), 
        { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

    // Validate duration
    if (durationSeconds < MIN_DURATION_SECONDS || durationSeconds > MAX_DURATION_SECONDS) {
      return new Response(
        JSON.stringify({ 
          error: `Duration must be between ${MIN_DURATION_SECONDS} and ${MAX_DURATION_SECONDS} seconds` 
        }), 
        { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

    // Validate file size (max 2MB for voice reactions) - base64 is ~33% larger than binary
    const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
    const estimatedSize = (audioBase64.length * 3) / 4;
    if (estimatedSize > MAX_FILE_SIZE) {
      return new Response(
        JSON.stringify({ error: "Audio file too large. Maximum size is 2MB." }), 
        { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

    // Validate file type
    const contentType = audioType || "audio/webm";
    if (!contentType.startsWith("audio/")) {
      return new Response(
        JSON.stringify({ error: "File must be an audio file" }), 
        { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

    // Verify clip exists and get owner
    const { data: clip, error: clipError } = await supabase
      .from("clips")
      .select("id, profile_id")
      .eq("id", clipId)
      .single();

    if (clipError || !clip) {
      return new Response(JSON.stringify({ error: "Clip not found" }), { 
        status: 404,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    // Check reputation farming (prevent same user giving multiple voice reactions to boost karma)
    const clipOwnerId = clip.profile_id as string;
    if (clipOwnerId && clipOwnerId !== profileId) {
      const farmingCheck = await checkReputationFarming(
        supabase,
        clipOwnerId,
        profileId,
        "voice_reaction_received",
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
    const fileName = `${profileId}/voice-reactions/${Date.now()}.webm`;
    const { error: uploadError } = await supabase.storage
      .from("audio")
      .upload(fileName, audioBuffer, {
        contentType,
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
      .from("voice_reactions")
      .insert({
        clip_id: clipId,
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

    // Log reputation action (voice reaction received by clip owner)
    if (clipOwnerId && clipOwnerId !== profileId) {
      await logReputationAction(
        supabase,
        clipOwnerId,
        "voice_reaction_received",
        profileId,
        clipId,
        1 // 1 reputation point per voice reaction
      );
    }

    // Log IP activity for abuse detection
    if (ipAddress) {
      await logIPActivity(
        supabase,
        ipAddress,
        "voice_reaction",
        profileId,
        voiceReaction.id,
        deviceId,
        userAgent,
        { clipId }
      );
    }

    return new Response(JSON.stringify({ 
      success: true,
      voiceReaction: {
        id: voiceReaction.id,
        clip_id: voiceReaction.clip_id,
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
    logErrorSafely("add-voice-reaction", error);
    const isDevelopment = Deno.env.get("ENVIRONMENT") === "development";
    const errorResponse = createErrorResponse(error, 500, isDevelopment);
    return new Response(errorResponse.body, {
      ...errorResponse,
      headers: { ...corsHeaders, ...errorResponse.headers },
    });
  }
});

