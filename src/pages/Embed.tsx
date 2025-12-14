import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../integrations/supabase/client";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Play, Pause, Volume2, Copy, Check } from "lucide-react";
import { toast } from "sonner";

interface Clip {
  id: string;
  audio_path: string;
  duration_seconds: number;
  title: string | null;
  captions: string | null;
  summary: string | null;
  mood_emoji: string;
  listens_count: number;
  created_at: string;
  profiles: {
    handle: string;
    emoji_avatar: string;
  } | null;
}

export default function Embed() {
  const { clipId } = useParams<{ clipId: string }>();
  const [clip, setClip] = useState<Clip | null>(null);
  const [loading, setLoading] = useState(true);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!clipId) return;

    const fetchClip = async () => {
      try {
        const { data, error } = await supabase
          .from("clips")
          .select(`
            id,
            audio_path,
            duration_seconds,
            title,
            captions,
            summary,
            mood_emoji,
            listens_count,
            created_at,
            profiles:profile_id (
              handle,
              emoji_avatar
            )
          `)
          .eq("id", clipId)
          .eq("status", "live")
          .single();

        if (error) throw error;

        setClip(data as Clip);

        // Get audio URL with CDN optimization
        const { getAudioUrl } = await import("@/utils/audioUrl");
        const audioUrl = await getAudioUrl(data.audio_path, {
          expiresIn: 86400, // 24 hours for better CDN caching
        });
        setAudioUrl(audioUrl);
      } catch (error) {
        console.error("Error fetching clip:", error);
        toast.error("Failed to load clip");
      } finally {
        setLoading(false);
      }
    };

    fetchClip();
  }, [clipId]);

  useEffect(() => {
    if (!audioUrl) return;

    const audio = new Audio(audioUrl);
    audio.addEventListener("ended", () => setIsPlaying(false));
    setAudioElement(audio);

    return () => {
      audio.pause();
      audio.src = "";
    };
  }, [audioUrl]);

  const togglePlay = () => {
    if (!audioElement) return;

    if (isPlaying) {
      audioElement.pause();
      setIsPlaying(false);
    } else {
      audioElement.play();
      setIsPlaying(true);
    }
  };

  const copyEmbedCode = () => {
    const embedCode = `<iframe src="${window.location.origin}/embed/${clipId}" width="400" height="300" frameborder="0" allow="autoplay"></iframe>`;
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    toast.success("Embed code copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading clip...</p>
        </div>
      </div>
    );
  }

  if (!clip) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Clip Not Found</CardTitle>
            <CardDescription>The clip you're looking for doesn't exist or is not available.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const formatDuration = (seconds: number) => {
    return `${seconds}s`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto">
        <Card className="w-full">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <CardTitle className="text-2xl mb-2">
                  {clip.title || "Untitled Clip"}
                </CardTitle>
                <CardDescription className="flex items-center gap-2">
                  <span>{clip.profiles?.emoji_avatar}</span>
                  <span>@{clip.profiles?.handle}</span>
                  <span>•</span>
                  <span>{formatDate(clip.created_at)}</span>
                  <span>•</span>
                  <span>{formatDuration(clip.duration_seconds)}</span>
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={copyEmbedCode}
                className="ml-4"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Embed
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Audio Player */}
              <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={togglePlay}
                  className="flex-shrink-0"
                >
                  {isPlaying ? (
                    <Pause className="h-5 w-5" />
                  ) : (
                    <Play className="h-5 w-5" />
                  )}
                </Button>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Volume2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      {formatDuration(clip.duration_seconds)}
                    </span>
                  </div>
                  {audioElement && (
                    <div className="w-full bg-background rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-100"
                        style={{
                          width: audioElement.currentTime
                            ? `${(audioElement.currentTime / audioElement.duration) * 100}%`
                            : "0%",
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Captions/Summary */}
              {clip.captions && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Transcript</h3>
                  <p className="text-sm text-muted-foreground">
                    <MentionText text={clip.captions} />
                  </p>
                </div>
              )}

              {clip.summary && !clip.captions && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Summary</h3>
                  <p className="text-sm text-muted-foreground">
                    <MentionText text={clip.summary} />
                  </p>
                </div>
              )}

              {/* Stats */}
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>{clip.mood_emoji}</span>
                <span>•</span>
                <span>{clip.listens_count} listens</span>
              </div>

              {/* Embed Code Preview */}
              <div className="mt-6 p-4 bg-muted rounded-lg">
                <h3 className="text-sm font-semibold mb-2">Embed Code</h3>
                <code className="text-xs block p-2 bg-background rounded overflow-x-auto">
                  {`<iframe src="${window.location.origin}/embed/${clipId}" width="400" height="300" frameborder="0" allow="autoplay"></iframe>`}
                </code>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

