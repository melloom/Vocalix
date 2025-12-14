import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0?target=deno";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing required environment variables");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-device-id",
};

/**
 * Create a voice clone using ElevenLabs API
 */
async function createVoiceClone(
  audioUrl: string,
  name: string,
  description?: string
): Promise<{ voice_id: string; status: string } | null> {
  if (!ELEVENLABS_API_KEY) {
    console.warn("ElevenLabs API key not configured, voice cloning disabled");
    return null;
  }

  try {
    // Download audio file from Supabase storage
    const audioPath = audioUrl.replace(/^.*\/audio\//, "");
    const { data: audioData, error: downloadError } = await supabase.storage
      .from("audio")
      .download(audioPath);

    if (downloadError || !audioData) {
      throw new Error(`Failed to download audio: ${downloadError?.message}`);
    }

    // Convert to blob for ElevenLabs
    const audioBlob = await audioData.blob();

    // Create FormData for ElevenLabs API
    const formData = new FormData();
    formData.append("name", name);
    if (description) {
      formData.append("description", description);
    }
    formData.append("files", audioBlob, "voice-sample.webm");

    // Call ElevenLabs API to create voice clone
    const response = await fetch("https://api.elevenlabs.io/v1/voices/add", {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ElevenLabs API error:", errorText);
      throw new Error(`ElevenLabs API error: ${errorText}`);
    }

    const json = await response.json();
    return {
      voice_id: json.voice_id,
      status: json.status || "created",
    };
  } catch (error) {
    console.error("Error creating voice clone:", error);
    throw error;
  }
}

/**
 * Generate speech from text using cloned voice
 */
async function generateSpeech(
  voiceId: string,
  text: string,
  modelId: string = "eleven_multilingual_v2"
): Promise<Blob | null> {
  if (!ELEVENLABS_API_KEY) {
    console.warn("ElevenLabs API key not configured");
    return null;
  }

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: text,
          model_id: modelId,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ElevenLabs TTS error:", errorText);
      return null;
    }

    return await response.blob();
  } catch (error) {
    console.error("Error generating speech:", error);
    return null;
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const deviceId = req.headers.get("x-device-id");
    if (!deviceId) {
      return new Response(
        JSON.stringify({ error: "Device ID required" }),
        {
          status: 401,
          headers: { ...corsHeaders, "content-type": "application/json" },
        }
      );
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, handle, voice_cloning_enabled, voice_model_id")
      .eq("device_id", deviceId)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: "Profile not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "content-type": "application/json" },
        }
      );
    }

    if (req.method === "POST") {
      const { 
        action, 
        audioUrl, 
        clipId, 
        text, 
        name, 
        description,
        sourceClipId, // For cloning another creator's voice
        originalCreatorId, // For cloning another creator's voice
        consentId // Consent ID if cloning another creator's voice
      } = await req.json();

      // Action: create_voice_clone (self-cloning or cloning others with consent)
      if (action === "create_voice_clone") {
        if (!audioUrl || !name) {
          return new Response(
            JSON.stringify({
              error: "audioUrl and name are required for voice cloning",
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "content-type": "application/json" },
            }
          );
        }

        // If cloning another creator's voice, check consent
        if (sourceClipId && originalCreatorId) {
          // Check if user has permission to clone this voice
          const { data: canClone, error: canCloneError } = await supabase
            .rpc("can_clone_voice", {
              p_requester_id: profile.id,
              p_creator_id: originalCreatorId,
              p_clip_id: sourceClipId,
            });

          if (canCloneError || !canClone) {
            return new Response(
              JSON.stringify({
                error: "You do not have permission to clone this voice. Please request consent first.",
              }),
              {
                status: 403,
                headers: { ...corsHeaders, "content-type": "application/json" },
              }
            );
          }

          // Create cloned voice model record
          try {
            const voiceClone = await createVoiceClone(
              audioUrl,
              name,
              description
            );

            if (!voiceClone) {
              return new Response(
                JSON.stringify({
                  error: "Failed to create voice clone (API key may be missing)",
                }),
                {
                  status: 500,
                  headers: {
                    ...corsHeaders,
                    "content-type": "application/json",
                  },
                }
              );
            }

            // Store cloned voice model
            const { error: modelError } = await supabase
              .from("cloned_voice_models")
              .insert({
                user_id: profile.id,
                original_creator_id: originalCreatorId,
                source_clip_id: sourceClipId,
                consent_id: consentId || null,
                voice_model_id: voiceClone.voice_id,
                voice_model_name: name,
              });

            if (modelError) {
              console.error("Error storing cloned voice model:", modelError);
            }

            return new Response(
              JSON.stringify({
                success: true,
                voice_model_id: voiceClone.voice_id,
                status: voiceClone.status,
                is_cloned_from_other: true,
              }),
              {
                headers: { ...corsHeaders, "content-type": "application/json" },
                status: 200,
              }
            );
          } catch (error) {
            console.error("Error creating voice clone:", error);
            return new Response(
              JSON.stringify({
                error: "Failed to create voice clone",
                message:
                  error instanceof Error ? error.message : "Unknown error",
              }),
              {
                status: 500,
                headers: { ...corsHeaders, "content-type": "application/json" },
              }
            );
          }
        }

        // Self-cloning (original behavior)
        // Check if user already has a voice model
        if (profile.voice_model_id) {
          return new Response(
            JSON.stringify({
              error: "Voice model already exists",
              voice_model_id: profile.voice_model_id,
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "content-type": "application/json" },
            }
          );
        }

        try {
          const voiceClone = await createVoiceClone(
            audioUrl,
            name || `${profile.handle}'s Voice`,
            description
          );

          if (!voiceClone) {
            return new Response(
              JSON.stringify({
                error: "Failed to create voice clone (API key may be missing)",
              }),
              {
                status: 500,
                headers: {
                  ...corsHeaders,
                  "content-type": "application/json",
                },
              }
            );
          }

          // Update profile with voice model ID
          const { error: updateError } = await supabase
            .from("profiles")
            .update({
              voice_cloning_enabled: true,
              voice_cloning_consent_date: new Date().toISOString(),
              voice_model_id: voiceClone.voice_id,
              voice_model_created_at: new Date().toISOString(),
            })
            .eq("id", profile.id);

          if (updateError) {
            console.error("Error updating profile:", updateError);
          }

          return new Response(
            JSON.stringify({
              success: true,
              voice_model_id: voiceClone.voice_id,
              status: voiceClone.status,
            }),
            {
              headers: { ...corsHeaders, "content-type": "application/json" },
              status: 200,
            }
          );
        } catch (error) {
          console.error("Error creating voice clone:", error);
          return new Response(
            JSON.stringify({
              error: "Failed to create voice clone",
              message:
                error instanceof Error ? error.message : "Unknown error",
            }),
            {
              status: 500,
              headers: { ...corsHeaders, "content-type": "application/json" },
            }
          );
        }
      }

      // Action: generate_speech
      if (action === "generate_speech") {
        const { 
          text, 
          voiceModelId, // Can be user's own voice or a cloned voice model ID
          originalVoiceClipId, // REQUIRED if using cloned voice
          clonedVoiceModelId, // ID from cloned_voice_models table if using another creator's voice
          addWatermark = true // Add watermark for AI-generated content
        } = await req.json();

        // Determine which voice model to use
        let targetVoiceId: string | null = null;
        let isClonedFromOther = false;
        let originalCreatorId: string | null = null;

        if (clonedVoiceModelId) {
          // Using a cloned voice model from another creator
          const { data: clonedModel, error: modelError } = await supabase
            .from("cloned_voice_models")
            .select("voice_model_id, original_creator_id, source_clip_id, is_active")
            .eq("id", clonedVoiceModelId)
            .eq("user_id", profile.id)
            .single();

          if (modelError || !clonedModel || !clonedModel.is_active) {
            return new Response(
              JSON.stringify({
                error: "Invalid or inactive cloned voice model",
              }),
              {
                status: 400,
                headers: { ...corsHeaders, "content-type": "application/json" },
              }
            );
          }

          targetVoiceId = clonedModel.voice_model_id;
          isClonedFromOther = true;
          originalCreatorId = clonedModel.original_creator_id;
          
          // Enforce attribution - original_voice_clip_id is required
          if (!originalVoiceClipId) {
            return new Response(
              JSON.stringify({
                error: "original_voice_clip_id is required when using cloned voice",
              }),
              {
                status: 400,
                headers: { ...corsHeaders, "content-type": "application/json" },
              }
            );
          }
        } else if (voiceModelId) {
          // Using a specific voice model ID
          targetVoiceId = voiceModelId;
        } else if (profile.voice_model_id) {
          // Using user's own voice model
          targetVoiceId = profile.voice_model_id;
        } else {
          return new Response(
            JSON.stringify({
              error: "No voice model available. Please create a voice model first.",
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "content-type": "application/json" },
            }
          );
        }

        if (!text || !targetVoiceId) {
          return new Response(
            JSON.stringify({
              error: "Text and voice model ID are required",
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "content-type": "application/json" },
            }
          );
        }

        try {
          const audioBlob = await generateSpeech(targetVoiceId, text);

          if (!audioBlob) {
            return new Response(
              JSON.stringify({ error: "Failed to generate speech" }),
              {
                status: 500,
                headers: {
                  ...corsHeaders,
                  "content-type": "application/json",
                },
              }
            );
          }

          // Add watermark if requested (for AI detection)
          let watermarkedBlob = audioBlob;
          let watermarkData = null;
          if (addWatermark) {
            // In a real implementation, you would add an inaudible watermark here
            // For now, we'll just mark it in metadata
            watermarkData = {
              algorithm: "echo_garden_v1",
              timestamp: new Date().toISOString(),
              voice_model_id: targetVoiceId,
              is_ai_generated: true,
            };
          }

          // Upload generated audio to Supabase storage
          const fileName = `voice-clones/${profile.id}/${Date.now()}.mp3`;
          const { error: uploadError } = await supabase.storage
            .from("audio")
            .upload(fileName, watermarkedBlob, {
              contentType: "audio/mpeg",
              upsert: false,
            });

          if (uploadError) {
            throw uploadError;
          }

          // If clipId is provided, update the clip with attribution and watermark
          if (clipId) {
            const updateData: any = {
              uses_cloned_voice: true,
              audio_path: fileName,
              has_watermark: addWatermark,
            };

            // Enforce attribution
            if (originalVoiceClipId) {
              updateData.original_voice_clip_id = originalVoiceClipId;
            } else if (isClonedFromOther) {
              // If using cloned voice but no original_voice_clip_id provided, use source_clip_id
              const { data: clonedModel } = await supabase
                .from("cloned_voice_models")
                .select("source_clip_id")
                .eq("id", clonedVoiceModelId)
                .single();
              
              if (clonedModel) {
                updateData.original_voice_clip_id = clonedModel.source_clip_id;
              }
            }

            if (clonedVoiceModelId) {
              updateData.cloned_voice_model_id = clonedVoiceModelId;
            }

            if (watermarkData) {
              updateData.watermark_data = watermarkData;
            }

            const { error: clipError } = await supabase
              .from("clips")
              .update(updateData)
              .eq("id", clipId);

            if (clipError) {
              console.error("Error updating clip:", clipError);
            }
          }

          // Get public URL
          const { data: urlData } = supabase.storage
            .from("audio")
            .getPublicUrl(fileName);

          return new Response(
            JSON.stringify({
              success: true,
              audio_url: urlData.publicUrl,
              audio_path: fileName,
              has_watermark: addWatermark,
              is_cloned_from_other: isClonedFromOther,
            }),
            {
              headers: { ...corsHeaders, "content-type": "application/json" },
              status: 200,
            }
          );
        } catch (error) {
          console.error("Error generating speech:", error);
          return new Response(
            JSON.stringify({
              error: "Failed to generate speech",
              message:
                error instanceof Error ? error.message : "Unknown error",
            }),
            {
              status: 500,
              headers: { ...corsHeaders, "content-type": "application/json" },
            }
          );
        }
      }

      return new Response(
        JSON.stringify({ error: "Invalid action" }),
        {
          status: 400,
          headers: { ...corsHeaders, "content-type": "application/json" },
        }
      );
    }

    // GET: Get voice cloning status
    if (req.method === "GET") {
      return new Response(
        JSON.stringify({
          voice_cloning_enabled: profile.voice_cloning_enabled || false,
          voice_model_id: profile.voice_model_id || null,
          has_voice_model: !!profile.voice_model_id,
        }),
        {
          headers: { ...corsHeaders, "content-type": "application/json" },
          status: 200,
        }
      );
    }

    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: { ...corsHeaders, "content-type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in clone-voice:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "content-type": "application/json" },
      }
    );
  }
});

