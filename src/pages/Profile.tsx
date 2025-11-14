import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Zap, Bookmark, UserPlus, UserMinus, Trophy, Award, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ClipCard } from "@/components/ClipCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useProfile } from "@/hooks/useProfile";
import { useFollow, useFollowerCount, useFollowingCount } from "@/hooks/useFollow";
import { usePagination } from "@/hooks/usePagination";
import { ErrorDisplay } from "@/components/ErrorDisplay";
import { PaginationControls } from "@/components/PaginationControls";

interface ProfileMetrics {
  clipCount: number;
  listens: number;
  topEmoji: string | null;
}

interface ProfileData {
  id: string;
  handle: string;
  emoji_avatar: string;
  joined_at: string | null;
  city: string | null;
  consent_city: boolean | null;
  reputation: number | null;
  xp: number | null;
  level: number | null;
  total_karma: number | null;
  current_streak_days: number | null;
  longest_streak_days: number | null;
}

interface UserBadge {
  id: string;
  badge_id: string;
  earned_at: string;
  badges: {
    code: string;
    name: string;
    description: string;
    icon_emoji: string;
    category: string;
    rarity: string;
    community_id: string | null;
    is_custom: boolean;
  };
}

interface BadgeProgress {
  badge: {
    code: string;
    name: string;
    description: string;
    icon_emoji: string;
    category: string;
    criteria_type: string;
    criteria_value: number;
    rarity: string;
  };
  current: number;
  target: number;
  progress: number;
  unlocked: boolean;
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
  profiles: {
    handle: string;
    emoji_avatar: string;
  } | null;
}

const formatDate = (dateString: string | null) => {
  if (!dateString) return "Unknown";
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
  });
};

const aggregateMetrics = (clips: Clip[]): ProfileMetrics => {
  const clipCount = clips.length;
  const listens = clips.reduce((total, clip) => total + (clip.listens_count || 0), 0);
  const emojiCounts: Record<string, number> = {};

  clips.forEach((clip) => {
    Object.entries(clip.reactions || {}).forEach(([emoji, count]) => {
      const numericCount = typeof count === "number" ? count : Number(count);
      emojiCounts[emoji] = (emojiCounts[emoji] || 0) + (Number.isFinite(numericCount) ? numericCount : 0);
    });
  });

  let topEmoji: string | null = null;
  let topCount = 0;
  Object.entries(emojiCounts).forEach(([emoji, count]) => {
    if (count > topCount) {
      topEmoji = emoji;
      topCount = count;
    }
  });

  return { clipCount, listens, topEmoji };
};

const getReputationLevel = (reputation: number): { level: string; badge: string; color: string } => {
  if (reputation >= 10000) {
    return { level: "Legend", badge: "🏆", color: "text-yellow-500" };
  } else if (reputation >= 5000) {
    return { level: "Master", badge: "⭐", color: "text-purple-500" };
  } else if (reputation >= 2500) {
    return { level: "Expert", badge: "✨", color: "text-blue-500" };
  } else if (reputation >= 1000) {
    return { level: "Pro", badge: "🔥", color: "text-orange-500" };
  } else if (reputation >= 500) {
    return { level: "Rising", badge: "📈", color: "text-green-500" };
  } else if (reputation >= 100) {
    return { level: "Active", badge: "💫", color: "text-cyan-500" };
  } else {
    return { level: "New", badge: "🌱", color: "text-muted-foreground" };
  }
};

const getRarityColor = (rarity: string) => {
  switch (rarity) {
    case "legendary":
      return "bg-gradient-to-r from-yellow-500 to-orange-500 border-yellow-400";
    case "epic":
      return "bg-gradient-to-r from-purple-500 to-pink-500 border-purple-400";
    case "rare":
      return "bg-gradient-to-r from-blue-500 to-cyan-500 border-blue-400";
    default:
      return "bg-muted border-border";
  }
};

const Profile = () => {
  const { handle } = useParams<{ handle: string }>();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [userBadges, setUserBadges] = useState<UserBadge[]>([]);
  const [badgeProgress, setBadgeProgress] = useState<BadgeProgress[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const { profile: viewerProfile } = useProfile();
  const { isFollowing, toggleFollow, isFollowingUser, isUnfollowingUser } = useFollow(profile?.id ?? null);
  const { count: followerCount } = useFollowerCount(profile?.id ?? null);
  const { count: followingCount } = useFollowingCount(profile?.id ?? null);

  const metrics = useMemo(() => aggregateMetrics(clips), [clips]);
  const isOwnProfile = viewerProfile?.id === profile?.id;

  useEffect(() => {
    const loadProfile = async () => {
      if (!handle) return;
      setIsLoading(true);
      setError(null);

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .ilike("handle", handle)
        .single();

      if (profileError || !profileData) {
        setError("Profile not found");
        setIsLoading(false);
        return;
      }

      setProfile(profileData as ProfileData);

      // Load user badges
      const { data: badgesData } = await supabase
        .from("user_badges")
        .select(
          `
          *,
          badges (*)
        `
        )
        .eq("profile_id", profileData.id)
        .order("earned_at", { ascending: false })
        .limit(50);

      if (badgesData) {
        setUserBadges(badgesData as UserBadge[]);
      }

      // Load badge progress (will be calculated after clips load)
      const { data: allBadgesData } = await supabase
        .from("badges")
        .select("*")
        .is("community_id", null) // Only global badges for progress
        .order("criteria_value", { ascending: true })
        .limit(100); // Limit to prevent loading excessive badge definitions

      if (allBadgesData && profileData) {
        const { data: liveClipsData } = await supabase
          .from("clips")
          .select("id, listens_count, completion_rate, community_id, challenge_id")
          .eq("profile_id", profileData.id)
          .eq("status", "live");

        const clipsList = liveClipsData || [];
        const totalListens = clipsList.reduce((sum, c) => sum + (c.listens_count || 0), 0);
        const earnedBadgeIds = new Set((badgesData || []).map((ub: any) => ub.badge_id));

        const progress: BadgeProgress[] = allBadgesData.map((badge: any) => {
          let current = 0;
          let unlocked = earnedBadgeIds.has(badge.id);

          switch (badge.criteria_type) {
            case "clips_count":
              current = clipsList.length;
              break;
            case "listens_count":
              current = totalListens;
              break;
            case "avg_completion_rate":
              const clipsWithRate = clipsList.filter(c => c.completion_rate != null);
              current = clipsWithRate.length > 0
                ? clipsWithRate.reduce((sum, c) => sum + (c.completion_rate || 0), 0) / clipsWithRate.length
                : 0;
              break;
            case "streak_days":
              current = profileData.current_streak_days || 0;
              break;
            case "community_clips":
              current = clipsList.filter(c => c.community_id != null).length;
              break;
          }

          const progressPercent = Math.min(100, (current / badge.criteria_value) * 100);

          return {
            badge,
            current,
            target: badge.criteria_value,
            progress: progressPercent,
            unlocked,
          };
        });

        setBadgeProgress(progress);
      }

      const { data: clipsData, error: clipsError } = await supabase
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
        .eq("profile_id", profileData.id)
        .in("status", ["live", "processing"])
        .order("created_at", { ascending: false })
        .limit(100);

      if (clipsError) {
        setError(clipsError.message || "Couldn't load clips");
      } else {
        setClips((clipsData as Clip[]) || []);
        setError(null);
        setRetryCount(0);
      }

      setIsLoading(false);
    };

    loadProfile();
  }, [handle, retryCount]);

  const handleRetry = () => {
    setRetryCount((prev) => prev + 1);
  };

  const {
    paginatedData: paginatedClips,
    currentPage,
    totalPages,
    goToPage,
  } = usePagination(clips, { pageSize: 20 });

  if (!handle) {
    return <div className="p-8 text-center text-muted-foreground">Profile handle missing.</div>;
  }

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading profile...</div>;
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border">
          <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild className="rounded-full">
              <Link to="/">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <h1 className="text-2xl font-bold">Profile</h1>
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-6">
          <ErrorDisplay
            title={error ? "Failed to load profile" : "Profile not found"}
            message={error ?? "The profile you're looking for doesn't exist."}
            onRetry={error ? handleRetry : undefined}
            variant="card"
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild className="rounded-full">
            <Link to="/">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">Profile</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-8">
        <section className="space-y-4 text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="text-6xl">{profile.emoji_avatar || "🎧"}</div>
            <div>
              <h2 className="text-3xl font-bold">{profile.handle}</h2>
              <p className="text-sm text-muted-foreground">Joined {formatDate(profile.joined_at)}</p>
              {profile.consent_city && profile.city && (
                <p className="text-sm text-muted-foreground">Based in {profile.city}</p>
              )}
            </div>
          </div>

          {/* Follow button - only show if not own profile */}
          {!isOwnProfile && viewerProfile && (
            <div className="flex justify-center">
              <Button
                onClick={toggleFollow}
                disabled={isFollowingUser || isUnfollowingUser}
                variant={isFollowing ? "outline" : "default"}
                size="lg"
                className="rounded-full px-6"
              >
                {isFollowing ? (
                  <>
                    <UserMinus className="mr-2 h-4 w-4" />
                    Unfollow
                  </>
                ) : (
                  <>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Follow
                  </>
                )}
              </Button>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <Card className="p-4 rounded-3xl text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Clips</p>
              <p className="text-2xl font-semibold">{metrics.clipCount}</p>
            </Card>
            <Card className="p-4 rounded-3xl text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Followers</p>
              <p className="text-2xl font-semibold">{followerCount}</p>
            </Card>
            <Card className="p-4 rounded-3xl text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Following</p>
              <p className="text-2xl font-semibold">{followingCount}</p>
            </Card>
          </div>

          {/* Reputation/Karma Section */}
          {profile.reputation !== null && (
            <Card className="p-6 rounded-3xl bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-primary" />
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Reputation</p>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <p className="text-4xl font-bold">{profile.reputation.toLocaleString()}</p>
                    <Badge variant="secondary" className="text-xs">
                      {getReputationLevel(profile.reputation).badge} {getReputationLevel(profile.reputation).level}
                    </Badge>
                  </div>
                  {profile.total_karma && profile.total_karma !== profile.reputation && (
                    <p className="text-xs text-muted-foreground">
                      Total Karma: {profile.total_karma.toLocaleString()}
                    </p>
                  )}
                  {profile.level && (
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <p className="text-xs text-muted-foreground">
                        Level {profile.level} • {profile.xp?.toLocaleString() || 0} XP
                      </p>
                    </div>
                  )}
                </div>
                <div className="text-5xl">
                  {getReputationLevel(profile.reputation).badge}
                </div>
              </div>
            </Card>
          )}

          {/* Streak Section */}
          {profile.current_streak_days && profile.current_streak_days > 0 && (
            <Card className="p-4 rounded-3xl bg-gradient-to-r from-orange-500/10 to-red-500/10 border-orange-500/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Current Streak</p>
                  <p className="text-2xl font-bold">{profile.current_streak_days} days 🔥</p>
                </div>
                {profile.longest_streak_days && profile.longest_streak_days > profile.current_streak_days && (
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Best</p>
                    <p className="text-lg font-semibold">{profile.longest_streak_days} days</p>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Badge Showcase */}
          {userBadges.length > 0 && (
            <Card className="p-6 rounded-3xl">
              <div className="flex items-center gap-2 mb-4">
                <Trophy className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-semibold">Badges</h3>
                <Badge variant="secondary" className="ml-auto">
                  {userBadges.length}
                </Badge>
              </div>
              <div className="grid grid-cols-4 md:grid-cols-6 gap-3">
                {userBadges.slice(0, 12).map((userBadge) => (
                  <div
                    key={userBadge.id}
                    className={`p-3 rounded-2xl border-2 ${getRarityColor(userBadge.badges.rarity)} text-center transition-transform hover:scale-110 cursor-pointer`}
                    title={userBadge.badges.name}
                  >
                    <div className="text-3xl mb-1">{userBadge.badges.icon_emoji}</div>
                    {userBadge.badges.is_custom && (
                      <div className="text-[8px] text-muted-foreground">Custom</div>
                    )}
                  </div>
                ))}
              </div>
              {userBadges.length > 12 && (
                <p className="text-xs text-muted-foreground text-center mt-3">
                  +{userBadges.length - 12} more badges
                </p>
              )}
            </Card>
          )}

          {metrics.topEmoji && (
            <Card className="p-4 rounded-3xl text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Top Emoji</p>
              <p className="text-2xl font-semibold">{metrics.topEmoji}</p>
            </Card>
          )}
        </section>

        <Tabs defaultValue="clips" className="w-full">
          <TabsList className="grid w-full grid-cols-3 rounded-2xl">
            <TabsTrigger value="clips" className="rounded-xl">
              Clips
            </TabsTrigger>
            <TabsTrigger value="badges" className="rounded-xl">
              <Trophy className="h-4 w-4 mr-2" />
              Badges ({userBadges.length})
            </TabsTrigger>
            <TabsTrigger value="progress" className="rounded-xl">
              <Award className="h-4 w-4 mr-2" />
              Progress
            </TabsTrigger>
          </TabsList>

          <TabsContent value="clips" className="space-y-4 mt-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Clips</h3>
              <div className="flex items-center gap-4">
                {viewerProfile && viewerProfile.handle === handle && (
                  <Button variant="ghost" size="sm" asChild className="h-auto px-3 py-1 rounded-full text-xs">
                    <Link to="/saved">
                      <Bookmark className="mr-1 h-3 w-3" />
                      Saved
                    </Link>
                  </Button>
                )}
                <p className="text-sm text-muted-foreground">{metrics.clipCount} published</p>
              </div>
            </div>

            {clips.length === 0 ? (
              <div className="p-6 rounded-3xl bg-muted text-center text-muted-foreground">
                No clips yet. Check back soon!
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  {paginatedClips.map((clip) => (
                    <ClipCard
                      key={clip.id}
                      clip={clip}
                      captionsDefault={viewerProfile?.default_captions ?? true}
                    />
                  ))}
                </div>
                {totalPages > 1 && (
                  <div className="mt-6">
                    <PaginationControls
                      currentPage={currentPage}
                      totalPages={totalPages}
                      onPageChange={goToPage}
                    />
                  </div>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="badges" className="space-y-6 mt-6">
            {userBadges.length === 0 ? (
              <Card className="p-12 rounded-3xl text-center">
                <Trophy className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">No badges yet. Start creating to unlock achievements!</p>
              </Card>
            ) : (
              <>
                {/* Recent Badges */}
                <Card className="p-6 rounded-3xl">
                  <h3 className="text-lg font-semibold mb-4">Recent Achievements</h3>
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                    {userBadges.slice(0, 6).map((userBadge) => (
                      <div
                        key={userBadge.id}
                        className={`p-4 rounded-2xl border-2 ${getRarityColor(userBadge.badges.rarity)} text-center`}
                      >
                        <div className="text-4xl mb-2">{userBadge.badges.icon_emoji}</div>
                        <p className="text-xs font-semibold mb-1">{userBadge.badges.name}</p>
                        <p className="text-[10px] text-muted-foreground line-clamp-2">
                          {userBadge.badges.description}
                        </p>
                        {userBadge.badges.is_custom && (
                          <Badge variant="outline" className="mt-2 text-[8px]">
                            Custom
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>

                {/* All Badges by Category */}
                <div className="space-y-4">
                  {["milestone", "quality", "streak", "community", "challenge", "social", "viral", "special", "creative", "karma", "level", "custom"].map((category) => {
                    const categoryBadges = userBadges.filter(
                      (ub) => ub.badges.category === category
                    );
                    if (categoryBadges.length === 0) return null;

                    return (
                      <Card key={category} className="p-6 rounded-3xl">
                        <h3 className="text-lg font-semibold mb-4 capitalize">
                          {category === "custom" ? "Custom Community Badges" : `${category} Badges`}
                        </h3>
                        <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                          {categoryBadges.map((ub) => (
                            <div
                              key={ub.id}
                              className={`p-4 rounded-2xl border-2 ${getRarityColor(ub.badges.rarity)} text-center`}
                            >
                              <div className="text-4xl mb-2">{ub.badges.icon_emoji}</div>
                              <p className="text-xs font-semibold">{ub.badges.name}</p>
                            </div>
                          ))}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="progress" className="space-y-6 mt-6">
            {/* Next Badges */}
            {badgeProgress.filter(bp => !bp.unlocked && bp.progress > 0).length > 0 && (
              <Card className="p-6 rounded-3xl">
                <div className="flex items-center gap-2 mb-4">
                  <Award className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-semibold">Next Badges</h3>
                </div>
                <div className="space-y-4">
                  {badgeProgress
                    .filter(bp => !bp.unlocked && bp.progress > 0)
                    .sort((a, b) => b.progress - a.progress)
                    .slice(0, 5)
                    .map((bp) => (
                      <div key={bp.badge.code} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="text-2xl">{bp.badge.icon_emoji}</div>
                            <div>
                              <p className="font-semibold text-sm">{bp.badge.name}</p>
                              <p className="text-xs text-muted-foreground">{bp.badge.description}</p>
                            </div>
                          </div>
                          <Badge variant="outline" className={getRarityColor(bp.badge.rarity)}>
                            {bp.badge.rarity}
                          </Badge>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">
                              {Math.round(bp.current)} / {bp.target}
                            </span>
                            <span className="font-semibold">{Math.round(bp.progress)}%</span>
                          </div>
                          <Progress value={bp.progress} className="h-2" />
                        </div>
                      </div>
                    ))}
                </div>
              </Card>
            )}

            {/* All Progress */}
            <Card className="p-6 rounded-3xl">
              <h3 className="text-lg font-semibold mb-4">All Badge Progress</h3>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {badgeProgress
                  .filter((bp) => !bp.unlocked)
                  .sort((a, b) => b.progress - a.progress)
                  .map((bp) => (
                    <div key={bp.badge.code} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{bp.badge.icon_emoji}</span>
                          <span className="text-sm font-medium">{bp.badge.name}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {Math.round(bp.current)} / {bp.target}
                        </span>
                      </div>
                      <Progress value={bp.progress} className="h-1.5" />
                    </div>
                  ))}
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Profile;

