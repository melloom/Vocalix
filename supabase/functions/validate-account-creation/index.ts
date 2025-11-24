import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0?target=deno";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const RECAPTCHA_SECRET_KEY = Deno.env.get("RECAPTCHA_SECRET_KEY");

// Inline error handling utilities (from _shared/error-handler.ts)
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
  options: { status?: number; headers?: Record<string, string> } = {},
  customMessage?: string
): Response {
  const status = options.status || 500;
  const headers = options.headers || {};
  const sanitizedMessage = customMessage || sanitizeErrorMessage(error, false);

  return new Response(
    JSON.stringify({
      error: sanitizedMessage,
    }),
    {
      status,
      headers: {
        "content-type": "application/json",
        ...headers,
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

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing required environment variables for validate-account-creation.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const origin = Deno.env.get("ORIGIN") || "*";

const corsHeaders = {
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-device-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Credentials": "true",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

interface ValidateRequest {
  handle: string;
  device_id: string;
  device_fingerprint?: string;
  user_agent?: string;
  honeypot?: string; // Honeypot field - should be empty for legitimate users
  recaptcha_token?: string; // reCAPTCHA token for verification
}

interface ValidateResponse {
  allowed: boolean;
  reason?: string;
  retry_after?: string;
  handle_available?: boolean;
  is_reserved?: boolean;
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

    // Get IP address from request (Supabase sets these headers)
    const forwardedFor = req.headers.get("x-forwarded-for");
    const realIp = req.headers.get("x-real-ip");
    const cfConnectingIp = req.headers.get("cf-connecting-ip"); // Cloudflare
    const ipAddress = forwardedFor?.split(",")[0]?.trim() || realIp || cfConnectingIp || "0.0.0.0";

    const { handle, device_id, device_fingerprint, user_agent, honeypot, recaptcha_token }: ValidateRequest = await req.json();

    if (!handle || !device_id) {
      return new Response(
        JSON.stringify({ error: "handle and device_id are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "content-type": "application/json" },
        }
      );
    }

    // Check honeypot field - if filled, it's likely a bot
    if (honeypot && honeypot.trim().length > 0) {
      // Log the bot attempt (non-blocking)
      logErrorSafely("honeypot_triggered", new Error("Honeypot field filled"), {
        handle: handle.toLowerCase().trim(),
        device_id,
        honeypot_value: honeypot,
      });

      return new Response(
        JSON.stringify({
          allowed: false,
          reason: "Invalid request detected",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "content-type": "application/json" },
        }
      );
    }

    // Verify reCAPTCHA token if secret key is configured
    if (RECAPTCHA_SECRET_KEY) {
      if (!recaptcha_token || recaptcha_token.trim().length === 0) {
        return new Response(
          JSON.stringify({
            allowed: false,
            reason: "reCAPTCHA verification is required",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "content-type": "application/json" },
          }
        );
      }

      // Verify token with Google reCAPTCHA API
      try {
        const recaptchaResponse = await fetch(
          `https://www.google.com/recaptcha/api/siteverify?secret=${RECAPTCHA_SECRET_KEY}&response=${recaptcha_token}`,
          {
            method: "POST",
          }
        );

        if (!recaptchaResponse.ok) {
          logErrorSafely("recaptcha_verification", new Error("Failed to verify reCAPTCHA token"));
          return new Response(
            JSON.stringify({
              allowed: false,
              reason: "reCAPTCHA verification failed. Please try again.",
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "content-type": "application/json" },
            }
          );
        }

        const recaptchaData = await recaptchaResponse.json();

        if (!recaptchaData.success) {
          const errorCodes = recaptchaData["error-codes"] || [];
          
          // Log failed verification attempts with detailed error codes
          logErrorSafely("recaptcha_failed", new Error(`reCAPTCHA verification failed: ${errorCodes.join(", ")}`), {
            handle: handle.toLowerCase().trim(),
            device_id,
            error_codes: errorCodes,
          });

          // Provide more helpful error message based on error codes
          let errorMessage = "reCAPTCHA verification failed. Please try again.";
          if (errorCodes.includes("invalid-input-secret")) {
            errorMessage = "reCAPTCHA configuration error. Please contact support.";
          } else if (errorCodes.includes("invalid-input-response")) {
            errorMessage = "reCAPTCHA token is invalid. Please complete the verification again.";
          } else if (errorCodes.includes("timeout-or-duplicate")) {
            errorMessage = "reCAPTCHA token expired. Please complete the verification again.";
          } else if (errorCodes.includes("bad-request")) {
            errorMessage = "reCAPTCHA request error. Please try again.";
          }

          return new Response(
            JSON.stringify({
              allowed: false,
              reason: errorMessage,
              // Include error codes in development for debugging (not in production)
              ...(Deno.env.get("ENVIRONMENT") === "development" && { error_codes: errorCodes }),
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "content-type": "application/json" },
            }
          );
        }

        // Optional: Check score for reCAPTCHA v3 (score < 0.5 is suspicious)
        if (recaptchaData.score !== undefined && recaptchaData.score < 0.5) {
          logErrorSafely("recaptcha_low_score", new Error("reCAPTCHA score too low"), {
            handle: handle.toLowerCase().trim(),
            device_id,
            score: recaptchaData.score,
          });

          return new Response(
            JSON.stringify({
              allowed: false,
              reason: "Verification failed. Please try again.",
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "content-type": "application/json" },
            }
          );
        }
      } catch (recaptchaError) {
        logErrorSafely("recaptcha_error", recaptchaError);
        // In case of error, allow but log it (fail open for availability)
        // In production, you might want to fail closed
        console.warn("reCAPTCHA verification error, allowing request but logging:", recaptchaError);
      }
    }

    // Normalize handle (lowercase, trim)
    const normalizedHandle = handle.toLowerCase().trim();

    // 1. Validate device ID format
    const { data: deviceValid, error: deviceError } = await supabase.rpc("is_valid_device_id", {
      p_device_id: device_id,
    });

    if (deviceError || !deviceValid) {
      return new Response(
        JSON.stringify({
          allowed: false,
          reason: "Invalid device ID format",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "content-type": "application/json" },
        }
      );
    }

    // 2. Check if handle is reserved
    const { data: isReserved, error: reservedError } = await supabase.rpc("is_handle_reserved", {
      p_handle: normalizedHandle,
    });

    if (reservedError) {
      logErrorSafely("check_handle_reserved", reservedError);
    }

    if (isReserved) {
      return new Response(
        JSON.stringify({
          allowed: false,
          reason: "This handle is reserved and cannot be used",
          is_reserved: true,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "content-type": "application/json" },
        }
      );
    }

    // 3. Check if handle is available (case-insensitive)
    const { data: isAvailable, error: availableError } = await supabase.rpc("is_handle_available", {
      p_handle: normalizedHandle,
    });

    if (availableError) {
      logErrorSafely("check_handle_available", availableError);
    }

    if (!isAvailable) {
      return new Response(
        JSON.stringify({
          allowed: false,
          reason: "This handle is already taken",
          handle_available: false,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "content-type": "application/json" },
        }
      );
    }

    // 4. Check IP-based rate limits
    const { data: rateLimitResult, error: rateLimitError } = await supabase.rpc(
      "check_account_creation_rate_limit",
      {
        p_ip_address: ipAddress,
        p_max_accounts_per_24h: 3,
        p_max_accounts_per_hour: 1,
      }
    );

    if (rateLimitError) {
      logErrorSafely("check_account_creation_rate_limit", rateLimitError);
      // On error, allow but log it
      return new Response(
        JSON.stringify({
          allowed: true,
          handle_available: true,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "content-type": "application/json" },
        }
      );
    }

    if (rateLimitResult && rateLimitResult.length > 0) {
      const result = rateLimitResult[0];
      if (!result.allowed) {
        return new Response(
          JSON.stringify({
            allowed: false,
            reason: result.reason || "Account creation rate limit exceeded",
            retry_after: result.retry_after,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "content-type": "application/json" },
          }
        );
      }
    }

    // 5. Bot detection (non-blocking, but logs suspicious activity)
    try {
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
      const botDetectionResponse = await fetch(
        `${SUPABASE_URL}/functions/v1/detect-bot`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            user_agent,
            device_fingerprint,
            device_id,
            action_type: "account_creation",
          }),
        }
      );

      if (botDetectionResponse.ok) {
        const botData = await botDetectionResponse.json();
        if (botData.is_bot && botData.risk_score >= 70) {
          // High confidence bot - block
          return new Response(
            JSON.stringify({
              allowed: false,
              reason: "Automated account creation detected. Please contact support if you believe this is an error.",
            }),
            {
              status: 200,
              headers: { ...corsHeaders, "content-type": "application/json" },
            }
          );
        } else if (botData.is_bot && botData.risk_score >= 40) {
          // Medium confidence - require challenge (for now, just log)
          // In production, you would return a challenge requirement
          logErrorSafely("validate-account-creation", new Error(`Suspicious account creation attempt: ${JSON.stringify(botData)}`));
        }
      }
    } catch (botError) {
      // Bot detection failed - don't block, but log
      logErrorSafely("bot_detection", botError);
    }

    // All validations passed
    return new Response(
      JSON.stringify({
        allowed: true,
        handle_available: true,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" },
      }
    );
  } catch (error) {
    logErrorSafely("validate-account-creation", error);
    return createErrorResponse(
      error,
      { status: 500, headers: corsHeaders },
      "Failed to validate account creation"
    );
  }
});

