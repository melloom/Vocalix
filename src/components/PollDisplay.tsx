import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface PollOption {
  id: string;
  text: string;
}

interface Poll {
  id: string;
  title: string;
  description: string | null;
  options: PollOption[];
  is_multiple_choice: boolean;
  expires_at: string | null;
  is_closed: boolean;
  total_votes: number;
  created_at: string;
}

interface PollDisplayProps {
  pollId: string;
  onVote?: () => void;
}

export function PollDisplay({ pollId, onVote }: PollDisplayProps) {
  const { profile } = useProfile();
  const { toast } = useToast();
  const [poll, setPoll] = useState<Poll | null>(null);
  const [userVotes, setUserVotes] = useState<Set<string>>(new Set());
  const [optionVotes, setOptionVotes] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isVoting, setIsVoting] = useState(false);

  useEffect(() => {
    loadPoll();
    loadVotes();
  }, [pollId, profile?.id]);

  const loadPoll = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("community_polls")
        .select("*")
        .eq("id", pollId)
        .single();

      if (error) throw error;
      setPoll(data);
    } catch (error: any) {
      console.error("Error loading poll:", error);
      toast({
        title: "Error",
        description: "Failed to load poll",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadVotes = async () => {
    if (!profile?.id) return;

    try {
      // Load user's votes
      const { data: userVotesData, error: userVotesError } = await supabase
        .from("poll_votes")
        .select("option_id")
        .eq("poll_id", pollId)
        .eq("profile_id", profile.id);

      if (!userVotesError && userVotesData) {
        setUserVotes(new Set(userVotesData.map((v) => v.option_id)));
      }

      // Load vote counts per option
      const { data: allVotes, error: allVotesError } = await supabase
        .from("poll_votes")
        .select("option_id")
        .eq("poll_id", pollId);

      if (!allVotesError && allVotes) {
        const counts: Record<string, number> = {};
        allVotes.forEach((vote) => {
          counts[vote.option_id] = (counts[vote.option_id] || 0) + 1;
        });
        setOptionVotes(counts);
      }
    } catch (error) {
      console.error("Error loading votes:", error);
    }
  };

  const handleVote = async (optionId: string) => {
    if (!profile?.id) {
      toast({
        title: "Please log in",
        description: "You need to be logged in to vote",
        variant: "destructive",
      });
      return;
    }

    if (!poll) return;

    if (poll.is_closed) {
      toast({
        title: "Poll closed",
        description: "This poll is no longer accepting votes",
        variant: "destructive",
      });
      return;
    }

    if (poll.expires_at && new Date(poll.expires_at) < new Date()) {
      toast({
        title: "Poll expired",
        description: "This poll has expired",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsVoting(true);

      if (poll.is_multiple_choice) {
        // Toggle vote for multiple choice
        if (userVotes.has(optionId)) {
          const { error } = await supabase
            .from("poll_votes")
            .delete()
            .eq("poll_id", pollId)
            .eq("profile_id", profile.id)
            .eq("option_id", optionId);

          if (error) throw error;
          setUserVotes((prev) => {
            const newSet = new Set(prev);
            newSet.delete(optionId);
            return newSet;
          });
        } else {
          const { error } = await supabase.from("poll_votes").insert({
            poll_id: pollId,
            profile_id: profile.id,
            option_id: optionId,
          });

          if (error) throw error;
          setUserVotes((prev) => new Set([...prev, optionId]));
        }
      } else {
        // Single choice - replace existing vote
        // First remove any existing votes
        await supabase
          .from("poll_votes")
          .delete()
          .eq("poll_id", pollId)
          .eq("profile_id", profile.id);

        // Then add new vote
        const { error } = await supabase.from("poll_votes").insert({
          poll_id: pollId,
          profile_id: profile.id,
          option_id: optionId,
        });

        if (error) throw error;
        setUserVotes(new Set([optionId]));
      }

      await loadVotes();
      await loadPoll();
      onVote?.();
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

  if (isLoading) {
    return (
      <Card className="rounded-3xl">
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-6 bg-muted rounded w-3/4" />
            <div className="h-4 bg-muted rounded w-full" />
            <div className="h-4 bg-muted rounded w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!poll) {
    return null;
  }

  const isExpired = poll.expires_at && new Date(poll.expires_at) < new Date();
  const canVote = !poll.is_closed && !isExpired && profile?.id;

  return (
    <Card className="rounded-3xl">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle>{poll.title}</CardTitle>
            {poll.description && (
              <p className="text-sm text-muted-foreground mt-2">{poll.description}</p>
            )}
          </div>
          <div className="flex gap-2">
            {poll.is_closed && <Badge variant="secondary">Closed</Badge>}
            {isExpired && <Badge variant="secondary">Expired</Badge>}
            {poll.is_multiple_choice && <Badge variant="outline">Multiple Choice</Badge>}
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {poll.total_votes} vote{poll.total_votes !== 1 ? "s" : ""}
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {poll.options.map((option) => {
          const voteCount = optionVotes[option.id] || 0;
          const percentage = poll.total_votes > 0 ? (voteCount / poll.total_votes) * 100 : 0;
          const isSelected = userVotes.has(option.id);

          return (
            <div key={option.id} className="space-y-2">
              <Button
                variant={isSelected ? "default" : "outline"}
                className={cn(
                  "w-full justify-start rounded-2xl h-auto py-3",
                  isSelected && "bg-primary"
                )}
                onClick={() => handleVote(option.id)}
                disabled={isVoting || !canVote}
              >
                <div className="flex items-center gap-2 flex-1">
                  {isSelected ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <Circle className="h-4 w-4" />
                  )}
                  <span className="flex-1 text-left">{option.text}</span>
                  {poll.total_votes > 0 && (
                    <span className="text-xs opacity-70">
                      {voteCount} ({percentage.toFixed(0)}%)
                    </span>
                  )}
                </div>
              </Button>
              {poll.total_votes > 0 && (
                <Progress value={percentage} className="h-1" />
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

