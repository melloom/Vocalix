import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown, 
  Users, 
  Heart, 
  MessageCircle, 
  Share2, 
  Mic,
  Clock,
  Target,
  Zap
} from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { ReactionTimeline } from "@/components/ReactionTimeline";

interface Clip {
  id: string;
  listens_count: number;
  completion_rate: number | null;
  quality_score: number | null;
  trending_score: number | null;
  reactions: Record<string, number>;
  reply_count?: number;
  remix_count?: number;
  created_at: string;
  duration_seconds?: number | null;
}

interface ClipAnalyticsDialogProps {
  clip: Clip | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ListenData {
  date: string;
  listens: number;
  completion_rate: number;
}

interface TimeBasedStats {
  listens7d: number;
  listens30d: number;
  peakHour: number;
  growthRate: number;
}

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#06b6d4', '#6366f1'];

export const ClipAnalyticsDialog = ({ clip, open, onOpenChange }: ClipAnalyticsDialogProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [listenData, setListenData] = useState<ListenData[]>([]);
  const [timeStats, setTimeStats] = useState<TimeBasedStats | null>(null);
  const [voiceReactionsCount, setVoiceReactionsCount] = useState(0);
  const [sharesCount, setSharesCount] = useState(0);

  useEffect(() => {
    if (!clip || !open) return;

    const loadAnalytics = async () => {
      setIsLoading(true);
      try {
        // Load listens over time (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const { data: listens, error: listensError } = await supabase
          .from("listens")
          .select("listened_at, completion_percentage")
          .eq("clip_id", clip.id)
          .gte("listened_at", thirtyDaysAgo.toISOString())
          .order("listened_at", { ascending: true });

        if (listensError) throw listensError;

        // Group by date
        const listensByDate: Record<string, { count: number; totalCompletion: number; completionCount: number }> = {};
        
        (listens || []).forEach((listen) => {
          const date = new Date(listen.listened_at).toISOString().split('T')[0];
          if (!listensByDate[date]) {
            listensByDate[date] = { count: 0, totalCompletion: 0, completionCount: 0 };
          }
          listensByDate[date].count++;
          if (listen.completion_percentage != null) {
            listensByDate[date].totalCompletion += listen.completion_percentage;
            listensByDate[date].completionCount++;
          }
        });

        const chartData: ListenData[] = Object.entries(listensByDate).map(([date, data]) => ({
          date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          listens: data.count,
          completion_rate: data.completionCount > 0 
            ? data.totalCompletion / data.completionCount 
            : (clip.completion_rate || 0) * 100,
        }));

        setListenData(chartData);

        // Calculate time-based stats
        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        const { data: listens7d } = await supabase
          .from("listens")
          .select("listened_at")
          .eq("clip_id", clip.id)
          .gte("listened_at", sevenDaysAgo.toISOString());

        const { data: listens30d } = await supabase
          .from("listens")
          .select("listened_at")
          .eq("clip_id", clip.id)
          .gte("listened_at", thirtyDaysAgo.toISOString());

        const listens7dCount = listens7d?.length || 0;
        const listens30dCount = listens30d?.length || 0;

        // Calculate peak hour
        const hourCounts: Record<number, number> = {};
        (listens || []).forEach((listen) => {
          const hour = new Date(listen.listened_at).getHours();
          hourCounts[hour] = (hourCounts[hour] || 0) + 1;
        });
        const peakHour = Object.entries(hourCounts).reduce((a, b) => 
          hourCounts[Number(a[0])] > hourCounts[Number(b[0])] ? a : b, 
          ['0', 0]
        )[0];

        // Calculate growth rate (comparing last 7 days to previous 7 days)
        const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
        const { data: previous7d } = await supabase
          .from("listens")
          .select("listened_at")
          .eq("clip_id", clip.id)
          .gte("listened_at", fourteenDaysAgo.toISOString())
          .lt("listened_at", sevenDaysAgo.toISOString());

        const previous7dCount = previous7d?.length || 0;
        const growthRate = previous7dCount > 0 
          ? ((listens7dCount - previous7dCount) / previous7dCount) * 100 
          : listens7dCount > 0 ? 100 : 0;

        setTimeStats({
          listens7d: listens7dCount,
          listens30d: listens30dCount,
          peakHour: Number(peakHour),
          growthRate,
        });

        // Load voice reactions count
        const { count: voiceReactions } = await supabase
          .from("voice_reactions")
          .select("*", { count: "exact", head: true })
          .eq("clip_id", clip.id);

        setVoiceReactionsCount(voiceReactions || 0);

        // Load shares count
        const { count: shares } = await supabase
          .from("clip_shares")
          .select("*", { count: "exact", head: true })
          .eq("clip_id", clip.id);

        setSharesCount(shares || 0);
      } catch (error) {
        console.error("Error loading analytics:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadAnalytics();
  }, [clip, open]);

  if (!clip) return null;

  const totalReactions = Object.values(clip.reactions || {}).reduce((sum, count) => {
    const numeric = typeof count === "number" ? count : Number(count);
    return sum + (Number.isFinite(numeric) ? numeric : 0);
  }, 0);

  const emojiReactions = Object.entries(clip.reactions || {}).map(([emoji, count]) => ({
    name: emoji,
    value: typeof count === "number" ? count : Number(count) || 0,
  })).filter(item => item.value > 0);

  const chartConfig = {
    listens: {
      label: "Listens",
      color: "hsl(var(--chart-1))",
    },
    completion_rate: {
      label: "Completion Rate (%)",
      color: "hsl(var(--chart-2))",
    },
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-2xl">Clip Analytics</DialogTitle>
          <DialogDescription>
            Detailed performance metrics for this clip
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <div className="space-y-6 mt-4">
            {/* Performance Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="p-4 rounded-2xl">
                <div className="flex items-center gap-2 mb-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  <span className="text-xs text-muted-foreground uppercase">Completion Rate</span>
                </div>
                <p className="text-2xl font-bold">
                  {clip.completion_rate != null 
                    ? `${(clip.completion_rate * 100).toFixed(1)}%` 
                    : "N/A"}
                </p>
              </Card>
              <Card className="p-4 rounded-2xl">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="h-4 w-4 text-primary" />
                  <span className="text-xs text-muted-foreground uppercase">Quality Score</span>
                </div>
                <p className="text-2xl font-bold">
                  {clip.quality_score != null 
                    ? `${clip.quality_score.toFixed(1)}/10` 
                    : "N/A"}
                </p>
              </Card>
              <Card className="p-4 rounded-2xl">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  <span className="text-xs text-muted-foreground uppercase">Trending Score</span>
                </div>
                <p className="text-2xl font-bold">
                  {clip.trending_score != null 
                    ? clip.trending_score.toFixed(2) 
                    : "N/A"}
                </p>
              </Card>
              <Card className="p-4 rounded-2xl">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="h-4 w-4 text-primary" />
                  <span className="text-xs text-muted-foreground uppercase">Total Listens</span>
                </div>
                <p className="text-2xl font-bold">{clip.listens_count.toLocaleString()}</p>
              </Card>
            </div>

            {/* Engagement Breakdown */}
            <Card className="p-6 rounded-3xl">
              <h3 className="text-lg font-semibold mb-4">Engagement Breakdown</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Total Listens</span>
                  </div>
                  <p className="text-2xl font-bold">{clip.listens_count.toLocaleString()}</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <Heart className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Emoji Reactions</span>
                  </div>
                  <p className="text-2xl font-bold">{totalReactions}</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <Mic className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Voice Reactions</span>
                  </div>
                  <p className="text-2xl font-bold">{voiceReactionsCount}</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <Share2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Shares</span>
                  </div>
                  <p className="text-2xl font-bold">{sharesCount}</p>
                </div>
              </div>
              {(clip.reply_count || 0) > 0 && (
                <div className="mt-4 text-center">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <MessageCircle className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Replies</span>
                  </div>
                  <p className="text-2xl font-bold">{clip.reply_count || 0}</p>
                </div>
              )}
            </Card>

            {/* Emoji Reactions Breakdown */}
            {emojiReactions.length > 0 && (
              <Card className="p-6 rounded-3xl">
                <h3 className="text-lg font-semibold mb-4">Emoji Reactions</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {emojiReactions.map((item, index) => (
                    <div key={item.name} className="text-center">
                      <div className="text-3xl mb-2">{item.name}</div>
                      <p className="text-xl font-bold">{item.value}</p>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Listen-Through Graph */}
            {listenData.length > 0 && (
              <Card className="p-6 rounded-3xl">
                <h3 className="text-lg font-semibold mb-4">Listens Over Time</h3>
                <ChartContainer config={chartConfig}>
                  <LineChart data={listenData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      dataKey="date" 
                      className="text-xs"
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <YAxis 
                      className="text-xs"
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line 
                      type="monotone" 
                      dataKey="listens" 
                      stroke="hsl(var(--chart-1))" 
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                  </LineChart>
                </ChartContainer>
              </Card>
            )}

            {/* Completion Rate Over Time */}
            {listenData.length > 0 && (
              <Card className="p-6 rounded-3xl">
                <h3 className="text-lg font-semibold mb-4">Completion Rate Over Time</h3>
                <ChartContainer config={chartConfig}>
                  <LineChart data={listenData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      dataKey="date" 
                      className="text-xs"
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <YAxis 
                      className="text-xs"
                      domain={[0, 100]}
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line 
                      type="monotone" 
                      dataKey="completion_rate" 
                      stroke="hsl(var(--chart-2))" 
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                  </LineChart>
                </ChartContainer>
              </Card>
            )}

            {/* Time-Based Stats */}
            {timeStats && (
              <Card className="p-6 rounded-3xl">
                <h3 className="text-lg font-semibold mb-4">Time-Based Statistics</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Last 7 Days</span>
                    </div>
                    <p className="text-xl font-bold">{timeStats.listens7d}</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Last 30 Days</span>
                    </div>
                    <p className="text-xl font-bold">{timeStats.listens30d}</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Zap className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Peak Hour</span>
                    </div>
                    <p className="text-xl font-bold">
                      {timeStats.peakHour}:00
                    </p>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      {timeStats.growthRate >= 0 ? (
                        <TrendingUp className="h-4 w-4 text-green-500" />
                      ) : (
                        <TrendingDown className="h-4 w-4 text-red-500" />
                      )}
                      <span className="text-sm text-muted-foreground">Growth Rate</span>
                    </div>
                    <p className={`text-xl font-bold ${timeStats.growthRate >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {timeStats.growthRate >= 0 ? '+' : ''}{timeStats.growthRate.toFixed(1)}%
                    </p>
                  </div>
                </div>
              </Card>
            )}

            {/* Reaction Timeline */}
            {clip.duration_seconds && (
              <ReactionTimeline 
                clipId={clip.id} 
                clipDuration={clip.duration_seconds}
              />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

