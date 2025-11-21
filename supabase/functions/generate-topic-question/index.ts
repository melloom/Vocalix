import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0?target=deno";
import { createErrorResponse, logErrorSafely } from "../_shared/error-handler.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase environment variables for generate-topic-question.");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

interface RequestBody {
  topic_id?: string;
  topic_title?: string;
  topic_description?: string;
}

/**
 * Generate a question related to a topic using ChatGPT
 */
async function generateTopicQuestion(
  topicTitle: string,
  topicDescription: string | null
): Promise<string | null> {
  if (!OPENAI_API_KEY) {
    console.warn("OpenAI API key not available, cannot generate question");
    return null;
  }

  const prompt = `You are creating engaging questions for a voice-based social platform. Generate a single, thought-provoking question that relates to this daily topic:

Topic: "${topicTitle}"
${topicDescription ? `Description: "${topicDescription}"` : ""}

Requirements:
- The question should be directly related to the topic
- It should encourage personal reflection and sharing
- Keep it concise (under 100 characters)
- Make it engaging and conversation-starting
- Avoid generic questions like "What do you think?"
- Use a warm, inviting tone

Return ONLY the question text, nothing else. No quotes, no JSON, just the question.`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.8,
        max_tokens: 150,
        messages: [
          {
            role: "system",
            content: "You are a creative question generator for a voice-based social platform. Return only the question text, no formatting, no JSON, no quotes.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("OpenAI generate-topic-question error:", detail);
      return null;
    }

    const json = await response.json();
    const content = json.choices?.[0]?.message?.content;
    if (!content) return null;

    // Clean up the response - remove quotes, extra whitespace, etc.
    const question = content.trim().replace(/^["']|["']$/g, "").trim();
    
    // Validate it's actually a question
    if (question.length < 10 || question.length > 200) {
      console.warn("Generated question length invalid:", question.length);
      return null;
    }

    return question;
  } catch (error) {
    console.error("Error generating topic question:", error);
    return null;
  }
}

const handler = async (req: Request) => {
  try {
    const body: RequestBody = await req.json().catch(() => ({}));
    
    let topicTitle: string;
    let topicDescription: string | null = null;
    let topicId: string | null = null;

    // If topic_id is provided, fetch the topic
    if (body.topic_id) {
      const { data: topic, error } = await supabase
        .from("topics")
        .select("id, title, description")
        .eq("id", body.topic_id)
        .eq("is_active", true)
        .single();

      if (error || !topic) {
        return new Response(
          JSON.stringify({ error: "Topic not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }

      topicTitle = topic.title;
      topicDescription = topic.description;
      topicId = topic.id;
    } else if (body.topic_title) {
      // Use provided topic info
      topicTitle = body.topic_title;
      topicDescription = body.topic_description || null;
    } else {
      // Get today's topic
      const today = new Date().toISOString().slice(0, 10);
      const { data: todayTopic, error } = await supabase
        .from("topics")
        .select("id, title, description")
        .eq("date", today)
        .eq("is_active", true)
        .is("user_created_by", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !todayTopic) {
        return new Response(
          JSON.stringify({ error: "Today's topic not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }

      topicTitle = todayTopic.title;
      topicDescription = todayTopic.description;
      topicId = todayTopic.id;
    }

    // Generate the question
    const question = await generateTopicQuestion(topicTitle, topicDescription);

    if (!question) {
      return new Response(
        JSON.stringify({ error: "Failed to generate question" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        question,
        topic_id: topicId,
        topic_title: topicTitle,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    logErrorSafely("generate-topic-question", error);
    const isDevelopment = Deno.env.get("ENVIRONMENT") === "development";
    const errorResponse = createErrorResponse(error, 500, isDevelopment);
    return new Response(errorResponse.body, errorResponse);
  }
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-device-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const response = await handler(req);
  return new Response(response.body, {
    ...response,
    headers: { ...corsHeaders, ...response.headers },
  });
});

