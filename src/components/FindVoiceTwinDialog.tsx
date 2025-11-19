import { useState, useEffect } from "react";
import { Users, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useSearch } from "@/hooks/useSearch";
import { useProfile } from "@/hooks/useProfile";
import { ClipCard } from "@/components/ClipCard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

interface FindVoiceTwinDialogProps {
  clipId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SimilarVoiceResult {
  clip_id: string;
  similarity_score: number;
  profile_id: string;
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
  listens_count?: number;
  city?: string | null;
  content_rating?: "general" | "sensitive";
  title?: string | null;
  tags?: string[] | null;
  profiles: {
    handle: string;
    emoji_avatar: string;
  } | null;
}

export const FindVoiceTwinDialog = ({
  clipId,
  open,
  onOpenChange,
}: FindVoiceTwinDialogProps) => {
  const { profile } = useProfile();
  const { searchByVoiceCharacteristics } = useSearch(profile?.id);
  const { toast } = useToast();
  const [similarClips, setSimilarClips] = useState<Clip[]>([]);
  const [similarityScores, setSimilarityScores] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [sourceClip, setSourceClip] = useState<Clip | null>(null);

  useEffect(() => {
    if (open && clipId) {
      loadSimilarVoices();
      loadSourceClip();
    } else {
      // Reset state when dialog closes
      setSimilarClips([]);
      setSimilarityScores({});
      setSourceClip(null);
    }
  }, [open, clipId]);

  const loadSourceClip = async () => {
    try {
      const { data, error } = await supabase
        .from("clips")
        .select(
          `
          *,
          profiles:profile_id (
            handle,
            emoji_avatar
          )
        `
        )
        .eq("id", clipId)
        .single();

      if (error) throw error;
      if (data) {
        const formattedClip: Clip = {
          ...data,
          profiles: Array.isArray(data.profiles)
            ? data.profiles[0] || null
            : data.profiles || null,
        };
        setSourceClip(formattedClip);
      }
    } catch (error) {
      console.error("Error loading source clip:", error);
    }
  };

  const loadSimilarVoices = async () => {
    if (!clipId) return;

    setIsLoading(true);
    try {
      // Call the database function via the hook
      const results = await searchByVoiceCharacteristics.mutateAsync({
        clipId,
        limit: 20,
      });

      if (!results || results.length === 0) {
        setSimilarClips([]);
        setIsLoading(false);
        return;
      }

      // Store similarity scores
      const scores: Record<string, number> = {};
      results.forEach((result) => {
        scores[result.clip_id] = result.rank;
      });

      setSimilarityScores(scores);

      // Fetch full clip data for similar clips
      const clipIds = results.map((r) => r.clip_id);
      const { data: clipsData, error: clipsError } = await supabase
        .from("clips")
        .select(
          `
          *,
          profiles:profile_id (
            handle,
            emoji_avatar
          )
        `
        )
        .in("id", clipIds)
        .eq("status", "live")
        .order("created_at", { ascending: false });

      if (clipsError) throw clipsError;

      // Format clips and sort by similarity score
      const formattedClips: Clip[] = (clipsData || [])
        .map((clip: any) => {
          const profileData = Array.isArray(clip.profiles)
            ? clip.profiles[0]
            : clip.profiles;
          return {
            ...clip,
            profiles: profileData || null,
          };
        })
        .sort((a, b) => {
          const scoreA = scores[a.id] || 0;
          const scoreB = scores[b.id] || 0;
          return scoreB - scoreA;
        });

      setSimilarClips(formattedClips);
    } catch (error) {
      console.error("Error loading similar voices:", error);
      toast({
        title: "Error",
        description: "Failed to find similar voices. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const formatSimilarityScore = (score: number): string => {
    const percentage = Math.round(score * 100);
    return `${percentage}%`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Find Your Voice Twin
          </DialogTitle>
          <DialogDescription>
            Discover clips with similar voice characteristics - matching pitch, tone, and speaking speed
          </DialogDescription>
        </DialogHeader>

        {sourceClip && (
          <Card className="p-4 rounded-2xl bg-muted/50">
            <div className="flex items-center gap-3">
              <div className="text-3xl">{sourceClip.profiles?.emoji_avatar || "🎧"}</div>
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">Finding voices similar to:</p>
                <p className="font-semibold">
                  {sourceClip.title || `Clip by ${sourceClip.profiles?.handle || "Unknown"}`}
                </p>
              </div>
            </div>
          </Card>
        )}

        {isLoading ? (
          <div className="space-y-4 py-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-4 rounded-2xl">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-16 w-16 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : similarClips.length === 0 ? (
          <Card className="p-8 rounded-2xl text-center">
            <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-lg font-semibold mb-2">No similar voices found</p>
            <p className="text-sm text-muted-foreground">
              We couldn't find any clips with similar voice characteristics. Try again with a different clip!
            </p>
          </Card>
        ) : (
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Found {similarClips.length} similar {similarClips.length === 1 ? "voice" : "voices"}
              </p>
              <Badge variant="outline" className="gap-1">
                <Sparkles className="h-3 w-3" />
                Sorted by similarity
              </Badge>
            </div>

            {similarClips.map((clip) => {
              const similarity = similarityScores[clip.id] || 0;
              const isExactMatch = similarity >= 0.95;

              return (
                <div key={clip.id} className="relative">
                  {similarity > 0 && (
                    <div className="absolute -top-2 -right-2 z-10">
                      <Badge
                        variant={isExactMatch ? "default" : "secondary"}
                        className="gap-1 shadow-lg"
                      >
                        <Sparkles className="h-3 w-3" />
                        {formatSimilarityScore(similarity)}
                      </Badge>
                    </div>
                  )}
                  <ClipCard
                    clip={clip}
                    showReplyButton={true}
                    viewMode="compact"
                  />
                </div>
              );
            })}
          </div>
        )}

        <div className="flex justify-end pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

