import { useState, useEffect } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface VoteButtonsProps {
  clipId: string;
  initialVoteScore?: number;
  initialUpvotes?: number;
  initialDownvotes?: number;
  compact?: boolean;
}

export function VoteButtons({
  clipId,
  initialVoteScore = 0,
  initialUpvotes = 0,
  initialDownvotes = 0,
  compact = false,
}: VoteButtonsProps) {
  const { toast } = useToast();
  const profileId = localStorage.getItem("profileId");
  const [voteScore, setVoteScore] = useState(initialVoteScore);
  const [upvotes, setUpvotes] = useState(initialUpvotes);
  const [downvotes, setDownvotes] = useState(initialDownvotes);
  const [userVote, setUserVote] = useState<"upvote" | "downvote" | null>(null);
  const [isVoting, setIsVoting] = useState(false);

  useEffect(() => {
    loadUserVote();
    subscribeToVotes();
  }, [clipId, profileId]);

  const loadUserVote = async () => {
    if (!profileId) return;

    try {
      const { data, error } = await supabase
        .from("clip_votes")
        .select("vote_type")
        .eq("clip_id", clipId)
        .eq("profile_id", profileId)
        .single();

      if (error && error.code !== "PGRST116") {
        throw error;
      }

      if (data) {
        setUserVote(data.vote_type as "upvote" | "downvote");
      }
    } catch (error) {
      console.error("Error loading user vote:", error);
    }
  };

  const subscribeToVotes = () => {
    const channel = supabase
      .channel(`clip-votes-${clipId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "clips",
          filter: `id=eq.${clipId}`,
        },
        (payload) => {
          if (payload.new) {
            setVoteScore((payload.new as any).vote_score || 0);
            setUpvotes((payload.new as any).upvote_count || 0);
            setDownvotes((payload.new as any).downvote_count || 0);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const handleVote = async (voteType: "upvote" | "downvote") => {
    if (!profileId) {
      toast({
        title: "Please log in",
        description: "You need to be logged in to vote",
        variant: "destructive",
      });
      return;
    }

    if (isVoting) return;

    try {
      setIsVoting(true);

      // If clicking the same vote, remove it
      if (userVote === voteType) {
        const { error } = await supabase
          .from("clip_votes")
          .delete()
          .eq("clip_id", clipId)
          .eq("profile_id", profileId);

        if (error) throw error;
        setUserVote(null);
      } else {
        // Upsert vote
        const { error } = await supabase
          .from("clip_votes")
          .upsert(
            {
              clip_id: clipId,
              profile_id: profileId,
              vote_type: voteType,
            },
            { onConflict: "clip_id,profile_id" }
          );

        if (error) throw error;
        setUserVote(voteType);
      }
    } catch (error: any) {
      console.error("Error voting:", error);
      toast({
        title: "Error",
        description: "Failed to vote. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsVoting(false);
    }
  };

  const formatScore = (score: number) => {
    if (Math.abs(score) >= 1000) {
      return (score / 1000).toFixed(1) + "k";
    }
    return score.toString();
  };

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleVote("upvote")}
          disabled={isVoting}
          className={cn(
            "h-6 w-6 p-0 rounded-full",
            userVote === "upvote" && "bg-primary text-primary-foreground"
          )}
        >
          <ChevronUp className="h-4 w-4" />
        </Button>
        <span className="text-xs font-medium min-w-[2ch] text-center">
          {formatScore(voteScore)}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleVote("downvote")}
          disabled={isVoting}
          className={cn(
            "h-6 w-6 p-0 rounded-full",
            userVote === "downvote" && "bg-destructive text-destructive-foreground"
          )}
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => handleVote("upvote")}
        disabled={isVoting}
        className={cn(
          "h-8 w-8 p-0 rounded-full",
          userVote === "upvote" && "bg-primary text-primary-foreground"
        )}
      >
        <ChevronUp className="h-5 w-5" />
      </Button>
      <span className="text-sm font-semibold min-w-[3ch] text-center">
        {formatScore(voteScore)}
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => handleVote("downvote")}
        disabled={isVoting}
        className={cn(
          "h-8 w-8 p-0 rounded-full",
          userVote === "downvote" && "bg-destructive text-destructive-foreground"
        )}
      >
        <ChevronDown className="h-5 w-5" />
      </Button>
      <div className="text-xs text-muted-foreground text-center">
        {upvotes}↑ {downvotes}↓
      </div>
    </div>
  );
}

