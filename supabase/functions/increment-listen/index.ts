import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0?target=deno";
import { checkRateLimit, getRateLimitKey, createRateLimitHeaders } from "../_shared/rate-limit.ts";
import { createErrorResponse, logErrorSafely } from "../_shared/error-handler.ts";

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

    // Rate limiting: 100 listen increments per minute per profile
    const rateLimitKey = getRateLimitKey("profileId", "listen", profileId);
    const rateLimitResult = await checkRateLimit(supabase, rateLimitKey, {
      maxRequests: 100,
      windowMs: 60000, // 1 minute
      identifier: profileId,
    });

    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({ 
          error: "Rate limit exceeded. Please wait before tracking listens.",
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

    const { clipId, seconds = 0 } = await req.json();

    if (!clipId) {
      return new Response(JSON.stringify({ error: "clipId is required" }), { status: 400 });
    }

    if (typeof seconds !== "number" || seconds < 0 || seconds > 30) {
      return new Response(JSON.stringify({ error: "seconds must be between 0 and 30" }), { status: 400 });
    }

    const { data: clipExists, error: clipError } = await supabase
      .from("clips")
      .select("id, listens_count")
      .eq("id", clipId)
      .single();

    if (clipError || !clipExists) {
      return new Response(JSON.stringify({ error: "Clip not found" }), { status: 404 });
    }

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
      if (Date.now() - lastTime < 5000) {
        return new Response(
          JSON.stringify({ listensCount: clipExists.listens_count ?? 0, throttled: true }),
          { headers: { "content-type": "application/json" } },
        );
      }
    }

    const { error: listenError } = await supabase.from("listens").insert({
      clip_id: clipId,
      profile_id: profileId,
      seconds,
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

