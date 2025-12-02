import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0?target=deno";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!OPENAI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing required environment variables for ai-moderation.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-device-id",
};

interface ModerationResult {
  spam_score: number;
  harassment_score: number;
  toxicity_score: number;
  overall_risk_score: number;
  detected_issues: string[];
  moderation_suggestions: string[];
  is_18_plus?: boolean;
  eighteen_plus_confidence?: number;
  eighteen_plus_issues?: string[];
}

/**
 * Analyze content for spam detection
 */
async function detectSpam(text: string): Promise<number> {
  if (!text || text.trim().length === 0) return 0;

  // Check for common spam patterns
  const spamPatterns = [
    /(?:buy|sell|click|free|limited|offer|discount|deal|win|prize|lottery)/gi,
    /(?:http|https|www\.)/gi,
    /(?:call|text|email|dm|message)\s+(?:now|today|asap)/gi,
    /(?:guaranteed|100%|risk-free|no questions asked)/gi,
  ];

  let spamScore = 0;
  for (const pattern of spamPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      spamScore += matches.length * 0.1;
    }
  }

  // Check for excessive repetition
  const words = text.toLowerCase().split(/\s+/);
  const wordCounts = new Map<string, number>();
  for (const word of words) {
    wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
  }
  const maxRepetition = Math.max(...Array.from(wordCounts.values()));
  if (maxRepetition > 5 && words.length < 20) {
    spamScore += 0.3;
  }

  // Check for excessive capitalization
  const capsRatio = (text.match(/[A-Z]/g) || []).length / text.length;
  if (capsRatio > 0.5 && text.length > 10) {
    spamScore += 0.2;
  }

  return Math.min(spamScore, 1.0);
}

/**
 * Analyze content for harassment detection
 */
async function detectHarassment(text: string): Promise<number> {
  if (!text || text.trim().length === 0) return 0;

  const harassmentPatterns = [
    /(?:kill|die|death|suicide|harm|hurt|violence)/gi,
    /(?:stupid|idiot|moron|dumb|retard|fool)/gi,
    /(?:hate|despise|loathe|disgusting)/gi,
    /(?:threat|threaten|warning|consequence)/gi,
  ];

  let harassmentScore = 0;
  for (const pattern of harassmentPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      harassmentScore += matches.length * 0.15;
    }
  }

  return Math.min(harassmentScore, 1.0);
}

/**
 * Detect 18+ content (NSFW/explicit content)
 */
async function detect18PlusContent(text: string): Promise<{
  is18Plus: boolean;
  confidence: number;
  detectedIssues: string[];
}> {
  if (!text || text.trim().length === 0) {
    return { is18Plus: false, confidence: 0, detectedIssues: [] };
  }

  // Enhanced explicit patterns - comprehensive NSFW detection
  const explicitPatterns = [
    // Sexual content patterns
    /(?:sex|sexual|nude|naked|porn|xxx|nsfw|explicit|adult|18\+|mature|erotic|sexy|horny|orgasm|masturbat|fap|cum|sperm|ejaculat)/gi,
    // Explicit language
    /(?:fuck|fucking|fucked|shit|damn|bitch|ass|dick|pussy|cock|tits|boobs|nipple|vagina|penis|clit|dildo|vibrator|kink|fetish|bdsm)/gi,
    // Violence/gore
    /(?:violence|gore|blood|death|kill|murder|torture|rape|abuse|assault|weapon|gun|knife|violence)/gi,
    // Substance references
    /(?:drug|alcohol|drunk|high|stoned|weed|cocaine|heroin|meth|addiction|overdose)/gi,
    // Taboo topics
    /(?:incest|pedophile|minor|underage|child porn|cp|bestiality|zoophilia)/gi,
  ];

  let matchCount = 0;
  const detectedIssues: string[] = [];
  const lowerText = text.toLowerCase();

  for (const pattern of explicitPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      matchCount += matches.length;
      if (pattern.source.includes("sex") || pattern.source.includes("nude") || pattern.source.includes("porn")) {
        detectedIssues.push("sexual content");
      } else if (pattern.source.includes("violence") || pattern.source.includes("gore")) {
        detectedIssues.push("violence");
      } else if (pattern.source.includes("drug") || pattern.source.includes("alcohol")) {
        detectedIssues.push("substance references");
      } else {
        detectedIssues.push("explicit language");
      }
    }
  }

  // Check OpenAI moderation API for sexual/explicit content
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  let openai18PlusScore = 0;
  if (OPENAI_API_KEY) {
    try {
      const response = await fetch("https://api.openai.com/v1/moderations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "omni-moderation-latest",
          input: text,
        }),
      });

      if (response.ok) {
        const json = await response.json();
        const result = json.results?.[0];
        if (result) {
          // Check for sexual/explicit content categories
          const categories = result.categories || {};
          const categoryScores = result.category_scores || {};
          
          if (categories.sexual || categories.sexual_minors) {
            openai18PlusScore = Math.max(
              openai18PlusScore,
              Number(categoryScores.sexual || 0),
              Number(categoryScores.sexual_minors || 0)
            );
            detectedIssues.push("sexual content (AI detected)");
          }
          
          if (categories.violence || categories.violence_graphic) {
            openai18PlusScore = Math.max(
              openai18PlusScore,
              Number(categoryScores.violence || 0),
              Number(categoryScores.violence_graphic || 0)
            );
            detectedIssues.push("violence (AI detected)");
          }
        }
      }
    } catch (error) {
      console.error("Error checking OpenAI for 18+ content:", error);
    }
  }

  // Calculate confidence based on pattern matches and OpenAI scores
  const patternScore = Math.min(matchCount * 0.15, 1.0); // More sensitive pattern matching
  const confidence = Math.max(patternScore, openai18PlusScore);
  const is18Plus = confidence > 0.25 || matchCount >= 2; // Lower threshold - be more inclusive for free speech zone

  return {
    is18Plus,
    confidence,
    detectedIssues: Array.from(new Set(detectedIssues)),
  };
}

/**
 * Use OpenAI moderation API for toxicity scoring
 */
async function detectToxicity(text: string): Promise<{
  toxicity_score: number;
  detected_issues: string[];
}> {
  if (!OPENAI_API_KEY || !text || text.trim().length === 0) {
    return { toxicity_score: 0, detected_issues: [] };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "omni-moderation-latest",
        input: text,
      }),
    });

    if (!response.ok) {
      console.error("OpenAI moderation API error:", await response.text());
      return { toxicity_score: 0, detected_issues: [] };
    }

    const json = await response.json();
    const result = json.results?.[0];
    if (!result) {
      return { toxicity_score: 0, detected_issues: [] };
    }

    const detectedIssues = Object.entries(result.categories || {})
      .filter(([, value]) => value)
      .map(([key]) => key.replace(/_/g, " "));

    const categoryScores = result.category_scores || {};
    const maxScore = Math.max(...Object.values(categoryScores).map(v => Number(v)));

    return {
      toxicity_score: Number.isFinite(maxScore) ? maxScore : 0,
      detected_issues: detectedIssues,
    };
  } catch (error) {
    console.error("Error calling OpenAI moderation API:", error);
    return { toxicity_score: 0, detected_issues: [] };
  }
}

/**
 * Generate moderation suggestions based on analysis
 */
function generateModerationSuggestions(
  spamScore: number,
  harassmentScore: number,
  toxicityScore: number,
  detectedIssues: string[]
): string[] {
  const suggestions: string[] = [];

  if (spamScore > 0.7) {
    suggestions.push("High spam likelihood - consider removing");
  } else if (spamScore > 0.4) {
    suggestions.push("Possible spam - review carefully");
  }

  if (harassmentScore > 0.7) {
    suggestions.push("Potential harassment detected - review immediately");
  } else if (harassmentScore > 0.4) {
    suggestions.push("Possible harassment - review content");
  }

  if (toxicityScore > 0.7) {
    suggestions.push("High toxicity - consider removing");
  } else if (toxicityScore > 0.4) {
    suggestions.push("Moderate toxicity - review content");
  }

  if (detectedIssues.length > 0) {
    suggestions.push(`Detected issues: ${detectedIssues.join(", ")}`);
  }

  if (suggestions.length === 0) {
    suggestions.push("Content appears safe - no action needed");
  }

  return suggestions;
}

/**
 * Analyze content and return moderation results
 */
async function analyzeContent(
  content: string,
  contentType: "clip" | "comment" | "profile" | "caption",
  contentId: string
): Promise<ModerationResult> {
  // Run all analyses in parallel
  const [spamScore, harassmentScore, toxicityData, eighteenPlusData] = await Promise.all([
    detectSpam(content),
    detectHarassment(content),
    detectToxicity(content),
    detect18PlusContent(content),
  ]);

  const { toxicity_score, detected_issues } = toxicityData;

  // Calculate overall risk score (0-10)
  // Add 18+ content to risk calculation
  const eighteenPlusRisk = eighteenPlusData.is18Plus ? eighteenPlusData.confidence * 2 : 0;
  const overallRiskScore = Math.min(
    (spamScore * 2) + (harassmentScore * 3) + (toxicity_score * 5) + eighteenPlusRisk,
    10
  );

  // Generate suggestions
  const moderationSuggestions = generateModerationSuggestions(
    spamScore,
    harassmentScore,
    toxicity_score,
    detected_issues
  );

  // Add 18+ content suggestion
  if (eighteenPlusData.is18Plus) {
    moderationSuggestions.push(
      `18+ content detected (confidence: ${(eighteenPlusData.confidence * 100).toFixed(0)}%). Consider marking as sensitive content.`
    );
  }

  return {
    spam_score: spamScore,
    harassment_score: harassmentScore,
    toxicity_score: toxicity_score,
    overall_risk_score: overallRiskScore,
    detected_issues: detected_issues,
    moderation_suggestions: moderationSuggestions,
    is_18_plus: eighteenPlusData.is18Plus,
    eighteen_plus_confidence: eighteenPlusData.confidence,
    eighteen_plus_issues: eighteenPlusData.detectedIssues,
  };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { content, content_type, content_id } = body;

    if (!content || !content_type || !content_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: content, content_type, content_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!["clip", "comment", "profile", "caption"].includes(content_type)) {
      return new Response(
        JSON.stringify({ error: "Invalid content_type. Must be one of: clip, comment, profile, caption" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Analyze content
    const result = await analyzeContent(
      content,
      content_type as "clip" | "comment" | "profile" | "caption",
      content_id
    );

    // Store results in database
    const { data, error } = await supabase
      .from("ai_moderation_results")
      .upsert({
        content_type: content_type,
        content_id: content_id,
        spam_score: result.spam_score,
        harassment_score: result.harassment_score,
        toxicity_score: result.toxicity_score,
        overall_risk_score: result.overall_risk_score,
        detected_issues: result.detected_issues,
        moderation_suggestions: result.moderation_suggestions,
        analyzed_at: new Date().toISOString(),
        model_version: "1.0",
        // Store 18+ content detection results in metadata
        metadata: {
          is_18_plus: result.is_18_plus || false,
          eighteen_plus_confidence: result.eighteen_plus_confidence || 0,
          eighteen_plus_issues: result.eighteen_plus_issues || [],
        },
      }, {
        onConflict: "content_type,content_id",
      })
      .select()
      .single();

    // If 18+ content is detected with high confidence, automatically tag content
    if (result.is_18_plus && result.eighteen_plus_confidence && result.eighteen_plus_confidence > 0.7) {
      try {
        if (content_type === "clip") {
          // Auto-tag clips as sensitive
          await supabase
            .from("clips")
            .update({ content_rating: "sensitive" })
            .eq("id", content_id);
          
          // Create a moderation flag for admin review
          await supabase
            .from("moderation_flags")
            .insert({
              clip_id: content_id,
              reasons: [`18+ content detected by AI (confidence: ${(result.eighteen_plus_confidence * 100).toFixed(0)}%)`],
              risk: Math.min(result.eighteen_plus_confidence * 10, 10),
              source: "ai",
              priority: 50,
              workflow_state: "pending",
            })
            .select()
            .single();
        } else if (content_type === "post" || content_type === "comment") {
          // Auto-tag posts as NSFW
          if (content_type === "post") {
            await supabase
              .from("posts")
              .update({ is_nsfw: true })
              .eq("id", content_id);
          }
        }
      } catch (autoFlagError) {
        console.error("Error auto-tagging 18+ content:", autoFlagError);
        // Don't fail the whole request if auto-tagging fails
      }
    }

    if (error) {
      console.error("Error storing AI moderation results:", error);
      // Still return the result even if storage fails
    }

    return new Response(
      JSON.stringify({
        success: true,
        result: result,
        stored: !error,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in ai-moderation function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

