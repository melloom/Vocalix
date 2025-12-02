import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type SuggestionType = "topic" | "script" | "content_idea" | "title" | "hashtag" | "posting_time";

interface AISuggestionContext {
  interests?: string[];
  recent_clips?: any[];
  trending_topics?: string[];
  clip_transcript?: string;
  clip_summary?: string;
  target_audience?: string;
}

interface ContentAnalysisResult {
  sentiment: {
    score: number;
    label: string;
  };
  engagement_prediction: number;
  quality: {
    score: number;
    suggestions: string[];
  };
}

export function useAIContentCreation() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Get AI content suggestions
   */
  const getSuggestions = async (
    profileId: string,
    suggestionType: SuggestionType,
    context?: AISuggestionContext,
    count: number = 5
  ): Promise<string[]> => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: functionError } = await supabase.functions.invoke("ai-content-suggestions", {
        body: {
          profile_id: profileId,
          suggestion_type: suggestionType,
          context: context || {},
          count,
        },
      });

      if (functionError) {
        throw new Error(functionError.message || "Failed to get suggestions");
      }

      return data?.suggestions || [];
    } catch (err: any) {
      const errorMessage = err.message || "Failed to get AI suggestions";
      setError(errorMessage);
      console.error("Error getting AI suggestions:", err);
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Analyze content (sentiment, engagement, quality)
   */
  const analyzeContent = async (
    clipId: string,
    options: {
      transcript?: string;
      summary?: string;
      title?: string;
      tags?: string[];
      duration_seconds?: number;
      profile_id?: string;
    }
  ): Promise<ContentAnalysisResult | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: functionError } = await supabase.functions.invoke("ai-content-analysis", {
        body: {
          clip_id: clipId,
          ...options,
        },
      });

      if (functionError) {
        throw new Error(functionError.message || "Failed to analyze content");
      }

      return data as ContentAnalysisResult;
    } catch (err: any) {
      const errorMessage = err.message || "Failed to analyze content";
      setError(errorMessage);
      console.error("Error analyzing content:", err);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Mark a suggestion as used
   */
  const markSuggestionUsed = async (suggestionId: string, clipId?: string) => {
    try {
      const { error } = await supabase.rpc("mark_suggestion_used", {
        p_suggestion_id: suggestionId,
        p_clip_id: clipId || null,
      });

      if (error) {
        console.error("Error marking suggestion as used:", error);
      }
    } catch (err) {
      console.error("Error marking suggestion as used:", err);
    }
  };

  /**
   * Get saved suggestions from database
   */
  const getSavedSuggestions = async (
    profileId: string,
    suggestionType?: SuggestionType,
    limit: number = 10
  ) => {
    try {
      const { data, error } = await supabase.rpc("get_ai_content_suggestions", {
        p_profile_id: profileId,
        p_suggestion_type: suggestionType || null,
        p_limit: limit,
      });

      if (error) {
        throw error;
      }

      return data || [];
    } catch (err: any) {
      console.error("Error getting saved suggestions:", err);
      return [];
    }
  };

  /**
   * Get content analysis for a clip
   */
  const getClipAnalysis = async (clipId: string) => {
    try {
      const { data, error } = await supabase.rpc("get_clip_ai_analysis", {
        p_clip_id: clipId,
      });

      if (error) {
        throw error;
      }

      return data?.[0] || null;
    } catch (err: any) {
      console.error("Error getting clip analysis:", err);
      return null;
    }
  };

  /**
   * Get trending topics
   */
  const getTrendingTopics = async (limit: number = 10) => {
    try {
      const { data, error } = await supabase.rpc("get_ai_trending_topics", {
        p_limit: limit,
      });

      if (error) {
        throw error;
      }

      return data || [];
    } catch (err: any) {
      console.error("Error getting trending topics:", err);
      return [];
    }
  };

  return {
    getSuggestions,
    analyzeContent,
    markSuggestionUsed,
    getSavedSuggestions,
    getClipAnalysis,
    getTrendingTopics,
    isLoading,
    error,
  };
}

