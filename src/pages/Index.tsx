import { useState, useEffect, useCallback, useMemo, useRef, startTransition } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Plus, Settings, Search as SearchIcon, Mic, Bookmark, Users, Activity, Radio, Upload, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipListSkeleton } from "@/components/ui/clip-skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OnboardingFlow } from "@/components/OnboardingFlow";
import { InteractiveTutorial } from "@/components/InteractiveTutorial";
import { ClipCard } from "@/components/ClipCard";
import { RecordModal } from "@/components/RecordModal";
import { BulkUploadModal } from "@/components/BulkUploadModal";
import { ThreadView } from "@/components/ThreadView";
import { ChainView } from "@/components/ChainView";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CityOptInDialog } from "@/components/CityOptInDialog";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ViewModeToggle } from "@/components/ViewModeToggle";
import { KeyboardShortcutsDialog } from "@/components/KeyboardShortcutsDialog";
import { useTheme } from "next-themes";
import { useFollow } from "@/hooks/useFollow";
import { useBlockedUsers } from "@/hooks/useBlock";
import { useAdminStatus } from "@/hooks/useAdminStatus";
import { UserPlus, UserCheck } from "lucide-react";
import { AdvancedSearchFilters, SearchFilters } from "@/components/AdvancedSearchFilters";
import { useAuth } from "@/context/AuthContext";
import { NotificationCenter } from "@/components/NotificationCenter";
import { BackToTop } from "@/components/BackToTop";
import { useSearch } from "@/hooks/useSearch";
import { SearchSuggestions } from "@/components/SearchSuggestions";

interface Topic {
  id: string;
  title: string;
  description: string;
  date: string;
  is_active?: boolean;
}

interface TopicMetrics {
  posts: number;
  listens: number;
}

type ModerationData = {
  risk?: number;
  decision?: string;
  status?: string;
  [key: string]: unknown;
};

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
  waveform?: number[];
  city: string | null;
  completion_rate?: number | null;
  topic_id: string | null;
  moderation?: ModerationData | null;
  content_rating?: "general" | "sensitive";
  title: string | null;
  tags: string[] | null;
  parent_clip_id?: string | null;
  reply_count?: number;
  remix_of_clip_id?: string | null;
  remix_count?: number;
  chain_id?: string | null;
  challenge_id?: string | null;
  is_podcast?: boolean;
  trending_score?: number | null;
  profiles: {
    handle: string;
    emoji_avatar: string;
  } | null;
}

interface Profile {
  id: string;
  handle: string;
  emoji_avatar: string;
  joined_at: string | null;
  consent_city: boolean;
  city: string | null;
  default_captions: boolean;
  handle_last_changed_at: string | null;
  tap_to_record?: boolean;
}

interface SearchProfile {
  id: string;
  handle: string;
  emoji_avatar: string;
  city: string | null;
}

const getDeterministicJitter = (seed: string, amplitude = 0.05) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = Math.imul(31, hash) + seed.charCodeAt(i);
  }
  const normalized = ((hash >>> 0) % 1000) / 1000;
  return (normalized - 0.5) * 2 * amplitude;
};

const generatePromptSeeds = (topic: Topic): string[] => {
  const description = topic.description ?? "";
  const segments = description
    .split(/[\n•.;?!]/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  const seeds = [...segments];

  if (seeds.length === 0) {
    seeds.push(`How does "${topic.title}" show up for you?`);
  }
  while (seeds.length < 3) {
    seeds.push(`${topic.title}: share a moment or memory.`);
  }

  return seeds.slice(0, 3);
};

// Component for displaying creator search results
const CreatorSearchResult = ({ profile, viewerProfileId }: { profile: SearchProfile; viewerProfileId: string | null | undefined }) => {
  const { isFollowing, toggleFollow, isFollowingUser, isUnfollowingUser } = useFollow(profile.id);
  const isOwnProfile = viewerProfileId === profile.id;

  return (
    <div className="rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg">
      <div className="flex items-center gap-3">
        <div className="text-2xl">{profile.emoji_avatar}</div>
        <div className="flex-1 min-w-0">
          <Link to={`/profile/${profile.handle}`} className="block">
            <p className="font-semibold text-sm truncate hover:underline">@{profile.handle}</p>
          </Link>
          {profile.city && (
            <p className="text-xs text-muted-foreground truncate">{profile.city}</p>
          )}
        </div>
        {!isOwnProfile && (
          <Button
            variant={isFollowing ? "outline" : "default"}
            size="sm"
            className="rounded-full h-8 px-3 text-xs"
            onClick={toggleFollow}
            disabled={isFollowingUser || isUnfollowingUser}
          >
            {isFollowing ? (
              <>
                <UserCheck className="h-3 w-3 mr-1" />
                Following
              </>
            ) : (
              <>
                <UserPlus className="h-3 w-3 mr-1" />
                Follow
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
};

const Index = () => {
  const navigate = useNavigate();
  // Use centralized auth context instead of localStorage
  const { profileId, profile, isLoading: isAuthLoading, deviceId } = useAuth();
  const location = useLocation();
  const search = useSearch(profileId);
  const { blockedUsers } = useBlockedUsers();
  const { isAdmin } = useAdminStatus();
  const blockedUserIds = useMemo(() => new Set(blockedUsers.map(b => b.blocked_id)), [blockedUsers]);
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [isBulkUploadModalOpen, setIsBulkUploadModalOpen] = useState(false);
  const [todayTopic, setTodayTopic] = useState<Topic | null>(null);
  const [recentTopics, setRecentTopics] = useState<Topic[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [topicMetrics, setTopicMetrics] = useState<Record<string, TopicMetrics>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [sortMode, setSortMode] = useState<"hot" | "top" | "controversial" | "rising" | "trending">("hot");
  const [topTimePeriod, setTopTimePeriod] = useState<"all" | "week" | "month">("all");
  const [cityFilter, setCityFilter] = useState<"global" | "local">("global");
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [moodFilter, setMoodFilter] = useState<string | null>(null);
  const [isCityDialogOpen, setIsCityDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [replyingToClipId, setReplyingToClipId] = useState<string | null>(null);
  const [replyingToClip, setReplyingToClip] = useState<{ id: string; handle: string; summary?: string | null } | null>(null);
  const [remixingFromClipId, setRemixingFromClipId] = useState<string | null>(null);
  const [remixingFromClip, setRemixingFromClip] = useState<{ id: string; handle: string; summary?: string | null } | null>(null);
  const [continuingChainId, setContinuingChainId] = useState<string | null>(null);
  const [continuingChain, setContinuingChain] = useState<{ id: string; title?: string | null } | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "compact">("list");
  const [displayedClipsCount, setDisplayedClipsCount] = useState(20);
  const [searchProfiles, setSearchProfiles] = useState<SearchProfile[]>([]);
  const [recommendedUsers, setRecommendedUsers] = useState<SearchProfile[]>([]);
  const [isLoadingUserRecommendations, setIsLoadingUserRecommendations] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [recommendedClips, setRecommendedClips] = useState<Clip[]>([]);
  const [isLoadingRecommendedClips, setIsLoadingRecommendedClips] = useState(false);
  const [similarVoicesClips, setSimilarVoicesClips] = useState<Clip[]>([]);
  const [isLoadingSimilarVoices, setIsLoadingSimilarVoices] = useState(false);
  const searchDropdownRef = useRef<HTMLDivElement>(null);
  const [advancedFilters, setAdvancedFilters] = useState<SearchFilters>({
    moodEmoji: null,
    durationMin: null,
    durationMax: null,
    dateFrom: null,
    dateTo: null,
    city: null,
    topicId: null,
    qualityBadge: null,
    emotion: null,
    searchQuery: "",
  });
  const [savedSearches, setSavedSearches] = useState<Array<{ id: string; name: string; filters: SearchFilters }>>([]);
  const [showTutorial, setShowTutorial] = useState(false);
  const [searchResults, setSearchResults] = useState<string[]>([]); // Clip IDs from database search
  const [isSearchingDatabase, setIsSearchingDatabase] = useState(false);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();

  const topicIdsRef = useRef<string[]>([]);
  const topicsRef = useRef<Topic[]>([]);

  const fetchTopicMetrics = useCallback(async (topicIds: string[]) => {
    if (topicIds.length === 0) {
      return {};
    }

    try {
      const { data, error } = await supabase
        .from("clips")
        .select("topic_id, listens_count, status")
        .in("topic_id", topicIds);

      if (error) {
        console.error("Error loading topic metrics:", error);
        return {};
      }

      if (!data) {
        return {};
      }

      return data.reduce<Record<string, TopicMetrics>>((acc, clip) => {
        if (!clip.topic_id) return acc;
        const current = acc[clip.topic_id] || { posts: 0, listens: 0 };

        if (clip.status === "live" || clip.status === "processing") {
          current.posts += 1;
          current.listens += clip.listens_count || 0;
        }

        acc[clip.topic_id] = current;
        return acc;
      }, {});
    } catch (error) {
      console.error("Error loading topic metrics:", error);
      return {};
    }
  }, []);

  const applyTopicCuration = useCallback(
    (topics: Topic[], metrics: Record<string, TopicMetrics>) => {
      topicsRef.current = topics;
      if (!topics || topics.length === 0) {
        setTodayTopic(null);
        setRecentTopics([]);
        topicIdsRef.current = [];
        return;
      }

      const now = Date.now();
      const todayISO = new Date().toISOString().slice(0, 10);
      const sortedByDate = [...topics].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      );

      const todayCandidate =
        sortedByDate.find((topic) => topic.date === todayISO && topic.is_active !== false) ??
        sortedByDate.find((topic) => new Date(topic.date).getTime() <= now) ??
        sortedByDate[0];

      const remainder = sortedByDate.filter((topic) => topic.id !== todayCandidate?.id);

      const scored = remainder.map((topic) => {
        const topicMetric = metrics[topic.id] ?? { posts: 0, listens: 0 };
        const ageMs = now - new Date(topic.date).getTime();
        const ageDays = ageMs > 0 ? ageMs / 86400000 : 0;
        const recencyScore = Math.exp(-ageDays / 4);
        const engagementSignal = topicMetric.posts + topicMetric.listens / 20;
        const engagementScore = 1 - Math.exp(-engagementSignal);
        const hasActivity = topicMetric.posts > 0 || topicMetric.listens > 0;
        const baseScore = 0.55 * recencyScore + 0.35 * engagementScore;
        const activityAdjustment = hasActivity ? 0.1 : -0.05;
        const qualityPenalty = topic.is_active === false ? 0.4 : 0;
        return {
          topic,
          score: baseScore + activityAdjustment - qualityPenalty,
          hasActivity,
          ageDays,
        };
      });

      const prioritized = scored.sort((a, b) => b.score - a.score);
      const curated: Topic[] = [];

      for (const entry of prioritized) {
        if (curated.length >= 6) break;
        if (entry.hasActivity || entry.ageDays <= 3 || curated.length < 3) {
          curated.push(entry.topic);
        }
      }

      if (curated.length < 6) {
        for (const entry of prioritized) {
          if (curated.length >= 6) break;
          if (!curated.some((topic) => topic.id === entry.topic.id)) {
            curated.push(entry.topic);
          }
        }
      }

      setTodayTopic(todayCandidate ?? null);
      setRecentTopics(curated);
      topicIdsRef.current = [
        todayCandidate?.id,
        ...curated.map((topic) => topic.id),
      ].filter((id): id is string => Boolean(id));
    },
    [],
  );

  // Profile is now loaded via AuthContext - no need for separate loadProfile

  const refreshTopicMetrics = useCallback(
    async (overrideTopicIds?: string[]) => {
      try {
        const ids = overrideTopicIds ?? topicIdsRef.current;
        if (overrideTopicIds) {
          topicIdsRef.current = overrideTopicIds;
        }
        if (!ids || ids.length === 0) return;
        const metrics = await fetchTopicMetrics(ids);
        setTopicMetrics(metrics);
        applyTopicCuration(topicsRef.current, metrics);
      } catch (error) {
        console.error("Error refreshing topic metrics:", error);
      }
    },
    [applyTopicCuration, fetchTopicMetrics],
  );

  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const todayISO = new Date().toISOString().slice(0, 10);
      
      // Check if today's topic exists, if not, generate it
      const { data: todayTopic, error: todayCheckError } = await supabase
        .from("topics")
        .select("*")
        .eq("date", todayISO)
        .maybeSingle();

      // If there's a 403 error, it's likely an RLS issue - silently ignore and continue
      // If no topic for today exists and no error (or non-403 error), trigger the daily-topic function
      if (!todayTopic && (!todayCheckError || todayCheckError.code !== 403)) {
        try {
          await supabase.functions.invoke("daily-topic", {
            body: {},
          });
          // Wait a moment for the topic to be created
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (invokeError: any) {
          // Silently handle 403 errors - they're expected in some cases
          if (invokeError?.code !== 403) {
            console.warn("Failed to generate daily topic:", invokeError);
          }
          // Continue anyway - we'll use the most recent topic
        }
      }

      const { data: topics, error: topicsError } = await supabase
        .from("topics")
        .select("*")
        .order("date", { ascending: false })
        .limit(20);

      if (topicsError) {
        throw topicsError;
      }

      const activeTopics = (topics ?? []).filter((topic) => topic.is_active !== false);
      const topicIds = activeTopics.map((topic) => topic.id);
      topicIdsRef.current = topicIds;

      const metrics = await fetchTopicMetrics(topicIds);
      setTopicMetrics(metrics);
      applyTopicCuration(activeTopics, metrics);

      // First, get all clips (including replies) to calculate reply counts
      const { data: allClipsData, error: allClipsError } = await supabase
        .from("clips")
        .select(`
          *,
          profiles (
            handle,
            emoji_avatar
          )
        `)
        .in("status", ["live", "processing"]);

      if (allClipsError) {
        throw allClipsError;
      }

      // Calculate reply counts and remix counts for each clip
      const replyCounts: Record<string, number> = {};
      const remixCounts: Record<string, number> = {};
      if (allClipsData) {
        allClipsData.forEach((clip: any) => {
          if (clip.parent_clip_id) {
            replyCounts[clip.parent_clip_id] = (replyCounts[clip.parent_clip_id] || 0) + 1;
          }
          if (clip.remix_of_clip_id) {
            remixCounts[clip.remix_of_clip_id] = (remixCounts[clip.remix_of_clip_id] || 0) + 1;
          }
        });
      }

      // Filter to only top-level clips (no parent) and add reply/remix counts
      const clipsData = allClipsData
        ?.filter((clip: any) => !clip.parent_clip_id)
        .map((clip: any) => ({
          ...clip,
          reply_count: replyCounts[clip.id] || 0,
          remix_count: remixCounts[clip.id] || 0,
        }))
        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      if (clipsData) {
        setClips(clipsData as Clip[]);
        setDisplayedClipsCount(20);
      }

    } catch (error) {
      console.error("Error loading data:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toastRef.current({
        title: "Couldn't load content",
        description: errorMessage.includes("network") || errorMessage.includes("fetch")
          ? "Network error. Please check your connection and try again."
          : errorMessage.includes("permission") || errorMessage.includes("403")
          ? "Permission denied. Please refresh the page or sign in again."
          : "Something went wrong while loading content. Please refresh the page or try again in a moment.",
        variant: "destructive",
      });
      if (topicsRef.current.length === 0) {
        setTopicMetrics({});
        applyTopicCuration([], {});
      }
    } finally {
      setIsLoading(false);
    }
  }, [applyTopicCuration, fetchTopicMetrics]);

  const loadRecommendations = useCallback(async () => {
    if (!profileId) return;
    
    setIsLoadingRecommendedClips(true);
    try {
      // Get user's listening history
      const { data: listens, error: listensError } = await supabase
        .from("listens")
        .select("clip_id")
        .eq("profile_id", profileId)
        .order("listened_at", { ascending: false })
        .limit(50);

      if (listensError || !listens || listens.length === 0) {
        setRecommendedClips([]);
        return;
      }

      const listenedClipIds = listens.map((l) => l.clip_id).filter(Boolean) as string[];

      // Get clips the user has listened to
      const { data: listenedClips } = await supabase
        .from("clips")
        .select("topic_id, tags, profile_id")
        .in("id", listenedClipIds)
        .in("status", ["live"]);

      if (!listenedClips || listenedClips.length === 0) {
        setRecommendedClips([]);
        return;
      }

      // Find similar clips based on:
      // 1. Same topic
      // 2. Same tags
      // 3. Same creator
      const topicIds = [...new Set(listenedClips.map((c) => c.topic_id).filter(Boolean))];
      const tags = new Set<string>();
      listenedClips.forEach((c) => {
        if (Array.isArray(c.tags)) {
          c.tags.forEach((tag) => tags.add(tag));
        }
      });
      const creatorIds = [...new Set(listenedClips.map((c) => c.profile_id).filter(Boolean))];

      // Get recommended clips
      const { data: recommended, error: recommendedError } = await supabase
        .from("clips")
        .select(`
          *,
          profiles (
            handle,
            emoji_avatar
          )
        `)
        .in("status", ["live"])
        .not("id", "in", `(${listenedClipIds.join(",")})`)
        .or(
          [
            ...(topicIds.length > 0 ? [`topic_id.in.(${topicIds.join(",")})`] : []),
            ...(creatorIds.length > 0 ? [`profile_id.in.(${creatorIds.join(",")})`] : []),
          ].join(",")
        )
        .order("created_at", { ascending: false })
        .limit(10);

      if (recommendedError) {
        throw recommendedError;
      }

      // Score and sort recommendations
      const scored = (recommended || []).map((clip: any) => {
        let score = 0;
        const clipTags = Array.isArray(clip.tags) ? clip.tags : [];
        
        // Topic match
        if (topicIds.includes(clip.topic_id)) score += 3;
        
        // Tag matches
        clipTags.forEach((tag: string) => {
          if (tags.has(tag)) score += 2;
        });
        
        // Creator match
        if (creatorIds.includes(clip.profile_id)) score += 2;
        
        // Recency bonus
        const hoursOld = (Date.now() - new Date(clip.created_at).getTime()) / (1000 * 60 * 60);
        score += Math.max(0, 1 - hoursOld / 168); // Decay over a week
        
        return { clip, score };
      });

      const sorted = scored
        .sort((a, b) => b.score - a.score)
        .slice(0, 6)
        .map((item) => item.clip);

      setRecommendedClips(sorted as Clip[]);
    } catch (error) {
      console.error("Error loading recommendations:", error);
    } finally {
      setIsLoadingRecommendedClips(false);
    }
  }, [profileId]);

  const loadSimilarVoices = useCallback(async () => {
    if (!profileId) return;
    
    setIsLoadingSimilarVoices(true);
    try {
      // Get user's listening history
      const { data: listens, error: listensError } = await supabase
        .from("listens")
        .select("clip_id")
        .eq("profile_id", profileId)
        .order("listened_at", { ascending: false })
        .limit(30);

      if (listensError || !listens || listens.length === 0) {
        setSimilarVoicesClips([]);
        return;
      }

      const listenedClipIds = listens.map((l) => l.clip_id).filter(Boolean) as string[];

      // Get clips the user has listened to to find favorite creators
      const { data: listenedClips } = await supabase
        .from("clips")
        .select("profile_id")
        .in("id", listenedClipIds)
        .in("status", ["live"]);

      if (!listenedClips || listenedClips.length === 0) {
        setSimilarVoicesClips([]);
        return;
      }

      // Count how many times user listened to each creator
      const creatorCounts: Record<string, number> = {};
      listenedClips.forEach((c) => {
        if (c.profile_id) {
          creatorCounts[c.profile_id] = (creatorCounts[c.profile_id] || 0) + 1;
        }
      });

      // Get top 3 favorite creators
      const favoriteCreators = Object.entries(creatorCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([id]) => id);

      if (favoriteCreators.length === 0) {
        setSimilarVoicesClips([]);
        return;
      }

      // Find other creators who create similar content
      // (same topics, similar tags, etc.)
      const { data: favoriteCreatorClips } = await supabase
        .from("clips")
        .select("topic_id, tags")
        .in("profile_id", favoriteCreators)
        .in("status", ["live"])
        .limit(20);

      if (!favoriteCreatorClips || favoriteCreatorClips.length === 0) {
        setSimilarVoicesClips([]);
        return;
      }

      const favoriteTopics = [...new Set(favoriteCreatorClips.map((c) => c.topic_id).filter(Boolean))];
      const favoriteTags = new Set<string>();
      favoriteCreatorClips.forEach((c) => {
        if (Array.isArray(c.tags)) {
          c.tags.forEach((tag) => favoriteTags.add(tag));
        }
      });

      // Find other creators who create content on similar topics or with similar tags
      const { data: similarCreators } = await supabase
        .from("clips")
        .select("profile_id")
        .in("status", ["live"])
        .not("profile_id", "in", `(${favoriteCreators.join(",")})`)
        .or(
          [
            ...(favoriteTopics.length > 0 ? [`topic_id.in.(${favoriteTopics.join(",")})`] : []),
          ].join(",")
        )
        .limit(50);

      if (!similarCreators || similarCreators.length === 0) {
        setSimilarVoicesClips([]);
        return;
      }

      // Count clips per creator
      const similarCreatorCounts: Record<string, number> = {};
      similarCreators.forEach((c) => {
        if (c.profile_id) {
          similarCreatorCounts[c.profile_id] = (similarCreatorCounts[c.profile_id] || 0) + 1;
        }
      });

      // Get top similar creators
      const topSimilarCreators = Object.entries(similarCreatorCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id]) => id);

      if (topSimilarCreators.length === 0) {
        setSimilarVoicesClips([]);
        return;
      }

      // Get clips from similar creators
      const { data: similarClips, error: similarClipsError } = await supabase
        .from("clips")
        .select(`
          *,
          profiles (
            handle,
            emoji_avatar
          )
        `)
        .in("profile_id", topSimilarCreators)
        .in("status", ["live"])
        .not("id", "in", `(${listenedClipIds.join(",")})`)
        .order("created_at", { ascending: false })
        .limit(8);

      if (similarClipsError) {
        throw similarClipsError;
      }

      // Score clips by tag similarity and recency
      const scored = (similarClips || []).map((clip: any) => {
        let score = 0;
        const clipTags = Array.isArray(clip.tags) ? clip.tags : [];
        
        // Tag matches
        clipTags.forEach((tag: string) => {
          if (favoriteTags.has(tag)) score += 3;
        });
        
        // Topic match
        if (favoriteTopics.includes(clip.topic_id)) score += 2;
        
        // Recency bonus
        const hoursOld = (Date.now() - new Date(clip.created_at).getTime()) / (1000 * 60 * 60);
        score += Math.max(0, 1 - hoursOld / 168); // Decay over a week
        
        return { clip, score };
      });

      const sorted = scored
        .sort((a, b) => b.score - a.score)
        .slice(0, 6)
        .map((item) => item.clip);

      setSimilarVoicesClips(sorted as Clip[]);
    } catch (error) {
      console.error("Error loading similar voices:", error);
    } finally {
      setIsLoadingSimilarVoices(false);
    }
  }, [profileId]);

  const handleOnboardingComplete = useCallback(
    (id: string) => {
      // Profile will be updated via AuthContext when localStorage changes
      loadData();
      // Show tutorial after a short delay to ensure page is rendered
      setTimeout(() => {
        const tutorialCompleted = localStorage.getItem("echo_garden_tutorial_completed");
        if (!tutorialCompleted) {
          setShowTutorial(true);
        }
      }, 500);
    },
    [loadData],
  );

  // Check if tutorial should be shown on mount (for existing users who haven't seen it)
  useEffect(() => {
    if (profileId && !isAuthLoading && !showTutorial) {
      const tutorialCompleted = localStorage.getItem("echo_garden_tutorial_completed");
      if (!tutorialCompleted) {
        // Show tutorial for users who haven't seen it yet
        // Add a small delay to ensure the page is fully rendered
        const timer = setTimeout(() => {
          setShowTutorial(true);
        }, 1000);
        return () => clearTimeout(timer);
      }
    }
  }, [profileId, isAuthLoading, showTutorial]);

  const handleSaveCity = useCallback(
    async ({ city, consent }: { city: string | null; consent: boolean }) => {
      if (!profile?.id) return;
      try {
        const { data, error } = await supabase
          .from("profiles")
          .update({ city, consent_city: consent })
          .eq("id", profile.id)
          .select()
          .single();

        if (error) {
          throw error;
        }

        // Profile will be updated via AuthContext
        toast({
          title: consent ? "City saved" : "City hidden",
          description: consent
            ? "Future clips will include your city."
            : "We'll keep your city private from now on.",
        });
      } catch (error) {
        console.error("Error updating city:", error);
        toast({
          title: "Couldn't update city",
          description: "Please try again.",
          variant: "destructive",
        });
      }
    },
    [profile, toast],
  );

  const displayClips = useMemo(() => {
    const now = Date.now();
    let filtered = clips;

    // Filter out clips from blocked users
    if (blockedUserIds.size > 0) {
      filtered = filtered.filter((clip) => !clip.profile_id || !blockedUserIds.has(clip.profile_id));
    }

    // Apply legacy city filter (global/local) if advanced city filter is not set
    if (!advancedFilters.city) {
      filtered =
        cityFilter === "local" && profile?.city
          ? filtered.filter(
              (clip) =>
                clip.city &&
                profile.city &&
                clip.city.toLowerCase() === profile.city.toLowerCase(),
            )
          : filtered;
    }

    // Apply advanced filters
    // Topic filter (use advanced filter if set, otherwise use legacy selectedTopicId)
    const topicFilter = advancedFilters.topicId || selectedTopicId;
    if (topicFilter) {
      filtered = filtered.filter((clip) => clip.topic_id === topicFilter);
    }

    // Mood emoji filter
    if (advancedFilters.moodEmoji) {
      filtered = filtered.filter((clip) => clip.mood_emoji === advancedFilters.moodEmoji);
    }

    // Duration range filter
    if (advancedFilters.durationMin !== null) {
      filtered = filtered.filter((clip) => clip.duration_seconds >= advancedFilters.durationMin!);
    }
    if (advancedFilters.durationMax !== null) {
      filtered = filtered.filter((clip) => clip.duration_seconds <= advancedFilters.durationMax!);
    }

    // Date range filter
    if (advancedFilters.dateFrom) {
      const fromTime = advancedFilters.dateFrom.getTime();
      filtered = filtered.filter((clip) => {
        const clipTime = new Date(clip.created_at).getTime();
        return clipTime >= fromTime;
      });
    }
    if (advancedFilters.dateTo) {
      const toTime = advancedFilters.dateTo.getTime() + 24 * 60 * 60 * 1000 - 1; // End of day
      filtered = filtered.filter((clip) => {
        const clipTime = new Date(clip.created_at).getTime();
        return clipTime <= toTime;
      });
    }

    // City filter (specific city)
    if (advancedFilters.city) {
      filtered = filtered.filter((clip) => 
        clip.city && clip.city.toLowerCase() === advancedFilters.city!.toLowerCase()
      );
    }

    // Filter out blocked/rejected clips and apply content security filtering
    const validClips = filtered.filter((clip) => {
      // Check moderation decision
      const moderationData = clip.moderation ?? null;
      const moderationDecision =
        typeof moderationData?.decision === "string"
          ? moderationData.decision
          : typeof moderationData?.status === "string"
            ? moderationData.status
            : null;
      if (moderationDecision === "blocked" || moderationDecision === "reject") {
        return false;
      }
      
      // Filter out hidden/removed clips
      if (clip.status === "hidden" || clip.status === "removed") {
        return false;
      }
      
      // Filter out high-risk flagged content
      if (moderationData?.flag === true && (moderationData?.risk || 0) >= 7) {
        return false;
      }
      
      // Filter out clips with multiple pending reports (3+)
      // Note: This would require fetching reports, so we skip for performance
      // The server-side filter will handle this
      
      return true;
    });

    return validClips
      .map((clip) => {
        const reactionTotal = Object.values(clip.reactions || {}).reduce((sum, count) => {
          const numeric = typeof count === "number" ? count : Number(count);
          return sum + (Number.isFinite(numeric) ? numeric : 0);
        }, 0);
        const listens = clip.listens_count || 0;
        const createdAt = new Date(clip.created_at).getTime();
        const hoursOld = Math.max(0, (now - createdAt) / 36e5);
        
        let score = 0;

        if (sortMode === "hot") {
          // Hot: Trending now - strong emphasis on recent engagement
          const freshness = Math.exp(-hoursOld / 12);
          const reactionScore = Math.sqrt(reactionTotal + 1);
          const listenScore = Math.sqrt(listens + 1);
          const completionRateRaw =
            typeof clip.completion_rate === "number" ? clip.completion_rate : null;
          const completionRate = completionRateRaw === null ? 0.5 : completionRateRaw;
          const completionScore = Math.max(0, Math.min(1, completionRate));
          const processingPenalty = clip.status === "processing" ? 0.2 : 0;
          const jitter = getDeterministicJitter(clip.id);
          const topicMetric = clip.topic_id ? topicMetrics[clip.topic_id] : undefined;
          const topicBoost = topicMetric
            ? Math.min(
                0.4,
                Math.log1p(topicMetric.posts) * 0.12 + Math.log1p(topicMetric.listens) * 0.05,
              )
            : 0;
          const localBoost =
            profile?.city &&
            clip.city &&
            clip.city.toLowerCase() === profile.city.toLowerCase()
              ? 0.08
              : 0;
          const sensitivePenalty = clip.content_rating === "sensitive" ? 0.15 : 0;
          const moderationData = clip.moderation ?? null;
          const rawRisk =
            moderationData && typeof moderationData.risk === "number" ? moderationData.risk : 0;
          const boundedRisk = Math.min(Math.max(rawRisk, 0), 1);
          const moderationPenalty = boundedRisk * 0.5;
          score =
            0.5 * freshness +
            0.2 * reactionScore +
            0.15 * listenScore +
            0.15 * completionScore +
            topicBoost +
            localBoost +
            jitter -
            processingPenalty -
            moderationPenalty -
            sensitivePenalty;
        } else if (sortMode === "top") {
          // Top: All-time, week, or month - pure engagement score
          const timeCutoff = now - (
            topTimePeriod === "week" ? 7 * 24 * 60 * 60 * 1000 :
            topTimePeriod === "month" ? 30 * 24 * 60 * 60 * 1000 :
            Infinity
          );
          
          if (createdAt < timeCutoff) {
            return null; // Filter out clips outside time period
          }

          // Weighted score: reactions + listens + completion
          const reactionWeight = 2;
          const listenWeight = 1;
          const completionRateRaw =
            typeof clip.completion_rate === "number" ? clip.completion_rate : null;
          const completionRate = completionRateRaw === null ? 0.5 : completionRateRaw;
          const completionScore = Math.max(0, Math.min(1, completionRate));
          
          score = reactionTotal * reactionWeight + listens * listenWeight + completionScore * 10;
        } else if (sortMode === "controversial") {
          // Controversial: High engagement + mixed reactions
          const reactionKeys = Object.keys(clip.reactions || {});
          const reactionCounts = reactionKeys.map(key => {
            const val = clip.reactions?.[key];
            return typeof val === "number" ? val : Number(val) || 0;
          });
          
          const totalReactions = reactionCounts.reduce((sum, count) => sum + count, 0);
          const uniqueReactionTypes = reactionKeys.length;
          
          // Controversy score: high total reactions + multiple reaction types (mixed opinions)
          // Also consider ratio of different reaction types
          const reactionVariance = reactionCounts.length > 1
            ? reactionCounts.reduce((variance, count) => {
                const mean = totalReactions / reactionCounts.length;
                return variance + Math.pow(count - mean, 2);
              }, 0) / reactionCounts.length
            : 0;
          
          const engagementScore = Math.log1p(totalReactions + listens);
          const diversityBonus = Math.min(uniqueReactionTypes * 0.3, 1.5);
          const varianceBonus = Math.min(Math.sqrt(reactionVariance) * 0.2, 1);
          
          // Prefer recent controversial content
          const freshness = Math.exp(-hoursOld / 48);
          
          score = engagementScore * (1 + diversityBonus + varianceBonus) * (0.7 + 0.3 * freshness);
        } else if (sortMode === "rising") {
          // Rising: Gaining traction - recent clips with accelerating engagement
          // Prefer clips from last 24-48 hours with good engagement velocity
          if (hoursOld > 48) {
            return null; // Too old for "rising"
          }
          
          const reactionScore = Math.sqrt(reactionTotal + 1);
          const listenScore = Math.sqrt(listens + 1);
          const completionRateRaw =
            typeof clip.completion_rate === "number" ? clip.completion_rate : null;
          const completionRate = completionRateRaw === null ? 0.5 : completionRateRaw;
          const completionScore = Math.max(0, Math.min(1, completionRate));
          
          // Velocity score: engagement per hour (higher for newer content)
          const ageWeight = Math.max(0, 1 - hoursOld / 48); // Decay over 48 hours
          
          // Boost for clips that are performing well relative to their age
          const performanceRatio = (reactionTotal + listens) / Math.max(1, hoursOld);
          
          score = (reactionScore + listenScore + completionScore * 5) * ageWeight * (1 + Math.log1p(performanceRatio));
        } else if (sortMode === "trending") {
          // Trending: Use pre-calculated trending_score from database
          // This score is calculated server-side using engagement × freshness × quality
          score = clip.trending_score ?? 0;
        }

        return { clip, score };
      })
      .filter((entry): entry is { clip: Clip; score: number } => entry !== null)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.clip);
  }, [cityFilter, clips, sortMode, topTimePeriod, profile?.city, selectedTopicId, topicMetrics, advancedFilters, blockedUserIds]);

  const allTopics = useMemo(() => {
    const list: Topic[] = [];
    if (todayTopic) list.push(todayTopic);
    if (recentTopics.length > 0) list.push(...recentTopics);
    return list;
  }, [recentTopics, todayTopic]);

  const totalValidClips = useMemo(() => {
    const filtered =
      cityFilter === "local" && profile?.city
        ? clips.filter(
            (clip) =>
              clip.city &&
              profile.city &&
              clip.city.toLowerCase() === profile.city.toLowerCase(),
          )
        : clips;
    
    return filtered.filter((clip) => {
      const moderationData = clip.moderation ?? null;
      const moderationDecision =
        typeof moderationData?.decision === "string"
          ? moderationData.decision
          : typeof moderationData?.status === "string"
            ? moderationData.status
            : null;
      return moderationDecision !== "blocked" && moderationDecision !== "reject";
    }).length;
  }, [clips, cityFilter, profile?.city]);

  const normalizedQuery = debouncedSearchQuery.trim().toLowerCase();

  const filteredTopics = useMemo(() => {
    if (!normalizedQuery) return allTopics;
    return allTopics.filter((topic) => {
      const haystack = `${topic.title} ${topic.description ?? ""}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [allTopics, normalizedQuery]);

  // Enhanced search: Use database search when query exists, otherwise use client-side filtering
  const filteredClips = useMemo(() => {
    // If we have database search results, filter clips by those IDs
    if (normalizedQuery && searchResults.length > 0) {
      const resultSet = new Set(searchResults);
      return displayClips.filter((clip) => resultSet.has(clip.id));
    }
    
    // Fallback to client-side filtering for non-text searches or when database search hasn't run
    if (!normalizedQuery) return displayClips;
    
    return displayClips.filter((clip) => {
      const needle = [
        clip.summary,
        clip.captions,
        clip.mood_emoji,
        clip.city,
        clip.title,
        Array.isArray(clip.tags) ? clip.tags.join(" ") : null,
        clip.profiles?.handle,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return needle.includes(normalizedQuery);
    });
  }, [displayClips, normalizedQuery, searchResults]);

  // Debounce search query for performance
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Enhanced database search when query or filters change
  useEffect(() => {
    const performSearch = async () => {
      const hasQuery = debouncedSearchQuery.trim().length > 0;
      const hasFilters = 
        advancedFilters.moodEmoji !== null ||
        advancedFilters.durationMin !== null ||
        advancedFilters.durationMax !== null ||
        advancedFilters.dateFrom !== null ||
        advancedFilters.dateTo !== null ||
        advancedFilters.city !== null ||
        advancedFilters.topicId !== null;

      // Only use database search if we have a query or filters
      if (!hasQuery && !hasFilters) {
        setSearchResults([]);
        setIsSearchingDatabase(false);
        return;
      }

      setIsSearchingDatabase(true);
      try {
        const result = await search.searchClips.mutateAsync({
          searchText: hasQuery ? debouncedSearchQuery : undefined,
          filters: hasFilters ? advancedFilters : undefined,
          limit: 100,
        });

        const clipIds = result.map((r) => r.clip_id);
        setSearchResults(clipIds);

        // Save to search history if we have a query
        if (hasQuery && profileId) {
          await search.saveSearchHistory.mutateAsync({
            query: debouncedSearchQuery,
            searchType: "text",
            filters: advancedFilters as unknown as Record<string, unknown>,
            resultCount: clipIds.length,
          });
        }
      } catch (error) {
        console.error("Error performing search:", error);
        setSearchResults([]);
      } finally {
        setIsSearchingDatabase(false);
      }
    };

    performSearch();
    // search.searchClips and search.saveSearchHistory are stable React Query mutations
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearchQuery, advancedFilters, profileId]);

  // Load recommended users for suggestions
  useEffect(() => {
    const loadRecommendedUsers = async () => {
      if (!profile?.id || isSearchMode) return;
      
      setIsLoadingUserRecommendations(true);
      try {
        const allRecommended: SearchProfile[] = [];
        const seenIds = new Set<string>([profile.id]); // Exclude current user

        // 1. Get users followed by people the current user follows (similar interests)
        if (profile.id) {
          const { data: following } = await supabase
            .from("follows")
            .select("following_id")
            .eq("follower_id", profile.id)
            .limit(20);

          if (following && following.length > 0) {
            const followingIds = following.map((f) => f.following_id);
            const { data: similarUsers } = await supabase
              .from("follows")
              .select("following_id")
              .in("follower_id", followingIds)
              .neq("following_id", profile.id)
              .limit(30);

            if (similarUsers) {
              const recommendedIds = new Map<string, number>();
              similarUsers.forEach((f) => {
                if (!followingIds.includes(f.following_id) && !seenIds.has(f.following_id)) {
                  recommendedIds.set(f.following_id, (recommendedIds.get(f.following_id) || 0) + 1);
                }
              });

              // Get profiles for similar users, ordered by recommendation count
              const sortedSimilarIds = Array.from(recommendedIds.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([id]) => id);

              if (sortedSimilarIds.length > 0) {
                const { data: profiles } = await supabase
                  .from("profiles")
                  .select("id, handle, emoji_avatar, city")
                  .in("id", sortedSimilarIds);

                if (profiles) {
                  const sortedProfiles = sortedSimilarIds
                    .map((id) => profiles.find((p) => p.id === id))
                    .filter((p): p is SearchProfile => p !== undefined);
                  allRecommended.push(...sortedProfiles);
                  sortedProfiles.forEach((p) => seenIds.add(p.id));
                }
              }
            }
          }
        }

        // 2. Get popular users (high follower count)
        const { data: popularFollowers } = await supabase
          .from("follows")
          .select("following_id")
          .neq("following_id", profile.id)
          .limit(200); // Get more to find popular ones

        if (popularFollowers) {
          const followerCounts = new Map<string, number>();
          popularFollowers.forEach((f) => {
            followerCounts.set(f.following_id, (followerCounts.get(f.following_id) || 0) + 1);
          });

          const topPopularIds = Array.from(followerCounts.entries())
            .filter(([id]) => !seenIds.has(id))
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([id]) => id);

          if (topPopularIds.length > 0) {
            const { data: popularProfiles } = await supabase
              .from("profiles")
              .select("id, handle, emoji_avatar, city")
              .in("id", topPopularIds);

            if (popularProfiles) {
              const sortedPopular = topPopularIds
                .map((id) => popularProfiles.find((p) => p.id === id))
                .filter((p): p is SearchProfile => p !== undefined);
              allRecommended.push(...sortedPopular);
              sortedPopular.forEach((p) => seenIds.add(p.id));
            }
          }
        }

        // 3. Get active users from same city (if city is set)
        if (profile.consent_city && profile.city) {
          const { data: cityUsers } = await supabase
            .from("profiles")
            .select("id, handle, emoji_avatar, city")
            .eq("city", profile.city)
            .neq("id", profile.id)
            .limit(5);

          if (cityUsers) {
            const cityProfiles = cityUsers.filter((p) => !seenIds.has(p.id));
            allRecommended.push(...cityProfiles);
            cityProfiles.forEach((p) => seenIds.add(p.id));
          }
        }

        // 4. Get trending users (recent activity with clips)
        const { data: recentClips } = await supabase
          .from("clips")
          .select("profile_id")
          .eq("status", "live")
          .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
          .not("profile_id", "is", null)
          .limit(100);

        if (recentClips) {
          const activeUserCounts = new Map<string, number>();
          recentClips.forEach((clip) => {
            if (clip.profile_id && !seenIds.has(clip.profile_id)) {
              activeUserCounts.set(clip.profile_id, (activeUserCounts.get(clip.profile_id) || 0) + 1);
            }
          });

          const trendingIds = Array.from(activeUserCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([id]) => id);

          if (trendingIds.length > 0) {
            const { data: trendingProfiles } = await supabase
              .from("profiles")
              .select("id, handle, emoji_avatar, city")
              .in("id", trendingIds);

            if (trendingProfiles) {
              const sortedTrending = trendingIds
                .map((id) => trendingProfiles.find((p) => p.id === id))
                .filter((p): p is SearchProfile => p !== undefined);
              allRecommended.push(...sortedTrending);
            }
          }
        }

        // Remove duplicates and limit to 10 recommendations
        const uniqueRecommended = Array.from(
          new Map(allRecommended.map((p) => [p.id, p])).values()
        ).slice(0, 10);

        setRecommendedUsers(uniqueRecommended);
      } catch (error) {
        console.error("Error loading recommended users:", error);
        setRecommendedUsers([]);
      } finally {
        setIsLoadingUserRecommendations(false);
      }
    };

    loadRecommendedUsers();
  }, [profile?.id, profile?.city, profile?.consent_city, isSearchMode]);

  // Search for profiles when user types (using debounced query)
  useEffect(() => {
    const searchProfilesAsync = async () => {
      const normalizedDebounced = debouncedSearchQuery.trim().toLowerCase();
      if (!normalizedDebounced || normalizedDebounced.length < 2) {
        setSearchProfiles([]);
        setIsSearchMode(false);
        if (normalizedDebounced.length === 0) {
          setShowSuggestions(false);
        }
        return;
      }

      setIsSearchMode(true);
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, handle, emoji_avatar, city")
          .ilike("handle", `%${normalizedDebounced}%`)
          .neq("id", profile?.id) // Exclude current user
          .limit(10);

        if (error) {
          console.error("Error searching profiles:", error);
          setSearchProfiles([]);
          setShowSuggestions(false);
          return;
        }

        const profiles = (data || []) as SearchProfile[];
        setSearchProfiles(profiles);
        setShowSuggestions(profiles.length > 0);
        setSelectedSuggestionIndex(-1);
      } catch (error) {
        console.error("Error searching profiles:", error);
        setSearchProfiles([]);
        setShowSuggestions(false);
      }
    };

    searchProfilesAsync();
  }, [debouncedSearchQuery, profile?.id]);

  // Show/hide suggestions based on search state
  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length === 0) {
      setIsSearchMode(false);
      if (recommendedUsers.length > 0 || isLoadingUserRecommendations) {
        // Keep suggestions visible if we have recommendations loading or loaded
      } else {
        setShowSuggestions(false);
      }
      setSelectedSuggestionIndex(-1);
    }
  }, [searchQuery, recommendedUsers.length, isLoadingUserRecommendations]);

  // Handle click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchDropdownRef.current &&
        !searchDropdownRef.current.contains(event.target as Node) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    if (showSuggestions) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showSuggestions]);

  // Handle keyboard navigation for suggestions
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!showSuggestions) return;
      
      const displayProfiles = isSearchMode ? searchProfiles : recommendedUsers;
      if (displayProfiles.length === 0) return;

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          setSelectedSuggestionIndex((prev) =>
            prev < displayProfiles.length - 1 ? prev + 1 : prev
          );
          break;
        case "ArrowUp":
          event.preventDefault();
          setSelectedSuggestionIndex((prev) => (prev > 0 ? prev - 1 : -1));
          break;
        case "Enter":
          event.preventDefault();
          if (selectedSuggestionIndex >= 0 && selectedSuggestionIndex < displayProfiles.length) {
            const selectedProfile = displayProfiles[selectedSuggestionIndex];
            navigate(`/profile/${selectedProfile.handle}`);
            setShowSuggestions(false);
            setSearchQuery("");
          }
          break;
        case "Escape":
          event.preventDefault();
          setShowSuggestions(false);
          setSelectedSuggestionIndex(-1);
          searchInputRef.current?.blur();
          break;
      }
    };

    if (showSuggestions) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [showSuggestions, searchProfiles, recommendedUsers, selectedSuggestionIndex, isSearchMode, navigate]);

  const paginatedDisplayClips = useMemo(() => {
    return displayClips.slice(0, displayedClipsCount);
  }, [displayClips, displayedClipsCount]);

  const hasMoreClips = useMemo(() => {
    return displayClips.length > displayedClipsCount;
  }, [displayClips.length, displayedClipsCount]);

  const isSearching = normalizedQuery.length > 0;
  const visibleClips = isSearching ? filteredClips : paginatedDisplayClips;

  const activeTopic = useMemo(
    () => (selectedTopicId ? allTopics.find((topic) => topic.id === selectedTopicId) ?? null : null),
    [allTopics, selectedTopicId],
  );

  const clipCountBaseLabel = isLoading
    ? "Loading..."
    : isSearching
      ? `${visibleClips.length} matching voices`
      : `${visibleClips.length} voices`;

  const clipCountLabel = activeTopic
    ? `${clipCountBaseLabel} • ${activeTopic.title}`
    : clipCountBaseLabel;

  const promptSeeds = useMemo(
    () => (todayTopic ? generatePromptSeeds(todayTopic) : []),
    [todayTopic],
  );

  // Get available cities from clips
  const availableCities = useMemo(() => {
    const cities = new Set<string>();
    clips.forEach((clip) => {
      if (clip.city) {
        cities.add(clip.city);
      }
    });
    return Array.from(cities).sort();
  }, [clips]);

  // Sync advancedFilters.topicId with selectedTopicId
  useEffect(() => {
    if (selectedTopicId && !advancedFilters.topicId) {
      setAdvancedFilters(prev => ({ ...prev, topicId: selectedTopicId }));
    } else if (!selectedTopicId && advancedFilters.topicId) {
      setAdvancedFilters(prev => ({ ...prev, topicId: null }));
    }
  }, [selectedTopicId, advancedFilters.topicId]);

  // Load saved searches using the hook
  useEffect(() => {
    if (search.savedSearches.data) {
      const formatted = search.savedSearches.data.map((saved) => ({
        id: saved.id,
        name: saved.name,
        filters: {
          ...saved.filters,
          dateFrom: saved.filters.dateFrom ? new Date(saved.filters.dateFrom) : null,
          dateTo: saved.filters.dateTo ? new Date(saved.filters.dateTo) : null,
        } as SearchFilters,
      }));
      setSavedSearches(formatted);
    }
  }, [search.savedSearches.data]);

  // Save search using the hook
  const handleSaveSearch = useCallback(async (name: string) => {
    if (!profileId) {
      toast({
        title: "Please log in",
        description: "You need to be logged in to save searches.",
        variant: "destructive",
      });
      return;
    }

    try {
      await search.saveSearch.mutateAsync({
        name,
        filters: advancedFilters,
      });

      toast({
        title: "Search saved",
        description: `"${name}" has been saved.`,
      });
    } catch (error) {
      console.error("Error saving search:", error);
      toast({
        title: "Couldn't save search",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  }, [profileId, advancedFilters, toast, search]);

  // Load search
  const handleLoadSearch = useCallback((filters: SearchFilters) => {
    setAdvancedFilters(filters);
    if (filters.topicId) {
      setSelectedTopicId(filters.topicId);
    }
    if (filters.searchQuery) {
      setSearchQuery(filters.searchQuery);
    }
    toast({
      title: "Search loaded",
      description: "Filters have been applied.",
    });
  }, [toast]);

  // Delete search using the hook
  const handleDeleteSearch = useCallback(async (id: string) => {
    try {
      await search.deleteSavedSearch.mutateAsync(id);

      toast({
        title: "Search deleted",
        description: "The saved search has been removed.",
      });
    } catch (error) {
      console.error("Error deleting search:", error);
      toast({
        title: "Couldn't delete search",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  }, [toast, search]);

  const handleTopicToggle = useCallback(
    (topicId: string | null) => {
      setSelectedTopicId((current) => (current === topicId ? null : topicId));
      setAdvancedFilters(prev => ({ ...prev, topicId }));
      if (topicId) {
        setSortMode("hot");
      }
    },
    [],
  );

  const handleReply = useCallback((clipId: string) => {
    const clip = clips.find((c) => c.id === clipId);
    if (clip) {
      setReplyingToClipId(clipId);
      setReplyingToClip({
        id: clip.id,
        handle: clip.profiles?.handle || "Anonymous",
        summary: clip.summary || null,
      });
      setIsRecordModalOpen(true);
    }
  }, [clips]);

  const handleRemix = useCallback((clipId: string) => {
    const clip = clips.find((c) => c.id === clipId);
    if (clip) {
      setRemixingFromClipId(clipId);
      setRemixingFromClip({
        id: clip.id,
        handle: clip.profiles?.handle || "Anonymous",
        summary: clip.summary || null,
      });
      setIsRecordModalOpen(true);
    }
  }, [clips]);

  const handleContinueChain = useCallback(async (clipId: string) => {
    const clip = clips.find((c) => c.id === clipId);
    if (!clip) return;

    // If clip already has a chain_id, use it; otherwise create a new chain
    let chainId = clip.chain_id;
    if (!chainId) {
      // Create a new chain
      const { data: newChain, error: chainError } = await supabase
        .from("clip_chains")
        .insert({
          title: clip.title || `Chain started by ${clip.profiles?.handle || "Anonymous"}`,
        })
        .select()
        .single();

      if (chainError || !newChain) {
        toast({
          title: "Couldn't create chain",
          description: "Please try again",
          variant: "destructive",
        });
        return;
      }

      chainId = newChain.id;

      // Update the original clip to be part of the chain
      await supabase
        .from("clips")
        .update({ chain_id: chainId })
        .eq("id", clipId);
    }

    setContinuingChainId(chainId);
    setContinuingChain({
      id: chainId,
      title: clip.title || null,
    });
    setIsRecordModalOpen(true);
  }, [clips, toast]);

  const handleRecordModalClose = useCallback(() => {
    setIsRecordModalOpen(false);
    setReplyingToClipId(null);
    setReplyingToClip(null);
    setRemixingFromClipId(null);
    setRemixingFromClip(null);
    setContinuingChainId(null);
    setContinuingChain(null);
  }, []);

  const loadDataRef = useRef(loadData);
  useEffect(() => {
    loadDataRef.current = loadData;
  }, [loadData]);

  useEffect(() => {
    // Load data on mount, profileId is already initialized from localStorage
    loadDataRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check for new daily topic when date changes (e.g., page open overnight)
  useEffect(() => {
    const checkDailyTopic = async () => {
      try {
        const todayISO = new Date().toISOString().slice(0, 10);
        
        // Check if today's topic exists
        const { data: todayTopic, error: checkError } = await supabase
          .from("topics")
          .select("*")
          .eq("date", todayISO)
          .maybeSingle();

        // If there's a 403 error, it's likely an RLS issue - silently ignore
        if (checkError && checkError.code !== 403) {
          console.warn("Error checking daily topic:", checkError);
          return;
        }

        // If no topic for today exists, generate it and reload data
        if (!todayTopic) {
          try {
            await supabase.functions.invoke("daily-topic", {
              body: {},
            });
            // Reload data to get the new topic
            loadDataRef.current();
          } catch (invokeError: any) {
            // Silently handle 403 errors - they're expected in some cases
            if (invokeError?.code !== 403) {
              console.warn("Failed to generate daily topic:", invokeError);
            }
          }
        }
      } catch (error: any) {
        // Silently handle 403 errors - they're expected in some cases
        if (error?.code !== 403) {
          console.warn("Error in checkDailyTopic:", error);
        }
      }
    };

    // Check immediately
    checkDailyTopic().catch((error: any) => {
      // Silently handle 403 errors
      if (error?.code !== 403) {
        console.warn("Error in initial checkDailyTopic:", error);
      }
    });

    // Set up interval to check every hour (in case date changes while page is open)
    const interval = setInterval(() => {
      checkDailyTopic().catch((error: any) => {
        // Silently handle 403 errors
        if (error?.code !== 403) {
          console.warn("Error in interval checkDailyTopic:", error);
        }
      });
    }, 60 * 60 * 1000);

    // Also check when page becomes visible (user returns to tab)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkDailyTopic().catch((error: any) => {
          // Silently handle 403 errors
          if (error?.code !== 403) {
            console.warn("Error in visibility checkDailyTopic:", error);
          }
        });
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const storedSortMode = localStorage.getItem("sortMode");
    if (storedSortMode === "hot" || storedSortMode === "top" || storedSortMode === "controversial" || storedSortMode === "rising") {
      setSortMode(storedSortMode);
    }
    const storedTimePeriod = localStorage.getItem("topTimePeriod");
    if (storedTimePeriod === "all" || storedTimePeriod === "week" || storedTimePeriod === "month") {
      setTopTimePeriod(storedTimePeriod);
    }
    const storedCityFilter = localStorage.getItem("cityFilter");
    if (storedCityFilter === "local" || storedCityFilter === "global") {
      setCityFilter(storedCityFilter);
    }
    const storedTopic = localStorage.getItem("focusedTopicId");
    if (storedTopic) {
      setSelectedTopicId(storedTopic);
    }
    const storedViewMode = localStorage.getItem("viewMode");
    if (storedViewMode === "list" || storedViewMode === "compact") {
      setViewMode(storedViewMode);
    }
  }, []);

  useEffect(() => {
    if (profileId && !isAuthLoading) {
      loadRecommendations();
      loadSimilarVoices();
    }
  }, [profileId, isAuthLoading, loadRecommendations, loadSimilarVoices]);

  useEffect(() => {
    topicIdsRef.current = [todayTopic?.id, ...recentTopics.map((topic) => topic.id)].filter(
      (id): id is string => Boolean(id),
    );
  }, [recentTopics, todayTopic]);

  useEffect(() => {
    if (!selectedTopicId) return;
    if (!topicIdsRef.current.includes(selectedTopicId)) {
      setSelectedTopicId(null);
    }
  }, [recentTopics, selectedTopicId, todayTopic]);

  // Infinite scroll
  useEffect(() => {
    if (!loadMoreTriggerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMoreClips) {
          setDisplayedClipsCount((prev) => Math.min(prev + 20, displayClips.length));
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(loadMoreTriggerRef.current);

    return () => observer.disconnect();
  }, [hasMoreClips, displayClips.length]);

  // Focus search input when focusSearch URL parameter is present
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("focusSearch") === "true") {
      // Small delay to ensure the input is rendered
      setTimeout(() => {
        searchInputRef.current?.focus();
        // Remove the parameter from URL without reloading
        const newParams = new URLSearchParams(location.search);
        newParams.delete("focusSearch");
        const newSearch = newParams.toString();
        window.history.replaceState(
          {},
          "",
          newSearch ? `${location.pathname}?${newSearch}` : location.pathname
        );
      }, 100);
    }
  }, [location.search, location.pathname]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs or textareas
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        // Allow Escape to clear search
        if (event.key === "Escape" && searchInputRef.current === target) {
          setSearchQuery("");
        }
        return;
      }

      // Focus search with /
      if (event.key === "/") {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      // New recording with n
      if (event.key === "n" && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        setIsRecordModalOpen(true);
        return;
      }

      // Toggle dark mode with d
      if (event.key === "d" && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        startTransition(() => {
          setTheme(theme === "dark" ? "light" : "dark");
        });
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [theme, setTheme]);

  useEffect(() => {
    if (!profile?.consent_city) {
      setCityFilter("global");
    }
  }, [profile?.consent_city]);

  useEffect(() => {
    localStorage.setItem("sortMode", sortMode);
  }, [sortMode]);

  useEffect(() => {
    localStorage.setItem("topTimePeriod", topTimePeriod);
  }, [topTimePeriod]);

  useEffect(() => {
    localStorage.setItem("cityFilter", cityFilter);
  }, [cityFilter]);

  useEffect(() => {
    if (selectedTopicId) {
      localStorage.setItem("focusedTopicId", selectedTopicId);
    } else {
      localStorage.removeItem("focusedTopicId");
    }
  }, [selectedTopicId]);

  useEffect(() => {
    localStorage.setItem("viewMode", viewMode);
  }, [viewMode]);

  // Reset displayed clips count when filters change
  useEffect(() => {
    setDisplayedClipsCount(20);
  }, [sortMode, topTimePeriod, cityFilter, selectedTopicId, moodFilter]);

  // Prefetch audio for next clips when user scrolls
  useEffect(() => {
    if (visibleClips.length === 0 || isSearching) return;

    const prefetchedIds = new Set<string>();
    const prefetchAudio = async (clip: Clip) => {
      if (!clip.audio_path || prefetchedIds.has(clip.id)) return;
      prefetchedIds.add(clip.id);
      
      try {
        const { data } = await supabase.storage
          .from("audio")
          .createSignedUrl(clip.audio_path, 3600);
        
        if (data?.signedUrl) {
          // Prefetch using link tag for browser caching
          const link = document.createElement("link");
          link.rel = "prefetch";
          link.as = "audio";
          link.href = data.signedUrl;
          document.head.appendChild(link);
        }
      } catch (error) {
        // Silently fail - prefetching is optional
        console.debug("Failed to prefetch audio:", error);
      }
    };

    // Find the index of the last visible clip in displayClips
    const lastVisibleClip = visibleClips[visibleClips.length - 1];
    if (!lastVisibleClip) return;

    const lastVisibleIndex = displayClips.findIndex((clip) => clip.id === lastVisibleClip.id);
    if (lastVisibleIndex === -1) return;

    // Prefetch next 3 clips after the last visible one
    const prefetchStart = lastVisibleIndex + 1;
    const prefetchEnd = Math.min(prefetchStart + 3, displayClips.length);

    for (let i = prefetchStart; i < prefetchEnd; i++) {
      const clip = displayClips[i];
      if (clip) {
        prefetchAudio(clip);
      }
    }
  }, [visibleClips, displayClips, isSearching]);

  useEffect(() => {
    const channel = supabase
      .channel("clips-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "clips" },
        async (payload) => {
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
              .eq("id", payload.new.id)
              .single();

            if (!error && data) {
              setClips((prev) => {
                const exists = prev.some((clip) => clip.id === data.id);
                if (exists) {
                  return prev.map((clip) => (clip.id === data.id ? (data as Clip) : clip));
                }
                return [data as Clip, ...prev].slice(0, 20);
              });
              refreshTopicMetrics().catch((err) => {
                console.error("Error refreshing topic metrics after insert:", err);
              });
            }
          } catch (error) {
            console.error("Error handling clip insert:", error);
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "clips" },
        async (payload) => {
          try {
            setClips((prev) =>
              prev.map((clip) =>
                clip.id === payload.new.id
                  ? {
                      ...clip,
                      ...payload.new,
                      profiles: clip.profiles,
                    }
                  : clip,
              ),
            );
            refreshTopicMetrics().catch((err) => {
              console.error("Error refreshing topic metrics after update:", err);
            });
          } catch (error) {
            console.error("Error handling clip update:", error);
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "clips" },
        (payload) => {
          try {
            setClips((prev) => prev.filter((clip) => clip.id !== payload.old.id));
            refreshTopicMetrics().catch((err) => {
              console.error("Error refreshing topic metrics after delete:", err);
            });
          } catch (error) {
            console.error("Error handling clip delete:", error);
          }
        },
      )
      .subscribe((status, err) => {
        // Handle subscription errors gracefully
        if (err) {
          // Suppress WebSocket errors - they're non-critical
          // The app works fine without real-time updates
          if (err.message?.includes("WebSocket") || err.message?.includes("websocket")) {
            // Silently ignore WebSocket connection errors
            return;
          }
          // Only log non-WebSocket errors
          console.debug("Realtime subscription error (non-critical):", err.message);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refreshTopicMetrics]);

  // Only show onboarding if there's no profile (auth is already loaded by AuthGuard)
  if (!profileId) {
    return <OnboardingFlow onComplete={handleOnboardingComplete} />;
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-2xl font-bold">Echo Garden</h1>
            <div className="flex items-center gap-2" data-tutorial="navigation" style={{ position: 'relative', zIndex: 10000 }}>
              <ThemeToggle />
              <KeyboardShortcutsDialog />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full" asChild>
                    <Link to="/live-rooms" aria-label="Live Rooms">
                      <Radio className="h-5 w-5" />
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Live Rooms - Join real-time voice conversations</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full" asChild>
                    <Link to="/communities" aria-label="Communities">
                      <Users className="h-5 w-5" />
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Communities - Discover and join themed groups</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full" asChild>
                    <Link to="/following" aria-label="Following">
                      <UserCheck className="h-5 w-5" />
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Following - See clips from creators you follow</p>
                </TooltipContent>
              </Tooltip>
              <NotificationCenter />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full" asChild>
                    <Link to="/saved" aria-label="Saved Clips">
                      <Bookmark className="h-5 w-5" />
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Saved Clips - View your bookmarked voices</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full" asChild>
                    <Link to="/my-recordings" aria-label="My Recordings">
                      <Mic className="h-5 w-5" />
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>My Recordings - Manage your published clips</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full" asChild>
                    <Link to="/settings" aria-label="Settings">
                      <Settings className="h-5 w-5" />
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Settings - Configure your account and preferences</p>
                </TooltipContent>
              </Tooltip>
              {isAdmin && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="rounded-full" asChild>
                      <Link to="/admin" aria-label="Admin Dashboard">
                        <Shield className="h-5 w-5" />
                      </Link>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Admin Dashboard - Manage moderation and security</p>
                  </TooltipContent>
                </Tooltip>
              )}
              {profile && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-2xl"
                      onClick={() => setIsCityDialogOpen(true)}
                      disabled={isAuthLoading}
                    >
                      {profile.consent_city && profile.city ? `City: ${profile.city}` : "Set city"}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{profile.consent_city && profile.city ? `Your city is set to ${profile.city}. Click to change.` : "Set your city to see local clips and connect with nearby voices"}</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
          <div className="relative group">
            <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground group-focus-within:text-foreground transition-colors" />
            <Input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                if (event.target.value.trim().length >= 2) {
                  setShowSuggestions(true);
                }
              }}
              onFocus={() => {
                if (isSearchMode && searchProfiles.length > 0 && searchQuery.trim().length >= 2) {
                  setShowSuggestions(true);
                } else if (!isSearchMode && (recommendedUsers.length > 0 || isLoadingUserRecommendations)) {
                  setShowSuggestions(true);
                }
              }}
              placeholder="Search voices, topics, moods..."
              className="h-12 rounded-2xl border-transparent bg-muted/60 pl-11 pr-24 text-sm shadow-sm transition focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-ring/40"
              aria-label="Search clips and topics"
              aria-describedby="search-hint"
              data-tutorial="search"
            />
            {isSearching || isSearchingDatabase ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setShowSuggestions(false);
                  setSelectedSuggestionIndex(-1);
                  setSearchResults([]);
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear
              </button>
            ) : (
              <span id="search-hint" className="pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 text-xs font-medium text-muted-foreground/80 sm:block">
                Press <kbd className="px-1.5 py-0.5 text-xs font-semibold text-muted-foreground bg-muted border border-border rounded">/</kbd> to search
              </span>
            )}
            
            {/* Enhanced Search Suggestions */}
            {showSuggestions && !isSearchMode && (
              <SearchSuggestions
                query={searchQuery}
                profileId={profileId}
                onSelectSuggestion={(suggestion) => {
                  setSearchQuery(suggestion);
                  setShowSuggestions(false);
                }}
                onClearHistory={async () => {
                  if (profileId) {
                    await search.clearSearchHistory.mutateAsync();
                  }
                }}
                className="mt-2"
              />
            )}
            
            {/* User Suggestions Dropdown */}
            {showSuggestions && (
              <div
                ref={searchDropdownRef}
                className="absolute left-0 right-0 top-full mt-2 z-50 bg-popover border border-border rounded-2xl shadow-lg max-h-[400px] overflow-y-auto"
              >
                <div className="p-2">
                  {isSearchMode ? (
                    <>
                      {searchProfiles.length > 0 ? (
                        <>
                          <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            Search Results
                          </div>
                          {searchProfiles.map((profile, index) => (
                            <Link
                              key={profile.id}
                              to={`/profile/${profile.handle}`}
                              onClick={() => {
                                setShowSuggestions(false);
                                setSearchQuery("");
                              }}
                              className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${
                                selectedSuggestionIndex === index
                                  ? "bg-accent text-accent-foreground"
                                  : "hover:bg-muted/50"
                              }`}
                              onMouseEnter={() => setSelectedSuggestionIndex(index)}
                            >
                              <div className="text-2xl flex-shrink-0">{profile.emoji_avatar}</div>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-sm truncate">@{profile.handle}</p>
                                {profile.city && (
                                  <p className="text-xs text-muted-foreground truncate">{profile.city}</p>
                                )}
                              </div>
                              <div className="flex-shrink-0 text-xs text-muted-foreground">→</div>
                            </Link>
                          ))}
                        </>
                      ) : (
                        <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                          No users found
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      {isLoadingUserRecommendations ? (
                        <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                          Loading recommendations...
                        </div>
                      ) : recommendedUsers.length > 0 ? (
                        <>
                          <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            Suggested for You
                          </div>
                          {recommendedUsers.map((profile, index) => (
                            <Link
                              key={profile.id}
                              to={`/profile/${profile.handle}`}
                              onClick={() => {
                                setShowSuggestions(false);
                                setSearchQuery("");
                              }}
                              className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${
                                selectedSuggestionIndex === index
                                  ? "bg-accent text-accent-foreground"
                                  : "hover:bg-muted/50"
                              }`}
                              onMouseEnter={() => setSelectedSuggestionIndex(index)}
                            >
                              <div className="text-2xl flex-shrink-0">{profile.emoji_avatar}</div>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-sm truncate">@{profile.handle}</p>
                                {profile.city && (
                                  <p className="text-xs text-muted-foreground truncate">{profile.city}</p>
                                )}
                              </div>
                              <div className="flex-shrink-0 text-xs text-muted-foreground">→</div>
                            </Link>
                          ))}
                        </>
                      ) : (
                        <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                          Start typing to search for users
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div data-tutorial="view-mode">
              <ViewModeToggle viewMode={viewMode} onViewModeChange={setViewMode} />
            </div>
            <div className="flex bg-muted/60 rounded-full p-1" data-tutorial="feed-sorting">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    className="rounded-full px-4"
                    variant={sortMode === "hot" ? "default" : "ghost"}
                    onClick={() => setSortMode("hot")}
                  >
                    Hot
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Hot - Trending now with recent engagement</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    className="rounded-full px-4"
                    variant={sortMode === "top" ? "default" : "ghost"}
                    onClick={() => setSortMode("top")}
                  >
                    Top
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Top - Highest engagement (all-time, week, or month)</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    className="rounded-full px-4"
                    variant={sortMode === "controversial" ? "default" : "ghost"}
                    onClick={() => setSortMode("controversial")}
                  >
                    Controversial
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Controversial - High engagement with mixed reactions</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    className="rounded-full px-4"
                    variant={sortMode === "rising" ? "default" : "ghost"}
                    onClick={() => setSortMode("rising")}
                  >
                    Rising
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Rising - Gaining traction quickly</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    className="rounded-full px-4"
                    variant={sortMode === "trending" ? "default" : "ghost"}
                    onClick={() => setSortMode("trending")}
                  >
                    Trending
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Trending - Algorithm picks based on quality and engagement</p>
                </TooltipContent>
              </Tooltip>
            </div>
            {sortMode === "top" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Select value={topTimePeriod} onValueChange={(value: "all" | "week" | "month") => setTopTimePeriod(value)}>
                      <SelectTrigger className="h-9 w-[120px] rounded-full bg-muted/60 border-transparent">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All time</SelectItem>
                        <SelectItem value="week">This week</SelectItem>
                        <SelectItem value="month">This month</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Time period for Top sorting - choose how far back to look</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          {profile?.consent_city && profile.city && (
            <div className="flex bg-muted/60 rounded-full p-1" data-tutorial="filters">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    className="rounded-full px-4"
                    variant={cityFilter === "global" ? "default" : "ghost"}
                    onClick={() => setCityFilter("global")}
                  >
                    Everyone
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Show clips from all locations worldwide</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    className="rounded-full px-4"
                    variant={cityFilter === "local" ? "default" : "ghost"}
                    onClick={() => setCityFilter("local")}
                  >
                    Near you
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Show clips from your city: {profile.city}</p>
                </TooltipContent>
              </Tooltip>
            </div>
          )}
          <div className="flex bg-muted/60 rounded-full p-1 gap-1" data-tutorial="filters">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  className="rounded-full px-3"
                  variant={moodFilter === null ? "default" : "ghost"}
                  onClick={() => setMoodFilter(null)}
                >
                  All moods
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Show clips with any mood or reaction</p>
              </TooltipContent>
            </Tooltip>
            {["😊", "🔥", "❤️", "🙏", "😔", "😂", "😮", "🧘", "💡"].map((emoji) => {
              const moodLabels: Record<string, string> = {
                "😊": "Happy",
                "🔥": "Fire/Exciting",
                "❤️": "Love",
                "🙏": "Grateful",
                "😔": "Sad",
                "😂": "Funny",
                "😮": "Surprised",
                "🧘": "Calm/Peaceful",
                "💡": "Insightful"
              };
              return (
                <Tooltip key={emoji}>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      className="rounded-full px-3 text-lg"
                      variant={moodFilter === emoji ? "default" : "ghost"}
                      onClick={() => setMoodFilter(moodFilter === emoji ? null : emoji)}
                    >
                      {emoji}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Filter by {moodLabels[emoji] || emoji} reactions</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </div>

        {isSearching && (
          <>
            {searchProfiles.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Creators</h2>
                  <span className="text-xs uppercase tracking-wide text-muted-foreground/80">
                    {searchProfiles.length} found
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {searchProfiles.map((searchProfile) => (
                    <CreatorSearchResult key={searchProfile.id} profile={searchProfile} viewerProfileId={profile?.id} />
                  ))}
                </div>
              </section>
            )}

            {filteredTopics.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Matching topics</h2>
                  <span className="text-xs uppercase tracking-wide text-muted-foreground/80">
                    {filteredTopics.length} found
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {filteredTopics.map((topic) => (
                    <div
                      key={topic.id}
                      className="rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg"
                    >
                      <p className="text-xs uppercase tracking-wide text-muted-foreground/70">
                        {new Date(topic.date).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                      <p className="mt-1 text-sm font-semibold">{topic.title}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{topic.description}</p>
                      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {topicMetrics[topic.id]?.posts ?? 0}{" "}
                          {topicMetrics[topic.id]?.posts === 1 ? "voice" : "voices"}
                        </span>
                        <span>{topicMetrics[topic.id]?.listens ?? 0} listens</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {!isSearching && todayTopic && (
          <div className="space-y-4">
            <div className="bg-gradient-to-br from-primary/20 to-accent/20 rounded-3xl p-8 text-center space-y-3" data-tutorial="today-topic">
              <p className="text-sm text-muted-foreground uppercase tracking-wide">
                Garden Spotlight
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={selectedTopicId === todayTopic.id ? "default" : "secondary"}
                      size="sm"
                      className="rounded-full"
                      onClick={() => handleTopicToggle(todayTopic.id)}
                    >
                      {selectedTopicId === todayTopic.id ? "Focused on this topic" : "Focus this topic"}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{selectedTopicId === todayTopic.id ? "Click to show all topics" : "Show only clips about today's topic"}</p>
                  </TooltipContent>
                </Tooltip>
                <Badge variant="secondary" className="rounded-full px-3 py-1">
                  {topicMetrics[todayTopic.id]?.listens ?? 0} listeners tuned in
                </Badge>
              </div>
              <Link to={`/topic/${todayTopic.id}`} className="block">
                <h2 className="text-3xl font-bold hover:underline">{todayTopic.title}</h2>
              </Link>
              <p className="text-muted-foreground">{todayTopic.description}</p>
              <div className="flex justify-center gap-4 text-sm text-muted-foreground">
                <span>
                  {topicMetrics[todayTopic.id]?.posts ?? 0}{" "}
                  {topicMetrics[todayTopic.id]?.posts === 1 ? "voice" : "voices"}
                </span>
                <span>
                  {topicMetrics[todayTopic.id]?.listens ?? 0} listens
                </span>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={() => setIsRecordModalOpen(true)}
                    size="lg"
                    className="mt-4 h-14 px-8 rounded-2xl"
                  >
                    <Mic className="mr-2 h-5 w-5" />
                    Share your voice
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Record a 30-second voice clip about today's topic (or press 'n' key)</p>
                </TooltipContent>
              </Tooltip>
              {promptSeeds.length > 0 && (
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {promptSeeds.map((seed, index) => (
                    <Button
                      key={`${seed}-${index}`}
                      variant="outline"
                      size="sm"
                      className="rounded-full text-xs"
                      onClick={() => setSearchQuery(seed)}
                    >
                      {seed}
                    </Button>
                  ))}
                </div>
              )}
            </div>

            {recentTopics.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Topics</h3>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant={selectedTopicId === null ? "default" : "ghost"}
                        className="w-full justify-between h-9 px-3 rounded-xl text-xs"
                        onClick={() => handleTopicToggle(null)}
                      >
                        <span className="font-medium">All voices</span>
                        <span className="text-xs text-muted-foreground">
                          {totalValidClips}
                        </span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Show all clips from all topics</p>
                    </TooltipContent>
                  </Tooltip>
                  <div className="flex flex-wrap gap-1.5">
                    {recentTopics.map((topic) => {
                      const posts = topicMetrics[topic.id]?.posts ?? 0;
                      const isSelected = selectedTopicId === topic.id;
                      
                      return (
                        <button
                          key={topic.id}
                          onClick={() => handleTopicToggle(topic.id)}
                          className={`text-left rounded-xl border px-3 py-2 transition-all ${
                            isSelected
                              ? "border-primary bg-primary/10 text-primary font-medium"
                              : "border-border/40 bg-card/60 hover:border-primary/30 hover:bg-card/80"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium line-clamp-1">
                              {topic.title}
                            </span>
                            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                              {posts}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {!isSearching && recommendedClips.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">You might like</h3>
              <span className="text-xs text-muted-foreground">Based on your listening history</span>
            </div>
            <div className="space-y-4">
              {recommendedClips.map((clip) => (
                <ClipCard key={clip.id} clip={clip} showReplyButton={true} viewMode={viewMode} />
              ))}
            </div>
          </section>
        )}

        {!isSearching && similarVoicesClips.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Similar voices</h3>
              <span className="text-xs text-muted-foreground">Creators you might enjoy</span>
            </div>
            <div className="space-y-4">
              {similarVoicesClips.map((clip) => (
                <ClipCard key={clip.id} clip={clip} showReplyButton={true} viewMode={viewMode} />
              ))}
            </div>
          </section>
        )}

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">{clipCountLabel}</h3>
          </div>

          {visibleClips.length === 0 && !isLoading && (
            <div className="text-center py-12 space-y-3">
              {isSearching ? (
                <>
                  <p className="text-xl text-muted-foreground">
                    No voices match “{searchQuery.trim()}”
                  </p>
                  <p className="text-sm text-muted-foreground/80">
                    Try a different keyword or reset the filters.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xl text-muted-foreground">
                    Plant the first voice in today&apos;s garden
                  </p>
                  <Button
                    onClick={() => setIsRecordModalOpen(true)}
                    variant="outline"
                    size="lg"
                    className="rounded-2xl"
                  >
                    Get started
                  </Button>
                </>
              )}
            </div>
          )}

          {isLoading ? (
            <ClipListSkeleton count={3} compact={viewMode === "compact"} />
          ) : (
            <div className="space-y-4">
              {visibleClips.map((clip, index) => (
                <div key={clip.id} data-tutorial={index === 0 ? "clip-card" : undefined}>
                  <ClipCard
                    clip={clip}
                    captionsDefault={profile?.default_captions ?? true}
                    highlightQuery={normalizedQuery}
                    onReply={handleReply}
                    onRemix={handleRemix}
                    onContinueChain={handleContinueChain}
                    showReplyButton={true}
                    viewMode={viewMode}
                  />
                  {clip.reply_count && clip.reply_count > 0 && viewMode === "list" && (
                    <ThreadView
                      parentClip={clip}
                      onReply={handleReply}
                      highlightQuery={normalizedQuery}
                    />
                  )}
                  {clip.chain_id && viewMode === "list" && (
                    <div className="mt-4">
                      <ChainView
                        chainId={clip.chain_id}
                        onReply={handleReply}
                        onRemix={handleRemix}
                        onContinueChain={handleContinueChain}
                        highlightQuery={normalizedQuery}
                      />
                    </div>
                  )}
                </div>
              ))}
              {!isSearching && hasMoreClips && (
                <div ref={loadMoreTriggerRef} className="h-20 flex items-center justify-center">
                  <Skeleton className="h-4 w-32" />
                </div>
              )}
              {!isSearching && !hasMoreClips && visibleClips.length > 0 && (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  You've reached the end
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <div data-tutorial="record-button" className="fixed bottom-6 right-6 z-50 flex flex-col gap-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={() => setIsBulkUploadModalOpen(true)}
              size="lg"
              variant="outline"
              className="h-14 w-14 rounded-full shadow-lg"
            >
              <Upload className="h-6 w-6" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">
            <p>Bulk Upload - Upload multiple audio files at once</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={() => setIsRecordModalOpen(true)}
              size="lg"
              className="h-16 w-16 rounded-full shadow-lg animate-pulse-glow"
            >
              <Plus className="h-8 w-8" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">
            <p>Record a new voice clip (or press 'n' key)</p>
          </TooltipContent>
        </Tooltip>
      </div>

      <RecordModal
        isOpen={isRecordModalOpen}
        onClose={handleRecordModalClose}
        topicId={(selectedTopicId ?? todayTopic?.id) || ""}
        onSuccess={loadData}
        profileCity={profile?.city ?? null}
        profileConsentCity={profile?.consent_city ?? false}
        tapToRecordPreferred={profile?.tap_to_record ?? false}
        parentClipId={replyingToClipId}
        remixOfClipId={remixingFromClipId}
        chainId={continuingChainId}
        onOpenBulkUpload={() => setIsBulkUploadModalOpen(true)}
        replyingTo={replyingToClip}
        remixingFrom={remixingFromClip}
        continuingChain={continuingChain}
      />

      <BulkUploadModal
        isOpen={isBulkUploadModalOpen}
        onClose={() => setIsBulkUploadModalOpen(false)}
        topicId={(selectedTopicId ?? todayTopic?.id) || ""}
        onSuccess={loadData}
        profileCity={profile?.city ?? null}
        profileConsentCity={profile?.consent_city ?? false}
      />

      <CityOptInDialog
        open={isCityDialogOpen}
        onOpenChange={setIsCityDialogOpen}
        initialCity={profile?.city}
        initialConsent={profile?.consent_city}
        onSave={handleSaveCity}
      />

      {showTutorial && (
        <InteractiveTutorial
          onComplete={() => setShowTutorial(false)}
        />
      )}

      <BackToTop />

      <style>{`
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
};

const Mic = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" x2="12" y1="19" y2="22" />
  </svg>
);

export default Index;
