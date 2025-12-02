import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle,
  TrendingUp,
  Users,
  FileText,
  Clock,
  BarChart3,
  Shield,
  Eye,
  Filter,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

interface NSFWStats {
  total_nsfw_clips: number;
  total_nsfw_posts: number;
  nsfw_clips_today: number;
  nsfw_posts_today: number;
  auto_tagged_count: number;
  high_confidence_count: number;
  avg_confidence: number;
  top_creators: Array<{
    profile_id: string;
    handle: string;
    emoji_avatar: string;
    nsfw_clip_count: number;
  }>;
  recent_detections: Array<{
    id: string;
    content_type: string;
    content_id: string;
    is_nsfw: boolean;
    confidence: number;
    analyzed_at: string;
  }>;
}

interface NSFWContentItem {
  id: string;
  content_type: string;
  content_id: string;
  is_nsfw: boolean;
  confidence: number;
  auto_tagged: boolean;
  analyzed_at: string;
  title: string;
  creator_handle: string;
  creator_emoji: string;
  created_at: string;
  status: string;
}

export const NSFWMonitoringDashboard = () => {
  const { toast } = useToast();
  const [timeRange, setTimeRange] = useState<7 | 30 | 90>(7);
  const [contentTypeFilter, setContentTypeFilter] = useState<string | null>(null);
  const [minConfidence, setMinConfidence] = useState<number>(0.0);
  const [contentListPage, setContentListPage] = useState(0);

  // Load NSFW statistics
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery({
    queryKey: ['nsfw-statistics', timeRange],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_nsfw_statistics_summary', {
        p_days: timeRange
      });

      if (error) throw error;
      return (data?.[0] || {}) as NSFWStats;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Load timeline data
  const { data: timeline, isLoading: timelineLoading } = useQuery({
    queryKey: ['nsfw-timeline', timeRange],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_nsfw_content_timeline', {
        p_days: timeRange
      });

      if (error) throw error;
      return (data || []) as Array<{
        date: string;
        clips_count: number;
        posts_count: number;
        total_count: number;
      }>;
    },
  });

  // Load NSFW content list
  const { data: contentList, isLoading: contentListLoading, refetch: refetchContentList } = useQuery({
    queryKey: ['nsfw-content-list', contentTypeFilter, minConfidence, contentListPage],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_nsfw_content_list', {
        p_limit: 50,
        p_offset: contentListPage * 50,
        p_content_type: contentTypeFilter,
        p_min_confidence: minConfidence,
      });

      if (error) throw error;
      return (data || []) as NSFWContentItem[];
    },
  });

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return "destructive";
    if (confidence >= 0.6) return "default";
    if (confidence >= 0.4) return "secondary";
    return "outline";
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.8) return "Very High";
    if (confidence >= 0.6) return "High";
    if (confidence >= 0.4) return "Medium";
    return "Low";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold bg-gradient-to-r from-red-600 to-orange-600 bg-clip-text text-transparent">
            NSFW Content Monitoring
          </h2>
          <p className="text-muted-foreground mt-1">
            Track and manage NSFW content detection and auto-tagging
          </p>
        </div>
        <Button onClick={() => { refetchStats(); refetchContentList(); }} variant="outline">
          <Eye className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Statistics Cards */}
      {statsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-5 border-red-500/20 bg-gradient-to-br from-red-50 to-red-100/50 dark:from-red-950/20 dark:to-red-900/10">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-muted-foreground">Total NSFW Clips</div>
              <FileText className="w-4 h-4 text-red-500" />
            </div>
            <div className="text-3xl font-bold text-red-600">{stats.total_nsfw_clips || 0}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {stats.nsfw_clips_today || 0} today
            </div>
          </Card>

          <Card className="p-5 border-orange-500/20 bg-gradient-to-br from-orange-50 to-orange-100/50 dark:from-orange-950/20 dark:to-orange-900/10">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-muted-foreground">Total NSFW Posts</div>
              <FileText className="w-4 h-4 text-orange-500" />
            </div>
            <div className="text-3xl font-bold text-orange-600">{stats.total_nsfw_posts || 0}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {stats.nsfw_posts_today || 0} today
            </div>
          </Card>

          <Card className="p-5 border-yellow-500/20 bg-gradient-to-br from-yellow-50 to-yellow-100/50 dark:from-yellow-950/20 dark:to-yellow-900/10">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-muted-foreground">Auto-Tagged</div>
              <Shield className="w-4 h-4 text-yellow-500" />
            </div>
            <div className="text-3xl font-bold text-yellow-600">{stats.auto_tagged_count || 0}</div>
            <div className="text-xs text-muted-foreground mt-1">
              Last {timeRange} days
            </div>
          </Card>

          <Card className="p-5 border-purple-500/20 bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-950/20 dark:to-purple-900/10">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-muted-foreground">High Confidence</div>
              <AlertTriangle className="w-4 h-4 text-purple-500" />
            </div>
            <div className="text-3xl font-bold text-purple-600">{stats.high_confidence_count || 0}</div>
            <div className="text-xs text-muted-foreground mt-1">
              ≥70% confidence
            </div>
          </Card>
        </div>
      ) : null}

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="content">Content List</TabsTrigger>
          <TabsTrigger value="creators">Top Creators</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card className="p-6">
            <h3 className="text-xl font-semibold mb-4">Summary Statistics</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">Average Confidence</div>
                <div className="text-2xl font-bold">
                  {stats ? `${((stats.avg_confidence || 0) * 100).toFixed(1)}%` : '0%'}
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">Detection Rate</div>
                <div className="text-2xl font-bold">
                  {stats && stats.auto_tagged_count > 0
                    ? `${((stats.auto_tagged_count / (stats.total_nsfw_clips + stats.total_nsfw_posts)) * 100).toFixed(1)}%`
                    : '0%'}
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">High Confidence Rate</div>
                <div className="text-2xl font-bold">
                  {stats && stats.auto_tagged_count > 0
                    ? `${((stats.high_confidence_count / stats.auto_tagged_count) * 100).toFixed(1)}%`
                    : '0%'}
                </div>
              </div>
            </div>

            {/* Recent Detections */}
            {stats?.recent_detections && stats.recent_detections.length > 0 && (
              <div className="mt-6">
                <h4 className="font-semibold mb-3">Recent Detections</h4>
                <div className="space-y-2">
                  {stats.recent_detections.slice(0, 10).map((detection) => (
                    <div
                      key={detection.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <Badge variant={getConfidenceColor(detection.confidence)}>
                          {getConfidenceLabel(detection.confidence)}
                        </Badge>
                        <span className="text-sm capitalize">{detection.content_type}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(detection.analyzed_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-sm font-medium">
                        {(detection.confidence * 100).toFixed(0)}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="content" className="space-y-4">
          {/* Filters */}
          <Card className="p-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Filters:</span>
              </div>
              <select
                value={contentTypeFilter || 'all'}
                onChange={(e) => setContentTypeFilter(e.target.value === 'all' ? null : e.target.value)}
                className="px-3 py-1 border rounded-md text-sm"
              >
                <option value="all">All Content</option>
                <option value="clip">Clips Only</option>
                <option value="post">Posts Only</option>
              </select>
              <select
                value={minConfidence}
                onChange={(e) => setMinConfidence(parseFloat(e.target.value))}
                className="px-3 py-1 border rounded-md text-sm"
              >
                <option value="0.0">Any Confidence</option>
                <option value="0.4">Medium+ (≥40%)</option>
                <option value="0.6">High (≥60%)</option>
                <option value="0.8">Very High (≥80%)</option>
              </select>
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(parseInt(e.target.value) as 7 | 30 | 90)}
                className="px-3 py-1 border rounded-md text-sm"
              >
                <option value="7">Last 7 Days</option>
                <option value="30">Last 30 Days</option>
                <option value="90">Last 90 Days</option>
              </select>
            </div>
          </Card>

          {/* Content List */}
          {contentListLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : contentList && contentList.length > 0 ? (
            <div className="space-y-2">
              {contentList.map((item) => (
                <Card key={item.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <Badge variant={getConfidenceColor(item.confidence)}>
                          {getConfidenceLabel(item.confidence)} ({(item.confidence * 100).toFixed(0)}%)
                        </Badge>
                        <Badge variant="outline" className="capitalize">
                          {item.content_type}
                        </Badge>
                        {item.auto_tagged && (
                          <Badge variant="secondary">
                            Auto-Tagged
                          </Badge>
                        )}
                      </div>
                      <div className="font-semibold mb-1">{item.title || 'Untitled'}</div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {item.creator_emoji} {item.creator_handle}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(item.analyzed_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        asChild
                      >
                        <Link
                          to={item.content_type === 'clip' ? `/clip/${item.content_id}` : `/post/${item.content_id}`}
                          target="_blank"
                        >
                          View
                        </Link>
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">No NSFW content found with current filters.</p>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="creators" className="space-y-4">
          <Card className="p-6">
            <h3 className="text-xl font-semibold mb-4">Top NSFW Content Creators</h3>
            {stats?.top_creators && stats.top_creators.length > 0 ? (
              <div className="space-y-3">
                {stats.top_creators.map((creator, index) => (
                  <div
                    key={creator.profile_id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex items-center gap-4">
                      <div className="text-2xl font-bold text-muted-foreground">#{index + 1}</div>
                      <div className="text-2xl">{creator.emoji_avatar}</div>
                      <div>
                        <div className="font-semibold">@{creator.handle}</div>
                        <div className="text-sm text-muted-foreground">
                          {creator.nsfw_clip_count} NSFW clips
                        </div>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/profile/${creator.handle}`} target="_blank">
                        View Profile
                      </Link>
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">
                No NSFW content creators found.
              </p>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="timeline" className="space-y-4">
          <Card className="p-6">
            <h3 className="text-xl font-semibold mb-4">NSFW Content Timeline</h3>
            {timelineLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : timeline && timeline.length > 0 ? (
              <div className="space-y-2">
                {timeline.slice(-30).map((day) => (
                  <div key={day.date} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="font-medium">{new Date(day.date).toLocaleDateString()}</div>
                    <div className="flex items-center gap-4">
                      <div className="text-sm">
                        <span className="text-red-600 font-medium">{day.clips_count}</span> clips
                      </div>
                      <div className="text-sm">
                        <span className="text-orange-600 font-medium">{day.posts_count}</span> posts
                      </div>
                      <div className="text-sm font-semibold">
                        {day.total_count} total
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">
                No timeline data available.
              </p>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

