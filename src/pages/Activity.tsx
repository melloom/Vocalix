import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Activity, Mic, Heart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ClipCard } from "@/components/ClipCard";
import { Button } from "@/components/ui/button";
import { ActivityFeedSkeleton, PageHeaderSkeleton } from "@/components/ui/content-skeletons";
import { useProfile } from "@/hooks/useProfile";
import { useFollowing } from "@/hooks/useFollow";
import { useToast } from "@/hooks/use-toast";

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

interface ActivityItem {
  id: string;
  type: "new_clip" | "reaction";
  clip: Clip;
  profile: {
    handle: string;
    emoji_avatar: string;
  };
  timestamp: string;
  reactionEmoji?: string;
}

const Activity = () => {
  const { profile, isLoading: isProfileLoading } = useProfile();
  const { following, isLoading: isLoadingFollowing } = useFollowing();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const followingIds = useMemo(() => {
    try {
      if (!following || !Array.isArray(following)) return [];
      return following.map((f) => f?.id).filter((id): id is string => Boolean(id));
    } catch (error) {
      console.error("Error processing following list:", error);
      return [];
    }
  }, [following]);

  useEffect(() => {
    let isMounted = true;

    const loadActivity = async () => {
      try {
        // If no profile, just set loading to false
        if (!profile?.id) {
          if (isMounted) {
            setActivities([]);
            setIsLoading(false);
          }
          return;
        }

        if (isMounted) {
          setIsLoading(true);
        }

        // If user is not following anyone, return empty
        if (!followingIds || followingIds.length === 0) {
          if (isMounted) {
            setActivities([]);
            setIsLoading(false);
          }
          return;
        }

        // Get recent clips from followed users (last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

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
          .gte("created_at", sevenDaysAgo.toISOString())
          .order("created_at", { ascending: false })
          .limit(50);

        if (clipsError) {
          // Silently handle 403 errors (RLS issues)
          if (clipsError.code === 403 || clipsError.code === "403" || clipsError.code === "PGRST301") {
            console.warn("Access denied loading activity (RLS):", clipsError);
            if (isMounted) {
              setActivities([]);
              setIsLoading(false);
            }
            return;
          }
          throw clipsError;
        }

        if (!isMounted) return;

        // Transform clips into activity items
        const activityItems: ActivityItem[] = (clipsData || []).map((clip: any) => ({
          id: `clip-${clip.id}`,
          type: "new_clip" as const,
          clip: clip as Clip,
          profile: clip.profiles || { handle: "Unknown", emoji_avatar: "🎧" },
          timestamp: clip.created_at,
        }));

        // Sort by timestamp (most recent first)
        activityItems.sort((a, b) => 
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );

        if (isMounted) {
          setActivities(activityItems);
        }
      } catch (error) {
        console.error("Error loading activity:", error);
        if (isMounted) {
          setActivities([]);
          toast({
            title: "Couldn't load activity",
            description: "Please try again later.",
            variant: "destructive",
          });
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    // Wait for both profile and following to finish loading
    if (!isProfileLoading && !isLoadingFollowing) {
      loadActivity();
    } else {
      // Still loading - ensure loading state is set
      setIsLoading(true);
    }

    return () => {
      isMounted = false;
    };
  }, [profile?.id, followingIds.length, isLoadingFollowing, isProfileLoading, toast]);

  // Subscribe to new clips from followed users
  useEffect(() => {
    if (!followingIds || followingIds.length === 0 || !profile?.id) return;

    let channel: ReturnType<typeof supabase.channel> | null = null;
    let isMounted = true;
    const followingIdsSet = new Set(followingIds);

    try {
      const channelName = `activity-clips-${profile.id}-${Date.now()}`;
      channel = supabase.channel(channelName);

      // Subscribe to all clip inserts and filter client-side
      // (Supabase realtime doesn't support `in.()` filters)
      channel = channel
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "clips",
          },
          async (payload) => {
            if (!isMounted) return;
            try {
              const newClip = payload.new as any;
              // Filter client-side to only include followed users
              if (!followingIdsSet.has(newClip.profile_id)) return;
              if (newClip.parent_clip_id) return; // Skip replies

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
                .eq("id", newClip.id)
                .single();

              if (!error && data && !data.parent_clip_id && isMounted) {
                const newActivity: ActivityItem = {
                  id: `clip-${data.id}`,
                  type: "new_clip",
                  clip: data as Clip,
                  profile: data.profiles || { handle: "Unknown", emoji_avatar: "🎧" },
                  timestamp: data.created_at,
                };

                setActivities((prev) => {
                  const exists = prev.some((item) => item.id === newActivity.id);
                  if (exists) {
                    return prev.map((item) => 
                      item.id === newActivity.id ? newActivity : item
                    );
                  }
                  return [newActivity, ...prev].sort((a, b) => 
                    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                  );
                });
              }
            } catch (error) {
              console.error("Error handling new activity:", error);
            }
          },
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "clips",
          },
          async (payload) => {
            if (!isMounted) return;
            try {
              const updatedClip = payload.new as any;
              // Only update if it's from a followed user
              if (!followingIdsSet.has(updatedClip.profile_id)) return;

              // Update clip data if reactions changed
              setActivities((prev) =>
                prev.map((item) =>
                  item.clip.id === updatedClip.id
                    ? {
                        ...item,
                        clip: {
                          ...item.clip,
                          ...updatedClip,
                          profiles: item.clip.profiles,
                        } as Clip,
                      }
                    : item
                )
              );
            } catch (error) {
              console.error("Error handling activity update:", error);
            }
          },
        );

      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("Subscribed to activity updates");
        } else if (status === "CHANNEL_ERROR") {
          console.error("Error subscribing to activity updates");
        }
      });
    } catch (error) {
      console.error("Error setting up activity subscription:", error);
    }

    return () => {
      isMounted = false;
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch (error) {
          console.error("Error removing activity channel:", error);
        }
      }
    };
  }, [followingIds, profile?.id]);

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffMs = now.getTime() - time.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return time.toLocaleDateString();
  };

  // Show loading state while checking profile
  if (isProfileLoading) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border">
          <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild className="rounded-full">
              <Link to="/">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              <h1 className="text-2xl font-bold">Activity</h1>
            </div>
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-6 space-y-8">
          <ActivityFeedSkeleton count={3} />
        </main>
      </div>
    );
  }

  // If no profile, show message to start following people (not "sign in")
  if (!profile) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border">
          <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild className="rounded-full">
              <Link to="/">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              <h1 className="text-2xl font-bold">Activity</h1>
            </div>
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-6 space-y-8">
          <div className="text-center py-12 space-y-4">
            <Activity className="h-16 w-16 mx-auto text-muted-foreground/50" />
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold">No activity yet</h2>
              <p className="text-muted-foreground">
                Start following people to see their activity here.
              </p>
            </div>
            <Button variant="outline" asChild>
              <Link to="/">Explore voices</Link>
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild className="rounded-full">
            <Link to="/">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            <h1 className="text-2xl font-bold">Activity</h1>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-8">
        {(isLoadingFollowing || isLoading || isProfileLoading) ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={`activity-skeleton-${index}`}
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
          <div className="text-center py-12 space-y-4">
            <Activity className="h-16 w-16 mx-auto text-muted-foreground/50" />
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold">No activity yet</h2>
              <p className="text-muted-foreground">
                Start following people to see their activity here.
              </p>
            </div>
            <Button variant="outline" asChild>
              <Link to="/">Explore voices</Link>
            </Button>
          </div>
        ) : activities.length === 0 ? (
          <div className="text-center py-12 space-y-4">
            <Activity className="h-16 w-16 mx-auto text-muted-foreground/50" />
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold">No recent activity</h2>
              <p className="text-muted-foreground">
                People you follow haven&apos;t been active recently.
              </p>
            </div>
            <Button variant="outline" asChild>
              <Link to="/">Explore more voices</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">
                Recent activity from people you follow
              </h3>
            </div>

            <div className="space-y-4">
              {activities.map((activity) => {
                if (!activity || !activity.clip || !activity.profile) return null;
                return (
                  <div key={activity.id} className="space-y-2">
                    <Card className="p-3 rounded-2xl bg-muted/30">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        {activity.type === "new_clip" ? (
                          <Mic className="h-4 w-4" />
                        ) : (
                          <Heart className="h-4 w-4" />
                        )}
                        <Link
                          to={`/profile/${activity.profile.handle || "unknown"}`}
                          className="font-medium hover:underline"
                        >
                          {activity.profile.emoji_avatar || "🎧"} {activity.profile.handle || "Unknown"}
                        </Link>
                        <span>
                          {activity.type === "new_clip" ? "shared a voice" : "reacted to a voice"}
                        </span>
                        <span className="text-xs">• {formatTimeAgo(activity.timestamp)}</span>
                      </div>
                    </Card>
                    <ClipCard
                      clip={activity.clip}
                      captionsDefault={profile?.default_captions ?? true}
                      showReplyButton={true}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Activity;

