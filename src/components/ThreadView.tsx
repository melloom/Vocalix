import React, { useState, useEffect } from "react";
import { ClipCard } from "@/components/ClipCard";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";

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
  parent_clip_id?: string | null;
  reply_count?: number;
  profiles: {
    handle: string;
    emoji_avatar: string;
  } | null;
}

interface ThreadViewProps {
  parentClip: Clip;
  onReply?: (clipId: string) => void;
  highlightQuery?: string;
  maxDepth?: number;
}

export const ThreadView = ({
  parentClip,
  onReply,
  highlightQuery = "",
  maxDepth = 3,
}: ThreadViewProps) => {
  const [replies, setReplies] = useState<Clip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(true);
  const [replyCount, setReplyCount] = useState(0);

  useEffect(() => {
    const fetchReplies = async () => {
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
          .eq("parent_clip_id", parentClip.id)
          .eq("status", "live")
          .order("created_at", { ascending: true });

        if (error) throw error;

        const formattedReplies: Clip[] = (data || []).map((clip: any) => {
          // Handle both array and object formats from Supabase
          const profileData = Array.isArray(clip.profiles) 
            ? clip.profiles[0] 
            : clip.profiles;
          return {
            ...clip,
            profiles: profileData || null,
          };
        });

        setReplies(formattedReplies);
        setReplyCount(formattedReplies.length);
      } catch (error) {
        console.error("Error fetching replies:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchReplies();

    // Subscribe to new replies
    const channel = supabase
      .channel(`clip-replies-${parentClip.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "clips",
          filter: `parent_clip_id=eq.${parentClip.id}`,
        },
        async () => {
          // Refetch replies when a new one is added
          await fetchReplies();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [parentClip.id]);

  if (isLoading) {
    return (
      <div className="space-y-2 ml-8">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    );
  }

  if (replies.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 mt-4">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsExpanded(!isExpanded)}
        className="ml-8 text-xs text-muted-foreground hover:text-foreground"
      >
        {isExpanded ? (
          <>
            <ChevronUp className="mr-1 h-3 w-3" />
            Hide {replyCount} {replyCount === 1 ? "reply" : "replies"}
          </>
        ) : (
          <>
            <ChevronDown className="mr-1 h-3 w-3" />
            Show {replyCount} {replyCount === 1 ? "reply" : "replies"}
          </>
        )}
      </Button>

      {isExpanded && (
        <div className="space-y-3 ml-8 border-l-2 border-l-primary/20 pl-4">
          {replies.map((reply) => (
            <div key={reply.id} className="relative">
              <div className="absolute -left-6 top-6 w-4 h-0.5 bg-primary/30" />
              <ClipCard
                clip={reply}
                captionsDefault={false}
                highlightQuery={highlightQuery}
                onReply={onReply}
                showReplyButton={false}
                isReply={true}
                depth={1}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

