import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0?target=deno";
import { checkRateLimit, getRateLimitKey, createRateLimitHeaders } from "../_shared/rate-limit.ts";
import { createErrorResponse, logErrorSafely } from "../_shared/error-handler.ts";
import { withApiVersioning, parseApiVersion } from "../_shared/api-versioning.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase configuration for public-api.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ORIGIN") || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key, x-api-version",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Credentials": "true",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

// Hash API key for validation
function hashApiKey(key: string): string {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  return crypto.subtle.digest("SHA-256", data).then((hash) => {
    const hashArray = Array.from(new Uint8Array(hash));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  });
}

// Validate API key
async function validateApiKey(apiKey: string | null): Promise<{
  valid: boolean;
  apiKeyId?: string;
  profileId?: string;
  scopes?: string[];
  rateLimit?: number;
  rotationRequired?: boolean;
  daysSinceRotation?: number;
}> {
  if (!apiKey || !apiKey.startsWith("eg_")) {
    return { valid: false };
  }

  try {
    const keyHash = await hashApiKey(apiKey);
    
    const { data, error } = await supabase.rpc("validate_api_key", {
      p_key_hash: keyHash,
    });

    if (error || !data || data.length === 0) {
      return { valid: false };
    }

    const keyData = data[0];
    return {
      valid: true,
      apiKeyId: keyData.api_key_id,
      profileId: keyData.profile_id,
      scopes: keyData.scopes,
      rateLimit: keyData.rate_limit_per_minute,
      rotationRequired: keyData.rotation_required || false,
      daysSinceRotation: keyData.days_since_rotation || 0,
    };
  } catch (error) {
    console.error("API key validation error:", error);
    return { valid: false };
  }
}

// Check for suspicious API usage patterns
async function checkSuspiciousUsage(
  apiKeyId: string,
  clientIp: string,
  endpoint: string,
  method: string
): Promise<{ suspicious: boolean; reason?: string }> {
  try {
    // Track IP history and detect suspicious patterns
    const { data: isSuspicious, error } = await supabase.rpc("update_api_key_ip_history", {
      p_api_key_id: apiKeyId,
      p_ip_address: clientIp,
    });

    if (error) {
      console.error("Suspicious usage check error:", error);
      return { suspicious: false };
    }

    if (isSuspicious) {
      return {
        suspicious: true,
        reason: "Unusual IP diversity detected - key may be compromised",
      };
    }

    // Check for rapid successive requests from same IP (potential automated scraping)
    // This is already handled by rate limiting, but we can log it
    // Check for unusual request patterns (e.g., many requests to search endpoint)
    // Additional pattern detection can be added here

    return { suspicious: false };
  } catch (error) {
    console.error("Error checking suspicious usage:", error);
    return { suspicious: false };
  }
}

// Check if scope is allowed
function hasScope(scopes: string[], requiredScope: string): boolean {
  return scopes.includes(requiredScope) || scopes.includes("admin");
}

// Log API usage
async function logApiUsage(
  apiKeyId: string | undefined,
  endpoint: string,
  method: string,
  statusCode: number,
  responseTimeMs: number
) {
  if (!apiKeyId) return;

  try {
    await supabase.from("api_usage_logs").insert({
      api_key_id: apiKeyId,
      endpoint,
      method,
      status_code: statusCode,
      response_time_ms: responseTimeMs,
    });
  } catch (error) {
    // Silently fail - logging is not critical
    console.error("Failed to log API usage:", error);
  }
}

// API Handler
const apiHandler = async (req: Request, version: string): Promise<Response> => {
  const startTime = Date.now();

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get API key from header
    const apiKey = req.headers.get("x-api-key") || req.headers.get("authorization")?.replace("Bearer ", "");

    // Validate API key
    const keyValidation = await validateApiKey(apiKey);
    if (!keyValidation.valid) {
      return new Response(
        JSON.stringify({
          error: "Invalid or missing API key",
          message: "Please provide a valid API key in the X-API-Key header",
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "content-type": "application/json" },
        }
      );
    }

    const { apiKeyId, profileId, scopes = [], rateLimit = 20, rotationRequired = false, daysSinceRotation = 0 } = keyValidation; // Reduced to 20/min for security

    // Check if rotation is required (warn but don't block)
    if (rotationRequired && daysSinceRotation > 90) {
      console.warn(`API key ${apiKeyId} requires rotation (${daysSinceRotation} days since last rotation)`);
      // In production, you might want to send a warning response header
      // For now, we just log it and allow the request
    }

    // Get client IP for tracking
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || 
                     req.headers.get("x-real-ip") || 
                     "unknown";

    // Check for suspicious usage patterns (async, don't block request)
    if (apiKeyId && clientIp !== "unknown") {
      const url = new URL(req.url);
      checkSuspiciousUsage(apiKeyId, clientIp, url.pathname, req.method)
        .then((result) => {
          if (result.suspicious) {
            console.warn(`Suspicious API usage detected for key ${apiKeyId}: ${result.reason}`);
            // Flag the key for review (async)
            supabase.rpc("flag_suspicious_api_usage", {
              p_api_key_id: apiKeyId,
              p_reason: result.reason || "Suspicious usage pattern detected",
            }).catch((err) => console.error("Failed to flag suspicious usage:", err));
          }
        })
        .catch((err) => console.error("Suspicious usage check failed:", err));
    }

    // Check daily quota first
    try {
      const keyHash = await hashApiKey(apiKey!);
      const { data: quotaCheck, error: quotaError } = await supabase.rpc("check_api_key_quota", {
        p_key_hash: keyHash,
      });

      if (quotaError || quotaCheck === false) {
        const responseTime = Date.now() - startTime;
        await logApiUsage(apiKeyId, new URL(req.url).pathname, req.method, 429, responseTime);
        
        return new Response(
          JSON.stringify({
            error: "Daily quota exceeded",
            message: "You have exceeded your daily API quota. Please try again tomorrow.",
          }),
          {
            status: 429,
            headers: { ...corsHeaders, "content-type": "application/json" },
          }
        );
      }
    } catch (error) {
      console.error("Quota check error:", error);
      // Continue with rate limiting if quota check fails
    }

    // Rate limiting per API key
    const rateLimitKey = getRateLimitKey("apiKey", "api", apiKeyId || "unknown");
    const rateLimitResult = await checkRateLimit(supabase, rateLimitKey, {
      maxRequests: rateLimit,
      windowMs: 60000, // 1 minute
      identifier: apiKeyId || "unknown",
    });

    // IP-based rate limiting (stricter when using API key)
    const ipRateLimitKey = getRateLimitKey("ip", "api", clientIp);
    const ipRateLimitResult = await checkRateLimit(supabase, ipRateLimitKey, {
      maxRequests: Math.min(rateLimit, 50), // Max 50/min per IP, or API key limit (whichever is lower)
      windowMs: 60000,
      identifier: clientIp,
    });

    // Check if either API key or IP rate limit exceeded
    if (!rateLimitResult.allowed || !ipRateLimitResult.allowed) {
      const responseTime = Date.now() - startTime;
      await logApiUsage(apiKeyId, new URL(req.url).pathname, req.method, 429, responseTime);
      
      const exceededLimit = !rateLimitResult.allowed ? "API key" : "IP address";
      const retryAfter = (!rateLimitResult.allowed ? rateLimitResult.retryAfter : ipRateLimitResult.retryAfter) || 60;
      
      return new Response(
        JSON.stringify({
          error: "Rate limit exceeded",
          message: `Rate limit exceeded for ${exceededLimit}. Please try again in ${retryAfter} seconds.`,
          retryAfter,
        }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            ...createRateLimitHeaders(rateLimitResult),
            ...createRateLimitHeaders(ipRateLimitResult),
            "content-type": "application/json",
          },
        }
      );
    }

    // Check request size limit (10MB max)
    const contentLength = req.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) {
      const responseTime = Date.now() - startTime;
      await logApiUsage(apiKeyId, new URL(req.url).pathname, req.method, 413, responseTime);
      
      return new Response(
        JSON.stringify({
          error: "Request too large",
          message: "Request body exceeds 10MB limit",
        }),
        {
          status: 413,
          headers: { ...corsHeaders, "content-type": "application/json" },
        }
      );
    }

    // Parse URL
    const url = new URL(req.url);
    const path = url.pathname.replace("/functions/v1/public-api", "");
    const pathParts = path.split("/").filter((p) => p);

    // Route handling
    let response: Response;

    if (pathParts[0] === "clips") {
      response = await handleClips(req, pathParts, scopes, profileId);
    } else if (pathParts[0] === "profiles") {
      response = await handleProfiles(req, pathParts, scopes);
    } else if (pathParts[0] === "topics") {
      response = await handleTopics(req, pathParts, scopes);
    } else if (pathParts[0] === "search") {
      response = await handleSearch(req, pathParts, scopes);
    } else if (pathParts.length === 0) {
      // Root endpoint - API info
      response = new Response(
        JSON.stringify({
          name: "Echo Garden API",
          version,
          endpoints: {
            clips: "/clips",
            profiles: "/profiles",
            topics: "/topics",
            search: "/search",
          },
          documentation: "https://docs.echogarden.com/api",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "content-type": "application/json" },
        }
      );
    } else {
      response = new Response(
        JSON.stringify({
          error: "Not found",
          message: `Endpoint ${path} not found`,
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "content-type": "application/json" },
        }
      );
    }

    // Add rate limit headers
    const headers = new Headers(response.headers);
    Object.entries(createRateLimitHeaders(rateLimitResult)).forEach(([key, value]) => {
      headers.set(key, value);
    });

    // Add rotation warning header if rotation is required
    if (rotationRequired) {
      headers.set("X-API-Key-Rotation-Required", "true");
      headers.set("X-API-Key-Days-Since-Rotation", daysSinceRotation.toString());
      headers.set("Warning", `299 - "API key rotation required after ${daysSinceRotation} days"`);
    }

    // Log API usage
    const responseTime = Date.now() - startTime;
    await logApiUsage(apiKeyId, path, req.method, response.status, responseTime);

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    logErrorSafely("public-api", error);
    const isDevelopment = Deno.env.get("ENVIRONMENT") === "development";
    const errorResponse = createErrorResponse(error, 500, isDevelopment);
    return new Response(errorResponse.body, {
      ...errorResponse,
      headers: { ...corsHeaders, ...errorResponse.headers },
    });
  }
};

// Handle clips endpoints
async function handleClips(
  req: Request,
  pathParts: string[],
  scopes: string[],
  profileId?: string
): Promise<Response> {
  if (req.method === "GET") {
    if (pathParts.length === 1) {
      // GET /clips - List clips
      const url = new URL(req.url);
      const limit = parseInt(url.searchParams.get("limit") || "20");
      const offset = parseInt(url.searchParams.get("offset") || "0");
      const topicId = url.searchParams.get("topic_id");
      const profileIdFilter = url.searchParams.get("profile_id");
      const status = url.searchParams.get("status") || "live";

      let query = supabase
        .from("clips")
        .select(`
          id,
          profile_id,
          audio_path,
          duration_seconds,
          title,
          captions,
          summary,
          tags,
          mood_emoji,
          listens_count,
          reactions,
          created_at,
          topic_id,
          profiles:profile_id (
            id,
            handle,
            emoji_avatar
          ),
          topics:topic_id (
            id,
            title,
            date
          )
        `)
        .eq("status", status)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (topicId) {
        query = query.eq("topic_id", topicId);
      }

      if (profileIdFilter) {
        query = query.eq("profile_id", profileIdFilter);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return new Response(
        JSON.stringify({
          data,
          pagination: {
            limit,
            offset,
            hasMore: data.length === limit,
          },
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "content-type": "application/json" },
        }
      );
    } else if (pathParts.length === 2) {
      // GET /clips/:id - Get single clip
      const clipId = pathParts[1];

      const { data, error } = await supabase
        .from("clips")
        .select(`
          *,
          profiles:profile_id (
            id,
            handle,
            emoji_avatar
          ),
          topics:topic_id (
            id,
            title,
            date
          )
        `)
        .eq("id", clipId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          return new Response(
            JSON.stringify({ error: "Clip not found" }),
            { status: 404, headers: { ...corsHeaders, "content-type": "application/json" } }
          );
        }
        throw error;
      }

      return new Response(JSON.stringify({ data }), {
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }
  } else if (req.method === "POST" && hasScope(scopes, "write")) {
    // POST /clips - Create clip (requires write scope)
    const body = await req.json();
    // Note: Actual clip creation requires audio upload, which should be done via the main app
    // This endpoint is mainly for webhook/automation purposes
    return new Response(
      JSON.stringify({
        error: "Not implemented",
        message: "Clip creation via API requires audio upload. Please use the main application.",
      }),
      {
        status: 501,
        headers: { ...corsHeaders, "content-type": "application/json" },
      }
    );
  }

  return new Response(
    JSON.stringify({ error: "Method not allowed" }),
    { status: 405, headers: { ...corsHeaders, "content-type": "application/json" } }
  );
}

// Handle profiles endpoints
async function handleProfiles(
  req: Request,
  pathParts: string[],
  scopes: string[]
): Promise<Response> {
  if (req.method === "GET") {
    if (pathParts.length === 1) {
      // GET /profiles - List profiles
      const url = new URL(req.url);
      const limit = parseInt(url.searchParams.get("limit") || "20");
      const offset = parseInt(url.searchParams.get("offset") || "0");

      const { data, error } = await supabase
        .from("profiles")
        .select("id, handle, emoji_avatar, joined_at, created_at")
        .order("joined_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        throw error;
      }

      return new Response(
        JSON.stringify({
          data,
          pagination: {
            limit,
            offset,
            hasMore: data.length === limit,
          },
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "content-type": "application/json" },
        }
      );
    } else if (pathParts.length === 2) {
      // GET /profiles/:id - Get single profile
      const profileId = pathParts[1];

      const { data, error } = await supabase
        .from("profiles")
        .select("id, handle, emoji_avatar, joined_at, created_at")
        .eq("id", profileId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          return new Response(
            JSON.stringify({ error: "Profile not found" }),
            { status: 404, headers: { ...corsHeaders, "content-type": "application/json" } }
          );
        }
        throw error;
      }

      return new Response(JSON.stringify({ data }), {
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }
  }

  return new Response(
    JSON.stringify({ error: "Method not allowed" }),
    { status: 405, headers: { ...corsHeaders, "content-type": "application/json" } }
  );
}

// Handle topics endpoints
async function handleTopics(
  req: Request,
  pathParts: string[],
  scopes: string[]
): Promise<Response> {
  if (req.method === "GET") {
    if (pathParts.length === 1) {
      // GET /topics - List topics
      const url = new URL(req.url);
      const limit = parseInt(url.searchParams.get("limit") || "20");
      const offset = parseInt(url.searchParams.get("offset") || "0");
      const active = url.searchParams.get("active");

      let query = supabase
        .from("topics")
        .select("*")
        .order("date", { ascending: false })
        .range(offset, offset + limit - 1);

      if (active === "true") {
        query = query.eq("is_active", true);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return new Response(
        JSON.stringify({
          data,
          pagination: {
            limit,
            offset,
            hasMore: data.length === limit,
          },
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "content-type": "application/json" },
        }
      );
    } else if (pathParts.length === 2) {
      // GET /topics/:id - Get single topic
      const topicId = pathParts[1];

      const { data, error } = await supabase
        .from("topics")
        .select("*")
        .eq("id", topicId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          return new Response(
            JSON.stringify({ error: "Topic not found" }),
            { status: 404, headers: { ...corsHeaders, "content-type": "application/json" } }
          );
        }
        throw error;
      }

      return new Response(JSON.stringify({ data }), {
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }
  }

  return new Response(
    JSON.stringify({ error: "Method not allowed" }),
    { status: 405, headers: { ...corsHeaders, "content-type": "application/json" } }
  );
}

// Handle search endpoints
async function handleSearch(
  req: Request,
  pathParts: string[],
  scopes: string[]
): Promise<Response> {
  if (req.method === "GET") {
    const url = new URL(req.url);
    const query = url.searchParams.get("q");
    const limit = parseInt(url.searchParams.get("limit") || "20");
    const offset = parseInt(url.searchParams.get("offset") || "0");

    if (!query) {
      return new Response(
        JSON.stringify({ error: "Missing query parameter 'q'" }),
        { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

    // Use the existing search function if available, otherwise do a simple search
    const { data, error } = await supabase
      .from("clips")
      .select(`
        id,
        profile_id,
        audio_path,
        duration_seconds,
        title,
        captions,
        summary,
        tags,
        mood_emoji,
        listens_count,
        reactions,
        created_at,
        profiles:profile_id (
          id,
          handle,
          emoji_avatar
        )
      `)
      .eq("status", "live")
      .or(`title.ilike.%${query}%,captions.ilike.%${query}%,summary.ilike.%${query}%`)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw error;
    }

    return new Response(
      JSON.stringify({
        data,
        query,
        pagination: {
          limit,
          offset,
          hasMore: data.length === limit,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" },
      }
    );
  }

  return new Response(
    JSON.stringify({ error: "Method not allowed" }),
    { status: 405, headers: { ...corsHeaders, "content-type": "application/json" } }
  );
}

// Serve with API versioning
serve(withApiVersioning(apiHandler));

