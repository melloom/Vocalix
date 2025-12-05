import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get the secret from environment variables
    const DEVICE_HASH_SECRET = Deno.env.get("DEVICE_HASH_SECRET");
    if (!DEVICE_HASH_SECRET) {
      throw new Error("DEVICE_HASH_SECRET not configured");
    }

    // Parse request body
    const { deviceId } = await req.json();

    if (!deviceId || typeof deviceId !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid deviceId" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create HMAC hash using the secret
    const encoder = new TextEncoder();
    const keyData = encoder.encode(DEVICE_HASH_SECRET);
    const messageData = encoder.encode(deviceId);

    // Use Web Crypto API for HMAC
    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signature = await crypto.subtle.sign("HMAC", key, messageData);
    const hashArray = Array.from(new Uint8Array(signature));
    const pseudoId = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Return the pseudonymized ID
    return new Response(
      JSON.stringify({ pseudoId }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error pseudonymizing device ID:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

