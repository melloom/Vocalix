import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0?target=deno";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ACCESS_CODE = Deno.env.get("NSFW_ANALYZER_ACCESS_CODE") || Deno.env.get("ACCESS_CODE");

if (!OPENAI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing required environment variables for analyze-nsfw-content.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-access-code",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface AnalyzeRequest {
  content_type: "clip" | "post" | "comment";
  content_id: string;
  text_content?: string;
  access_code?: string;
}

interface AnalyzeResponse {
  success: boolean;
  is_nsfw: boolean;
  confidence: number;
  auto_tagged: boolean;
  detected_issues?: string[];
  error?: string;
}

/**
 * Validate access code
 */
function validateAccessCode(providedCode: string | null): boolean {
  if (!ACCESS_CODE) {
    // If no access code is set, allow all requests (dev mode)
    console.warn("No ACCESS_CODE set - allowing all requests");
    return true;
  }
  
  if (!providedCode) {
    return false;
  }
  
  return providedCode === ACCESS_CODE;
}

/**
 * Enhanced NSFW detection with OpenAI moderation
 */
async function detectNSFWContent(text: string): Promise<{
  is_nsfw: boolean;
  confidence: number;
  detected_issues: string[];
}> {
  if (!text || text.trim().length === 0) {
    return { is_nsfw: false, confidence: 0, detected_issues: [] };
  }

  const explicitPatterns = [
    // Sexual content patterns
    /(?:sex|sexual|nude|naked|porn|xxx|nsfw|explicit|adult|18\+|mature|erotic|sexy|horny|orgasm|masturbat|fap|cum|sperm|ejaculat)/gi,
    // Explicit language
    /(?:fuck|fucking|fucked|shit|damn|bitch|ass|dick|pussy|cock|tits|boobs|nipple|vagina|penis|clit|dildo|vibrator|kink|fetish|bdsm)/gi,
    // Violence/gore
    /(?:violence|gore|blood|death|kill|murder|torture|rape|abuse|assault|weapon|gun|knife)/gi,
    // Substance references
    /(?:drug|alcohol|drunk|high|stoned|weed|cocaine|heroin|meth|addiction|overdose)/gi,
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
          const categories = result.categories || {};
          const categoryScores = result.category_scores || {};
          
          if (categories.sexual || categories.sexual_minors) {
            openai18PlusScore = Math.max(
              openai18PlusScore,
              Number(categoryScores.sexual || 0),
              Number(categoryScores.sexual_minors || 0)
            );
            if (!detectedIssues.includes("sexual content (AI detected)")) {
              detectedIssues.push("sexual content (AI detected)");
            }
          }
          
          if (categories.violence || categories.violence_graphic) {
            openai18PlusScore = Math.max(
              openai18PlusScore,
              Number(categoryScores.violence || 0),
              Number(categoryScores.violence_graphic || 0)
            );
            if (!detectedIssues.includes("violence (AI detected)")) {
              detectedIssues.push("violence (AI detected)");
            }
          }
        }
      }
    } catch (error) {
      console.error("Error checking OpenAI for 18+ content:", error);
    }
  }

  // Calculate confidence based on pattern matches and OpenAI scores
  const patternScore = Math.min(matchCount * 0.15, 1.0);
  const confidence = Math.max(patternScore, openai18PlusScore);
  const is18Plus = confidence > 0.25 || matchCount >= 2; // Lower threshold for free speech zone

  return {
    is_nsfw: is18Plus,
    confidence: Math.round(confidence * 100) / 100,
    detected_issues: [...new Set(detectedIssues)], // Remove duplicates
  };
}

/**
 * Auto-tag content based on NSFW detection
 */
async function autoTagContent(
  contentType: "clip" | "post" | "comment",
  contentId: string,
  isNSFW: boolean,
  confidence: number
): Promise<boolean> {
  if (!isNSFW || confidence < 0.25) {
    return false;
  }

  try {
    if (contentType === "clip") {
      await supabase
        .from("clips")
        .update({ content_rating: "sensitive" })
        .eq("id", contentId);
      
      // Create moderation flag for admin review
      await supabase
        .from("moderation_flags")
        .insert({
          clip_id: contentId,
          reasons: [`18+ content detected by analyzer (confidence: ${(confidence * 100).toFixed(0)}%)`],
          risk: Math.min(confidence * 10, 10),
          source: "ai_analyzer",
          priority: 50,
          workflow_state: "pending",
        });
    } else if (contentType === "post") {
      await supabase
        .from("posts")
        .update({ is_nsfw: true })
        .eq("id", contentId);
    }
    
    return true;
  } catch (error) {
    console.error("Error auto-tagging content:", error);
    return false;
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        {
          status: 405,
          headers: { ...corsHeaders, "content-type": "application/json" },
        }
      );
    }

    // Get access code from header or body
    const accessCodeHeader = req.headers.get("x-access-code");
    const body: AnalyzeRequest = await req.json();
    const accessCode = accessCodeHeader || body.access_code;

    // Validate access code
    if (!validateAccessCode(accessCode)) {
      return new Response(
        JSON.stringify({
          error: "Invalid or missing access code",
          message: "Please provide a valid access code in the X-Access-Code header or request body",
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "content-type": "application/json" },
        }
      );
    }

    const { content_type, content_id, text_content } = body;

    if (!content_type || !content_id) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields",
          message: "content_type and content_id are required",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "content-type": "application/json" },
        }
      );
    }

    if (!["clip", "post", "comment"].includes(content_type)) {
      return new Response(
        JSON.stringify({
          error: "Invalid content_type",
          message: "content_type must be one of: clip, post, comment",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "content-type": "application/json" },
        }
      );
    }

    // If text_content not provided, fetch from database
    let textContent = text_content;
    if (!textContent) {
      if (content_type === "clip") {
        const { data: clip } = await supabase
          .from("clips")
          .select("captions, summary, title")
          .eq("id", content_id)
          .single();
        
        textContent = [clip?.title, clip?.summary, clip?.captions]
          .filter(Boolean)
          .join(" ");
      } else if (content_type === "post") {
        const { data: post } = await supabase
          .from("posts")
          .select("title, content")
          .eq("id", content_id)
          .single();
        
        textContent = [post?.title, post?.content]
          .filter(Boolean)
          .join(" ");
      }
    }

    if (!textContent || textContent.trim().length === 0) {
      return new Response(
        JSON.stringify({
          error: "No content to analyze",
          message: "text_content is required or content must exist in database",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "content-type": "application/json" },
        }
      );
    }

    // Detect NSFW content
    const detectionResult = await detectNSFWContent(textContent);

    // Auto-tag if NSFW detected
    const autoTagged = await autoTagContent(
      content_type,
      content_id,
      detectionResult.is_nsfw,
      detectionResult.confidence
    );

    const response: AnalyzeResponse = {
      success: true,
      is_nsfw: detectionResult.is_nsfw,
      confidence: detectionResult.confidence,
      auto_tagged: autoTagged,
      detected_issues: detectionResult.detected_issues,
    };

    return new Response(
      JSON.stringify(response),
      {
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in analyze-nsfw-content function:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
        success: false,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "content-type": "application/json" },
      }
    );
  }
});

