import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0?target=deno";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OPENAI_API_KEY) {
  throw new Error("Missing required environment variables");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-device-id",
};

interface RequestBody {
  clip_id: string;
  transcript?: string;
  summary?: string;
  title?: string;
  tags?: string[];
  duration_seconds?: number;
  profile_id?: string;
}

/**
 * Analyze sentiment using OpenAI
 */
async function analyzeSentiment(
  text: string
): Promise<{ score: number; label: string }> {
  if (!text || text.trim().length < 10) {
    return { score: 0, label: "neutral" };
  }

  const prompt = `Analyze the sentiment of the following text and return a JSON object with:
- "score": a number between -1 (very negative) and 1 (very positive)
- "label": one of "positive", "negative", "neutral", or "mixed"

Text: "${text.substring(0, 1000)}"

Return ONLY the JSON object, no explanations.`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a sentiment analysis expert. Return only valid JSON objects." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI error:", errorText);
      return { score: 0, label: "neutral" };
    }

    const json = await response.json();
    const content = json.choices?.[0]?.message?.content;
    if (!content) return { score: 0, label: "neutral" };

    const parsed = JSON.parse(content);
    return {
      score: Math.max(-1, Math.min(1, parsed.score || 0)),
      label: parsed.label || "neutral",
    };
  } catch (error) {
    console.error("Error analyzing sentiment:", error);
    return { score: 0, label: "neutral" };
  }
}

/**
 * Predict engagement using historical data and AI
 */
async function predictEngagement(
  clipData: RequestBody,
  profileId?: string
): Promise<number> {
  // Get creator's historical performance
  let avgListens = 0;
  let avgReactions = 0;

  if (profileId) {
    const { data: clips } = await supabase
      .from("clips")
      .select("listens_count, reactions")
      .eq("profile_id", profileId)
      .eq("status", "live")
      .order("created_at", { ascending: false })
      .limit(20);

    if (clips && clips.length > 0) {
      const totalListens = clips.reduce((sum, c) => sum + (c.listens_count || 0), 0);
      const totalReactions = clips.reduce((sum, c) => {
        const reactions = typeof c.reactions === "object" ? c.reactions : {};
        const reactionCount = Object.values(reactions).reduce((s: number, v: any) => s + (v || 0), 0);
        return sum + reactionCount;
      }, 0);
      avgListens = totalListens / clips.length;
      avgReactions = totalReactions / clips.length;
    }
  }

  // Use AI to enhance prediction based on content
  const content = clipData.transcript || clipData.summary || "";
  const title = clipData.title || "";
  const hasTitle = title.length > 0;
  const hasTags = clipData.tags && clipData.tags.length > 0;
  const duration = clipData.duration_seconds || 30;
  const optimalDuration = duration >= 15 && duration <= 30;

  // Base prediction on historical data
  let predictedListens = avgListens || 10; // Default if no history

  // Adjust based on content quality indicators
  const adjustments = {
    hasTitle: hasTitle ? 1.2 : 1.0,
    hasTags: hasTags ? 1.15 : 1.0,
    optimalDuration: optimalDuration ? 1.1 : 0.9,
    contentLength: content.length > 50 ? 1.1 : 0.9,
  };

  predictedListens *= adjustments.hasTitle * adjustments.hasTags * adjustments.optimalDuration * adjustments.contentLength;

  // Use AI to refine prediction
  if (content.length > 20) {
    const prompt = `Based on this voice clip content, predict engagement (listens and reactions) on a scale of 0-100.

Content: "${content.substring(0, 500)}"
Title: "${title}"
Tags: ${clipData.tags?.join(", ") || "none"}

Consider:
- Content quality and appeal
- Topic relevance and timeliness
- Title effectiveness
- Tag relevance

Return ONLY a JSON object with "engagement_score" (0-100).`;

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "You are an engagement prediction expert. Return only valid JSON objects." },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
          temperature: 0.3,
          max_tokens: 200,
        }),
      });

      if (response.ok) {
        const json = await response.json();
        const aiContent = json.choices?.[0]?.message?.content;
        if (aiContent) {
          const parsed = JSON.parse(aiContent);
          const aiScore = parsed.engagement_score || 50;
          // Blend AI prediction with historical data
          predictedListens = (predictedListens * 0.6) + (aiScore * 0.4);
        }
      }
    } catch (error) {
      console.error("Error in AI engagement prediction:", error);
    }
  }

  return Math.round(predictedListens);
}

/**
 * Assess content quality using AI
 */
async function assessQuality(
  clipData: RequestBody
): Promise<{ score: number; suggestions: string[] }> {
  const content = clipData.transcript || clipData.summary || "";
  const title = clipData.title || "";
  const tags = clipData.tags || [];
  const duration = clipData.duration_seconds || 30;

  if (!content || content.length < 20) {
    return {
      score: 0.5,
      suggestions: ["Add more content to your clip", "Consider adding a title"],
    };
  }

  const prompt = `Assess the quality of this voice clip content and provide:
1. A quality score from 0.0 to 1.0
2. 3-5 specific improvement suggestions

Content: "${content.substring(0, 1000)}"
Title: "${title || "No title"}"
Tags: ${tags.length > 0 ? tags.join(", ") : "None"}
Duration: ${duration} seconds

Consider:
- Content clarity and coherence
- Engagement potential
- Title effectiveness
- Tag relevance
- Overall appeal

Return ONLY a JSON object with:
- "quality_score": number (0.0-1.0)
- "suggestions": array of strings (3-5 improvement suggestions)`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a content quality assessment expert. Return only valid JSON objects." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: 400,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI error:", errorText);
      return {
        score: 0.6,
        suggestions: ["Consider adding more detail", "Add a compelling title", "Include relevant tags"],
      };
    }

    const json = await response.json();
    const aiContent = json.choices?.[0]?.message?.content;
    if (!aiContent) {
      return {
        score: 0.6,
        suggestions: ["Consider adding more detail", "Add a compelling title"],
      };
    }

    const parsed = JSON.parse(aiContent);
    return {
      score: Math.max(0, Math.min(1, parsed.quality_score || 0.6)),
      suggestions: Array.isArray(parsed.suggestions)
        ? parsed.suggestions.slice(0, 5)
        : ["Consider adding more detail", "Add a compelling title"],
    };
  } catch (error) {
    console.error("Error assessing quality:", error);
    return {
      score: 0.6,
      suggestions: ["Consider adding more detail", "Add a compelling title", "Include relevant tags"],
    };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body: RequestBody = await req.json();
    const { clip_id, transcript, summary, title, tags, duration_seconds, profile_id } = body;

    if (!clip_id) {
      return new Response(
        JSON.stringify({ error: "Missing clip_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const content = transcript || summary || "";
    if (!content || content.length < 10) {
      return new Response(
        JSON.stringify({ error: "Content too short for analysis" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Run all analyses in parallel
    const [sentiment, engagement, quality] = await Promise.all([
      analyzeSentiment(content),
      predictEngagement({ clip_id, transcript, summary, title, tags, duration_seconds }, profile_id),
      assessQuality({ clip_id, transcript, summary, title, tags, duration_seconds }),
    ]);

    // Save analysis to database
    const { error: insertError } = await supabase
      .from("ai_content_analysis")
      .insert({
        clip_id,
        profile_id: profile_id || null,
        sentiment_score: sentiment.score,
        sentiment_label: sentiment.label,
        engagement_prediction: engagement,
        quality_score: quality.score,
        improvement_suggestions: quality.suggestions,
        analysis_metadata: {
          has_title: !!title,
          has_tags: tags && tags.length > 0,
          duration: duration_seconds,
          content_length: content.length,
        },
      });

    if (insertError) {
      console.error("Error saving analysis:", insertError);
    }

    return new Response(
      JSON.stringify({
        sentiment: {
          score: sentiment.score,
          label: sentiment.label,
        },
        engagement_prediction: engagement,
        quality: {
          score: quality.score,
          suggestions: quality.suggestions,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in ai-content-analysis:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

