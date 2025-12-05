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
    // Verify this is an admin request (you should add proper auth here)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the secret for pseudonymization
    const DEVICE_HASH_SECRET = Deno.env.get("DEVICE_HASH_SECRET");
    if (!DEVICE_HASH_SECRET) {
      throw new Error("DEVICE_HASH_SECRET not configured");
    }

    // Pseudonymize function (same as in pseudonymize-device)
    const pseudonymizeDeviceId = async (deviceId: string): Promise<string> => {
      const encoder = new TextEncoder();
      const keyData = encoder.encode(DEVICE_HASH_SECRET);
      const messageData = encoder.encode(deviceId);

      const key = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );

      const signature = await crypto.subtle.sign("HMAC", key, messageData);
      const hashArray = Array.from(new Uint8Array(signature));
      return hashArray
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    };

    // Get all profiles without pseudo_id
    const { data: profiles, error: fetchError } = await supabase
      .from("profiles")
      .select("id, device_id")
      .is("pseudo_id", null)
      .not("device_id", "is", null)
      .limit(100); // Process in batches

    if (fetchError) {
      throw fetchError;
    }

    if (!profiles || profiles.length === 0) {
      return new Response(
        JSON.stringify({ message: "No profiles to migrate", migrated: 0 }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Migrate each profile
    let migrated = 0;
    let errors = 0;

    for (const profile of profiles) {
      try {
        if (!profile.device_id) continue;

        // Generate pseudo_id
        const pseudoId = await pseudonymizeDeviceId(profile.device_id);

        // Update profile with pseudo_id
        const { error: updateError } = await supabase
          .from("profiles")
          .update({ pseudo_id: pseudoId })
          .eq("id", profile.id);

        if (updateError) {
          console.error(`Error updating profile ${profile.id}:`, updateError);
          errors++;
        } else {
          migrated++;
        }
      } catch (error) {
        console.error(`Error processing profile ${profile.id}:`, error);
        errors++;
      }
    }

    return new Response(
      JSON.stringify({
        message: "Migration batch completed",
        migrated,
        errors,
        total: profiles.length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in migration:", error);
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

