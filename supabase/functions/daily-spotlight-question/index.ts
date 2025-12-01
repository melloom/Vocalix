import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0?target=deno";
import { createErrorResponse, logErrorSafely } from "../_shared/error-handler.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase environment variables for daily-spotlight-question.");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Fallback questions pool - used if GPT fails
const FALLBACK_QUESTIONS = [
  "What's something small that made your day better?",
  "What's a moment from this week you're grateful for?",
  "What's something you learned about yourself recently?",
  "What's a place that always makes you feel calm?",
  "What's something kind someone did for you lately?",
  "What's a small victory you're celebrating?",
  "What's something that made you smile today?",
  "What's a memory that brings you joy?",
  "What's something you're looking forward to?",
  "What's a person who inspired you recently?",
  "What's something that helped you recharge?",
  "What's a lesson you've learned this month?",
  "What's something that gives you hope?",
  "What's a moment of connection you experienced?",
  "What's something you're curious about right now?",
];

const formatISODate = (date: Date) => {
  return date.toISOString().slice(0, 10);
};

/**
 * Generate a daily spotlight question using GPT
 */
async function generateSpotlightQuestion(
  todayTopic: { title: string; description: string | null } | null,
  recentQuestions: string[]
): Promise<string | null> {
  if (!OPENAI_API_KEY) {
    console.warn("OpenAI API key not available, will use fallback");
    return null;
  }

  const dayOfWeek = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const month = new Date().toLocaleDateString('en-US', { month: 'long' });
  const day = new Date().getDate();

  let prompt = `You are creating engaging daily questions for a voice-based social platform called "Echo Garden". 

Generate a single, thought-provoking question that will be featured as today's spotlight question.

Today is ${dayOfWeek}, ${month} ${day}.`;

  if (todayTopic) {
    prompt += `\n\nToday's daily topic is: "${todayTopic.title}"
${todayTopic.description ? `Description: "${todayTopic.description}"` : ""}

The question should relate to or be inspired by this topic, but it doesn't have to be exactly about it.`;
  }

  if (recentQuestions.length > 0) {
    prompt += `\n\nRecent questions to avoid (be creative and different):\n${recentQuestions.slice(0, 7).map((q, i) => `${i + 1}. ${q}`).join("\n")}`;
  }

  prompt += `\n\nRequirements:
- The question should encourage personal reflection and sharing
- Keep it concise (under 120 characters)
- Make it engaging and conversation-starting
- Avoid generic questions like "What do you think?" or "How are you?"
- Use a warm, inviting tone
- Should feel fresh and relevant
- Should inspire people to share their voice

Return ONLY the question text, nothing else. No quotes, no JSON, no formatting, just the question.`;

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
      console.error("OpenAI API error:", response.status, detail);
      return null;
    }

    const json = await response.json();
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      console.error("OpenAI returned empty content");
      return null;
    }

    // Clean up the response - remove quotes, extra whitespace, etc.
    const question = content.trim().replace(/^["']|["']$/g, "").trim();
    
    // Validate it's actually a question
    if (question.length < 10 || question.length > 200) {
      console.warn("Generated question length invalid:", question.length);
      return null;
    }

    // Check if it ends with a question mark
    if (!question.endsWith("?")) {
      console.warn("Generated question doesn't end with '?':", question);
      // Add question mark if missing
      return question + "?";
    }

    return question;
  } catch (error) {
    console.error("Error generating spotlight question:", error);
    return null;
  }
}

/**
 * Select a fallback question based on day of year
 */
function chooseFallbackQuestion(usedQuestions: Set<string>): string {
  const date = new Date();
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));

  // Filter out recently used questions
  const availableQuestions = FALLBACK_QUESTIONS.filter(
    (q) => !usedQuestions.has(q.toLowerCase().trim())
  );

  if (availableQuestions.length === 0) {
    // If all questions have been used recently, use day-of-year rotation
    const index = dayOfYear % FALLBACK_QUESTIONS.length;
    return FALLBACK_QUESTIONS[index];
  }

  // Use day of year to select from available questions
  const index = dayOfYear % availableQuestions.length;
  return availableQuestions[index];
}

const handler = async (req?: Request) => {
  const today = formatISODate(new Date());
  console.log(`[daily-spotlight-question] Processing spotlight question for ${today}`);

  try {
    // Parse request body to check for force flag
    let forceRegenerate = false;
    if (req) {
      try {
        const body = await req.json();
        forceRegenerate = body?.force === true;
      } catch {
        // No body or invalid JSON - that's ok, just use defaults
      }
    }

    // This function can be called from cron (no auth) or from frontend (with auth)
    // Both should work fine since we use service role key internally
    // Check if question for today already exists
    const { data: existingToday, error: todayError } = await supabase
      .from("daily_spotlight_questions")
      .select("*")
      .eq("date", today)
      .maybeSingle();

    if (todayError && todayError.code !== "PGRST116") {
      throw todayError;
    }

    // If question exists and not forcing regeneration, return existing
    if (existingToday && !forceRegenerate) {
      console.log(`[daily-spotlight-question] Question for ${today} already exists: "${existingToday.question}"`);
      return {
        status: "ok",
        message: "Question for today already exists.",
        question: existingToday,
      };
    }

    // If forcing regeneration, delete the existing question first
    if (existingToday && forceRegenerate) {
      console.log(`[daily-spotlight-question] Force regenerating - deleting existing question: "${existingToday.question}"`);
      await supabase
        .from("daily_spotlight_questions")
        .delete()
        .eq("id", existingToday.id);
    }

    // Get today's topic
    const { data: todayTopic, error: topicError } = await supabase
      .from("topics")
      .select("id, title, description")
      .eq("date", today)
      .eq("is_active", true)
      .is("user_created_by", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (topicError && topicError.code !== "PGRST116") {
      console.warn("[daily-spotlight-question] Error fetching today's topic:", topicError);
    }

    // Get recent questions (last 30 days) to avoid repetition
    const { data: recentQuestions, error: recentError } = await supabase
      .from("daily_spotlight_questions")
      .select("question")
      .order("date", { ascending: false })
      .limit(30);

    if (recentError) {
      console.warn("[daily-spotlight-question] Error fetching recent questions:", recentError);
    }

    const recentQuestionTexts = (recentQuestions || []).map((q: any) => q.question as string);
    const usedQuestions = new Set<string>(recentQuestionTexts.map((q: string) => q.toLowerCase().trim()));

    // Try to generate question with AI
    let generated: string | null = null;
    let source = "fallback";
    
    try {
      generated = await generateSpotlightQuestion(
        todayTopic || null,
        recentQuestionTexts
      );
      if (generated) {
        console.log(`[daily-spotlight-question] Generated AI question: "${generated}"`);
        source = "openai";
      }
    } catch (error) {
      console.error("[daily-spotlight-question] Failed to generate question from OpenAI:", error);
    }

    // Check if generated question is unique
    const isGeneratedUnique = generated && 
      !usedQuestions.has(generated.toLowerCase().trim());

    // Select question (AI-generated if unique, otherwise fallback)
    const selected: string = isGeneratedUnique && generated 
      ? generated 
      : chooseFallbackQuestion(usedQuestions);
    
    if (!isGeneratedUnique && generated) {
      source = "fallback";
    }

    console.log(`[daily-spotlight-question] Selected ${source} question: "${selected}"`);

    // Insert the question
    const { data: inserted, error: insertError } = await supabase
      .from("daily_spotlight_questions")
      .insert({
        date: today,
        question: selected,
        topic_id: todayTopic?.id || null,
        topic_title: todayTopic?.title || null,
        topic_description: todayTopic?.description || null,
        generated_by: source,
      })
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    if (!inserted) {
      throw new Error("Failed to create spotlight question - no data returned");
    }

    return {
      status: "created",
      question: inserted,
      source: source as "openai" | "fallback",
    };
  } catch (error) {
    logErrorSafely("daily-spotlight-question-handler", error, { today });
    throw error;
  }
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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-device-id, x-user-agent, x-session-token-hash, accept, origin",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PUT, DELETE",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400", // Cache preflight for 24 hours
  };
};

serve(async (req) => {
  // Always set up CORS headers first
  const corsHeaders = getCorsHeaders(req);

  // Handle CORS preflight - MUST return with all CORS headers
  if (req.method === "OPTIONS") {
    return new Response(null, { 
      status: 204,
      headers: {
        ...corsHeaders,
        "Content-Length": "0",
      },
    });
  }

  try {
    // Call handler - can be called from cron (no auth needed) or frontend
    const response = await handler(req);
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 
        ...corsHeaders, 
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("[daily-spotlight-question] Handler error:", error);
    console.error("[daily-spotlight-question] Error details:", error instanceof Error ? error.message : String(error));
    console.error("[daily-spotlight-question] Stack trace:", error instanceof Error ? error.stack : "No stack trace");
    
    // Ensure error logging doesn't crash
    try {
      logErrorSafely("daily-spotlight-question", error);
    } catch (logError) {
      console.error("[daily-spotlight-question] Error logging failed:", logError);
    }
    
    const isDevelopment = Deno.env.get("ENVIRONMENT") === "development";
    
    // Create error response directly with proper JSON
    const errorMessage = isDevelopment 
      ? (error instanceof Error ? error.message : String(error))
      : "Failed to generate spotlight question. Please try again later.";
    
    const errorBody = JSON.stringify({
      error: "Internal server error",
      message: errorMessage,
      ...(isDevelopment && error instanceof Error ? { details: error.stack } : {}),
    });
    
    // ALWAYS return CORS headers, even on error
    return new Response(errorBody, {
      status: 500,
      headers: { 
        ...corsHeaders, 
        "Content-Type": "application/json",
      },
    });
  }
});

