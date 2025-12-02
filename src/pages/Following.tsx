import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ClipCard } from "@/components/ClipCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/AuthContext";
import { useFollowing } from "@/hooks/useFollow";
import { useToast } from "@/hooks/use-toast";
import { BackToTop } from "@/components/BackToTop";
import { AuthGuard } from "@/components/AuthGuard";
import { logError } from "@/lib/logger";

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

const Following = () => {
  const { profile } = useAuth();
  const { following, isLoading: isLoadingFollowing } = useFollowing();
  const [clips, setClips] = useState<Clip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const followingIds = useMemo(() => {
    return following.map((f) => f.id);
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
          const { data: repliesData } = await supabase
            .from("clips")
            .select("parent_clip_id")
            .in("parent_clip_id", clipIds);

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
      loadFollowingClips();
    }
  }, [profile?.id, followingIds, isLoadingFollowing, toast]);

  // Subscribe to new clips from followed users
  useEffect(() => {
    if (followingIds.length === 0 || !profile?.id) return;

    const channel = supabase
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
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [followingIds, profile?.id]);

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
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
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

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-8">
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
          <div className="text-center py-12 space-y-4">
            <Users className="h-16 w-16 mx-auto text-muted-foreground/50" />
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold">Not following anyone yet</h2>
              <p className="text-muted-foreground">
                Start following people to see their voices here.
              </p>
            </div>
            <Button variant="outline" asChild>
              <Link to="/?focusSearch=true">Explore voices</Link>
            </Button>
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
            <Button variant="outline" asChild>
              <Link to="/?focusSearch=true">Explore more voices</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">
                {clips.length} {clips.length === 1 ? "voice" : "voices"} from people you follow
              </h3>
            </div>

            <div className="space-y-4">
              {clips.map((clip) => (
                <ClipCard
                  key={clip.id}
                  clip={clip}
                  captionsDefault={profile?.default_captions ?? true}
                  showReplyButton={true}
                />
              ))}
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

