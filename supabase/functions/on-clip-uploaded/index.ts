import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0?target=deno";
import { createErrorResponse, logErrorSafely } from "../_shared/error-handler.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!OPENAI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing required environment variables for on-clip-uploaded.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const summarizationPrompt = `You are summarizing a short anonymous voice note. Output JSON with the keys:
SUMMARY: max 2 natural sentences.
TAGS: 1–3 lowercase keywords, comma-separated.
SENTIMENT: one of [positive, neutral, mixed, negative].
Keep it kind and nonjudgmental. Do not reveal or infer identity. Respond strictly as JSON.`;

const moderateTranscript = async (transcript: string) => {
  const response = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "omni-moderation-latest",
      input: transcript,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI moderation failed: ${detail}`);
  }

  const json = await response.json();
  const result = json.results?.[0];
  if (!result) {
    return { flag: false, reasons: [], risk: 0 };
  }

  const reasons = Object.entries(result.categories || {})
    .filter(([, value]) => value)
    .map(([key]) => key.replace(/_/g, " "));
  const risk = Math.max(...Object.values(result.category_scores || { default: 0 }));

  return { flag: Boolean(result.flagged), reasons, risk: Number.isFinite(risk) ? risk : 0 };
};

const summarizeTranscript = async (transcript: string) => {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: summarizationPrompt },
        { role: "user", content: transcript },
      ],
      temperature: 0.4,
      max_tokens: 300,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI summary failed: ${detail}`);
  }

  const json = await response.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content) return { SUMMARY: null, TAGS: "", SENTIMENT: "neutral" };
  try {
    return JSON.parse(content) as { SUMMARY?: string; TAGS?: string; SENTIMENT?: string };
  } catch (error) {
    console.error("Failed to parse summary JSON:", error);
    return { SUMMARY: null, TAGS: "", SENTIMENT: "neutral" };
  }
};

const transcribeAudio = async (audioPath: string) => {
  const { data, error } = await supabase.storage.from("audio").download(audioPath);
  if (error || !data) {
    throw new Error(`Failed to download audio: ${error?.message ?? "unknown error"}`);
  }

  const formData = new FormData();
  const file = new File([data], "clip.webm", { type: data.type || "audio/webm" });
  formData.append("file", file);
  formData.append("model", "gpt-4o-mini-transcribe");
  formData.append("response_format", "json");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI transcription failed: ${detail}`);
  }

  const json = await response.json();
  return (json.text as string) ?? "";
};

const getDeviceProfile = async (deviceId: string | null) => {
  if (!deviceId) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("device_id", deviceId)
    .single();
  if (error || !data) return null;
  return data.id as string;
};

// SECURITY: Restrict CORS to specific origins in production
const allowedOrigins = Deno.env.get("ALLOWED_ORIGINS")?.split(",") || ["*"];
const origin = Deno.env.get("ORIGIN") || "*";

const corsHeaders = {
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-device-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Credentials": "true",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

serve(async (req) => {
  // Handle CORS preflight requests
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

    const deviceId = req.headers.get("x-device-id") ?? null;
    const { clipId } = await req.json();

    if (!clipId) {
      return new Response(JSON.stringify({ error: "clipId is required" }), { 
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const { data: clip, error: clipError } = await supabase
      .from("clips")
      .select(
        `
        id,
        audio_path,
        duration_seconds,
        profile_id,
        status,
        is_podcast
      `,
      )
      .eq("id", clipId)
      .single();

    if (clipError || !clip) {
      return new Response(JSON.stringify({ error: "Clip not found" }), { 
        status: 404,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    // Validate duration based on content type
    const maxDuration = clip.is_podcast ? 600 : 30; // Podcast: 10 min, Regular: 30 sec
    if (clip.duration_seconds > maxDuration || clip.duration_seconds <= 0) {
      await supabase
        .from("clips")
        .update({ status: "removed" })
        .eq("id", clipId);
      return new Response(
        JSON.stringify({ status: "removed", reason: "invalid_duration" }),
        { headers: { ...corsHeaders, "content-type": "application/json" } },
      );
    }

    const transcript = await transcribeAudio(clip.audio_path);
    const summaryData = await summarizeTranscript(transcript);
    const moderationData = await moderateTranscript(transcript);

    const tags =
      typeof summaryData.TAGS === "string"
        ? summaryData.TAGS.split(",").map((tag) => tag.trim()).filter(Boolean)
        : null;

    const status = moderationData.flag ? "hidden" : "live";

    const { error: updateError } = await supabase
      .from("clips")
      .update({
        captions: transcript,
        summary: summaryData.SUMMARY ?? null,
        tags,
        status,
        moderation: {
          flag: moderationData.flag,
          reasons: moderationData.reasons,
          risk: moderationData.risk,
          sentiment: summaryData.SENTIMENT ?? "neutral",
        },
      })
      .eq("id", clipId);

    if (updateError) {
      throw updateError;
    }

    if (moderationData.flag) {
      await supabase.from("moderation_flags").insert({
        clip_id: clipId,
        reasons: moderationData.reasons ?? [],
        risk: moderationData.risk ?? 0,
        source: "ai",
      });
    }

    // Optional: notify uploader if moderation passed/failed.
    // Expo push tokens or notification channel aren’t implemented yet,
    // but we can leave a placeholder hook for future expansion.
    const profileId = await getDeviceProfile(deviceId);
    if (profileId && profileId === clip.profile_id && !moderationData.flag) {
      console.log(`Clip ${clipId} by profile ${profileId} is live. Ready to send push notification.`);
    }

    return new Response(
      JSON.stringify({
        status,
        captions: transcript,
        summary: summaryData.SUMMARY ?? null,
        tags,
        moderation: moderationData,
      }),
      { headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  } catch (error) {
    logErrorSafely("on-clip-uploaded", error);
    const isDevelopment = Deno.env.get("ENVIRONMENT") === "development";
    const errorResponse = createErrorResponse(error, 500, isDevelopment);
    return new Response(errorResponse.body, {
      ...errorResponse,
      headers: { ...corsHeaders, ...errorResponse.headers },
    });
  }
});

