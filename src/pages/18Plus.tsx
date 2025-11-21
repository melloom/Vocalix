import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ClipCard } from "@/components/ClipCard";
import { PostCard } from "@/components/PostCard";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { ClipListSkeleton } from "@/components/ui/clip-skeleton";

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
  profiles: {
    handle: string;
    emoji_avatar: string;
  } | null;
}

const EighteenPlus = () => {
  const { profile, profileId } = useAuth();
  const { toast } = useToast();
  const [clips, setClips] = useState<Clip[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [displayedCount, setDisplayedCount] = useState(20);

  // Check if user has 18+ content enabled
  // @ts-ignore - show_18_plus_content exists but not in generated types
  const hasAccess = profile?.show_18_plus_content ?? false;

  const loadContent = useCallback(async () => {
    if (!hasAccess) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      // Load NSFW clips (content_rating = 'sensitive')
      const { data: clipsData, error: clipsError } = await supabase
        .from("clips")
        .select(`
          *,
          profiles (
            handle,
            emoji_avatar
          )
        `)
        .eq("status", "live")
        .eq("content_rating", "sensitive")
        .order("created_at", { ascending: false })
        .limit(100);

      if (clipsError) throw clipsError;

      // Load NSFW posts (is_nsfw = true)
      const { data: postsData, error: postsError } = await supabase
        .from("posts")
        .select(`
          *,
          profiles (
            handle,
            emoji_avatar
          ),
          communities (
            name,
            slug
          ),
          clip_flairs (
            id,
            name,
            color,
            background_color
          )
        `)
        .eq("status", "live")
        .eq("visibility", "public")
        .eq("is_nsfw", true)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(50);

      if (postsError) throw postsError;

      setClips((clipsData || []) as Clip[]);
      setPosts(postsData || []);
    } catch (error) {
      console.error("Error loading 18+ content:", error);
      toast({
        title: "Couldn't load content",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [hasAccess, toast]);

  useEffect(() => {
    loadContent();
  }, [loadContent]);

  const loadMore = useCallback(() => {
    setDisplayedCount((prev) => Math.min(prev + 20, clips.length));
  }, [clips.length]);

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border">
          <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild className="rounded-full">
              <Link to="/">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <h1 className="text-2xl font-bold">18+ Content</h1>
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-6">
          <Card className="p-6 rounded-3xl space-y-4 text-center">
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

  const displayedClips = clips.slice(0, displayedCount);
  const hasMore = clips.length > displayedCount;

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild className="rounded-full">
            <Link to="/">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">18+ Content</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <Card className="p-4 rounded-2xl bg-yellow-500/10 border-yellow-500/20">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100">
                Adult Content Warning
              </p>
              <p className="text-xs text-yellow-800 dark:text-yellow-200 mt-1">
                This section contains NSFW content intended for mature audiences only.
              </p>
            </div>
          </div>
        </Card>

        {isLoading ? (
          <ClipListSkeleton count={5} />
        ) : (
          <>
            {posts.length > 0 && (
              <section className="space-y-4">
                <h2 className="text-lg font-semibold">NSFW Posts</h2>
                <div className="space-y-4">
                  {posts.map((post) => (
                    <PostCard key={post.id} post={post} onPostUpdate={loadContent} />
                  ))}
                </div>
              </section>
            )}

            {clips.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">NSFW Clips</h2>
                  <span className="text-xs text-muted-foreground">
                    {clips.length} {clips.length === 1 ? "clip" : "clips"}
                  </span>
                </div>
                <div className="space-y-4">
                  {displayedClips.map((clip) => (
                    <ClipCard key={clip.id} clip={clip} showReplyButton={true} viewMode="list" />
                  ))}
                </div>
                {hasMore && (
                  <Button
                    variant="outline"
                    onClick={loadMore}
                    className="w-full rounded-2xl"
                  >
                    Load More ({clips.length - displayedCount} remaining)
                  </Button>
                )}
              </section>
            )}

            {clips.length === 0 && posts.length === 0 && (
              <Card className="p-6 rounded-3xl text-center space-y-3">
                <p className="text-muted-foreground">No 18+ content available yet.</p>
                <p className="text-sm text-muted-foreground">
                  Check back later for NSFW clips and posts.
                </p>
              </Card>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default EighteenPlus;

