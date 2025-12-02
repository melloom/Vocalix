import React, { useState, useEffect } from "react";
import { ClipCard } from "@/components/ClipCard";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Link2 } from "lucide-react";
import { Card } from "@/components/ui/card";

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
  chain_id?: string | null;
  profiles: {
    handle: string;
    emoji_avatar: string;
  } | null;
}

interface ChainViewProps {
  chainId: string;
  onReply?: (clipId: string) => void;
  onRemix?: (clipId: string) => void;
  onContinueChain?: (clipId: string) => void;
  highlightQuery?: string;
}

export const ChainView = ({
  chainId,
  onReply,
  onRemix,
  onContinueChain,
  highlightQuery = "",
}: ChainViewProps) => {
  const [clips, setClips] = useState<Clip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    const fetchChainClips = async () => {
      try {
        const { data, error } = await supabase
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
          .eq("chain_id", chainId)
          .eq("status", "live")
          .order("created_at", { ascending: true });

        if (error) throw error;

        const formattedClips: Clip[] = (data || []).map((clip: any) => {
          const profileData = Array.isArray(clip.profiles) 
            ? clip.profiles[0] 
            : clip.profiles;
          return {
            ...clip,
            profiles: profileData || null,
          };
        });

        setClips(formattedClips);
      } catch (error) {
        console.error("Error fetching chain clips:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchChainClips();

    // Subscribe to new clips in the chain
    const channel = supabase
      .channel(`chain-clips-${chainId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "clips",
          filter: `chain_id=eq.${chainId}`,
        },
        async () => {
          await fetchChainClips();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chainId]);

  if (isLoading) {
    return (
      <div className="space-y-2 ml-8">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    );
  }

  if (clips.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 mt-4">
      <Card className="p-4 rounded-2xl bg-muted/50 border-l-4 border-l-primary">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">
              Conversation Chain ({clips.length} {clips.length === 1 ? "clip" : "clips"})
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="mr-1 h-3 w-3" />
                Hide
              </>
            ) : (
              <>
                <ChevronDown className="mr-1 h-3 w-3" />
                Show
              </>
            )}
          </Button>
        </div>
      </Card>

      {isExpanded && (
        <div className="space-y-3 ml-8 border-l-2 border-l-primary/20 pl-4">
          {clips.map((clip, index) => (
            <div key={clip.id} className="relative">
              {index > 0 && (
                <div className="absolute -left-6 top-0 w-4 h-0.5 bg-primary/30" />
              )}
              <ClipCard
                clip={clip}
                captionsDefault={false}
                highlightQuery={highlightQuery}
                onReply={onReply}
                onRemix={onRemix}
                onContinueChain={onContinueChain}
                showReplyButton={false}
                isReply={false}
                depth={index}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

