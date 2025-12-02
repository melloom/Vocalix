import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { Radio } from "lucide-react";

interface RemixChainItem {
  clip_id: string;
  is_original: boolean;
  depth: number;
  remix_path: string[];
}

interface ClipInfo {
  id: string;
  title: string | null;
  profiles: {
    handle: string;
    emoji_avatar: string;
  } | null;
}

interface RemixChainViewProps {
  clipId: string;
}

export function RemixChainView({ clipId }: RemixChainViewProps) {
  const [chain, setChain] = useState<RemixChainItem[]>([]);
  const [clipsInfo, setClipsInfo] = useState<Record<string, ClipInfo>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadRemixChain();
  }, [clipId]);

  const loadRemixChain = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .rpc("get_remix_chain", {
          p_clip_id: clipId,
        });

      if (error) throw error;

      if (data && data.length > 0) {
        setChain(data);
        // Load clip info for all clips in chain
        const clipIds = data.map((item) => item.clip_id);
        const { data: clipsData, error: clipsError } = await supabase
          .from("clips")
          .select(
            `
            id,
            title,
            profiles:profile_id (
              handle,
              emoji_avatar
            )
          `
          )
          .in("id", clipIds);

        if (!clipsError && clipsData) {
          const infoMap: Record<string, ClipInfo> = {};
          clipsData.forEach((clip: any) => {
            infoMap[clip.id] = {
              id: clip.id,
              title: clip.title,
              profiles: clip.profiles,
            };
          });
          setClipsInfo(infoMap);
        }
      }
    } catch (error) {
      console.error("Error loading remix chain:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="rounded-3xl">
        <CardContent className="p-6">
          <Skeleton className="h-6 w-32 mb-4" />
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (chain.length <= 1) {
    return null; // No remix chain to show
  }

  const original = chain.find((item) => !item.is_original);
  const remixes = chain.filter((item) => item.is_original).sort((a, b) => a.depth - b.depth);

  return (
    <Card className="rounded-3xl">
      <CardContent className="p-6">
        <h3 className="text-lg font-semibold mb-4">Remix Chain</h3>
        <div className="space-y-4">
          {original && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
              <div className="flex-shrink-0">
                <Badge variant="default" className="rounded-full">
                  Original
                </Badge>
              </div>
              <div className="flex-1 min-w-0">
                <Link
                  to={`/clip/${original.clip_id}`}
                  className="block hover:underline"
                >
                  <p className="font-medium truncate">
                    {clipsInfo[original.clip_id]?.title || "Untitled Clip"}
                  </p>
                  {clipsInfo[original.clip_id]?.profiles && (
                    <p className="text-sm text-muted-foreground">
                      {clipsInfo[original.clip_id].profiles.emoji_avatar}{" "}
                      {clipsInfo[original.clip_id].profiles.handle}
                    </p>
                  )}
                </Link>
              </div>
            </div>
          )}

          {remixes.length > 0 && (
            <div className="space-y-2 pl-4 border-l-2 border-primary/20">
              {remixes.map((remix, index) => (
                <div
                  key={remix.clip_id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-background hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-shrink-0">
                    <Badge variant="secondary" className="rounded-full">
                      Remix {index + 1}
                    </Badge>
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link
                      to={`/clip/${remix.clip_id}`}
                      className="block hover:underline"
                    >
                      <p className="font-medium truncate">
                        {clipsInfo[remix.clip_id]?.title || "Untitled Remix"}
                      </p>
                      {clipsInfo[remix.clip_id]?.profiles && (
                        <p className="text-sm text-muted-foreground">
                          {clipsInfo[remix.clip_id].profiles.emoji_avatar}{" "}
                          {clipsInfo[remix.clip_id].profiles.handle}
                        </p>
                      )}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

