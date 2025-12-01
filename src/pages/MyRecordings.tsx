import { useEffect, useMemo, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Trophy, Flame, TrendingUp, Users, Target, Award, Star, Zap, BarChart3, Calendar, Clock, Sparkles, Crown, TrendingDown, Edit2, Settings, Share2, MoreVertical, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ClipCard } from "@/components/ClipCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CardSkeleton, PageHeaderSkeleton } from "@/components/ui/content-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProfile } from "@/hooks/useProfile";
import { usePagination } from "@/hooks/usePagination";
import { ErrorDisplay } from "@/components/ErrorDisplay";
import { PaginationControls } from "@/components/PaginationControls";
import { logError } from "@/lib/logger";
import { getEmojiAvatar } from "@/utils/avatar";
import { useToast } from "@/hooks/use-toast";
import { ClipAnalyticsDialog } from "@/components/ClipAnalyticsDialog";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ProfileMetrics {
  clipCount: number;
  listens: number;
  topEmoji: string | null;
  reputation: number;
  communityPoints: number;
  currentStreak: number;
  longestStreak: number;
  avgCompletionRate: number;
  xp: number;
  level: number;
  totalKarma: number;
  xpForNextLevel: number;
  xpInCurrentLevel: number;
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

interface LeaderboardPosition {
  rank: number;
  total: number;
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
  waveform?: number[];
  topic_id: string | null;
  moderation?: Record<string, unknown> | null;
  content_rating?: "general" | "sensitive";
  title: string | null;
  tags: string[] | null;
  completion_rate?: number | null;
  quality_score?: number | null;
  trending_score?: number | null;
  reply_count?: number;
  remix_count?: number;
  community_id?: string | null;
  challenge_id?: string | null;
  scheduled_for?: string | null;
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

const MyRecordings = () => {
  const { profile, isLoading: isProfileLoading } = useProfile();
  const [clips, setClips] = useState<Clip[]>([]);
  const [userBadges, setUserBadges] = useState<UserBadge[]>([]);
  const [badgeProgress, setBadgeProgress] = useState<BadgeProgress[]>([]);
  const [leaderboardPos, setLeaderboardPos] = useState<LeaderboardPosition | null>(null);
  const [challengeCount, setChallengeCount] = useState(0);
  const [communityClips, setCommunityClips] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [editingClip, setEditingClip] = useState<Clip | null>(null);
  const [editScheduledTime, setEditScheduledTime] = useState("");
  const [isUpdatingSchedule, setIsUpdatingSchedule] = useState(false);
  const [analyticsClip, setAnalyticsClip] = useState<Clip | null>(null);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
  const [updatingClipId, setUpdatingClipId] = useState<string | null>(null);
  const { toast } = useToast();

  const [freshProfileData, setFreshProfileData] = useState<{
    current_streak_days: number;
    longest_streak_days: number;
    community_points: number;
    reputation: number;
    xp: number;
    level: number;
    total_karma: number;
  } | null>(null);

  const metrics = useMemo(() => {
    const clipCount = clips.filter(c => c.status === 'live').length;
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

    // Calculate average completion rate
    const clipsWithCompletion = clips.filter(c => c.status === 'live' && c.completion_rate != null);
    const avgCompletionRate = clipsWithCompletion.length > 0
      ? clipsWithCompletion.reduce((sum, c) => sum + (c.completion_rate || 0), 0) / clipsWithCompletion.length
      : 0;

    // Use fresh profile data if available, otherwise fall back to profile
    const profileData = freshProfileData || profile;
    
    // Calculate XP for next level (exponential: 100 * 2^(level-1))
    const currentLevel = profileData?.level || profile?.level || 1;
    const currentXP = profileData?.xp || profile?.xp || 0;
    
    // XP needed for current level
    const xpForCurrentLevel = currentLevel > 1 ? 100 * Math.pow(2, currentLevel - 2) : 0;
    // XP needed for next level
    const xpForNextLevel = 100 * Math.pow(2, currentLevel - 1);
    // XP progress in current level
    const xpInCurrentLevel = currentXP - xpForCurrentLevel;
    // XP needed to reach next level
    const xpNeeded = xpForNextLevel - xpForCurrentLevel;

    return {
      clipCount,
      listens,
      topEmoji,
      reputation: profileData?.reputation || 0,
      communityPoints: profileData?.community_points || 0,
      currentStreak: profileData?.current_streak_days || 0,
      longestStreak: profileData?.longest_streak_days || 0,
      avgCompletionRate,
      xp: currentXP,
      level: currentLevel,
      totalKarma: profileData?.total_karma || profile?.total_karma || 0,
      xpForNextLevel: xpNeeded,
      xpInCurrentLevel: xpInCurrentLevel,
    } as ProfileMetrics;
  }, [clips, profile, freshProfileData]);

  const handleHideClip = useCallback(
    async (clipId: string) => {
      if (!clipId) return;
      setUpdatingClipId(clipId);
      try {
        const { error } = await supabase
          .from("clips")
          .update({ status: "hidden" })
          .eq("id", clipId);

        if (error) throw error;

        setClips((prev) =>
          prev.map((clip) =>
            clip.id === clipId ? { ...clip, status: "hidden" } : clip,
          ),
        );
        toast({
          title: "Clip hidden",
          description: "This clip is now hidden from public feeds.",
        });
      } catch (error) {
        logError("Failed to hide clip", error);
        toast({
          title: "Could not hide clip",
          description: "Please try again.",
          variant: "destructive",
        });
      } finally {
        setUpdatingClipId(null);
      }
    },
    [toast],
  );

  const handleMakePrivate = useCallback(
    async (clipId: string) => {
      if (!clipId) return;
      setUpdatingClipId(clipId);
      try {
        const { error } = await supabase
          .from("clips")
          .update({ visibility: "private", is_private: true })
          .eq("id", clipId);

        if (error) throw error;

        setClips((prev) =>
          prev.map((clip) =>
            clip.id === clipId
              ? { ...clip, visibility: "private", is_private: true as any }
              : clip,
          ),
        );
        toast({
          title: "Clip set to private",
          description: "Only you will be able to see this clip.",
        });
      } catch (error) {
        logError("Failed to set clip private", error);
        toast({
          title: "Could not update privacy",
          description: "Please try again.",
          variant: "destructive",
        });
      } finally {
        setUpdatingClipId(null);
      }
    },
    [toast],
  );

  const handleAnonymizeClip = useCallback(
    async (clipId: string) => {
      if (!clipId) return;
      setUpdatingClipId(clipId);
      try {
        const { error } = await supabase
          .from("clips")
          .update({
            title: null,
            summary: null,
            captions: null,
            tags: null,
          })
          .eq("id", clipId);

        if (error) throw error;

        setClips((prev) =>
          prev.map((clip) =>
            clip.id === clipId
              ? { ...clip, title: null, summary: null, captions: null, tags: null as any }
              : clip,
          ),
        );
        toast({
          title: "Clip anonymized",
          description: "We removed the title and description from this clip.",
        });
      } catch (error) {
        logError("Failed to anonymize clip", error);
        toast({
          title: "Could not anonymize clip",
          description: "Please try again.",
          variant: "destructive",
        });
      } finally {
        setUpdatingClipId(null);
      }
    },
    [toast],
  );

  const handleDeleteClip = useCallback(
    async (clipId: string) => {
      if (!clipId) return;
      if (!window.confirm("Delete this clip permanently? This cannot be undone.")) {
        return;
      }
      setUpdatingClipId(clipId);
      try {
        const { error } = await supabase
          .from("clips")
          .delete()
          .eq("id", clipId);

        if (error) throw error;

        setClips((prev) => prev.filter((clip) => clip.id !== clipId));
        toast({
          title: "Clip deleted",
          description: "The clip has been removed from your recordings.",
        });
      } catch (error) {
        logError("Failed to delete clip", error);
        toast({
          title: "Could not delete clip",
          description: "Please try again.",
          variant: "destructive",
        });
      } finally {
        setUpdatingClipId(null);
      }
    },
    [toast],
  );

  useEffect(() => {
    const loadAllData = async () => {
      if (!profile?.id) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        // Load clips with all needed fields
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
          .eq("profile_id", profile.id)
          .order("created_at", { ascending: false })
          .limit(100);

        // Also refresh profile to get latest streak, points, XP, and level
        const { data: freshProfile } = await supabase
          .from("profiles")
          .select("current_streak_days, longest_streak_days, community_points, reputation, last_post_date, xp, level, total_karma")
          .eq("id", profile.id)
          .single();

        if (clipsError) throw clipsError;

        setClips((clipsData as Clip[]) || []);
        setError(null);
        setRetryCount(0);
        
        if (freshProfile) {
          setFreshProfileData({
            current_streak_days: freshProfile.current_streak_days || 0,
            longest_streak_days: freshProfile.longest_streak_days || 0,
            community_points: freshProfile.community_points || 0,
            reputation: freshProfile.reputation || 0,
            xp: freshProfile.xp || 0,
            level: freshProfile.level || 1,
            total_karma: freshProfile.total_karma || 0,
          });
        }

        // Load user badges
        const { data: badgesData, error: badgesError } = await supabase
          .from("user_badges")
          .select(
            `
            *,
            badges (*)
          `
          )
          .eq("profile_id", profile.id)
          .order("earned_at", { ascending: false })
          .limit(200);

        if (!badgesError && badgesData) {
          setUserBadges(badgesData as UserBadge[]);
        }

        // Load all badges to calculate progress
        const { data: allBadgesData, error: allBadgesError } = await supabase
          .from("badges")
          .select("*")
          .order("criteria_value", { ascending: true })
          .limit(500);

        if (!allBadgesError && allBadgesData) {
          const liveClips = clipsData?.filter(c => c.status === 'live') || [];
          const totalListens = liveClips.reduce((sum, c) => sum + (c.listens_count || 0), 0);
          const communityClipsCount = liveClips.filter(c => c.community_id != null).length;
          const challengesParticipated = new Set(
            liveClips.filter(c => c.challenge_id != null).map(c => c.challenge_id)
          ).size;

          // Get earned badge IDs
          const earnedBadgeIds = new Set((badgesData || []).map((ub: any) => ub.badge_id));

          // Use fresh profile data if available, otherwise use profile from hook
          const currentStreak = freshProfile?.current_streak_days || profile?.current_streak_days || 0;

          const progress: BadgeProgress[] = allBadgesData.map((badge: any) => {
            let current = 0;
            let unlocked = earnedBadgeIds.has(badge.id);

            switch (badge.criteria_type) {
              case "clips_count":
                current = liveClips.length;
                break;
              case "listens_count":
                current = totalListens;
                break;
              case "avg_completion_rate":
                const clipsWithRate = liveClips.filter(c => c.completion_rate != null);
                current = clipsWithRate.length > 0
                  ? clipsWithRate.reduce((sum, c) => sum + (c.completion_rate || 0), 0) / clipsWithRate.length
                  : 0;
                break;
              case "streak_days":
                current = currentStreak;
                break;
              case "community_clips":
                current = communityClipsCount;
                break;
              case "challenges_participated":
                current = challengesParticipated;
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
          setCommunityClips(communityClipsCount);
          setChallengeCount(challengesParticipated);
        }

        // Get leaderboard position
        const { data: leaderboardData, error: leaderboardError } = await supabase
          .rpc("get_top_creators", {
            p_period: "all_time",
            p_limit: 1000,
          });

        if (!leaderboardError && leaderboardData) {
          const userRank = leaderboardData.findIndex((u: any) => u.profile_id === profile.id);
          if (userRank !== -1) {
            setLeaderboardPos({
              rank: userRank + 1,
              total: leaderboardData.length,
            });
          }
        }
      } catch (err: any) {
        const errorMessage = err?.message || "Couldn't load your profile data";
        setError(errorMessage);
        logError("Error loading data", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadAllData();
  }, [profile?.id, retryCount]);

  const handleRetry = () => {
    setRetryCount((prev) => prev + 1);
  };

  const handleEditSchedule = (clip: Clip) => {
    if (clip.scheduled_for) {
      // Convert ISO string to datetime-local format (YYYY-MM-DDTHH:mm)
      const date = new Date(clip.scheduled_for);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      setEditScheduledTime(`${year}-${month}-${day}T${hours}:${minutes}`);
      setEditingClip(clip);
    }
  };

  const handleUpdateSchedule = async () => {
    if (!editingClip || !editScheduledTime) return;

    try {
      setIsUpdatingSchedule(true);
      
      // Validate that the scheduled time is in the future (compare local time)
      const scheduledDate = new Date(editScheduledTime);
      if (scheduledDate.getTime() <= Date.now()) {
        toast({
          title: "Invalid time",
          description: "Scheduled time must be in the future.",
          variant: "destructive",
        });
        setIsUpdatingSchedule(false);
        return;
      }
      
      // Convert datetime-local to ISO string for storage
      const scheduledFor = scheduledDate.toISOString();

      // Validate scheduled post using can_schedule_post function
      if (profile?.id) {
        try {
          const { data: canSchedule, error: scheduleError } = await supabase
            .rpc('can_schedule_post', {
              profile_id_param: profile.id,
              scheduled_for_param: scheduledFor,
            });

          if (scheduleError) throw scheduleError;
          if (!canSchedule || canSchedule.length === 0 || !canSchedule[0].can_schedule) {
            throw new Error(canSchedule?.[0]?.reason || 'Cannot schedule post at this time');
          }
        } catch (error: any) {
          setIsUpdatingSchedule(false);
          toast({
            title: "Cannot schedule post",
            description: error.message || "Please check the scheduled time and limits.",
            variant: "destructive",
          });
          return;
        }
      }

      const { error: updateError } = await supabase
        .from("clips")
        .update({ scheduled_for: scheduledFor })
        .eq("id", editingClip.id)
        .eq("profile_id", profile?.id);

      if (updateError) {
        throw updateError;
      }

      // Update local state
      setClips((prevClips) =>
        prevClips.map((clip) =>
          clip.id === editingClip.id
            ? { ...clip, scheduled_for: scheduledFor }
            : clip
        )
      );

      toast({
        title: "Schedule updated! 📅",
        description: "Your post's scheduled time has been updated.",
      });

      setEditingClip(null);
      setEditScheduledTime("");
    } catch (err: any) {
      logError("Failed to update schedule", err);
      toast({
        title: "Failed to update schedule",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingSchedule(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingClip(null);
    setEditScheduledTime("");
  };

  const {
    paginatedData: paginatedClips,
    currentPage,
    totalPages,
    nextPage,
    previousPage,
    goToPage,
  } = usePagination(clips, { pageSize: 20 });

  if (isProfileLoading) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border">
          <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild className="rounded-full">
              <Link to="/">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <h1 className="text-2xl font-bold">My Profile</h1>
          </div>
        </header>
        <main className="max-w-4xl mx-auto px-4 py-6 space-y-8">
          <Skeleton className="h-64 w-full rounded-3xl" />
          <Skeleton className="h-32 w-full rounded-3xl" />
        </main>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border">
          <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild className="rounded-full">
              <Link to="/">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <h1 className="text-2xl font-bold">My Profile</h1>
          </div>
        </header>
        <main className="max-w-4xl mx-auto px-4 py-6">
          <Card className="p-6 rounded-3xl space-y-3 text-center text-muted-foreground">
            <p>Please sign in to view your profile.</p>
            <Button variant="outline" className="rounded-2xl mt-4" asChild>
              <Link to="/">Back to home</Link>
            </Button>
          </Card>
        </main>
      </div>
    );
  }

  const unlockedBadges = badgeProgress.filter(bp => bp.unlocked);
  const nextBadges = badgeProgress
    .filter(bp => !bp.unlocked && bp.progress > 0)
    .sort((a, b) => b.progress - a.progress)
    .slice(0, 3);

  const recentBadges = userBadges.slice(0, 5);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 pb-24">
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur-xl border-b border-border/30 shadow-sm">
        <div className="w-full px-4 md:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild className="rounded-full hover:bg-primary/10">
              <Link to="/">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">{profile.handle}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" asChild className="rounded-full hover:bg-primary/10">
              <Link to="/settings">
                <Settings className="h-5 w-5" />
              </Link>
            </Button>
            <Button variant="ghost" size="icon" asChild className="rounded-full hover:bg-primary/10">
              <Link to={`/profile/${profile.handle}`}>
                <User className="h-5 w-5" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="w-full">
        {/* Cover Image - Instagram/TikTok Style */}
        {profile.cover_image_url ? (
          <div className="relative w-full h-48 md:h-64 lg:h-80 overflow-hidden">
            <img
              src={profile.cover_image_url}
              alt="Cover"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
          </div>
        ) : (
          <div className="relative w-full h-48 md:h-64 lg:h-80 overflow-hidden bg-gradient-to-br from-primary/20 via-accent/15 to-primary/10">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.1),transparent_50%)]" />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
          </div>
        )}

        {/* Profile Header - Instagram/TikTok Style */}
        <section className={`px-4 md:px-6 lg:px-8 ${profile.cover_image_url ? '-mt-16 md:-mt-20' : 'pt-6'} relative z-10`}>
          <div className="flex flex-col md:flex-row items-start md:items-end gap-4 pb-6">
            {/* Profile Picture */}
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-primary via-accent to-primary rounded-full opacity-75 group-hover:opacity-100 blur-sm transition-opacity duration-300 animate-pulse" />
              <Avatar className="relative h-24 w-24 md:h-32 md:w-32 border-4 border-background shadow-2xl ring-4 ring-primary/20">
                {profile.profile_picture_url ? (
                  <AvatarImage src={profile.profile_picture_url} alt={profile.handle} />
                ) : (
                  <AvatarFallback className="text-4xl md:text-5xl bg-gradient-to-br from-primary/20 to-accent/20">
                    {getEmojiAvatar(profile.emoji_avatar, "🎧")}
                  </AvatarFallback>
                )}
              </Avatar>
            </div>

            {/* Profile Info */}
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-foreground via-primary to-accent bg-clip-text text-transparent">{profile.handle}</h2>
                <Button variant="outline" size="sm" asChild className="rounded-full bg-gradient-to-r from-primary/10 to-accent/10 border-primary/30 hover:from-primary/20 hover:to-accent/20 hover:border-primary/20 transition-all">
                  <Link to="/settings">
                    <Edit2 className="h-4 w-4 mr-2" />
                    Edit Profile
                  </Link>
                </Button>
                <Button variant="outline" size="icon" className="rounded-full bg-gradient-to-r from-primary/10 to-accent/10 border-primary/30 hover:from-primary/20 hover:to-accent/20 hover:border-primary/20 transition-all">
                  <Share2 className="h-4 w-4" />
                </Button>
              </div>
              
              {/* Stats Grid - Instagram Style with Enhanced Design */}
              <div className="flex items-center gap-4 md:gap-8">
                <div className="text-center group cursor-pointer">
                  <p className="text-lg md:text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent group-hover:scale-110 transition-transform">{metrics.clipCount}</p>
                  <p className="text-xs md:text-sm text-muted-foreground font-medium">Clips</p>
                </div>
                <div className="text-center group cursor-pointer">
                  <p className="text-lg md:text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent group-hover:scale-110 transition-transform">{metrics.listens.toLocaleString()}</p>
                  <p className="text-xs md:text-sm text-muted-foreground font-medium">Listens</p>
                </div>
                <div className="text-center group cursor-pointer">
                  <p className="text-lg md:text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent group-hover:scale-110 transition-transform">{metrics.reputation.toLocaleString()}</p>
                  <p className="text-xs md:text-sm text-muted-foreground font-medium">Reputation</p>
                </div>
                <div className="text-center group cursor-pointer">
                  <p className="text-lg md:text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent group-hover:scale-110 transition-transform">{metrics.communityPoints}</p>
                  <p className="text-xs md:text-sm text-muted-foreground font-medium">Points</p>
                </div>
              </div>

              {/* Bio & Info */}
              <div className="space-y-1">
                {profile.bio && (
                  <p className="text-sm md:text-base font-medium">{profile.bio}</p>
                )}
                <div className="flex flex-wrap items-center gap-3 text-xs md:text-sm text-muted-foreground">
                  <span>Joined {formatDate(profile.joined_at)}</span>
                  {profile.consent_city && profile.city && (
                    <>
                      <span>•</span>
                      <span>📍 {profile.city}</span>
                    </>
                  )}
                  {leaderboardPos && (
                    <>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" />
                        #{leaderboardPos.rank} of {leaderboardPos.total}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Level & XP Card - Enhanced with Better Colors */}
          <Card className="p-4 md:p-6 rounded-2xl md:rounded-3xl bg-gradient-to-br from-primary/15 via-accent/10 to-primary/5 border border-primary/20 shadow-xl shadow-primary/10 mb-4 hover:shadow-2xl hover:shadow-primary/20 transition-all duration-300 hover:scale-[1.02] relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 opacity-50" />
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 md:p-3 rounded-xl bg-gradient-to-br from-primary/30 to-accent/30 shadow-lg">
                    <Sparkles className="h-5 w-5 md:h-6 md:w-6 text-primary drop-shadow-lg" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">Level</p>
                    <p className="text-2xl md:text-3xl font-bold flex items-center gap-2 bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
                      {metrics.level}
                      {metrics.level >= 50 && <Crown className="h-5 w-5 md:h-6 md:w-6 text-yellow-500 drop-shadow-lg animate-pulse" />}
                      {metrics.level >= 20 && metrics.level < 50 && <Star className="h-4 w-4 md:h-5 md:w-5 text-purple-500 drop-shadow-lg" />}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground font-medium">Total Karma</p>
                  <p className="text-xl md:text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">{metrics.totalKarma.toLocaleString()}</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground font-medium">XP Progress</span>
                  <span className="font-semibold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                    {metrics.xp.toLocaleString()} / {metrics.xpForNextLevel.toLocaleString()} XP
                  </span>
                </div>
                <div className="relative">
                  <Progress 
                    value={Math.min(100, (metrics.xpInCurrentLevel / metrics.xpForNextLevel) * 100)} 
                    className="h-2 md:h-3 bg-muted/50"
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-primary via-accent to-primary opacity-20 rounded-full" />
                </div>
                <p className="text-[10px] md:text-xs text-muted-foreground text-center font-medium">
                  {Math.max(0, metrics.xpForNextLevel - metrics.xpInCurrentLevel).toLocaleString()} XP until Level {metrics.level + 1}
                </p>
              </div>
            </div>
          </Card>

          {/* Streak Card - Enhanced with Fire Effects */}
          {metrics.currentStreak > 0 && (
            <Card className="p-4 md:p-6 rounded-2xl md:rounded-3xl bg-gradient-to-r from-orange-500/20 via-red-500/15 to-orange-500/20 border border-orange-500/20 shadow-xl shadow-orange-500/20 mb-4 hover:shadow-2xl hover:shadow-orange-500/30 transition-all duration-300 hover:scale-[1.02] relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-orange-500/10 via-red-500/10 to-orange-500/10 animate-pulse" />
              <div className="relative z-10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 md:p-3 rounded-xl bg-gradient-to-br from-orange-500/40 to-red-500/40 shadow-lg">
                      <Flame className="h-5 w-5 md:h-6 md:w-6 text-orange-500 drop-shadow-lg animate-pulse" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground font-medium">Current Streak</p>
                      <p className="text-xl md:text-2xl font-bold bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent">{metrics.currentStreak} days 🔥</p>
                      {metrics.longestStreak > metrics.currentStreak && (
                        <p className="text-[10px] md:text-xs text-muted-foreground font-medium">Best: {metrics.longestStreak} days</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          )}
        </section>

        {/* Tabs - Enhanced with Better Styling */}
        <Tabs defaultValue="recordings" className="w-full px-4 md:px-6 lg:px-8">
          <TabsList className="grid w-full grid-cols-5 rounded-2xl border-b-2 border-primary/20 bg-gradient-to-r from-background via-background to-primary/5 backdrop-blur-sm">
            <TabsTrigger value="badges" className="rounded-xl">
              <Trophy className="h-4 w-4 mr-2" />
              Badges
            </TabsTrigger>
            <TabsTrigger value="progress" className="rounded-xl">
              <Target className="h-4 w-4 mr-2" />
              Progress
            </TabsTrigger>
            <TabsTrigger value="analytics" className="rounded-xl">
              <BarChart3 className="h-4 w-4 mr-2" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="recordings" className="rounded-xl">
              <Calendar className="h-4 w-4 mr-2" />
              Recordings
            </TabsTrigger>
            <TabsTrigger value="scheduled" className="rounded-xl">
              <Clock className="h-4 w-4 mr-2" />
              Scheduled
            </TabsTrigger>
          </TabsList>

          {/* Badges Tab */}
          <TabsContent value="badges" className="space-y-6 mt-6 px-4 md:px-6 lg:px-8">
            {/* Recent Achievements - Enhanced */}
            {recentBadges.length > 0 && (
              <Card className="p-6 rounded-3xl bg-gradient-to-br from-card via-card/95 to-primary/5 border border-primary/20 shadow-xl shadow-primary/5 hover:shadow-2xl hover:shadow-primary/10 transition-all duration-300">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-2 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20">
                    <Award className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold bg-gradient-to-r from-foreground to-primary bg-clip-text text-transparent">Recent Achievements</h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {recentBadges.map((userBadge) => (
                    <div
                      key={userBadge.id}
                      className={`p-4 rounded-2xl border ${getRarityColor(userBadge.badges.rarity)} text-center transition-all duration-300 hover:scale-110 hover:shadow-xl hover:shadow-primary/20 cursor-pointer`}
                    >
                      <div className="text-4xl mb-2 drop-shadow-lg">{userBadge.badges.icon_emoji}</div>
                      <p className="text-xs font-semibold mb-1">{userBadge.badges.name}</p>
                      <p className="text-[10px] text-muted-foreground line-clamp-2">
                        {userBadge.badges.description}
                      </p>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* All Badges by Category */}
            <div className="space-y-4">
              {["milestone", "quality", "streak", "community", "challenge", "social", "viral", "special", "creative", "karma", "level"].map((category) => {
                const categoryBadges = unlockedBadges.filter(
                  (bp) => bp.badge.category === category
                );
                if (categoryBadges.length === 0) return null;

                return (
                  <Card key={category} className="p-6 rounded-3xl bg-gradient-to-br from-card via-card/95 to-primary/5 border border-primary/20 shadow-lg hover:shadow-xl transition-all duration-300">
                    <h3 className="text-lg font-semibold mb-4 capitalize bg-gradient-to-r from-foreground to-primary bg-clip-text text-transparent">{category} Badges</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {categoryBadges.map((bp) => (
                        <div
                          key={bp.badge.code}
                          className={`p-4 rounded-2xl border ${getRarityColor(bp.badge.rarity)} text-center transition-all duration-300 hover:scale-105 hover:shadow-lg cursor-pointer`}
                        >
                          <div className="text-4xl mb-2 drop-shadow-lg">{bp.badge.icon_emoji}</div>
                          <p className="text-xs font-semibold">{bp.badge.name}</p>
                        </div>
                      ))}
                    </div>
                  </Card>
                );
              })}
            </div>

            {unlockedBadges.length === 0 && (
              <Card className="p-12 rounded-3xl text-center bg-gradient-to-br from-card via-card/95 to-primary/5 border border-primary/20 shadow-xl">
                <div className="p-4 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 w-fit mx-auto mb-4">
                  <Trophy className="h-12 w-12 text-primary" />
                </div>
                <p className="text-muted-foreground font-medium">No badges yet. Start creating to unlock achievements!</p>
              </Card>
            )}
          </TabsContent>

          {/* Progress Tab */}
          <TabsContent value="progress" className="space-y-6 mt-6 px-4 md:px-6 lg:px-8">
            {/* Next Badges */}
            {nextBadges.length > 0 && (
              <Card className="p-6 rounded-3xl bg-gradient-to-br from-card via-card/95 to-primary/5 border border-primary/20 shadow-xl hover:shadow-2xl transition-all duration-300">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-2 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20">
                    <Target className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold bg-gradient-to-r from-foreground to-primary bg-clip-text text-transparent">Next Badges</h3>
                </div>
                <div className="space-y-4">
                  {nextBadges.map((bp) => (
                    <div key={bp.badge.code} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="text-2xl">{bp.badge.icon_emoji}</div>
                          <div>
                            <p className="font-semibold">{bp.badge.name}</p>
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
            <Card className="p-6 rounded-3xl bg-gradient-to-br from-card via-card/95 to-primary/5 border border-primary/20 shadow-xl">
              <h3 className="text-lg font-semibold mb-4 bg-gradient-to-r from-foreground to-primary bg-clip-text text-transparent">All Badge Progress</h3>
              <div className="space-y-4">
                {badgeProgress
                  .filter((bp) => !bp.unlocked)
                  .sort((a, b) => b.progress - a.progress)
                  .slice(0, 10)
                  .map((bp) => (
                    <div key={bp.badge.code} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{bp.badge.icon_emoji}</span>
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

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-6 mt-6 px-4 md:px-6 lg:px-8">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Clip Analytics</h3>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>Click any clip to view detailed analytics</span>
              </div>
            </div>

            {isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, index) => (
                  <CardSkeleton key={`analytics-skeleton-${index}`} showAvatar={true} showActions={true} lines={2} />
                ))}
              </div>
            ) : error ? (
              <ErrorDisplay
                title="Failed to load recordings"
                message={error}
                onRetry={handleRetry}
                variant="card"
              />
            ) : clips.filter(c => c.status === 'live').length === 0 ? (
              <Card className="p-12 rounded-3xl text-center bg-gradient-to-br from-card via-card/95 to-primary/5 border border-primary/20 shadow-xl">
                <div className="p-4 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 w-fit mx-auto mb-4">
                  <BarChart3 className="h-12 w-12 text-primary" />
                </div>
                <p className="text-muted-foreground mb-4 font-medium">No published clips yet.</p>
                <Button asChild className="rounded-2xl bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90">
                  <Link to="/">Start Recording</Link>
                </Button>
              </Card>
            ) : (
              <>
                <div className="space-y-4">
                  {clips
                    .filter(c => c.status === 'live')
                    .map((clip) => (
                      <Card 
                        key={clip.id} 
                        className="p-4 rounded-2xl cursor-pointer bg-gradient-to-br from-card via-card/95 to-primary/5 border border-primary/20 hover:border-primary/20 hover:shadow-xl hover:shadow-primary/10 transition-all duration-300 hover:scale-[1.02]"
                        onClick={() => {
                          setAnalyticsClip(clip);
                          setIsAnalyticsOpen(true);
                        }}
                      >
                        <div className="flex items-start gap-4">
                          <div className="flex-1">
                            <ClipCard
                              clip={clip}
                              captionsDefault={profile.default_captions ?? true}
                            />
                          </div>
                          <div className="flex flex-col items-end gap-2 min-w-[120px]">
                            <div className="text-right space-y-1">
                              <div className="text-sm text-muted-foreground">Listens</div>
                              <div className="text-lg font-bold">{clip.listens_count.toLocaleString()}</div>
                              {clip.completion_rate != null && (
                                <>
                                  <div className="text-sm text-muted-foreground">Completion</div>
                                  <div className="text-lg font-bold">
                                    {(clip.completion_rate * 100).toFixed(1)}%
                                  </div>
                                </>
                              )}
                              {clip.quality_score != null && (
                                <>
                                  <div className="text-sm text-muted-foreground">Quality</div>
                                  <div className="text-lg font-bold">
                                    {clip.quality_score.toFixed(1)}/10
                                  </div>
                                </>
                              )}
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-xl"
                              onClick={(e) => {
                                e.stopPropagation();
                                setAnalyticsClip(clip);
                                setIsAnalyticsOpen(true);
                              }}
                            >
                              <BarChart3 className="h-3 w-3 mr-1" />
                              View Analytics
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                </div>
              </>
            )}
          </TabsContent>

          {/* Recordings Tab */}
          <TabsContent value="recordings" className="space-y-6 mt-6 px-4 md:px-6 lg:px-8">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">All Recordings</h3>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>{metrics.clipCount} published</span>
                {communityClips > 0 && (
                  <span>• {communityClips} in communities</span>
                )}
                {challengeCount > 0 && (
                  <span>• {challengeCount} challenges</span>
                )}
              </div>
            </div>

            {isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, index) => (
                  <CardSkeleton key={`clip-skeleton-${index}`} showAvatar={true} showActions={true} lines={2} />
                ))}
              </div>
            ) : error ? (
              <ErrorDisplay
                title="Failed to load recordings"
                message={error}
                onRetry={handleRetry}
                variant="card"
              />
            ) : clips.length === 0 ? (
              <Card className="p-12 rounded-3xl text-center bg-gradient-to-br from-card via-card/95 to-primary/5 border border-primary/20 shadow-xl">
                <div className="p-4 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 w-fit mx-auto mb-4">
                  <Calendar className="h-12 w-12 text-primary" />
                </div>
                <p className="text-muted-foreground mb-4 font-medium">No recordings yet.</p>
                <Button asChild className="rounded-2xl bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90">
                  <Link to="/">Start Recording</Link>
                </Button>
              </Card>
            ) : (
              <>
                <div className="space-y-4">
                  {paginatedClips.map((clip) => (
                    <Card key={clip.id} className="p-4 rounded-2xl space-y-3 bg-gradient-to-br from-card via-card/95 to-primary/5 border border-primary/20 hover:border-primary/20 hover:shadow-xl hover:shadow-primary/10 transition-all duration-300 hover:scale-[1.01]">
                      <ClipCard
                        clip={clip}
                        captionsDefault={profile.default_captions ?? true}
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                        <div className="flex items-center flex-wrap gap-2">
                          <Badge variant="outline" className="rounded-full px-2 py-0.5 capitalize">
                            {clip.status === 'draft'
                              ? 'Draft'
                              : clip.status === 'hidden'
                              ? 'Hidden'
                              : 'Published'}
                          </Badge>
                          {/* @ts-ignore - visibility fields exist on clips */}
                          {clip.visibility === 'private' && (
                            <Badge variant="secondary" className="rounded-full px-2 py-0.5">
                              🔒 Private practice
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-full"
                            disabled={updatingClipId === clip.id}
                            onClick={() => handleHideClip(clip.id)}
                          >
                            Hide
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-full"
                            disabled={updatingClipId === clip.id}
                            onClick={() => handleMakePrivate(clip.id)}
                          >
                            Private
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-full"
                            disabled={updatingClipId === clip.id}
                            onClick={() => handleAnonymizeClip(clip.id)}
                          >
                            Anonymize
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-full text-destructive border-destructive/40"
                            disabled={updatingClipId === clip.id}
                            onClick={() => handleDeleteClip(clip.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    </Card>
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

          {/* Scheduled Tab */}
          <TabsContent value="scheduled" className="space-y-6 mt-6 px-4 md:px-6 lg:px-8">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Scheduled Posts</h3>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>{clips.filter(c => c.status === 'draft' && c.scheduled_for).length} scheduled</span>
              </div>
            </div>

            {isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, index) => (
                  <CardSkeleton key={`scheduled-skeleton-${index}`} showAvatar={true} showActions={true} lines={2} />
                ))}
              </div>
            ) : error ? (
              <ErrorDisplay
                title="Failed to load scheduled posts"
                message={error}
                onRetry={handleRetry}
                variant="card"
              />
            ) : clips.filter(c => c.status === 'draft' && c.scheduled_for).length === 0 ? (
              <Card className="p-12 rounded-3xl text-center bg-gradient-to-br from-card via-card/95 to-primary/5 border border-primary/20 shadow-xl">
                <div className="p-4 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 w-fit mx-auto mb-4">
                  <Clock className="h-12 w-12 text-primary" />
                </div>
                <p className="text-muted-foreground mb-4 font-medium">No scheduled posts yet.</p>
                <Button asChild className="rounded-2xl bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90">
                  <Link to="/">Schedule a Post</Link>
                </Button>
              </Card>
            ) : (
              <>
                <div className="space-y-4">
                  {clips
                    .filter(c => c.status === 'draft' && c.scheduled_for)
                    .sort((a, b) => {
                      const aTime = a.scheduled_for ? new Date(a.scheduled_for).getTime() : 0;
                      const bTime = b.scheduled_for ? new Date(b.scheduled_for).getTime() : 0;
                      return aTime - bTime;
                    })
                    .map((clip) => (
                      <Card key={clip.id} className="p-4 rounded-2xl border border-primary/20 bg-gradient-to-br from-card via-card/95 to-primary/5 hover:border-primary/20 hover:shadow-xl hover:shadow-primary/10 transition-all duration-300 hover:scale-[1.01]">
                        <div className="flex items-start gap-4">
                          <div className="flex-1">
                            <ClipCard
                              clip={clip}
                              captionsDefault={profile.default_captions ?? true}
                            />
                          </div>
                          <div className="flex flex-col items-end gap-2 min-w-[200px]">
                            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                              <Clock className="h-3 w-3 mr-1" />
                              Scheduled
                            </Badge>
                            {clip.scheduled_for && (
                              <div className="text-sm text-muted-foreground text-right">
                                <div className="font-semibold">
                                  {new Date(clip.scheduled_for).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric'
                                  })}
                                </div>
                                <div>
                                  {new Date(clip.scheduled_for).toLocaleTimeString('en-US', {
                                    hour: 'numeric',
                                    minute: '2-digit',
                                    hour12: true
                                  })}
                                </div>
                                <div className="text-xs mt-1">
                                  {new Date(clip.scheduled_for).getTime() > Date.now() 
                                    ? `In ${Math.ceil((new Date(clip.scheduled_for).getTime() - Date.now()) / (1000 * 60 * 60))} hours`
                                    : 'Ready to publish'
                                  }
                                </div>
                              </div>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditSchedule(clip)}
                              className="mt-2 rounded-xl"
                            >
                              <Edit2 className="h-3 w-3 mr-1" />
                              Edit
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>

        {/* Edit Schedule Dialog */}
        <Dialog open={!!editingClip} onOpenChange={(open) => !open && handleCancelEdit()}>
          <DialogContent className="rounded-3xl">
            <DialogHeader>
              <DialogTitle>Edit Scheduled Time</DialogTitle>
              <DialogDescription>
                Update when this post should be published.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="scheduled-time">Scheduled Date & Time</Label>
                <Input
                  id="scheduled-time"
                  type="datetime-local"
                  value={editScheduledTime}
                  onChange={(e) => setEditScheduledTime(e.target.value)}
                  min={new Date().toISOString().slice(0, 16)}
                  className="rounded-xl"
                />
                <p className="text-xs text-muted-foreground">
                  Select a date and time in the future for when this post should be published.
                </p>
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <Button
                  variant="outline"
                  onClick={handleCancelEdit}
                  disabled={isUpdatingSchedule}
                  className="rounded-xl"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleUpdateSchedule}
                  disabled={!editScheduledTime || isUpdatingSchedule}
                  className="rounded-xl"
                >
                  {isUpdatingSchedule ? "Updating..." : "Update Schedule"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Analytics Dialog */}
        <ClipAnalyticsDialog
          clip={analyticsClip}
          open={isAnalyticsOpen}
          onOpenChange={setIsAnalyticsOpen}
        />
      </main>
    </div>
  );
};

export default MyRecordings;
