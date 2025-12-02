import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { logError } from "@/lib/logger";
import { ClipCard } from "@/components/ClipCard";
import { ClipListSkeleton } from "@/components/ui/clip-skeleton";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Clip {
  id: string;
  profile_id: string;
  audio_path: string;
  duration_seconds: number;
  title: string | null;
  captions: string | null;
  summary: string | null;
  tags: string[] | null;
  mood_emoji: string | null;
  status: string;
  listens_count: number;
  reactions: Record<string, number> | null;
  created_at: string;
  topic_id: string | null;
  completion_rate: number | null;
  trending_score: number | null;
  quality_score: number | null;
  profiles?: {
    handle: string;
    emoji_avatar: string;
  } | null;
}

interface SimilarClipsSectionProps {
  clipId: string;
  limit?: number;
}

export const SimilarClipsSection = ({ clipId, limit = 10 }: SimilarClipsSectionProps) => {
  const { profile } = useProfile();
  const [clips, setClips] = useState<Clip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [similarityReasons, setSimilarityReasons] = useState<Record<string, string[]>>({});

  useEffect(() => {
    const loadSimilarClips = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase.rpc("get_similar_clips", {
          p_clip_id: clipId,
          p_profile_id: profile?.id || null,
          p_limit: limit
        });

        if (error) throw error;

        if (data && data.length > 0) {
          const clipIds = data.map((item: any) => item.clip_id);
          const reasonsMap: Record<string, string[]> = {};
          
          data.forEach((item: any) => {
            if (item.similarity_reasons) {
              reasonsMap[item.clip_id] = item.similarity_reasons.filter((r: string) => r !== null);
            }
          });

          setSimilarityReasons(reasonsMap);

          const { data: clipsData, error: clipsError } = await supabase
            .from("clips")
            .select(`
              *,
              profiles (
                handle,
                emoji_avatar
              )
            `)
            .in("id", clipIds)
            .eq("status", "live");

          if (clipsError) throw clipsError;

          // Sort clips to match the order from the function
          const sortedClips = clipIds
            .map((id: string) => clipsData?.find(c => c.id === id))
            .filter(Boolean) as Clip[];

          setClips(sortedClips);
        }
      } catch (error) {
        logError("Error loading similar clips", error);
      } finally {
        setIsLoading(false);
      }
    };

    if (clipId) {
      loadSimilarClips();
    }
  }, [clipId, profile?.id, limit]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          <h3 className="text-lg font-semibold">Similar Clips</h3>
        </div>
        <ClipListSkeleton count={3} />
      </div>
    );
  }

  if (clips.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4" />
        <h3 className="text-lg font-semibold">Similar Clips</h3>
      </div>
      <div className="space-y-4">
        {clips.map((clip) => (
          <div key={clip.id} className="relative">
            <ClipCard clip={clip} />
            {similarityReasons[clip.id] && similarityReasons[clip.id].length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {similarityReasons[clip.id].map((reason, idx) => (
                  <Badge key={idx} variant="secondary" className="text-xs">
                    {reason}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

