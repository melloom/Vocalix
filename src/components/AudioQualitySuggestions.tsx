/**
 * Audio quality suggestions component
 * Displays quality analysis and suggestions before publishing
 */

import { AlertCircle, CheckCircle2, Sparkles, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { AudioQualityMetrics } from "@/utils/audioQuality";

interface AudioQualitySuggestionsProps {
  qualityMetrics: AudioQualityMetrics | null;
  onEnhance?: () => void;
  isEnhancing?: boolean;
  className?: string;
}

export const AudioQualitySuggestions = ({
  qualityMetrics,
  onEnhance,
  isEnhancing = false,
  className,
}: AudioQualitySuggestionsProps) => {
  if (!qualityMetrics) {
    return null;
  }

  const { qualityScore, suggestions, peakLevel, rmsLevel, hasExcessiveNoise, backgroundNoiseLevel } =
    qualityMetrics;

  const getQualityColor = (score: number): string => {
    if (score >= 80) return "text-green-600 dark:text-green-400";
    if (score >= 60) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  const getQualityLabel = (score: number): string => {
    if (score >= 80) return "Excellent";
    if (score >= 60) return "Good";
    if (score >= 40) return "Fair";
    return "Needs Improvement";
  };

  const getQualityBadgeVariant = (score: number): "default" | "secondary" | "destructive" | "outline" => {
    if (score >= 80) return "default";
    if (score >= 60) return "secondary";
    return "destructive";
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Quality Score */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            <span className="text-sm font-medium">Audio Quality</span>
          </div>
          <Badge variant={getQualityBadgeVariant(qualityScore)} className={getQualityColor(qualityScore)}>
            {getQualityLabel(qualityScore)} ({qualityScore}/100)
          </Badge>
        </div>
        <Progress value={qualityScore} className="h-2" />
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-4 text-xs">
        <div>
          <div className="text-muted-foreground">Peak Level</div>
          <div className={cn("font-medium", peakLevel < 0.3 ? "text-yellow-600" : peakLevel > 0.95 ? "text-red-600" : "text-green-600")}>
            {Math.round(peakLevel * 100)}%
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">Avg Level</div>
          <div className={cn("font-medium", rmsLevel < 0.1 ? "text-yellow-600" : "text-green-600")}>
            {Math.round(rmsLevel * 100)}%
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">Background Noise</div>
          <div className={cn("font-medium", hasExcessiveNoise ? "text-red-600" : backgroundNoiseLevel > 0.01 ? "text-yellow-600" : "text-green-600")}>
            {hasExcessiveNoise ? "High" : backgroundNoiseLevel > 0.01 ? "Some" : "Low"}
          </div>
        </div>
      </div>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <Alert variant={qualityScore >= 60 ? "default" : "destructive"}>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Suggestions</AlertTitle>
          <AlertDescription>
            <ul className="list-disc list-inside space-y-1 mt-2">
              {suggestions.map((suggestion, index) => (
                <li key={index} className="text-sm">
                  {suggestion}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Success message if quality is good */}
      {qualityScore >= 80 && suggestions.length === 0 && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Excellent Quality!</AlertTitle>
          <AlertDescription>
            Your audio quality is excellent. Ready to publish!
          </AlertDescription>
        </Alert>
      )}

      {/* Enhance button */}
      {qualityScore < 80 && onEnhance && (
        <Button
          onClick={onEnhance}
          disabled={isEnhancing}
          variant="outline"
          className="w-full"
        >
          {isEnhancing ? (
            <>
              <Sparkles className="h-4 w-4 mr-2 animate-spin" />
              Enhancing...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Auto-Enhance Audio
            </>
          )}
        </Button>
      )}
    </div>
  );
};

