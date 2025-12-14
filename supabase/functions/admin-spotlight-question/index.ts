import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0?target=deno";
import { createErrorResponse, logErrorSafely } from "../_shared/error-handler.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase environment variables for admin-spotlight-question.");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

type AdminRequestBody = {
  question: string;
  topic_id?: string | null;
  topic_title?: string | null;
  topic_description?: string | null;
};

const getCorsHeaders = (req: Request): Record<string, string> => {
  const origin = req.headers.get("origin");
  const envOrigins = Deno.env.get("ALLOWED_ORIGINS");
  const envOrigin = Deno.env.get("ORIGIN");

  let allowOrigin = "*";

  if (origin) {
    if (envOrigins) {
      const allowedList = envOrigins.split(",").map((o) => o.trim());
      if (allowedList.includes(origin)) {
        allowOrigin = origin;
      }
    }

    if (allowOrigin === "*" && (origin.includes("localhost") || origin.includes("127.0.0.1"))) {
      allowOrigin = origin;
    }

    if (allowOrigin === "*" && envOrigin) {
      allowOrigin = envOrigin;
    }
  } else if (envOrigin) {
    allowOrigin = envOrigin;
  }

  if (allowOrigin === "*" && origin) {
    allowOrigin = origin;
  }

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-device-id",
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

const upsertTodaySpotlightQuestion = async (payload: AdminRequestBody) => {
  const today = new Date().toISOString().slice(0, 10);

  // Basic validation
  const question = (payload.question || "").trim();
  if (!question || question.length < 5) {
    throw new Error("Question is required and must be at least 5 characters long.");
  }

  // Try update first, then insert if missing
  const { data: existing, error: fetchError } = await supabase
    .from("daily_spotlight_questions")
    .select("*")
    .eq("date", today)
    .maybeSingle();

  if (fetchError && fetchError.code !== "PGRST116") {
    throw fetchError;
  }

  if (existing) {
    const { data, error } = await supabase
      .from("daily_spotlight_questions")
      .update({
        question,
        topic_id: payload.topic_id ?? existing.topic_id ?? null,
        topic_title: payload.topic_title ?? existing.topic_title ?? null,
        topic_description: payload.topic_description ?? existing.topic_description ?? null,
        generated_by: "admin",
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  const { data, error } = await supabase
    .from("daily_spotlight_questions")
    .insert({
      date: today,
      question,
      topic_id: payload.topic_id ?? null,
      topic_title: payload.topic_title ?? null,
      topic_description: payload.topic_description ?? null,
      generated_by: "admin",
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

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
    const adminProfileId = await getAdminProfileId(deviceId);

    if (!adminProfileId) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: admin access required" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const body = (await req.json()) as AdminRequestBody;

    const updated = await upsertTodaySpotlightQuestion(body);

    return new Response(
      JSON.stringify({
        status: "ok",
        question: updated,
        generated_by: "admin",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    logErrorSafely("admin-spotlight-question", error);
    const isDevelopment = Deno.env.get("ENVIRONMENT") === "development";
    const errorResponse = createErrorResponse(error, 500, isDevelopment);
    return new Response(errorResponse.body, {
      ...errorResponse,
      headers: { ...corsHeaders, ...errorResponse.headers },
    });
  }
});


