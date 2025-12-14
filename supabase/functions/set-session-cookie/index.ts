import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const COOKIE_NAME = "echo_session";
// For Netlify domains, we typically don't set Domain attribute (cookies work on exact domain)
// Only set domain if explicitly configured via env var
const COOKIE_DOMAIN = Deno.env.get("COOKIE_DOMAIN") || undefined;
// For Netlify (echogarden.netlify.app), use Secure in production (HTTPS)
const COOKIE_SECURE = Deno.env.get("COOKIE_SECURE") !== "false"; // Default true
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const COOKIE_SAME_SITE = "Lax";

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": req.headers.get("Origin") || "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Credentials": "true",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": req.headers.get("Origin") || "*",
          "Access-Control-Allow-Credentials": "true",
        },
      }
    );
  }

  try {
    const { token } = await req.json();

    if (!token || typeof token !== "string") {
      return new Response(
        JSON.stringify({ error: "Token required" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": req.headers.get("Origin") || "*",
            "Access-Control-Allow-Credentials": "true",
          },
        }
      );
    }

    // Validate token exists in database
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Hash token to check against database
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const tokenHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    // Verify session exists and is valid
    const { data: sessionData, error: sessionError } = await supabase.rpc("validate_session", {
      p_token_hash: tokenHash,
    });

    if (sessionError || !sessionData || !sessionData[0]?.is_valid) {
      return new Response(
        JSON.stringify({ error: "Invalid session token" }),
        {
          status: 401,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": req.headers.get("Origin") || "*",
            "Access-Control-Allow-Credentials": "true",
          },
        }
      );
    }

    // Build cookie string
    // For Netlify domains (echogarden.netlify.app), we don't set Domain attribute
    // Cookies will work on the exact domain (echogarden.netlify.app)
    // If you need cross-subdomain sharing (e.g., .netlify.app), set COOKIE_DOMAIN env var
    let cookieValue = `${COOKIE_NAME}=${token}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; SameSite=${COOKIE_SAME_SITE}`;
    
    // Only set Domain if explicitly configured (for custom domains with subdomains)
    if (COOKIE_DOMAIN) {
      cookieValue += `; Domain=${COOKIE_DOMAIN}`;
    }
    
    // Secure flag for HTTPS (required for production)
    if (COOKIE_SECURE) {
      cookieValue += "; Secure";
    }

    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": cookieValue,
          "Access-Control-Allow-Origin": req.headers.get("Origin") || "*",
          "Access-Control-Allow-Credentials": "true",
        },
      }
    );
  } catch (error) {
    console.error("Error setting session cookie:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": req.headers.get("Origin") || "*",
          "Access-Control-Allow-Credentials": "true",
        },
      }
    );
  }
});

