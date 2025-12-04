import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Users, UserPlus, UserCheck, Sparkles, Filter, Search, SortAsc, SortDesc, List, Grid3x3, Calendar, Clock, TrendingUp, Heart, Play, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ClipCard } from "@/components/ClipCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/context/AuthContext";
import { useFollowing } from "@/hooks/useFollow";
import { useToast } from "@/hooks/use-toast";
import { BackToTop } from "@/components/BackToTop";
import { AuthGuard } from "@/components/AuthGuard";
import { logError } from "@/lib/logger";
import { cn } from "@/lib/utils";

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
  parent_clip_id?: string | null;
  reply_count?: number;
  profiles: {
    handle: string;
    emoji_avatar: string;
  } | null;
}

// Mock creators for tutorial demonstration
const MOCK_CREATORS = [
  { id: "mock-1", handle: "DeepVoice42", emoji_avatar: "🎙️", city: "New York", isFollowing: true, clipsCount: 12, bio: "Voice storyteller & podcaster" },
  { id: "mock-2", handle: "SmoothEcho89", emoji_avatar: "🎧", city: "Los Angeles", isFollowing: true, clipsCount: 8, bio: "Music producer & audio enthusiast" },
  { id: "mock-3", handle: "RawTone23", emoji_avatar: "🎤", city: "Chicago", isFollowing: false, clipsCount: 15, bio: "Raw thoughts & authentic conversations" },
  { id: "mock-4", handle: "CoolWave56", emoji_avatar: "🎵", city: "Miami", isFollowing: false, clipsCount: 6, bio: "Chill vibes & beach thoughts" },
  { id: "mock-5", handle: "CrispSignal12", emoji_avatar: "🎶", city: "Seattle", isFollowing: true, clipsCount: 20, bio: "Tech talks & startup stories" },
  { id: "mock-6", handle: "WarmBeat78", emoji_avatar: "🎼", city: "Austin", isFollowing: false, clipsCount: 9, bio: "Music lover & creative mind" },
  { id: "mock-7", handle: "VocalVibes", emoji_avatar: "🎹", city: "Portland", isFollowing: true, clipsCount: 14, bio: "Daily thoughts & life musings" },
  { id: "mock-8", handle: "EchoChamber", emoji_avatar: "🎷", city: "Denver", isFollowing: false, clipsCount: 11, bio: "Deep dives & philosophical chats" },
];

// Component for displaying mock creators in tutorial
const MockCreatorCard = ({ 
  creator, 
  viewerProfileId,
  onFollowClick,
  isHighlighted,
  toast
}: { 
  creator: typeof MOCK_CREATORS[0]; 
  viewerProfileId: string | null | undefined;
  onFollowClick: () => void;
  isHighlighted?: boolean;
  toast: ReturnType<typeof useToast>['toast'];
}) => {
  const [isFollowing, setIsFollowing] = useState(creator.isFollowing || false);
  const isOwnProfile = false; // Mock creators are never the user's own profile

  const handleFollowClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsFollowing(!isFollowing);
    onFollowClick();
  };
  
  // Don't highlight if already following
  const shouldHighlight = isHighlighted && !isFollowing;

  const handleProfileClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Don't navigate to real profiles in tutorial mode
    toast({
      title: "Tutorial Mode",
      description: "This is a demo creator. In the real app, clicking here would take you to their profile page!",
      duration: 2000,
    });
  };

  return (
    <div 
      className={`rounded-xl border p-4 transition-all duration-200 ${
        shouldHighlight 
          ? "border-primary bg-primary/10 shadow-xl shadow-primary/40 ring-2 ring-primary/60"
          : "border-border/40 bg-card/60 shadow-sm hover:border-border hover:bg-card/80"
      }`}
      data-tutorial="mock-creator-card"
    >
      <div className="flex items-center gap-3">
        <button
          onClick={handleProfileClick}
          className="block cursor-pointer"
          data-tutorial="creator-avatar"
        >
          <div className={`text-2xl hover:scale-110 transition-transform ${
            shouldHighlight ? "ring-2 ring-primary bg-primary/10 rounded-full p-1" : ""
          }`}>
            {creator.emoji_avatar}
          </div>
        </button>
        <div className="flex-1 min-w-0">
          <button
            onClick={handleProfileClick}
            className="block w-full text-left"
            data-tutorial="creator-handle"
          >
            <p className={`font-semibold text-sm truncate hover:underline ${
              shouldHighlight ? "text-primary font-semibold" : ""
            }`}>
              @{creator.handle}
            </p>
          </button>
          <div className="space-y-0.5">
            {creator.city && (
              <p className="text-xs text-muted-foreground truncate">{creator.city}</p>
            )}
            {creator.bio && (
              <p className="text-xs text-muted-foreground/80 truncate">{creator.bio}</p>
            )}
            {creator.clipsCount !== undefined && (
              <p className="text-xs text-muted-foreground/60">{creator.clipsCount} clips</p>
            )}
          </div>
        </div>
        {!isOwnProfile && (
          <Button
            variant={isFollowing ? "outline" : "default"}
            size="sm"
            className={`rounded-full h-8 px-3 text-xs ${
              shouldHighlight ? "ring-2 ring-primary/70 shadow-md shadow-primary/40" : ""
            }`}
            onClick={handleFollowClick}
            data-tutorial="follow-button"
          >
            {isFollowing ? (
              <>
                <UserCheck className="h-3 w-3 mr-1" />
                Following
              </>
            ) : (
              <>
                <UserPlus className="h-3 w-3 mr-1" />
                Follow
              </>
            )}
          </Button>
        )}
      </div>
      {shouldHighlight && (
        <div className="mt-3 pt-3 border-t border-primary/40">
          <p className="text-xs text-primary font-medium">
            💡 Click the avatar or handle to visit their profile. Click Follow to add them to your feed!
          </p>
        </div>
      )}
    </div>
  );
};

const Following = () => {
  const { profile } = useAuth();
  const { following, isLoading: isLoadingFollowing } = useFollowing();
  const [clips, setClips] = useState<Clip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const [isTutorialActive, setIsTutorialActive] = useState(false);
  
  // Filter and sort state
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "most_reactions" | "most_listens">("newest");
  const [timeFilter, setTimeFilter] = useState<"all" | "today" | "week" | "month">("all");
  const [moodFilter, setMoodFilter] = useState<string>("all");
  const [durationFilter, setDurationFilter] = useState<"all" | "short" | "medium" | "long">("all");
  const [viewMode, setViewMode] = useState<"list" | "compact">("list");
  const [showFilters, setShowFilters] = useState(false);

  // Memoize following IDs to avoid recalculating
  // Ensure followingIds is always an array, even if following is undefined
  const followingIds = useMemo(() => {
    if (!following) {
      return [];
    }
    if (following.length === 0) {
      return [];
    }
    return following.map((f) => f.id);
  }, [following]);

  // Helper function to handle navigation in tutorial mode
  const handleTutorialNavigation = (e: React.MouseEvent) => {
    if (isTutorialActive) {
      e.preventDefault();
      e.stopPropagation();
      toast({
        title: "Tutorial Mode",
        description: "This is a demo. In the real app, this button would take you to explore more voices and creators!",
        duration: 3000,
      });
    }
  };

  // Check if tutorial is active and on the "follow" step
  useEffect(() => {
    const checkTutorialState = () => {
      const tutorialCompleted = localStorage.getItem("echo_garden_tutorial_completed");
      if (tutorialCompleted === "true") {
        setIsTutorialActive(false);
        return;
      }

      // Show mock creators if:
      // 1. Tutorial is not completed
      // 2. User has no following (likely in tutorial or new user)
      // 3. We're on the Following page
      // This ensures everyone sees the tutorial experience
      setIsTutorialActive(true);
    };

    checkTutorialState();
    
    // Listen for tutorial completion events
    const handleTutorialComplete = () => {
      setIsTutorialActive(false);
    };
    
    // Listen for storage changes (when tutorial is completed in another tab/window)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "echo_garden_tutorial_completed" && e.newValue === "true") {
        setIsTutorialActive(false);
      }
    };
    
    window.addEventListener("tutorial-completed", handleTutorialComplete);
    window.addEventListener("storage", handleStorageChange);
    
    // Check periodically in case tutorial state changes
    const interval = setInterval(() => {
      const tutorialCompleted = localStorage.getItem("echo_garden_tutorial_completed");
      if (tutorialCompleted === "true") {
        setIsTutorialActive(false);
      } else if (!following || following.length === 0) {
        // Only show if user has no following
        setIsTutorialActive(true);
      }
    }, 1000);
    
    return () => {
      window.removeEventListener("tutorial-completed", handleTutorialComplete);
      window.removeEventListener("storage", handleStorageChange);
      clearInterval(interval);
    };
  }, [following]);

  useEffect(() => {
    const loadFollowingClips = async () => {
      if (!profile?.id) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      try {
        // If user is not following anyone, return empty
        if (followingIds.length === 0) {
          setClips([]);
          setIsLoading(false);
          return;
        }

        // Get clips from followed users
        const { data: clipsData, error: clipsError } = await supabase
          .from("clips")
          .select(
            `
            *,
            profiles (
              handle,
              emoji_avatar
            )
          `,
          )
          .in("profile_id", followingIds)
          .in("status", ["live", "processing"])
          .is("parent_clip_id", null) // Only top-level clips
          .order("created_at", { ascending: false })
          .limit(100);

        if (clipsError) {
          throw clipsError;
        }

        // Calculate reply counts
        const clipIds = (clipsData || []).map((clip: any) => clip.id);
        if (clipIds.length > 0) {
          const { data: repliesData, error: repliesError } = await supabase
            .from("clips")
            .select("parent_clip_id")
            .in("parent_clip_id", clipIds);
          
          if (repliesError) {
            // Log but don't throw - we can still show clips without reply counts
            logError("Error loading reply counts", repliesError);
          }

          const replyCounts: Record<string, number> = {};
          if (repliesData) {
            repliesData.forEach((reply: any) => {
              if (reply.parent_clip_id) {
                replyCounts[reply.parent_clip_id] = (replyCounts[reply.parent_clip_id] || 0) + 1;
              }
            });
          }

          const clipsWithReplies = (clipsData || []).map((clip: any) => ({
            ...clip,
            reply_count: replyCounts[clip.id] || 0,
          }));

          setClips(clipsWithReplies as Clip[]);
        } else {
          setClips([]);
        }
      } catch (error) {
        logError("Error loading following clips", error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        toast({
          title: "Couldn't load voices",
          description: errorMessage.includes("network") || errorMessage.includes("fetch")
            ? "Network error. Please check your connection and try again."
            : errorMessage.includes("permission") || errorMessage.includes("403")
            ? "Permission denied. Please refresh the page or sign in again."
            : "Unable to load clips from people you follow. Please try again in a moment.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    if (!isLoadingFollowing) {
      loadFollowingClips().catch((error) => {
        logError("Unhandled error in loadFollowingClips", error);
      });
    }
  }, [profile?.id, followingIds, isLoadingFollowing, toast]);

  // Subscribe to new clips from followed users
  useEffect(() => {
    if (followingIds.length === 0 || !profile?.id) return;

    let channel: ReturnType<typeof supabase.channel> | null = null;

    try {
      channel = supabase
        .channel("following-clips")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "clips",
            filter: `profile_id=in.(${followingIds.join(",")})`,
          },
          async (payload) => {
            try {
              const { data, error } = await supabase
                .from("clips")
                .select(
                  `
                  *,
                  profiles (
                    handle,
                    emoji_avatar
                  )
                `,
                )
                .eq("id", payload.new.id)
                .single();

              if (!error && data && !data.parent_clip_id) {
                setClips((prev) => {
                  const exists = prev.some((clip) => clip.id === data.id);
                  if (exists) {
                    return prev.map((clip) => (clip.id === data.id ? (data as Clip) : clip));
                  }
                  return [data as Clip, ...prev];
                });
              }
            } catch (error) {
              logError("Error handling new clip", error);
              // Silently handle errors in realtime subscription to prevent console spam
            }
          },
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            // Subscription successful
          } else if (status === "CHANNEL_ERROR") {
            logError("Channel subscription error", new Error("Failed to subscribe to following clips"));
          }
        });
    } catch (error) {
      logError("Error setting up subscription", error);
    }

    return () => {
      if (channel) {
        supabase.removeChannel(channel).catch((error) => {
          logError("Error removing channel", error);
        });
      }
    };
  }, [followingIds, profile?.id]);

  // Filter and sort clips
  const filteredAndSortedClips = useMemo(() => {
    let filtered = [...clips];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((clip) => {
        const titleMatch = clip.title?.toLowerCase().includes(query);
        const captionMatch = clip.captions?.toLowerCase().includes(query);
        const summaryMatch = clip.summary?.toLowerCase().includes(query);
        const handleMatch = clip.profiles?.handle?.toLowerCase().includes(query);
        return titleMatch || captionMatch || summaryMatch || handleMatch;
      });
    }

    // Time filter
    if (timeFilter !== "all") {
      const now = new Date();
      const filterDate = new Date();
      if (timeFilter === "today") {
        filterDate.setHours(0, 0, 0, 0);
      } else if (timeFilter === "week") {
        filterDate.setDate(now.getDate() - 7);
      } else if (timeFilter === "month") {
        filterDate.setMonth(now.getMonth() - 1);
      }
      filtered = filtered.filter((clip) => {
        const clipDate = new Date(clip.created_at);
        return clipDate >= filterDate;
      });
    }

    // Mood filter
    if (moodFilter !== "all") {
      filtered = filtered.filter((clip) => clip.mood_emoji === moodFilter);
    }

    // Duration filter
    if (durationFilter !== "all") {
      filtered = filtered.filter((clip) => {
        const duration = clip.duration_seconds || 0;
        if (durationFilter === "short") return duration <= 15;
        if (durationFilter === "medium") return duration > 15 && duration <= 30;
        if (durationFilter === "long") return duration > 30;
        return true;
      });
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "oldest":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case "most_reactions":
          const aReactions = Object.values(a.reactions || {}).reduce((sum, count) => sum + count, 0);
          const bReactions = Object.values(b.reactions || {}).reduce((sum, count) => sum + count, 0);
          return bReactions - aReactions;
        case "most_listens":
          return (b.listens_count || 0) - (a.listens_count || 0);
        case "newest":
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

    return filtered;
  }, [clips, searchQuery, timeFilter, moodFilter, durationFilter, sortBy]);

  return (
    <AuthGuard>
      {!profile ? (
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center space-y-4">
            <p className="text-muted-foreground">Please sign in to view voices from people you follow.</p>
            <Button variant="outline" asChild>
              <Link to="/">Go Home</Link>
            </Button>
          </div>
        </div>
      ) : (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="w-full px-6 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild className="rounded-full">
            <Link to="/">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            <h1 className="text-2xl font-bold">Following</h1>
          </div>
        </div>
      </header>

      <main className="w-full px-6 py-6 space-y-8">
        {isLoadingFollowing || isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={`clip-skeleton-${index}`}
                className="rounded-3xl border border-border/60 bg-card/80 p-6 space-y-4"
              >
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                </div>
                <Skeleton className="h-16 w-full rounded-2xl" />
              </div>
            ))}
          </div>
        ) : followingIds.length === 0 ? (
          <div className="space-y-6">
            {isTutorialActive ? (
              <>
                {/* Full-Width Following Page Layout */}
                <div className="space-y-8">
                  {/* Feed Section - Left Side */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Main Feed - Takes 2 columns */}
                    <div className="lg:col-span-2 space-y-6">
                      {/* Feed Header */}
                      <div className="flex items-center justify-between pb-4 border-b border-border">
                        <div className="flex items-center gap-3">
                          <Users className="h-6 w-6 text-primary" />
                          <div>
                            <h2 className="text-2xl font-bold">Following Feed</h2>
                            <p className="text-xs text-muted-foreground">
                              {MOCK_CREATORS.filter(c => c.isFollowing).length} creators • 
                              {MOCK_CREATORS.filter(c => c.isFollowing).reduce((sum, c) => sum + (c.clipsCount || 0), 0)} clips
                            </p>
                          </div>
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          Tutorial Mode
                        </Badge>
                      </div>

                      {/* Feed Items */}
                      <div className="space-y-6">
                        {MOCK_CREATORS.filter(c => c.isFollowing).slice(0, 3).map((creator, idx) => (
                          <div key={`feed-preview-${creator.id}`} className="rounded-2xl border border-border/60 bg-card p-5 space-y-4">
                            {/* Creator Header */}
                            <div className="flex items-center gap-3">
                              <div className="text-3xl">{creator.emoji_avatar}</div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="font-semibold text-sm">@{creator.handle}</p>
                                  <Badge variant="outline" className="text-xs h-5 px-1.5">Following</Badge>
                                </div>
                                <p className="text-xs text-muted-foreground">{idx === 0 ? "2h ago" : idx === 1 ? "5h ago" : "1d ago"}</p>
                              </div>
                              <Button variant="ghost" size="sm" className="h-8">
                                <UserCheck className="h-4 w-4" />
                              </Button>
                            </div>
                            
                            {/* Audio Waveform */}
                            <div className="rounded-xl bg-gradient-to-r from-primary/20 via-primary/10 to-primary/5 p-6 border border-primary/20">
                              <div className="flex items-center justify-center gap-1 h-16">
                                {Array.from({ length: 20 }).map((_, i) => (
                                  <div
                                    key={i}
                                    className="w-1 bg-primary rounded-full animate-pulse"
                                    style={{
                                      height: `${Math.random() * 40 + 20}%`,
                                      animationDelay: `${i * 0.1}s`,
                                    }}
                                  />
                                ))}
                              </div>
                              <div className="mt-3 text-center">
                                <p className="text-sm font-medium">{idx === 0 ? "Daily thoughts on creativity" : idx === 1 ? "Quick voice note about today" : "Sharing some insights"}</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {idx === 0 ? "28s" : idx === 1 ? "15s" : "42s"} • {idx === 0 ? "😊" : idx === 1 ? "💡" : "🔥"}
                                </p>
                              </div>
                            </div>
                            
                            {/* Engagement Bar */}
                            <div className="flex items-center justify-between pt-2 border-t border-border/40">
                              <div className="flex items-center gap-4 text-sm">
                                <button className="flex items-center gap-1.5 hover:text-primary transition-colors">
                                  <span className="text-lg">❤️</span>
                                  <span className="text-muted-foreground">{idx === 0 ? "24" : idx === 1 ? "18" : "31"}</span>
                                </button>
                                <button className="flex items-center gap-1.5 hover:text-primary transition-colors">
                                  <span className="text-lg">💬</span>
                                  <span className="text-muted-foreground">{idx === 0 ? "5" : idx === 1 ? "2" : "7"}</span>
                                </button>
                                <button className="flex items-center gap-1.5 hover:text-primary transition-colors">
                                  <span className="text-lg">🔁</span>
                                  <span className="text-muted-foreground">{idx === 0 ? "3" : idx === 1 ? "1" : "4"}</span>
                                </button>
                              </div>
                              <Button variant="ghost" size="sm" className="h-8 text-xs">
                                Save
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Sidebar - Right Side */}
                    <div className="lg:col-span-1 space-y-6">
                      {/* Following Status */}
                      <div className="rounded-2xl border-2 border-primary/20 bg-gradient-to-br from-primary/5 via-background to-primary/5 p-6 shadow-lg sticky top-24">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <div className="p-2 rounded-lg bg-primary/20">
                              <UserCheck className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <p className="text-base font-bold">You're Following</p>
                              <p className="text-xs text-muted-foreground">
                                {MOCK_CREATORS.filter(c => c.isFollowing).length} creators
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="text-center mb-4">
                          <p className="text-3xl font-bold text-primary">
                            {MOCK_CREATORS.filter(c => c.isFollowing).reduce((sum, c) => sum + (c.clipsCount || 0), 0)}
                          </p>
                          <p className="text-xs text-muted-foreground">total clips</p>
                        </div>
                        <div className="space-y-2 mb-4">
                          {MOCK_CREATORS.filter(c => c.isFollowing).map(creator => (
                            <div key={creator.id} className="flex items-center gap-2 p-2 rounded-lg bg-background/60 border border-primary/20 hover:bg-primary/5 transition-colors">
                              <span className="text-lg">{creator.emoji_avatar}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold truncate">@{creator.handle}</p>
                                <p className="text-xs text-muted-foreground">{creator.clipsCount || 0} clips</p>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="pt-4 border-t border-primary/10">
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            <span className="font-semibold text-foreground">💡 Tip:</span> When you follow creators, their voice clips will appear in your Following feed.
                          </p>
                        </div>
                      </div>

                      {/* Discover Creators - Only show in tutorial */}
                      {isTutorialActive && (
                        <div className="rounded-xl border border-border/40 bg-card/60 p-5">
                          <div className="flex items-center gap-2 mb-4">
                            <Sparkles className="h-4 w-4 text-primary" />
                            <h3 className="text-base font-semibold">Discover Creators</h3>
                          </div>
                          <div className="space-y-3">
                            {MOCK_CREATORS.filter(c => !c.isFollowing).slice(0, 3).map((creator, index) => (
                              <MockCreatorCard
                                key={creator.id}
                                creator={creator}
                                viewerProfileId={profile?.id}
                                isHighlighted={index === 0}
                                toast={toast}
                                onFollowClick={() => {
                                  toast({
                                    title: "Following! 🎉",
                                    description: "Great! Following creators will show their clips in your Following feed.",
                                    duration: 2000,
                                  });
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Tutorial Tips */}
                  <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-2">
                    <div className="flex items-start gap-2">
                      <Sparkles className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">How to Follow Creators:</p>
                        <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                          <li>Click on a creator&apos;s <span className="font-medium text-foreground">avatar or handle</span> to visit their profile</li>
                          <li>Click the <span className="font-medium text-primary">Follow button</span> to add them to your feed</li>
                          <li>Their clips will appear in your <span className="font-medium text-foreground">Following feed</span></li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="text-center pt-4">
                  {isTutorialActive ? (
                    <Button 
                      variant="outline" 
                      className="rounded-full"
                      onClick={handleTutorialNavigation}
                    >
                      Explore more voices
                    </Button>
                  ) : (
                    <Button variant="outline" asChild className="rounded-full">
                      <Link to="/?focusSearch=true">Explore more voices</Link>
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <div className="text-center py-12 space-y-4">
                <Users className="h-16 w-16 mx-auto text-muted-foreground/50" />
                <div className="space-y-2">
                  <h2 className="text-2xl font-semibold">Not following anyone yet</h2>
                  <p className="text-muted-foreground">
                    Start following people to see their voices here.
                  </p>
                </div>
                {isTutorialActive ? (
                  <Button 
                    variant="outline"
                    onClick={handleTutorialNavigation}
                  >
                    Explore voices
                  </Button>
                ) : (
                  <Button variant="outline" asChild>
                    <Link to="/?focusSearch=true">Explore voices</Link>
                  </Button>
                )}
              </div>
            )}
          </div>
        ) : clips.length === 0 ? (
          <div className="text-center py-12 space-y-4">
            <Users className="h-16 w-16 mx-auto text-muted-foreground/50" />
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold">No voices yet</h2>
              <p className="text-muted-foreground">
                People you follow haven&apos;t shared any voices recently.
              </p>
            </div>
            {isTutorialActive ? (
              <Button 
                variant="outline"
                onClick={handleTutorialNavigation}
              >
                Explore more voices
              </Button>
            ) : (
              <Button variant="outline" asChild>
                <Link to="/?focusSearch=true">Explore more voices</Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Header with Stats and Controls */}
            <div className="flex flex-col gap-4">
              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Following</p>
                        <p className="text-2xl font-bold">{followingIds.length}</p>
                      </div>
                      <Users className="h-8 w-8 text-primary/60" />
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Total Clips</p>
                        <p className="text-2xl font-bold">{clips.length}</p>
                      </div>
                      <Play className="h-8 w-8 text-green-500/60" />
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-pink-500/10 to-pink-500/5 border-pink-500/20">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Total Reactions</p>
                        <p className="text-2xl font-bold">
                          {clips.reduce((sum, clip) => sum + Object.values(clip.reactions || {}).reduce((a, b) => a + b, 0), 0)}
                        </p>
                      </div>
                      <Heart className="h-8 w-8 text-pink-500/60" />
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Total Listens</p>
                        <p className="text-2xl font-bold">
                          {clips.reduce((sum, clip) => sum + (clip.listens_count || 0), 0)}
                        </p>
                      </div>
                      <TrendingUp className="h-8 w-8 text-blue-500/60" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Search and Quick Actions */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search clips by title, caption, or creator..."
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
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant={showFilters ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShowFilters(!showFilters)}
                  >
                    <Filter className="h-4 w-4 mr-2" />
                    Filters
                  </Button>
                  <Button
                    variant={viewMode === "list" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setViewMode(viewMode === "list" ? "compact" : "list")}
                  >
                    {viewMode === "list" ? (
                      <>
                        <List className="h-4 w-4 mr-2" />
                        List
                      </>
                    ) : (
                      <>
                        <Grid3x3 className="h-4 w-4 mr-2" />
                        Compact
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Filter Panel */}
              {showFilters && (
                <Card className="border-primary/20">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">Filters</CardTitle>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setTimeFilter("all");
                          setMoodFilter("all");
                          setDurationFilter("all");
                        }}
                      >
                        Clear All
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          Time Period
                        </label>
                        <Select value={timeFilter} onValueChange={(value: any) => setTimeFilter(value)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Time</SelectItem>
                            <SelectItem value="today">Today</SelectItem>
                            <SelectItem value="week">This Week</SelectItem>
                            <SelectItem value="month">This Month</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium flex items-center gap-2">
                          <Sparkles className="h-4 w-4" />
                          Mood
                        </label>
                        <Select value={moodFilter} onValueChange={setMoodFilter}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Moods</SelectItem>
                            <SelectItem value="😊">😊 Happy</SelectItem>
                            <SelectItem value="🔥">🔥 Fire</SelectItem>
                            <SelectItem value="❤️">❤️ Love</SelectItem>
                            <SelectItem value="🙏">🙏 Grateful</SelectItem>
                            <SelectItem value="😔">😔 Sad</SelectItem>
                            <SelectItem value="😂">😂 Funny</SelectItem>
                            <SelectItem value="😮">😮 Surprised</SelectItem>
                            <SelectItem value="🧘">🧘 Calm</SelectItem>
                            <SelectItem value="💡">💡 Idea</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          Duration
                        </label>
                        <Select value={durationFilter} onValueChange={(value: any) => setDurationFilter(value)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Durations</SelectItem>
                            <SelectItem value="short">Short (0-15s)</SelectItem>
                            <SelectItem value="medium">Medium (16-30s)</SelectItem>
                            <SelectItem value="long">Long (30s+)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Sort Controls */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold">
                    {filteredAndSortedClips.length} {filteredAndSortedClips.length === 1 ? "voice" : "voices"} from people you follow
                  </h3>
                  {(searchQuery || timeFilter !== "all" || moodFilter !== "all" || durationFilter !== "all") && (
                    <Badge variant="secondary" className="text-xs">
                      Filtered
                    </Badge>
                  )}
                </div>
                <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">
                      <div className="flex items-center gap-2">
                        <SortDesc className="h-4 w-4" />
                        Newest First
                      </div>
                    </SelectItem>
                    <SelectItem value="oldest">
                      <div className="flex items-center gap-2">
                        <SortAsc className="h-4 w-4" />
                        Oldest First
                      </div>
                    </SelectItem>
                    <SelectItem value="most_reactions">
                      <div className="flex items-center gap-2">
                        <Heart className="h-4 w-4" />
                        Most Reactions
                      </div>
                    </SelectItem>
                    <SelectItem value="most_listens">
                      <div className="flex items-center gap-2">
                        <Play className="h-4 w-4" />
                        Most Listens
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Clips List */}
            <div className={cn(
              "space-y-4",
              viewMode === "compact" && "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
            )}>
              {filteredAndSortedClips.length === 0 ? (
                <Card className="p-12 text-center">
                  <div className="space-y-4">
                    <Search className="h-12 w-12 mx-auto text-muted-foreground/50" />
                    <div>
                      <h3 className="text-lg font-semibold">No clips found</h3>
                      <p className="text-sm text-muted-foreground mt-2">
                        Try adjusting your filters or search query
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSearchQuery("");
                        setTimeFilter("all");
                        setMoodFilter("all");
                        setDurationFilter("all");
                      }}
                    >
                      Clear Filters
                    </Button>
                  </div>
                </Card>
              ) : (
                filteredAndSortedClips.map((clip) => (
                  <div
                    key={clip.id}
                    className={cn(
                      viewMode === "compact" && "h-full"
                    )}
                  >
                    <ClipCard
                      clip={clip}
                      captionsDefault={profile?.default_captions ?? true}
                      showReplyButton={true}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>
      <BackToTop />
    </div>
      )}
    </AuthGuard>
  );
};

export default Following;

