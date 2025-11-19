import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { Flame, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ReactionTimelineProps {
  clipId: string;
  clipDuration: number; // Duration in seconds
  bucketSize?: number; // Size of time buckets in seconds (default: 5)
}

interface HeatmapData {
  time_bucket: number;
  reaction_count: number;
  top_emoji: string;
}

export const ReactionTimeline = ({ 
  clipId, 
  clipDuration, 
  bucketSize = 5 
}: ReactionTimelineProps) => {
  const [heatmapData, setHeatmapData] = useState<HeatmapData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadHeatmap = async () => {
      if (!clipId || !clipDuration) return;

      setIsLoading(true);
      setError(null);

      try {
        const { data, error: heatmapError } = await supabase.rpc("get_reaction_heatmap", {
          p_clip_id: clipId,
          p_bucket_size_seconds: bucketSize,
        });

        if (heatmapError) throw heatmapError;

        setHeatmapData(data || []);
      } catch (err: any) {
        console.error("Error loading reaction heatmap:", err);
        setError(err.message || "Failed to load reaction timeline");
      } finally {
        setIsLoading(false);
      }
    };

    loadHeatmap();
  }, [clipId, clipDuration, bucketSize]);

  // Calculate max reaction count for scaling
  const maxReactions = Math.max(...heatmapData.map((d) => d.reaction_count), 1);

  // Create buckets for the entire duration
  const totalBuckets = Math.ceil(clipDuration / bucketSize);
  const timelineBuckets = Array.from({ length: totalBuckets }, (_, i) => {
    const bucketStart = i * bucketSize;
    const bucketEnd = Math.min((i + 1) * bucketSize, clipDuration);
    const bucketData = heatmapData.find(
      (d) => Math.abs(d.time_bucket - bucketStart) < bucketSize / 2
    );

    return {
      start: bucketStart,
      end: bucketEnd,
      reactionCount: bucketData?.reaction_count || 0,
      topEmoji: bucketData?.top_emoji || null,
    };
  });

  // Find hot moments (buckets with above-average reactions)
  const avgReactions = heatmapData.length > 0
    ? heatmapData.reduce((sum, d) => sum + d.reaction_count, 0) / heatmapData.length
    : 0;
  const hotMoments = timelineBuckets.filter((b) => b.reactionCount > avgReactions * 1.5);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (isLoading) {
    return (
      <Card className="rounded-3xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-orange-500" />
            Reaction Timeline
          </CardTitle>
          <CardDescription>See where people react most in your clip</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="rounded-3xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-orange-500" />
            Reaction Timeline
          </CardTitle>
          <CardDescription>See where people react most in your clip</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">{error}</div>
        </CardContent>
      </Card>
    );
  }

  if (heatmapData.length === 0) {
    return (
      <Card className="rounded-3xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-orange-500" />
            Reaction Timeline
          </CardTitle>
          <CardDescription>See where people react most in your clip</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <p>No reaction data available yet.</p>
            <p className="text-sm mt-2">Reactions with timestamps will appear here.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-3xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Flame className="h-5 w-5 text-orange-500" />
          Reaction Timeline
        </CardTitle>
        <CardDescription>
          See where people react most in your clip • {formatTime(0)} - {formatTime(clipDuration)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Timeline Visualization */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span>Reaction Density</span>
            <span>{maxReactions} reactions max</span>
          </div>
          <div className="relative">
            {/* Timeline bar */}
            <div className="flex gap-0.5 h-12 rounded-lg overflow-hidden border border-border">
              {timelineBuckets.map((bucket, index) => {
                const heightPercent = maxReactions > 0
                  ? (bucket.reactionCount / maxReactions) * 100
                  : 0;
                const isHot = bucket.reactionCount > avgReactions * 1.5;
                
                return (
                  <div
                    key={index}
                    className="flex-1 flex flex-col justify-end group cursor-pointer relative"
                    style={{
                      minWidth: `${100 / totalBuckets}%`,
                    }}
                    title={`${formatTime(bucket.start)} - ${formatTime(bucket.end)}: ${bucket.reactionCount} reactions`}
                  >
                    <div
                      className={`w-full transition-all ${
                        isHot
                          ? "bg-gradient-to-t from-orange-500 to-orange-400"
                          : bucket.reactionCount > 0
                          ? "bg-gradient-to-t from-primary/60 to-primary/40"
                          : "bg-muted"
                      }`}
                      style={{
                        height: `${Math.max(heightPercent, 5)}%`,
                        minHeight: bucket.reactionCount > 0 ? "4px" : "2px",
                      }}
                    />
                    {isHot && (
                      <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Badge variant="destructive" className="text-xs">
                          <Flame className="h-3 w-3 mr-1" />
                          Hot
                        </Badge>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            
            {/* Time markers */}
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>{formatTime(0)}</span>
              <span>{formatTime(clipDuration / 2)}</span>
              <span>{formatTime(clipDuration)}</span>
            </div>
          </div>
        </div>

        {/* Hot Moments Summary */}
        {hotMoments.length > 0 && (
          <div className="pt-4 border-t border-border">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-4 w-4 text-orange-500" />
              <h4 className="font-semibold text-sm">Hot Moments</h4>
              <Badge variant="secondary" className="text-xs">
                {hotMoments.length} {hotMoments.length === 1 ? "moment" : "moments"}
              </Badge>
            </div>
            <div className="space-y-2">
              {hotMoments
                .sort((a, b) => b.reactionCount - a.reactionCount)
                .slice(0, 5)
                .map((moment, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                  >
                    <div className="flex items-center gap-2">
                      <Flame className="h-3 w-3 text-orange-500" />
                      <span className="text-sm font-medium">
                        {formatTime(moment.start)} - {formatTime(moment.end)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {moment.topEmoji && (
                        <span className="text-lg">{moment.topEmoji}</span>
                      )}
                      <span className="text-sm text-muted-foreground">
                        {moment.reactionCount} {moment.reactionCount === 1 ? "reaction" : "reactions"}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Summary Stats */}
        <div className="pt-4 border-t border-border">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Total Reactions</div>
              <div className="text-lg font-semibold">
                {heatmapData.reduce((sum, d) => sum + d.reaction_count, 0)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Active Segments</div>
              <div className="text-lg font-semibold">
                {heatmapData.length} / {totalBuckets}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

