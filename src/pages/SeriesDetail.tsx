import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Share2, UserPlus, UserMinus, Radio, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ClipCard } from "@/components/ClipCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useProfile } from "@/hooks/useProfile";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ShareClipDialog } from "@/components/ShareClipDialog";

interface Series {
  id: string;
  title: string;
  description: string | null;
  cover_image_url: string | null;
  category: string | null;
  episode_count: number;
  total_listens: number;
  follower_count: number;
  is_public: boolean;
  created_at: string;
  profiles: {
    id: string;
    handle: string;
    emoji_avatar: string;
  };
}

interface Episode {
  id: string;
  title: string | null;
  episode_number: number | null;
  duration_seconds: number;
  listens_count: number;
  created_at: string;
  profiles: {
    handle: string;
    emoji_avatar: string;
  } | null;
}

export default function SeriesDetail() {
  const { seriesId } = useParams<{ seriesId: string }>();
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { toast } = useToast();
  const [series, setSeries] = useState<Series | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isTogglingFollow, setIsTogglingFollow] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  useEffect(() => {
    if (seriesId) {
      loadSeries();
      checkFollowStatus();
    }
  }, [seriesId, profile?.id]);

  const loadSeries = async () => {
    if (!seriesId) return;

    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .rpc("get_series_with_episodes", {
          p_series_id: seriesId,
          p_profile_id: profile?.id || null,
        });

      if (error) throw error;

      if (data && data.length > 0) {
        const result = data[0];
        setSeries({
          id: seriesId,
          ...result.series_data,
          profiles: result.series_data.profiles || { id: "", handle: "", emoji_avatar: "" },
        });
        setEpisodes(result.episodes || []);
        setIsFollowing(result.series_data.is_following || false);
      }
    } catch (error: any) {
      console.error("Error loading series:", error);
      toast({
        title: "Error",
        description: "Failed to load series",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const checkFollowStatus = async () => {
    if (!seriesId || !profile?.id) return;

    try {
      const { data, error } = await supabase
        .from("series_follows")
        .select("profile_id")
        .eq("series_id", seriesId)
        .eq("profile_id", profile.id)
        .single();

      if (error && error.code !== "PGRST116") {
        throw error;
      }

      setIsFollowing(!!data);
    } catch (error) {
      console.error("Error checking follow status:", error);
    }
  };

  const handleToggleFollow = async () => {
    if (!seriesId || !profile?.id) {
      toast({
        title: "Please log in",
        description: "You need to be logged in to follow series",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsTogglingFollow(true);
      if (isFollowing) {
        const { error } = await supabase
          .from("series_follows")
          .delete()
          .eq("series_id", seriesId)
          .eq("profile_id", profile.id);

        if (error) throw error;
        setIsFollowing(false);
        toast({
          title: "Unfollowed",
          description: `You're no longer following "${series?.title}"`,
        });
      } else {
        const { error } = await supabase
          .from("series_follows")
          .insert({
            series_id: seriesId,
            profile_id: profile.id,
          });

        if (error) throw error;
        setIsFollowing(true);
        toast({
          title: "Following",
          description: `You're now following "${series?.title}"`,
        });
      }
    } catch (error: any) {
      console.error("Error toggling follow:", error);
      toast({
        title: "Error",
        description: "Failed to update follow status",
        variant: "destructive",
      });
    } finally {
      setIsTogglingFollow(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <Skeleton className="h-8 w-64 mb-4" />
          <Skeleton className="h-64 w-full rounded-3xl mb-6" />
          <Skeleton className="h-32 w-full rounded-3xl" />
        </div>
      </div>
    );
  }

  if (!series) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4 rounded-2xl">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <Card className="rounded-3xl p-8 text-center">
            <h2 className="text-xl font-semibold mb-2">Series not found</h2>
            <p className="text-muted-foreground mb-4">
              This series doesn't exist or has been removed.
            </p>
            <Button onClick={() => navigate("/series")} className="rounded-2xl">
              Browse Series
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  const isOwner = profile?.id === series.profiles.id;

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <Button
          variant="ghost"
          onClick={() => navigate(-1)}
          className="mb-4 rounded-2xl"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        <Card className="rounded-3xl overflow-hidden mb-6">
          <div className="relative">
            {series.cover_image_url ? (
              <img
                src={series.cover_image_url}
                alt={series.title}
                className="w-full h-64 object-cover"
              />
            ) : (
              <div className="w-full h-64 bg-muted flex items-center justify-center">
                <Radio className="h-24 w-24 text-muted-foreground opacity-50" />
              </div>
            )}
            <div className="absolute top-4 right-4 flex gap-2">
              <Button
                variant="secondary"
                size="icon"
                onClick={() => setShareDialogOpen(true)}
                className="rounded-full bg-background/80 backdrop-blur-sm"
              >
                <Share2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <CardTitle className="text-2xl mb-2">{series.title}</CardTitle>
                <CardDescription className="flex items-center gap-2 mb-4">
                  <span>{series.profiles.emoji_avatar}</span>
                  <Link
                    to={`/profile/${series.profiles.handle}`}
                    className="hover:underline"
                  >
                    {series.profiles.handle}
                  </Link>
                </CardDescription>
                {series.category && (
                  <Badge variant="secondary" className="rounded-full mb-4">
                    {series.category}
                  </Badge>
                )}
                {series.description && (
                  <p className="text-sm text-muted-foreground mb-4">{series.description}</p>
                )}
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{series.episode_count} episodes</span>
                  <span>{series.total_listens.toLocaleString()} listens</span>
                  <span>{series.follower_count} followers</span>
                </div>
              </div>
              {!isOwner && (
                <Button
                  onClick={handleToggleFollow}
                  disabled={isTogglingFollow}
                  variant={isFollowing ? "outline" : "default"}
                  className="rounded-2xl"
                >
                  {isFollowing ? (
                    <>
                      <UserMinus className="mr-2 h-4 w-4" />
                      Unfollow
                    </>
                  ) : (
                    <>
                      <UserPlus className="mr-2 h-4 w-4" />
                      Follow
                    </>
                  )}
                </Button>
              )}
            </div>
          </CardHeader>
        </Card>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Episodes</h2>
            {isOwner && (
              <Button
                onClick={() => navigate("/", { state: { seriesId: series.id } })}
                className="rounded-2xl"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Episode
              </Button>
            )}
          </div>

          {episodes.length === 0 ? (
            <Card className="rounded-3xl p-8 text-center">
              <Radio className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-semibold mb-2">No episodes yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {isOwner
                  ? "Start adding episodes to your series!"
                  : "This series doesn't have any episodes yet."}
              </p>
              {isOwner && (
                <Button
                  onClick={() => navigate("/", { state: { seriesId: series.id } })}
                  className="rounded-2xl"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add First Episode
                </Button>
              )}
            </Card>
          ) : (
            <div className="space-y-4">
              {episodes.map((episode) => (
                <div key={episode.id}>
                  <ClipCard
                    clip={{
                      id: episode.id,
                      profile_id: episode.profiles?.handle || null,
                      audio_path: "",
                      mood_emoji: "🎙️",
                      duration_seconds: episode.duration_seconds,
                      captions: null,
                      summary: episode.title,
                      status: "live",
                      reactions: {},
                      created_at: episode.created_at,
                      listens_count: episode.listens_count,
                      city: null,
                      topic_id: null,
                      title: episode.title,
                      tags: null,
                      profiles: episode.profiles,
                      episode_number: episode.episode_number,
                      series_id: series.id,
                    }}
                    captionsDefault={false}
                    showReplyButton={false}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {shareDialogOpen && (
        <ShareClipDialog
          clipId={seriesId || ""}
          clipTitle={series.title}
          clipSummary={series.description}
          profileHandle={series.profiles.handle}
          open={shareDialogOpen}
          onOpenChange={setShareDialogOpen}
        />
      )}
    </div>
  );
}

