import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Bookmark, Music, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ClipCard } from "@/components/ClipCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useProfile } from "@/hooks/useProfile";
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
  waveform?: number[];
  topic_id: string | null;
  moderation?: Record<string, unknown> | null;
  content_rating?: "general" | "sensitive";
  title: string | null;
  tags: string[] | null;
  profiles: {
    handle: string;
    emoji_avatar: string;
  } | null;
}

const SavedClips = () => {
  const { profile, isLoading: isProfileLoading } = useProfile();
  const [clips, setClips] = useState<Clip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const loadSavedClips = async () => {
      if (!profile?.id) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const { data: savedClipsData, error: savedError } = await supabase
          .from("saved_clips")
          .select(
            `
            clip_id,
            created_at,
            clips (
              *,
              profiles (
                handle,
                emoji_avatar
              )
            )
          `,
          )
          .eq("profile_id", profile.id)
          .order("created_at", { ascending: false });

        if (savedError) {
          setError("Couldn't load saved clips");
          console.error("Error loading saved clips:", savedError);
        } else {
          // Transform the data to match the Clip interface
          const transformedClips = (savedClipsData || [])
            .map((saved: any) => {
              // Handle both array and object responses from Supabase
              const clip = Array.isArray(saved.clips) ? saved.clips[0] : saved.clips;
              return clip as Clip | null;
            })
            .filter((clip): clip is Clip => clip !== null && clip !== undefined && clip.status === "live"); // Only show live clips

          setClips(transformedClips);
        }
      } catch (err) {
        setError("Couldn't load saved clips");
        console.error("Error loading saved clips:", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadSavedClips();
  }, [profile?.id]);

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
            <h1 className="text-2xl font-bold">Saved Clips</h1>
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-6 space-y-8">
          <Card className="p-6 rounded-3xl space-y-4">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-2/3" />
          </Card>
        </main>
      </div>
    );
  }

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
            <h1 className="text-2xl font-bold">Saved Clips</h1>
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-6">
          <Card className="p-6 rounded-3xl space-y-3 text-center text-muted-foreground">
            <p>Please sign in to view your saved clips.</p>
            <Button variant="outline" className="rounded-2xl mt-4" asChild>
              <Link to="/">Back to home</Link>
            </Button>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild className="rounded-full">
              <Link to="/">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <h1 className="text-2xl font-bold">Saved Clips</h1>
          </div>
          <Button variant="outline" size="sm" asChild className="rounded-2xl">
            <Link to="/playlists">
              <Music className="h-4 w-4 mr-2" />
              Playlists
            </Link>
          </Button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-8">
        <section className="space-y-4 text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="text-6xl">
              <Bookmark className="h-16 w-16 mx-auto text-primary" />
            </div>
            <div>
              <h2 className="text-3xl font-bold">Your Collection</h2>
              <p className="text-sm text-muted-foreground">Clips you've saved to listen later</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Card className="p-4 rounded-3xl text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Saved</p>
              <p className="text-2xl font-semibold">{clips.length}</p>
            </Card>
            <Button
              variant="outline"
              className="h-auto p-4 rounded-3xl flex flex-col items-center justify-center gap-2"
              asChild
            >
              <Link to="/playlists">
                <Music className="h-6 w-6" />
                <span className="text-xs font-medium">Manage Playlists</span>
              </Link>
            </Button>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Saved Clips</h3>
            <p className="text-sm text-muted-foreground">{clips.length} total</p>
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
                    <Skeleton className="h-8 w-8 rounded-full" />
                  </div>
                  <Skeleton className="h-16 w-full rounded-2xl" />
                  <div className="flex gap-2">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <Skeleton className="h-2 flex-1 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="p-6 rounded-3xl bg-muted text-center text-muted-foreground">
              {error}
            </div>
          ) : clips.length === 0 ? (
            <div className="p-6 rounded-3xl bg-muted text-center text-muted-foreground space-y-3">
              <Bookmark className="h-12 w-12 mx-auto opacity-50" />
              <p>No saved clips yet.</p>
              <p className="text-sm">Save clips you want to listen to later!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {clips.map((clip) => (
                <ClipCard
                  key={clip.id}
                  clip={clip}
                  captionsDefault={profile.default_captions ?? true}
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default SavedClips;

