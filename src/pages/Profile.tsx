import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Zap, Bookmark, UserPlus, UserMinus, Trophy, Award, Sparkles, Users, Ban, MoreVertical, Flag, BarChart3, Calendar, Clock, Settings, Share2, Edit2, Pencil, Camera, Image as ImageIcon, Palette, Shield, AlertTriangle, VolumeX, Pause, Trash2, Plus, Mic, Type, Video, MessageSquare, Heart, Send, Radio, Hash } from "lucide-react";
import { FindVoiceTwinDialog } from "@/components/FindVoiceTwinDialog";
import { supabase } from "@/integrations/supabase/client";
import { ClipCard } from "@/components/ClipCard";
import { ClipGridThumbnail } from "@/components/ClipGridThumbnail";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useProfile } from "@/hooks/useProfile";
import { useFollow, useFollowerCount, useFollowingCount, useMutualFollows } from "@/hooks/useFollow";
import { useBlock } from "@/hooks/useBlock";
import { getEmojiAvatar } from "@/utils/avatar";
import { toast } from "sonner";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { usePagination } from "@/hooks/usePagination";
import { ErrorDisplay } from "@/components/ErrorDisplay";
import { PaginationControls } from "@/components/PaginationControls";
import { ReportProfileDialog } from "@/components/ReportProfileDialog";
import { NetworkEffects } from "@/components/NetworkEffects";
import { SocialDiscovery } from "@/components/SocialDiscovery";
import { useToast } from "@/hooks/use-toast";
import { logError } from "@/lib/logger";
import { ClipAnalyticsDialog } from "@/components/ClipAnalyticsDialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { CoverImageUpload } from "@/components/CoverImageUpload";
import { ProfilePictureUpload } from "@/components/ProfilePictureUpload";
import { ColorSchemePicker } from "@/components/ColorSchemePicker";
import { useAdminStatus } from "@/hooks/useAdminStatus";
import { PostModal } from "@/components/PostModal";
import { PostCard } from "@/components/PostCard";
import { RecordModal } from "@/components/RecordModal";
import { CreateTopicModal } from "@/components/CreateTopicModal";

interface ProfileMetrics {
  clipCount: number;
  listens: number;
  topEmoji: string | null;
}

interface ProfileData {
  id: string;
  handle: string;
  emoji_avatar: string;
  profile_picture_url: string | null;
  cover_image_url: string | null;
  color_scheme: {
    primary: string | null;
    secondary: string | null;
    accent: string | null;
    background: string | null;
  } | null;
  bio: string | null;
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
  title: string | null;
  tags: string[] | null;
  scheduled_for?: string | null;
  visibility?: string;
  is_private?: boolean;
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
  const [showBlockDialog, setShowBlockDialog] = useState(false);
  const [showUnblockDialog, setShowUnblockDialog] = useState(false);
  const [isFindVoiceTwinDialogOpen, setIsFindVoiceTwinDialogOpen] = useState(false);
  const [selectedClipForVoiceTwin, setSelectedClipForVoiceTwin] = useState<string | null>(null);
  const [editingClip, setEditingClip] = useState<Clip | null>(null);
  const [editScheduledTime, setEditScheduledTime] = useState("");
  const [isUpdatingSchedule, setIsUpdatingSchedule] = useState(false);
  const [analyticsClip, setAnalyticsClip] = useState<Clip | null>(null);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
  const [updatingClipId, setUpdatingClipId] = useState<string | null>(null);
  const [isInlineEditingEnabled, setIsInlineEditingEnabled] = useState(true);
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [editingBio, setEditingBio] = useState("");
  const [isEditingCover, setIsEditingCover] = useState(false);
  const [isEditingProfilePic, setIsEditingProfilePic] = useState(false);
  const [isEditingColorScheme, setIsEditingColorScheme] = useState(false);
  const [clipViewMode, setClipViewMode] = useState<"grid" | "list">("grid");
  const { profile: viewerProfile, updateProfile, isUpdating } = useProfile();
  const { toast } = useToast();
  const { isFollowing, toggleFollow, isFollowingUser, isUnfollowingUser } = useFollow(profile?.id ?? null);
  const { count: followerCount } = useFollowerCount(profile?.id ?? null);
  const { count: followingCount } = useFollowingCount(profile?.id ?? null);
  const { mutualFollows, isLoading: isLoadingMutualFollows } = useMutualFollows(profile?.id ?? null);
  const { isBlocked, toggleBlock, isBlocking, isUnblocking } = useBlock(profile?.id ?? null);
  const { isAdmin } = useAdminStatus();

  // Admin moderation state
  const [showMuteDialog, setShowMuteDialog] = useState(false);
  const [showPauseDialog, setShowPauseDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showWarningDialog, setShowWarningDialog] = useState(false);
  const [showIPBanDialog, setShowIPBanDialog] = useState(false);
  const [muteReason, setMuteReason] = useState("");
  const [pauseReason, setPauseReason] = useState("");
  const [pauseDuration, setPauseDuration] = useState("24"); // hours
  const [deleteReason, setDeleteReason] = useState("");
  const [warningMessage, setWarningMessage] = useState("");
  const [warningType, setWarningType] = useState<"content" | "behavior" | "spam" | "harassment" | "other">("other");
  const [warningSeverity, setWarningSeverity] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [isModerating, setIsModerating] = useState(false);
  const [unacknowledgedWarnings, setUnacknowledgedWarnings] = useState<any[]>([]);
  const [profileIPs, setProfileIPs] = useState<any[]>([]);
  const [isLoadingIPs, setIsLoadingIPs] = useState(false);
  const [selectedIP, setSelectedIP] = useState<string | null>(null);
  const [ipBanReason, setIpBanReason] = useState("");
  const [ipBanExpires, setIpBanExpires] = useState("");

  // Content creation state
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [isTopicModalOpen, setIsTopicModalOpen] = useState(false);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [topics, setTopics] = useState<any[]>([]);
  const [drafts, setDrafts] = useState<any[]>([]);
  const [isLoadingPosts, setIsLoadingPosts] = useState(false);
  const [isLoadingTopics, setIsLoadingTopics] = useState(false);
  const [isLoadingDrafts, setIsLoadingDrafts] = useState(false);
  
  // User-created content state
  const [userCommunities, setUserCommunities] = useState<any[]>([]);
  const [userLiveRooms, setUserLiveRooms] = useState<any[]>([]);
  const [userChatRooms, setUserChatRooms] = useState<any[]>([]);
  const [isLoadingCommunities, setIsLoadingCommunities] = useState(false);
  const [isLoadingLiveRooms, setIsLoadingLiveRooms] = useState(false);
  const [isLoadingChatRooms, setIsLoadingChatRooms] = useState(false);
  const [unifiedFeed, setUnifiedFeed] = useState<any[]>([]);
  const [isLoadingFeed, setIsLoadingFeed] = useState(false);

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
          .select("id, listens_count, community_id, challenge_id")
          .eq("profile_id", profileData.id)
          .eq("status", "live");

        const clipsList = liveClipsData || [];
        const totalListens = clipsList.reduce((sum, c) => sum + (c.listens_count || 0), 0);
        const earnedBadgeIds = new Set((badgesData || []).map((ub: any) => ub.badge_id));

        // Calculate average completion rate from listens table if needed
        let avgCompletionRate = 0;
        const needsCompletionRate = allBadgesData.some((badge: any) => badge.criteria_type === "avg_completion_rate");
        if (needsCompletionRate && clipsList.length > 0) {
          const clipIds = clipsList.map(c => c.id);
          const { data: listensData } = await supabase
            .from("listens")
            .select("clip_id, completion_percentage")
            .in("clip_id", clipIds)
            .not("completion_percentage", "is", null);
          
          if (listensData && listensData.length > 0) {
            const completionRates = listensData.map(l => l.completion_percentage);
            avgCompletionRate = completionRates.reduce((sum, rate) => sum + (rate || 0), 0) / completionRates.length;
          }
        }

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
              current = avgCompletionRate;
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
        .in("status", viewerProfile?.id === profileData.id ? ["live", "processing", "hidden", "draft"] : ["live", "processing"])
        .order("created_at", { ascending: false })
        .limit(100);

      if (clipsError) {
        setError(clipsError.message || "Couldn't load clips");
      } else {
        setClips((clipsData as Clip[]) || []);
        setError(null);
        setRetryCount(0);
      }

      // Load posts if own profile
      if (viewerProfile?.id === profileData.id) {
        loadPosts(profileData.id);
        loadTopics(profileData.id);
        loadDrafts(profileData.id);
        loadUserCommunities(profileData.id);
        loadUserLiveRooms(profileData.id);
        loadUserChatRooms(profileData.id);
        loadUnifiedFeed(profileData.id);
      } else {
        // Load unified feed for viewing other profiles too
        loadUnifiedFeed(profileData.id);
      }

      setIsLoading(false);
    };

    loadProfile();
  }, [handle, retryCount, viewerProfile?.id]);

  // Load posts
  const loadPosts = async (profileId: string) => {
    setIsLoadingPosts(true);
    try {
      const { data, error } = await supabase
        .from("posts")
        .select(`
          *,
          profiles (handle, emoji_avatar),
          communities (name, slug)
        `)
        .eq("profile_id", profileId)
        .eq("status", "live")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setPosts(data || []);
    } catch (error) {
      logError("Failed to load posts", error);
    } finally {
      setIsLoadingPosts(false);
    }
  };

  // Load topics
  const loadTopics = async (profileId: string) => {
    setIsLoadingTopics(true);
    try {
      const { data, error } = await supabase
        .from("topics")
        .select(`
          *,
          communities (name, slug)
        `)
        .eq("user_created_by", profileId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setTopics(data || []);
    } catch (error) {
      logError("Failed to load topics", error);
    } finally {
      setIsLoadingTopics(false);
    }
  };

  // Load drafts (clips and posts with status='draft')
  const loadDrafts = async (profileId: string) => {
    setIsLoadingDrafts(true);
    try {
      const [clipsData, postsData] = await Promise.all([
        supabase
          .from("clips")
          .select("*")
          .eq("profile_id", profileId)
          .eq("status", "draft")
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("posts")
          .select("*")
          .eq("profile_id", profileId)
          .eq("status", "draft")
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      const draftsList = [
        ...(clipsData.data || []).map(c => ({ ...c, type: 'clip' })),
        ...(postsData.data || []).map(p => ({ ...p, type: 'post' })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setDrafts(draftsList);
    } catch (error) {
      logError("Failed to load drafts", error);
    } finally {
      setIsLoadingDrafts(false);
    }
  };

  // Load user-created communities
  const loadUserCommunities = async (profileId: string) => {
    setIsLoadingCommunities(true);
    try {
      const { data, error } = await supabase
        .from("communities")
        .select(`
          *,
          profiles!created_by_profile_id (handle, emoji_avatar)
        `)
        .eq("created_by_profile_id", profileId)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setUserCommunities(data || []);
    } catch (error) {
      logError("Failed to load user communities", error);
    } finally {
      setIsLoadingCommunities(false);
    }
  };

  // Load user-hosted live rooms
  const loadUserLiveRooms = async (profileId: string) => {
    setIsLoadingLiveRooms(true);
    try {
      const { data, error } = await supabase
        .from("live_rooms")
        .select(`
          *,
          host_profile:host_profile_id (handle, emoji_avatar),
          communities (name, slug)
        `)
        .eq("host_profile_id", profileId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setUserLiveRooms(data || []);
    } catch (error) {
      logError("Failed to load user live rooms", error);
    } finally {
      setIsLoadingLiveRooms(false);
    }
  };

  // Load user-created chat rooms
  const loadUserChatRooms = async (profileId: string) => {
    setIsLoadingChatRooms(true);
    try {
      const { data, error } = await supabase
        .from("community_chat_rooms")
        .select(`
          *,
          profiles!created_by_profile_id (handle, emoji_avatar),
          communities (name, slug)
        `)
        .eq("created_by_profile_id", profileId)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setUserChatRooms(data || []);
    } catch (error) {
      logError("Failed to load user chat rooms", error);
    } finally {
      setIsLoadingChatRooms(false);
    }
  };

  // Load unified feed - all content from user (clips, posts, topics)
  const loadUnifiedFeed = async (profileId: string) => {
    setIsLoadingFeed(true);
    try {
      // Load clips, posts, and topics in parallel
      const [clipsResult, postsResult, topicsResult] = await Promise.all([
        supabase
          .from("clips")
          .select(`
            *,
            profiles (handle, emoji_avatar)
          `)
          .eq("profile_id", profileId)
          .in("status", viewerProfile?.id === profileId ? ["live", "processing", "hidden"] : ["live", "processing"])
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("posts")
          .select(`
            *,
            profiles (handle, emoji_avatar),
            communities (name, slug)
          `)
          .eq("profile_id", profileId)
          .eq("status", "live")
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("topics")
          .select(`
            *,
            communities (name, slug)
          `)
          .eq("user_created_by", profileId)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

      // Combine all content into unified feed
      const feedItems: any[] = [];

      // Add clips
      if (clipsResult.data) {
        clipsResult.data.forEach((clip) => {
          feedItems.push({
            type: "clip",
            id: clip.id,
            created_at: clip.created_at,
            data: clip,
          });
        });
      }

      // Add posts
      if (postsResult.data) {
        postsResult.data.forEach((post) => {
          feedItems.push({
            type: "post",
            id: post.id,
            created_at: post.created_at,
            data: post,
          });
        });
      }

      // Add topics
      if (topicsResult.data) {
        topicsResult.data.forEach((topic) => {
          feedItems.push({
            type: "topic",
            id: topic.id,
            created_at: topic.created_at,
            data: topic,
          });
        });
      }

      // Sort by created_at descending (newest first)
      feedItems.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setUnifiedFeed(feedItems);
    } catch (error) {
      logError("Failed to load unified feed", error);
    } finally {
      setIsLoadingFeed(false);
    }
  };

  // Load inline editing preference (default: true)
  useEffect(() => {
    const saved = localStorage.getItem("profile-inline-editing-enabled");
    if (saved !== null) {
      setIsInlineEditingEnabled(saved === "true");
    }
  }, []);

  // Load unacknowledged warnings (for the profile owner)
  useEffect(() => {
    const loadWarnings = async () => {
      if (!profile || !isOwnProfile) return;
      
      const { data } = await supabase
        .from("profile_warnings")
        .select("*")
        .eq("profile_id", profile.id)
        .eq("acknowledged", false)
        .order("created_at", { ascending: false });
      
      if (data) {
        setUnacknowledgedWarnings(data);
      }
    };
    
    loadWarnings();
  }, [profile, isOwnProfile, retryCount]);

  // Load IP addresses for admin
  const loadProfileIPs = async () => {
    if (!profile || !isAdmin) return;
    setIsLoadingIPs(true);
    try {
      const { data, error } = await supabase.rpc("get_profile_ip_addresses", {
        p_profile_id: profile.id,
      });
      if (error) throw error;
      setProfileIPs(data || []);
    } catch (error) {
      logError("Failed to load IP addresses", error);
    } finally {
      setIsLoadingIPs(false);
    }
  };

  // Save inline editing preference
  const handleToggleInlineEditing = (enabled: boolean) => {
    setIsInlineEditingEnabled(enabled);
    localStorage.setItem("profile-inline-editing-enabled", enabled.toString());
  };

  // Bio editing handlers
  const handleStartEditBio = () => {
    setEditingBio(profile?.bio || "");
    setIsEditingBio(true);
  };

  const handleSaveBio = async () => {
    if (!profile) return;
    try {
      await updateProfile({ bio: editingBio.trim() || null });
      toast({
        title: "Bio updated!",
        description: "Your bio has been updated.",
      });
      setIsEditingBio(false);
      // Reload profile to show updated bio
      setRetryCount((prev) => prev + 1);
    } catch (error: any) {
      toast({
        title: "Could not update bio",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleCancelEditBio = () => {
    setEditingBio(profile?.bio || "");
    setIsEditingBio(false);
  };

  const handleRetry = () => {
    setRetryCount((prev) => prev + 1);
  };

  // Admin moderation handlers
  const handleMuteProfile = async () => {
    if (!profile || !isAdmin) return;
    setIsModerating(true);
    try {
      const { error } = await supabase.rpc("moderate_profile", {
        p_profile_id: profile.id,
        p_action: profile.is_muted ? "unmute" : "mute",
        p_reason: muteReason || null,
      });

      if (error) throw error;

      toast({
        title: profile.is_muted ? "Profile unmuted" : "Profile muted",
        description: `@${profile.handle} has been ${profile.is_muted ? "unmuted" : "muted"}.`,
      });
      setShowMuteDialog(false);
      setMuteReason("");
      setRetryCount((prev) => prev + 1);
    } catch (error: any) {
      logError("Failed to mute profile", error);
      toast({
        title: "Could not mute profile",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsModerating(false);
    }
  };

  const handlePauseProfile = async () => {
    if (!profile || !isAdmin) return;
    setIsModerating(true);
    try {
      const pausedUntil = pauseDuration
        ? new Date(Date.now() + parseInt(pauseDuration) * 60 * 60 * 1000).toISOString()
        : null;

      const { error } = await supabase.rpc("moderate_profile", {
        p_profile_id: profile.id,
        p_action: profile.is_paused ? "unpause" : "pause",
        p_reason: pauseReason || null,
        p_paused_until: pausedUntil,
      });

      if (error) throw error;

      toast({
        title: profile.is_paused ? "Profile unpaused" : "Profile paused",
        description: `@${profile.handle} has been ${profile.is_paused ? "unpaused" : "paused"}.`,
      });
      setShowPauseDialog(false);
      setPauseReason("");
      setPauseDuration("24");
      setRetryCount((prev) => prev + 1);
    } catch (error: any) {
      logError("Failed to pause profile", error);
      toast({
        title: "Could not pause profile",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsModerating(false);
    }
  };

  const handleDeleteProfile = async () => {
    if (!profile || !isAdmin) return;
    setIsModerating(true);
    try {
      const { error } = await supabase.rpc("moderate_profile", {
        p_profile_id: profile.id,
        p_action: "delete",
        p_reason: deleteReason || null,
      });

      if (error) throw error;

      toast({
        title: "Profile deleted",
        description: `@${profile.handle} has been deleted.`,
      });
      setShowDeleteDialog(false);
      setDeleteReason("");
      setRetryCount((prev) => prev + 1);
    } catch (error: any) {
      logError("Failed to delete profile", error);
      toast({
        title: "Could not delete profile",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsModerating(false);
    }
  };

  const handleSendWarning = async () => {
    if (!profile || !isAdmin) return;
    setIsModerating(true);
    try {
      const { error } = await supabase.rpc("create_profile_warning", {
        p_profile_id: profile.id,
        p_warning_type: warningType,
        p_message: warningMessage,
        p_severity: warningSeverity,
      });

      if (error) throw error;

      toast({
        title: "Warning sent",
        description: `Warning has been sent to @${profile.handle}.`,
      });
      setShowWarningDialog(false);
      setWarningMessage("");
      setWarningType("other");
      setWarningSeverity("medium");
      setRetryCount((prev) => prev + 1);
    } catch (error: any) {
      logError("Failed to send warning", error);
      toast({
        title: "Could not send warning",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsModerating(false);
    }
  };

  const handleAcknowledgeWarning = async (warningId: string) => {
    try {
      const { error } = await supabase.rpc("acknowledge_warning", {
        p_warning_id: warningId,
      });

      if (error) throw error;

      toast({
        title: "Warning acknowledged",
        description: "Thank you for acknowledging the warning.",
      });
      setUnacknowledgedWarnings((prev) => prev.filter((w) => w.id !== warningId));
    } catch (error: any) {
      logError("Failed to acknowledge warning", error);
      toast({
        title: "Could not acknowledge warning",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleBanIP = async () => {
    if (!selectedIP || !profile || !isAdmin) return;
    setIsModerating(true);
    try {
      const expiresAt = ipBanExpires ? new Date(ipBanExpires).toISOString() : null;
      const { error } = await supabase.rpc("ban_ip_address", {
        p_ip_address: selectedIP,
        p_reason: ipBanReason || null,
        p_expires_at: expiresAt,
      });

      if (error) throw error;

      toast({
        title: "IP address banned",
        description: `${selectedIP} has been banned.`,
      });
      setShowIPBanDialog(false);
      setSelectedIP(null);
      setIpBanReason("");
      setIpBanExpires("");
      loadProfileIPs();
      // Log to moderation history
      await supabase.rpc("moderate_profile", {
        p_profile_id: profile.id,
        p_action: "ban",
        p_reason: `IP ban: ${selectedIP} - ${ipBanReason || "No reason provided"}`,
        p_details: JSON.stringify({ ip_address: selectedIP }),
      });
    } catch (error: any) {
      logError("Failed to ban IP", error);
      toast({
        title: "Could not ban IP address",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsModerating(false);
    }
  };

  const handleUnbanIP = async (ipAddress: string) => {
    if (!profile || !isAdmin) return;
    setIsModerating(true);
    try {
      const { error } = await supabase.rpc("unban_ip_address", {
        p_ip_address: ipAddress,
      });

      if (error) throw error;

      toast({
        title: "IP address unbanned",
        description: `${ipAddress} has been unbanned.`,
      });
      loadProfileIPs();
      // Log to moderation history
      await supabase.rpc("moderate_profile", {
        p_profile_id: profile.id,
        p_action: "unban",
        p_reason: `IP unban: ${ipAddress}`,
        p_details: JSON.stringify({ ip_address: ipAddress }),
      });
    } catch (error: any) {
      logError("Failed to unban IP", error);
      toast({
        title: "Could not unban IP address",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsModerating(false);
    }
  };

  // Clip management functions (only for own profile)
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

  const handleEditSchedule = (clip: Clip) => {
    if (clip.scheduled_for) {
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
    if (!editingClip || !editScheduledTime || !profile) return;

    try {
      setIsUpdatingSchedule(true);
      
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
      
      const scheduledFor = scheduledDate.toISOString();

      const { data: canSchedule, error: scheduleError } = await supabase
        .rpc('can_schedule_post', {
          profile_id_param: profile.id,
          scheduled_for_param: scheduledFor,
        });

      if (scheduleError) throw scheduleError;
      if (!canSchedule || canSchedule.length === 0 || !canSchedule[0].can_schedule) {
        throw new Error(canSchedule?.[0]?.reason || 'Cannot schedule post at this time');
      }

      const { error } = await supabase
        .from("clips")
        .update({ scheduled_for: scheduledFor })
        .eq("id", editingClip.id);

      if (error) throw error;

      setClips((prev) =>
        prev.map((clip) =>
          clip.id === editingClip.id ? { ...clip, scheduled_for: scheduledFor } : clip,
        ),
      );
      setEditingClip(null);
      setEditScheduledTime("");
      toast({
        title: "Schedule updated",
        description: "Your clip's scheduled time has been updated.",
      });
    } catch (error: any) {
      logError("Failed to update schedule", error);
      toast({
        title: "Could not update schedule",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingSchedule(false);
    }
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

  // Get color scheme or use defaults
  const colorScheme = profile.color_scheme || {
    primary: null,
    secondary: null,
    accent: null,
    background: null,
  };

  // Apply custom colors as CSS variables
  const profileStyle: React.CSSProperties = {};
  if (colorScheme.primary) {
    profileStyle['--profile-primary' as any] = colorScheme.primary;
  }
  if (colorScheme.secondary) {
    profileStyle['--profile-secondary' as any] = colorScheme.secondary;
  }
  if (colorScheme.accent) {
    profileStyle['--profile-accent' as any] = colorScheme.accent;
  }
  if (colorScheme.background) {
    profileStyle['--profile-background' as any] = colorScheme.background;
  }

  return (
    <div 
      className="min-h-screen pb-24 bg-gradient-to-b from-background via-background to-muted/20"
      style={{
        backgroundColor: colorScheme.background || undefined,
      }}
    >
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-xl border-b border-border/50 shadow-sm">
        <div className="w-full px-4 md:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild className="rounded-full hover:bg-primary/10 transition-colors">
              <Link to="/">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold bg-gradient-to-r from-foreground via-foreground to-foreground/70 bg-clip-text text-transparent">
                @{profile.handle}
              </h1>
              {profile.reputation && profile.reputation >= 1000 && (
                <Badge variant="secondary" className="text-xs">
                  {getReputationLevel(profile.reputation).badge} {getReputationLevel(profile.reputation).level}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isOwnProfile && (
              <>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50">
                  <Switch
                    checked={isInlineEditingEnabled}
                    onCheckedChange={handleToggleInlineEditing}
                    className="scale-75"
                  />
                  <span className="text-xs text-muted-foreground">Inline Edit</span>
                </div>
                <Button variant="outline" size="sm" asChild className="rounded-2xl">
                  <Link 
                    to="/settings?tab=personalization"
                    state={{ from: `/profile/${profile.handle}` }}
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Settings
                  </Link>
                </Button>
              </>
            )}
            {isAdmin && !isOwnProfile && profile && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="rounded-2xl border-destructive/50 text-destructive hover:bg-destructive/10">
                    <Shield className="h-4 w-4 mr-2" />
                    Admin
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="rounded-2xl">
                  <DropdownMenuItem onClick={() => setShowWarningDialog(true)}>
                    <AlertTriangle className="mr-2 h-4 w-4" />
                    Send Warning
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => {
                    loadProfileIPs();
                    setShowIPBanDialog(true);
                  }}>
                    <Ban className="mr-2 h-4 w-4" />
                    IP Ban
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowMuteDialog(true)}>
                    <VolumeX className="mr-2 h-4 w-4" />
                    {profile.is_muted ? "Unmute" : "Mute"} Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowPauseDialog(true)}>
                    <Pause className="mr-2 h-4 w-4" />
                    {profile.is_paused ? "Unpause" : "Pause"} Profile
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => setShowDeleteDialog(true)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Profile
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button variant="ghost" size="icon" className="rounded-full hover:bg-primary/10">
              <Share2 className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="w-full px-4 md:px-6 lg:px-8">
        {/* Unacknowledged Warnings Banner */}
        {isOwnProfile && unacknowledgedWarnings.length > 0 && (
          <div className="mb-4 p-4 rounded-3xl bg-destructive/10 border-2 border-destructive/30">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              <div className="flex-1 space-y-2">
                <h3 className="font-semibold text-destructive">You have unacknowledged warnings</h3>
                {unacknowledgedWarnings.map((warning) => (
                  <div key={warning.id} className="space-y-2 p-3 rounded-xl bg-background/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {warning.severity}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{warning.warning_type}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(warning.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-sm">{warning.message}</p>
                    <Button
                      size="sm"
                      onClick={() => handleAcknowledgeWarning(warning.id)}
                      className="rounded-xl"
                    >
                      Acknowledge
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Cover Image */}
        <div className="relative w-full h-64 md:h-80 lg:h-96 overflow-hidden group rounded-b-3xl">
          {profile.cover_image_url ? (
            <>
              <img
                src={profile.cover_image_url}
                alt="Cover"
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
            </>
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary/20 via-accent/15 to-primary/10 relative">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.15),transparent_50%)]" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(var(--primary),0.1),transparent_60%)]" />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
              <div className="absolute inset-0 flex items-center justify-center opacity-10">
                <div className="text-9xl">{getEmojiAvatar(profile.emoji_avatar, "🎧")}</div>
              </div>
            </div>
          )}
          {isOwnProfile && (
            <>
              {isInlineEditingEnabled ? (
                <Button
                  variant="secondary"
                  size="icon"
                  className="absolute top-4 right-4 rounded-full bg-background/90 backdrop-blur-sm hover:bg-background shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => setIsEditingCover(true)}
                >
                  <ImageIcon className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="icon"
                  className="absolute top-4 right-4 rounded-full bg-background/90 backdrop-blur-sm hover:bg-background shadow-lg"
                  asChild
                >
                  <Link 
                    to="/settings?tab=personalization"
                    state={{ from: `/profile/${profile.handle}` }}
                  >
                    <ImageIcon className="h-4 w-4" />
                  </Link>
                </Button>
              )}
            </>
          )}
        </div>

        {/* Profile Header Section */}
        <section className={`px-4 md:px-6 lg:px-8 ${profile.cover_image_url ? '-mt-16 md:-mt-20 lg:-mt-24' : 'pt-8'} relative z-10`}>
          <div className="flex flex-col md:flex-row items-start md:items-end gap-6 pb-8">
            {/* Profile Picture */}
            <div className="relative group">
              <div className="absolute -inset-2 bg-gradient-to-r from-primary/20 via-accent/20 to-primary/20 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <Avatar className="h-32 w-32 md:h-40 md:w-40 lg:h-44 lg:w-44 border-4 border-background shadow-2xl relative z-10 ring-4 ring-background/50">
                {profile.profile_picture_url ? (
                  <AvatarImage src={profile.profile_picture_url} alt={profile.handle} className="object-cover" />
                ) : (
                  <AvatarFallback className="text-5xl md:text-6xl lg:text-7xl bg-gradient-to-br from-primary/20 to-accent/20">
                    {getEmojiAvatar(profile.emoji_avatar, "🎧")}
                  </AvatarFallback>
                )}
              </Avatar>
              {isOwnProfile && (
                <>
                  {isInlineEditingEnabled ? (
                    <Button
                      variant="secondary"
                      size="icon"
                      className="absolute bottom-0 right-0 rounded-full bg-background border-2 border-background shadow-lg hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => setIsEditingProfilePic(true)}
                    >
                      <Camera className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      size="icon"
                      className="absolute bottom-0 right-0 rounded-full bg-background border-2 border-background shadow-lg hover:bg-muted"
                      asChild
                    >
                      <Link 
                        to="/settings?tab=personalization"
                        state={{ from: `/profile/${profile.handle}` }}
                      >
                        <Camera className="h-4 w-4" />
                      </Link>
                    </Button>
                  )}
                </>
              )}
            </div>

            {/* Profile Info */}
            <div className="flex-1 space-y-3 w-full">
              <div>
                <div className="flex items-center gap-3 group flex-wrap">
                  <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold bg-gradient-to-r from-foreground via-foreground to-foreground/80 bg-clip-text text-transparent">
                    {profile.handle}
                  </h2>
                  {isOwnProfile && isInlineEditingEnabled && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => setIsEditingColorScheme(true)}
                      title="Edit color scheme"
                    >
                      <Palette className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <div className="flex items-start gap-2 mt-2">
                  {isEditingBio && isOwnProfile && isInlineEditingEnabled ? (
                    <div className="flex-1 space-y-2">
                      <Textarea
                        value={editingBio}
                        onChange={(e) => setEditingBio(e.target.value)}
                        placeholder="Write a short bio..."
                        className="rounded-xl min-h-[80px] max-w-2xl"
                        maxLength={500}
                      />
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-muted-foreground">
                          {editingBio.length}/500 characters
                        </p>
                        <Button
                          size="sm"
                          onClick={handleSaveBio}
                          disabled={isUpdating}
                          className="rounded-xl h-7"
                        >
                          Save
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleCancelEditBio}
                          disabled={isUpdating}
                          className="rounded-xl h-7"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {profile.bio ? (
                        <p className="text-sm md:text-base text-muted-foreground max-w-2xl">
                          {profile.bio}
                        </p>
                      ) : (
                        isOwnProfile && isInlineEditingEnabled && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={handleStartEditBio}
                          >
                            <Pencil className="h-3 w-3 mr-1" />
                            Add bio
                          </Button>
                        )
                      )}
                      {isOwnProfile && profile.bio && isInlineEditingEnabled && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 rounded-full flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={handleStartEditBio}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                      )}
                      {isOwnProfile && !isInlineEditingEnabled && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 rounded-full flex-shrink-0"
                          asChild
                        >
                          <Link 
                            to="/settings?tab=personalization"
                            state={{ from: `/profile/${profile.handle}` }}
                          >
                            <Pencil className="h-3 w-3" />
                          </Link>
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                <p>Joined {formatDate(profile.joined_at)}</p>
                {profile.consent_city && profile.city && (
                  <p>📍 {profile.city}</p>
                )}
              </div>
            </div>
          </div>

          {/* Stats - Enhanced with more metrics */}
          <div className="grid grid-cols-3 md:grid-cols-5 gap-4 py-6 border-y border-border/50">
            <div className="text-center">
              <p className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                {metrics.clipCount}
              </p>
              <p className="text-xs md:text-sm text-muted-foreground mt-1 flex items-center justify-center gap-1">
                <Mic className="h-3 w-3" />
                clips
              </p>
            </div>
            <div className="text-center">
              <p className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                {followerCount}
              </p>
              <p className="text-xs md:text-sm text-muted-foreground mt-1 flex items-center justify-center gap-1">
                <Users className="h-3 w-3" />
                followers
              </p>
            </div>
            <div className="text-center">
              <p className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                {followingCount}
              </p>
              <p className="text-xs md:text-sm text-muted-foreground mt-1 flex items-center justify-center gap-1">
                <UserPlus className="h-3 w-3" />
                following
              </p>
            </div>
            {isOwnProfile && (
              <>
                <div className="text-center">
                  <p className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                    {isLoadingPosts ? '...' : posts.length}
                  </p>
                  <p className="text-xs md:text-sm text-muted-foreground mt-1 flex items-center justify-center gap-1">
                    <Type className="h-3 w-3" />
                    posts
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                    {isLoadingCommunities ? '...' : userCommunities.length}
                  </p>
                  <p className="text-xs md:text-sm text-muted-foreground mt-1 flex items-center justify-center gap-1">
                    <Users className="h-3 w-3" />
                    communities
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Follow button and Block menu - only show if not own profile */}
          {!isOwnProfile && viewerProfile && (
            <div className="flex gap-2 py-4">
              <Button
                onClick={toggleFollow}
                disabled={isFollowingUser || isUnfollowingUser || isBlocked}
                variant={isFollowing ? "outline" : "default"}
                size="lg"
                className="flex-1 rounded-full"
                style={colorScheme.primary && !isFollowing ? {
                  backgroundColor: colorScheme.primary,
                  borderColor: colorScheme.primary,
                } : undefined}
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="lg" className="rounded-full px-3">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="rounded-2xl">
                  {!isOwnProfile && (
                    <ReportProfileDialog
                      profileId={profile.id}
                      profileHandle={profile.handle}
                      trigger={
                        <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                          <Flag className="mr-2 h-4 w-4" />
                          Report Profile
                        </DropdownMenuItem>
                      }
                    />
                  )}
                  {!isOwnProfile && (
                    <DropdownMenuSeparator />
                  )}
                  {isBlocked ? (
                    <DropdownMenuItem
                      onClick={() => setShowUnblockDialog(true)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Ban className="mr-2 h-4 w-4" />
                      Unblock User
                    </DropdownMenuItem>
                  ) : (
                    !isOwnProfile && (
                      <DropdownMenuItem
                        onClick={() => setShowBlockDialog(true)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Ban className="mr-2 h-4 w-4" />
                        Block User
                      </DropdownMenuItem>
                    )
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          {/* Mutual Follows Section - Simplified */}
          {!isOwnProfile && mutualFollows.length > 0 && (
            <div className="py-3 border-b border-border/50">
              <div className="flex items-center gap-2 mb-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">
                  {mutualFollows.length} {mutualFollows.length === 1 ? "mutual follow" : "mutual follows"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {mutualFollows.slice(0, 6).map((mutual) => (
                  <Link
                    key={mutual.id}
                    to={`/profile/${mutual.handle}`}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-muted/50 hover:bg-muted transition-colors text-sm"
                  >
                    <span>{mutual.emoji_avatar}</span>
                    <span className="font-medium">@{mutual.handle}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Reputation/Karma Section */}
          {profile.reputation !== null && (
            <Card 
              className="p-6 rounded-3xl bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20"
              style={colorScheme.primary ? {
                background: `linear-gradient(to bottom right, ${colorScheme.primary}15, ${colorScheme.primary}08)`,
                borderColor: colorScheme.primary + '30',
              } : undefined}
            >
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

          {/* Find Voice Twin Section - only show if user has clips */}
          {isOwnProfile && clips.length > 0 && (
            <Card className="p-6 rounded-3xl bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-500/20">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-purple-500" />
                    <h3 className="text-lg font-semibold">Find Your Voice Twin</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Discover other creators with similar voice characteristics
                  </p>
                </div>
                <Button
                  onClick={() => {
                    // Use the most recent clip
                    if (clips.length > 0) {
                      setSelectedClipForVoiceTwin(clips[0].id);
                      setIsFindVoiceTwinDialogOpen(true);
                    }
                  }}
                  variant="default"
                  className="rounded-full"
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  Find Twin
                </Button>
              </div>
            </Card>
          )}
        </section>

        {/* Quick Create Actions - Only for profile owners */}
        {isOwnProfile && (
          <Card className="p-6 rounded-3xl bg-gradient-to-br from-primary/5 to-accent/5 border-primary/20 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold mb-1">Quick Actions</h3>
                <p className="text-sm text-muted-foreground">Create content quickly from your profile</p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Button
                onClick={() => setIsRecordModalOpen(true)}
                className="rounded-2xl h-auto py-4 flex flex-col items-center gap-2 bg-primary hover:bg-primary/90"
                size="lg"
              >
                <Mic className="h-5 w-5" />
                <span className="text-sm font-medium">Record Clip</span>
              </Button>
              <Button
                onClick={() => setIsPostModalOpen(true)}
                variant="outline"
                className="rounded-2xl h-auto py-4 flex flex-col items-center gap-2 border-2 hover:bg-muted"
                size="lg"
              >
                <Type className="h-5 w-5" />
                <span className="text-sm font-medium">Create Post</span>
              </Button>
              <Button
                onClick={() => setIsTopicModalOpen(true)}
                variant="outline"
                className="rounded-2xl h-auto py-4 flex flex-col items-center gap-2 border-2 hover:bg-muted"
                size="lg"
              >
                <MessageSquare className="h-5 w-5" />
                <span className="text-sm font-medium">New Topic</span>
              </Button>
              <Button
                variant="outline"
                className="rounded-2xl h-auto py-4 flex flex-col items-center gap-2 border-2 hover:bg-muted"
                size="lg"
                asChild
              >
                <Link to="/communities">
                  <Users className="h-5 w-5" />
                  <span className="text-sm font-medium">Community</span>
                </Link>
              </Button>
            </div>
          </Card>
        )}

        <Tabs defaultValue="feed" className="w-full mt-4">
          <TabsList className={`flex w-full ${isOwnProfile ? 'flex-wrap' : ''} rounded-lg bg-muted/50 p-1 overflow-x-auto gap-1`}>
            <TabsTrigger value="feed" className="rounded-md data-[state=active]:bg-background flex-shrink-0">
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              Feed
            </TabsTrigger>
            <TabsTrigger value="clips" className="rounded-md data-[state=active]:bg-background flex-shrink-0">
              <Mic className="h-3.5 w-3.5 mr-1.5" />
              Clips
            </TabsTrigger>
            {isOwnProfile && (
              <>
                <TabsTrigger value="posts" className="rounded-md data-[state=active]:bg-background flex-shrink-0">
                  <Type className="h-3.5 w-3.5 mr-1.5" />
                  Posts
                </TabsTrigger>
                <TabsTrigger value="topics" className="rounded-md data-[state=active]:bg-background flex-shrink-0">
                  <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                  Topics
                </TabsTrigger>
                <TabsTrigger value="communities" className="rounded-md data-[state=active]:bg-background flex-shrink-0">
                  <Users className="h-3.5 w-3.5 mr-1.5" />
                  Communities
                </TabsTrigger>
                <TabsTrigger value="live-rooms" className="rounded-md data-[state=active]:bg-background flex-shrink-0">
                  <Radio className="h-3.5 w-3.5 mr-1.5" />
                  Live Rooms
                </TabsTrigger>
                <TabsTrigger value="chat-rooms" className="rounded-md data-[state=active]:bg-background flex-shrink-0">
                  <Hash className="h-3.5 w-3.5 mr-1.5" />
                  Chat Rooms
                </TabsTrigger>
                <TabsTrigger value="drafts" className="rounded-md data-[state=active]:bg-background flex-shrink-0">
                  <Clock className="h-3.5 w-3.5 mr-1.5" />
                  Drafts
                </TabsTrigger>
              </>
            )}
            <TabsTrigger value="badges" className="rounded-md data-[state=active]:bg-background flex-shrink-0">
              <Trophy className="h-3.5 w-3.5 mr-1.5" />
              Badges
            </TabsTrigger>
            <TabsTrigger value="progress" className="rounded-md data-[state=active]:bg-background flex-shrink-0">
              <Award className="h-3.5 w-3.5 mr-1.5" />
              Progress
            </TabsTrigger>
            {isOwnProfile && (
              <TabsTrigger value="analytics" className="rounded-md data-[state=active]:bg-background flex-shrink-0">
                <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
                Analytics
              </TabsTrigger>
            )}
          </TabsList>

          {/* Unified Feed Tab - Shows all content from user */}
          <TabsContent value="feed" className="space-y-4 mt-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">All Content</h3>
              <p className="text-sm text-muted-foreground">{unifiedFeed.length} items</p>
            </div>
            {isLoadingFeed ? (
              <div className="p-12 rounded-3xl bg-muted/50 text-center text-muted-foreground">
                Loading feed...
              </div>
            ) : unifiedFeed.length === 0 ? (
              <div className="p-12 rounded-3xl bg-muted/50 text-center">
                <Sparkles className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground font-medium mb-2">No content yet</p>
                <p className="text-sm text-muted-foreground">Start creating to see your content here!</p>
              </div>
            ) : (
              <div className="space-y-4">
                {unifiedFeed.map((item) => {
                  if (item.type === "clip") {
                    return (
                      <ClipCard
                        key={`clip-${item.id}`}
                        clip={item.data}
                        captionsDefault={viewerProfile?.default_captions ?? true}
                      />
                    );
                  } else if (item.type === "post") {
                    return (
                      <PostCard
                        key={`post-${item.id}`}
                        post={item.data}
                        onPostUpdate={() => profile && loadUnifiedFeed(profile.id)}
                      />
                    );
                  } else if (item.type === "topic") {
                    return (
                      <Card key={`topic-${item.id}`} className="p-6 rounded-3xl">
                        <div className="flex items-start gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <MessageSquare className="h-4 w-4 text-primary" />
                              <h4 className="font-semibold text-lg">{item.data.title}</h4>
                              {item.data.communities && (
                                <Badge variant="outline" className="text-xs">
                                  {item.data.communities.name}
                                </Badge>
                              )}
                            </div>
                            {item.data.description && (
                              <p className="text-sm text-muted-foreground mb-3">{item.data.description}</p>
                            )}
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span>{new Date(item.data.created_at).toLocaleDateString()}</span>
                              {item.data.comment_count > 0 && (
                                <span>{item.data.comment_count} comments</span>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            asChild
                            className="rounded-full"
                          >
                            <Link to={`/topic/${item.data.id}`}>
                              <MessageSquare className="h-4 w-4" />
                            </Link>
                          </Button>
                        </div>
                      </Card>
                    );
                  }
                  return null;
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="clips" className="space-y-4 mt-6">
            {isOwnProfile ? (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Your Clips</h3>
                  <Button
                    onClick={() => setIsRecordModalOpen(true)}
                    size="sm"
                    className="rounded-full"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    New Clip
                  </Button>
                </div>
                {clips.length === 0 ? (
                  <div className="p-12 rounded-3xl bg-muted/50 text-center">
                    <Mic className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground font-medium mb-2">No clips yet</p>
                    <p className="text-sm text-muted-foreground mb-4">Start creating by recording your first clip!</p>
                    <Button onClick={() => setIsRecordModalOpen(true)} className="rounded-full">
                      <Mic className="h-4 w-4 mr-2" />
                      Record Your First Clip
                    </Button>
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
              </>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Clips</h3>
                  <p className="text-sm text-muted-foreground">{metrics.clipCount} published</p>
                </div>
                {clips.length === 0 ? (
                  <div className="p-12 rounded-3xl bg-muted/50 text-center text-muted-foreground">
                    <Mic className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="font-medium">No clips yet</p>
                    <p className="text-sm mt-1">Check back soon!</p>
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
              </>
            )}
          </TabsContent>

          {/* Posts Tab - Only for profile owners */}
          {isOwnProfile && (
            <TabsContent value="posts" className="space-y-4 mt-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Your Posts</h3>
                <Button
                  onClick={() => setIsPostModalOpen(true)}
                  size="sm"
                  className="rounded-full"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  New Post
                </Button>
              </div>
              {isLoadingPosts ? (
                <div className="p-12 rounded-3xl bg-muted/50 text-center text-muted-foreground">
                  Loading posts...
                </div>
              ) : posts.length === 0 ? (
                <div className="p-12 rounded-3xl bg-muted/50 text-center">
                  <Type className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground font-medium mb-2">No posts yet</p>
                  <p className="text-sm text-muted-foreground mb-4">Share your thoughts, videos, or links!</p>
                  <Button onClick={() => setIsPostModalOpen(true)} className="rounded-full">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Your First Post
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {posts.map((post) => (
                    <PostCard key={post.id} post={post} onPostUpdate={() => loadPosts(profile!.id)} />
                  ))}
                </div>
              )}
            </TabsContent>
          )}

          {/* Topics Tab - Only for profile owners */}
          {isOwnProfile && (
            <TabsContent value="topics" className="space-y-4 mt-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Your Topics</h3>
                <Button
                  onClick={() => setIsTopicModalOpen(true)}
                  size="sm"
                  className="rounded-full"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  New Topic
                </Button>
              </div>
              {isLoadingTopics ? (
                <div className="p-12 rounded-3xl bg-muted/50 text-center text-muted-foreground">
                  Loading topics...
                </div>
              ) : topics.length === 0 ? (
                <div className="p-12 rounded-3xl bg-muted/50 text-center">
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground font-medium mb-2">No topics yet</p>
                  <p className="text-sm text-muted-foreground mb-4">Start a conversation!</p>
                  <Button onClick={() => setIsTopicModalOpen(true)} className="rounded-full">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Your First Topic
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {topics.map((topic) => (
                    <Card key={topic.id} className="p-6 rounded-3xl">
                      <div className="flex items-start gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="font-semibold text-lg">{topic.title}</h4>
                            {topic.communities && (
                              <Badge variant="outline" className="text-xs">
                                {topic.communities.name}
                              </Badge>
                            )}
                          </div>
                          {topic.description && (
                            <p className="text-sm text-muted-foreground mb-3">{topic.description}</p>
                          )}
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span>{new Date(topic.created_at).toLocaleDateString()}</span>
                            {topic.comment_count > 0 && (
                              <span>{topic.comment_count} comments</span>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          asChild
                          className="rounded-full"
                        >
                          <Link to={`/topic/${topic.id}`}>
                            <MessageSquare className="h-4 w-4" />
                          </Link>
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          )}

          {/* Drafts Tab - Only for profile owners */}
          {isOwnProfile && (
            <TabsContent value="drafts" className="space-y-4 mt-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Drafts</h3>
                <p className="text-sm text-muted-foreground">{drafts.length} saved</p>
              </div>
              {isLoadingDrafts ? (
                <div className="p-12 rounded-3xl bg-muted/50 text-center text-muted-foreground">
                  Loading drafts...
                </div>
              ) : drafts.length === 0 ? (
                <div className="p-12 rounded-3xl bg-muted/50 text-center">
                  <Clock className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground font-medium mb-2">No drafts</p>
                  <p className="text-sm text-muted-foreground">Save your work as drafts to finish later</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {drafts.map((draft) => (
                    <Card key={draft.id} className="p-6 rounded-3xl">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline" className="text-xs">
                              {draft.type === 'clip' ? 'Clip' : 'Post'}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              {new Date(draft.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <h4 className="font-semibold mb-1">
                            {draft.title || draft.captions || 'Untitled'}
                          </h4>
                          {draft.content && (
                            <p className="text-sm text-muted-foreground line-clamp-2">{draft.content}</p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-full"
                            onClick={() => {
                              if (draft.type === 'clip') {
                                // Navigate to edit clip or open record modal with draft
                                setIsRecordModalOpen(true);
                                setSelectedTopicId(draft.topic_id);
                              } else {
                                setIsPostModalOpen(true);
                              }
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          )}

          {/* Communities Tab - Only for profile owners */}
          {isOwnProfile && (
            <TabsContent value="communities" className="space-y-4 mt-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Your Communities</h3>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  asChild
                >
                  <Link to="/communities">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Community
                  </Link>
                </Button>
              </div>
              {isLoadingCommunities ? (
                <div className="p-12 rounded-3xl bg-muted/50 text-center text-muted-foreground">
                  Loading communities...
                </div>
              ) : userCommunities.length === 0 ? (
                <div className="p-12 rounded-3xl bg-muted/50 text-center">
                  <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground font-medium mb-2">No communities yet</p>
                  <p className="text-sm text-muted-foreground mb-4">Create a community to bring people together!</p>
                  <Button variant="outline" className="rounded-full" asChild>
                    <Link to="/communities">
                      <Plus className="h-4 w-4 mr-2" />
                      Create Your First Community
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {userCommunities.map((community) => (
                    <Card key={community.id} className="p-6 rounded-3xl hover:shadow-lg transition-shadow">
                      <Link to={`/community/${community.slug}`} className="block">
                        <div className="flex items-start gap-4">
                          <div className="text-5xl shrink-0">
                            {community.avatar_emoji || '🎙️'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="font-semibold text-lg">r/{community.slug}</h4>
                              {community.is_private && (
                                <Badge variant="outline" className="text-xs">Private</Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                              {community.description || 'No description'}
                            </p>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                <span>{community.member_count || 0} members</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Mic className="h-3 w-3" />
                                <span>{community.clip_count || 0} clips</span>
                              </div>
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground">
                              Created {new Date(community.created_at).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                      </Link>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          )}

          {/* Live Rooms Tab - Only for profile owners */}
          {isOwnProfile && (
            <TabsContent value="live-rooms" className="space-y-4 mt-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Your Live Rooms</h3>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  asChild
                >
                  <Link to="/live-rooms">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Room
                  </Link>
                </Button>
              </div>
              {isLoadingLiveRooms ? (
                <div className="p-12 rounded-3xl bg-muted/50 text-center text-muted-foreground">
                  Loading live rooms...
                </div>
              ) : userLiveRooms.length === 0 ? (
                <div className="p-12 rounded-3xl bg-muted/50 text-center">
                  <Radio className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground font-medium mb-2">No live rooms yet</p>
                  <p className="text-sm text-muted-foreground mb-4">Host live audio discussions!</p>
                  <Button variant="outline" className="rounded-full" asChild>
                    <Link to="/live-rooms">
                      <Plus className="h-4 w-4 mr-2" />
                      Create Your First Live Room
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {userLiveRooms.map((room) => (
                    <Card key={room.id} className="p-6 rounded-3xl hover:shadow-lg transition-shadow">
                      <Link to={`/live-room/${room.id}`} className="block">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="font-semibold text-lg">{room.title}</h4>
                              {room.status === 'live' && (
                                <Badge className="bg-red-500 text-white text-xs animate-pulse">LIVE</Badge>
                              )}
                              {room.status === 'scheduled' && (
                                <Badge variant="outline" className="text-xs">Scheduled</Badge>
                              )}
                            </div>
                            {room.description && (
                              <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{room.description}</p>
                            )}
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              {room.communities && (
                                <div className="flex items-center gap-1">
                                  <Users className="h-3 w-3" />
                                  <span>{room.communities.name}</span>
                                </div>
                              )}
                              <div className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                <span>{room.participant_count || 0} participants</span>
                              </div>
                              {room.scheduled_for && (
                                <div className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  <span>{new Date(room.scheduled_for).toLocaleDateString()}</span>
                                </div>
                              )}
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground">
                              Created {new Date(room.created_at).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                      </Link>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          )}

          {/* Chat Rooms Tab - Only for profile owners */}
          {isOwnProfile && (
            <TabsContent value="chat-rooms" className="space-y-4 mt-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Your Chat Rooms</h3>
                <p className="text-sm text-muted-foreground">{userChatRooms.length} rooms</p>
              </div>
              {isLoadingChatRooms ? (
                <div className="p-12 rounded-3xl bg-muted/50 text-center text-muted-foreground">
                  Loading chat rooms...
                </div>
              ) : userChatRooms.length === 0 ? (
                <div className="p-12 rounded-3xl bg-muted/50 text-center">
                  <Hash className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground font-medium mb-2">No chat rooms yet</p>
                  <p className="text-sm text-muted-foreground">Create chat rooms in communities to start conversations!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {userChatRooms.map((chatRoom) => (
                    <Card key={chatRoom.id} className="p-6 rounded-3xl hover:shadow-lg transition-shadow">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="font-semibold text-lg">{chatRoom.name}</h4>
                            {!chatRoom.is_public && (
                              <Badge variant="outline" className="text-xs">Private</Badge>
                            )}
                          </div>
                          {chatRoom.description && (
                            <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{chatRoom.description}</p>
                          )}
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            {chatRoom.communities && (
                              <Link 
                                to={`/community/${chatRoom.communities.slug}`}
                                className="flex items-center gap-1 hover:text-primary transition-colors"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Users className="h-3 w-3" />
                                <span>{chatRoom.communities.name}</span>
                              </Link>
                            )}
                            <div className="flex items-center gap-1">
                              <MessageSquare className="h-3 w-3" />
                              <span>{chatRoom.message_count || 0} messages</span>
                            </div>
                            {chatRoom.last_message_at && (
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                <span>Last active {new Date(chatRoom.last_message_at).toLocaleDateString()}</span>
                              </div>
                            )}
                          </div>
                          <div className="mt-2 text-xs text-muted-foreground">
                            Created {new Date(chatRoom.created_at).toLocaleDateString()}
                          </div>
                        </div>
                        {chatRoom.communities && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-full"
                            asChild
                          >
                            <Link to={`/community/${chatRoom.communities.slug}`}>
                              View Community
                            </Link>
                          </Button>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          )}

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

          {isOwnProfile && (
            <>
              <TabsContent value="analytics" className="mt-6">
                <div className="text-center py-12">
                  <BarChart3 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground font-medium">Analytics</p>
                  <p className="text-sm text-muted-foreground mt-1">View detailed analytics for your clips</p>
                </div>
              </TabsContent>
            </>
          )}
        </Tabs>
      </main>

      {/* Block Confirmation Dialog */}
      <AlertDialog open={showBlockDialog} onOpenChange={setShowBlockDialog}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Block User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to block @{profile?.handle}? You won't see their clips, and they won't be able to interact with your content. You can unblock them later in Settings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-2xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await toggleBlock();
                  setShowBlockDialog(false);
                  toast.success("User blocked");
                } catch (error: any) {
                  toast.error(error.message || "Failed to block user");
                }
              }}
              disabled={isBlocking}
              className="rounded-2xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isBlocking ? "Blocking..." : "Block"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unblock Confirmation Dialog */}
      <AlertDialog open={showUnblockDialog} onOpenChange={setShowUnblockDialog}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Unblock User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to unblock @{profile?.handle}? You'll be able to see their clips again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-2xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await toggleBlock();
                  setShowUnblockDialog(false);
                  toast.success("User unblocked");
                } catch (error: any) {
                  toast.error(error.message || "Failed to unblock user");
                }
              }}
              disabled={isUnblocking}
              className="rounded-2xl"
            >
              {isUnblocking ? "Unblocking..." : "Unblock"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Find Voice Twin Dialog */}
      {selectedClipForVoiceTwin && (
        <FindVoiceTwinDialog
          clipId={selectedClipForVoiceTwin}
          open={isFindVoiceTwinDialogOpen}
          onOpenChange={(open) => {
            setIsFindVoiceTwinDialogOpen(open);
            if (!open) {
              setSelectedClipForVoiceTwin(null);
            }
          }}
        />
      )}

      {/* Inline Editing Dialogs */}
      {isOwnProfile && (
        <>
          {/* Cover Image Edit Dialog */}
          <Dialog open={isEditingCover} onOpenChange={setIsEditingCover}>
            <DialogContent className="rounded-3xl max-w-2xl">
              <DialogHeader>
                <DialogTitle>Edit Cover Image</DialogTitle>
                <DialogDescription>
                  Upload a new cover image for your profile
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <CoverImageUpload onSuccess={() => {
                  setIsEditingCover(false);
                  setRetryCount((prev) => prev + 1);
                }} />
              </div>
            </DialogContent>
          </Dialog>

          {/* Profile Picture Edit Dialog */}
          <Dialog open={isEditingProfilePic} onOpenChange={setIsEditingProfilePic}>
            <DialogContent className="rounded-3xl max-w-2xl">
              <DialogHeader>
                <DialogTitle>Edit Profile Picture</DialogTitle>
                <DialogDescription>
                  Upload a new profile picture
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <ProfilePictureUpload onSuccess={() => {
                  setIsEditingProfilePic(false);
                  setRetryCount((prev) => prev + 1);
                }} />
              </div>
            </DialogContent>
          </Dialog>

          {/* Color Scheme Edit Dialog */}
          <Dialog open={isEditingColorScheme} onOpenChange={setIsEditingColorScheme}>
            <DialogContent className="rounded-3xl max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Edit Color Scheme</DialogTitle>
                <DialogDescription>
                  Customize your profile colors. Changes apply globally across all pages.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <ColorSchemePicker onSuccess={() => {
                  setIsEditingColorScheme(false);
                  setRetryCount((prev) => prev + 1);
                }} />
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}

      {/* Admin Moderation Dialogs */}
      {isAdmin && profile && !isOwnProfile && (
        <>
          {/* Mute Dialog */}
          <Dialog open={showMuteDialog} onOpenChange={setShowMuteDialog}>
            <DialogContent className="rounded-3xl">
              <DialogHeader>
                <DialogTitle>{profile.is_muted ? "Unmute" : "Mute"} Profile</DialogTitle>
                <DialogDescription>
                  {profile.is_muted 
                    ? "Unmute this profile to restore their ability to interact."
                    : "Mute this profile to prevent them from interacting with content."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="mute-reason">Reason (optional)</Label>
                  <Textarea
                    id="mute-reason"
                    value={muteReason}
                    onChange={(e) => setMuteReason(e.target.value)}
                    placeholder="Enter reason for muting..."
                    className="rounded-xl"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowMuteDialog(false)} className="rounded-2xl">
                  Cancel
                </Button>
                <Button
                  onClick={handleMuteProfile}
                  disabled={isModerating}
                  className="rounded-2xl"
                >
                  {isModerating ? "Processing..." : profile.is_muted ? "Unmute" : "Mute"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Pause Dialog */}
          <Dialog open={showPauseDialog} onOpenChange={setShowPauseDialog}>
            <DialogContent className="rounded-3xl">
              <DialogHeader>
                <DialogTitle>{profile.is_paused ? "Unpause" : "Pause"} Profile</DialogTitle>
                <DialogDescription>
                  {profile.is_paused
                    ? "Unpause this profile to restore their access."
                    : "Pause this profile to temporarily restrict their access."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="pause-reason">Reason (optional)</Label>
                  <Textarea
                    id="pause-reason"
                    value={pauseReason}
                    onChange={(e) => setPauseReason(e.target.value)}
                    placeholder="Enter reason for pausing..."
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pause-duration">Duration (hours, optional)</Label>
                  <Input
                    id="pause-duration"
                    type="number"
                    value={pauseDuration}
                    onChange={(e) => setPauseDuration(e.target.value)}
                    placeholder="24"
                    className="rounded-xl"
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave empty for indefinite pause. Profile will auto-unpause after the specified hours.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowPauseDialog(false)} className="rounded-2xl">
                  Cancel
                </Button>
                <Button
                  onClick={handlePauseProfile}
                  disabled={isModerating}
                  className="rounded-2xl"
                >
                  {isModerating ? "Processing..." : profile.is_paused ? "Unpause" : "Pause"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Delete Dialog */}
          <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <AlertDialogContent className="rounded-3xl">
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Profile</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete the profile. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="delete-reason">Reason (required)</Label>
                  <Textarea
                    id="delete-reason"
                    value={deleteReason}
                    onChange={(e) => setDeleteReason(e.target.value)}
                    placeholder="Enter reason for deletion..."
                    className="rounded-xl"
                    required
                  />
                </div>
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-2xl">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteProfile}
                  disabled={isModerating || !deleteReason.trim()}
                  className="rounded-2xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isModerating ? "Deleting..." : "Delete Profile"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Warning Dialog */}
          <Dialog open={showWarningDialog} onOpenChange={setShowWarningDialog}>
            <DialogContent className="rounded-3xl max-w-2xl">
              <DialogHeader>
                <DialogTitle>Send Warning</DialogTitle>
                <DialogDescription>
                  Send a warning to this profile. They will need to acknowledge it.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="warning-type">Warning Type</Label>
                  <select
                    id="warning-type"
                    value={warningType}
                    onChange={(e) => setWarningType(e.target.value as any)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                  >
                    <option value="content">Content Violation</option>
                    <option value="behavior">Behavior Violation</option>
                    <option value="spam">Spam</option>
                    <option value="harassment">Harassment</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="warning-severity">Severity</Label>
                  <select
                    id="warning-severity"
                    value={warningSeverity}
                    onChange={(e) => setWarningSeverity(e.target.value as any)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="warning-message">Message (required)</Label>
                  <Textarea
                    id="warning-message"
                    value={warningMessage}
                    onChange={(e) => setWarningMessage(e.target.value)}
                    placeholder="Enter warning message..."
                    className="rounded-xl min-h-[100px]"
                    required
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowWarningDialog(false)} className="rounded-2xl">
                  Cancel
                </Button>
                <Button
                  onClick={handleSendWarning}
                  disabled={isModerating || !warningMessage.trim()}
                  className="rounded-2xl"
                >
                  {isModerating ? "Sending..." : "Send Warning"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* IP Ban Dialog */}
          <Dialog 
            open={showIPBanDialog} 
            onOpenChange={(open) => {
              setShowIPBanDialog(open);
              if (open && profile) {
                loadProfileIPs();
              } else {
                setSelectedIP(null);
                setIpBanReason("");
                setIpBanExpires("");
              }
            }}
          >
            <DialogContent className="rounded-3xl max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>IP Ban Management</DialogTitle>
                <DialogDescription>
                  Ban IP addresses associated with this profile. Banned IPs will be blocked from accessing the platform.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {/* Existing IPs */}
                <div className="space-y-2">
                  <Label>Associated IP Addresses</Label>
                  {isLoadingIPs ? (
                    <div className="p-4 text-center text-muted-foreground">Loading IP addresses...</div>
                  ) : profileIPs.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground rounded-xl bg-muted/50">
                      No IP addresses found for this profile.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {profileIPs.map((ip, index) => (
                        <Card key={index} className="p-4 rounded-xl">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <code className="font-mono text-sm font-semibold">{ip.ip_address}</code>
                                {ip.is_banned && (
                                  <Badge variant="destructive" className="text-xs">Banned</Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                                <span>{ip.device_count} device{ip.device_count !== 1 ? 's' : ''}</span>
                                {ip.last_seen_at && (
                                  <span>Last seen: {new Date(ip.last_seen_at).toLocaleDateString()}</span>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              {ip.is_banned ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleUnbanIP(ip.ip_address)}
                                  disabled={isModerating}
                                  className="rounded-xl"
                                >
                                  Unban
                                </Button>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedIP(ip.ip_address);
                                  }}
                                  className="rounded-xl"
                                >
                                  Ban
                                </Button>
                              )}
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>

                {/* Ban IP Form */}
                {selectedIP && (
                  <Card className="p-4 rounded-xl border-2 border-destructive/50 bg-destructive/5">
                    <div className="space-y-3">
                      <div>
                        <Label>IP Address to Ban</Label>
                        <code className="block mt-1 font-mono text-sm font-semibold p-2 rounded-lg bg-background">
                          {selectedIP}
                        </code>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="ip-ban-reason">Reason (optional)</Label>
                        <Textarea
                          id="ip-ban-reason"
                          value={ipBanReason}
                          onChange={(e) => setIpBanReason(e.target.value)}
                          placeholder="Enter reason for IP ban..."
                          className="rounded-xl"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="ip-ban-expires">Expires At (optional - leave empty for permanent)</Label>
                        <Input
                          id="ip-ban-expires"
                          type="datetime-local"
                          value={ipBanExpires}
                          onChange={(e) => setIpBanExpires(e.target.value)}
                          className="rounded-xl"
                        />
                        <p className="text-xs text-muted-foreground">
                          Leave empty for a permanent ban. Otherwise, the ban will automatically expire at the specified date/time.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="destructive"
                          onClick={handleBanIP}
                          disabled={isModerating}
                          className="rounded-xl"
                        >
                          {isModerating ? "Banning..." : "Confirm Ban"}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setSelectedIP(null);
                            setIpBanReason("");
                            setIpBanExpires("");
                          }}
                          className="rounded-xl"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </Card>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => {
                  setShowIPBanDialog(false);
                  setSelectedIP(null);
                  setIpBanReason("");
                  setIpBanExpires("");
                }} className="rounded-2xl">
                  Close
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}

      {/* Content Creation Modals */}
      {isOwnProfile && profile && (
        <>
          {/* Post Modal */}
          <PostModal
            isOpen={isPostModalOpen}
            onClose={() => setIsPostModalOpen(false)}
            onSuccess={() => {
              setIsPostModalOpen(false);
              loadPosts(profile.id);
              setRetryCount((prev) => prev + 1);
            }}
          />

          {/* Record Modal */}
          {isRecordModalOpen && (
            <RecordModal
              isOpen={isRecordModalOpen}
              onClose={() => {
                setIsRecordModalOpen(false);
                setSelectedTopicId(null);
              }}
              topicId={selectedTopicId || ""}
              onSuccess={() => {
                setIsRecordModalOpen(false);
                setSelectedTopicId(null);
                setRetryCount((prev) => prev + 1);
              }}
              profileCity={profile.city}
              profileConsentCity={profile.consent_city || false}
            />
          )}

          {/* Create Topic Modal */}
          <CreateTopicModal
            isOpen={isTopicModalOpen}
            onClose={() => setIsTopicModalOpen(false)}
            onSuccess={() => {
              setIsTopicModalOpen(false);
              loadTopics(profile.id);
            }}
          />
        </>
      )}
    </div>
  );
};

export default Profile;

