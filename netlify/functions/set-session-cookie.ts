import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const COOKIE_NAME = "echo_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const COOKIE_SAME_SITE = "Lax";

// Helper to hash token (SHA-256)
async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": event.headers.origin || "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Credentials": "true",
      },
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": event.headers.origin || "*",
        "Access-Control-Allow-Credentials": "true",
      },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const { token } = JSON.parse(event.body || "{}");

    if (!token || typeof token !== "string") {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": event.headers.origin || "*",
          "Access-Control-Allow-Credentials": "true",
        },
        body: JSON.stringify({ error: "Token required" }),
      };
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("Missing Supabase configuration");
      return {
        statusCode: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": event.headers.origin || "*",
          "Access-Control-Allow-Credentials": "true",
        },
        body: JSON.stringify({ error: "Server configuration error" }),
      };
    }

    // Validate token exists in database by calling Supabase RPC
    const tokenHash = await hashToken(token);

    // Call Supabase to validate session
    const validateResponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/validate_session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_PUBLISHABLE_KEY || "",
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ p_token_hash: tokenHash }),
    });

    if (!validateResponse.ok) {
      const errorData = await validateResponse.json().catch(() => ({ error: "Validation failed" }));
      return {
        statusCode: 401,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": event.headers.origin || "*",
          "Access-Control-Allow-Credentials": "true",
        },
        body: JSON.stringify({ error: "Invalid session token", details: errorData }),
      };
    }

    const sessionData = await validateResponse.json();

    if (!sessionData || !sessionData[0]?.is_valid) {
      return {
        statusCode: 401,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": event.headers.origin || "*",
          "Access-Control-Allow-Credentials": "true",
        },
        body: JSON.stringify({ error: "Invalid or expired session token" }),
      };
    }

    // Build cookie string for Netlify domain
    // For echogarden.netlify.app, we don't set Domain attribute (works on exact domain)
    // Secure flag is set automatically by Netlify for HTTPS
    const isSecure = event.headers["x-forwarded-proto"] === "https" || event.headers["x-forwarded-ssl"] === "on";
    let cookieValue = `${COOKIE_NAME}=${token}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; SameSite=${COOKIE_SAME_SITE}`;
    
    if (isSecure) {
      cookieValue += "; Secure";
    }

    // Determine the origin domain for CORS
    const origin = event.headers.origin || event.headers.referer || "*";

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": cookieValue,
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true",
      },
      body: JSON.stringify({ success: true }),
    };
  } catch (error) {
    console.error("Error setting session cookie:", error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": event.headers.origin || "*",
        "Access-Control-Allow-Credentials": "true",
      },
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};

