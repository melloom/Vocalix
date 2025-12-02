import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0?target=deno";
import { checkRateLimit, getRateLimitKey, createRateLimitHeaders } from "../_shared/rate-limit.ts";
import { createErrorResponse, logErrorSafely } from "../_shared/error-handler.ts";
import { 
  getRequestIPAddress, 
  logIPActivity, 
  checkIPRateLimit, 
  isIPBlacklisted,
  detectSuspiciousIPPattern 
} from "../_shared/security.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase configuration for add-voice-comment.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const getProfileIdFromDevice = async (deviceId: string | null) => {
  if (!deviceId) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("device_id", deviceId)
    .single();

  if (error || !data) {
    return null;
  }

  return data.id as string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ORIGIN") || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-device-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Credentials": "true",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

const MAX_DURATION_SECONDS = 30;
const MIN_DURATION_SECONDS = 1;
const MAX_COMMENT_LENGTH = 1000;
const MIN_COMMENT_LENGTH = 1;
const MAX_COMMENTS_PER_CLIP = 10; // Increased for conversations (was 5)
const MAX_REPLIES_PER_THREAD = 20; // Allow more replies in active threads
const MAX_COMMENTS_PER_DAY = 100; // Increased daily limit (was 50)
const COMMENT_COOLDOWN_SECONDS = 5; // Reduced cooldown for top-level comments (was 10)
const REPLY_COOLDOWN_SECONDS = 3; // Shorter cooldown for replies in conversations

// Spam keywords to filter
const SPAM_KEYWORDS = [
  "buy now", "click here", "limited time", "act now", "free money",
  "viagra", "casino", "lottery", "winner", "prize", "clickbait",
  "spam", "advertisement", "promo code", "discount code", "get rich"
];

const containsSpamKeywords = (text: string): boolean => {
  if (!text) return false;
  const lowerText = text.toLowerCase();
  return SPAM_KEYWORDS.some(keyword => lowerText.includes(keyword));
};

const checkDuplicateComment = async (
  supabase: ReturnType<typeof createClient>,
  profileId: string,
  clipId: string,
  audioBase64: string,
  durationSeconds: number,
  parentCommentId: string | null
): Promise<boolean> => {
  try {
    // Get recent comments from this profile on this clip
    // Check within same conversation thread if it's a reply
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    let query = supabase
      .from("comments")
      .select("audio_path, duration_seconds, parent_comment_id, created_at")
      .eq("profile_id", profileId)
      .eq("clip_id", clipId)
      .gte("created_at", tenMinutesAgo)
      .is("deleted_at", null);

    // If replying, only check duplicates within the same thread
    if (parentCommentId) {
      query = query.eq("parent_comment_id", parentCommentId);
    } else {
      // For top-level comments, only check other top-level comments
      query = query.is("parent_comment_id", null);
    }

    const { data: recentComments, error } = await query;

    if (error || !recentComments) return false;

    // Check if audio duration matches any recent comment in the same context
    // In production, you'd compare audio fingerprints/hashes
    const matchingDuration = recentComments.some(
      comment => Math.abs(comment.duration_seconds - durationSeconds) < 0.5
    );

    return matchingDuration;
  } catch (error) {
    console.error("Error checking duplicate comment:", error);
    return false; // Allow on error to avoid blocking legitimate users
  }
};

serve(async (req) => {
  // Handle CORS preflight
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

    const deviceId = req.headers.get("x-device-id");
    const profileId = await getProfileIdFromDevice(deviceId);
    if (!profileId) {
      return new Response(JSON.stringify({ error: "Profile not found" }), { 
        status: 403,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const { clipId, audioBase64, audioType, durationSeconds, parentCommentId, content } = await req.json();

    if (!clipId || !audioBase64 || !durationSeconds) {
      return new Response(
        JSON.stringify({ error: "clipId, audioBase64, and durationSeconds are required" }), 
        { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

    // Validate comment content length if provided
    if (content !== null && content !== undefined) {
      const trimmedContent = typeof content === "string" ? content.trim() : "";
      if (trimmedContent.length > 0) {
        if (trimmedContent.length < MIN_COMMENT_LENGTH) {
          return new Response(
            JSON.stringify({ error: `Comment must be at least ${MIN_COMMENT_LENGTH} character long` }), 
            { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } }
          );
        }
        if (trimmedContent.length > MAX_COMMENT_LENGTH) {
          return new Response(
            JSON.stringify({ error: `Comment must be no more than ${MAX_COMMENT_LENGTH} characters` }), 
            { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } }
          );
        }
        // Check for spam keywords
        if (containsSpamKeywords(trimmedContent)) {
          return new Response(
            JSON.stringify({ error: "Comment contains inappropriate content" }), 
            { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } }
          );
        }
      }
    }

    // Verify clip exists
    const { data: clip, error: clipError } = await supabase
      .from("clips")
      .select("id")
      .eq("id", clipId)
      .single();

    if (clipError || !clip) {
      return new Response(JSON.stringify({ error: "Clip not found" }), { status: 404, headers: { ...corsHeaders, "content-type": "application/json" } });
    }

    // Validate duration
    if (durationSeconds < MIN_DURATION_SECONDS || durationSeconds > MAX_DURATION_SECONDS) {
      return new Response(
        JSON.stringify({ error: `Duration must be between ${MIN_DURATION_SECONDS} and ${MAX_DURATION_SECONDS} seconds` }), 
        { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

    // Check per-clip comment limit (more lenient for conversation threads)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    // If it's a reply, check thread-specific limit instead of per-clip limit
    if (parentCommentId) {
      // Count replies in this specific thread
      const { count: threadReplyCount, error: threadCountError } = await supabase
        .from("comments")
        .select("*", { count: "exact", head: true })
        .eq("profile_id", profileId)
        .eq("parent_comment_id", parentCommentId)
        .is("deleted_at", null)
        .gte("created_at", todayStart.toISOString());

      if (!threadCountError && threadReplyCount !== null && threadReplyCount >= MAX_REPLIES_PER_THREAD) {
        return new Response(
          JSON.stringify({ 
            error: `You've reached the limit for this conversation thread. Consider starting a new thread or continuing tomorrow.`,
          }),
          {
            status: 429,
            headers: { ...corsHeaders, "content-type": "application/json" },
          }
        );
      }
    } else {
      // For top-level comments, check per-clip limit
      const { count: clipCommentCount, error: clipCountError } = await supabase
        .from("comments")
        .select("*", { count: "exact", head: true })
        .eq("profile_id", profileId)
        .eq("clip_id", clipId)
        .is("parent_comment_id", null) // Only count top-level comments
        .is("deleted_at", null)
        .gte("created_at", todayStart.toISOString());

      if (!clipCountError && clipCommentCount !== null && clipCommentCount >= MAX_COMMENTS_PER_CLIP) {
        return new Response(
          JSON.stringify({ 
            error: `You've posted ${MAX_COMMENTS_PER_CLIP} top-level comments on this clip today. You can still reply to existing conversations!`,
          }),
          {
            status: 429,
            headers: { ...corsHeaders, "content-type": "application/json" },
          }
        );
      }
    }

    // Check daily comment limit
    const { count: dailyCommentCount, error: dailyCountError } = await supabase
      .from("comments")
      .select("*", { count: "exact", head: true })
      .eq("profile_id", profileId)
      .is("deleted_at", null)
      .gte("created_at", todayStart.toISOString());

    if (!dailyCountError && dailyCommentCount !== null && dailyCommentCount >= MAX_COMMENTS_PER_DAY) {
      return new Response(
        JSON.stringify({ 
          error: `You've reached the daily limit of ${MAX_COMMENTS_PER_DAY} comments. Try again tomorrow.`,
        }),
        {
          status: 429,
          headers: { ...corsHeaders, "content-type": "application/json" },
        }
      );
    }

    // Check cooldown period (shorter for replies in conversations)
    const cooldownSeconds = parentCommentId ? REPLY_COOLDOWN_SECONDS : COMMENT_COOLDOWN_SECONDS;
    const cooldownWindow = new Date(Date.now() - cooldownSeconds * 1000);
    
    // For replies, only check cooldown within the same thread to allow parallel conversations
    let cooldownQuery = supabase
      .from("comments")
      .select("created_at")
      .eq("profile_id", profileId)
      .is("deleted_at", null)
      .gte("created_at", cooldownWindow.toISOString())
      .order("created_at", { ascending: false })
      .limit(1);
    
    // If replying, only check cooldown for comments in the same thread
    if (parentCommentId) {
      cooldownQuery = cooldownQuery.eq("parent_comment_id", parentCommentId);
    }
    
    const { data: recentComment, error: cooldownError } = await cooldownQuery.single();

    if (!cooldownError && recentComment) {
      const secondsSinceLastComment = Math.floor(
        (Date.now() - new Date(recentComment.created_at).getTime()) / 1000
      );
      const remainingSeconds = cooldownSeconds - secondsSinceLastComment;
      if (remainingSeconds > 0) {
        return new Response(
          JSON.stringify({ 
            error: `Please wait ${remainingSeconds} second${remainingSeconds > 1 ? "s" : ""} before ${parentCommentId ? "replying again" : "commenting again"}.`,
            retryAfter: remainingSeconds,
          }),
          {
            status: 429,
            headers: {
              ...corsHeaders,
              "Retry-After": remainingSeconds.toString(),
              "content-type": "application/json",
            },
          }
        );
      }
    }

    // Check for duplicate comments (context-aware: only within same thread)
    const isDuplicate = await checkDuplicateComment(supabase, profileId, clipId, audioBase64, durationSeconds, parentCommentId || null);
    if (isDuplicate) {
      return new Response(
        JSON.stringify({ error: "This comment appears to be a duplicate. Please try a different comment." }), 
        { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

    // Get IP address for tracking and rate limiting
    const ipAddress = getRequestIPAddress(req);
    const userAgent = req.headers.get("user-agent") || req.headers.get("x-user-agent") || null;

    // Check if IP is blacklisted
    if (ipAddress) {
      const isBlacklisted = await isIPBlacklisted(supabase, ipAddress);
      if (isBlacklisted) {
        return new Response(
          JSON.stringify({ error: "Access denied" }),
          { status: 403, headers: { ...corsHeaders, "content-type": "application/json" } }
        );
      }
    }

    // IP-based rate limiting: 30 comments per hour per IP
    if (ipAddress) {
      const ipRateLimitResult = await checkIPRateLimit(supabase, ipAddress, "voice_comment", 30, 60);
      if (!ipRateLimitResult.allowed) {
        return new Response(
          JSON.stringify({ 
            error: "IP rate limit exceeded. Please wait before adding another voice comment.",
            retryAfter: ipRateLimitResult.resetAt ? Math.ceil((new Date(ipRateLimitResult.resetAt).getTime() - Date.now()) / 1000) : 60,
          }),
          {
            status: 429,
            headers: {
              ...corsHeaders,
              "content-type": "application/json",
              "Retry-After": ipRateLimitResult.resetAt ? Math.ceil((new Date(ipRateLimitResult.resetAt).getTime() - Date.now()) / 1000).toString() : "60",
            },
          }
        );
      }
    }

    // Rate limiting: 5 voice comments per minute per profile (existing check)
    const rateLimitKey = getRateLimitKey("profileId", "voice-comment", profileId);
    const rateLimitResult = await checkRateLimit(supabase, rateLimitKey, {
      maxRequests: 5,
      windowMs: 60000, // 1 minute
      identifier: profileId,
    });

    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({ 
          error: "Rate limit exceeded. Please wait before adding another voice comment.",
          retryAfter: rateLimitResult.retryAfter,
        }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            ...createRateLimitHeaders(rateLimitResult),
            "content-type": "application/json",
          },
        }
      );
    }

    // Detect suspicious IP patterns
    if (ipAddress) {
      const suspiciousPattern = await detectSuspiciousIPPattern(supabase, ipAddress, "voice_comment", 60);
      if (suspiciousPattern.isSuspicious && suspiciousPattern.severity === "critical") {
        return new Response(
          JSON.stringify({ error: "Suspicious activity detected. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "content-type": "application/json" } }
        );
      }
    }

    // If parentCommentId is provided, verify it exists
    if (parentCommentId) {
      const { data: parentComment, error: parentError } = await supabase
        .from("comments")
        .select("id")
        .eq("id", parentCommentId)
        .is("deleted_at", null)
        .single();

      if (parentError || !parentComment) {
        return new Response(JSON.stringify({ error: "Parent comment not found" }), { status: 404, headers: { ...corsHeaders, "content-type": "application/json" } });
      }
    }

    // Convert base64 to buffer
    const audioBuffer = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));

    // Upload audio file to storage
    const fileName = `${profileId}/voice-comments/${Date.now()}.webm`;
    const { error: uploadError } = await supabase.storage
      .from("audio")
      .upload(fileName, audioBuffer, {
        contentType: audioType || "audio/webm",
        upsert: false,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return new Response(
        JSON.stringify({ error: "Failed to upload audio file" }), 
        { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

    // Insert comment record
    const { data: comment, error: insertError } = await supabase
      .from("comments")
      .insert({
        clip_id: clipId,
        profile_id: profileId,
        parent_comment_id: parentCommentId || null,
        content: content || null,
        audio_path: fileName,
        duration_seconds: durationSeconds,
      })
      .select()
      .single();

    if (insertError) {
      // Clean up uploaded file if insert fails
      await supabase.storage.from("audio").remove([fileName]);
      console.error("Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to save voice comment" }), 
        { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

    // Log IP activity for abuse detection
    if (ipAddress) {
      await logIPActivity(
        supabase,
        ipAddress,
        "voice_comment",
        profileId,
        comment.id,
        deviceId,
        userAgent,
        { clipId, parentCommentId: parentCommentId || null }
      );
    }

    return new Response(JSON.stringify({ 
      success: true,
      comment: {
        id: comment.id,
        clip_id: comment.clip_id,
        profile_id: comment.profile_id,
        parent_comment_id: comment.parent_comment_id,
        content: comment.content,
        audio_path: comment.audio_path,
        duration_seconds: comment.duration_seconds,
        created_at: comment.created_at,
      }
    }), {
      headers: { 
        ...corsHeaders, 
        ...createRateLimitHeaders(rateLimitResult),
        "content-type": "application/json" 
      },
      status: 200,
    });
  } catch (error) {
    logErrorSafely("add-voice-comment", error);
    const isDevelopment = Deno.env.get("ENVIRONMENT") === "development";
    const errorResponse = createErrorResponse(error, 500, isDevelopment);
    return new Response(errorResponse.body, {
      ...errorResponse,
      headers: { ...corsHeaders, ...errorResponse.headers },
    });
  }
});

