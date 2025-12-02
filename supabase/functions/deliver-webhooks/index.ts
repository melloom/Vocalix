import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0?target=deno";
import { createErrorResponse, logErrorSafely } from "../_shared/error-handler.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase configuration for deliver-webhooks.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ORIGIN") || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Credentials": "true",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

// Generate HMAC signature for webhook payload
async function generateSignature(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(payload);
  
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Deliver a single webhook
async function deliverWebhook(
  webhookId: string,
  url: string,
  secret: string,
  eventType: string,
  payload: any
): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  const payloadString = JSON.stringify(payload);
  const timestamp = Date.now();
  const signature = await generateSignature(`${timestamp}.${payloadString}`, secret);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-EchoGarden-Event": eventType,
        "X-EchoGarden-Timestamp": timestamp.toString(),
        "X-EchoGarden-Signature": `sha256=${signature}`,
        "User-Agent": "EchoGarden-Webhooks/1.0",
      },
      body: payloadString,
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    const responseBody = await response.text().catch(() => "");

    // Update delivery record
    await supabase
      .from("webhook_deliveries")
      .update({
        status: response.ok ? "success" : "failed",
        status_code: response.status,
        response_body: responseBody.substring(0, 1000), // Limit response body size
        completed_at: new Date().toISOString(),
      })
      .eq("id", webhookId);

    // Update webhook stats
    if (response.ok) {
      await supabase
        .from("webhooks")
        .update({
          last_success_at: new Date().toISOString(),
          last_triggered_at: new Date().toISOString(),
          failure_count: 0, // Reset on success
        })
        .eq("id", webhookId);
    } else {
      // Increment failure count
      const { data: webhook } = await supabase
        .from("webhooks")
        .select("failure_count, max_failures")
        .eq("id", webhookId)
        .single();

      if (webhook) {
        const newFailureCount = (webhook.failure_count || 0) + 1;
        await supabase
          .from("webhooks")
          .update({
            last_failure_at: new Date().toISOString(),
            last_triggered_at: new Date().toISOString(),
            failure_count: newFailureCount,
            is_active: newFailureCount < (webhook.max_failures || 5), // Disable if exceeded
          })
          .eq("id", webhookId);
      }
    }

    return {
      success: response.ok,
      statusCode: response.status,
      error: response.ok ? undefined : `HTTP ${response.status}: ${responseBody.substring(0, 200)}`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Update delivery record
    await supabase
      .from("webhook_deliveries")
      .update({
        status: "failed",
        error_message: errorMessage,
        completed_at: new Date().toISOString(),
      })
      .eq("id", webhookId);

    // Update webhook stats
    const { data: webhook } = await supabase
      .from("webhooks")
      .select("failure_count, max_failures")
      .eq("id", webhookId)
      .single();

    if (webhook) {
      const newFailureCount = (webhook.failure_count || 0) + 1;
      await supabase
        .from("webhooks")
        .update({
          last_failure_at: new Date().toISOString(),
          last_triggered_at: new Date().toISOString(),
          failure_count: newFailureCount,
          is_active: newFailureCount < (webhook.max_failures || 5),
        })
        .eq("id", webhookId);
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}

// Process pending webhooks
async function processPendingWebhooks() {
  // Get pending webhook deliveries (limit to 50 at a time)
  const { data: deliveries, error } = await supabase
    .from("webhook_deliveries")
    .select(`
      id,
      webhook_id,
      event_type,
      payload,
      webhooks:webhook_id (
        id,
        url,
        secret,
        is_active
      )
    `)
    .eq("status", "pending")
    .order("attempted_at", { ascending: true })
    .limit(50);

  if (error) {
    throw error;
  }

  if (!deliveries || deliveries.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  let succeeded = 0;
  let failed = 0;

  // Process each delivery with rate limiting
  for (const delivery of deliveries) {
    const webhook = delivery.webhooks as any;
    
    if (!webhook || !webhook.is_active) {
      // Mark as failed if webhook is inactive
      await supabase
        .from("webhook_deliveries")
        .update({
          status: "failed",
          error_message: "Webhook is inactive",
          completed_at: new Date().toISOString(),
        })
        .eq("id", delivery.id);
      failed++;
      continue;
    }

    // Check webhook delivery rate limit (max 100 deliveries per minute per webhook)
    const { data: rateLimitOk, error: rateLimitError } = await supabase.rpc(
      "check_webhook_delivery_rate_limit",
      { p_webhook_id: webhook.id }
    );

    if (rateLimitError || !rateLimitOk) {
      // Rate limit exceeded - skip for now, will retry later
      console.log(`Rate limit exceeded for webhook ${webhook.id}, skipping`);
      continue;
    }

    const result = await deliverWebhook(
      delivery.id,
      webhook.url,
      webhook.secret,
      delivery.event_type,
      delivery.payload
    );

    if (result.success) {
      succeeded++;
    } else {
      failed++;
    }

    // Small delay to avoid overwhelming webhook endpoints
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return { processed: deliveries.length, succeeded, failed };
}

// Main handler
serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // This function should be called by a cron job or triggered manually
    // For security, we can add authentication here
    const authHeader = req.headers.get("authorization");
    const expectedToken = Deno.env.get("WEBHOOK_CRON_SECRET");

    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "content-type": "application/json" },
        }
      );
    }

    if (req.method === "POST") {
      // Process pending webhooks
      const result = await processPendingWebhooks();

      return new Response(
        JSON.stringify({
          success: true,
          ...result,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "content-type": "application/json" },
        }
      );
    } else if (req.method === "GET") {
      // Get webhook delivery stats
      const url = new URL(req.url);
      const webhookId = url.searchParams.get("webhook_id");

      let query = supabase
        .from("webhook_deliveries")
        .select("id, event_type, status, status_code, attempted_at, completed_at", { count: "exact" })
        .order("attempted_at", { ascending: false })
        .limit(100);

      if (webhookId) {
        query = query.eq("webhook_id", webhookId);
      }

      const { data, error, count } = await query;

      if (error) {
        throw error;
      }

      return new Response(
        JSON.stringify({
          deliveries: data,
          total: count,
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
  } catch (error) {
    logErrorSafely("deliver-webhooks", error);
    const isDevelopment = Deno.env.get("ENVIRONMENT") === "development";
    const errorResponse = createErrorResponse(error, 500, isDevelopment);
    return new Response(errorResponse.body, {
      ...errorResponse,
      headers: { ...corsHeaders, ...errorResponse.headers },
    });
  }
});

