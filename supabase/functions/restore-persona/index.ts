import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { recoveryPhrase, newPseudoId } = await req.json();
    if (!recoveryPhrase || !newPseudoId) {
      return new Response(JSON.stringify({ error: "Missing recoveryPhrase or newPseudoId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Normalize and hash the recovery phrase
    const normalizedPhrase = recoveryPhrase
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");

    const secret = Deno.env.get("DEVICE_HASH_SECRET");
    if (!secret) {
      throw new Error("DEVICE_HASH_SECRET is not set in environment variables.");
    }

    // Hash using Web Crypto API (same as device ID)
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
    const recoveryPhraseHash = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Call the database function to restore the persona
    const { data, error } = await supabaseAdmin.rpc("restore_persona_by_recovery_phrase", {
      p_recovery_phrase_hash: recoveryPhraseHash,
      p_new_pseudo_id: newPseudoId,
    });

    if (error) throw error;

    if (!data || data.length === 0 || !data[0].success) {
      return new Response(
        JSON.stringify({ error: "Invalid recovery phrase. Please check and try again." }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const profile = data[0];

    return new Response(
      JSON.stringify({
        success: true,
        profileId: profile.profile_id,
        handle: profile.handle,
        message: "Persona restored successfully!",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in restore-persona function:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

