import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0?target=deno";
import { createErrorResponse, logErrorSafely } from "../_shared/error-handler.ts";
import { 
  getRequestIPAddress, 
  logIPActivity, 
  isIPBlacklisted, 
  checkIPRateLimit,
  checkAudioQuality,
  flagContentForReview
} from "../_shared/security.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!OPENAI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing required environment variables for on-clip-uploaded.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const summarizationPrompt = `You are summarizing a short anonymous voice note. Output JSON with the keys:
SUMMARY: max 2 natural sentences.
TAGS: 1–3 lowercase keywords, comma-separated.
SENTIMENT: one of [positive, neutral, mixed, negative].
EMOTION: one of [joy, sadness, anger, fear, surprise, disgust, neutral, excited, calm, frustrated, happy, melancholic].
EMOTION_SCORES: JSON object with scores (0-1) for each emotion: {joy: 0.8, sadness: 0.1, anger: 0.05, fear: 0.02, surprise: 0.03, disgust: 0.0, neutral: 0.0, excited: 0.7, calm: 0.1, frustrated: 0.05, happy: 0.75, melancholic: 0.1}.
Keep it kind and nonjudgmental. Do not reveal or infer identity. Respond strictly as JSON.`;

const moderateTranscript = async (transcript: string) => {
  const response = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "omni-moderation-latest",
      input: transcript,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI moderation failed: ${detail}`);
  }

  const json = await response.json();
  const result = json.results?.[0];
  if (!result) {
    return { flag: false, reasons: [], risk: 0 };
  }

  const reasons = Object.entries(result.categories || {})
    .filter(([, value]) => value)
    .map(([key]) => key.replace(/_/g, " "));
  const risk = Math.max(...Object.values(result.category_scores || { default: 0 }));

  return { flag: Boolean(result.flagged), reasons, risk: Number.isFinite(risk) ? risk : 0 };
};

const summarizeTranscript = async (transcript: string) => {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: summarizationPrompt },
        { role: "user", content: transcript },
      ],
      temperature: 0.4,
      max_tokens: 300,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI summary failed: ${detail}`);
  }

  const json = await response.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content) return { SUMMARY: null, TAGS: "", SENTIMENT: "neutral", EMOTION: null, EMOTION_SCORES: null };
  try {
    return JSON.parse(content) as { 
      SUMMARY?: string; 
      TAGS?: string; 
      SENTIMENT?: string;
      EMOTION?: string;
      EMOTION_SCORES?: Record<string, number>;
    };
  } catch (error) {
    console.error("Failed to parse summary JSON:", error);
    return { SUMMARY: null, TAGS: "", SENTIMENT: "neutral", EMOTION: null, EMOTION_SCORES: null };
  }
};

const transcribeAudio = async (audioPath: string) => {
  const { data, error } = await supabase.storage.from("audio").download(audioPath);
  if (error || !data) {
    throw new Error(`Failed to download audio: ${error?.message ?? "unknown error"}`);
  }

  const formData = new FormData();
  const file = new File([data], "clip.webm", { type: data.type || "audio/webm" });
  formData.append("file", file);
  formData.append("model", "gpt-4o-mini-transcribe");
  formData.append("response_format", "json");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI transcription failed: ${detail}`);
  }

  const json = await response.json();
  return (json.text as string) ?? "";
};

const getDeviceProfile = async (deviceId: string | null) => {
  if (!deviceId) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("device_id", deviceId)
    .single();
  if (error || !data) return null;
  return data.id as string;
};

// Analyze voice characteristics: pitch, speed, tone
// Returns voice characteristics and fingerprint
const analyzeVoiceCharacteristics = async (audioPath: string, transcript: string, durationSeconds: number) => {
  try {
    const { data, error } = await supabase.storage.from("audio").download(audioPath);
    if (error || !data) {
      console.warn(`Failed to download audio for voice analysis: ${error?.message ?? "unknown error"}`);
      return null;
    }

    // Calculate words per minute (speed)
    const wordCount = transcript.split(/\s+/).filter(word => word.length > 0).length;
    const wordsPerMinute = Math.round((wordCount / durationSeconds) * 60);
    
    // Estimate pitch based on file characteristics (simplified heuristic)
    // In production, use proper audio analysis library
    const fileSize = data.size;
    const bytesPerSecond = fileSize / durationSeconds;
    // Higher bitrate often correlates with clearer/higher pitch voices
    const pitchEstimate = Math.min(1, Math.max(0, (bytesPerSecond - 10000) / 40000));
    
    // Determine tone based on transcript sentiment and word choice
    // This is a simplified heuristic - in production, use audio analysis
    const lowerTranscript = transcript.toLowerCase();
    let tone: string = "neutral";
    if (lowerTranscript.includes("warm") || lowerTranscript.includes("kind") || lowerTranscript.includes("love")) {
      tone = "warm";
    } else if (lowerTranscript.includes("cool") || lowerTranscript.includes("calm") || lowerTranscript.includes("peaceful")) {
      tone = "cool";
    }
    
    // Generate voice fingerprint (simplified - based on characteristics)
    // In production, use proper voice biometrics
    const fingerprint = `${Math.round(pitchEstimate * 100)}-${wordsPerMinute}-${tone}`;
    
    return {
      voice_characteristics: {
        pitch: Math.round(pitchEstimate * 100) / 100,
        speed: wordsPerMinute,
        tone: tone,
        timbre: "analyzed", // Placeholder - would use audio analysis in production
      },
      voice_fingerprint: fingerprint,
    };
  } catch (error) {
    console.error("Error analyzing voice characteristics:", error);
    return null;
  }
};

// Analyze audio quality: volume, clarity, noise level
// Returns quality metrics and score (0-10)
const analyzeAudioQuality = async (audioPath: string, durationSeconds: number) => {
  try {
    const { data, error } = await supabase.storage.from("audio").download(audioPath);
    if (error || !data) {
      console.warn(`Failed to download audio for quality analysis: ${error?.message ?? "unknown error"}`);
      return null;
    }

    // Get file size for volume estimation
    const fileSize = data.size;
    const bytesPerSecond = fileSize / durationSeconds;
    
    // Estimate volume level (0-1) based on file size relative to duration
    // Typical WebM audio: ~10-50 KB per second for good quality
    // Higher bytes/second generally indicates better volume/quality
    const volumeScore = Math.min(1, Math.max(0, (bytesPerSecond - 5000) / 45000)); // Normalize to 0-1
    
    // Estimate clarity based on file size (larger files often have better clarity)
    // This is a rough heuristic - in production, use proper audio analysis
    const clarityScore = Math.min(1, Math.max(0, (bytesPerSecond - 3000) / 40000));
    
    // Estimate noise level (inverse of clarity for now)
    // Lower noise = higher score
    const noiseLevel = Math.max(0, Math.min(1, 1 - clarityScore * 0.7)); // Scale down noise estimate
    
    // Calculate overall quality score (0-10)
    // Weighted: 40% volume, 40% clarity, 20% noise (inverse)
    const qualityScore = (
      volumeScore * 0.4 +
      clarityScore * 0.4 +
      (1 - noiseLevel) * 0.2
    ) * 10;
    
    // Round to 1 decimal place
    const roundedScore = Math.round(qualityScore * 10) / 10;
    
    // Determine badge
    let badge: string | null = null;
    if (roundedScore >= 8.0) {
      badge = "excellent";
    } else if (roundedScore >= 6.0) {
      badge = "good";
    } else if (roundedScore >= 4.0) {
      badge = "fair";
    }
    
    return {
      quality_score: roundedScore,
      quality_badge: badge,
      quality_metrics: {
        volume: Math.round(volumeScore * 100) / 100,
        clarity: Math.round(clarityScore * 100) / 100,
        noise_level: Math.round(noiseLevel * 100) / 100,
      },
    };
  } catch (error) {
    console.error("Error analyzing audio quality:", error);
    return null;
  }
};

// SECURITY: Restrict CORS to specific origins in production
const allowedOrigins = Deno.env.get("ALLOWED_ORIGINS")?.split(",") || ["*"];
const origin = Deno.env.get("ORIGIN") || "*";

const corsHeaders = {
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-device-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Credentials": "true",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

serve(async (req) => {
  // Handle CORS preflight requests
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

    const deviceId = req.headers.get("x-device-id") ?? null;
    const userAgent = req.headers.get("user-agent") || req.headers.get("x-user-agent") || null;
    const ipAddress = getRequestIPAddress(req);
    const { clipId } = await req.json();

    if (!clipId) {
      return new Response(JSON.stringify({ error: "clipId is required" }), { 
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    // Check if IP is blacklisted
    if (ipAddress && await isIPBlacklisted(supabase, ipAddress)) {
      return new Response(
        JSON.stringify({ error: "Access denied" }),
        { 
          status: 403,
          headers: { ...corsHeaders, "content-type": "application/json" },
        }
      );
    }

    // Check IP-based rate limit for clip uploads
    if (ipAddress) {
      const ipRateLimit = await checkIPRateLimit(supabase, ipAddress, "clip_upload", 20, 60);
      if (!ipRateLimit.allowed) {
        return new Response(
          JSON.stringify({ 
            error: "Upload rate limit exceeded. Please wait before uploading again.",
            retryAfter: ipRateLimit.resetAt
          }),
          { 
            status: 429,
            headers: { 
              ...corsHeaders, 
              "content-type": "application/json",
              "Retry-After": ipRateLimit.resetAt ? Math.ceil((new Date(ipRateLimit.resetAt).getTime() - Date.now()) / 1000).toString() : "60"
            },
          }
        );
      }
    }

    const { data: clip, error: clipError } = await supabase
      .from("clips")
      .select(
        `
        id,
        audio_path,
        duration_seconds,
        profile_id,
        status,
        is_podcast
      `,
      )
      .eq("id", clipId)
      .single();

    if (clipError || !clip) {
      return new Response(JSON.stringify({ error: "Clip not found" }), { 
        status: 404,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    // Check clip upload rate limits (profile-based and cooldown)
    if (clip.profile_id) {
      // Check cooldown period (30 seconds between uploads)
      const { data: cooldownResult, error: cooldownError } = await supabase.rpc(
        "check_clip_upload_cooldown",
        {
          p_profile_id: clip.profile_id,
          p_cooldown_seconds: 30,
        }
      );

      if (cooldownError) {
        console.error("Cooldown check error:", cooldownError);
      } else if (cooldownResult && cooldownResult.length > 0) {
        const cooldown = cooldownResult[0];
        if (!cooldown.allowed) {
          return new Response(
            JSON.stringify({
              error: cooldown.reason || "Please wait before uploading again",
              retry_after: cooldown.retry_after,
            }),
            {
              status: 429,
              headers: {
                ...corsHeaders,
                "content-type": "application/json",
                "Retry-After": cooldown.retry_after
                  ? Math.ceil((new Date(cooldown.retry_after).getTime() - Date.now()) / 1000).toString()
                  : "30",
              },
            }
          );
        }
      }

      // Check profile-based rate limits (10 per hour, 50 per day)
      const { data: rateLimitResult, error: rateLimitError } = await supabase.rpc(
        "check_clip_upload_rate_limit",
        {
          p_profile_id: clip.profile_id,
          p_ip_address: ipAddress || null,
          p_max_per_hour: 10,
          p_max_per_day: 50,
          p_max_per_ip_per_hour: 20,
        }
      );

      if (rateLimitError) {
        console.error("Rate limit check error:", rateLimitError);
      } else if (rateLimitResult && rateLimitResult.length > 0) {
        const rateLimit = rateLimitResult[0];
        if (!rateLimit.allowed) {
          return new Response(
            JSON.stringify({
              error: rateLimit.reason || "Upload rate limit exceeded",
              retry_after: rateLimit.retry_after,
              clips_uploaded_last_hour: rateLimit.clips_uploaded_last_hour,
              clips_uploaded_last_day: rateLimit.clips_uploaded_last_day,
            }),
            {
              status: 429,
              headers: {
                ...corsHeaders,
                "content-type": "application/json",
                "Retry-After": rateLimit.retry_after
                  ? Math.ceil((new Date(rateLimit.retry_after).getTime() - Date.now()) / 1000).toString()
                  : "3600",
              },
            }
          );
        }
      }
    }

    // Validate duration based on content type
    const maxDuration = clip.is_podcast ? 600 : 30; // Podcast: 10 min, Regular: 30 sec
    if (clip.duration_seconds > maxDuration || clip.duration_seconds <= 0) {
      await supabase
        .from("clips")
        .update({ status: "removed" })
        .eq("id", clipId);
      return new Response(
        JSON.stringify({ status: "removed", reason: "invalid_duration" }),
        { headers: { ...corsHeaders, "content-type": "application/json" } },
      );
    }

    // Validate audio file size (max 10MB per clip)
    const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
    try {
      const { data: fileData, error: fileError } = await supabase.storage
        .from("audio")
        .list(clip.audio_path.split("/").slice(0, -1).join("/"), {
          limit: 1,
          search: clip.audio_path.split("/").pop() || "",
        });
      
      // Alternative: Download file to check size (more accurate but uses bandwidth)
      const { data: audioFile, error: downloadError } = await supabase.storage
        .from("audio")
        .download(clip.audio_path);
      
      if (!downloadError && audioFile) {
        if (audioFile.size > MAX_FILE_SIZE_BYTES) {
          // File too large, remove clip
          await supabase
            .from("clips")
            .update({ status: "removed" })
            .eq("id", clipId);
          // Optionally delete the file to save storage
          await supabase.storage.from("audio").remove([clip.audio_path]);
          return new Response(
            JSON.stringify({ status: "removed", reason: "file_too_large", maxSize: "10MB" }),
            { headers: { ...corsHeaders, "content-type": "application/json" } },
          );
        }
        
        // Validate duration matches actual audio file metadata
        // Note: This is a simplified check - in production, use proper audio metadata extraction
        // For now, we trust the duration_seconds from the client, but we can add server-side validation
        // by extracting actual duration from the audio file
      }
    } catch (fileSizeError) {
      console.error("Error checking file size:", fileSizeError);
      // Continue processing on error - don't block legitimate uploads
    }

    const transcript = await transcribeAudio(clip.audio_path);
    const summaryData = await summarizeTranscript(transcript);
    const moderationData = await moderateTranscript(transcript);
    
    // Analyze audio quality
    const qualityData = await analyzeAudioQuality(clip.audio_path, clip.duration_seconds);
    
    // Get file size for quality validation
    let fileSizeBytes: number | null = null;
    try {
      const { data: audioFile } = await supabase.storage
        .from("audio")
        .download(clip.audio_path);
      if (audioFile) {
        fileSizeBytes = audioFile.size;
      }
    } catch (error) {
      console.warn("Could not get file size for quality check:", error);
    }
    
    // Check audio quality (prevent empty/silent clips)
    const qualityCheck = await checkAudioQuality(
      supabase,
      clipId,
      qualityData?.quality_score || null,
      clip.duration_seconds,
      fileSizeBytes
    );
    
    // If audio quality is invalid, remove clip and flag for review
    if (!qualityCheck.isValid) {
      await supabase
        .from("clips")
        .update({ status: "removed" })
        .eq("id", clipId);
      
      // Flag for review
      await flagContentForReview(supabase, clipId, qualityCheck.reason || "Low quality audio", qualityData?.quality_score || null);
      
      return new Response(
        JSON.stringify({ 
          status: "removed", 
          reason: qualityCheck.reason || "invalid_quality",
          quality: qualityData || null
        }),
        { headers: { ...corsHeaders, "content-type": "application/json" } },
      );
    }
    
    // If quality is low but valid, flag for review
    if (qualityCheck.shouldReview) {
      await flagContentForReview(supabase, clipId, qualityCheck.reason || "Low quality audio", qualityData?.quality_score || null);
    }
    
    // Analyze voice characteristics
    const voiceData = await analyzeVoiceCharacteristics(clip.audio_path, transcript, clip.duration_seconds);

    // Validate tags (max 10 tags, reasonable length)
    const MAX_TAGS = 10;
    const MAX_TAG_LENGTH = 50;
    let tags: string[] | null = null;
    if (typeof summaryData.TAGS === "string") {
      const rawTags = summaryData.TAGS.split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0 && tag.length <= MAX_TAG_LENGTH)
        .slice(0, MAX_TAGS); // Limit to max tags
      tags = rawTags.length > 0 ? rawTags : null;
    }

    // Validate and filter tags from existing clip data if available
    const { data: existingClip } = await supabase
      .from("clips")
      .select("tags")
      .eq("id", clipId)
      .single();
    
    if (existingClip?.tags && Array.isArray(existingClip.tags)) {
      // Filter and validate user-provided tags
      const validUserTags = existingClip.tags
        .filter((tag: unknown) => typeof tag === "string")
        .map((tag: string) => tag.trim())
        .filter((tag: string) => tag.length > 0 && tag.length <= MAX_TAG_LENGTH)
        .slice(0, MAX_TAGS);
      
      // Combine with AI-generated tags (remove duplicates, prioritize user tags)
      if (validUserTags.length > 0) {
        const allTags = [...validUserTags];
        if (tags) {
          tags.forEach((tag) => {
            if (!allTags.includes(tag.toLowerCase()) && allTags.length < MAX_TAGS) {
              allTags.push(tag.toLowerCase());
            }
          });
        }
        tags = allTags.slice(0, MAX_TAGS);
      }
    }

    // Check for duplicate content uploads (same audio file)
    // This checks if a similar audio file (by path or duration) was recently uploaded by the same profile
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: recentClips, error: duplicateError } = await supabase
        .from("clips")
        .select("id, audio_path, duration_seconds")
        .eq("profile_id", clip.profile_id)
        .gte("created_at", oneDayAgo)
        .neq("id", clipId)
        .is("deleted_at", null);
      
      if (!duplicateError && recentClips) {
        // Check for duplicate audio path (exact match) or very similar duration (within 0.5 seconds)
        const isDuplicate = recentClips.some((recentClip) => {
          const durationMatch = Math.abs(recentClip.duration_seconds - clip.duration_seconds) < 0.5;
          // Note: For production, implement audio fingerprinting/hash comparison
          return durationMatch;
        });
        
        if (isDuplicate) {
          await supabase
            .from("clips")
            .update({ status: "removed" })
            .eq("id", clipId);
          return new Response(
            JSON.stringify({ status: "removed", reason: "duplicate_content" }),
            { headers: { ...corsHeaders, "content-type": "application/json" } },
          );
        }
      }
    } catch (duplicateCheckError) {
      console.error("Error checking duplicate content:", duplicateCheckError);
      // Continue processing on error
    }

    const status = moderationData.flag ? "hidden" : "live";

    // Determine primary emotion and confidence
    const primaryEmotion = summaryData.EMOTION || null;
    const emotionScores = summaryData.EMOTION_SCORES || null;
    let emotionConfidence: number | null = null;
    if (primaryEmotion && emotionScores && emotionScores[primaryEmotion]) {
      emotionConfidence = emotionScores[primaryEmotion];
    }

    const updateData: Record<string, unknown> = {
      captions: transcript,
      summary: summaryData.SUMMARY ?? null,
      tags,
      status,
      moderation: {
        flag: moderationData.flag,
        reasons: moderationData.reasons,
        risk: moderationData.risk,
        sentiment: summaryData.SENTIMENT ?? "neutral",
      },
    };
    
    // Add quality data if available
    if (qualityData) {
      updateData.quality_score = qualityData.quality_score;
      updateData.quality_badge = qualityData.quality_badge;
      updateData.quality_metrics = qualityData.quality_metrics;
    }
    
    // Add emotion data if available
    if (primaryEmotion) {
      updateData.detected_emotion = primaryEmotion;
      updateData.emotion_confidence = emotionConfidence;
      updateData.emotion_scores = emotionScores;
    }
    
    // Add voice characteristics if available
    if (voiceData) {
      updateData.voice_characteristics = voiceData.voice_characteristics;
      updateData.voice_fingerprint = voiceData.voice_fingerprint;
    }

    const { error: updateError } = await supabase
      .from("clips")
      .update(updateData)
      .eq("id", clipId);

    if (updateError) {
      throw updateError;
    }

    // Update storage usage after successful upload
    if (clip.profile_id && fileSizeBytes) {
      try {
        await supabase.rpc("update_storage_usage", {
          p_profile_id: clip.profile_id,
          p_file_size_bytes: fileSizeBytes,
        });
      } catch (storageError) {
        console.error("Failed to update storage usage:", storageError);
        // Don't fail the upload if storage update fails
      }
    }

    if (moderationData.flag) {
      const { data: flagData, error: flagError } = await supabase
        .from("moderation_flags")
        .insert({
          clip_id: clipId,
          reasons: moderationData.reasons ?? [],
          risk: moderationData.risk ?? 0,
          source: "ai",
        })
        .select("id")
        .single();

      if (!flagError && flagData && moderationData.risk && moderationData.risk >= 7) {
        // Trigger notification for high-risk flags (trigger will handle it, but we can also call directly)
        await supabase.rpc("notify_admins_high_risk_flag", {
          p_flag_id: flagData.id,
          p_clip_id: clipId,
          p_risk: moderationData.risk,
          p_reasons: moderationData.reasons ?? [],
          p_source: "ai",
        });
      }
    }

    // Optional: notify uploader if moderation passed/failed.
    // Expo push tokens or notification channel aren't implemented yet,
    // but we can leave a placeholder hook for future expansion.
    const profileId = await getDeviceProfile(deviceId);
    if (profileId && profileId === clip.profile_id && !moderationData.flag) {
      console.log(`Clip ${clipId} by profile ${profileId} is live. Ready to send push notification.`);
    }

    // Log clip upload for rate limiting tracking
    if (clip.profile_id) {
      try {
        await supabase.rpc("log_clip_upload", {
          p_profile_id: clip.profile_id,
          p_clip_id: clipId,
          p_ip_address: ipAddress || null,
          p_device_id: deviceId || null,
          p_file_size_bytes: fileSizeBytes,
          p_duration_seconds: clip.duration_seconds,
        });
      } catch (logError) {
        console.error("Failed to log clip upload:", logError);
        // Don't fail the upload if logging fails
      }
    }

    // Log IP activity for abuse detection
    if (ipAddress) {
      await logIPActivity(
        supabase,
        ipAddress,
        "clip_upload",
        clip.profile_id,
        clipId,
        deviceId,
        userAgent,
        {
          duration_seconds: clip.duration_seconds,
          file_size_bytes: fileSizeBytes,
          quality_score: qualityData?.quality_score || null,
        }
      );
    }

    return new Response(
      JSON.stringify({
        status,
        captions: transcript,
        summary: summaryData.SUMMARY ?? null,
        tags,
        moderation: moderationData,
        quality: qualityData || null,
        emotion: primaryEmotion ? {
          emotion: primaryEmotion,
          confidence: emotionConfidence,
          scores: emotionScores,
        } : null,
        voice: voiceData || null,
      }),
      { headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  } catch (error) {
    logErrorSafely("on-clip-uploaded", error);
    const isDevelopment = Deno.env.get("ENVIRONMENT") === "development";
    const errorResponse = createErrorResponse(error, 500, isDevelopment);
    return new Response(errorResponse.body, {
      ...errorResponse,
      headers: { ...corsHeaders, ...errorResponse.headers },
    });
  }
});

