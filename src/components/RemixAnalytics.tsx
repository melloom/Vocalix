import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, TrendingUp, Users } from "lucide-react";

interface RemixAnalytics {
  remix_clip_id: string;
  original_clip_id: string;
  remix_listens: number;
  original_listens_from_remix: number;
}

interface RemixAnalyticsProps {
  remixClipId: string;
  originalClipId: string;
}

export function RemixAnalytics({ remixClipId, originalClipId }: RemixAnalyticsProps) {
  const [analytics, setAnalytics] = useState<RemixAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, [remixClipId, originalClipId]);

  const loadAnalytics = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("remix_analytics")
        .select("*")
        .eq("remix_clip_id", remixClipId)
        .eq("original_clip_id", originalClipId)
        .single();

      if (error && error.code !== "PGRST116") {
        throw error;
      }

      setAnalytics(data);
    } catch (error) {
      console.error("Error loading remix analytics:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="rounded-3xl">
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!analytics) {
    return null; // No analytics data yet
  }

  return (
    <Card className="rounded-3xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Remix Performance
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-muted/50">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Remix Listens</p>
            </div>
            <p className="text-2xl font-bold">{analytics.remix_listens.toLocaleString()}</p>
          </div>
          <div className="p-4 rounded-xl bg-muted/50">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Original Listens (from remix)</p>
            </div>
            <p className="text-2xl font-bold">
              {analytics.original_listens_from_remix.toLocaleString()}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

