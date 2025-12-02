import { useEffect, useState } from "react";
import { Trophy, TrendingUp, Users, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipCard } from "@/components/ClipCard";

interface LeaderboardEntry {
  remix_clip_id: string;
  creator_id: string;
  creator_handle: string;
  creator_avatar: string;
  remix_of_clip_id: string;
  listens_count: number;
  reactions_count: number;
  remix_count: number;
  remix_analytics_listens: number;
  collaboration_count: number;
  engagement_score: number;
  created_at: string;
}

interface RemixLeaderboardProps {
  period?: "all" | "week" | "month";
  limit?: number;
}

export function RemixLeaderboard({ period = "all", limit = 20 }: RemixLeaderboardProps) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<"all" | "week" | "month">(period);

  useEffect(() => {
    loadLeaderboard();
  }, [selectedPeriod]);

  const loadLeaderboard = async () => {
    try {
      setIsLoading(true);
      
      let query = supabase
        .from("remix_leaderboard")
        .select("*")
        .order("engagement_score", { ascending: false })
        .limit(limit);

      // Apply time filter
      if (selectedPeriod === "week") {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        query = query.gte("created_at", weekAgo.toISOString());
      } else if (selectedPeriod === "month") {
        const monthAgo = new Date();
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        query = query.gte("created_at", monthAgo.toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;
      setEntries((data as LeaderboardEntry[]) || []);
    } catch (error) {
      console.error("Error loading remix leaderboard:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getRankIcon = (index: number) => {
    if (index === 0) return "🥇";
    if (index === 1) return "🥈";
    if (index === 2) return "🥉";
    return `#${index + 1}`;
  };

  const getRankColor = (index: number) => {
    if (index === 0) return "text-yellow-500";
    if (index === 1) return "text-gray-400";
    if (index === 2) return "text-amber-600";
    return "text-muted-foreground";
  };

  if (isLoading) {
    return (
      <Card className="rounded-3xl">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-3xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            Remix Leaderboard
          </CardTitle>
          <Tabs value={selectedPeriod} onValueChange={(v) => setSelectedPeriod(v as any)}>
            <TabsList>
              <TabsTrigger value="all">All Time</TabsTrigger>
              <TabsTrigger value="week">This Week</TabsTrigger>
              <TabsTrigger value="month">This Month</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <div className="text-center py-8">
            <Sparkles className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">No remixes yet. Be the first!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry, index) => (
              <Card key={entry.remix_clip_id} className="rounded-xl">
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    {/* Rank */}
                    <div className={`flex-shrink-0 text-2xl font-bold ${getRankColor(index)}`}>
                      {getRankIcon(index)}
                    </div>

                    {/* Clip Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="secondary" className="rounded-full">
                          <Sparkles className="h-3 w-3 mr-1" />
                          Remix
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          by @{entry.creator_handle}
                        </span>
                      </div>
                      
                      {/* Engagement Score */}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground mb-2">
                        <div className="flex items-center gap-1">
                          <TrendingUp className="h-3 w-3" />
                          <span className="font-medium">{entry.engagement_score.toFixed(1)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          <span>{entry.listens_count} listens</span>
                        </div>
                        <div>
                          <span>{entry.reactions_count} reactions</span>
                        </div>
                      </div>

                      {/* Clip Card Preview */}
                      <div className="mt-2">
                        <ClipCard
                          clip={{
                            id: entry.remix_clip_id,
                            audio_path: "",
                            mood_emoji: "🎵",
                            duration_seconds: 0,
                            captions: null,
                            summary: null,
                            status: "live",
                            reactions: {},
                            created_at: entry.created_at,
                            listens_count: entry.listens_count,
                            topic_id: null,
                            profiles: {
                              handle: entry.creator_handle,
                              emoji_avatar: entry.creator_avatar,
                            },
                          }}
                          showTopic={false}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

