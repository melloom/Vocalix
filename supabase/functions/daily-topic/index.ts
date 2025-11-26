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

// Expanded fallback topics pool - more variety to avoid repetition
const FALLBACK_TOPICS = [
  { title: "What brightened your day?", description: "Share a small moment that lifted your spirits today." },
  { title: "A little act of kindness", description: "Talk about a kind thing you gave or received recently." },
  { title: "Your calm corner", description: "Describe a place or ritual that helps you feel grounded." },
  { title: "What are you grateful for?", description: "Name one thing you're thankful for and why it matters." },
  { title: "A hopeful thought", description: "Share something that makes you feel optimistic right now." },
  { title: "A moment of connection", description: "Tell us about a meaningful interaction you had recently." },
  { title: "Something that made you smile", description: "What brought joy to your day today?" },
  { title: "A small victory", description: "Celebrate a win, no matter how small it might seem." },
  { title: "What's on your mind?", description: "Share what's been occupying your thoughts lately." },
  { title: "A lesson learned", description: "What's something you've discovered or realized recently?" },
  { title: "A place that matters", description: "Describe a location that holds special meaning for you." },
  { title: "A person who inspired you", description: "Who has made a positive impact on you recently?" },
  { title: "What are you looking forward to?", description: "Share something you're excited about in the near future." },
  { title: "A memory worth sharing", description: "Tell us about a moment from your past that still brings you joy." },
  { title: "What helps you recharge?", description: "How do you restore your energy when you're feeling drained?" },
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

// Improved fallback selection - uses day of year + recent topics to ensure variety
const chooseFallbackTopic = (usedTitles: Set<string>, today: string): { title: string; description: string } => {
  // Calculate day of year (1-365/366)
  const date = new Date(today);
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));

  // Filter out recently used topics
  const availableTopics = FALLBACK_TOPICS.filter((topic) => !usedTitles.has(topic.title));

  if (availableTopics.length === 0) {
    // If all topics have been used recently, use day-of-year rotation
    const index = dayOfYear % FALLBACK_TOPICS.length;
    return FALLBACK_TOPICS[index];
  }

  // Use day of year to select from available topics
  const index = dayOfYear % availableTopics.length;
  return availableTopics[index];
};

// Improved prompt for better variety
const buildPrompt = (recentTopics: TopicRow[], today: string) => {
  const recentList = recentTopics
    .slice(0, 14) // Last 14 days to ensure good variety
    .map((topic) => `- ${topic.title}: ${topic.description ?? "No description"}`)
    .join("\n");

  const dayOfWeek = new Date(today).toLocaleDateString('en-US', { weekday: 'long' });
  const month = new Date(today).toLocaleDateString('en-US', { month: 'long' });

  return [
    {
      role: "system" as const,
      content:
        "You create warm, reflective daily voice-journal prompts for a gentle, anonymous community. Your prompts should be unique, engaging, and avoid repetition. Always respond with valid JSON only.",
    },
    {
      role: "user" as const,
      content: `Create a NEW and UNIQUE daily topic for ${dayOfWeek}, ${month} ${new Date(today).getDate()}, ${new Date(today).getFullYear()}.

CRITICAL: The topic must be DIFFERENT from all recent topics listed below. Do NOT rephrase or repeat similar themes.

Requirements:
- Title: Under 80 characters, phrased as an inviting question
- Description: Single sentence, max 140 characters, encouraging kindness, reflection, or gratitude
- Must be unique and not similar to recent topics
- Should feel fresh and relevant to the day

Recent topics to avoid:
${recentList || "None yet - this is the first topic!"}

Return ONLY valid JSON in this exact format:
{"title": "Your unique question here?", "description": "Your description here."}`,
    },
  ];
};

const fetchGeneratedTopic = async (recentTopics: TopicRow[], today: string) => {
  // Check global app setting to see if AI daily topics are enabled
  try {
    const { data: settingsData, error: settingsError } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "use_ai_daily_topics")
      .maybeSingle();

    if (settingsError) {
      console.warn("[daily-topic] Error reading app_settings.use_ai_daily_topics, falling back to AI enabled:", settingsError);
    }

    const useAi =
      settingsData && settingsData.value && typeof settingsData.value.value === "boolean"
        ? settingsData.value.value
        : true; // default to true if setting missing

    if (!useAi) {
      console.log("[daily-topic] AI daily topics disabled via app_settings, using fallback topics only");
      return null;
    }
  } catch (settingsReadError) {
    console.warn("[daily-topic] Failed to read app_settings, falling back to AI enabled:", settingsReadError);
  }

  if (!OPENAI_API_KEY) {
    console.log("OpenAI API key not configured, using fallback");
    return null;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.9, // Higher temperature for more variety
        max_tokens: 400,
        response_format: { type: "json_object" },
        messages: buildPrompt(recentTopics, today),
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("OpenAI API error:", response.status, detail);
      return null;
    }

    const json = await response.json();
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      console.error("OpenAI returned empty content");
      return null;
    }

    try {
      const parsed = JSON.parse(content) as { title?: string; description?: string };
      if (!parsed.title || !parsed.description) {
        console.error("OpenAI response missing required fields");
        return null;
      }

      const title = parsed.title.trim();
      const description = parsed.description.trim();

      // Validate length
      if (title.length > 80 || description.length > 140) {
        console.warn("OpenAI response exceeds length limits, using fallback");
        return null;
      }

      return { title, description };
    } catch (parseError) {
      console.error("Failed to parse OpenAI JSON response:", parseError);
      return null;
    }
  } catch (error) {
    console.error("OpenAI request failed:", error);
    return null;
  }
};

const upsertTopic = async (topic: { title: string; description: string }, today: string) => {
  try {
    // Use the safe upsert function that handles race conditions
    const { data: topicId, error: upsertError } = await supabase.rpc("upsert_system_topic", {
      p_title: topic.title,
      p_description: topic.description,
      p_date: today,
      p_is_active: true,
    });

    if (upsertError) {
      console.warn("Upsert function failed, trying manual approach:", upsertError);
      
      // Fallback: check if topic exists
      const { data: existing, error: checkError } = await supabase
        .from("topics")
        .select("id")
        .eq("date", today)
        .eq("is_active", true)
        .is("user_created_by", null)
        .maybeSingle();

      if (checkError && checkError.code !== "PGRST116") {
        throw checkError;
      }

      if (existing) {
        // Update existing
        const { error: updateError } = await supabase
          .from("topics")
          .update({
            title: topic.title,
            description: topic.description,
            is_active: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);

        if (updateError) {
          if (updateError.code === "23505" || updateError.message?.includes("unique")) {
            console.log("Topic already exists (race condition handled)");
            return existing.id;
          }
          throw updateError;
        }
        return existing.id;
      } else {
        // Insert new
        const { data: inserted, error: insertError } = await supabase
          .from("topics")
          .insert({
            title: topic.title,
            description: topic.description,
            date: today,
            is_active: true,
            user_created_by: null,
          })
          .select("id")
          .single();

        if (insertError) {
          if (insertError.code === "23505" || insertError.message?.includes("unique")) {
            console.log("Topic already exists (race condition handled)");
            // Fetch the existing topic
            const { data: existingTopic } = await supabase
              .from("topics")
              .select("id")
              .eq("date", today)
              .eq("is_active", true)
              .is("user_created_by", null)
              .maybeSingle();
            return existingTopic?.id || null;
          }
          throw insertError;
        }
        return inserted?.id || null;
      }
    }

    return topicId;
  } catch (error) {
    logErrorSafely("daily-topic-upsert", error);
    throw error;
  }
};

const handler = async () => {
  const today = formatISODate(new Date());
  console.log(`[daily-topic] Processing topic for ${today}`);

  try {
    // Check if topic for today already exists
    const { data: existingToday, error: todayError } = await supabase
      .from("topics")
      .select("*")
      .eq("date", today)
      .eq("is_active", true)
      .is("user_created_by", null)
      .maybeSingle();

    if (todayError && todayError.code !== "PGRST116") {
      throw todayError;
    }

    if (existingToday) {
      console.log(`[daily-topic] Topic for ${today} already exists: "${existingToday.title}"`);
      return {
        status: "ok",
        message: "Topic for today already exists.",
        topic: existingToday,
      };
    }

    // Get recent topics (last 30 days) to avoid repetition
    const { data: recentTopics, error: recentError } = await supabase
      .from("topics")
      .select("id, title, description, date")
      .is("user_created_by", null) // Only system topics
      .order("date", { ascending: false })
      .limit(30);

    if (recentError) {
      throw recentError;
    }

    console.log(`[daily-topic] Found ${recentTopics?.length || 0} recent topics`);

    // Try to generate topic with AI
    let generated = null;
    try {
      generated = await fetchGeneratedTopic(recentTopics ?? [], today);
      if (generated) {
        console.log(`[daily-topic] Generated AI topic: "${generated.title}"`);
      }
    } catch (error) {
      console.error("[daily-topic] Failed to generate topic from OpenAI:", error);
    }

    // Get used titles to avoid repetition
    const usedTitles = new Set<string>((recentTopics ?? []).map((topic) => topic.title.toLowerCase().trim()));
    
    // Check if generated topic is unique
    const isGeneratedUnique = generated && 
      generated.title && 
      !usedTitles.has(generated.title.toLowerCase().trim());

    // Select topic (AI-generated if unique, otherwise fallback)
    // chooseFallbackTopic always returns a valid topic, so selected is never null
    const selected: { title: string; description: string } = isGeneratedUnique && generated 
      ? generated 
      : chooseFallbackTopic(usedTitles, today);
    const source = isGeneratedUnique ? "openai" : "fallback";

    console.log(`[daily-topic] Selected ${source} topic: "${selected.title}"`);

    // Upsert the topic
    const topicId = await upsertTopic(selected, today);

    if (!topicId) {
      throw new Error("Failed to create topic - no ID returned");
    }

    return {
      status: "created",
      topic: {
        id: topicId,
        title: selected.title,
        description: selected.description,
        date: today,
        source: source as "openai" | "fallback",
      },
    };
  } catch (error) {
    logErrorSafely("daily-topic-handler", error, { today });
    throw error;
  }
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-device-id",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

serve(async (req) => {
  // Handle CORS preflight
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
