import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { BarChart3, Users, MessageSquare, TrendingUp, AtSign } from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface MentionAnalyticsProps {
  profileId: string;
  days?: number;
}

interface MentionAnalyticsData {
  total_mentions: number;
  mentions_by_clip: number;
  mentions_by_comment: number;
  unique_mentioners: number;
  top_mentioners: Array<{
    profile_id: string;
    handle: string;
    emoji_avatar: string;
    mention_count: number;
  }>;
  mentions_over_time: Array<{
    date: string;
    count: number;
  }>;
  most_mentioned_clips: Array<{
    clip_id: string;
    title: string | null;
    mention_count: number;
  }>;
}

export const MentionAnalytics = ({ profileId, days = 30 }: MentionAnalyticsProps) => {
  const [data, setData] = useState<MentionAnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const loadAnalytics = async () => {
      setIsLoading(true);
      try {
        const { data: analyticsData, error } = await supabase.rpc("get_mention_analytics", {
          p_profile_id: profileId,
          p_days: days,
        });

        if (error) throw error;

        setData({
          total_mentions: analyticsData?.[0]?.total_mentions || 0,
          mentions_by_clip: analyticsData?.[0]?.mentions_by_clip || 0,
          mentions_by_comment: analyticsData?.[0]?.mentions_by_comment || 0,
          unique_mentioners: analyticsData?.[0]?.unique_mentioners || 0,
          top_mentioners: analyticsData?.[0]?.top_mentioners || [],
          mentions_over_time: analyticsData?.[0]?.mentions_over_time || [],
          most_mentioned_clips: analyticsData?.[0]?.most_mentioned_clips || [],
        });
      } catch (error) {
        console.error("Error loading mention analytics:", error);
        toast({
          title: "Error",
          description: "Failed to load mention analytics",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    if (profileId) {
      loadAnalytics();
    }
  }, [profileId, days, toast]);

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
          No mention data available
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
            <CardDescription>Total Mentions</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2">
              <AtSign className="h-5 w-5" />
              {data.total_mentions}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>In Clips</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              {data.mentions_by_clip}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>In Comments</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              {data.mentions_by_comment}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Unique Mentioners</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Users className="h-5 w-5" />
              {data.unique_mentioners}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="top">Top Mentioners</TabsTrigger>
          <TabsTrigger value="clips">Most Mentioned Clips</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Mention Distribution</CardTitle>
              <CardDescription>Breakdown of mentions by source</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={[
                  { name: "Clips", value: data.mentions_by_clip },
                  { name: "Comments", value: data.mentions_by_comment },
                ]}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trends" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Mentions Over Time</CardTitle>
              <CardDescription>Daily mention count for the last {days} days</CardDescription>
            </CardHeader>
            <CardContent>
              {data.mentions_over_time.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={data.mentions_over_time}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    />
                    <YAxis />
                    <Tooltip 
                      labelFormatter={(value) => new Date(value).toLocaleDateString()}
                    />
                    <Line type="monotone" dataKey="count" stroke="#8884d8" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  No mention data for this period
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="top" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Top Mentioners</CardTitle>
              <CardDescription>Users who mention you most often</CardDescription>
            </CardHeader>
            <CardContent>
              {data.top_mentioners.length > 0 ? (
                <div className="space-y-3">
                  {data.top_mentioners.map((mentioner, index) => (
                    <div
                      key={mentioner.profile_id}
                      className="flex items-center justify-between p-3 rounded-lg border"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{mentioner.emoji_avatar}</span>
                        <div>
                          <div className="font-medium">@{mentioner.handle}</div>
                          <div className="text-sm text-muted-foreground">
                            {mentioner.mention_count} {mentioner.mention_count === 1 ? 'mention' : 'mentions'}
                          </div>
                        </div>
                      </div>
                      <div className="text-2xl font-bold text-muted-foreground">
                        #{index + 1}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  No mentioners yet
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="clips" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Most Mentioned Clips</CardTitle>
              <CardDescription>Clips where you were mentioned most</CardDescription>
            </CardHeader>
            <CardContent>
              {data.most_mentioned_clips.length > 0 ? (
                <div className="space-y-3">
                  {data.most_mentioned_clips.map((clip, index) => (
                    <div
                      key={clip.clip_id}
                      className="flex items-center justify-between p-3 rounded-lg border"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">
                          {clip.title || "Untitled Clip"}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {clip.mention_count} {clip.mention_count === 1 ? 'mention' : 'mentions'}
                        </div>
                      </div>
                      <div className="text-2xl font-bold text-muted-foreground ml-4">
                        #{index + 1}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  No clips with mentions yet
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

