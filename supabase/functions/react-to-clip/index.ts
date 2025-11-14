import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0?target=deno";
import { checkRateLimit, getRateLimitKey, createRateLimitHeaders } from "../_shared/rate-limit.ts";
import { createErrorResponse, logErrorSafely } from "../_shared/error-handler.ts";

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

    // Rate limiting: 30 reactions per minute per profile
    const rateLimitKey = getRateLimitKey("profileId", "react", profileId);
    const rateLimitResult = await checkRateLimit(supabase, rateLimitKey, {
      maxRequests: 30,
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

    const { clipId, emoji } = await req.json();

    if (!clipId || !emoji) {
      return new Response(JSON.stringify({ error: "clipId and emoji are required" }), { status: 400 });
    }

    if (!ALLOWED_EMOJIS.has(emoji)) {
      return new Response(JSON.stringify({ error: "Emoji not allowed" }), { status: 400 });
    }

    const { data: clip, error: clipError } = await supabase
      .from("clips")
      .select("id")
      .eq("id", clipId)
      .single();

    if (clipError || !clip) {
      return new Response(JSON.stringify({ error: "Clip not found" }), { status: 404 });
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

