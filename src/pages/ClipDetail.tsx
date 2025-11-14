import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ClipCard } from "@/components/ClipCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
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

const ClipDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [clip, setClip] = useState<Clip | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const loadClip = async () => {
      if (!id) {
        setIsLoading(false);
        setError("Clip ID is required");
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const { data: clipData, error: clipError } = await supabase
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
          .eq("id", id)
          .single();

        if (clipError || !clipData) {
          setError("Clip not found");
          setIsLoading(false);
          return;
        }

        // Format the clip data
        const formattedClip: Clip = {
          ...clipData,
          profiles: Array.isArray(clipData.profiles)
            ? clipData.profiles[0] || null
            : clipData.profiles || null,
        };

        setClip(formattedClip);

        // Update meta tags for social sharing
        updateMetaTags(formattedClip);
      } catch (err) {
        console.error("Error loading clip:", err);
        setError("Couldn't load clip");
      } finally {
        setIsLoading(false);
      }
    };

    loadClip();
  }, [id]);

  const updateMetaTags = (clipData: Clip) => {
    const title = clipData.title || `Voice clip by ${clipData.profiles?.handle || "Anonymous"}`;
    const description = clipData.summary || `Listen to this voice clip on Echo Garden`;
    const url = `${window.location.origin}/clip/${clipData.id}`;
    const image = "/placeholder.svg"; // You can replace this with a generated image URL if needed

    // Update or create meta tags
    const updateMetaTag = (property: string, content: string) => {
      let element = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement;
      if (!element) {
        element = document.createElement("meta");
        element.setAttribute("property", property);
        document.head.appendChild(element);
      }
      element.setAttribute("content", content);
    };

    const updateNameMetaTag = (name: string, content: string) => {
      let element = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement;
      if (!element) {
        element = document.createElement("meta");
        element.setAttribute("name", name);
        document.head.appendChild(element);
      }
      element.setAttribute("content", content);
    };

    // Update title
    document.title = `${title} | Echo Garden`;

    // Open Graph tags
    updateMetaTag("og:title", title);
    updateMetaTag("og:description", description);
    updateMetaTag("og:type", "website");
    updateMetaTag("og:url", url);
    updateMetaTag("og:image", image);

    // Twitter Card tags
    updateNameMetaTag("twitter:card", "summary_large_image");
    updateNameMetaTag("twitter:title", title);
    updateNameMetaTag("twitter:description", description);
    updateNameMetaTag("twitter:image", image);

    // Standard meta tags
    updateNameMetaTag("description", description);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border">
          <div className="max-w-2xl mx-auto px-4 py-4">
            <div className="flex items-center gap-4">
              <Skeleton className="h-10 w-10 rounded-full" />
              <Skeleton className="h-6 w-32" />
            </div>
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-8">
          <Card className="p-6 space-y-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-32 w-full" />
          </Card>
        </main>
      </div>
    );
  }

  if (error || !clip) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border">
          <div className="max-w-2xl mx-auto px-4 py-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(-1)}
              className="rounded-2xl"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-8">
          <Card className="p-6 text-center space-y-4">
            <h1 className="text-2xl font-semibold">Clip Not Found</h1>
            <p className="text-muted-foreground">{error || "The clip you're looking for doesn't exist."}</p>
            <Button onClick={() => navigate("/")} className="rounded-2xl">
              Go Home
            </Button>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
            className="rounded-2xl"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-8">
        <ClipCard
          clip={clip}
          captionsDefault={true}
          showReplyButton={true}
        />
      </main>
    </div>
  );
};

export default ClipDetail;

