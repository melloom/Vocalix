import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0?target=deno";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing required environment variables");
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-device-id",
};

interface ContentSecurityCheckResult {
  scan_results: {
    clips_scanned: number;
    flags_created: number;
    errors: number;
  };
  queue_results: {
    items_processed: number;
    auto_resolved: number;
    escalated: number;
  };
  summary: string;
}

/**
 * Scan content using OpenAI moderation API
 */
async function scanContentWithOpenAI(text: string): Promise<{
  flagged: boolean;
  reasons: string[];
  risk: number;
}> {
  if (!OPENAI_API_KEY || !text || text.trim().length === 0) {
    return { flagged: false, reasons: [], risk: 0 };
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
      const errorText = await response.text();
      console.error("OpenAI moderation API error:", errorText);
      return { flagged: false, reasons: [], risk: 0 };
    }

    const json = await response.json();
    const result = json.results?.[0];
    if (!result) {
      return { flagged: false, reasons: [], risk: 0 };
    }

    const reasons = Object.entries(result.categories || {})
      .filter(([, value]) => value)
      .map(([key]) => key.replace(/_/g, " "));
    const risk = Math.max(...Object.values(result.category_scores || { default: 0 }));

    return {
      flagged: Boolean(result.flagged),
      reasons,
      risk: Number.isFinite(risk) ? risk : 0,
    };
  } catch (error) {
    console.error("Error calling OpenAI moderation API:", error);
    return { flagged: false, reasons: [], risk: 0 };
  }
}

/**
 * Enhanced content scanning with OpenAI moderation
 */
async function enhancedContentScan(
  supabase: ReturnType<typeof createClient>,
  limit: number = 50
): Promise<{
  clips_scanned: number;
  flags_created: number;
  errors: number;
}> {
  let clips_scanned = 0;
  let flags_created = 0;
  let errors = 0;

  try {
    // Get clips that need scanning
    const { data: clips, error: clipsError } = await supabase
      .from("clips")
      .select("id, captions, title, summary, status, moderation, created_at")
      .eq("status", "live")
      .not("captions", "is", null)
      .neq("captions", "")
      .or(
        `moderation.is.null,moderation->last_checked.lt.${new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()}`
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (clipsError) {
      console.error("Error fetching clips for scanning:", clipsError);
      return { clips_scanned: 0, flags_created: 0, errors: 1 };
    }

    if (!clips || clips.length === 0) {
      return { clips_scanned: 0, flags_created: 0, errors: 0 };
    }

    // Check for existing active flags
    const clipIds = clips.map((c) => c.id);
    const { data: existingFlags } = await supabase
      .from("moderation_flags")
      .select("clip_id")
      .in("clip_id", clipIds)
      .in("workflow_state", ["pending", "in_review"]);

    const flaggedClipIds = new Set(
      existingFlags?.map((f) => f.clip_id) || []
    );

    // Scan each clip
    for (const clip of clips) {
      try {
        // Skip if already flagged
        if (flaggedClipIds.has(clip.id)) {
          continue;
        }

        clips_scanned++;

        // Combine text for moderation
        const textToScan = [
          clip.title || "",
          clip.captions || "",
          clip.summary || "",
        ]
          .filter(Boolean)
          .join(" ");

        if (!textToScan || textToScan.trim().length < 10) {
          // Update last checked time
          await supabase
            .from("clips")
            .update({
              moderation: {
                ...(clip.moderation || {}),
                last_checked: new Date().toISOString(),
                automated_scan: true,
              },
            })
            .eq("id", clip.id);
          continue;
        }

        // Scan with OpenAI
        const moderationResult = await scanContentWithOpenAI(textToScan);

        // Update clip moderation metadata
        await supabase
          .from("clips")
          .update({
            moderation: {
              ...(clip.moderation || {}),
              last_checked: new Date().toISOString(),
              automated_scan: true,
              flagged: moderationResult.flagged,
              risk: moderationResult.risk,
            },
          })
          .eq("id", clip.id);

        // Check if content is 18+ (sexual/explicit content)
        const is18Plus = moderationResult.reasons.some((reason: string) => {
          const lowerReason = reason.toLowerCase();
          return lowerReason.includes("sexual") || 
                 lowerReason.includes("explicit") || 
                 lowerReason.includes("nsfw") ||
                 lowerReason.includes("adult");
        });

        // If 18+ content detected with high confidence, automatically mark as sensitive
        if (is18Plus && moderationResult.risk >= 0.7) {
          await supabase
            .from("clips")
            .update({ content_rating: "sensitive" })
            .eq("id", clip.id);
        }

        // Create flag if needed
        if (moderationResult.flagged) {
          const flagReasons = is18Plus 
            ? [...moderationResult.reasons, "18+ content detected"]
            : moderationResult.reasons;

          const { error: flagError } = await supabase
            .from("moderation_flags")
            .insert({
              clip_id: clip.id,
              reasons: flagReasons,
              risk: moderationResult.risk,
              source: "ai",
              priority: Math.min(Math.floor(moderationResult.risk * 10), 100),
            });

          if (!flagError) {
            flags_created++;

            // Notify admins for high-risk flags
            if (moderationResult.risk >= 7) {
              await supabase.rpc("notify_admins_high_risk_flag", {
                p_flag_id: null, // Will be set by trigger
                p_clip_id: clip.id,
                p_risk: moderationResult.risk,
                p_reasons: flagReasons,
                p_source: "ai",
              });
            }
          }
        }
      } catch (error) {
        console.error(`Error scanning clip ${clip.id}:`, error);
        errors++;
      }
    }
  } catch (error) {
    console.error("Error in enhanced content scan:", error);
    errors++;
  }

  return { clips_scanned, flags_created, errors };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const { action, limit } = body;

    // Run automated content security checks
    if (action === "run_checks" || !action) {
      // Run database-based checks
      const { data: dbResults, error: dbError } = await supabase.rpc(
        "run_automated_content_security_checks"
      );

      if (dbError) {
        console.error("Error running database checks:", dbError);
      }

      // Run enhanced OpenAI-based scanning
      const enhancedResults = await enhancedContentScan(supabase, limit || 50);

      const results: ContentSecurityCheckResult = {
        scan_results: {
          clips_scanned:
            (dbResults?.[0]?.scan_results?.clips_scanned || 0) +
            enhancedResults.clips_scanned,
          flags_created:
            (dbResults?.[0]?.scan_results?.flags_created || 0) +
            enhancedResults.flags_created,
          errors:
            (dbResults?.[0]?.scan_results?.errors || 0) + enhancedResults.errors,
        },
        queue_results: dbResults?.[0]?.queue_results || {
          items_processed: 0,
          auto_resolved: 0,
          escalated: 0,
        },
        summary:
          dbResults?.[0]?.summary ||
          "Automated content security checks completed",
      };

      return new Response(JSON.stringify(results), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    // Scan content only
    if (action === "scan_content") {
      const results = await enhancedContentScan(supabase, limit || 50);
      return new Response(JSON.stringify(results), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    // Process moderation queue only
    if (action === "process_queue") {
      const { data, error } = await supabase.rpc(
        "process_moderation_queue_automation"
      );

      if (error) {
        throw error;
      }

      return new Response(JSON.stringify(data?.[0] || {}), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in automated-content-security:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "content-type": "application/json" },
      }
    );
  }
});

