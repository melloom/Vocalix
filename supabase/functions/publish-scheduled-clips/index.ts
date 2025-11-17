import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-device-id",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Call the database function to publish scheduled clips
    const { data: publishedClips, error } = await supabase.rpc("publish_scheduled_clips");

    if (error) {
      console.error("Error publishing scheduled clips:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "content-type": "application/json" },
        },
      );
    }

    // For each published clip, trigger the processing edge function
    if (publishedClips && publishedClips.length > 0) {
      const processingPromises = publishedClips.map(async (clip: { clip_id: string; profile_id: string; audio_path: string }) => {
        // Trigger the on-clip-uploaded function to process the clip
        await supabase.functions.invoke("on-clip-uploaded", {
          body: { clipId: clip.clip_id },
        }).catch((invokeError) => {
          console.error(`Failed to invoke on-clip-uploaded for clip ${clip.clip_id}:`, invokeError);
        });
      });

      await Promise.all(processingPromises);
    }

    return new Response(
      JSON.stringify({
        success: true,
        publishedCount: publishedClips?.length || 0,
        clips: publishedClips || [],
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in publish-scheduled-clips:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "content-type": "application/json" },
      },
    );
  }
});

