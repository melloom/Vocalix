import { useState, useEffect } from "react";
import { Trophy, Calendar, Users, Sparkles, ArrowRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logError } from "@/lib/logger";
import { Link } from "react-router-dom";
import { RemixModal } from "@/components/RemixModal";
import { formatDistanceToNow } from "date-fns";

interface RemixChallenge {
  id: string;
  title: string;
  description: string | null;
  challenge_clip_id: string;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  prize_description: string | null;
  participant_count: number;
  submission_count: number;
  challenge_clip?: {
    id: string;
    title: string | null;
    summary: string | null;
    audio_path: string;
    profiles?: {
      handle: string;
      emoji_avatar: string;
    } | null;
  } | null;
}

export default function RemixChallenges() {
  const [challenges, setChallenges] = useState<RemixChallenge[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedChallenge, setSelectedChallenge] = useState<RemixChallenge | null>(null);
  const [isRemixModalOpen, setIsRemixModalOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadChallenges();
  }, []);

  const loadChallenges = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_active_remix_challenges');

      if (error) throw error;

      if (data) {
        // Load challenge clip details for each challenge
        const challengesWithClips = await Promise.all(
          data.map(async (challenge: any) => {
            if (challenge.challenge_clip_id) {
              const { data: clipData } = await supabase
                .from('clips')
                .select(`
                  id,
                  title,
                  summary,
                  audio_path,
                  profiles:profile_id (
                    handle,
                    emoji_avatar
                  )
                `)
                .eq('id', challenge.challenge_clip_id)
                .single();

              return {
                ...challenge,
                challenge_clip: clipData || null,
              };
            }
            return challenge;
          })
        );

        setChallenges(challengesWithClips);
      }
    } catch (error) {
      logError('Failed to load remix challenges', error);
      toast({
        title: "Failed to load challenges",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinChallenge = (challenge: RemixChallenge) => {
    if (!challenge.challenge_clip) {
      toast({
        title: "Challenge clip not available",
        variant: "destructive",
      });
      return;
    }

    setSelectedChallenge(challenge);
    setIsRemixModalOpen(true);
  };

  const isChallengeActive = (challenge: RemixChallenge) => {
    if (!challenge.is_active) return false;
    if (challenge.end_date) {
      return new Date(challenge.end_date) > new Date();
    }
    return true;
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">Loading challenges...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Remix Challenges</h1>
        <p className="text-muted-foreground">
          Participate in community remix contests and showcase your creativity
        </p>
      </div>

      {challenges.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Trophy className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">No active challenges at the moment</p>
            <p className="text-sm text-muted-foreground mt-2">
              Check back soon for new remix challenges!
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {challenges.map((challenge) => {
            const isActive = isChallengeActive(challenge);
            
            return (
              <Card key={challenge.id} className={isActive ? '' : 'opacity-60'}>
                <CardHeader>
                  <div className="flex items-start justify-between mb-2">
                    <CardTitle className="text-lg">{challenge.title}</CardTitle>
                    {isActive ? (
                      <Badge variant="default">Active</Badge>
                    ) : (
                      <Badge variant="outline">Ended</Badge>
                    )}
                  </div>
                  {challenge.description && (
                    <CardDescription>{challenge.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  {challenge.challenge_clip && (
                    <div className="p-3 rounded-lg bg-muted/40">
                      <p className="text-sm font-medium mb-1">Challenge Clip</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {challenge.challenge_clip.title || challenge.challenge_clip.summary || 'Untitled'}
                      </p>
                      {challenge.challenge_clip.profiles && (
                        <p className="text-xs text-muted-foreground mt-1">
                          by @{challenge.challenge_clip.profiles.handle}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      <span>{challenge.participant_count} participants</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Sparkles className="h-4 w-4" />
                      <span>{challenge.submission_count} remixes</span>
                    </div>
                  </div>

                  {challenge.end_date && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      <span>
                        {isActive
                          ? `Ends ${formatDistanceToNow(new Date(challenge.end_date), { addSuffix: true })}`
                          : `Ended ${formatDistanceToNow(new Date(challenge.end_date), { addSuffix: true })}`}
                      </span>
                    </div>
                  )}

                  {challenge.prize_description && (
                    <div className="p-2 rounded bg-primary/10">
                      <p className="text-xs font-medium text-primary mb-1">Prize</p>
                      <p className="text-xs text-muted-foreground">{challenge.prize_description}</p>
                    </div>
                  )}

                  {isActive && challenge.challenge_clip && (
                    <Button
                      onClick={() => handleJoinChallenge(challenge)}
                      className="w-full"
                      size="sm"
                    >
                      Join Challenge
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Remix Modal */}
      {selectedChallenge && selectedChallenge.challenge_clip && (
        <RemixModal
          isOpen={isRemixModalOpen}
          onClose={() => {
            setIsRemixModalOpen(false);
            setSelectedChallenge(null);
          }}
          onSuccess={() => {
            setIsRemixModalOpen(false);
            setSelectedChallenge(null);
            loadChallenges();
            toast({
              title: "Remix submitted!",
              description: "Your remix has been entered into the challenge",
            });
          }}
          originalClipId={selectedChallenge.challenge_clip.id}
          originalClip={selectedChallenge.challenge_clip}
          remixChallengeId={selectedChallenge.id}
        />
      )}
    </div>
  );
}

