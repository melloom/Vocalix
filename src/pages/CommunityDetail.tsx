import { useEffect, useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Users, Mic, Shield, Settings, UserPlus, UserMinus, Share2, Copy, Check, Eye, Heart, Radio, MessageSquare, Plus, HeartOff, Calendar, Clock, Bell, Tag, TrendingUp, Search, Pin, Star, Award } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ClipCard } from "@/components/ClipCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useProfile } from "@/hooks/useProfile";
import { useAdminStatus } from "@/hooks/useAdminStatus";
import { useCommunity, useCommunityMembership, useAddModerator, useRemoveModerator, useSearchUsers, useSetCommunitySuccessor, useClearCommunitySuccessor, useCommunityStatus, useTransferCommunityOwnership, useOwnershipTransferRateLimit } from "@/hooks/useCommunity";
import { ReviveCommunityDialog } from "@/components/ReviveCommunityDialog";
import { useCommunityFollow } from "@/hooks/useCommunityFollow";
import { toast } from "sonner";
import { RecordModal } from "@/components/RecordModal";
import { formatDistanceToNow } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LiveRoom } from "@/components/LiveRoom";
import { ChatRoom } from "@/components/ChatRoom";
import { useCommunityLiveRooms, useCreateLiveRoom } from "@/hooks/useLiveRooms";
import { useCommunityChatRooms, useCreateChatRoom } from "@/hooks/useChatRooms";
import { Textarea } from "@/components/ui/textarea";
import { logError, logWarn } from "@/lib/logger";
import { Switch } from "@/components/ui/switch";
import { CommunitySettings } from "@/components/CommunitySettings";
import { CommunityProjects } from "@/components/CommunityProjects";

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
  topic_id: string | null;
  community_id: string | null;
  content_rating?: "general" | "sensitive";
  title: string | null;
  tags: string[] | null;
  profiles: {
    handle: string;
    emoji_avatar: string;
  } | null;
}

interface Member {
  id: string;
  profile_id: string;
  joined_at: string;
  profiles: {
    handle: string;
    emoji_avatar: string;
  } | null;
}

const CommunityDetail = () => {
  const { slug } = useParams<{ slug: string }>();
  const { profile: viewerProfile } = useProfile();
  const { isAdmin } = useAdminStatus();
  const [clips, setClips] = useState<Clip[]>([]);
  const [isLoadingClips, setIsLoadingClips] = useState(true);
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [moderators, setModerators] = useState<any[]>([]);
  const [creatorProfile, setCreatorProfile] = useState<any>(null);
  const [relatedCommunities, setRelatedCommunities] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [isLoadingModerators, setIsLoadingModerators] = useState(false);
  const [isLoadingAnnouncements, setIsLoadingAnnouncements] = useState(false);
  const [isLoadingActivity, setIsLoadingActivity] = useState(false);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedLiveRoomId, setSelectedLiveRoomId] = useState<string | null>(null);
  const [selectedChatRoomId, setSelectedChatRoomId] = useState<string | null>(null);
  const [isCreateLiveRoomOpen, setIsCreateLiveRoomOpen] = useState(false);
  const [isCreateChatRoomOpen, setIsCreateChatRoomOpen] = useState(false);
  const [isCreateAnnouncementOpen, setIsCreateAnnouncementOpen] = useState(false);
  const [newAnnouncementTitle, setNewAnnouncementTitle] = useState("");
  const [newAnnouncementContent, setNewAnnouncementContent] = useState("");
  const [newAnnouncementPinned, setNewAnnouncementPinned] = useState(false);
  const [newLiveRoomTitle, setNewLiveRoomTitle] = useState("");
  const [newLiveRoomDescription, setNewLiveRoomDescription] = useState("");
  const [newLiveRoomScheduledTime, setNewLiveRoomScheduledTime] = useState("");
  const [newChatRoomName, setNewChatRoomName] = useState("");
  const [newChatRoomDescription, setNewChatRoomDescription] = useState("");
  const [liveRoomFilter, setLiveRoomFilter] = useState<"live" | "scheduled" | "newest">("live");
  const [isManageModeratorsOpen, setIsManageModeratorsOpen] = useState(false);
  const [moderatorSearchQuery, setModeratorSearchQuery] = useState("");
  const [successorSearchQuery, setSuccessorSearchQuery] = useState("");
  const [currentSuccessor, setCurrentSuccessor] = useState<any>(null);
  const [isReviveDialogOpen, setIsReviveDialogOpen] = useState(false);

  // First, get community ID from slug
  const [communityId, setCommunityId] = useState<string | null>(null);

  useEffect(() => {
    const loadCommunityBySlug = async () => {
      if (!slug) return;

      const { data, error } = await supabase
        .from("communities")
        .select("id")
        .eq("slug", slug)
        .single();

      if (error || !data) {
        return;
      }

      setCommunityId(data.id);
    };

    loadCommunityBySlug();
  }, [slug]);

  // Now get the full community details
  const { community: communityData, isLoading: isLoadingCommunityData, error: communityError, refetch: refetchCommunity } = useCommunity(communityId);
  const { isMember, toggleMembership, isJoining, isLeaving } = useCommunityMembership(communityId);
  const { isFollowing, toggleFollow, isFollowingCommunity, isUnfollowingCommunity } = useCommunityFollow(communityId);
  const { data: communityStatus } = useCommunityStatus(communityId);
  const transferOwnership = useTransferCommunityOwnership(communityId);
  const { data: rateLimitInfo } = useOwnershipTransferRateLimit(viewerProfile?.id || null);
  
  // Moderator management hooks
  const addModerator = useAddModerator(communityId);
  const removeModerator = useRemoveModerator(communityId);
  const { data: searchResults, isLoading: isSearchingUsers } = useSearchUsers(moderatorSearchQuery);
  
  // Successor management hooks
  const setSuccessor = useSetCommunitySuccessor(communityId);
  const clearSuccessor = useClearCommunitySuccessor(communityId);
  const { data: successorSearchResults } = useSearchUsers(successorSearchQuery);
  
  // Live rooms and chat rooms
  const { rooms: allLiveRooms } = useCommunityLiveRooms(communityId);
  const { rooms: chatRooms } = useCommunityChatRooms(communityId);
  const createLiveRoom = useCreateLiveRoom();
  const createChatRoom = useCreateChatRoom();

  // Filter and sort live rooms
  const liveRooms = useMemo(() => {
    let filtered = [...(allLiveRooms || [])];

    // Apply filter
    if (liveRoomFilter === "live") {
      filtered = filtered.filter((room) => room.status === "live");
    } else if (liveRoomFilter === "scheduled") {
      filtered = filtered.filter((room) => room.status === "scheduled");
    }
    // "newest" shows all but sorted by newest

    // Apply sorting
    if (liveRoomFilter === "newest") {
      filtered.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    } else if (liveRoomFilter === "live") {
      // For live rooms, sort by started_at (most recent first)
      filtered.sort((a, b) => {
        const aTime = a.started_at ? new Date(a.started_at).getTime() : 0;
        const bTime = b.started_at ? new Date(b.started_at).getTime() : 0;
        return bTime - aTime;
      });
    } else if (liveRoomFilter === "scheduled") {
      // For scheduled rooms, sort by scheduled_start_time (soonest first)
      filtered.sort((a, b) => {
        const aTime = a.scheduled_start_time ? new Date(a.scheduled_start_time).getTime() : 0;
        const bTime = b.scheduled_start_time ? new Date(b.scheduled_start_time).getTime() : 0;
        if (aTime === 0) return 1;
        if (bTime === 0) return -1;
        return aTime - bTime;
      });
    }

    return filtered;
  }, [allLiveRooms, liveRoomFilter]);

  useEffect(() => {
    const loadClips = async () => {
      if (!communityId) return;
      setIsLoadingClips(true);

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
        .eq("community_id", communityId)
        .in("status", ["live", "processing"])
        .order("created_at", { ascending: false });

      if (clipsError) {
        logError("Error loading clips", clipsError);
      } else {
        setClips((clipsData as Clip[]) || []);
      }
      setIsLoadingClips(false);
    };

    loadClips();
  }, [communityId]);

  useEffect(() => {
    const loadMembers = async () => {
      if (!communityId) return;
      setIsLoadingMembers(true);

      const { data: membersData, error: membersError } = await supabase
        .from("community_members")
        .select(
          `
          id,
          profile_id,
          joined_at,
          profiles (
            handle,
            emoji_avatar
          )
        `
        )
        .eq("community_id", communityId)
        .order("joined_at", { ascending: false })
        .limit(50);

      if (membersError) {
        logError("Error loading members", membersError);
      } else {
        setMembers((membersData as Member[]) || []);
      }
      setIsLoadingMembers(false);
    };

    if (communityData && (isMember || communityData.is_public)) {
      loadMembers();
    }
  }, [communityId, communityData, isMember]);

  // Load moderators
  useEffect(() => {
    const loadModerators = async () => {
      if (!communityId) return;
      setIsLoadingModerators(true);

      const { data: moderatorsData, error: moderatorsError } = await supabase
        .from("community_moderators")
        .select(
          `
          id,
          moderator_profile_id,
          elected_at,
          profiles!moderator_profile_id (
            handle,
            emoji_avatar
          )
        `
        )
        .eq("community_id", communityId)
        .order("elected_at", { ascending: true });

      if (moderatorsError) {
        logError("Error loading moderators", moderatorsError);
      } else {
        setModerators((moderatorsData || []).map((m: any) => ({
          ...m,
          profiles: Array.isArray(m.profiles) ? m.profiles[0] : m.profiles,
        })));
      }
      setIsLoadingModerators(false);
    };

    if (communityId) {
      loadModerators();
    }
  }, [communityId]);

  // Load creator profile
  useEffect(() => {
    const loadCreator = async () => {
      if (!communityData?.created_by_profile_id) return;

      const { data: creatorData, error: creatorError } = await supabase
        .from("profiles")
        .select("handle, emoji_avatar")
        .eq("id", communityData.created_by_profile_id)
        .single();

      if (!creatorError && creatorData) {
        setCreatorProfile(creatorData);
      }
    };

    if (communityData) {
      loadCreator();
    }
  }, [communityData]);

  // Load current successor
  useEffect(() => {
    const loadSuccessor = async () => {
      if (!communityId || !communityData?.successor_profile_id) {
        setCurrentSuccessor(null);
        return;
      }

      const { data: successorData, error: successorError } = await supabase
        .from("profiles")
        .select("id, handle, emoji_avatar")
        .eq("id", communityData.successor_profile_id)
        .single();

      if (!successorError && successorData) {
        setCurrentSuccessor(successorData);
      } else {
        setCurrentSuccessor(null);
      }
    };

    if (communityData) {
      loadSuccessor();
    }
  }, [communityId, communityData?.successor_profile_id]);

  // Load related communities
  useEffect(() => {
    const loadRelated = async () => {
      if (!communityId) return;

      // Get communities with similar member counts or created around the same time
      const { data: relatedData, error: relatedError } = await supabase
        .from("communities")
        .select("id, name, slug, avatar_emoji, member_count, description")
        .eq("is_active", true)
        .eq("is_public", true)
        .neq("id", communityId)
        .order("member_count", { ascending: false })
        .limit(5);

      if (!relatedError && relatedData) {
        setRelatedCommunities(relatedData);
      }
    };

    if (communityId) {
      loadRelated();
    }
  }, [communityId]);

  // Load announcements
  useEffect(() => {
    const loadAnnouncements = async () => {
      if (!communityId) return;
      setIsLoadingAnnouncements(true);

      try {
        const { data: announcementsData, error: announcementsError } = await supabase
          .from("community_announcements")
          .select(
            `
            *,
            profiles (
              handle,
              emoji_avatar
            )
          `
          )
          .eq("community_id", communityId)
          .order("is_pinned", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(5);

        if (announcementsError) {
          logError("Error loading announcements", announcementsError);
          // Don't show error if table doesn't exist yet (migration not run)
          if (announcementsError.code !== '42P01') {
            logWarn("Announcements table may not exist. Run the migration first.");
          }
        } else if (announcementsData) {
          setAnnouncements(announcementsData.map((a: any) => ({
            ...a,
            profiles: Array.isArray(a.profiles) ? a.profiles[0] : a.profiles,
          })));
        }
      } catch (error) {
        logError("Error loading announcements", error);
      } finally {
        setIsLoadingAnnouncements(false);
      }
    };

    if (communityId) {
      loadAnnouncements();
    }
  }, [communityId]);

  // Load activity feed
  useEffect(() => {
    const loadActivity = async () => {
      if (!communityId) return;
      setIsLoadingActivity(true);

      try {
        const { data: activityData, error: activityError } = await supabase
          .from("community_activity")
          .select(
            `
            *,
            profiles (
              handle,
              emoji_avatar
            )
          `
          )
          .eq("community_id", communityId)
          .order("created_at", { ascending: false })
          .limit(20);

        if (activityError) {
          logError("Error loading activity", activityError);
          if (activityError.code !== '42P01') {
            logWarn("Activity table may not exist. Run the migration first.");
          }
        } else if (activityData) {
          setActivity(activityData.map((a: any) => ({
            ...a,
            profiles: Array.isArray(a.profiles) ? a.profiles[0] : a.profiles,
          })));
        }
      } catch (error) {
        logError("Error loading activity", error);
      } finally {
        setIsLoadingActivity(false);
      }
    };

    if (communityId) {
      loadActivity();
    }
  }, [communityId]);

  // Load events
  useEffect(() => {
    const loadEvents = async () => {
      if (!communityId) return;
      setIsLoadingEvents(true);

      try {
        const { data: eventsData, error: eventsError } = await supabase
          .from("community_events")
          .select(
            `
            *,
            profiles (
              handle,
              emoji_avatar
            )
          `
          )
          .eq("community_id", communityId)
          .gte("event_date", new Date().toISOString())
          .order("event_date", { ascending: true })
          .limit(10);

        if (eventsError) {
          logError("Error loading events", eventsError);
          if (eventsError.code !== '42P01') {
            logWarn("Events table may not exist. Run the migration first.");
          }
        } else if (eventsData) {
          setEvents(eventsData.map((e: any) => ({
            ...e,
            profiles: Array.isArray(e.profiles) ? e.profiles[0] : e.profiles,
          })));
        }
      } catch (error) {
        logError("Error loading events", error);
      } finally {
        setIsLoadingEvents(false);
      }
    };

    if (communityId) {
      loadEvents();
    }
  }, [communityId]);

  const handleJoinLeave = async () => {
    if (!viewerProfile?.id) {
      toast.error("Please log in to join communities");
      return;
    }

    if (isMember) {
      toggleMembership();
    } else {
      // Check if community is dead before joining
      if (communityStatus?.is_dead) {
        // Check rate limits before showing dialog
        if (rateLimitInfo && !rateLimitInfo.allowed) {
          let description = `You've claimed ${rateLimitInfo.transfers_last_day}/${rateLimitInfo.max_per_day} communities today.`;
          if (rateLimitInfo.hours_since_last_transfer !== null && rateLimitInfo.hours_since_last_transfer < rateLimitInfo.min_hours_between_claims) {
            description += ` Wait ${Math.ceil(rateLimitInfo.min_hours_between_claims - rateLimitInfo.hours_since_last_transfer)} more hours.`;
          }
          toast.error(rateLimitInfo.reason || "Rate limit exceeded", {
            description,
          });
          return;
        }
        // Show revive dialog instead of joining directly
        setIsReviveDialogOpen(true);
      } else {
        // Normal join flow
        toggleMembership();
      }
    }
  };

  const handleReviveAccept = async () => {
    if (!communityId) return;
    
    try {
      // First join the community (if not already a member)
      if (!isMember) {
        // Use the join mutation directly
        const { error: joinError } = await supabase
          .from('community_members')
          .insert({
            profile_id: viewerProfile?.id,
            community_id: communityId,
          });
        
        if (joinError) throw joinError;
      }
      
      // Then transfer ownership (this will check rate limits and validate)
      await transferOwnership.mutateAsync();
      
      toast.success("🎉 You're now the host of this community!", {
        description: "Welcome! You can now manage and grow this community.",
      });
      
      // Refresh community data
      refetchCommunity();
    } catch (error: any) {
      console.error("Error reviving community:", error);
      // Show the actual error message from the server
      const errorMessage = error?.message || error?.error || "Failed to become host";
      toast.error(errorMessage, {
        description: "Please check the requirements and try again.",
      });
    }
  };

  const handleReviveDecline = () => {
    // Just join normally without becoming host
    toggleMembership();
  };

  const handleRecordSuccess = () => {
    setIsRecordModalOpen(false);
    // Reload clips
    if (communityId) {
      supabase
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
        .eq("community_id", communityId)
        .in("status", ["live", "processing"])
        .order("created_at", { ascending: false })
        .then(({ data, error }) => {
          if (!error && data) {
            setClips(data as Clip[]);
          }
        });
    }
    refetchCommunity();
  };

  if (!slug) {
    return <div className="p-8 text-center text-muted-foreground">Community slug missing.</div>;
  }

  if (isLoadingCommunityData || !communityId) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border">
          <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <Skeleton className="h-8 w-32" />
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
          <Skeleton className="h-48 w-full rounded-3xl" />
          <Skeleton className="h-32 w-full rounded-3xl" />
        </main>
      </div>
    );
  }

  if (communityError || !communityData) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border">
          <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild className="rounded-full">
              <Link to="/communities">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <h1 className="text-2xl font-bold">Community</h1>
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-6">
          <Card className="p-6 rounded-3xl text-center space-y-4">
            <p className="text-muted-foreground">
              {communityError instanceof Error ? communityError.message : "Community not found."}
            </p>
            <Button variant="outline" asChild>
              <Link to="/communities">Back to Communities</Link>
            </Button>
          </Card>
        </main>
      </div>
    );
  }

  const totalListens = clips.reduce((sum, clip) => sum + (clip.listens_count || 0), 0);
  const totalReactions = clips.reduce((sum, clip) => {
    const reactions = clip.reactions || {};
    return (
      sum +
      Object.values(reactions).reduce((emojiSum, count) => {
        const numeric = typeof count === "number" ? count : Number(count);
        return emojiSum + (Number.isFinite(numeric) ? numeric : 0);
      }, 0)
    );
  }, 0);

  const shareUrl = `${window.location.origin}/community/${slug}`;

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Community link copied!");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error("Couldn't copy link");
    }
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({
          title: communityData.name,
          text: communityData.description || `Join ${communityData.name} on Echo Garden`,
          url: shareUrl,
        });
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          logError("Failed to share", error);
        }
      }
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild className="rounded-full">
            <Link to="/communities">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-2xl">{communityData.avatar_emoji}</span>
            <h1 className="text-xl font-bold">{communityData.name}</h1>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsShareDialogOpen(true)}
              className="rounded-full"
            >
              <Share2 className="h-5 w-5" />
            </Button>
            {(communityData.is_creator || isAdmin) && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsSettingsDialogOpen(true)}
                className="rounded-full"
              >
                <Settings className="h-5 w-5" />
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Community Description Banner */}
            {communityData.description && (
              <Card className="p-4 rounded-2xl bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
                <p className="text-sm text-foreground">{communityData.description}</p>
              </Card>
            )}

            {/* Community Tags */}
            {communityData.tags && Array.isArray(communityData.tags) && communityData.tags.length > 0 && (
              <Card className="p-4 rounded-2xl">
                <div className="flex items-center gap-2 flex-wrap">
                  <Tag className="w-4 h-4 text-muted-foreground" />
                  {communityData.tags.map((tag: string, idx: number) => (
                    <Badge key={idx} variant="secondary" className="rounded-full">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </Card>
            )}

            {/* Announcements - Always visible for creators/moderators */}
            {((communityData.is_creator || isAdmin) || communityData.is_moderator || announcements.filter((a) => a.is_pinned).length > 0) && (
              <Card className="p-4 rounded-2xl border-primary/20 bg-primary/5">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Pin className="w-4 h-4 text-primary" />
                      <h3 className="font-semibold">Announcements</h3>
                    </div>
                    {((communityData.is_creator || isAdmin) || communityData.is_moderator) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setIsCreateAnnouncementOpen(true)}
                        className="text-xs"
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        Create
                      </Button>
                    )}
                  </div>
                  {isLoadingAnnouncements ? (
                    <Skeleton className="h-20 w-full rounded-xl" />
                  ) : announcements.filter((a) => a.is_pinned).length > 0 ? (
                    announcements
                      .filter((a) => a.is_pinned)
                      .map((announcement) => (
                        <div key={announcement.id} className="p-3 rounded-xl bg-background border">
                          <div className="flex items-start gap-2 mb-2">
                            <span className="text-lg">{announcement.profiles?.emoji_avatar || '👤'}</span>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-semibold text-sm">{announcement.title}</h4>
                                <Badge variant="outline" className="text-xs">Pinned</Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mb-1">
                                by u/{announcement.profiles?.handle || 'Unknown'} • {formatDistanceToNow(new Date(announcement.created_at), { addSuffix: true })}
                              </p>
                              <p className="text-sm text-muted-foreground">{announcement.content}</p>
                            </div>
                          </div>
                        </div>
                      ))
                  ) : ((communityData.is_creator || isAdmin) || communityData.is_moderator) ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No announcements yet. Click "Create" to add one!
                    </p>
                  ) : null}
                </div>
              </Card>
            )}

            {/* Search Bar */}
            <Card className="p-3 rounded-2xl">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search clips, members, events..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="border-0 bg-transparent focus-visible:ring-0"
                />
              </div>
            </Card>

            {/* Tabs for Clips, Members, Live Rooms, Chat, Activity, and Events */}
            <Tabs defaultValue="clips" className="space-y-4">
              <TabsList className="grid w-full grid-cols-3 sm:grid-cols-7 gap-1">
                <TabsTrigger value="clips" className="flex items-center gap-1 text-xs">
                  <Mic className="w-3 h-3" />
                  <span className="hidden sm:inline">Clips</span>
                  <Badge variant="secondary" className="ml-1 text-xs px-1 py-0">{clips.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="members" className="flex items-center gap-1 text-xs">
                  <Users className="w-3 h-3" />
                  <span className="hidden sm:inline">Members</span>
                </TabsTrigger>
                <TabsTrigger value="live" className="flex items-center gap-1 text-xs">
                  <Radio className="w-3 h-3" />
                  <span className="hidden sm:inline">Live</span>
                </TabsTrigger>
                <TabsTrigger value="chat" className="flex items-center gap-1 text-xs">
                  <MessageSquare className="w-3 h-3" />
                  <span className="hidden sm:inline">Chat</span>
                </TabsTrigger>
                <TabsTrigger value="projects" className="flex items-center gap-1 text-xs">
                  <Award className="w-3 h-3" />
                  <span className="hidden sm:inline">Projects</span>
                </TabsTrigger>
                <TabsTrigger value="activity" className="flex items-center gap-1 text-xs">
                  <TrendingUp className="w-3 h-3" />
                  <span className="hidden sm:inline">Activity</span>
                </TabsTrigger>
                <TabsTrigger value="events" className="flex items-center gap-1 text-xs">
                  <Calendar className="w-3 h-3" />
                  <span className="hidden sm:inline">Events</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="clips" className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Community Clips</h3>
                  {isMember && (
                    <Button
                      size="sm"
                      onClick={() => {
                        // Get today's topic for default
                        supabase
                          .from("topics")
                          .select("id")
                          .eq("date", new Date().toISOString().split("T")[0])
                          .single()
                          .then(({ data }) => {
                            setSelectedTopicId(data?.id || null);
                            setIsRecordModalOpen(true);
                          });
                      }}
                    >
                      <Mic className="h-4 w-4 mr-2" />
                      Post
                    </Button>
                  )}
                </div>

                {isLoadingClips ? (
                  <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <Skeleton key={index} className="h-32 w-full rounded-3xl" />
                    ))}
                  </div>
                ) : clips.length === 0 ? (
                  <Card className="p-6 rounded-3xl bg-muted text-center text-muted-foreground">
                    {isMember ? (
                      <>
                        No clips yet in this community. Be the first to share your voice!
                        <Button
                          size="sm"
                          className="mt-4"
                          onClick={() => {
                            supabase
                              .from("topics")
                              .select("id")
                              .eq("date", new Date().toISOString().split("T")[0])
                              .single()
                              .then(({ data }) => {
                                setSelectedTopicId(data?.id || null);
                                setIsRecordModalOpen(true);
                              });
                          }}
                        >
                          <Mic className="h-4 w-4 mr-2" />
                          Post First Clip
                        </Button>
                      </>
                    ) : (
                      "Join this community to post clips and see all content."
                    )}
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {clips.map((clip) => (
                      <ClipCard
                        key={clip.id}
                        clip={clip}
                        captionsDefault={viewerProfile?.default_captions ?? true}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="members" className="space-y-4">
                <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Community Members</h3>
              <Badge variant="secondary">{members.length} shown</Badge>
            </div>

            {isLoadingMembers ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-16 w-full rounded-2xl" />
                ))}
              </div>
            ) : members.length === 0 ? (
              <Card className="p-6 rounded-3xl bg-muted text-center text-muted-foreground">
                <Users className="h-12 w-12 mx-auto opacity-50 mb-3" />
                <p>No members to display.</p>
              </Card>
            ) : (
              <div className="space-y-2">
                {members.map((member) => (
                  <Card key={member.id} className="p-4 rounded-2xl hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="text-2xl">{member.profiles?.emoji_avatar || "👤"}</div>
                        <div>
                          <p className="font-medium">@{member.profiles?.handle || "Anonymous"}</p>
                          <p className="text-xs text-muted-foreground">
                            Joined {formatDistanceToNow(new Date(member.joined_at), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                      {member.profile_id === communityData?.created_by_profile_id && (
                        <Badge variant="default" className="text-xs">
                          Creator
                        </Badge>
                      )}
                    </div>
                  </Card>
                ))}
                {communityData.member_count > members.length && (
                  <Card className="p-4 rounded-2xl bg-muted/50 text-center text-muted-foreground">
                    <p className="text-sm">
                      +{communityData.member_count - members.length} more members
                    </p>
                  </Card>
                )}
              </div>
            )}
              </TabsContent>

              <TabsContent value="live" className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Live Audio Rooms</h3>
              {isMember && (
                <Button
                  size="sm"
                  onClick={() => setIsCreateLiveRoomOpen(true)}
                  className="rounded-2xl"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Room
                </Button>
              )}
            </div>

            {/* Filter Tabs */}
            <Tabs value={liveRoomFilter} onValueChange={(v) => setLiveRoomFilter(v as "live" | "scheduled" | "newest")}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="live" className="flex items-center gap-2">
                  <Radio className="w-4 h-4" />
                  Live
                </TabsTrigger>
                <TabsTrigger value="scheduled" className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Scheduled
                </TabsTrigger>
                <TabsTrigger value="newest" className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Newest
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {liveRooms.length === 0 ? (
              <Card className="p-6 rounded-3xl bg-muted text-center text-muted-foreground">
                <Radio className="h-12 w-12 mx-auto opacity-50 mb-3" />
                <p>
                  {liveRoomFilter === "live" && "No live rooms right now."}
                  {liveRoomFilter === "scheduled" && "No scheduled rooms."}
                  {liveRoomFilter === "newest" && "No rooms yet."}
                </p>
                {isMember && (
                  <Button
                    size="sm"
                    className="mt-4 rounded-2xl"
                    onClick={() => setIsCreateLiveRoomOpen(true)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create {liveRoomFilter === "scheduled" ? "Scheduled" : ""} Room
                  </Button>
                )}
              </Card>
            ) : (
              <div className="space-y-3">
                {liveRooms.map((room) => (
                  <Card
                    key={room.id}
                    className="p-4 rounded-2xl cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => {
                      // Only allow opening if user is a member (for community rooms)
                      if (room.community_id && !isMember) {
                        toast.error("You must be a member to join this community's live rooms");
                        return;
                      }
                      setSelectedLiveRoomId(room.id);
                    }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="relative">
                          <Radio className="w-5 h-5 text-primary" />
                          {room.status === 'live' && (
                            <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold">{room.title}</h4>
                            <Badge variant={room.status === 'live' ? 'default' : 'secondary'} className="text-xs">
                              {room.status === 'live' ? 'LIVE' : 'Scheduled'}
                            </Badge>
                          </div>
                          {room.description && (
                            <p className="text-sm text-muted-foreground mb-2">{room.description}</p>
                          )}
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              {room.participant_count} participants
                            </div>
                            <div className="flex items-center gap-1">
                              <Mic className="w-3 h-3" />
                              {room.speaker_count} speakers
                            </div>
                            {room.status === 'scheduled' && room.scheduled_start_time && (
                              <span>
                                Starts {formatDistanceToNow(new Date(room.scheduled_start_time), { addSuffix: true })}
                              </span>
                            )}
                            {room.status === 'live' && room.started_at && (
                              <span>
                                Started {formatDistanceToNow(new Date(room.started_at), { addSuffix: true })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
              </TabsContent>

              <TabsContent value="chat" className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Chat Rooms</h3>
              {isMember && (
                <Button
                  size="sm"
                  onClick={() => setIsCreateChatRoomOpen(true)}
                  className="rounded-2xl"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Room
                </Button>
              )}
            </div>

            {chatRooms.length === 0 ? (
              <Card className="p-6 rounded-3xl bg-muted text-center text-muted-foreground">
                <MessageSquare className="h-12 w-12 mx-auto opacity-50 mb-3" />
                <p>No chat rooms yet.</p>
                {isMember && (
                  <Button
                    size="sm"
                    className="mt-4 rounded-2xl"
                    onClick={() => setIsCreateChatRoomOpen(true)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create First Room
                  </Button>
                )}
              </Card>
            ) : (
              <div className="space-y-3">
                {chatRooms.map((room) => (
                  <Card
                    key={room.id}
                    className="p-4 rounded-2xl cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => setSelectedChatRoomId(room.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        <MessageSquare className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold">{room.name}</h4>
                            {!room.is_public && (
                              <Badge variant="secondary" className="text-xs">Private</Badge>
                            )}
                          </div>
                          {room.description && (
                            <p className="text-sm text-muted-foreground mb-2">{room.description}</p>
                          )}
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span>{room.message_count} messages</span>
                            {room.last_message_at && (
                              <span>
                                Last message {formatDistanceToNow(new Date(room.last_message_at), { addSuffix: true })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
              </TabsContent>

              {/* Activity Tab */}
              <TabsContent value="activity" className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    Recent Activity
                  </h3>
                </div>

                {isLoadingActivity ? (
                  <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <Skeleton key={index} className="h-16 w-full rounded-2xl" />
                    ))}
                  </div>
                ) : activity.length === 0 ? (
                  <Card className="p-6 rounded-3xl bg-muted text-center text-muted-foreground">
                    <TrendingUp className="h-12 w-12 mx-auto opacity-50 mb-3" />
                    <p>No recent activity.</p>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {activity.map((item) => (
                      <Card key={item.id} className="p-4 rounded-2xl">
                        <div className="flex items-start gap-3">
                          <span className="text-2xl">{item.profiles?.emoji_avatar || '👤'}</span>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-sm font-medium">u/{item.profiles?.handle || 'Unknown'}</p>
                              <Badge variant="outline" className="text-xs">
                                {item.activity_type.replace('_', ' ')}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                            </p>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Events Tab */}
              <TabsContent value="events" className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Calendar className="w-5 h-5" />
                    Upcoming Events
                  </h3>
                  {isMember && (
                    <Button
                      size="sm"
                      onClick={() => {
                        toast.info("Event creation coming soon!");
                      }}
                      className="rounded-2xl"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Create Event
                    </Button>
                  )}
                </div>

                {isLoadingEvents ? (
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <Skeleton key={index} className="h-24 w-full rounded-2xl" />
                    ))}
                  </div>
                ) : events.length === 0 ? (
                  <Card className="p-6 rounded-3xl bg-muted text-center text-muted-foreground">
                    <Calendar className="h-12 w-12 mx-auto opacity-50 mb-3" />
                    <p>No upcoming events.</p>
                    {isMember && (
                      <Button
                        size="sm"
                        className="mt-4 rounded-2xl"
                        onClick={async () => {
                          const title = prompt("Event Title:");
                          if (!title) return;
                          const description = prompt("Event Description (optional):") || null;
                          const dateStr = prompt("Event Date & Time (YYYY-MM-DDTHH:mm):");
                          if (!dateStr) return;
                          const eventType = prompt("Event Type (general/live_room/meetup/workshop):") || "general";
                          
                          try {
                            const { error } = await supabase
                              .from("community_events")
                              .insert({
                                community_id: communityId,
                                created_by_profile_id: viewerProfile?.id,
                                title,
                                description,
                                event_date: dateStr,
                                event_type: eventType,
                              });
                            
                            if (error) {
                              if (error.code === '42P01') {
                                toast.error("Please run the migration first! The events table doesn't exist yet.");
                              } else {
                                toast.error("Failed to create event: " + error.message);
                              }
                            } else {
                              toast.success("Event created!");
                              // Reload events
                              const { data } = await supabase
                                .from("community_events")
                                .select("*, profiles(handle, emoji_avatar)")
                                .eq("community_id", communityId)
                                .gte("event_date", new Date().toISOString())
                                .order("event_date", { ascending: true })
                                .limit(10);
                              if (data) {
                                setEvents(data.map((e: any) => ({
                                  ...e,
                                  profiles: Array.isArray(e.profiles) ? e.profiles[0] : e.profiles,
                                })));
                              }
                            }
                          } catch (error) {
                            toast.error("Error creating event");
                            logError("Error", error);
                          }
                        }}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Create First Event
                      </Button>
                    )}
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {events.map((event) => (
                      <Card key={event.id} className="p-4 rounded-2xl hover:bg-muted/50 transition-colors">
                        <div className="flex items-start gap-3">
                          <div className="p-2 rounded-xl bg-primary/10">
                            <Calendar className="w-5 h-5 text-primary" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <h4 className="font-semibold">{event.title}</h4>
                                {event.description && (
                                  <p className="text-sm text-muted-foreground mt-1">{event.description}</p>
                                )}
                              </div>
                              <Badge variant="secondary" className="text-xs">{event.event_type}</Badge>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatDistanceToNow(new Date(event.event_date), { addSuffix: true })}
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-lg">{event.profiles?.emoji_avatar || '👤'}</span>
                                <span>u/{event.profiles?.handle || 'Unknown'}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="projects" className="space-y-4">
                <CommunityProjects 
                  communityId={communityId || undefined} 
                  showCreateButton={isMember}
                />
              </TabsContent>
            </Tabs>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Community Info Card */}
            <Card className="p-4 rounded-2xl space-y-4">
              <div className="flex items-center gap-3">
                <div className="text-4xl">{communityData.avatar_emoji}</div>
                <div className="flex-1">
                  <h3 className="font-bold text-lg">r/{communityData.slug}</h3>
                  <p className="text-xs text-muted-foreground">
                    Created {formatDistanceToNow(new Date(communityData.created_at), { addSuffix: true })}
                  </p>
                </div>
              </div>

              {viewerProfile && (
                <div className="space-y-2">
                  <Button
                    variant={isMember ? "default" : "outline"}
                    size="sm"
                    onClick={handleJoinLeave}
                    disabled={isJoining || isLeaving}
                    className="w-full rounded-xl"
                  >
                    {isMember ? (
                      <>
                        <UserMinus className="h-4 w-4 mr-2" />
                        Joined
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-4 w-4 mr-2" />
                        Join Community
                      </>
                    )}
                  </Button>
                  <Button
                    variant={isFollowing ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      toggleFollow();
                      toast.success(isFollowing ? "Unfollowed community" : "Following community");
                    }}
                    disabled={isFollowingCommunity || isUnfollowingCommunity}
                    className="w-full rounded-xl"
                  >
                    {isFollowing ? (
                      <>
                        <Heart className="h-4 w-4 mr-2 fill-current" />
                        Following
                      </>
                    ) : (
                      <>
                        <HeartOff className="h-4 w-4 mr-2" />
                        Follow
                      </>
                    )}
                  </Button>
                </div>
              )}

              <div className="pt-3 border-t space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Members</span>
                  <span className="font-semibold">{communityData.member_count.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Clips</span>
                  <span className="font-semibold">{communityData.clip_count.toLocaleString()}</span>
                </div>
                {communityData.follower_count !== undefined && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Followers</span>
                    <span className="font-semibold">{communityData.follower_count.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Listens</span>
                  <span className="font-semibold">{totalListens.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Reactions</span>
                  <span className="font-semibold">{totalReactions.toLocaleString()}</span>
                </div>
                {!communityData.is_public && (
                  <div className="flex items-center gap-2 text-sm pt-2 border-t">
                    <Shield className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Private Community</span>
                  </div>
                )}
              </div>
            </Card>

            {/* Rules/Guidelines Card */}
            {communityData.guidelines && (
              <Card className="p-4 rounded-2xl">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  Community Rules
                </h3>
                <div className="text-sm text-muted-foreground whitespace-pre-wrap space-y-2">
                  {communityData.guidelines.split('\n').map((line, idx) => (
                    <p key={idx}>{line}</p>
                  ))}
                </div>
              </Card>
            )}

            {/* Moderators Card */}
            <Card className="p-4 rounded-2xl">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  Moderators
                </h3>
                {(communityData?.is_creator || isAdmin) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsManageModeratorsOpen(true)}
                    className="h-8 text-xs"
                  >
                    <Settings className="w-3 h-3 mr-1" />
                    Manage
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                {isLoadingModerators ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full rounded-xl" />
                    ))}
                  </div>
                ) : moderators.length > 0 ? (
                  moderators.map((mod) => (
                    <div key={mod.id} className="flex items-center gap-2 p-2 rounded-xl hover:bg-muted/50">
                      <span className="text-xl">{mod.profiles?.emoji_avatar || '👤'}</span>
                      <Link
                        to={`/profile/${mod.profiles?.handle}`}
                        className="flex-1 text-sm font-medium hover:underline"
                      >
                        u/{mod.profiles?.handle || 'Unknown'}
                      </Link>
                      {mod.moderator_profile_id === communityData?.created_by_profile_id && (
                        <Badge variant="default" className="text-xs">Creator</Badge>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No moderators yet</p>
                )}
              </div>
            </Card>

            {/* Creator Info Card */}
            {communityData.created_by_profile_id && (
              <Card className="p-4 rounded-2xl">
                <h3 className="font-semibold mb-3 text-sm text-muted-foreground">Created by</h3>
                {creatorProfile ? (
                  <Link
                    to={`/profile/${creatorProfile.handle}`}
                    className="flex items-center gap-2 p-2 rounded-xl hover:bg-muted/50 transition-colors"
                  >
                    <span className="text-2xl">{creatorProfile.emoji_avatar || '👤'}</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium">u/{creatorProfile.handle}</p>
                      <p className="text-xs text-muted-foreground">Community Creator</p>
                    </div>
                  </Link>
                ) : (
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <div className="flex-1">
                      <Skeleton className="h-4 w-24 mb-1" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                  </div>
                )}
              </Card>
            )}

            {/* Community Stats Card */}
            <Card className="p-4 rounded-2xl">
              <h3 className="font-semibold mb-3">About</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Created</span>
                  <span>{formatDistanceToNow(new Date(communityData.created_at), { addSuffix: true })}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Type</span>
                  <Badge variant={communityData.is_public ? "default" : "secondary"} className="text-xs">
                    {communityData.is_public ? "Public" : "Private"}
                  </Badge>
                </div>
                {communityData.is_moderator && (
                  <div className="flex items-center gap-2 pt-2 border-t">
                    <Shield className="w-4 h-4 text-primary" />
                    <span className="text-sm">You are a moderator</span>
                  </div>
                )}
                {(communityData.is_creator || isAdmin) && (
                  <div className="flex items-center gap-2 pt-2 border-t">
                    <Shield className="w-4 h-4 text-primary" />
                    <span className="text-sm">You are the creator</span>
                  </div>
                )}
              </div>
            </Card>

            {/* Related Communities */}
            {relatedCommunities.length > 0 && (
              <Card className="p-4 rounded-2xl">
                <h3 className="font-semibold mb-3">Similar Communities</h3>
                <div className="space-y-2">
                  {relatedCommunities.map((comm) => (
                    <Link
                      key={comm.id}
                      to={`/community/${comm.slug}`}
                      className="flex items-center gap-2 p-2 rounded-xl hover:bg-muted/50 transition-colors"
                    >
                      <span className="text-xl">{comm.avatar_emoji || '🎙️'}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">r/{comm.slug}</p>
                        <p className="text-xs text-muted-foreground">{comm.member_count.toLocaleString()} members</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </Card>
            )}

            {/* Quick Actions */}
            <Card className="p-4 rounded-2xl">
              <h3 className="font-semibold mb-3">Quick Actions</h3>
              <div className="space-y-2">
                {isMember && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start rounded-xl"
                    onClick={() => setIsRecordModalOpen(true)}
                  >
                    <Mic className="w-4 h-4 mr-2" />
                    Record Clip
                  </Button>
                )}
                {(communityData.is_creator || communityData.is_moderator) && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start rounded-xl"
                    onClick={() => setIsCreateAnnouncementOpen(true)}
                  >
                    <Bell className="w-4 h-4 mr-2" />
                    Create Announcement
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start rounded-xl"
                  onClick={() => setIsShareDialogOpen(true)}
                >
                  <Share2 className="w-4 h-4 mr-2" />
                  Share Community
                </Button>
                {(communityData.is_creator || isAdmin) && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-start rounded-xl"
                      onClick={() => setIsSettingsDialogOpen(true)}
                    >
                      <Settings className="w-4 h-4 mr-2" />
                      Community Settings
                    </Button>
                    {isAdmin && (
                      <Button
                        variant="destructive"
                        size="sm"
                        className="w-full justify-start rounded-xl"
                        onClick={async () => {
                          if (!confirm("⚠️ ADMIN: Are you sure you want to DELETE this community? This action cannot be undone.")) return;
                          try {
                            const { error } = await supabase
                              .from("communities")
                              .delete()
                              .eq("id", communityId);
                            if (error) throw error;
                            toast.success("Community deleted successfully");
                            window.location.href = "/communities";
                          } catch (error: any) {
                            toast.error("Failed to delete community: " + (error.message || "Unknown error"));
                            logError("Error deleting community", error);
                          }
                        }}
                      >
                        <UserMinus className="w-4 h-4 mr-2" />
                        Delete Community (Admin)
                      </Button>
                    )}
                  </>
                )}
              </div>
            </Card>
          </div>
        </div>
      </main>

      {/* Live Room Modal */}
      {selectedLiveRoomId && (
        <Dialog 
          open={!!selectedLiveRoomId} 
          onOpenChange={(open) => {
            if (!open) {
              setSelectedLiveRoomId(null);
            }
          }}
        >
          <DialogContent className="sm:max-w-4xl rounded-3xl p-0 overflow-hidden max-h-[90vh]">
            <LiveRoom roomId={selectedLiveRoomId} onClose={() => setSelectedLiveRoomId(null)} />
          </DialogContent>
        </Dialog>
      )}

      {/* Chat Room Modal */}
      {selectedChatRoomId && (
        <Dialog open={!!selectedChatRoomId} onOpenChange={() => setSelectedChatRoomId(null)}>
          <DialogContent className="sm:max-w-2xl rounded-3xl p-0 overflow-hidden">
            <ChatRoom chatRoomId={selectedChatRoomId} onClose={() => setSelectedChatRoomId(null)} />
          </DialogContent>
        </Dialog>
      )}

      {/* Create Live Room Dialog */}
      <Dialog open={isCreateLiveRoomOpen} onOpenChange={setIsCreateLiveRoomOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle>Create Live Audio Room</DialogTitle>
            <DialogDescription>
              Start a live audio discussion in this community
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Room Title *</Label>
              <Input
                value={newLiveRoomTitle}
                onChange={(e) => setNewLiveRoomTitle(e.target.value)}
                placeholder="e.g., Weekly Discussion"
                className="rounded-2xl"
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={newLiveRoomDescription}
                onChange={(e) => setNewLiveRoomDescription(e.target.value)}
                placeholder="What is this room about?"
                className="rounded-2xl resize-none"
                rows={3}
                maxLength={500}
              />
            </div>
            <div className="space-y-2">
              <Label>Schedule Start Time (Optional)</Label>
              <Input
                type="datetime-local"
                value={newLiveRoomScheduledTime}
                onChange={(e) => setNewLiveRoomScheduledTime(e.target.value)}
                className="rounded-2xl"
                min={new Date().toISOString().slice(0, 16)}
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to start immediately, or set a future time to schedule
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setIsCreateLiveRoomOpen(false);
                  setNewLiveRoomTitle("");
                  setNewLiveRoomDescription("");
                  setNewLiveRoomScheduledTime("");
                }}
                className="rounded-2xl"
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  if (!newLiveRoomTitle.trim() || !communityId) return;
                  try {
                    const scheduledTime = newLiveRoomScheduledTime 
                      ? new Date(newLiveRoomScheduledTime).toISOString()
                      : undefined;
                    
                    await createLiveRoom.mutateAsync({
                      title: newLiveRoomTitle.trim(),
                      description: newLiveRoomDescription.trim() || undefined,
                      community_id: communityId,
                      scheduled_start_time: scheduledTime,
                    });
                    setIsCreateLiveRoomOpen(false);
                    setNewLiveRoomTitle("");
                    setNewLiveRoomDescription("");
                    setNewLiveRoomScheduledTime("");
                    toast.success(scheduledTime ? "Scheduled room created!" : "Live room created!");
                  } catch (error: any) {
                    toast.error(error.message || "Failed to create room");
                  }
                }}
                disabled={!newLiveRoomTitle.trim() || createLiveRoom.isPending}
                className="rounded-2xl"
              >
                {createLiveRoom.isPending ? "Creating..." : "Create Room"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Announcement Dialog */}
      <Dialog open={isCreateAnnouncementOpen} onOpenChange={(open) => {
        setIsCreateAnnouncementOpen(open);
        if (!open) {
          setNewAnnouncementTitle("");
          setNewAnnouncementContent("");
          setNewAnnouncementPinned(false);
        }
      }}>
        <DialogContent className="sm:max-w-lg rounded-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary" />
              Create Announcement
            </DialogTitle>
            <DialogDescription>
              Share important updates with your community members
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="announcement-title">Title *</Label>
              <Input
                id="announcement-title"
                value={newAnnouncementTitle}
                onChange={(e) => setNewAnnouncementTitle(e.target.value)}
                placeholder="e.g., Community Guidelines Update"
                className="rounded-2xl"
                maxLength={100}
              />
              <p className="text-xs text-muted-foreground">
                {newAnnouncementTitle.length}/100 characters
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="announcement-content">Content *</Label>
              <Textarea
                id="announcement-content"
                value={newAnnouncementContent}
                onChange={(e) => setNewAnnouncementContent(e.target.value)}
                placeholder="Write your announcement here..."
                className="rounded-2xl resize-none"
                rows={6}
                maxLength={1000}
              />
              <p className="text-xs text-muted-foreground">
                {newAnnouncementContent.length}/1000 characters
              </p>
            </div>

            <div className="flex items-center justify-between p-4 rounded-2xl bg-muted/50 border">
              <div className="space-y-0.5">
                <Label htmlFor="pin-announcement" className="text-sm font-medium cursor-pointer">
                  Pin Announcement
                </Label>
                <p className="text-xs text-muted-foreground">
                  Pinned announcements appear at the top of the community
                </p>
              </div>
              <Switch
                id="pin-announcement"
                checked={newAnnouncementPinned}
                onCheckedChange={setNewAnnouncementPinned}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateAnnouncementOpen(false);
                setNewAnnouncementTitle("");
                setNewAnnouncementContent("");
                setNewAnnouncementPinned(false);
              }}
              className="rounded-2xl"
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!newAnnouncementTitle.trim() || !newAnnouncementContent.trim()) {
                  toast.error("Please fill in both title and content");
                  return;
                }

                try {
                  const { error } = await supabase
                    .from("community_announcements")
                    .insert({
                      community_id: communityId,
                      created_by_profile_id: viewerProfile?.id,
                      title: newAnnouncementTitle.trim(),
                      content: newAnnouncementContent.trim(),
                      is_pinned: newAnnouncementPinned,
                    });

                  if (error) {
                    if (error.code === '42P01') {
                      toast.error("Please run the migration first! The announcements table doesn't exist yet.");
                    } else {
                      toast.error("Failed to create announcement: " + error.message);
                    }
                  } else {
                    toast.success("Announcement created successfully!");
                    setIsCreateAnnouncementOpen(false);
                    setNewAnnouncementTitle("");
                    setNewAnnouncementContent("");
                    setNewAnnouncementPinned(false);
                    
                    // Reload announcements
                    const { data } = await supabase
                      .from("community_announcements")
                      .select("*, profiles(handle, emoji_avatar)")
                      .eq("community_id", communityId)
                      .order("is_pinned", { ascending: false })
                      .order("created_at", { ascending: false })
                      .limit(5);
                    if (data) {
                      setAnnouncements(data.map((a: any) => ({
                        ...a,
                        profiles: Array.isArray(a.profiles) ? a.profiles[0] : a.profiles,
                      })));
                    }
                  }
                } catch (error) {
                  toast.error("Error creating announcement");
                  console.error(error);
                }
              }}
              disabled={!newAnnouncementTitle.trim() || !newAnnouncementContent.trim()}
              className="rounded-2xl"
            >
              <Bell className="w-4 h-4 mr-2" />
              Create Announcement
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Chat Room Dialog */}
      <Dialog open={isCreateChatRoomOpen} onOpenChange={setIsCreateChatRoomOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle>Create Chat Room</DialogTitle>
            <DialogDescription>
              Create a text chat room for this community
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Room Name *</Label>
              <Input
                value={newChatRoomName}
                onChange={(e) => setNewChatRoomName(e.target.value)}
                placeholder="e.g., General Discussion"
                className="rounded-2xl"
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={newChatRoomDescription}
                onChange={(e) => setNewChatRoomDescription(e.target.value)}
                placeholder="What is this chat room for?"
                className="rounded-2xl resize-none"
                rows={3}
                maxLength={500}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setIsCreateChatRoomOpen(false);
                  setNewChatRoomName("");
                  setNewChatRoomDescription("");
                }}
                className="rounded-2xl"
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  if (!newChatRoomName.trim() || !communityId) return;
                  try {
                    await createChatRoom.mutateAsync({
                      name: newChatRoomName.trim(),
                      description: newChatRoomDescription.trim() || undefined,
                      community_id: communityId,
                    });
                    setIsCreateChatRoomOpen(false);
                    setNewChatRoomName("");
                    setNewChatRoomDescription("");
                    toast.success("Chat room created!");
                  } catch (error: any) {
                    toast.error(error.message || "Failed to create room");
                  }
                }}
                disabled={!newChatRoomName.trim() || createChatRoom.isPending}
                className="rounded-2xl"
              >
                {createChatRoom.isPending ? "Creating..." : "Create Room"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Share Dialog */}
      <Dialog open={isShareDialogOpen} onOpenChange={setIsShareDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle>Share Community</DialogTitle>
            <DialogDescription>
              Share {communityData.name} with others
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Share Link</Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={shareUrl}
                  className="flex-1 rounded-2xl"
                />
                <Button
                  onClick={copyShareLink}
                  className="rounded-2xl"
                  variant={copied ? "default" : "outline"}
                >
                  {copied ? (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="mr-2 h-4 w-4" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
            </div>

            {typeof navigator !== "undefined" && "share" in navigator && (
              <Button
                onClick={handleNativeShare}
                className="w-full rounded-2xl"
                variant="outline"
              >
                <Share2 className="mr-2 h-4 w-4" />
                Share via...
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog (for creators) */}
      {((communityData.is_creator || isAdmin) && communityData.id) && (
        <CommunitySettings
          communityId={communityData.id}
          isOpen={isSettingsDialogOpen}
          onOpenChange={setIsSettingsDialogOpen}
        />
      )}

      {/* Manage Moderators Dialog (for creators) */}
      {communityData?.is_creator && (
        <Dialog open={isManageModeratorsOpen} onOpenChange={setIsManageModeratorsOpen}>
          <DialogContent className="sm:max-w-md rounded-3xl">
            <DialogHeader>
              <DialogTitle>Manage Moderators</DialogTitle>
              <DialogDescription>
                Add or remove moderators for {communityData?.name}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {/* Current Moderators */}
              <div className="space-y-2">
                <Label>Current Moderators</Label>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {isLoadingModerators ? (
                    <div className="space-y-2">
                      {Array.from({ length: 2 }).map((_, i) => (
                        <Skeleton key={i} className="h-10 w-full rounded-xl" />
                      ))}
                    </div>
                  ) : moderators.length > 0 ? (
                    moderators.map((mod) => (
                      <div key={mod.id} className="flex items-center justify-between p-2 rounded-xl bg-muted/50">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{mod.profiles?.emoji_avatar || '👤'}</span>
                          <div>
                            <p className="text-sm font-medium">u/{mod.profiles?.handle || 'Unknown'}</p>
                            {mod.moderator_profile_id === communityData?.created_by_profile_id && (
                              <p className="text-xs text-muted-foreground">Creator</p>
                            )}
                          </div>
                        </div>
                        {mod.moderator_profile_id !== communityData?.created_by_profile_id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              try {
                                await removeModerator.mutateAsync(mod.moderator_profile_id);
                                toast.success("Moderator removed");
                                // Reload moderators
                                const { data: moderatorsData } = await supabase
                                  .from("community_moderators")
                                  .select(
                                    `
                                    id,
                                    moderator_profile_id,
                                    elected_at,
                                    profiles (
                                      handle,
                                      emoji_avatar
                                    )
                                  `
                                  )
                                  .eq("community_id", communityId)
                                  .order("elected_at", { ascending: true });
                                if (moderatorsData) {
                                  setModerators((moderatorsData || []).map((m: any) => ({
                                    ...m,
                                    profiles: Array.isArray(m.profiles) ? m.profiles[0] : m.profiles,
                                  })));
                                }
                              } catch (error: any) {
                                toast.error(error.message || "Failed to remove moderator");
                              }
                            }}
                            disabled={removeModerator.isPending}
                            className="h-8 text-xs text-destructive hover:text-destructive"
                          >
                            <UserMinus className="w-3 h-3 mr-1" />
                            Remove
                          </Button>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">No moderators yet</p>
                  )}
                </div>
              </div>

              {/* Add Moderator */}
              <div className="space-y-2">
                <Label>Add Moderator</Label>
                <div className="space-y-2">
                  <Input
                    placeholder="Search by username..."
                    value={moderatorSearchQuery}
                    onChange={(e) => setModeratorSearchQuery(e.target.value)}
                    className="rounded-2xl"
                  />
                  {moderatorSearchQuery.length >= 2 && (
                    <div className="space-y-1 max-h-48 overflow-y-auto border rounded-xl p-2 bg-muted/30">
                      {isSearchingUsers ? (
                        <div className="space-y-2">
                          {Array.from({ length: 3 }).map((_, i) => (
                            <Skeleton key={i} className="h-10 w-full rounded-xl" />
                          ))}
                        </div>
                      ) : searchResults && searchResults.length > 0 ? (
                        searchResults
                          .filter((user) => {
                            // Filter out users who are already moderators
                            return !moderators.some((mod) => mod.moderator_profile_id === user.id);
                          })
                          .filter((user) => user.id !== communityData?.created_by_profile_id)
                          .map((user) => (
                            <div
                              key={user.id}
                              className="flex items-center justify-between p-2 rounded-xl hover:bg-muted/50 cursor-pointer"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-xl">{user.emoji_avatar || '👤'}</span>
                                <p className="text-sm font-medium">u/{user.handle}</p>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={async () => {
                                  try {
                                    await addModerator.mutateAsync(user.id);
                                    toast.success("Moderator added");
                                    setModeratorSearchQuery("");
                                    // Reload moderators
                                    const { data: moderatorsData } = await supabase
                                      .from("community_moderators")
                                      .select(
                                        `
                                        id,
                                        moderator_profile_id,
                                        elected_at,
                                        profiles!moderator_profile_id (
                                          handle,
                                          emoji_avatar
                                        )
                                      `
                                      )
                                      .eq("community_id", communityId)
                                      .order("elected_at", { ascending: true });
                                    if (moderatorsData) {
                                      setModerators((moderatorsData || []).map((m: any) => ({
                                        ...m,
                                        profiles: Array.isArray(m.profiles) ? m.profiles[0] : m.profiles,
                                      })));
                                    }
                                  } catch (error: any) {
                                    toast.error(error.message || "Failed to add moderator");
                                  }
                                }}
                                disabled={addModerator.isPending}
                                className="h-8 text-xs"
                              >
                                <UserPlus className="w-3 h-3 mr-1" />
                                Add
                              </Button>
                            </div>
                          ))
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-2">No users found</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {isRecordModalOpen && selectedTopicId && (
        <RecordModal
          isOpen={isRecordModalOpen}
          onClose={() => setIsRecordModalOpen(false)}
          topicId={selectedTopicId}
          onSuccess={handleRecordSuccess}
          profileCity={viewerProfile?.city || null}
          profileConsentCity={viewerProfile?.consent_city || false}
          communityId={communityId}
        />
      )}

      {communityData && (
        <ReviveCommunityDialog
          open={isReviveDialogOpen}
          onOpenChange={setIsReviveDialogOpen}
          communityName={communityData.name}
          communityEmoji={communityData.avatar_emoji}
          onAccept={handleReviveAccept}
          onDecline={handleReviveDecline}
          isTransferring={transferOwnership.isPending}
          rateLimitInfo={rateLimitInfo || undefined}
        />
      )}
    </div>
  );
};

export default CommunityDetail;

