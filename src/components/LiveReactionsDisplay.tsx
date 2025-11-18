import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

interface LiveReaction {
  emoji: string;
  reaction_count: number;
  timestamp_seconds: number;
  recent_reactions: Array<{
    profile_id: string;
    created_at: string;
  }>;
}

interface LiveReactionsDisplayProps {
  clipId: string;
  currentTimeSeconds: number;
  isPlaying: boolean;
  timeWindowSeconds?: number;
}

export const LiveReactionsDisplay = ({
  clipId,
  currentTimeSeconds,
  isPlaying,
  timeWindowSeconds = 5,
}: LiveReactionsDisplayProps) => {
  const [liveReactions, setLiveReactions] = useState<LiveReaction[]>([]);
  const [totalActiveReactions, setTotalActiveReactions] = useState(0);

  useEffect(() => {
    if (!isPlaying || !clipId) {
      setLiveReactions([]);
      setTotalActiveReactions(0);
      return;
    }

    const fetchLiveReactions = async () => {
      try {
        const { data, error } = await supabase.rpc("get_live_reactions", {
          p_clip_id: clipId,
          p_current_time_seconds: currentTimeSeconds,
          p_time_window_seconds: timeWindowSeconds,
        });

        if (error) throw error;

        const reactions = (data || []) as LiveReaction[];
        setLiveReactions(reactions);
        
        // Calculate total active reactions (people reacting in this time window)
        const total = reactions.reduce((sum, r) => {
          const recentCount = r.recent_reactions?.length || 0;
          return sum + recentCount;
        }, 0);
        setTotalActiveReactions(total);
      } catch (error) {
        console.error("Error fetching live reactions:", error);
      }
    };

    // Fetch immediately
    fetchLiveReactions();

    // Update every second while playing
    const interval = setInterval(fetchLiveReactions, 1000);

    return () => clearInterval(interval);
  }, [clipId, currentTimeSeconds, isPlaying, timeWindowSeconds]);

  // Subscribe to new reactions in real-time
  useEffect(() => {
    if (!isPlaying || !clipId) return;

    const channel = supabase
      .channel(`live-reactions-${clipId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "clip_reactions",
          filter: `clip_id=eq.${clipId}`,
        },
        async () => {
          // Refetch live reactions when a new reaction is added
          try {
            const { data } = await supabase.rpc("get_live_reactions", {
              p_clip_id: clipId,
              p_current_time_seconds: currentTimeSeconds,
              p_time_window_seconds: timeWindowSeconds,
            });
            if (data) {
              setLiveReactions(data as LiveReaction[]);
              const total = (data as LiveReaction[]).reduce((sum, r) => {
                const recentCount = r.recent_reactions?.length || 0;
                return sum + recentCount;
              }, 0);
              setTotalActiveReactions(total);
            }
          } catch (error) {
            console.error("Error updating live reactions:", error);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clipId, currentTimeSeconds, isPlaying, timeWindowSeconds]);

  if (!isPlaying || liveReactions.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-20 left-1/2 transform -translate-x-1/2 z-50 pointer-events-none">
      <Card className="p-3 rounded-full bg-background/95 backdrop-blur-sm border shadow-lg pointer-events-auto">
        <div className="flex items-center gap-2">
          {totalActiveReactions > 0 && (
            <Badge variant="default" className="gap-1.5">
              <span className="text-lg">🔥</span>
              <span className="font-semibold">{totalActiveReactions}</span>
              <span className="text-xs">reacting</span>
            </Badge>
          )}
          {liveReactions.slice(0, 3).map((reaction, idx) => (
            <Badge
              key={`${reaction.emoji}-${idx}`}
              variant="secondary"
              className="text-lg animate-pulse"
            >
              {reaction.emoji} {reaction.reaction_count}
            </Badge>
          ))}
        </div>
      </Card>
    </div>
  );
};

