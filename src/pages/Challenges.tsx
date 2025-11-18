import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Trophy, Calendar, Users, Bell, BellOff, Award, TrendingUp, Flame, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ClipCard } from "@/components/ClipCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProfile } from "@/hooks/useProfile";
import { useChallengeFollow } from "@/hooks/useChallengeFollow";
import { format } from "date-fns";
import { toast } from "sonner";
import { logError } from "@/lib/logger";

interface Challenge {
  id: string;
  topic_id: string;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  created_at: string;
  is_auto_generated?: boolean;
  challenge_type?: string;
  challenge_template?: string;
  leaderboard_enabled?: boolean;
  reward_points?: number;
  criteria?: Record<string, any>;
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
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [isLoadingLeaderboard, setIsLoadingLeaderboard] = useState(false);
  const [activeTab, setActiveTab] = useState<"clips" | "leaderboard">("clips");
  const [userStreak, setUserStreak] = useState<{ current: number; longest: number } | null>(null);
  const [challengeProgress, setChallengeProgress] = useState<Record<string, any>>({});

  useEffect(() => {
    const loadChallenges = async () => {
      try {
        // Generate daily challenges (multiple types)
        try {
          await supabase.rpc("generate_daily_challenges");
        } catch (err) {
          // Ignore errors - daily challenges might already exist or no topic available
          console.debug("Daily challenge generation:", err);
        }

        // Load user streak if logged in
        if (viewerProfile?.id) {
          const { data: profileData } = await supabase
            .from("profiles")
            .select("current_streak_days, longest_streak_days")
            .eq("id", viewerProfile.id)
            .single();
          
          if (profileData) {
            setUserStreak({
              current: profileData.current_streak_days || 0,
              longest: profileData.longest_streak_days || 0,
            });
          }
        }

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
        logError("Error loading challenges", error);
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

  const loadChallengeLeaderboard = async (challengeId: string) => {
    setIsLoadingLeaderboard(true);
    try {
      const { data, error } = await supabase.rpc("get_challenge_leaderboard", {
        p_challenge_id: challengeId,
        p_limit: 20,
      });

      if (error) throw error;
      setLeaderboard(data || []);
    } catch (error) {
      logError("Error loading leaderboard", error);
      setLeaderboard([]);
    } finally {
      setIsLoadingLeaderboard(false);
    }
  };

  const handleChallengeSelect = async (challenge: Challenge) => {
    setSelectedChallenge(challenge);
    setActiveTab("clips");
    loadChallengeClips(challenge.id);
    if (challenge.leaderboard_enabled !== false) {
      loadChallengeLeaderboard(challenge.id);
    }

    // Load challenge progress if user is logged in
    if (viewerProfile?.id) {
      try {
        const { data, error } = await supabase.rpc("check_challenge_progress", {
          p_challenge_id: challenge.id,
          p_profile_id: viewerProfile.id,
        });
        if (!error && data) {
          setChallengeProgress((prev) => ({
            ...prev,
            [challenge.id]: data,
          }));
        }
      } catch (err) {
        console.error("Error loading challenge progress:", err);
      }
    }
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
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold">Voice Challenges</h1>
          </div>
          {userStreak && userStreak.current > 0 && (
            <Badge variant="default" className="gap-1.5">
              <Flame className="h-4 w-4" />
              <span>{userStreak.current} day streak</span>
            </Badge>
          )}
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
                  progress={challengeProgress[challenge.id]}
                />
              ))}
            </div>

            {selectedChallenge && (
              <div className="space-y-4 mt-8">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">
                    {selectedChallenge.title}
                  </h2>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/topic/${selectedChallenge.topic_id}`)}
                  >
                    View Topic
                  </Button>
                </div>

                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "clips" | "leaderboard")}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="clips">Clips ({clips.length})</TabsTrigger>
                    <TabsTrigger value="leaderboard" disabled={selectedChallenge.leaderboard_enabled === false}>
                      Leaderboard
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="clips" className="space-y-4">
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
                  </TabsContent>

                  <TabsContent value="leaderboard" className="space-y-4">
                    {isLoadingLeaderboard ? (
                      <div className="space-y-4">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Skeleton key={i} className="h-20 w-full rounded-2xl" />
                        ))}
                      </div>
                    ) : leaderboard.length === 0 ? (
                      <Card className="p-6 rounded-3xl text-center text-muted-foreground">
                        <Award className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No leaderboard data yet.</p>
                        <p className="text-sm mt-2">Participate in the challenge to see rankings!</p>
                      </Card>
                    ) : (
                      <div className="space-y-3">
                        {leaderboard.map((entry, index) => (
                          <Card key={entry.profile_id} className="p-4 rounded-2xl">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-4">
                                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary font-bold">
                                  {entry.rank}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-lg">{entry.emoji_avatar}</span>
                                    <span className="font-semibold">@{entry.handle}</span>
                                  </div>
                                  <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                                    <span>{entry.clips_count} clips</span>
                                    <span>{entry.total_listens} listens</span>
                                    <span>{entry.total_reactions} reactions</span>
                                  </div>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="flex items-center gap-2">
                                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                                  <span className="font-bold text-lg">{Math.round(entry.score)}</span>
                                </div>
                                <span className="text-xs text-muted-foreground">points</span>
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
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
  progress,
}: {
  challenge: Challenge;
  isSelected: boolean;
  onSelect: () => void;
  followerCount: number;
  progress?: any;
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
              {challenge.reward_points && challenge.reward_points > 0 && (
                <div className="flex items-center gap-1.5">
                  <Award className="w-4 h-4" />
                  <span>{challenge.reward_points} points</span>
                </div>
              )}
            </div>
            {progress && (
              <div className="mt-3 space-y-2">
                {progress.type === 'react_to_clips' && (
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4 text-primary" />
                    <span className="text-sm">
                      {progress.reactions_count || 0} / {progress.target} reactions
                    </span>
                    {progress.completed && (
                      <Badge variant="default" className="ml-auto">Completed!</Badge>
                    )}
                  </div>
                )}
                {progress.type === 'record_memory' && (
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4 text-primary" />
                    <span className="text-sm">
                      {progress.clips_count || 0} / {progress.target} clips
                    </span>
                    {progress.completed && (
                      <Badge variant="default" className="ml-auto">Completed!</Badge>
                    )}
                  </div>
                )}
              </div>
            )}
            {challenge.challenge_template && challenge.challenge_template !== 'topic_based' && (
              <Badge variant="outline" className="mt-2">
                {challenge.challenge_template === 'record_memory' && '📝 Memory Challenge'}
                {challenge.challenge_template === 'react_to_clips' && '❤️ Engagement Challenge'}
                {challenge.challenge_template === 'daily_streak' && '🔥 Streak Challenge'}
              </Badge>
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

