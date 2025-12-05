import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, AlertTriangle, Home, Hash, Users, Type, Mic, TrendingUp, Flame, Search, Filter, Grid, List, Sparkles, Plus, Compass, Clock, Award, Activity, BarChart3, Eye, Heart, MessageCircle, Star, Zap, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ClipCard } from "@/components/ClipCard";
import { PostCard } from "@/components/PostCard";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { ClipListSkeleton } from "@/components/ui/clip-skeleton";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { NSFWSpaceRegulations } from "@/components/NSFWSpaceRegulations";

interface Clip {
  id: string;
  profile_id: string | null;
  audio_path: string;
  mood_emoji: string;
  duration_seconds: number;
  captions: string | null;
  summary: string | null;
  status: string;
  reactions: Record<string, number>;
  created_at: string;
  listens_count: number;
  city: string | null;
  topic_id: string | null;
  content_rating?: "general" | "sensitive";
  title: string | null;
  tags: string[] | null;
  profiles: {
    handle: string;
    emoji_avatar: string;
  } | null;
  topics?: {
    id: string;
    title: string;
  } | null;
}

interface Post {
  id: string;
  profile_id: string | null;
  community_id: string | null;
  topic_id: string | null;
  post_type: 'text' | 'video' | 'audio' | 'link';
  title: string | null;
  content: string | null;
  is_nsfw: boolean;
  created_at: string;
  vote_score: number;
  comment_count: number;
  view_count: number;
  profiles?: {
    handle: string;
    emoji_avatar: string;
  } | null;
  communities?: {
    name: string;
    slug: string;
    avatar_emoji: string;
  } | null;
  topics?: {
    id: string;
    title: string;
  } | null;
}

interface Topic {
  id: string;
  title: string;
  description: string | null;
  date: string;
  is_active: boolean;
  clips_count?: number;
  trending_score?: number;
  created_at: string;
  communities?: {
    id: string;
    name: string;
    slug: string;
    avatar_emoji: string;
  } | null;
}

interface Community {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  avatar_emoji: string;
  member_count: number;
  clip_count: number;
  is_nsfw?: boolean;
  created_at: string;
}

type TabType = "feed" | "topics" | "communities" | "posts" | "clips";
type SortOption = "newest" | "trending" | "popular" | "oldest";
type ViewMode = "list" | "grid";
type TimePeriod = "all" | "today" | "week" | "month";
type ContentType = "all" | "clips" | "posts";

const EighteenPlus = () => {
  const { profile, profileId } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabType>("feed");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("all");
  const [contentType, setContentType] = useState<ContentType>("all");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [popularTags, setPopularTags] = useState<Array<{ tag: string; count: number }>>([]);

  // Check if user has 18+ content enabled
  // @ts-ignore - show_18_plus_content exists but not in generated types
  const hasAccess = profile?.show_18_plus_content ?? false;

  // Load NSFW Clips
  const { data: clips, isLoading: isLoadingClips, refetch: refetchClips } = useQuery({
    queryKey: ['18plus-clips', sortBy],
    queryFn: async () => {
      if (!hasAccess) return [];
      
      let query = supabase
        .from("clips")
        .select(`
          *,
          profiles (
            handle,
            emoji_avatar
          ),
          topics (
            id,
            title
          )
        `)
        .eq("status", "live")
        .eq("content_rating", "sensitive");

      // Apply sorting
      if (sortBy === "trending") {
        query = query.order("listens_count", { ascending: false });
      } else if (sortBy === "popular") {
        query = query.order("listens_count", { ascending: false });
      } else if (sortBy === "oldest") {
        query = query.order("created_at", { ascending: true });
      } else {
        query = query.order("created_at", { ascending: false });
      }

      const { data, error } = await query.limit(100);
      if (error) throw error;
      return (data || []) as Clip[];
    },
    enabled: hasAccess,
  });

  // Load NSFW Posts
  const { data: posts, isLoading: isLoadingPosts, refetch: refetchPosts } = useQuery({
    queryKey: ['18plus-posts', sortBy],
    queryFn: async () => {
      if (!hasAccess) return [];
      
      let query = supabase
        .from("posts")
        .select(`
          *,
          profiles (
            handle,
            emoji_avatar
          ),
          communities (
            name,
            slug,
            avatar_emoji
          ),
          topics (
            id,
            title
          )
        `)
        .eq("status", "live")
        .eq("visibility", "public")
        .eq("is_nsfw", true)
        .is("deleted_at", null);

      if (sortBy === "trending") {
        query = query.order("vote_score", { ascending: false });
      } else if (sortBy === "popular") {
        query = query.order("view_count", { ascending: false });
      } else if (sortBy === "oldest") {
        query = query.order("created_at", { ascending: true });
      } else {
        query = query.order("created_at", { ascending: false });
      }

      const { data, error } = await query.limit(100);
      if (error) throw error;
      return (data || []) as Post[];
    },
    enabled: hasAccess,
  });

  // Load NSFW Topics
  const { data: topics, isLoading: isLoadingTopics } = useQuery({
    queryKey: ['18plus-topics', sortBy],
    queryFn: async () => {
      if (!hasAccess) return [];
      
      // Get topics that have NSFW clips
      const { data: clipsWithTopics, error: clipsError } = await supabase
        .from("clips")
        .select("topic_id")
        .eq("status", "live")
        .eq("content_rating", "sensitive")
        .not("topic_id", "is", null);

      if (clipsError) throw clipsError;
      
      const topicIds = [...new Set((clipsWithTopics || []).map(c => c.topic_id).filter(Boolean))];
      
      if (topicIds.length === 0) return [];

      let query = supabase
        .from("topics")
        .select(`
          *,
          communities (
            id,
            name,
            slug,
            avatar_emoji
          )
        `)
        .in("id", topicIds)
        .eq("is_active", true);

      if (sortBy === "trending") {
        query = query.order("trending_score", { ascending: false });
      } else if (sortBy === "popular") {
        query = query.order("clips_count", { ascending: false });
      } else if (sortBy === "oldest") {
        query = query.order("created_at", { ascending: true });
      } else {
        query = query.order("created_at", { ascending: false });
      }

      const { data, error } = await query.limit(100);
      if (error) throw error;
      return (data || []) as Topic[];
    },
    enabled: hasAccess,
  });

  // Load NSFW Communities
  const { data: communities, isLoading: isLoadingCommunities } = useQuery({
    queryKey: ['18plus-communities', sortBy],
    queryFn: async () => {
      if (!hasAccess) return [];
      
      let query = supabase
        .from("communities")
        .select("*")
        .eq("is_active", true)
        .eq("is_nsfw", true);

      if (sortBy === "trending" || sortBy === "popular") {
        query = query.order("member_count", { ascending: false });
      } else if (sortBy === "oldest") {
        query = query.order("created_at", { ascending: true });
      } else {
        query = query.order("created_at", { ascending: false });
      }

      const { data, error } = await query.limit(100);
      if (error) throw error;
      return (data || []) as Community[];
    },
    enabled: hasAccess,
  });

  // Load popular tags using backend function
  const { data: tagsData } = useQuery({
    queryKey: ['18plus-popular-tags'],
    queryFn: async () => {
      if (!hasAccess) return [];
      try {
        const { data, error } = await supabase.rpc('get_18plus_popular_tags', {
          p_limit: 20,
          p_min_count: 2
        });
        
        if (error) throw error;
        
        return (data || []).map((tag: any) => ({
          tag: tag.tag,
          count: tag.usage_count,
        }));
      } catch (error) {
        console.error("Error loading popular tags:", error);
        return [];
      }
    },
    enabled: hasAccess,
  });

  useEffect(() => {
    if (tagsData) setPopularTags(tagsData);
  }, [tagsData]);

  // Load Top Creators for NSFW content using backend function
  const { data: topCreators } = useQuery({
    queryKey: ['18plus-top-creators'],
    queryFn: async () => {
      if (!hasAccess) return [];
      try {
        const { data, error } = await supabase.rpc('get_18plus_top_creators', {
          p_limit: 10
        });
        
        if (error) throw error;
        
        return (data || []).map((creator: any) => ({
          profile_id: creator.profile_id,
          handle: creator.handle,
          emoji_avatar: creator.emoji_avatar,
          clips: creator.clips_count,
          listens: creator.total_listens,
        }));
      } catch (error) {
        console.error("Error loading top creators:", error);
        return [];
      }
    },
    enabled: hasAccess,
  });

  // Load Recent Activity using backend function
  const { data: recentActivity } = useQuery({
    queryKey: ['18plus-recent-activity'],
    queryFn: async () => {
      if (!hasAccess) return [];
      try {
        const { data, error } = await supabase.rpc('get_18plus_recent_activity', {
          p_limit: 10
        });
        
        if (error) throw error;
        
        return (data || []).map((item: any) => ({
          id: item.id,
          type: item.type,
          title: item.title,
          created_at: item.created_at,
          profiles: {
            handle: item.profile_handle,
            emoji_avatar: item.profile_emoji,
          },
          metric_value: item.metric_value,
        }));
      } catch (error) {
        console.error("Error loading recent activity:", error);
        return [];
      }
    },
    enabled: hasAccess,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Load Statistics using backend function
  const { data: statistics } = useQuery({
    queryKey: ['18plus-statistics'],
    queryFn: async () => {
      if (!hasAccess) return null;
      try {
        const { data, error } = await supabase.rpc('get_18plus_statistics', {
          p_days: 7
        });
        
        if (error) throw error;
        
        const dailyStats = (data || []).map((day: any) => ({
          date: day.date,
          clips: day.clips_count,
          listens: day.total_listens,
        }));
        
        // Get total stats
        const { count: totalClips } = await supabase
          .from("clips")
          .select("*", { count: "exact", head: true })
          .eq("status", "live")
          .eq("content_rating", "sensitive");
        
        const { count: totalPosts } = await supabase
          .from("posts")
          .select("*", { count: "exact", head: true })
          .eq("status", "live")
          .eq("is_nsfw", true);
        
        return {
          dailyStats,
          totalClips: totalClips || 0,
          totalPosts: totalPosts || 0,
        };
      } catch (error) {
        console.error("Error loading statistics:", error);
        return null;
      }
    },
    enabled: hasAccess,
  });

  // Combined feed (clips + posts) with time period and tag filtering
  const feedItems = useMemo(() => {
    const items: Array<{ type: 'clip' | 'post'; data: Clip | Post; created_at: string; score: number }> = [];
    
    // Time period filter
    const now = new Date();
    let timeFilter: Date | null = null;
    if (timePeriod === "today") {
      timeFilter = new Date(now.setHours(0, 0, 0, 0));
    } else if (timePeriod === "week") {
      timeFilter = new Date(now.setDate(now.getDate() - 7));
    } else if (timePeriod === "month") {
      timeFilter = new Date(now.setMonth(now.getMonth() - 1));
    }
    
    // Add clips
    if ((contentType === "all" || contentType === "clips") && clips) {
      clips.forEach(clip => {
        const clipDate = new Date(clip.created_at);
        if (timeFilter && clipDate < timeFilter) return;
        
        // Tag filtering
        if (selectedTags.length > 0 && clip.tags) {
          const hasMatchingTag = selectedTags.some(tag => 
            clip.tags?.some((clipTag: string) => clipTag.toLowerCase().includes(tag.toLowerCase()))
          );
          if (!hasMatchingTag) return;
        }
        
        items.push({
          type: 'clip',
          data: clip,
          created_at: clip.created_at,
          score: clip.listens_count || 0,
        });
      });
    }
    
    // Add posts
    if ((contentType === "all" || contentType === "posts") && posts) {
      posts.forEach(post => {
        const postDate = new Date(post.created_at);
        if (timeFilter && postDate < timeFilter) return;
        
        items.push({
          type: 'post',
          data: post,
          created_at: post.created_at,
          score: post.vote_score || 0,
        });
      });
    }
    
    // Sort feed
    if (sortBy === "trending") {
      return items.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    } else if (sortBy === "oldest") {
      return items.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    } else {
      return items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
  }, [clips, posts, sortBy, timePeriod, contentType, selectedTags]);

  // Filter by search
  const filteredFeedItems = useMemo(() => {
    if (!searchQuery) return feedItems;
    const query = searchQuery.toLowerCase();
    return feedItems.filter(item => {
      if (item.type === 'clip') {
        const clip = item.data as Clip;
        return (
          clip.captions?.toLowerCase().includes(query) ||
          clip.summary?.toLowerCase().includes(query) ||
          clip.title?.toLowerCase().includes(query) ||
          clip.profiles?.handle.toLowerCase().includes(query) ||
          clip.topics?.title.toLowerCase().includes(query)
        );
      } else {
        const post = item.data as Post;
        return (
          post.title?.toLowerCase().includes(query) ||
          post.content?.toLowerCase().includes(query) ||
          post.profiles?.handle.toLowerCase().includes(query) ||
          post.communities?.name.toLowerCase().includes(query) ||
          post.topics?.title.toLowerCase().includes(query)
        );
      }
    });
  }, [feedItems, searchQuery]);

  const filteredTopics = useMemo(() => {
    if (!topics) return [];
    if (!searchQuery) return topics;
    const query = searchQuery.toLowerCase();
    return topics.filter(topic =>
      topic.title.toLowerCase().includes(query) ||
      topic.description?.toLowerCase().includes(query) ||
      topic.communities?.name.toLowerCase().includes(query)
    );
  }, [topics, searchQuery]);

  const filteredCommunities = useMemo(() => {
    if (!communities) return [];
    if (!searchQuery) return communities;
    const query = searchQuery.toLowerCase();
    return communities.filter(community =>
      community.name.toLowerCase().includes(query) ||
      community.description?.toLowerCase().includes(query)
    );
  }, [communities, searchQuery]);

  const filteredPosts = useMemo(() => {
    if (!posts) return [];
    if (!searchQuery) return posts;
    const query = searchQuery.toLowerCase();
    return posts.filter(post =>
      post.title?.toLowerCase().includes(query) ||
      post.content?.toLowerCase().includes(query) ||
      post.profiles?.handle.toLowerCase().includes(query) ||
      post.communities?.name.toLowerCase().includes(query)
    );
  }, [posts, searchQuery]);

  const filteredClips = useMemo(() => {
    if (!clips) return [];
    if (!searchQuery) return clips;
    const query = searchQuery.toLowerCase();
    return clips.filter(clip =>
      clip.captions?.toLowerCase().includes(query) ||
      clip.summary?.toLowerCase().includes(query) ||
      clip.title?.toLowerCase().includes(query) ||
      clip.profiles?.handle.toLowerCase().includes(query) ||
      clip.topics?.title.toLowerCase().includes(query)
    );
  }, [clips, searchQuery]);

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border">
          <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild className="rounded-full">
              <Link to="/">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <h1 className="text-2xl font-bold">18+ Content</h1>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 py-6">
          <Card className="p-6 rounded-3xl space-y-4 text-center max-w-md mx-auto">
            <AlertTriangle className="h-12 w-12 mx-auto text-muted-foreground" />
            <h2 className="text-xl font-semibold">18+ Content Disabled</h2>
            <p className="text-sm text-muted-foreground">
              To view 18+ content, you need to enable it in your settings.
            </p>
            <Button asChild className="rounded-2xl">
              <Link to="/settings">Go to Settings</Link>
            </Button>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-xl border-b border-border/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4 py-4">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" asChild className="rounded-full">
                <Link to="/">
                  <ArrowLeft className="h-5 w-5" />
                </Link>
              </Button>
              <div data-tutorial="eighteen-plus-header">
                <h1 className="text-xl font-bold flex items-center gap-2">
                  <span className="text-lg">🔞</span>
                  18+ Space
                </h1>
                <p className="text-xs text-muted-foreground">Mature content hub</p>
              </div>
            </div>
            
            {/* Search */}
            <div className="hidden md:flex flex-1 max-w-md mx-8">
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search NSFW content..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-10"
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7"
                    onClick={() => setSearchQuery("")}
                  >
                    <span className="text-xs">✕</span>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Warning Banner & Regulations */}
        <div className="space-y-4 mb-6">
          <Card className="p-4 rounded-2xl bg-gradient-to-r from-yellow-500/10 via-red-500/10 to-yellow-500/10 border-yellow-500/20 border-2">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100">
                  Adult Content Warning
                </p>
                <p className="text-xs text-yellow-800 dark:text-yellow-200 mt-1">
                  This is a free speech zone for mature audiences 18+ only. 
                  <strong className="font-semibold"> Anything can be said here.</strong> All topics, all types of content, with minimal restrictions. 
                  User-generated content may contain explicit themes, controversial topics, and uncensored discussions.
                </p>
              </div>
            </div>
          </Card>
          
          {/* Regulations */}
          <NSFWSpaceRegulations />
        </div>

        <div className="flex gap-6">
          {/* Main Content */}
          <main className="flex-1 min-w-0">

        {/* Mobile Search */}
        <div className="md:hidden mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search NSFW content..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-10"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7"
                onClick={() => setSearchQuery("")}
              >
                <span className="text-xs">✕</span>
              </Button>
            )}
          </div>
        </div>

        {/* Enhanced Controls Bar */}
        <div className="space-y-4 mb-6">
          {/* Main Controls Row */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)} data-tutorial="eighteen-plus-filters">
                <SelectTrigger className="w-[140px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="trending">Trending</SelectItem>
                  <SelectItem value="popular">Popular</SelectItem>
                  <SelectItem value="oldest">Oldest</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={timePeriod} onValueChange={(v) => setTimePeriod(v as TimePeriod)}>
                <SelectTrigger className="w-[140px]">
                  <Clock className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                </SelectContent>
              </Select>

              {activeTab === "feed" && (
                <Select value={contentType} onValueChange={(v) => setContentType(v as ContentType)}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Content</SelectItem>
                    <SelectItem value="clips">Clips Only</SelectItem>
                    <SelectItem value="posts">Posts Only</SelectItem>
                  </SelectContent>
                </Select>
              )}
              
              <div className="hidden md:flex items-center gap-1 border rounded-lg p-1">
                <Button
                  variant={viewMode === "list" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("list")}
                  className="h-8"
                >
                  <List className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === "grid" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("grid")}
                  className="h-8"
                >
                  <Grid className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="text-sm text-muted-foreground font-medium">
              {activeTab === "feed" && `${filteredFeedItems.length} items`}
              {activeTab === "topics" && `${filteredTopics.length} topics`}
              {activeTab === "communities" && `${filteredCommunities.length} communities`}
              {activeTab === "posts" && `${filteredPosts.length} posts`}
              {activeTab === "clips" && `${filteredClips.length} clips`}
            </div>
          </div>

          {/* Popular Tags Filter */}
          {popularTags.length > 0 && activeTab === "feed" && (
            <Card className="p-3 border border-border/30 bg-muted/30">
              <div className="flex items-center gap-2 mb-2">
                <Hash className="h-3 w-3 text-primary" />
                <span className="text-xs font-medium text-muted-foreground">Filter by Tags:</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {popularTags.slice(0, 10).map(({ tag, count }) => {
                  const isSelected = selectedTags.includes(tag);
                  return (
                    <Button
                      key={tag}
                      variant={isSelected ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setSelectedTags(prev => 
                          isSelected 
                            ? prev.filter(t => t !== tag)
                            : [...prev, tag]
                        );
                      }}
                      className="h-7 text-xs"
                    >
                      {tag} <span className="text-muted-foreground ml-1">({count})</span>
                    </Button>
                  );
                })}
                {selectedTags.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedTags([])}
                    className="h-7 text-xs"
                  >
                    Clear All
                  </Button>
                )}
              </div>
            </Card>
          )}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:inline-flex">
            <TabsTrigger value="feed" className="flex items-center gap-2">
              <Home className="h-4 w-4" />
              <span className="hidden sm:inline">Feed</span>
            </TabsTrigger>
            <TabsTrigger value="topics" className="flex items-center gap-2">
              <Hash className="h-4 w-4" />
              <span className="hidden sm:inline">Topics</span>
            </TabsTrigger>
            <TabsTrigger value="communities" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Communities</span>
            </TabsTrigger>
            <TabsTrigger value="posts" className="flex items-center gap-2">
              <Type className="h-4 w-4" />
              <span className="hidden sm:inline">Posts</span>
            </TabsTrigger>
            <TabsTrigger value="clips" className="flex items-center gap-2">
              <Mic className="h-4 w-4" />
              <span className="hidden sm:inline">Clips</span>
            </TabsTrigger>
          </TabsList>

          {/* Feed Tab */}
          <TabsContent value="feed" className="space-y-6">
            {/* Featured Content Section */}
            {!isLoadingClips && !isLoadingPosts && clips && clips.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Star className="h-5 w-5 text-primary" />
                    <h2 className="text-lg font-bold">Featured Content</h2>
                  </div>
                  <Badge variant="secondary" className="text-xs">Top Picks</Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {clips
                    .sort((a, b) => (b.listens_count || 0) - (a.listens_count || 0))
                    .slice(0, 6)
                    .map((clip) => (
                      <div key={`featured-${clip.id}`} className="relative">
                        <Badge className="absolute top-2 left-2 z-10 bg-primary/90">
                          <Star className="h-3 w-3 mr-1" />
                          Featured
                        </Badge>
                        <div data-tutorial={index === 0 ? "eighteen-plus-clip" : undefined}>
                          <ClipCard clip={clip} showReplyButton={true} viewMode="grid" />
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Main Feed */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">All Content</h2>
                <Badge variant="outline" className="text-xs">
                  {filteredFeedItems.length} items
                </Badge>
              </div>
            {isLoadingClips || isLoadingPosts ? (
              <ClipListSkeleton count={5} />
            ) : filteredFeedItems.length > 0 ? (
              <>
                {/* Content Recommendations Section */}
                {profileId && clips && clips.length > 3 && (
                  <div className="space-y-4 mb-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-primary" />
                        <h2 className="text-lg font-bold">Recommended for You</h2>
                      </div>
                      <Badge variant="secondary" className="text-xs">Personalized</Badge>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {clips
                        .filter(clip => clip.listens_count && clip.listens_count > 10)
                        .sort((a, b) => (b.listens_count || 0) - (a.listens_count || 0))
                        .slice(0, 3)
                        .map((clip) => (
                          <div key={`recommended-${clip.id}`} className="relative">
                            <Badge className="absolute top-2 left-2 z-10 bg-primary/90">
                              <Zap className="h-3 w-3 mr-1" />
                              For You
                            </Badge>
                            <div data-tutorial={index === 0 ? "eighteen-plus-clip" : undefined}>
                          <ClipCard clip={clip} showReplyButton={true} viewMode="grid" />
                        </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Main Feed Content */}
                <div className={cn(
                  "space-y-4",
                  viewMode === "grid" && "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                )}>
                  {filteredFeedItems.map((item) => {
                    if (item.type === 'clip') {
                      const clip = item.data as Clip;
                      return (
                        <div key={`clip-${clip.id}`} className={viewMode === "grid" ? "" : ""} data-tutorial={filteredFeedItems.indexOf(item) === 0 ? "eighteen-plus-clip" : undefined}>
                          <ClipCard clip={clip} showReplyButton={true} viewMode={viewMode} />
                        </div>
                      );
                    } else {
                      const post = item.data as Post;
                      return (
                        <div key={`post-${post.id}`}>
                          <PostCard post={post} onPostUpdate={() => refetchPosts()} />
                        </div>
                      );
                    }
                  })}
                </div>
              </>
            ) : (
              <Card className="p-12 text-center">
                <Compass className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-lg font-semibold mb-2">No content found</p>
                <p className="text-muted-foreground">
                  {searchQuery ? "Try adjusting your search query." : "No 18+ content available yet. Check back later!"}
                </p>
              </Card>
            )}
            </div>
          </TabsContent>

          {/* Topics Tab */}
          <TabsContent value="topics" className="space-y-4">
            {isLoadingTopics ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Skeleton key={i} className="h-32 w-full" />
                ))}
              </div>
            ) : filteredTopics.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredTopics.map((topic) => (
                  <Link key={topic.id} to={`/topic/${topic.id}`}>
                    <Card className="p-4 hover:border-primary/50 transition-all cursor-pointer h-full">
                      <div className="flex items-start gap-3 mb-3">
                        {topic.communities && (
                          <span className="text-2xl shrink-0">{topic.communities.avatar_emoji}</span>
                        )}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-sm line-clamp-2 mb-1">{topic.title}</h3>
                          {topic.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2">{topic.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1">
                            <Mic className="h-3 w-3" />
                            {topic.clips_count || 0}
                          </span>
                          {topic.trending_score && topic.trending_score > 0 && (
                            <Badge variant="secondary" className="h-4 px-1.5 text-xs">
                              <Flame className="h-3 w-3 mr-1" />
                              {Math.round(topic.trending_score)}
                            </Badge>
                          )}
                        </div>
                        {topic.communities && (
                          <span className="text-xs">r/{topic.communities.name}</span>
                        )}
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            ) : (
              <Card className="p-12 text-center">
                <Hash className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-lg font-semibold mb-2">No topics found</p>
                <p className="text-muted-foreground">
                  {searchQuery ? "Try adjusting your search query." : "No 18+ topics available yet."}
                </p>
              </Card>
            )}
          </TabsContent>

          {/* Communities Tab */}
          <TabsContent value="communities" className="space-y-4">
            {isLoadingCommunities ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Skeleton key={i} className="h-40 w-full" />
                ))}
              </div>
            ) : filteredCommunities.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredCommunities.map((community) => (
                  <Link key={community.id} to={`/community/${community.slug}`}>
                    <Card className="p-4 hover:border-primary/50 transition-all cursor-pointer h-full">
                      <div className="flex items-start gap-3 mb-3">
                        <span className="text-3xl shrink-0">{community.avatar_emoji}</span>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-sm mb-1">r/{community.name}</h3>
                          {community.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2">{community.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 border-t">
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {community.member_count || 0} members
                          </span>
                          <span className="flex items-center gap-1">
                            <Mic className="h-3 w-3" />
                            {community.clip_count || 0} clips
                          </span>
                        </div>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            ) : (
              <Card className="p-12 text-center">
                <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-lg font-semibold mb-2">No communities found</p>
                <p className="text-muted-foreground">
                  {searchQuery ? "Try adjusting your search query." : "No 18+ communities available yet."}
                </p>
              </Card>
            )}
          </TabsContent>

          {/* Posts Tab */}
          <TabsContent value="posts" className="space-y-4">
            {isLoadingPosts ? (
              <ClipListSkeleton count={5} />
            ) : filteredPosts.length > 0 ? (
              <div className="space-y-4">
                {filteredPosts.map((post) => (
                  <PostCard key={post.id} post={post} onPostUpdate={() => refetchPosts()} />
                ))}
              </div>
            ) : (
              <Card className="p-12 text-center">
                <Type className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-lg font-semibold mb-2">No posts found</p>
                <p className="text-muted-foreground mb-4">
                  {searchQuery ? "Try adjusting your search query." : "No 18+ posts available yet."}
                </p>
                {profile && (
                  <Button onClick={() => {
                    // Show a dialog to select topic first, or navigate to a topic
                    toast({
                      title: "Select a topic",
                      description: "Please navigate to a topic page to create a post.",
                    });
                  }}>
                    <Plus className="w-4 h-4 mr-2" />
                    Browse Topics
                  </Button>
                )}
              </Card>
            )}
          </TabsContent>

          {/* Clips Tab */}
          <TabsContent value="clips" className="space-y-4">
            {isLoadingClips ? (
              <ClipListSkeleton count={5} />
            ) : filteredClips.length > 0 ? (
              <div className={cn(
                "space-y-4",
                viewMode === "grid" && "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
              )}>
                {filteredClips.map((clip) => (
                  <ClipCard key={clip.id} clip={clip} showReplyButton={true} viewMode={viewMode} />
                ))}
              </div>
            ) : (
              <Card className="p-12 text-center">
                <Mic className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-lg font-semibold mb-2">No clips found</p>
                <p className="text-muted-foreground">
                  {searchQuery ? "Try adjusting your search query." : "No 18+ clips available yet."}
                </p>
              </Card>
            )}
          </TabsContent>
        </Tabs>
        </main>

        {/* Right Sidebar - Stats & Trending */}
          <aside className="hidden lg:block w-80 shrink-0">
            <div className="sticky top-4 space-y-4">
              {/* Stats Widget */}
              <Card className="p-4 border border-border/30">
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold text-sm">18+ Stats</h3>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Total Clips</span>
                    <span className="font-semibold">{clips?.length || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Total Posts</span>
                    <span className="font-semibold">{posts?.length || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Active Topics</span>
                    <span className="font-semibold">{topics?.length || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Communities</span>
                    <span className="font-semibold">{communities?.length || 0}</span>
                  </div>
                </div>
              </Card>

              {/* Trending Topics Widget */}
              {filteredTopics && filteredTopics.length > 0 && (
                <Card className="p-4 border border-black/20 dark:border-border/30 hover:border-primary/50 dark:hover:border-primary/30 transition-colors">
                  <div className="flex items-center gap-2 mb-4">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    <h3 className="font-semibold text-sm">Trending Topics</h3>
                  </div>
                  <div className="space-y-2">
                    {filteredTopics
                      .filter(t => t.trending_score && t.trending_score > 0)
                      .sort((a, b) => (b.trending_score || 0) - (a.trending_score || 0))
                      .slice(0, 5)
                      .map((topic) => (
                        <Link key={topic.id} to={`/topic/${topic.id}`}>
                          <div className="p-2 rounded-lg border border-border/30 hover:border-primary/50 hover:bg-muted/50 transition-all cursor-pointer">
                            <div className="flex items-start gap-2">
                              {topic.communities && (
                                <span className="text-lg shrink-0">{topic.communities.avatar_emoji}</span>
                              )}
                              <div className="flex-1 min-w-0">
                                <h4 className="font-medium text-xs line-clamp-1 mb-1">{topic.title}</h4>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <Flame className="h-3 w-3" />
                                  <span>{Math.round(topic.trending_score || 0)}</span>
                                  <span>•</span>
                                  <Mic className="h-3 w-3" />
                                  <span>{topic.clips_count || 0}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </Link>
                      ))}
                    {filteredTopics.filter(t => t.trending_score && t.trending_score > 0).length === 0 && (
                      <p className="text-xs text-muted-foreground">No trending topics yet</p>
                    )}
                  </div>
                </Card>
              )}

              {/* Popular Communities Widget */}
              {filteredCommunities && filteredCommunities.length > 0 && (
                <Card className="p-4 border border-border/30">
                  <div className="flex items-center gap-2 mb-4">
                    <Users className="h-4 w-4 text-primary" />
                    <h3 className="font-semibold text-sm">Popular Communities</h3>
                  </div>
                  <div className="space-y-2">
                    {filteredCommunities
                      .sort((a, b) => b.member_count - a.member_count)
                      .slice(0, 5)
                      .map((community) => (
                        <Link key={community.id} to={`/community/${community.slug}`}>
                          <div className="p-2 rounded-lg border border-border/30 hover:border-primary/50 hover:bg-muted/50 transition-all cursor-pointer">
                            <div className="flex items-center gap-2">
                              <span className="text-xl shrink-0">{community.avatar_emoji}</span>
                              <div className="flex-1 min-w-0">
                                <h4 className="font-medium text-xs mb-1">r/{community.name}</h4>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <Users className="h-3 w-3" />
                                  <span>{community.member_count || 0}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </Link>
                      ))}
                  </div>
                </Card>
              )}

              {/* Top Creators Widget */}
              {topCreators && topCreators.length > 0 && (
                <Card className="p-4 border border-border/30">
                  <div className="flex items-center gap-2 mb-4">
                    <Award className="h-4 w-4 text-primary" />
                    <h3 className="font-semibold text-sm">Top Creators</h3>
                  </div>
                  <div className="space-y-2">
                    {topCreators.slice(0, 5).map((creator: any, idx: number) => (
                      <Link key={creator.profile_id} to={`/profile/${creator.handle}`}>
                        <div className="p-2 rounded-lg border border-border/30 hover:border-primary/50 hover:bg-muted/50 transition-all cursor-pointer">
                          <div className="flex items-center gap-2">
                            <div className="relative">
                              <span className="text-lg">{creator.emoji_avatar}</span>
                              {idx < 3 && (
                                <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-xs bg-primary">
                                  {idx + 1}
                                </Badge>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium text-xs mb-0.5 line-clamp-1">u/{creator.handle}</h4>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Mic className="h-3 w-3" />
                                <span>{creator.clips} clips</span>
                                <span>•</span>
                                <Eye className="h-3 w-3" />
                                <span>{creator.listens.toLocaleString()}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </Card>
              )}

              {/* Recent Activity Widget */}
              {recentActivity && recentActivity.length > 0 && (
                <Card className="p-4 border border-border/30">
                  <div className="flex items-center gap-2 mb-4">
                    <Activity className="h-4 w-4 text-primary" />
                    <h3 className="font-semibold text-sm">Recent Activity</h3>
                  </div>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {recentActivity.map((item: any) => (
                      <Link 
                        key={`${item.type}-${item.id}`} 
                        to={item.type === 'clip' ? `/clip/${item.id}` : `#`}
                        className="block"
                      >
                        <div className="p-2 rounded-lg border border-border/30 hover:border-primary/50 hover:bg-muted/50 transition-all cursor-pointer">
                          <div className="flex items-start gap-2">
                            <span className="text-sm shrink-0">
                              {item.type === 'clip' ? <Mic className="h-3 w-3" /> : <Type className="h-3 w-3" />}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-xs line-clamp-1 mb-1">
                                {item.title || 'Untitled'}
                              </p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                {item.profiles && (
                                  <span>u/{item.profiles.handle}</span>
                                )}
                                <span>•</span>
                                <Clock className="h-3 w-3" />
                                <span>{new Date(item.created_at).toLocaleDateString()}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </Card>
              )}

              {/* Enhanced Statistics with Charts */}
              {statistics && (
                <Card className="p-4 border border-border/30">
                  <div className="flex items-center gap-2 mb-4">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    <h3 className="font-semibold text-sm">Weekly Stats</h3>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">New Clips</span>
                      <span className="font-semibold">{statistics.dailyStats.reduce((sum, d) => sum + d.clips, 0)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Total Views</span>
                      <span className="font-semibold">{statistics.dailyStats.reduce((sum, d) => sum + d.listens, 0).toLocaleString()}</span>
                    </div>
                    {statistics.dailyStats.length > 0 && (
                      <div className="pt-2 border-t space-y-1">
                        {statistics.dailyStats.slice(-3).map((day: any) => (
                          <div key={day.date} className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">{new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' })}</span>
                            <div className="flex items-center gap-2">
                              <div className="w-16 bg-muted rounded-full h-1.5 overflow-hidden">
                                <div 
                                  className="bg-primary h-full transition-all"
                                  style={{ width: `${Math.min((day.clips / Math.max(...statistics.dailyStats.map((d: any) => d.clips))) * 100, 100)}%` }}
                                />
                              </div>
                              <span className="font-medium w-8 text-right">{day.clips}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </Card>
              )}
            </div>
          </aside>
        </div>
      </div>

    </div>
  );
};

export default EighteenPlus;
