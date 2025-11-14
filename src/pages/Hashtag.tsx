import { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClipCard } from "@/components/ClipCard";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { usePagination } from "@/hooks/usePagination";
import { ErrorDisplay } from "@/components/ErrorDisplay";
import { PaginationControls } from "@/components/PaginationControls";

type ModerationData = {
  risk?: number;
  decision?: string;
  status?: string;
  [key: string]: unknown;
};

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
  waveform?: number[];
  city: string | null;
  completion_rate?: number | null;
  topic_id: string | null;
  moderation?: ModerationData | null;
  content_rating?: "general" | "sensitive";
  title: string | null;
  tags: string[] | null;
  parent_clip_id?: string | null;
  reply_count?: number;
  remix_of_clip_id?: string | null;
  remix_count?: number;
  chain_id?: string | null;
  challenge_id?: string | null;
  profiles: {
    handle: string;
    emoji_avatar: string;
  } | null;
}

const Hashtag = () => {
  const { tagName } = useParams<{ tagName: string }>();
  const [clips, setClips] = useState<Clip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [sortMode, setSortMode] = useState<"recent" | "popular">("recent");
  const { toast } = useToast();

  const decodedTag = tagName ? decodeURIComponent(tagName) : "";

  useEffect(() => {
    if (!decodedTag) return;

    const loadClips = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from("clips")
          .select(`
            *,
            profiles (
              handle,
              emoji_avatar
            )
          `)
          .in("status", ["live", "processing"])
          .contains("tags", [decodedTag])
          .limit(100);

        if (error) {
          throw error;
        }

        // Filter out blocked/rejected clips
        const validClips = (data || []).filter((clip: any) => {
          const moderationData = clip.moderation ?? null;
          const moderationDecision =
            typeof moderationData?.decision === "string"
              ? moderationData.decision
              : typeof moderationData?.status === "string"
                ? moderationData.status
                : null;
          return moderationDecision !== "blocked" && moderationDecision !== "reject";
        });

        // Calculate reply counts (limited to avoid performance issues)
        const clipIds = validClips.map((clip: any) => clip.id);
        const { data: allClipsData } = await supabase
          .from("clips")
          .select("id, parent_clip_id")
          .in("status", ["live", "processing"])
          .in("parent_clip_id", clipIds.length > 0 ? clipIds : [null]) // Only get replies for displayed clips
          .limit(500); // Reduced limit for better performance

        const replyCounts: Record<string, number> = {};
        const remixCounts: Record<string, number> = {};
        if (allClipsData) {
          allClipsData.forEach((clip: any) => {
            if (clip.parent_clip_id) {
              replyCounts[clip.parent_clip_id] = (replyCounts[clip.parent_clip_id] || 0) + 1;
            }
          });
        }

        const clipsWithCounts = validClips
          .filter((clip: any) => !clip.parent_clip_id) // Only top-level clips
          .map((clip: any) => ({
            ...clip,
            reply_count: replyCounts[clip.id] || 0,
            remix_count: remixCounts[clip.id] || 0,
          }));

        setClips(clipsWithCounts as Clip[]);
        setError(null);
        setRetryCount(0);
      } catch (error: any) {
        const errorMessage = error?.message || "Couldn't load clips";
        setError(errorMessage);
        console.error("Error loading clips:", error);
        toast({
          title: "Couldn't load clips",
          description: errorMessage,
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadClips();
  }, [decodedTag, toast, retryCount]);

  const handleRetry = () => {
    setRetryCount((prev) => prev + 1);
  };

  const sortedClips = useMemo(() => {
    if (sortMode === "recent") {
      return [...clips].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    } else {
      // Popular: sort by listens + reactions
      return [...clips].sort((a, b) => {
        const aReactions = Object.values(a.reactions || {}).reduce(
          (sum, count) => sum + (typeof count === "number" ? count : Number(count) || 0),
          0
        );
        const bReactions = Object.values(b.reactions || {}).reduce(
          (sum, count) => sum + (typeof count === "number" ? count : Number(count) || 0),
          0
        );
        const aScore = (a.listens_count || 0) + aReactions * 2;
        const bScore = (b.listens_count || 0) + bReactions * 2;
        return bScore - aScore;
      });
    }
  }, [clips, sortMode]);

  const {
    paginatedData: paginatedClips,
    currentPage,
    totalPages,
    goToPage,
  } = usePagination(sortedClips, { pageSize: 20 });

  if (!decodedTag) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-xl text-muted-foreground">Invalid tag</p>
          <Button asChild>
            <Link to="/">Go home</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link to="/">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div className="flex items-center gap-2">
              <Hash className="h-5 w-5 text-muted-foreground" />
              <h1 className="text-2xl font-bold">{decodedTag}</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="rounded-full">
              {clips.length} {clips.length === 1 ? "clip" : "clips"}
            </Badge>
          </div>
          <div className="flex bg-muted/60 rounded-full p-1">
            <Button
              size="sm"
              className="rounded-full px-4"
              variant={sortMode === "recent" ? "default" : "ghost"}
              onClick={() => setSortMode("recent")}
            >
              Recent
            </Button>
            <Button
              size="sm"
              className="rounded-full px-4"
              variant={sortMode === "popular" ? "default" : "ghost"}
              onClick={() => setSortMode("popular")}
            >
              Popular
            </Button>
          </div>
        </div>

        {isLoading ? (
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
        ) : error ? (
          <ErrorDisplay
            title="Failed to load clips"
            message={error}
            onRetry={handleRetry}
            variant="card"
          />
        ) : sortedClips.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <p className="text-xl text-muted-foreground">No clips found with this tag</p>
            <p className="text-sm text-muted-foreground/80">
              Be the first to create a clip with #{decodedTag}
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {paginatedClips.map((clip) => (
                <ClipCard key={clip.id} clip={clip} showReplyButton={true} />
              ))}
            </div>
            {totalPages > 1 && (
              <div className="mt-6">
                <PaginationControls
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={goToPage}
                />
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default Hashtag;

