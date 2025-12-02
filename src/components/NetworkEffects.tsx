import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TrendingUp, Users, Network, Activity, RefreshCw } from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface NetworkEffectsData {
  current_followers: number;
  current_following: number;
  mutual_connections: number;
  second_degree_connections: number;
  growth_rate: number;
  engagement_from_network: number;
  network_growth_trend: Array<{
    date: string;
    follower_count: number;
    growth_rate: number;
  }>;
  top_network_contributors: Array<{
    profile_id: string;
    handle: string;
    emoji_avatar: string;
    engagement_score: number;
  }>;
}

export const NetworkEffects = () => {
  const { profile } = useProfile();
  const { toast } = useToast();
  const [data, setData] = useState<NetworkEffectsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCalculating, setIsCalculating] = useState(false);

  useEffect(() => {
    if (profile?.id) {
      loadNetworkEffects();
    }
  }, [profile?.id]);

  const loadNetworkEffects = async () => {
    if (!profile?.id) return;

    setIsLoading(true);
    try {
      // First, calculate current network effects
      await supabase.rpc("calculate_network_effects", {
        p_profile_id: profile.id,
      });

      // Then get analytics
      const { data: analyticsData, error } = await supabase.rpc("get_network_effects_analytics", {
        p_profile_id: profile.id,
        p_days: 30,
      });

      if (error) throw error;

      setData({
        current_followers: analyticsData?.[0]?.current_followers || 0,
        current_following: analyticsData?.[0]?.current_following || 0,
        mutual_connections: analyticsData?.[0]?.mutual_connections || 0,
        second_degree_connections: analyticsData?.[0]?.second_degree_connections || 0,
        growth_rate: analyticsData?.[0]?.growth_rate || 0,
        engagement_from_network: analyticsData?.[0]?.engagement_from_network || 0,
        network_growth_trend: analyticsData?.[0]?.network_growth_trend || [],
        top_network_contributors: analyticsData?.[0]?.top_network_contributors || [],
      });
    } catch (error) {
      console.error("Error loading network effects:", error);
      toast({
        title: "Error",
        description: "Failed to load network effects",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRecalculate = async () => {
    if (!profile?.id) return;

    setIsCalculating(true);
    try {
      await supabase.rpc("calculate_network_effects", {
        p_profile_id: profile.id,
      });

      toast({
        title: "Success",
        description: "Network effects recalculated",
      });

      await loadNetworkEffects();
    } catch (error) {
      console.error("Error recalculating network effects:", error);
      toast({
        title: "Error",
        description: "Failed to recalculate network effects",
        variant: "destructive",
      });
    } finally {
      setIsCalculating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          No network data available
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Followers</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Users className="h-5 w-5" />
              {data.current_followers}
            </CardTitle>
            {data.growth_rate !== 0 && (
              <div className={`text-sm ${data.growth_rate > 0 ? 'text-green-600' : 'text-red-600'}`}>
                {data.growth_rate > 0 ? '+' : ''}{data.growth_rate.toFixed(1)}%
              </div>
            )}
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Following</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Network className="h-5 w-5" />
              {data.current_following}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Mutual Connections</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Users className="h-5 w-5" />
              {data.mutual_connections}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>2nd Degree</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Activity className="h-5 w-5" />
              {data.second_degree_connections}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={handleRecalculate}
          disabled={isCalculating}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isCalculating ? 'animate-spin' : ''}`} />
          Recalculate
        </Button>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="growth">Growth Trend</TabsTrigger>
          <TabsTrigger value="contributors">Top Contributors</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Network Overview</CardTitle>
              <CardDescription>Your network statistics and engagement</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg border">
                  <div className="text-sm text-muted-foreground mb-1">Network Engagement</div>
                  <div className="text-2xl font-bold">{data.engagement_from_network.toFixed(1)}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Engagement from your network
                  </div>
                </div>
                <div className="p-4 rounded-lg border">
                  <div className="text-sm text-muted-foreground mb-1">Network Reach</div>
                  <div className="text-2xl font-bold">
                    {data.current_followers + data.second_degree_connections}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Total potential reach (1st + 2nd degree)
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="growth" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Network Growth Trend</CardTitle>
              <CardDescription>Follower growth over the last 30 days</CardDescription>
            </CardHeader>
            <CardContent>
              {data.network_growth_trend.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={data.network_growth_trend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    />
                    <YAxis />
                    <Tooltip
                      labelFormatter={(value) => new Date(value).toLocaleDateString()}
                      formatter={(value: number) => [value, 'Followers']}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="follower_count"
                      stroke="#8884d8"
                      strokeWidth={2}
                      name="Followers"
                    />
                    <Line
                      type="monotone"
                      dataKey="growth_rate"
                      stroke="#82ca9d"
                      strokeWidth={2}
                      name="Growth Rate %"
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  No growth data available yet. Check back in a few days!
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contributors" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Top Network Contributors</CardTitle>
              <CardDescription>
                People in your network who generate the most engagement
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.top_network_contributors.length > 0 ? (
                <div className="space-y-3">
                  {data.top_network_contributors.map((contributor, index) => (
                    <Link
                      key={contributor.profile_id}
                      to={`/profile/${contributor.handle}`}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="text-lg">
                            {contributor.emoji_avatar}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">@{contributor.handle}</div>
                          <div className="text-sm text-muted-foreground">
                            Engagement: {contributor.engagement_score.toFixed(1)}
                          </div>
                        </div>
                      </div>
                      <div className="text-2xl font-bold text-muted-foreground">
                        #{index + 1}
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  No network contributors yet
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

