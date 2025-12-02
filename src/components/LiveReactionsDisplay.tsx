import { useEffect, useState, useRef } from "react";
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
  
  // Use ref to track latest currentTimeSeconds without causing effect re-runs
  const currentTimeRef = useRef(currentTimeSeconds);
  
  // Update ref whenever currentTimeSeconds changes
  useEffect(() => {
    currentTimeRef.current = currentTimeSeconds;
  }, [currentTimeSeconds]);

  useEffect(() => {
    if (!isPlaying || !clipId) {
      setLiveReactions([]);
      setTotalActiveReactions(0);
      return;
    }

    const fetchLiveReactions = async () => {
      try {
        // Use ref value to get the latest currentTimeSeconds without recreating interval
        const { data, error } = await supabase.rpc("get_live_reactions", {
          p_clip_id: clipId,
          p_current_time_seconds: currentTimeRef.current,
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

    // Update every second while playing (increased from 1s to 2s to reduce load)
    const interval = setInterval(fetchLiveReactions, 2000);

    return () => clearInterval(interval);
  }, [clipId, isPlaying, timeWindowSeconds]); // Removed currentTimeSeconds from deps

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
            // Use ref value to get the latest currentTimeSeconds
            const { data } = await supabase.rpc("get_live_reactions", {
              p_clip_id: clipId,
              p_current_time_seconds: currentTimeRef.current,
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
  }, [clipId, isPlaying, timeWindowSeconds]); // Removed currentTimeSeconds from deps

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

