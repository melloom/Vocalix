import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0?target=deno";
import { createErrorResponse, logErrorSafely } from "../_shared/error-handler.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase environment variables for daily-topic.");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const FALLBACK_TOPICS = [
  {
    title: "What brightened your day?",
    description: "Share a small moment that lifted your spirits today.",
  },
  {
    title: "A little act of kindness",
    description: "Talk about a kind thing you gave or received recently.",
  },
  {
    title: "Your calm corner",
    description: "Describe a place or ritual that helps you feel grounded.",
  },
  {
    title: "What are you grateful for?",
    description: "Name one thing you’re thankful for and why it matters.",
  },
  {
    title: "A hopeful thought",
    description: "Share something that makes you feel optimistic right now.",
  },
];

type TopicRow = {
  id: string;
  title: string;
  description: string | null;
  date: string;
};

const formatISODate = (date: Date) => {
  return date.toISOString().slice(0, 10);
};

const chooseFallbackTopic = (usedTitles: Set<string>, today: string) => {
  const dayOfYear = Math.floor(
    (Date.UTC(new Date(today).getFullYear(), new Date(today).getMonth(), new Date(today).getDate()) -
      Date.UTC(new Date(today).getFullYear(), 0, 0)) /
      86400000,
  );

  for (let i = 0; i < FALLBACK_TOPICS.length; i++) {
    const index = (dayOfYear + i) % FALLBACK_TOPICS.length;
    const candidate = FALLBACK_TOPICS[index];
    if (!usedTitles.has(candidate.title)) {
      return candidate;
    }
  }

  return FALLBACK_TOPICS[0];
};

const buildPrompt = (recentTopics: TopicRow[], today: string) => {
  const recentList = recentTopics
    .map((topic) => `- ${topic.title}: ${topic.description ?? "No description"}`)
    .join("\n");

  return [
    {
      role: "system" as const,
      content:
        "You create warm, reflective daily voice-journal prompts for a gentle, anonymous community. Respond only with valid JSON.",
    },
    {
      role: "user" as const,
      content: `Create a new daily topic for date ${today}. Avoid repeating or rephrasing the recent prompts below. Keep the title under 80 characters, phrased as an inviting question. Write a single-sentence description (max 140 characters) that encourages kindness, reflection, or gratitude.\n\nRecent prompts:\n${recentList}\n\nReturn JSON in the shape {"title": "...", "description": "..."}.`,
    },
  ];
};

const fetchGeneratedTopic = async (recentTopics: TopicRow[], today: string) => {
  if (!OPENAI_API_KEY) {
    return null;
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.8,
      max_tokens: 400,
      response_format: { type: "json_object" },
      messages: buildPrompt(recentTopics, today),
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error("OpenAI daily-topic error:", detail);
    return null;
  }

  const json = await response.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content) return null;

  try {
    const parsed = JSON.parse(content) as { title?: string; description?: string };
    if (!parsed.title || !parsed.description) {
      return null;
    }
    return {
      title: parsed.title.trim(),
      description: parsed.description.trim(),
    };
  } catch (error) {
    console.error("Failed to parse OpenAI response for daily-topic:", error);
    return null;
  }
};

const upsertTopic = async (topic: { title: string; description: string }, today: string) => {
  const { error } = await supabase
    .from("topics")
    .upsert(
      {
        title: topic.title,
        description: topic.description,
        date: today,
        is_active: true,
      },
      { onConflict: "date" },
    );

  if (error) {
    throw error;
  }
};

const handler = async () => {
  const today = formatISODate(new Date());

  const { data: existingToday, error: todayError } = await supabase
    .from("topics")
    .select("*")
    .eq("date", today)
    .maybeSingle();

  if (todayError && todayError.code !== "PGRST116") {
    throw todayError;
  }

  if (existingToday) {
    return {
      status: "ok",
      message: "Topic for today already exists.",
      topic: existingToday,
    };
  }

  const { data: recentTopics, error: recentError } = await supabase
    .from("topics")
    .select("id, title, description, date")
    .order("date", { ascending: false })
    .limit(10);

  if (recentError) {
    throw recentError;
  }

  const generated = await fetchGeneratedTopic(recentTopics ?? [], today);
  const usedTitles = new Set((recentTopics ?? []).map((topic) => topic.title));
  const selected =
    generated && generated.title && !usedTitles.has(generated.title)
      ? generated
      : chooseFallbackTopic(usedTitles, today);

  await upsertTopic(selected, today);

  return {
    status: "created",
    topic: {
      title: selected.title,
      description: selected.description,
      date: today,
      source: generated ? "openai" : "fallback",
    },
  };
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-device-id",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const result = await handler();
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (error) {
    logErrorSafely("daily-topic", error);
    const isDevelopment = Deno.env.get("ENVIRONMENT") === "development";
    const errorResponse = createErrorResponse(error, 500, isDevelopment);
    return new Response(errorResponse.body, {
      ...errorResponse,
      headers: { ...corsHeaders, ...errorResponse.headers },
    });
  }
});



