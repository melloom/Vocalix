import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Trophy, Calendar, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ClipCard } from "@/components/ClipCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

interface Challenge {
  id: string;
  topic_id: string;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  created_at: string;
  topics: {
    id: string;
    title: string;
    date: string;
  } | null;
}

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
  listens_count: number;
  city: string | null;
  content_rating?: "general" | "sensitive";
  title: string | null;
  tags: string[] | null;
  challenge_id: string | null;
  profiles: {
    handle: string;
    emoji_avatar: string;
  } | null;
}

const Challenges = () => {
  const navigate = useNavigate();
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [selectedChallenge, setSelectedChallenge] = useState<Challenge | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingClips, setIsLoadingClips] = useState(false);

  useEffect(() => {
    const loadChallenges = async () => {
      try {
        const { data, error } = await supabase
          .from("challenges")
          .select(
            `
            *,
            topics (
              id,
              title,
              date
            )
          `,
          )
          .eq("is_active", true)
          .order("created_at", { ascending: false });

        if (error) throw error;

        setChallenges((data as Challenge[]) || []);
      } catch (error) {
        console.error("Error loading challenges:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadChallenges();
  }, []);

  const loadChallengeClips = async (challengeId: string) => {
    setIsLoadingClips(true);
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
        .eq("challenge_id", challengeId)
        .eq("status", "live")
        .order("created_at", { ascending: false });

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
      console.error("Error loading challenge clips:", error);
    } finally {
      setIsLoadingClips(false);
    }
  };

  const handleChallengeSelect = (challenge: Challenge) => {
    setSelectedChallenge(challenge);
    loadChallengeClips(challenge.id);
  };

  const isChallengeActive = (challenge: Challenge) => {
    if (!challenge.is_active) return false;
    const now = new Date();
    const endDate = challenge.end_date ? new Date(challenge.end_date) : null;
    return !endDate || endDate > now;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">Voice Challenges</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {challenges.length === 0 ? (
          <Card className="p-6 rounded-3xl text-center text-muted-foreground">
            <Trophy className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No active challenges at the moment.</p>
            <p className="text-sm mt-2">Check back soon for new topic-based challenges!</p>
          </Card>
        ) : (
          <>
            <div className="grid gap-4">
              {challenges.map((challenge) => (
                <Card
                  key={challenge.id}
                  className={`p-6 rounded-3xl cursor-pointer transition-all hover:shadow-lg ${
                    selectedChallenge?.id === challenge.id ? "border-2 border-primary" : ""
                  }`}
                  onClick={() => handleChallengeSelect(challenge)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <Trophy className="h-5 w-5 text-primary" />
                        <h3 className="text-xl font-bold">{challenge.title}</h3>
                        {isChallengeActive(challenge) && (
                          <Badge variant="default" className="ml-2">
                            Active
                          </Badge>
                        )}
                      </div>
                      {challenge.description && (
                        <p className="text-muted-foreground">{challenge.description}</p>
                      )}
                      {challenge.topics && (
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-4 h-4" />
                            <span>Topic: {challenge.topics.title}</span>
                          </div>
                          {challenge.end_date && (
                            <div className="flex items-center gap-1.5">
                              <Calendar className="w-4 h-4" />
                              <span>Ends: {format(new Date(challenge.end_date), "MMM d, yyyy")}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            {selectedChallenge && (
              <div className="space-y-4 mt-8">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">
                    Challenge Responses ({clips.length})
                  </h2>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/topic/${selectedChallenge.topic_id}`)}
                  >
                    View Topic
                  </Button>
                </div>

                {isLoadingClips ? (
                  <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-32 w-full rounded-2xl" />
                    ))}
                  </div>
                ) : clips.length === 0 ? (
                  <Card className="p-6 rounded-3xl text-center text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No responses yet for this challenge.</p>
                    <p className="text-sm mt-2">Be the first to participate!</p>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {clips.map((clip) => (
                      <ClipCard key={clip.id} clip={clip} captionsDefault={false} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default Challenges;

