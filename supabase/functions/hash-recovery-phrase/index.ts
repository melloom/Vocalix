import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { recoveryPhrase } = await req.json();
    if (!recoveryPhrase) {
      return new Response(JSON.stringify({ error: "Missing recoveryPhrase" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalize the phrase (trim, lowercase, remove extra spaces)
    const normalizedPhrase = recoveryPhrase
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");

    const secret = Deno.env.get("DEVICE_HASH_SECRET");
    if (!secret) {
      throw new Error("DEVICE_HASH_SECRET is not set in environment variables.");
    }

    // Hash the recovery phrase using HMAC (same method as device ID)
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(normalizedPhrase);

    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signature = await crypto.subtle.sign("HMAC", key, messageData);
    const hashArray = Array.from(new Uint8Array(signature));
    const phraseHash = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return new Response(JSON.stringify({ recoveryPhraseHash: phraseHash }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in hash-recovery-phrase function:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

