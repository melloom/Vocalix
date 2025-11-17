import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Trophy, Calendar, Users, Bell, BellOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ClipCard } from "@/components/ClipCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useProfile } from "@/hooks/useProfile";
import { useChallengeFollow } from "@/hooks/useChallengeFollow";
import { format } from "date-fns";
import { toast } from "sonner";

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
  const { profile: viewerProfile } = useProfile();
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [selectedChallenge, setSelectedChallenge] = useState<Challenge | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingClips, setIsLoadingClips] = useState(false);
  const [followerCounts, setFollowerCounts] = useState<Record<string, number>>({});

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

        const challengesData = (data as Challenge[]) || [];
        setChallenges(challengesData);

        // Load follower counts for all challenges
        const challengeIds = challengesData.map((c) => c.id);
        if (challengeIds.length > 0) {
          const { data: countsData } = await supabase
            .from("challenge_follows")
            .select("challenge_id")
            .in("challenge_id", challengeIds);

          const counts: Record<string, number> = {};
          challengeIds.forEach((id) => {
            counts[id] = 0;
          });
          if (countsData) {
            countsData.forEach((follow: any) => {
              if (follow.challenge_id) {
                counts[follow.challenge_id] = (counts[follow.challenge_id] || 0) + 1;
              }
            });
          }
          setFollowerCounts(counts);
        }
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
                <ChallengeCard
                  key={challenge.id}
                  challenge={challenge}
                  isSelected={selectedChallenge?.id === challenge.id}
                  onSelect={() => handleChallengeSelect(challenge)}
                  followerCount={followerCounts[challenge.id] || 0}
                />
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

// Challenge Card Component with Follow Button
const ChallengeCard = ({
  challenge,
  isSelected,
  onSelect,
  followerCount,
}: {
  challenge: Challenge;
  isSelected: boolean;
  onSelect: () => void;
  followerCount: number;
}) => {
  const { profile: viewerProfile } = useProfile();
  const { isFollowing, toggleFollow, isToggling } = useChallengeFollow(challenge.id);
  const [localFollowerCount, setLocalFollowerCount] = useState(followerCount);

  useEffect(() => {
    setLocalFollowerCount(followerCount);
  }, [followerCount]);

  const isChallengeActive = (challenge: Challenge) => {
    if (!challenge.is_active) return false;
    const now = new Date();
    const endDate = challenge.end_date ? new Date(challenge.end_date) : null;
    return !endDate || endDate > now;
  };

  const handleFollowClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card selection when clicking follow button
    if (!viewerProfile?.id) {
      toast.error("Please log in to follow challenges");
      return;
    }

    toggleFollow();
    if (isFollowing) {
      setLocalFollowerCount((prev) => Math.max(0, prev - 1));
      toast.success("Unfollowed challenge");
    } else {
      setLocalFollowerCount((prev) => prev + 1);
      toast.success("Following challenge - you'll be notified of new clips");
    }
  };

  return (
    <Card
      className={`p-6 rounded-3xl transition-all hover:shadow-lg ${
        isSelected ? "border-2 border-primary" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div
          className="flex-1 space-y-2 cursor-pointer"
          onClick={onSelect}
        >
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
              {localFollowerCount > 0 && (
                <div className="flex items-center gap-1.5">
                  <Users className="w-4 h-4" />
                  <span>{localFollowerCount} {localFollowerCount === 1 ? "follower" : "followers"}</span>
                </div>
              )}
            </div>
          )}
        </div>
        {viewerProfile && (
          <Button
            variant={isFollowing ? "default" : "outline"}
            size="sm"
            onClick={handleFollowClick}
            disabled={isToggling}
            className="flex items-center gap-2 shrink-0"
          >
            {isFollowing ? (
              <>
                <BellOff className="h-4 w-4" />
                Unfollow
              </>
            ) : (
              <>
                <Bell className="h-4 w-4" />
                Follow
              </>
            )}
          </Button>
        )}
      </div>
    </Card>
  );
};

export default Challenges;

