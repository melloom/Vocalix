import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Trophy, Clock, Users, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

interface RemixChallenge {
  challenge_id: string;
  title: string;
  description: string;
  challenge_clip_id: string;
  end_date: string | null;
  participant_count: number;
  submission_count: number;
  challenge_clip?: {
    id: string;
    title: string | null;
    audio_path: string;
    profiles?: {
      handle: string;
      emoji_avatar: string;
    } | null;
  } | null;
}

interface RemixChallengeCardProps {
  challengeId: string;
  onRemix?: (clipId: string) => void;
}

export function RemixChallengeCard({ challengeId, onRemix }: RemixChallengeCardProps) {
  const [challenge, setChallenge] = useState<RemixChallenge | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadChallenge();
  }, [challengeId]);

  const loadChallenge = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("remix_challenges")
        .select(`
          id,
          title,
          description,
          challenge_clip_id,
          end_date,
          participant_count,
          submission_count,
          challenge_clip:challenge_clip_id (
            id,
            title,
            audio_path,
            profiles:profile_id (
              handle,
              emoji_avatar
            )
          )
        `)
        .eq("id", challengeId)
        .eq("is_active", true)
        .single();

      if (error) throw error;

      if (data) {
        setChallenge({
          challenge_id: data.id,
          title: data.title,
          description: data.description || "",
          challenge_clip_id: data.challenge_clip_id,
          end_date: data.end_date,
          participant_count: data.participant_count || 0,
          submission_count: data.submission_count || 0,
          challenge_clip: data.challenge_clip as any,
        });
      }
    } catch (error) {
      console.error("Error loading remix challenge:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="rounded-3xl">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32 mt-2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!challenge) {
    return null;
  }

  const isExpired = challenge.end_date && new Date(challenge.end_date) < new Date();
  const daysRemaining = challenge.end_date
    ? Math.ceil((new Date(challenge.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <Card className="rounded-3xl border-2 border-primary/20">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="h-5 w-5 text-primary" />
              <CardTitle className="text-xl">{challenge.title}</CardTitle>
              {isExpired ? (
                <Badge variant="secondary">Ended</Badge>
              ) : (
                <Badge variant="default">Active</Badge>
              )}
            </div>
            <CardDescription className="mt-2">{challenge.description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Challenge Clip Info */}
        {challenge.challenge_clip && (
          <div className="rounded-xl bg-muted/60 p-3">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium">Remix This Clip</span>
            </div>
            <p className="text-sm font-medium">
              {challenge.challenge_clip.title || "Untitled Clip"}
            </p>
            {challenge.challenge_clip.profiles && (
              <p className="text-xs text-muted-foreground mt-1">
                by @{challenge.challenge_clip.profiles.handle}
              </p>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center p-2 rounded-lg bg-muted/40">
            <Users className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Participants</p>
            <p className="text-lg font-bold">{challenge.participant_count}</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/40">
            <Sparkles className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Submissions</p>
            <p className="text-lg font-bold">{challenge.submission_count}</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/40">
            <Clock className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              {isExpired ? "Ended" : daysRemaining !== null ? `${daysRemaining}d left` : "No limit"}
            </p>
            {challenge.end_date && !isExpired && (
              <p className="text-xs text-muted-foreground">
                {new Date(challenge.end_date).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        {!isExpired && challenge.challenge_clip && (
          <Button
            onClick={() => onRemix?.(challenge.challenge_clip_id)}
            className="w-full rounded-xl"
            size="lg"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Create Remix
          </Button>
        )}

        <Link
          to={`/remix-challenge/${challengeId}`}
          className="block text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          View all submissions →
        </Link>
      </CardContent>
    </Card>
  );
}

