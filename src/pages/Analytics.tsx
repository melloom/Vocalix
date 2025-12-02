import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { 
  ArrowLeft, 
  BarChart3, 
  TrendingUp, 
  Users, 
  Heart, 
  Share2, 
  MessageCircle, 
  Mic, 
  Download,
  Calendar,
  Globe,
  Smartphone,
  Monitor,
  Tablet,
  Clock,
  Target,
  Activity
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProfile } from "@/hooks/useProfile";
import { useToast } from "@/hooks/use-toast";
import { ErrorDisplay } from "@/components/ErrorDisplay";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ReactionTimeline } from "@/components/ReactionTimeline";
import { MentionAnalytics } from "@/components/MentionAnalytics";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface ListenThroughRate {
  clip_id: string;
  total_listens: number;
  completion_buckets: Record<string, number>;
  avg_completion_percentage: number;
  drop_off_points: Record<string, number>;
}

interface EngagementMetrics {
  total_listens: number;
  total_reactions: number;
  total_voice_reactions: number;
  total_shares: number;
  total_comments: number;
  avg_listens_per_clip: number;
  avg_reactions_per_clip: number;
  engagement_rate: number;
}

interface AudienceInsights {
  peak_listening_times: Record<string, number>;
  device_distribution: Record<string, number>;
  geographic_distribution: Record<string, number>;
  total_unique_listeners: number;
}

interface ClipPerformance {
  clip_id: string;
  title: string | null;
  created_at: string;
  listens_count: number;
  reactions_count: number;
  voice_reactions_count: number;
  shares_count: number;
  comments_count: number;
  avg_completion_percentage: number;
  engagement_score: number;
}

interface GrowthTrend {
  date: string;
  new_followers: number;
  total_followers: number;
  new_listens: number;
  new_reactions: number;
  new_voice_reactions: number;
  new_shares: number;
  engagement_rate: number;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

const Analytics = () => {
  const { profile } = useProfile();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<number>(30);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  
  // Data states
  const [engagementMetrics, setEngagementMetrics] = useState<EngagementMetrics | null>(null);
  const [audienceInsights, setAudienceInsights] = useState<AudienceInsights | null>(null);
  const [clipPerformance, setClipPerformance] = useState<ClipPerformance[]>([]);
  const [growthTrends, setGrowthTrends] = useState<GrowthTrend[]>([]);
  const [listenThroughRate, setListenThroughRate] = useState<ListenThroughRate | null>(null);
  const [clips, setClips] = useState<Array<{ id: string; title: string | null; duration_seconds: number | null }>>([]);
  const [selectedClipDuration, setSelectedClipDuration] = useState<number | null>(null);

  useEffect(() => {
    if (!profile?.id) return;
    loadAnalytics();
  }, [profile?.id, dateRange, selectedClipId]);

  const loadAnalytics = async () => {
    if (!profile?.id) return;
    
    setIsLoading(true);
    setError(null);

    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - dateRange);
      const endDate = new Date();

      // Load clips for selector
      const { data: clipsData } = await supabase
        .from("clips")
        .select("id, title, duration_seconds")
        .eq("profile_id", profile.id)
        .eq("status", "live")
        .order("created_at", { ascending: false })
        .limit(100);

      if (clipsData) {
        setClips(clipsData);
      }

      // Load selected clip duration if a clip is selected
      if (selectedClipId) {
        const selectedClip = clipsData?.find((c) => c.id === selectedClipId);
        if (selectedClip?.duration_seconds) {
          setSelectedClipDuration(selectedClip.duration_seconds);
        } else {
          // Fallback: fetch duration if not in clipsData
          const { data: clipData } = await supabase
            .from("clips")
            .select("duration_seconds")
            .eq("id", selectedClipId)
            .single();
          setSelectedClipDuration(clipData?.duration_seconds || null);
        }
      } else {
        setSelectedClipDuration(null);
      }

      // Load engagement metrics
      const { data: engagementData, error: engagementError } = await supabase
        .rpc("get_creator_engagement_metrics", {
          p_profile_id: profile.id,
          p_start_date: startDate.toISOString(),
          p_end_date: endDate.toISOString(),
        });

      if (engagementError) throw engagementError;
      if (engagementData && engagementData.length > 0) {
        setEngagementMetrics(engagementData[0]);
      }

      // Load audience insights
      const { data: audienceData, error: audienceError } = await supabase
        .rpc("get_creator_audience_insights", {
          p_profile_id: profile.id,
          p_start_date: startDate.toISOString(),
          p_end_date: endDate.toISOString(),
        });

      if (audienceError) throw audienceError;
      if (audienceData && audienceData.length > 0) {
        setAudienceInsights(audienceData[0]);
      }

      // Load clip performance comparison
      const { data: performanceData, error: performanceError } = await supabase
        .rpc("get_clip_performance_comparison", {
          p_profile_id: profile.id,
          p_limit: 20,
        });

      if (performanceError) throw performanceError;
      if (performanceData) {
        setClipPerformance(performanceData);
      }

      // Load growth trends
      const { data: trendsData, error: trendsError } = await supabase
        .rpc("get_creator_growth_trends", {
          p_profile_id: profile.id,
          p_days: dateRange,
        });

      if (trendsError) throw trendsError;
      if (trendsData) {
        setGrowthTrends(trendsData);
      }

      // Load listen-through rate for selected clip
      if (selectedClipId) {
        const { data: listenData, error: listenError } = await supabase
          .rpc("get_clip_listen_through_rates", {
            p_clip_id: selectedClipId,
            p_start_date: startDate.toISOString(),
            p_end_date: endDate.toISOString(),
          });

        if (listenError) throw listenError;
        if (listenData && listenData.length > 0) {
          setListenThroughRate(listenData[0]);
        }
      }
    } catch (err: any) {
      console.error("Error loading analytics:", err);
      setError(err.message || "Failed to load analytics");
      toast({
        title: "Error",
        description: "Failed to load analytics data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const exportData = async (format: "csv" | "json" | "tsv") => {
    if (!profile?.id) return;

    try {
      // Fetch additional detailed data for comprehensive export
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - dateRange);
      const endDate = new Date();

      // Get detailed per-clip analytics
      const { data: detailedClips } = await supabase
        .rpc("get_clip_performance_comparison", {
          p_profile_id: profile.id,
          p_limit: 1000, // Get all clips
        });

      // Get listen-through rates for all clips
      const listenThroughData: Record<string, any> = {};
      if (clips.length > 0) {
        for (const clip of clips.slice(0, 50)) { // Limit to 50 to avoid timeout
          const { data } = await supabase.rpc("get_clip_listen_through_rates", {
            p_clip_id: clip.id,
            p_start_date: startDate.toISOString(),
            p_end_date: endDate.toISOString(),
          });
          if (data && data.length > 0) {
            listenThroughData[clip.id] = data[0];
          }
        }
      }

      const exportData: any = {
        profile_id: profile.id,
        profile_handle: profile.handle,
        date_range: dateRange,
        date_range_start: startDate.toISOString(),
        date_range_end: endDate.toISOString(),
        exported_at: new Date().toISOString(),
        summary: {
          engagement_metrics: engagementMetrics,
          audience_insights: audienceInsights,
          total_clips: clipPerformance.length,
        },
        detailed_metrics: {
          clip_performance: detailedClips || clipPerformance,
          listen_through_rates: listenThroughData,
          growth_trends: growthTrends,
        },
        time_series_data: {
          daily_growth: growthTrends,
          peak_listening_times: audienceInsights?.peak_listening_times || {},
        },
        demographics: {
          device_distribution: audienceInsights?.device_distribution || {},
          geographic_distribution: audienceInsights?.geographic_distribution || {},
        },
      };

      if (format === "json") {
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `analytics-${new Date().toISOString().split("T")[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        // CSV/TSV export
        const delimiter = format === "tsv" ? "\t" : ",";
        let output = "";

        // Summary metrics
        output += "=== SUMMARY METRICS ===\n";
        output += `Metric${delimiter}Value\n`;
        if (engagementMetrics) {
          output += `Total Listens${delimiter}${engagementMetrics.total_listens}\n`;
          output += `Total Reactions${delimiter}${engagementMetrics.total_reactions}\n`;
          output += `Total Voice Reactions${delimiter}${engagementMetrics.total_voice_reactions}\n`;
          output += `Total Shares${delimiter}${engagementMetrics.total_shares}\n`;
          output += `Total Comments${delimiter}${engagementMetrics.total_comments}\n`;
          output += `Avg Listens per Clip${delimiter}${engagementMetrics.avg_listens_per_clip.toFixed(2)}\n`;
          output += `Avg Reactions per Clip${delimiter}${engagementMetrics.avg_reactions_per_clip.toFixed(2)}\n`;
          output += `Engagement Rate${delimiter}${engagementMetrics.engagement_rate.toFixed(2)}%\n`;
        }
        if (audienceInsights) {
          output += `Total Unique Listeners${delimiter}${audienceInsights.total_unique_listeners}\n`;
        }
        output += "\n";

        // Growth trends
        output += "=== DAILY GROWTH TRENDS ===\n";
        output += `Date${delimiter}New Followers${delimiter}Total Followers${delimiter}New Listens${delimiter}New Reactions${delimiter}New Voice Reactions${delimiter}New Shares${delimiter}Engagement Rate\n`;
        growthTrends.forEach((trend) => {
          output += `${trend.date}${delimiter}${trend.new_followers}${delimiter}${trend.total_followers}${delimiter}${trend.new_listens}${delimiter}${trend.new_reactions}${delimiter}${trend.new_voice_reactions}${delimiter}${trend.new_shares}${delimiter}${trend.engagement_rate.toFixed(2)}\n`;
        });
        output += "\n";

        // Clip performance
        output += "=== CLIP PERFORMANCE ===\n";
        output += `Clip ID${delimiter}Title${delimiter}Created At${delimiter}Listens${delimiter}Reactions${delimiter}Voice Reactions${delimiter}Shares${delimiter}Comments${delimiter}Avg Completion%${delimiter}Engagement Score\n`;
        (detailedClips || clipPerformance).forEach((clip: any) => {
          output += `${clip.clip_id}${delimiter}"${(clip.title || "").replace(/"/g, '""')}"${delimiter}${clip.created_at}${delimiter}${clip.listens_count}${delimiter}${clip.reactions_count}${delimiter}${clip.voice_reactions_count}${delimiter}${clip.shares_count}${delimiter}${clip.comments_count}${delimiter}${clip.avg_completion_percentage?.toFixed(2) || "N/A"}${delimiter}${clip.engagement_score?.toFixed(2) || "N/A"}\n`;
        });
        output += "\n";

        // Device distribution
        if (audienceInsights?.device_distribution) {
          output += "=== DEVICE DISTRIBUTION ===\n";
          output += `Device${delimiter}Count${delimiter}Percentage\n`;
          const totalDevices = Object.values(audienceInsights.device_distribution).reduce((a: number, b: number) => a + b, 0);
          Object.entries(audienceInsights.device_distribution).forEach(([device, count]) => {
            const percentage = totalDevices > 0 ? (((count as number) / totalDevices) * 100).toFixed(2) : "0.00";
            output += `${device}${delimiter}${count}${delimiter}${percentage}%\n`;
          });
          output += "\n";
        }

        // Geographic distribution
        if (audienceInsights?.geographic_distribution) {
          output += "=== GEOGRAPHIC DISTRIBUTION ===\n";
          output += `Country${delimiter}Count${delimiter}Percentage\n`;
          const totalGeo = Object.values(audienceInsights.geographic_distribution).reduce((a: number, b: number) => a + b, 0);
          Object.entries(audienceInsights.geographic_distribution)
            .sort(([, a], [, b]) => (b as number) - (a as number))
            .forEach(([country, count]) => {
              const percentage = totalGeo > 0 ? (((count as number) / totalGeo) * 100).toFixed(2) : "0.00";
              output += `${country}${delimiter}${count}${delimiter}${percentage}%\n`;
            });
          output += "\n";
        }

        // Peak listening times
        if (audienceInsights?.peak_listening_times) {
          output += "=== PEAK LISTENING TIMES ===\n";
          output += `Hour${delimiter}Listens\n`;
          Object.entries(audienceInsights.peak_listening_times)
            .sort(([a], [b]) => parseInt(a) - parseInt(b))
            .forEach(([hour, count]) => {
              output += `${hour}:00${delimiter}${count}\n`;
            });
        }

        const blob = new Blob([output], { type: format === "tsv" ? "text/tab-separated-values" : "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `analytics-${new Date().toISOString().split("T")[0]}.${format}`;
        a.click();
        URL.revokeObjectURL(url);
      }

      toast({
        title: "Export successful",
        description: `Analytics data exported as ${format.toUpperCase()}`,
      });
    } catch (err: any) {
      console.error("Error exporting data:", err);
      toast({
        title: "Export failed",
        description: "Failed to export analytics data",
        variant: "destructive",
      });
    }
  };

  // Prepare chart data
  const growthChartData = useMemo(() => {
    return growthTrends.map((trend) => ({
      date: new Date(trend.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      followers: trend.total_followers,
      listens: trend.new_listens,
      engagement: trend.engagement_rate,
    }));
  }, [growthTrends]);

  const deviceChartData = useMemo(() => {
    if (!audienceInsights?.device_distribution) return [];
    return Object.entries(audienceInsights.device_distribution).map(([device, count]) => ({
      name: device === "mobile" ? "Mobile" : device === "tablet" ? "Tablet" : device === "desktop" ? "Desktop" : "Unknown",
      value: count,
    }));
  }, [audienceInsights]);

  const geoChartData = useMemo(() => {
    if (!audienceInsights?.geographic_distribution) return [];
    return Object.entries(audienceInsights.geographic_distribution)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([country, count]) => ({
        name: country === "unknown" ? "Unknown" : country,
        value: count,
      }));
  }, [audienceInsights]);

  const peakTimesData = useMemo(() => {
    if (!audienceInsights?.peak_listening_times) return [];
    return Object.entries(audienceInsights.peak_listening_times)
      .map(([hour, count]) => ({
        hour: `${hour}:00`,
        listens: count,
      }))
      .sort((a, b) => parseInt(a.hour) - parseInt(b.hour));
  }, [audienceInsights]);

  const completionBucketsData = useMemo(() => {
    if (!listenThroughRate?.completion_buckets) return [];
    return Object.entries(listenThroughRate.completion_buckets).map(([bucket, count]) => ({
      bucket,
      count: Number(count),
    }));
  }, [listenThroughRate]);

  if (!profile) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <div className="w-full px-4 lg:px-8 py-6">
          <ErrorDisplay
            title="Authentication required"
            message="Please log in to view your analytics"
            variant="card"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="w-full px-4 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild className="rounded-full">
              <Link to="/recordings">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Analytics Dashboard</h1>
              <p className="text-sm text-muted-foreground">Track your content performance</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={dateRange.toString()} onValueChange={(v) => setDateRange(Number(v))}>
              <SelectTrigger className="w-[140px] rounded-2xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="365">Last year</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportData("csv")}
              className="rounded-2xl"
            >
              <Download className="h-4 w-4 mr-2" />
              CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportData("tsv")}
              className="rounded-2xl"
            >
              <Download className="h-4 w-4 mr-2" />
              TSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportData("json")}
              className="rounded-2xl"
            >
              <Download className="h-4 w-4 mr-2" />
              JSON
            </Button>
          </div>
        </div>
      </header>

      <main className="w-full px-4 lg:px-8 py-6">
        {isLoading ? (
          <div className="space-y-6">
            <Skeleton className="h-32 w-full rounded-3xl" />
            <Skeleton className="h-64 w-full rounded-3xl" />
            <Skeleton className="h-64 w-full rounded-3xl" />
          </div>
        ) : error ? (
          <ErrorDisplay
            title="Failed to load analytics"
            message={error}
            onRetry={loadAnalytics}
            variant="card"
          />
        ) : (
          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList className="grid w-full grid-cols-6 rounded-2xl">
              <TabsTrigger value="overview" className="rounded-xl">
                Overview
              </TabsTrigger>
              <TabsTrigger value="engagement" className="rounded-xl">
                Engagement
              </TabsTrigger>
              <TabsTrigger value="audience" className="rounded-xl">
                Audience
              </TabsTrigger>
              <TabsTrigger value="clips" className="rounded-xl">
                Clips
              </TabsTrigger>
              <TabsTrigger value="growth" className="rounded-xl">
                Growth
              </TabsTrigger>
              <TabsTrigger value="mentions" className="rounded-xl">
                Mentions
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              {/* Key Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="rounded-3xl">
                  <CardHeader className="pb-2">
                    <CardDescription>Total Listens</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">
                      {engagementMetrics?.total_listens.toLocaleString() || 0}
                    </div>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                      <TrendingUp className="h-3 w-3" />
                      <span>All time</span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-3xl">
                  <CardHeader className="pb-2">
                    <CardDescription>Engagement Rate</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">
                      {engagementMetrics?.engagement_rate.toFixed(1) || 0}%
                    </div>
                    <Progress 
                      value={engagementMetrics?.engagement_rate || 0} 
                      className="mt-2"
                    />
                  </CardContent>
                </Card>

                <Card className="rounded-3xl">
                  <CardHeader className="pb-2">
                    <CardDescription>Unique Listeners</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">
                      {audienceInsights?.total_unique_listeners.toLocaleString() || 0}
                    </div>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                      <Users className="h-3 w-3" />
                      <span>Total audience</span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-3xl">
                  <CardHeader className="pb-2">
                    <CardDescription>Avg Listens/Clip</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">
                      {engagementMetrics?.avg_listens_per_clip.toFixed(0) || 0}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      Per clip average
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Engagement Breakdown */}
              <Card className="rounded-3xl">
                <CardHeader>
                  <CardTitle>Engagement Breakdown</CardTitle>
                  <CardDescription>How your audience interacts with your content</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-4 rounded-2xl bg-muted">
                      <Heart className="h-6 w-6 mx-auto mb-2 text-red-500" />
                      <div className="text-2xl font-bold">
                        {engagementMetrics?.total_reactions.toLocaleString() || 0}
                      </div>
                      <div className="text-sm text-muted-foreground">Reactions</div>
                    </div>
                    <div className="text-center p-4 rounded-2xl bg-muted">
                      <Mic className="h-6 w-6 mx-auto mb-2 text-blue-500" />
                      <div className="text-2xl font-bold">
                        {engagementMetrics?.total_voice_reactions.toLocaleString() || 0}
                      </div>
                      <div className="text-sm text-muted-foreground">Voice Reactions</div>
                    </div>
                    <div className="text-center p-4 rounded-2xl bg-muted">
                      <Share2 className="h-6 w-6 mx-auto mb-2 text-green-500" />
                      <div className="text-2xl font-bold">
                        {engagementMetrics?.total_shares.toLocaleString() || 0}
                      </div>
                      <div className="text-sm text-muted-foreground">Shares</div>
                    </div>
                    <div className="text-center p-4 rounded-2xl bg-muted">
                      <MessageCircle className="h-6 w-6 mx-auto mb-2 text-purple-500" />
                      <div className="text-2xl font-bold">
                        {engagementMetrics?.total_comments.toLocaleString() || 0}
                      </div>
                      <div className="text-sm text-muted-foreground">Comments</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Growth Chart */}
              {growthChartData.length > 0 && (
                <Card className="rounded-3xl">
                  <CardHeader>
                    <CardTitle>Growth Trends</CardTitle>
                    <CardDescription>Followers and engagement over time</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={growthChartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="followers" stroke="#8884d8" name="Followers" />
                        <Line type="monotone" dataKey="listens" stroke="#82ca9d" name="Listens" />
                        <Line type="monotone" dataKey="engagement" stroke="#ffc658" name="Engagement %" />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="engagement" className="space-y-6">
              <Card className="rounded-3xl">
                <CardHeader>
                  <CardTitle>Engagement Metrics</CardTitle>
                  <CardDescription>Detailed engagement statistics</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h3 className="font-semibold mb-4">Average Metrics</h3>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Listens per clip</span>
                          <span className="font-semibold">
                            {engagementMetrics?.avg_listens_per_clip.toFixed(1) || 0}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Reactions per clip</span>
                          <span className="font-semibold">
                            {engagementMetrics?.avg_reactions_per_clip.toFixed(1) || 0}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Engagement rate</span>
                          <Badge variant="secondary">
                            {engagementMetrics?.engagement_rate.toFixed(2) || 0}%
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div>
                      <h3 className="font-semibold mb-4">Total Engagement</h3>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Total listens</span>
                          <span className="font-semibold">
                            {engagementMetrics?.total_listens.toLocaleString() || 0}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Total reactions</span>
                          <span className="font-semibold">
                            {engagementMetrics?.total_reactions.toLocaleString() || 0}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Total shares</span>
                          <span className="font-semibold">
                            {engagementMetrics?.total_shares.toLocaleString() || 0}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Listen-through Rate */}
              <Card className="rounded-3xl">
                <CardHeader>
                  <CardTitle>Listen-Through Rate</CardTitle>
                  <CardDescription>See how far listeners get through your clips</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="mb-4">
                    <Select
                      value={selectedClipId || ""}
                      onValueChange={setSelectedClipId}
                    >
                      <SelectTrigger className="w-full rounded-2xl">
                        <SelectValue placeholder="Select a clip to analyze" />
                      </SelectTrigger>
                      <SelectContent>
                        {clips.map((clip) => (
                          <SelectItem key={clip.id} value={clip.id}>
                            {clip.title || `Clip ${clip.id.slice(0, 8)}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {listenThroughRate && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 rounded-2xl bg-muted">
                          <div className="text-sm text-muted-foreground">Total Listens</div>
                          <div className="text-2xl font-bold">
                            {listenThroughRate.total_listens.toLocaleString()}
                          </div>
                        </div>
                        <div className="p-4 rounded-2xl bg-muted">
                          <div className="text-sm text-muted-foreground">Avg Completion</div>
                          <div className="text-2xl font-bold">
                            {listenThroughRate.avg_completion_percentage.toFixed(1)}%
                          </div>
                        </div>
                      </div>
                      {completionBucketsData.length > 0 && (
                        <div>
                          <h4 className="font-semibold mb-2">Completion Distribution</h4>
                          <ResponsiveContainer width="100%" height={200}>
                            <BarChart data={completionBucketsData}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="bucket" />
                              <YAxis />
                              <Tooltip />
                              <Bar dataKey="count" fill="#8884d8" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Reaction Timeline */}
              {selectedClipId && selectedClipDuration && (
                <ReactionTimeline 
                  clipId={selectedClipId} 
                  clipDuration={selectedClipDuration}
                />
              )}
            </TabsContent>

            <TabsContent value="audience" className="space-y-6">
              <Card className="rounded-3xl">
                <CardHeader>
                  <CardTitle>Audience Insights</CardTitle>
                  <CardDescription>Understand your audience better</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Device Distribution */}
                  {deviceChartData.length > 0 && (
                    <div>
                      <h3 className="font-semibold mb-4 flex items-center gap-2">
                        <Smartphone className="h-4 w-4" />
                        Device Types
                      </h3>
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={deviceChartData}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="value"
                          >
                            {deviceChartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* Geographic Distribution */}
                  {geoChartData.length > 0 && (
                    <div>
                      <h3 className="font-semibold mb-4 flex items-center gap-2">
                        <Globe className="h-4 w-4" />
                        Top Countries
                      </h3>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={geoChartData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="value" fill="#8884d8" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* Peak Listening Times */}
                  {peakTimesData.length > 0 && (
                    <div>
                      <h3 className="font-semibold mb-4 flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Peak Listening Times
                      </h3>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={peakTimesData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="hour" />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="listens" fill="#82ca9d" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="clips" className="space-y-6">
              <Card className="rounded-3xl">
                <CardHeader>
                  <CardTitle>Clip Performance Comparison</CardTitle>
                  <CardDescription>See how your clips compare to each other</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {clipPerformance.map((clip) => (
                      <div
                        key={clip.clip_id}
                        className="p-4 rounded-2xl border border-border hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <h4 className="font-semibold">
                              {clip.title || `Clip ${clip.clip_id.slice(0, 8)}`}
                            </h4>
                            <p className="text-sm text-muted-foreground">
                              {new Date(clip.created_at).toLocaleDateString()}
                            </p>
                          </div>
                          <Badge variant="secondary">
                            Score: {clip.engagement_score.toFixed(0)}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                          <div>
                            <div className="text-muted-foreground">Listens</div>
                            <div className="font-semibold">{clip.listens_count.toLocaleString()}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Reactions</div>
                            <div className="font-semibold">{clip.reactions_count.toLocaleString()}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Voice Reactions</div>
                            <div className="font-semibold">{clip.voice_reactions_count.toLocaleString()}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Shares</div>
                            <div className="font-semibold">{clip.shares_count.toLocaleString()}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Completion</div>
                            <div className="font-semibold">
                              {clip.avg_completion_percentage.toFixed(1)}%
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {clipPerformance.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        No clip performance data available
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="growth" className="space-y-6">
              <Card className="rounded-3xl">
                <CardHeader>
                  <CardTitle>Growth Trends</CardTitle>
                  <CardDescription>Track your growth over time</CardDescription>
                </CardHeader>
                <CardContent>
                  {growthChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={400}>
                      <LineChart data={growthChartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis yAxisId="left" />
                        <YAxis yAxisId="right" orientation="right" />
                        <Tooltip />
                        <Legend />
                        <Line
                          yAxisId="left"
                          type="monotone"
                          dataKey="followers"
                          stroke="#8884d8"
                          name="Followers"
                        />
                        <Line
                          yAxisId="left"
                          type="monotone"
                          dataKey="listens"
                          stroke="#82ca9d"
                          name="Listens"
                        />
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="engagement"
                          stroke="#ffc658"
                          name="Engagement %"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No growth data available for this period
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="mentions" className="space-y-6">
              {profile?.id && (
                <MentionAnalytics profileId={profile.id} days={dateRange} />
              )}
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
};

export default Analytics;

