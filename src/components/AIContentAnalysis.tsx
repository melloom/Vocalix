import { useState, useEffect } from "react";
import { Sparkles, TrendingUp, Heart, Star, AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useAIContentCreation } from "@/hooks/useAIContentCreation";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface AIContentAnalysisProps {
  clipId: string;
  clipTranscript?: string;
  clipSummary?: string;
  clipTitle?: string;
  clipTags?: string[];
  durationSeconds?: number;
  profileId?: string;
  onRefresh?: () => void;
  className?: string;
}

export function AIContentAnalysis({
  clipId,
  clipTranscript,
  clipSummary,
  clipTitle,
  clipTags,
  durationSeconds,
  profileId,
  onRefresh,
  className,
}: AIContentAnalysisProps) {
  const { analyzeContent, getClipAnalysis, isLoading, error } = useAIContentCreation();
  const { toast } = useToast();

  const [analysis, setAnalysis] = useState<{
    sentiment: { score: number; label: string };
    engagement_prediction: number;
    quality: { score: number; suggestions: string[] };
  } | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const loadAnalysis = async () => {
    // First try to get existing analysis
    const existing = await getClipAnalysis(clipId);
    if (existing) {
      setAnalysis({
        sentiment: {
          score: existing.sentiment_score || 0,
          label: existing.sentiment_label || "neutral",
        },
        engagement_prediction: existing.engagement_prediction || 0,
        quality: {
          score: existing.quality_score || 0,
          suggestions: existing.improvement_suggestions || [],
        },
      });
      return;
    }

    // If no existing analysis and we have content, analyze it
    if (clipTranscript || clipSummary) {
      setIsAnalyzing(true);
      try {
        const result = await analyzeContent(clipId, {
          transcript: clipTranscript,
          summary: clipSummary,
          title: clipTitle,
          tags: clipTags,
          duration_seconds: durationSeconds,
          profile_id: profileId,
        });

        if (result) {
          setAnalysis(result);
        }
      } catch (err) {
        console.error("Error analyzing content:", err);
      } finally {
        setIsAnalyzing(false);
      }
    }
  };

  useEffect(() => {
    if (clipId) {
      loadAnalysis();
    }
  }, [clipId]);

  const getSentimentColor = (label: string) => {
    switch (label.toLowerCase()) {
      case "positive":
        return "text-green-600";
      case "negative":
        return "text-red-600";
      case "mixed":
        return "text-yellow-600";
      default:
        return "text-gray-600";
    }
  };

  const getSentimentIcon = (label: string) => {
    switch (label.toLowerCase()) {
      case "positive":
        return "😊";
      case "negative":
        return "😔";
      case "mixed":
        return "😐";
      default:
        return "😐";
    }
  };

  const getQualityColor = (score: number) => {
    if (score >= 0.8) return "text-green-600";
    if (score >= 0.6) return "text-yellow-600";
    return "text-red-600";
  };

  if (!clipTranscript && !clipSummary) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            AI Content Analysis
          </CardTitle>
          <CardDescription>
            Record or upload a clip to get AI analysis
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <CardTitle>AI Content Analysis</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={loadAnalysis}
            disabled={isAnalyzing || isLoading}
          >
            {isAnalyzing || isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
          </Button>
        </div>
        <CardDescription>
          Get AI-powered insights on sentiment, engagement potential, and quality
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {isAnalyzing ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Analyzing content...</span>
          </div>
        ) : analysis ? (
          <div className="space-y-6">
            {/* Sentiment Analysis */}
            <div className="p-4 rounded-lg border bg-card">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Heart className="w-5 h-5 text-muted-foreground" />
                  <h3 className="font-semibold">Sentiment Analysis</h3>
                </div>
                <Badge variant="outline" className={getSentimentColor(analysis.sentiment.label)}>
                  <span className="mr-1">{getSentimentIcon(analysis.sentiment.label)}</span>
                  {analysis.sentiment.label}
                </Badge>
              </div>
              <Progress
                value={(analysis.sentiment.score + 1) * 50}
                className="h-2"
              />
              <p className="text-xs text-muted-foreground mt-2">
                Score: {analysis.sentiment.score.toFixed(2)} (range: -1 to 1)
              </p>
            </div>

            {/* Engagement Prediction */}
            <div className="p-4 rounded-lg border bg-card">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-muted-foreground" />
                  <h3 className="font-semibold">Engagement Prediction</h3>
                </div>
                <Badge variant="default">
                  {Math.round(analysis.engagement_prediction)} predicted listens
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Based on content quality, title, tags, and your historical performance
              </p>
            </div>

            {/* Quality Score */}
            <div className="p-4 rounded-lg border bg-card">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Star className="w-5 h-5 text-muted-foreground" />
                  <h3 className="font-semibold">Quality Score</h3>
                </div>
                <Badge variant="outline" className={getQualityColor(analysis.quality.score)}>
                  {Math.round(analysis.quality.score * 100)}%
                </Badge>
              </div>
              <Progress value={analysis.quality.score * 100} className="h-2 mb-3" />
              {analysis.quality.suggestions.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium mb-2">Improvement Suggestions:</h4>
                  <ScrollArea className="h-[150px]">
                    <ul className="space-y-2">
                      {analysis.quality.suggestions.map((suggestion, index) => (
                        <li key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                          <span className="text-primary mt-1">•</span>
                          <span>{suggestion}</span>
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No analysis available. Click refresh to analyze your content.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

