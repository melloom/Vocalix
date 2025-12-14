import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0?target=deno";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OPENAI_API_KEY) {
  throw new Error("Missing required environment variables");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-device-id",
};

/**
 * Detect language from text using OpenAI
 */
async function detectLanguage(text: string): Promise<{
  language: string | null;
  confidence: number;
}> {
  if (!text || text.trim().length < 10) {
    return { language: null, confidence: 0 };
  }

  try {
    // Use OpenAI to detect language
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a language detection expert. Detect the language of the following text and respond with ONLY a JSON object: {\"language\": \"ISO_639_1_CODE\", \"confidence\": 0.0-1.0}. Use ISO 639-1 codes (e.g., 'en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'zh', 'ja', 'ko'). If uncertain, use 'en' as default.",
          },
          {
            role: "user",
            content: `Detect the language of this text: "${text.substring(0, 500)}"`,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI language detection error:", errorText);
      return { language: "en", confidence: 0.5 }; // Default to English
    }

    const json = await response.json();
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      return { language: "en", confidence: 0.5 };
    }

    const result = JSON.parse(content);
    return {
      language: result.language || "en",
      confidence: Math.min(1, Math.max(0, result.confidence || 0.5)),
    };
  } catch (error) {
    console.error("Error detecting language:", error);
    return { language: "en", confidence: 0.5 }; // Default to English
  }
}

/**
 * Translate text to target language using OpenAI
 */
async function translateText(
  text: string,
  targetLanguage: string,
  sourceLanguage?: string
): Promise<string | null> {
  if (!text || text.trim().length === 0) {
    return null;
  }

  // Don't translate if target is same as source
  if (sourceLanguage && sourceLanguage === targetLanguage) {
    return text;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a professional translator. Translate the following text to ${targetLanguage}. Preserve the meaning, tone, and style. Return ONLY the translated text, no explanations.`,
          },
          {
            role: "user",
            content: text,
          },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI translation error:", errorText);
      return null;
    }

    const json = await response.json();
    const translated = json.choices?.[0]?.message?.content?.trim();
    return translated || null;
  } catch (error) {
    console.error("Error translating text:", error);
    return null;
  }
}

/**
 * Get list of languages to translate to (common languages)
 */
function getTargetLanguages(): string[] {
  return ["es", "fr", "de", "it", "pt", "ru", "zh", "ja", "ko", "ar", "hi"];
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        {
          status: 405,
          headers: { ...corsHeaders, "content-type": "application/json" },
        }
      );
    }

    const { text, clipId, commentId, targetLanguages } = await req.json();

    if (!text || text.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Text is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "content-type": "application/json" },
        }
      );
    }

    // Detect language
    const languageDetection = await detectLanguage(text);
    const detectedLanguage = languageDetection.language || "en";
    const confidence = languageDetection.confidence;

    // Generate translations for common languages
    const languagesToTranslate = targetLanguages || getTargetLanguages();
    const translations: Record<string, string> = {};

    // Only translate if detected language is not English or if explicitly requested
    if (detectedLanguage !== "en" || targetLanguages) {
      for (const lang of languagesToTranslate) {
        // Skip if same as detected language
        if (lang === detectedLanguage) {
          continue;
        }

        const translated = await translateText(text, lang, detectedLanguage);
        if (translated) {
          translations[lang] = translated;
        }

        // Add small delay to avoid rate limits
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    // Update clip or comment with language detection and translations
    if (clipId) {
      const { error: updateError } = await supabase
        .from("clips")
        .update({
          detected_language: detectedLanguage,
          detected_language_confidence: confidence,
          translations: translations,
        })
        .eq("id", clipId);

      if (updateError) {
        console.error("Error updating clip:", updateError);
      }
    } else if (commentId) {
      const { error: updateError } = await supabase
        .from("comments")
        .update({
          detected_language: detectedLanguage,
          detected_language_confidence: confidence,
          translations: translations,
        })
        .eq("id", commentId);

      if (updateError) {
        console.error("Error updating comment:", updateError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        detected_language: detectedLanguage,
        confidence: confidence,
        translations: translations,
      }),
      {
        headers: { ...corsHeaders, "content-type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error in detect-language-and-translate:", error);
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

