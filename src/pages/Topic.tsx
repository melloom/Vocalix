import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Calendar, Users, Bell, BellOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ClipCard } from "@/components/ClipCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useProfile } from "@/hooks/useProfile";
import { format } from "date-fns";
import { toast } from "sonner";
import { usePagination } from "@/hooks/usePagination";
import { ErrorDisplay } from "@/components/ErrorDisplay";
import { PaginationControls } from "@/components/PaginationControls";

interface Topic {
  id: string;
  title: string;
  date: string;
  description: string | null;
  is_active: boolean | null;
}

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
}

const Topic = () => {
  const { topicId } = useParams<{ topicId: string }>();
  const navigate = useNavigate();
  const [topic, setTopic] = useState<Topic | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscriberCount, setSubscriberCount] = useState(0);
  const { profile: viewerProfile } = useProfile();

  useEffect(() => {
    const loadTopic = async () => {
      if (!topicId) return;
      setIsLoading(true);
      setError(null);

      // Load topic
      const { data: topicData, error: topicError } = await supabase
        .from("topics")
        .select("*")
        .eq("id", topicId)
        .single();

      if (topicError || !topicData) {
        setError("Topic not found");
        setIsLoading(false);
        return;
      }

      setTopic(topicData as Topic);

      // Load clips for this topic
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
        .eq("topic_id", topicId)
        .in("status", ["live", "processing"])
        .order("created_at", { ascending: false })
        .limit(100);

      if (clipsError) {
        setError(clipsError.message || "Couldn't load clips");
      } else {
        setClips((clipsData as Clip[]) || []);
        setError(null);
        setRetryCount(0);
      }

      // Check subscription status
      if (viewerProfile?.id) {
        const { data: subscriptionData } = await supabase
          .from("topic_subscriptions")
          .select("id")
          .eq("profile_id", viewerProfile.id)
          .eq("topic_id", topicId)
          .maybeSingle();

        setIsSubscribed(!!subscriptionData);
      }

      // Get subscriber count
      const { count } = await supabase
        .from("topic_subscriptions")
        .select("*", { count: "exact", head: true })
        .eq("topic_id", topicId);

      setSubscriberCount(count || 0);

      setIsLoading(false);
    };

    loadTopic();
  }, [topicId, viewerProfile?.id, retryCount]);

  const handleRetry = () => {
    setRetryCount((prev) => prev + 1);
  };

  const {
    paginatedData: paginatedClips,
    currentPage,
    totalPages,
    goToPage,
  } = usePagination(clips, { pageSize: 20 });

  const handleSubscribe = async () => {
    if (!viewerProfile?.id || !topicId) {
      toast.error("Please log in to subscribe to topics");
      return;
    }

    if (isSubscribed) {
      // Unsubscribe
      const { error } = await supabase
        .from("topic_subscriptions")
        .delete()
        .eq("profile_id", viewerProfile.id)
        .eq("topic_id", topicId);

      if (error) {
        toast.error("Failed to unsubscribe");
      } else {
        setIsSubscribed(false);
        setSubscriberCount((prev) => Math.max(0, prev - 1));
        toast.success("Unsubscribed from topic");
      }
    } else {
      // Subscribe
      const { error } = await supabase
        .from("topic_subscriptions")
        .insert({
          profile_id: viewerProfile.id,
          topic_id: topicId,
        });

      if (error) {
        toast.error("Failed to subscribe");
      } else {
        setIsSubscribed(true);
        setSubscriberCount((prev) => prev + 1);
        toast.success("Subscribed to topic");
      }
    }
  };

  if (!topicId) {
    return <div className="p-8 text-center text-muted-foreground">Topic ID missing.</div>;
  }

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading topic...</div>;
  }

  if (error || !topic) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border">
          <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild className="rounded-full">
              <Link to="/">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <h1 className="text-2xl font-bold">Topic</h1>
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-6">
          <ErrorDisplay
            title={error ? "Failed to load topic" : "Topic not found"}
            message={error ?? "The topic you're looking for doesn't exist."}
            onRetry={error ? handleRetry : undefined}
            variant="card"
          />
        </main>
      </div>
    );
  }

  const totalListens = clips.reduce((sum, clip) => sum + (clip.listens_count || 0), 0);
  const totalReactions = clips.reduce((sum, clip) => {
    const reactions = clip.reactions || {};
    return sum + Object.values(reactions).reduce((emojiSum, count) => {
      const numeric = typeof count === "number" ? count : Number(count);
      return emojiSum + (Number.isFinite(numeric) ? numeric : 0);
    }, 0);
  }, 0);

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild className="rounded-full">
            <Link to="/">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">Topic</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Topic Header */}
        <Card className="p-6 rounded-3xl space-y-4">
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <h2 className="text-3xl font-bold">{topic.title}</h2>
                {topic.description && (
                  <p className="text-muted-foreground mt-2">{topic.description}</p>
                )}
              </div>
              {viewerProfile && (
                <Button
                  variant={isSubscribed ? "default" : "outline"}
                  size="sm"
                  onClick={handleSubscribe}
                  className="flex items-center gap-2"
                >
                  {isSubscribed ? (
                    <>
                      <BellOff className="h-4 w-4" />
                      Unsubscribe
                    </>
                  ) : (
                    <>
                      <Bell className="h-4 w-4" />
                      Subscribe
                    </>
                  )}
                </Button>
              )}
            </div>

            <div className="flex items-center gap-4 text-sm text-muted-foreground pt-2">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                <span>{format(new Date(topic.date), "MMM d, yyyy")}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Users className="w-4 h-4" />
                <span>{clips.length} {clips.length === 1 ? "voice" : "voices"}</span>
              </div>
              {subscriberCount > 0 && (
                <Badge variant="secondary">
                  {subscriberCount} {subscriberCount === 1 ? "subscriber" : "subscribers"}
                </Badge>
              )}
            </div>
          </div>

          {/* Topic Stats */}
          <div className="grid grid-cols-2 gap-3 pt-4 border-t">
            <div className="text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Listens</p>
              <p className="text-2xl font-semibold">{totalListens.toLocaleString()}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Reactions</p>
              <p className="text-2xl font-semibold">{totalReactions.toLocaleString()}</p>
            </div>
          </div>
        </Card>

        {/* Clips Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">All Clips</h3>
            <p className="text-sm text-muted-foreground">{clips.length} {clips.length === 1 ? "clip" : "clips"}</p>
          </div>

          {clips.length === 0 ? (
            <Card className="p-6 rounded-3xl bg-muted text-center text-muted-foreground">
              No clips yet for this topic. Be the first to share your voice!
            </Card>
          ) : (
            <>
              <div className="space-y-4">
                {paginatedClips.map((clip) => (
                  <ClipCard
                    key={clip.id}
                    clip={clip}
                    captionsDefault={viewerProfile?.default_captions ?? true}
                  />
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
        </section>
      </main>
    </div>
  );
};

export default Topic;

