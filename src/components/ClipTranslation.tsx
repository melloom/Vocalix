import { useState, useEffect } from "react";
import { Languages, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { detectAndTranslate, getLanguageName, getUserLanguage, getSupportedLanguages } from "@/utils/translation";
import { supabase } from "@/integrations/supabase/client";

interface ClipTranslationProps {
  clipId: string;
  transcription: string | null;
  caption?: string | null;
}

export function ClipTranslation({ clipId, transcription, caption }: ClipTranslationProps) {
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [targetLanguage, setTargetLanguage] = useState<string>(getUserLanguage());
  const [sourceLanguage, setSourceLanguage] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const { toast } = useToast();

  const textToTranslate = transcription || caption || "";
  const supportedLanguages = getSupportedLanguages();

  // Load clip data to get detected language and existing translations
  useEffect(() => {
    if (!clipId) return;

    const loadClipData = async () => {
      try {
        const { data, error } = await supabase
          .from("clips")
          .select("detected_language, translations")
          .eq("id", clipId)
          .single();

        if (!error && data) {
          // Set detected source language if available
          if (data.detected_language) {
            setSourceLanguage(data.detected_language);
          } else if (textToTranslate) {
            // Fallback: detect language from text
            const { detectLanguage } = await import("@/utils/translation");
            detectLanguage(textToTranslate).then((detection) => {
              setSourceLanguage(detection.language);
            });
          }

          // Load existing translation for target language if available
          if (data.translations && typeof data.translations === "object") {
            const existingTranslation = data.translations[targetLanguage];
            if (existingTranslation) {
              setTranslatedText(existingTranslation);
              setShowTranslation(true);
            }
          }
        }
      } catch (error) {
        console.log("Error loading clip data:", error);
        // Fallback: try to detect language from text
        if (textToTranslate) {
          const { detectLanguage } = await import("@/utils/translation");
          detectLanguage(textToTranslate).then((detection) => {
            setSourceLanguage(detection.language);
          });
        }
      }
    };

    loadClipData();
  }, [clipId, targetLanguage, textToTranslate]);

  const handleTranslate = async () => {
    if (!textToTranslate) {
      toast({
        title: "No text to translate",
        description: "This clip doesn't have a transcription or caption.",
        variant: "destructive",
      });
      return;
    }

    if (sourceLanguage === targetLanguage) {
      toast({
        title: "Same language",
        description: "The text is already in the selected language.",
      });
      return;
    }

    setIsTranslating(true);
    try {
      // Use backend function to detect and translate
      const result = await detectAndTranslate(textToTranslate, targetLanguage, clipId);

      if (result.translation && result.translation !== textToTranslate) {
        setTranslatedText(result.translation);
        setSourceLanguage(result.detectedLanguage);
        setShowTranslation(true);

        // The backend function already saves translations to the clips table
        // But we can also update the clip's translations JSONB field to ensure consistency
        try {
          // Load current translations
          const { data: clipData } = await supabase
            .from("clips")
            .select("translations")
            .eq("id", clipId)
            .single();

          const currentTranslations = (clipData?.translations as Record<string, string>) || {};
          const updatedTranslations = {
            ...currentTranslations,
            [targetLanguage]: result.translation,
          };

          // Update clip with new translation
          await supabase
            .from("clips")
            .update({
              translations: updatedTranslations,
              detected_language: result.detectedLanguage,
              detected_language_confidence: result.confidence,
            })
            .eq("id", clipId);
        } catch (error) {
          // Non-critical error - backend function should have saved it
          console.log("Could not update clip translations:", error);
        }

        toast({
          title: "Translation complete",
          description: `Translated to ${getLanguageName(targetLanguage)}`,
        });
      } else {
        throw new Error("Translation returned same text");
      }
    } catch (error) {
      console.error("Translation error:", error);
      toast({
        title: "Translation failed",
        description: error instanceof Error ? error.message : "Could not translate text. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsTranslating(false);
    }
  };

  if (!textToTranslate) {
    return null;
  }

  return (
    <Card className="rounded-xl">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Languages className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Translation</span>
            {sourceLanguage && (
              <span className="text-xs text-muted-foreground">
                ({getLanguageName(sourceLanguage)})
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowTranslation(!showTranslation)}
            className="h-7 text-xs"
          >
            {showTranslation ? "Hide" : "Show"}
          </Button>
        </div>

        {!showTranslation ? (
          <div className="space-y-2">
            <Select value={targetLanguage} onValueChange={setTargetLanguage}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent>
                {supportedLanguages.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    {lang.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={handleTranslate}
              disabled={isTranslating || !targetLanguage || sourceLanguage === targetLanguage}
              className="w-full h-9 text-sm"
              variant="outline"
            >
              {isTranslating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Translating...
                </>
              ) : (
                <>
                  <Languages className="h-4 w-4 mr-2" />
                  Translate to {getLanguageName(targetLanguage)}
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">
              <p className="font-medium mb-1">Original ({getLanguageName(sourceLanguage || "en")}):</p>
              <p className="text-xs bg-muted/50 p-2 rounded">{textToTranslate}</p>
            </div>
            {translatedText && (
              <div className="text-sm">
                <p className="font-medium mb-1">Translated ({getLanguageName(targetLanguage)}):</p>
                <p className="text-xs bg-primary/10 p-2 rounded">{translatedText}</p>
              </div>
            )}
            <Button
              onClick={() => setShowTranslation(false)}
              variant="ghost"
              size="sm"
              className="w-full h-8 text-xs"
            >
              Change Language
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

