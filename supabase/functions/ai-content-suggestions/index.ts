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
  profile_id: string;
  suggestion_type: "topic" | "script" | "content_idea" | "title" | "hashtag" | "posting_time";
  context?: {
    interests?: string[];
    recent_clips?: any[];
    trending_topics?: string[];
    clip_transcript?: string;
    clip_summary?: string;
    target_audience?: string;
  };
  count?: number;
}

/**
 * Generate topic suggestions using OpenAI
 */
async function generateTopicSuggestions(
  context: RequestBody["context"],
  count: number = 5
): Promise<string[]> {
  const interests = context?.interests?.join(", ") || "general topics";
  const recentTopics = context?.trending_topics?.slice(0, 5).join(", ") || "none";

  const prompt = `You are a creative content strategist for an audio-first social platform. Generate ${count} engaging topic suggestions for voice clips.

User interests: ${interests}
Recent trending topics: ${recentTopics}

Generate topics that are:
- Engaging and conversation-starting
- Suitable for 30-second voice clips
- Relevant to current trends
- Diverse in themes (personal stories, opinions, questions, etc.)

Return ONLY a JSON array of topic strings, no explanations. Example: ["What's a small moment that made your day?", "Share a lesson you learned recently"]`;

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
          { role: "system", content: "You are a creative content strategist. Return only valid JSON arrays." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.8,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI error:", errorText);
      return [];
    }

    const json = await response.json();
    const content = json.choices?.[0]?.message?.content;
    if (!content) return [];

    const parsed = JSON.parse(content);
    const topics = parsed.topics || parsed;
    return Array.isArray(topics) ? topics.slice(0, count) : [];
  } catch (error) {
    console.error("Error generating topic suggestions:", error);
    return [];
  }
}

/**
 * Generate script suggestions using OpenAI
 */
async function generateScriptSuggestions(
  context: RequestBody["context"],
  count: number = 3
): Promise<string[]> {
  const topic = context?.trending_topics?.[0] || "a personal story";
  const interests = context?.interests?.join(", ") || "general content";

  const prompt = `You are a scriptwriting assistant for an audio-first social platform. Generate ${count} short script outlines for 30-second voice clips.

Topic/Theme: ${topic}
User interests: ${interests}

Each script should:
- Be suitable for 30 seconds (about 75-100 words when spoken)
- Have a clear hook in the first 5 seconds
- Be engaging and authentic
- Include natural speaking points

Return ONLY a JSON array of script outlines (strings), each about 2-3 sentences describing what to say. Example: ["Start with a surprising fact or question. Then share a personal anecdote that relates. End with a thought-provoking question for listeners."]`;

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
          { role: "system", content: "You are a scriptwriting assistant. Return only valid JSON arrays." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
        max_tokens: 600,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI error:", errorText);
      return [];
    }

    const json = await response.json();
    const content = json.choices?.[0]?.message?.content;
    if (!content) return [];

    const parsed = JSON.parse(content);
    const scripts = parsed.scripts || parsed;
    return Array.isArray(scripts) ? scripts.slice(0, count) : [];
  } catch (error) {
    console.error("Error generating script suggestions:", error);
    return [];
  }
}

/**
 * Generate content ideas using OpenAI
 */
async function generateContentIdeas(
  context: RequestBody["context"],
  count: number = 5
): Promise<string[]> {
  const interests = context?.interests?.join(", ") || "general content";
  const recentClips = context?.recent_clips?.length || 0;

  const prompt = `You are a content ideation expert for an audio-first social platform. Generate ${count} creative content ideas for voice clips.

User interests: ${interests}
User's recent clips: ${recentClips} clips

Generate diverse content ideas such as:
- Personal stories and anecdotes
- Opinions and hot takes
- Questions to engage audience
- Tips and advice
- Behind-the-scenes content
- Educational content

Each idea should be:
- Suitable for 30-second voice clips
- Engaging and shareable
- Authentic to the user's interests

Return ONLY a JSON array of content idea strings. Example: ["Share a moment when you felt proud", "Give your hot take on remote work"]`;

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
          { role: "system", content: "You are a content ideation expert. Return only valid JSON arrays." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.8,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI error:", errorText);
      return [];
    }

    const json = await response.json();
    const content = json.choices?.[0]?.message?.content;
    if (!content) return [];

    const parsed = JSON.parse(content);
    const ideas = parsed.ideas || parsed;
    return Array.isArray(ideas) ? ideas.slice(0, count) : [];
  } catch (error) {
    console.error("Error generating content ideas:", error);
    return [];
  }
}

/**
 * Generate title suggestions using OpenAI
 */
async function generateTitleSuggestions(
  context: RequestBody["context"],
  count: number = 5
): Promise<string[]> {
  const transcript = context?.clip_transcript || "";
  const summary = context?.clip_summary || "";
  const content = transcript || summary || "a voice clip";

  const prompt = `You are a title optimization expert for an audio-first social platform. Generate ${count} engaging title suggestions for a voice clip.

Clip content: ${content.substring(0, 500)}

Generate titles that are:
- Attention-grabbing and click-worthy
- Under 60 characters
- Clear about what the clip is about
- Use power words when appropriate
- Avoid clickbait or misleading titles

Return ONLY a JSON array of title strings. Example: ["The Moment That Changed Everything", "Why I Quit My Dream Job"]`;

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
          { role: "system", content: "You are a title optimization expert. Return only valid JSON arrays." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
        max_tokens: 400,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI error:", errorText);
      return [];
    }

    const json = await response.json();
    const content = json.choices?.[0]?.message?.content;
    if (!content) return [];

    const parsed = JSON.parse(content);
    const titles = parsed.titles || parsed;
    return Array.isArray(titles) ? titles.slice(0, count) : [];
  } catch (error) {
    console.error("Error generating title suggestions:", error);
    return [];
  }
}

/**
 * Generate hashtag suggestions using OpenAI
 */
async function generateHashtagSuggestions(
  context: RequestBody["context"],
  count: number = 10
): Promise<string[]> {
  const transcript = context?.clip_transcript || "";
  const summary = context?.clip_summary || "";
  const content = transcript || summary || "";
  const interests = context?.interests?.join(", ") || "";

  const prompt = `You are a hashtag optimization expert. Generate ${count} relevant hashtag suggestions for a voice clip.

Clip content: ${content.substring(0, 500)}
User interests: ${interests}

Generate hashtags that are:
- Relevant to the clip content
- Mix of popular and niche tags
- Not too generic or too specific
- Suitable for an audio-first platform
- Include trending hashtags when relevant

Return ONLY a JSON array of hashtag strings (without # symbol). Example: ["motivation", "lifelessons", "storytelling", "voicefirst"]`;

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
          { role: "system", content: "You are a hashtag optimization expert. Return only valid JSON arrays." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.6,
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI error:", errorText);
      return [];
    }

    const json = await response.json();
    const content = json.choices?.[0]?.message?.content;
    if (!content) return [];

    const parsed = JSON.parse(content);
    const hashtags = parsed.hashtags || parsed;
    return Array.isArray(hashtags) ? hashtags.slice(0, count) : [];
  } catch (error) {
    console.error("Error generating hashtag suggestions:", error);
    return [];
  }
}

/**
 * Get optimal posting time suggestions
 */
async function getPostingTimeSuggestions(
  context: RequestBody["context"],
  profileId: string
): Promise<{ time: string; reason: string; score: number }[]> {
  // Get user's historical posting data
  const { data: clips } = await supabase
    .from("clips")
    .select("created_at, listens_count, reactions")
    .eq("profile_id", profileId)
    .eq("status", "live")
    .order("created_at", { ascending: false })
    .limit(50);

  // Analyze best performing times
  const timePerformance: Record<string, { totalListens: number; count: number }> = {};
  
  if (clips && clips.length > 0) {
    clips.forEach((clip) => {
      const hour = new Date(clip.created_at).getHours();
      const hourKey = `${hour}:00`;
      if (!timePerformance[hourKey]) {
        timePerformance[hourKey] = { totalListens: 0, count: 0 };
      }
      timePerformance[hourKey].totalListens += clip.listens_count || 0;
      timePerformance[hourKey].count += 1;
    });
  }

  // Get general platform trends (you could enhance this with actual platform data)
  const suggestions = [
    { time: "8:00 AM", reason: "Morning commute time - high engagement", score: 0.85 },
    { time: "12:00 PM", reason: "Lunch break - peak listening time", score: 0.90 },
    { time: "5:00 PM", reason: "Evening commute - high engagement", score: 0.88 },
    { time: "8:00 PM", reason: "Evening relaxation - good for longer content", score: 0.75 },
  ];

  // Enhance with user-specific data if available
  if (Object.keys(timePerformance).length > 0) {
    const bestHour = Object.entries(timePerformance)
      .sort((a, b) => (b[1].totalListens / b[1].count) - (a[1].totalListens / a[1].count))[0];
    
    if (bestHour) {
      const hour = parseInt(bestHour[0].split(":")[0]);
      suggestions.unshift({
        time: `${hour}:00`,
        reason: "Your best performing time based on past clips",
        score: 0.95,
      });
    }
  }

  return suggestions.slice(0, 4);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body: RequestBody = await req.json();
    const { profile_id, suggestion_type, context, count = 5 } = body;

    if (!profile_id || !suggestion_type) {
      return new Response(
        JSON.stringify({ error: "Missing profile_id or suggestion_type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let suggestions: any[] = [];
    let metadata: any = {};

    switch (suggestion_type) {
      case "topic":
        const topics = await generateTopicSuggestions(context, count);
        suggestions = topics.map((topic) => ({
          content: topic,
          metadata: { confidence: 0.8 },
        }));
        break;

      case "script":
        const scripts = await generateScriptSuggestions(context, count);
        suggestions = scripts.map((script) => ({
          content: script,
          metadata: { confidence: 0.75 },
        }));
        break;

      case "content_idea":
        const ideas = await generateContentIdeas(context, count);
        suggestions = ideas.map((idea) => ({
          content: idea,
          metadata: { confidence: 0.8 },
        }));
        break;

      case "title":
        const titles = await generateTitleSuggestions(context, count);
        suggestions = titles.map((title) => ({
          content: title,
          metadata: { confidence: 0.7 },
        }));
        break;

      case "hashtag":
        const hashtags = await generateHashtagSuggestions(context, count);
        suggestions = hashtags.map((hashtag) => ({
          content: hashtag,
          metadata: { confidence: 0.75 },
        }));
        break;

      case "posting_time":
        const times = await getPostingTimeSuggestions(context, profile_id);
        suggestions = times.map((time) => ({
          content: typeof time === "string" ? time : time.time,
          metadata: typeof time === "object" ? { reason: time.reason, score: time.score } : {},
        }));
        break;

      default:
        return new Response(
          JSON.stringify({ error: "Invalid suggestion_type" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    // Save suggestions to database
    if (suggestions.length > 0) {
      const insertData = suggestions.map((s) => ({
        profile_id,
        suggestion_type,
        content: s.content,
        context: context || {},
        metadata: s.metadata || {},
      }));

      await supabase.from("ai_content_suggestions").insert(insertData);
    }

    return new Response(
      JSON.stringify({
        suggestions: suggestions.map((s) => s.content),
        metadata: suggestions.map((s) => s.metadata),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in ai-content-suggestions:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

