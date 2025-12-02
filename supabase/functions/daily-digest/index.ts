import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0?target=deno";

// Error handling utilities (inlined for standalone deployment)
const SENSITIVE_PATTERNS = [
  /password/gi,
  /token/gi,
  /secret/gi,
  /api[_-]?key/gi,
  /credential/gi,
  /connection[_-]?string/gi,
  /database[_-]?url/gi,
  /supabase[_-]?url/gi,
  /service[_-]?role/gi,
  /private[_-]?key/gi,
  /access[_-]?token/gi,
  /refresh[_-]?token/gi,
  /authorization/gi,
  /bearer/gi,
  /jwt/gi,
  /session[_-]?id/gi,
  /cookie/gi,
];

function sanitizeErrorMessage(error: unknown, isDevelopment: boolean = false): string {
  let message = "An unexpected error occurred";

  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === "string") {
    message = error;
  } else if (error && typeof error === "object" && "message" in error) {
    message = String((error as { message: unknown }).message);
  }

  if (isDevelopment) {
    let sanitized = message;
    SENSITIVE_PATTERNS.forEach((pattern) => {
      sanitized = sanitized.replace(pattern, "[REDACTED]");
    });
    return sanitized;
  }

  const lowerMessage = message.toLowerCase();

  if (
    lowerMessage.includes("database") ||
    lowerMessage.includes("connection") ||
    lowerMessage.includes("query") ||
    lowerMessage.includes("sql")
  ) {
    return "A database error occurred. Please try again later.";
  }

  if (
    lowerMessage.includes("auth") ||
    lowerMessage.includes("unauthorized") ||
    lowerMessage.includes("forbidden") ||
    lowerMessage.includes("permission")
  ) {
    return "Authentication failed. Please check your credentials.";
  }

  if (
    lowerMessage.includes("network") ||
    lowerMessage.includes("fetch") ||
    lowerMessage.includes("timeout")
  ) {
    return "A network error occurred. Please check your connection.";
  }

  if (
    lowerMessage.includes("validation") ||
    lowerMessage.includes("invalid") ||
    lowerMessage.includes("required") ||
    lowerMessage.includes("missing")
  ) {
    let sanitized = message;
    SENSITIVE_PATTERNS.forEach((pattern) => {
      sanitized = sanitized.replace(pattern, "[REDACTED]");
    });
    return sanitized;
  }

  const hasSensitiveInfo = SENSITIVE_PATTERNS.some((pattern) =>
    pattern.test(message)
  );

  if (hasSensitiveInfo) {
    return "An error occurred. Please contact support if the problem persists.";
  }

  return "An unexpected error occurred. Please try again later.";
}

function createErrorResponse(
  error: unknown,
  status: number = 500,
  isDevelopment: boolean = false
): Response {
  const sanitizedMessage = sanitizeErrorMessage(error, isDevelopment);

  return new Response(
    JSON.stringify({
      error: sanitizedMessage,
      ...(isDevelopment && error instanceof Error
        ? { details: error.message }
        : {}),
    }),
    {
      status,
      headers: {
        "content-type": "application/json",
      },
    }
  );
}

function logErrorSafely(
  context: string,
  error: unknown,
  additionalData?: Record<string, unknown>
): void {
  let errorMessage = "Unknown error";
  let errorStack: string | undefined;

  if (error instanceof Error) {
    errorMessage = error.message;
    errorStack = error.stack;
  } else if (typeof error === "string") {
    errorMessage = error;
  }

  let sanitizedMessage = errorMessage;
  SENSITIVE_PATTERNS.forEach((pattern) => {
    sanitizedMessage = sanitizedMessage.replace(pattern, "[REDACTED]");
  });

  const sanitizedData = additionalData
    ? Object.fromEntries(
        Object.entries(additionalData).map(([key, value]) => {
          const keyLower = key.toLowerCase();
          const isSensitive =
            SENSITIVE_PATTERNS.some((pattern) => pattern.test(key)) ||
            keyLower.includes("password") ||
            keyLower.includes("token") ||
            keyLower.includes("secret") ||
            keyLower.includes("key");

          if (isSensitive && typeof value === "string") {
            return [key, "[REDACTED]"];
          }
          return [key, value];
        })
      )
    : undefined;

  console.error(`[${context}] Error:`, sanitizedMessage, {
    ...sanitizedData,
    ...(errorStack && { stack: errorStack }),
  });
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const APP_URL = Deno.env.get("APP_URL") || "https://echogarden.app";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase environment variables for daily-digest.");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Import security utilities
import { 
  getRequestIPAddress, 
  validateEmailAddress, 
  checkDigestRequestRateLimit,
  logDigestRequest
} from "../_shared/security.ts";

interface DigestClip {
  id: string;
  title: string;
  audio_path: string;
  duration_seconds: number;
  transcription: string;
  created_at: string;
  trending_score: number;
  listens_count: number;
  reactions: Record<string, number>;
  profile: {
    handle: string;
    emoji_avatar: string;
  };
  topic: {
    id: string;
    title: string;
  };
}

interface DigestData {
  user_id: string;
  email: string;
  handle: string;
  clips: DigestClip[];
  clip_count: number;
  followed_topics_count: number;
  generated_at: string;
}

// Format duration in seconds to readable format
const formatDuration = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
};

// Format time ago
const formatTimeAgo = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) return "just now";
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "yesterday";
  return `${diffDays}d ago`;
};

// Generate HTML email template
const generateEmailHTML = (digest: DigestData): string => {
  const clipsHTML = digest.clips
    .map((clip, index) => {
      const reactionTotal = Object.values(clip.reactions || {}).reduce(
        (sum, count) => sum + count,
        0
      );
      const transcriptionPreview = clip.transcription
        ? clip.transcription.substring(0, 150) + (clip.transcription.length > 150 ? "..." : "")
        : "No transcription available";

      return `
        <div style="margin-bottom: 24px; padding-bottom: 24px; border-bottom: 1px solid #e5e7eb;">
          <div style="display: flex; align-items: center; margin-bottom: 8px;">
            <span style="font-size: 24px; margin-right: 8px;">${clip.profile.emoji_avatar}</span>
            <strong style="color: #111827;">${clip.profile.handle}</strong>
            <span style="color: #6b7280; margin-left: 8px; font-size: 14px;">${formatTimeAgo(clip.created_at)}</span>
          </div>
          <h3 style="margin: 8px 0; color: #111827; font-size: 18px;">${clip.title || "Untitled Clip"}</h3>
          <p style="color: #4b5563; margin: 8px 0; line-height: 1.5;">${transcriptionPreview}</p>
          <div style="display: flex; align-items: center; gap: 16px; margin-top: 12px; font-size: 14px; color: #6b7280;">
            <span>🎧 ${formatDuration(clip.duration_seconds)}</span>
            <span>👂 ${clip.listens_count || 0} listens</span>
            ${reactionTotal > 0 ? `<span>❤️ ${reactionTotal} reactions</span>` : ""}
            <span style="color: #3b82f6;">#${clip.topic.title}</span>
          </div>
          <a href="${APP_URL}/clip/${clip.id}" style="display: inline-block; margin-top: 12px; padding: 8px 16px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 6px; font-size: 14px;">Listen Now →</a>
        </div>
      `;
    })
    .join("");

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Your Daily Digest - Echo Garden</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #111827; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="font-size: 28px; margin: 0; color: #111827;">🎧 Echo Garden</h1>
          <p style="color: #6b7280; margin-top: 8px;">Your Daily Digest</p>
        </div>
        
        <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 32px;">
          <p style="margin: 0; color: #4b5563;">
            Hey ${digest.handle}! 👋
          </p>
          <p style="margin: 8px 0 0 0; color: #4b5563;">
            Here are the best clips from the ${digest.followed_topics_count} topic${digest.followed_topics_count !== 1 ? "s" : ""} you follow:
          </p>
        </div>

        ${clipsHTML}

        <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb; text-align: center;">
          <a href="${APP_URL}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">Open Echo Garden</a>
        </div>

        <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 12px; color: #9ca3af;">
          <p style="margin: 0;">You're receiving this because you have daily digests enabled.</p>
          <p style="margin: 8px 0 0 0;">
            <a href="${APP_URL}/settings" style="color: #3b82f6; text-decoration: none;">Manage your digest preferences</a>
          </p>
        </div>
      </body>
    </html>
  `;
};

// Generate plain text email
const generateEmailText = (digest: DigestData): string => {
  const clipsText = digest.clips
    .map((clip, index) => {
      const reactionTotal = Object.values(clip.reactions || {}).reduce(
        (sum, count) => sum + count,
        0
      );
      const transcriptionPreview = clip.transcription
        ? clip.transcription.substring(0, 150) + (clip.transcription.length > 150 ? "..." : "")
        : "No transcription available";

      return `
${index + 1}. ${clip.title || "Untitled Clip"}
   By: ${clip.profile.emoji_avatar} ${clip.profile.handle} (${formatTimeAgo(clip.created_at)})
   Topic: ${clip.topic.title}
   ${transcriptionPreview}
   🎧 ${formatDuration(clip.duration_seconds)} | 👂 ${clip.listens_count || 0} listens | ${reactionTotal > 0 ? `❤️ ${reactionTotal} reactions` : ""}
   Listen: ${APP_URL}/clip/${clip.id}
`;
    })
    .join("\n");

  return `
🎧 Echo Garden - Your Daily Digest

Hey ${digest.handle}! 👋

Here are the best clips from the ${digest.followed_topics_count} topic${digest.followed_topics_count !== 1 ? "s" : ""} you follow:

${clipsText}

Open Echo Garden: ${APP_URL}

---
You're receiving this because you have daily digests enabled.
Manage your preferences: ${APP_URL}/settings
  `.trim();
};

// Send email via SMTP2GO (final fallback - 1,000 emails/month free forever)
const sendEmailViaSMTP2GO = async (digest: DigestData): Promise<boolean> => {
  const SMTP2GO_API_KEY = Deno.env.get("SMTP2GO_API_KEY");
  
  if (!SMTP2GO_API_KEY) {
    return false; // SMTP2GO not configured
  }

  try {
    const emailData = {
      api_key: SMTP2GO_API_KEY,
      to: [digest.email],
      sender: "noreply@echogarden.app",
      subject: `🎧 Your Daily Digest: ${digest.clip_count} new clips`,
      html_body: generateEmailHTML(digest),
      text_body: generateEmailText(digest),
    };

    const response = await fetch("https://api.smtp2go.com/v3/email/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailData),
    });

    if (response.ok) {
      const result = await response.json();
      if (result.data?.error_code === 0) {
        console.log("Email sent successfully via SMTP2GO fallback");
        return true;
      } else {
        console.warn("SMTP2GO API error:", result.data?.error);
        return false;
      }
    } else {
      const errorText = await response.text();
      console.warn("SMTP2GO API error:", response.status, errorText);
      return false;
    }
  } catch (error) {
    console.error("Error sending email via SMTP2GO fallback:", error);
    return false;
  }
};

// Send email via Brevo (free fallback - 300 emails/day = 9,000/month free forever)
const sendEmailViaBrevo = async (digest: DigestData): Promise<boolean> => {
  const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
  
  if (!BREVO_API_KEY) {
    return false; // Brevo not configured
  }

  try {
    const emailData = {
      sender: {
        name: "Echo Garden",
        email: "noreply@echogarden.app",
      },
      to: [
        {
          email: digest.email,
        },
      ],
      subject: `🎧 Your Daily Digest: ${digest.clip_count} new clips`,
      htmlContent: generateEmailHTML(digest),
      textContent: generateEmailText(digest),
    };

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailData),
    });

    if (response.ok) {
      const result = await response.json();
      console.log("Email sent successfully via Brevo fallback:", result.messageId);
      return true;
    } else {
      const errorText = await response.text();
      console.warn("Brevo API error:", response.status, errorText);
      return false;
    }
  } catch (error) {
    console.error("Error sending email via Brevo fallback:", error);
    return false;
  }
};

// Send email via Resend (primary) with fallback
const sendEmail = async (digest: DigestData): Promise<boolean> => {
  // Try Resend first (primary service)
  if (RESEND_API_KEY) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Echo Garden <digest@echogarden.app>", // Update with your verified domain
          to: digest.email,
          subject: `🎧 Your Daily Digest: ${digest.clip_count} new clips`,
          html: generateEmailHTML(digest),
          text: generateEmailText(digest),
        }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log("Email sent successfully via Resend:", result.id);
        return true;
      } else {
        const errorText = await response.text();
        console.warn("Resend API error, trying fallback:", response.status, errorText);
      }
    } catch (error) {
      console.warn("Resend failed, trying fallback:", error);
    }
  } else {
    console.warn("RESEND_API_KEY not set, trying fallback");
  }

  // Fallback 1: Try Brevo (free tier: 300 emails/day = 9,000/month, free forever)
  const brevoSuccess = await sendEmailViaBrevo(digest);
  if (brevoSuccess) {
    return true;
  }

  // Fallback 2: Try SMTP2GO (free tier: 1,000 emails/month, free forever)
  const smtp2goSuccess = await sendEmailViaSMTP2GO(digest);
  if (smtp2goSuccess) {
    return true;
  }

  console.warn("All email services failed. Email not sent to:", digest.email);
  console.warn("To enable fallbacks, set up:");
  console.warn("  1. Brevo: https://www.brevo.com (free: 300 emails/day = 9,000/month forever)");
  console.warn("     Set BREVO_API_KEY in Supabase Edge Functions secrets");
  console.warn("  2. SMTP2GO: https://www.smtp2go.com (free: 1,000 emails/month forever)");
  console.warn("     Set SMTP2GO_API_KEY in Supabase Edge Functions secrets");
  
  return false;
};

// Process digest for a single user
const processUserDigest = async (
  userId: string, 
  req?: Request
): Promise<{ success: boolean; error?: string }> => {
  try {
    // Get user profile to check email
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("email, digest_enabled, digest_frequency")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      return { success: false, error: "Profile not found" };
    }

    if (!profile.digest_enabled || profile.digest_frequency === "never") {
      return { success: false, error: "Digest not enabled for this user" };
    }

    if (!profile.email) {
      return { success: false, error: "No email address on profile" };
    }

    // Validate email address (check if disposable)
    const emailValidation = await validateEmailAddress(supabase, profile.email);
    if (!emailValidation.isValid) {
      return { success: false, error: emailValidation.reason || "Invalid email address" };
    }

    // Check rate limits if request is available
    if (req) {
      const ipAddress = getRequestIPAddress(req);
      const rateLimit = await checkDigestRequestRateLimit(
        supabase,
        profile.email,
        ipAddress,
        3, // max 3 per email per day
        10 // max 10 per IP per day
      );

      if (!rateLimit.allowed) {
        return { success: false, error: rateLimit.reason || "Rate limit exceeded" };
      }

      // Log digest request
      await logDigestRequest(supabase, userId, profile.email, ipAddress);
    }

    // Generate digest
    const { data: digestData, error: digestError } = await supabase.rpc(
      "generate_user_digest",
      { user_profile_id: userId }
    );

    if (digestError) {
      return { success: false, error: digestError.message };
    }

    if (!digestData || digestData.error) {
      return { success: false, error: digestData?.error || "Failed to generate digest" };
    }

    const digest = digestData as DigestData;

    // Send email
    const emailSent = await sendEmail(digest);

    if (!emailSent) {
      return { success: false, error: "Failed to send email" };
    }

    // Update last sent timestamp
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ digest_last_sent_at: new Date().toISOString() })
      .eq("id", userId);

    if (updateError) {
      console.error("Error updating digest_last_sent_at:", updateError);
      // Don't fail the whole operation if this fails
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
};

// Main handler
const handler = async (req: Request) => {
  const url = new URL(req.url);
  const frequency = url.searchParams.get("frequency") || null; // 'daily' or 'weekly'
  const userId = url.searchParams.get("user_id"); // Optional: process single user

  try {
    if (userId) {
      // Process single user
      const result = await processUserDigest(userId, req);
      return {
        status: result.success ? "ok" : "error",
        message: result.success ? "Digest processed successfully" : result.error,
        user_id: userId,
      };
    }

    // Get all recipients
    const { data: recipients, error: recipientsError } = await supabase.rpc(
      "get_digest_recipients",
      { frequency_filter: frequency }
    );

    if (recipientsError) {
      throw recipientsError;
    }

    if (!recipients || recipients.length === 0) {
      return {
        status: "ok",
        message: "No recipients found for digest",
        recipients_count: 0,
      };
    }

    // Process each recipient
    const results = await Promise.allSettled(
      recipients.map((recipient: any) => processUserDigest(recipient.profile_id, req))
    );

    const successful = results.filter((r) => r.status === "fulfilled" && r.value.success).length;
    const failed = results.length - successful;

    return {
      status: "ok",
      message: `Processed ${successful} digests successfully, ${failed} failed`,
      recipients_count: recipients.length,
      successful,
      failed,
    };
  } catch (error) {
    logErrorSafely("daily-digest", error);
    throw error;
  }
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-device-id",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const result = await handler(req);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (error) {
    logErrorSafely("daily-digest", error);
    const isDevelopment = Deno.env.get("ENVIRONMENT") === "development";
    const errorResponse = createErrorResponse(error, 500, isDevelopment);
    return new Response(errorResponse.body, {
      ...errorResponse,
      headers: { ...corsHeaders, ...errorResponse.headers },
    });
  }
});

