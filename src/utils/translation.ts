/**
 * Multi-language translation utilities
 * Provides language detection and translation functionality
 */

import { supabase } from "@/integrations/supabase/client";

export interface LanguageDetection {
  language: string;
  confidence: number;
}

export interface Translation {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
}

export interface DetectAndTranslateResponse {
  success: boolean;
  detected_language: string;
  confidence: number;
  translations: Record<string, string>;
  error?: string;
  message?: string;
}

/**
 * Detect language from text using backend Supabase function (OpenAI-powered)
 * Falls back to simple pattern matching if backend is unavailable
 */
export async function detectLanguage(text: string): Promise<LanguageDetection> {
  // Try backend function first
  try {
    const { data, error } = await supabase.functions.invoke<DetectAndTranslateResponse>(
      "detect-language-and-translate",
      {
        body: {
          text,
          targetLanguages: [], // Don't translate, just detect
        },
      }
    );

    if (!error && data?.success && data.detected_language) {
      return {
        language: data.detected_language,
        confidence: data.confidence || 0.8,
      };
    }
  } catch (error) {
    // Fall back to client-side detection
    console.log("Backend language detection unavailable, using fallback");
  }

  // Fallback: Simple pattern-based detection
  const patterns: Record<string, RegExp> = {
    en: /^[a-zA-Z\s.,!?'"-]+$/,
    es: /[áéíóúñüÁÉÍÓÚÑÜ]/,
    fr: /[àâäéèêëïîôùûüÿçÀÂÄÉÈÊËÏÎÔÙÛÜŸÇ]/,
    de: /[äöüßÄÖÜ]/,
    it: /[àèéìíîòóùúÀÈÉÌÍÎÒÓÙÚ]/,
    pt: /[áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ]/,
    ru: /[а-яА-ЯёЁ]/,
    zh: /[\u4e00-\u9fff]/,
    ja: /[\u3040-\u309f\u30a0-\u30ff]/,
    ko: /[\uac00-\ud7a3]/,
    ar: /[\u0600-\u06ff]/,
  };

  // Check patterns
  for (const [lang, pattern] of Object.entries(patterns)) {
    if (pattern.test(text)) {
      return { language: lang, confidence: 0.7 };
    }
  }

  // Default to English
  return { language: "en", confidence: 0.5 };
}

/**
 * Translate text using FREE translation APIs
 * Uses LibreTranslate (free, open-source) and MyMemory (free tier) as fallbacks
 */
export async function translateText(
  text: string,
  targetLanguage: string,
  sourceLanguage?: string
): Promise<string> {
  // If already in target language, return as-is
  if (sourceLanguage === targetLanguage) {
    return text;
  }

  // Map language codes to API format
  const langMap: Record<string, string> = {
    en: "en",
    es: "es",
    fr: "fr",
    de: "de",
    it: "it",
    pt: "pt",
    ru: "ru",
    zh: "zh",
    ja: "ja",
    ko: "ko",
    ar: "ar",
    hi: "hi",
    nl: "nl",
    pl: "pl",
    tr: "tr",
    vi: "vi",
  };

  const sourceLang = sourceLanguage ? langMap[sourceLanguage] || sourceLanguage : "auto";
  const targetLang = langMap[targetLanguage] || targetLanguage;

  // Try LibreTranslate first (completely free, open-source, no API key needed)
  try {
    const libreResponse = await fetch("https://libretranslate.com/translate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: text.substring(0, 5000), // Limit to 5000 chars
        source: sourceLang === "auto" ? "auto" : sourceLang,
        target: targetLang,
        format: "text",
      }),
    });

    if (libreResponse.ok) {
      const data = await libreResponse.json();
      if (data.translatedText) {
        return data.translatedText;
      }
    }
  } catch (error) {
    console.log("LibreTranslate failed, trying MyMemory:", error);
  }

  // Fallback to MyMemory Translation API (free tier: 10,000 words/day, no API key needed)
  try {
    const myMemoryUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
      text.substring(0, 500)
    )}&langpair=${sourceLang === "auto" ? "" : sourceLang + "|"}${targetLang}`;
    
    const myMemoryResponse = await fetch(myMemoryUrl);
    
    if (myMemoryResponse.ok) {
      const data = await myMemoryResponse.json();
      if (data.responseData && data.responseData.translatedText) {
        return data.responseData.translatedText;
      }
    }
  } catch (error) {
    console.error("MyMemory translation failed:", error);
  }

  // Try backend function as last resort (if available and free)
  try {
    const { data, error } = await supabase.functions.invoke<DetectAndTranslateResponse>(
      "detect-language-and-translate",
      {
        body: {
          text,
          targetLanguages: [targetLanguage],
        },
      }
    );

    if (!error && data?.success && data.translations?.[targetLanguage]) {
      return data.translations[targetLanguage];
    }
  } catch (error) {
    console.log("Backend translation unavailable");
  }

  // If all else fails, return original text
  console.warn("All translation APIs failed. Returning original text.");
  return text;
}

/**
 * Detect language and translate text in one call using FREE APIs
 * Uses free translation services (LibreTranslate, MyMemory)
 * Returns both detection and translation results
 */
export async function detectAndTranslate(
  text: string,
  targetLanguage: string,
  clipId?: string,
  commentId?: string
): Promise<{
  detectedLanguage: string;
  confidence: number;
  translation: string | null;
  allTranslations?: Record<string, string>;
}> {
  // First detect the language (free pattern-based detection)
  const detection = await detectLanguage(text);
  
  // If already in target language, return as-is
  if (detection.language === targetLanguage) {
    return {
      detectedLanguage: detection.language,
      confidence: detection.confidence,
      translation: text,
    };
  }

  // Translate using free APIs
  const translation = await translateText(text, targetLanguage, detection.language);

  // Try to save to database if clipId provided (optional)
  if (clipId && translation !== text) {
    try {
      // Update clip with translation in translations JSONB field
      const { data: clipData } = await supabase
        .from("clips")
        .select("translations, detected_language")
        .eq("id", clipId)
        .single();

      const currentTranslations = (clipData?.translations as Record<string, string>) || {};
      const updatedTranslations = {
        ...currentTranslations,
        [targetLanguage]: translation,
      };

      await supabase
        .from("clips")
        .update({
          translations: updatedTranslations,
          detected_language: detection.language,
          detected_language_confidence: detection.confidence,
        })
        .eq("id", clipId);
    } catch (error) {
      // Non-critical - just log
      console.log("Could not save translation to database:", error);
    }
  }

  return {
    detectedLanguage: detection.language,
    confidence: detection.confidence,
    translation: translation !== text ? translation : null,
  };
}

/**
 * Get language name from code
 */
export function getLanguageName(code: string): string {
  const names: Record<string, string> = {
    en: "English",
    es: "Spanish",
    fr: "French",
    de: "German",
    it: "Italian",
    pt: "Portuguese",
    ru: "Russian",
    zh: "Chinese",
    ja: "Japanese",
    ko: "Korean",
    ar: "Arabic",
    hi: "Hindi",
    nl: "Dutch",
    pl: "Polish",
    tr: "Turkish",
    vi: "Vietnamese",
  };
  return names[code] || code.toUpperCase();
}

/**
 * Get supported languages
 */
export function getSupportedLanguages(): Array<{ code: string; name: string }> {
  return [
    { code: "en", name: "English" },
    { code: "es", name: "Spanish" },
    { code: "fr", name: "French" },
    { code: "de", name: "German" },
    { code: "it", name: "Italian" },
    { code: "pt", name: "Portuguese" },
    { code: "ru", name: "Russian" },
    { code: "zh", name: "Chinese" },
    { code: "ja", name: "Japanese" },
    { code: "ko", name: "Korean" },
    { code: "ar", name: "Arabic" },
    { code: "hi", name: "Hindi" },
    { code: "nl", name: "Dutch" },
    { code: "pl", name: "Polish" },
    { code: "tr", name: "Turkish" },
    { code: "vi", name: "Vietnamese" },
  ];
}

/**
 * Get user's preferred language from browser
 */
export function getUserLanguage(): string {
  if (typeof window === "undefined") return "en";
  
  const browserLang = navigator.language || (navigator as any).userLanguage;
  const langCode = browserLang.split("-")[0].toLowerCase();
  
  const supported = getSupportedLanguages().map((l) => l.code);
  return supported.includes(langCode) ? langCode : "en";
}

