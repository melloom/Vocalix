import { useState, useEffect, useCallback, useMemo, useRef, startTransition } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Plus, Settings, Search as SearchIcon, Mic, Bookmark, Users, Activity, Radio, Shield, Trophy, X, MessageCircle, Compass } from "lucide-react";
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
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { InteractiveTutorial } from "@/components/InteractiveTutorial";
import { ClipCard } from "@/components/ClipCard";
import { PostCard } from "@/components/PostCard";
import { RecordModal } from "@/components/RecordModal";
import { PostModal } from "@/components/PostModal";
import { RemixModal } from "@/components/RemixModal";
import { BulkUploadModal } from "@/components/BulkUploadModal";
import { ThreadView } from "@/components/ThreadView";
import { ChainView } from "@/components/ChainView";
import { CommunityRecommendationsSidebar } from "@/components/CommunityRecommendationsSidebar";
import { VirtualizedFeed } from "@/components/VirtualizedFeed";
import { LeftSidebar } from "@/components/LeftSidebar";
import { UpNextPreview } from "@/components/UpNextPreview";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CityOptInDialog } from "@/components/CityOptInDialog";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ViewModeToggle } from "@/components/ViewModeToggle";
import { KeyboardShortcutsDialog } from "@/components/KeyboardShortcutsDialog";
import { useTheme } from "next-themes";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useFollow } from "@/hooks/useFollow";
import { useBlockedUsers } from "@/hooks/useBlock";
import { useAdminStatus } from "@/hooks/useAdminStatus";
import { UserPlus, UserCheck } from "lucide-react";
import { AdvancedSearchFilters, SearchFilters } from "@/components/AdvancedSearchFilters";
import { VoiceSearchButton } from "@/components/VoiceSearchButton";
import { useAuth } from "@/context/AuthContext";
import { NotificationCenter } from "@/components/NotificationCenter";
import { BackToTop } from "@/components/BackToTop";
import { useSearch } from "@/hooks/useSearch";
import { SearchSuggestions } from "@/components/SearchSuggestions";
import { usePersonalizedFeed } from "@/hooks/usePersonalizedFeed";
import { useFeedFilters, FeedFilterType, TimePeriod } from "@/hooks/useFeedFilters";
import { FeedFilterSelector } from "@/components/FeedFilterSelector";

interface Topic {
  id: string;
  title: string;
  description: string;
  date: string;
  is_active?: boolean;
  user_created_by?: string | null;
  creator?: {
    id: string;
    handle: string;
    emoji_avatar: string;
  } | null;
}

interface TopicMetrics {
  posts: number;
  listens: number;
}

interface SpotlightQuestion {
  id: string;
  topic_id: string;
  profile_id: string | null;
  content: string;
  is_question: boolean;
  is_answered: boolean;
  upvotes_count: number;
  replies_count: number;
  spotlight_score: number;
  created_at: string;
  topic_title: string;
  topic_description: string;
  profile_handle: string | null;
  profile_emoji_avatar: string | null;
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
  const title = topic.title ?? "";
  
  // Helper to check if a seed is too similar to description or title
  const isTooSimilar = (seed: string): boolean => {
    const seedLower = seed.toLowerCase();
    const descLower = description.toLowerCase();
    const titleLower = title.toLowerCase();
    
    // Check if seed is essentially the same as description
    if ((descLower && seedLower.includes(descLower)) || (descLower && descLower.includes(seedLower))) {
      return true;
    }
    
    // Check if seed is just title + generic text (redundant)
    if (titleLower && seedLower.startsWith(titleLower.toLowerCase()) && 
        (seedLower.includes("share a moment") || seedLower.includes("share a memory"))) {
      return true;
    }
    
    return false;
  };
  
  const segments = description
    .split(/[\n•.;?!]/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && segment.length < 100); // Filter out very long segments

  // Filter out segments that are too similar to the full description
  const uniqueSegments = segments.filter(segment => {
    const segmentLower = segment.toLowerCase();
    const descLower = description.toLowerCase();
    // Don't include if it's too similar to the full description
    return !isTooSimilar(segment) && segmentLower !== descLower;
  });

  const seeds = [...uniqueSegments];

  // Add diverse fallback seeds that aren't redundant
  const fallbackSeeds = [
    `How does "${title}" show up for you?`,
    `Tell a story about "${title}"`,
    `What comes to mind when you think of "${title}"?`,
    `Reflect on "${title}"`,
    `Share your experience with "${title}"`,
  ];

  // Add fallback seeds that aren't too similar
  for (const fallback of fallbackSeeds) {
    if (seeds.length >= 3) break;
    if (!isTooSimilar(fallback)) {
      seeds.push(fallback);
    }
  }

  // If we still don't have enough, add generic prompts (but avoid the redundant one)
  while (seeds.length < 3) {
    const genericSeed = `Share your thoughts on "${title}"`;
    if (!isTooSimilar(genericSeed)) {
      seeds.push(genericSeed);
    } else {
      // Last resort - just use a simple prompt
      seeds.push(`Tell us about it`);
      break;
    }
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

// Inner component that does the actual work
const IndexInner = () => {
  console.log('[Index] Component rendering...');
  
  const navigate = useNavigate();
  const location = useLocation();
  
  // Use centralized auth context - MUST be called unconditionally
  const { profileId, profile, isLoading: isAuthLoading, deviceId } = useAuth();
  console.log('[Index] Auth loaded, profileId:', profileId);
  
  // Define handleOnboardingComplete early
  const handleOnboardingComplete = useCallback((newProfileId: string) => {
    console.log('[Index] Onboarding complete, profileId:', newProfileId);
    // Force a reload to refresh the page with the new profile
    window.location.reload();
  }, []);
  
  // CRITICAL: Early return for onboarding - do this BEFORE other hooks that might fail
  // This prevents hooks from running if user hasn't onboarded yet
  if (!profileId) {
    console.log('[Index] No profileId, showing onboarding immediately');
    return <OnboardingFlow onComplete={handleOnboardingComplete} />;
  }
  
  // Only call these hooks if we have a profileId (after early return)
  const search = useSearch(profileId);
  console.log('[Index] Search hook loaded');
  
  const { blockedUsers } = useBlockedUsers();
  console.log('[Index] BlockedUsers hook loaded');
  
  const { isAdmin } = useAdminStatus();
  console.log('[Index] AdminStatus hook loaded');
  
  const blockedUserIds = useMemo(() => {
    try {
      return new Set(blockedUsers.map(b => b.blocked_id));
    } catch {
      return new Set();
    }
  }, [blockedUsers]);
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  
  // Listen for record modal trigger from BottomNavigation
  useEffect(() => {
    const handleOpenRecordModal = () => {
      setIsRecordModalOpen(true);
    };
    
    window.addEventListener("openRecordModal", handleOpenRecordModal);
    return () => {
      window.removeEventListener("openRecordModal", handleOpenRecordModal);
    };
  }, []);
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [isBulkUploadModalOpen, setIsBulkUploadModalOpen] = useState(false);
  const [isRemixModalOpen, setIsRemixModalOpen] = useState(false);
  const [todayTopic, setTodayTopic] = useState<Topic | null>(null);
  const [recentTopics, setRecentTopics] = useState<Topic[]>([]);
  const [spotlightQuestion, setSpotlightQuestion] = useState<SpotlightQuestion | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [topicMetrics, setTopicMetrics] = useState<Record<string, TopicMetrics>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [sortMode, setSortMode] = useState<"hot" | "top" | "controversial" | "rising" | "trending" | "for_you" | null>(null);
  const [feedFilter, setFeedFilter] = useState<FeedFilterType>("for_you");
  const [feedTimePeriod, setFeedTimePeriod] = useState<TimePeriod>("day");
  const [topTimePeriod, setTopTimePeriod] = useState<"all" | "week" | "month">("all");
  const [cityFilter, setCityFilter] = useState<"global" | "local">("global");
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [isCityDialogOpen, setIsCityDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [replyingToClipId, setReplyingToClipId] = useState<string | null>(null);
  const [replyingToClip, setReplyingToClip] = useState<{ id: string; handle: string; summary?: string | null } | null>(null);
  const [remixingFromClipId, setRemixingFromClipId] = useState<string | null>(null);
  const [remixingFromClip, setRemixingFromClip] = useState<Clip | null>(null);
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
  const [savedClipsCount, setSavedClipsCount] = useState<number | null>(null);
  const [advancedFilters, setAdvancedFilters] = useState<SearchFilters>({
    moodEmoji: null, // Keep for backward compatibility but use categoryFilter instead
    durationMin: null,
    durationMax: null,
    durationPreset: null,
    dateFrom: null,
    dateTo: null,
    city: null,
    topicId: null,
    qualityBadge: null,
    emotion: null,
    searchQuery: "",
    minReactions: null,
    minListens: null,
    minCompletionRate: null,
    creatorReputation: null,
    language: null,
  });
  const [savedSearches, setSavedSearches] = useState<Array<{ id: string; name: string; filters: SearchFilters }>>([]);
  const [showTutorial, setShowTutorial] = useState(false);
  const [searchResults, setSearchResults] = useState<string[]>([]); // Clip IDs from database search
  const [searchedTopics, setSearchedTopics] = useState<Topic[]>([]); // Topics from database search
  const [isSearchingDatabase, setIsSearchingDatabase] = useState(false);
  const [isShortcutsDialogOpen, setIsShortcutsDialogOpen] = useState(false);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  
  // Personalized feed
  const { personalizedClips, isLoading: isLoadingPersonalized, error: personalizedError } = usePersonalizedFeed(100);
  
  // Enhanced feed filters
  const { clips: bestClips, isLoading: isLoadingBest } = useFeedFilters({
    filterType: "best",
    limit: 100,
    timePeriod: feedTimePeriod,
  });
  
  const { clips: risingClips, isLoading: isLoadingRising } = useFeedFilters({
    filterType: "rising",
    limit: 100,
  });
  
  const { clips: controversialClips, isLoading: isLoadingControversial } = useFeedFilters({
    filterType: "controversial",
    limit: 100,
  });
  
  const { clips: followedClips, isLoading: isLoadingFollowed } = useFeedFilters({
    filterType: "from_followed",
    limit: 100,
  });
  
  const { clips: unheardClips, isLoading: isLoadingUnheard } = useFeedFilters({
    filterType: "unheard",
    limit: 100,
  });
  
  const { clips: cityClips, isLoading: isLoadingCity } = useFeedFilters({
    filterType: "from_city",
    limit: 100,
    city: profile?.city || undefined,
  });

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

      // Strictly match today's date - only use today's topic, never fall back to old topics
      // This ensures the spotlight changes daily
      // If no topic found, don't override the state (in case it was just set in loadData)
      const todayCandidate = sortedByDate.find(
        (topic) => topic.date === todayISO && topic.is_active !== false
      );
      
      // Only update if we found a topic - don't clear todayTopic if it's already set correctly
      // This prevents clearing todayTopic when applyTopicCuration runs before the topic is in the list

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

      // Only update todayTopic if we found today's topic - preserve existing state (including fallback)
      // This ensures todayTopic set in loadData (which may be a fallback) is not cleared
      if (todayCandidate && todayCandidate.date === todayISO) {
        setTodayTopic(todayCandidate);
      }
      // Don't clear todayTopic if we don't find today's topic - keep the fallback from loadData
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

  const fetchSpotlightQuestion = useCallback(async () => {
    try {
      // Pass current question ID to exclude it (for rotation)
      const excludeId = spotlightQuestion?.id || null;
      // Get today's topic ID to prioritize questions from today's topic
      const todayTopicId = todayTopic?.id || null;
      const { data, error } = await supabase.rpc('get_spotlight_question', {
        p_exclude_question_id: excludeId,
        p_today_topic_id: todayTopicId,
      });
      
      if (error) {
        // If function doesn't exist yet or RLS issue, silently fail and use topic
        console.warn("Could not fetch spotlight question:", error);
        setSpotlightQuestion(null);
        return;
      }

      if (data && data.length > 0) {
        const question = data[0] as SpotlightQuestion;
        // Only show spotlight question if it has good engagement (at least 2 upvotes or 3 replies)
        if (question.upvotes_count >= 2 || question.replies_count >= 3) {
          setSpotlightQuestion(question);
        } else {
          setSpotlightQuestion(null);
        }
      } else {
        setSpotlightQuestion(null);
      }
    } catch (error) {
      console.warn("Error fetching spotlight question:", error);
      setSpotlightQuestion(null);
    }
  }, [spotlightQuestion?.id, todayTopic?.id]);

  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const todayISO = new Date().toISOString().slice(0, 10);
      
      // Check if today's topic exists, if not, generate it
      let { data: todayTopic, error: todayCheckError } = await supabase
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
          // Wait for the topic to be created, with retries
          let retries = 3;
          let newlyCreatedTopic = null;
          while (retries > 0 && !newlyCreatedTopic) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            
            // Re-fetch today's topic to ensure we have it
            const { data: refetchedTopic, error: refetchError } = await supabase
              .from("topics")
              .select("*")
              .eq("date", todayISO)
              .maybeSingle();
            
            if (refetchedTopic && !refetchError) {
              newlyCreatedTopic = refetchedTopic;
            }
            retries--;
          }
          
          if (newlyCreatedTopic) {
            todayTopic = newlyCreatedTopic;
          }
        } catch (invokeError: any) {
          // Silently handle 403 errors - they're expected in some cases
          if (invokeError?.code !== 403) {
            console.warn("Failed to generate daily topic:", invokeError);
          }
          // Continue anyway - we'll check for today's topic in the full list
        }
      }

      const { data: topics, error: topicsError } = await supabase
        .from("topics")
        .select(`
          *,
          creator:user_created_by (
            id,
            handle,
            emoji_avatar
          )
        `)
        .order("date", { ascending: false })
        .limit(20);

      if (topicsError) {
        throw topicsError;
      }

      // Ensure today's topic is included in the topics array if we have it
      let allTopics = (topics ?? []).map((topic: any) => ({
        ...topic,
        creator: topic.creator || (topic.user_created_by ? null : undefined),
      }));
      
      // If we don't have today's topic yet, check if it exists in the fetched topics
      if (!todayTopic) {
        todayTopic = allTopics.find((t) => t.date === todayISO && t.is_active !== false) || null;
      }
      
      if (todayTopic && !allTopics.find((t) => t.id === todayTopic.id)) {
        allTopics = [todayTopic, ...allTopics];
      }

      const activeTopics = allTopics.filter((topic) => topic.is_active !== false);
      const topicIds = activeTopics.map((topic) => topic.id);
      topicIdsRef.current = topicIds;

      const metrics = await fetchTopicMetrics(topicIds);
      setTopicMetrics(metrics);
      
      // If we have today's topic, explicitly set it before calling applyTopicCuration
      // This ensures the Garden Spotlight shows even if applyTopicCuration doesn't find it
      if (todayTopic && todayTopic.is_active !== false && todayTopic.date === todayISO) {
        setTodayTopic(todayTopic);
      } else if (activeTopics.length > 0) {
        // Fallback: use the most recent active topic if today's topic doesn't exist
        // This ensures Garden Spotlight always shows something
        const mostRecentTopic = activeTopics[0];
        setTodayTopic(mostRecentTopic);
      } else {
        setTodayTopic(null);
      }
      
      applyTopicCuration(activeTopics, metrics);

      // Fetch spotlight question (best/most engaging question)
      await fetchSpotlightQuestion();

      // Load saved clips count if user is logged in
      if (profileId) {
        try {
          const { count, error: countError } = await supabase
            .from("saved_clips")
            .select("*", { count: "exact", head: true })
            .eq("profile_id", profileId);
          
          if (!countError && count !== null) {
            setSavedClipsCount(count);
          }
        } catch (err) {
          // Silently fail - bookmark count is not critical
          console.debug("Could not load saved clips count:", err);
        }
      }

      // First, get all clips (including replies) to calculate reply counts
      // @ts-ignore - show_18_plus_content exists but not in generated types
      const has18PlusAccess = profile?.show_18_plus_content ?? false;
      let clipsQuery = supabase
        .from("clips")
        .select(`
          *,
          profiles (
            handle,
            emoji_avatar
          )
        `)
        .in("status", ["live", "processing"]);
      
      // Filter out NSFW clips if user hasn't enabled 18+ content
      if (!has18PlusAccess) {
        clipsQuery = clipsQuery.or("content_rating.is.null,content_rating.eq.general");
      }
      
      const { data: allClipsData, error: allClipsError } = await clipsQuery;

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

      // Load posts
      // Reuse has18PlusAccess from above - no need to redeclare
      let postsQuery = supabase
        .from("posts")
        .select(`
          *,
          profiles (
            handle,
            emoji_avatar
          ),
          communities (
            name,
            slug
          ),
          clip_flairs (
            id,
            name,
            color,
            background_color
          )
        `)
        .eq("status", "live")
        .eq("visibility", "public")
        .is("deleted_at", null);
      
      // Filter out NSFW posts if user hasn't enabled 18+ content
      if (!has18PlusAccess) {
        postsQuery = postsQuery.eq("is_nsfw", false);
      }
      
      const { data: postsData, error: postsError } = await postsQuery
        .order("created_at", { ascending: false })
        .limit(50);

      if (!postsError && postsData) {
        setPosts(postsData);
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
      // @ts-ignore - show_18_plus_content exists but not in generated types
      const has18PlusAccess = profile?.show_18_plus_content ?? false;
      let recommendedQuery = supabase
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
        );
      
      // Filter out NSFW clips if user hasn't enabled 18+ content
      if (!has18PlusAccess) {
        recommendedQuery = recommendedQuery.or("content_rating.is.null,content_rating.eq.general");
      }
      
      const { data: recommended, error: recommendedError } = await recommendedQuery
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
  }, [profileId, profile]);

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
      // @ts-ignore - show_18_plus_content exists but not in generated types
      const has18PlusAccess = profile?.show_18_plus_content ?? false;
      let similarClipsQuery = supabase
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
        .not("id", "in", `(${listenedClipIds.join(",")})`);
      
      // Filter out NSFW clips if user hasn't enabled 18+ content
      if (!has18PlusAccess) {
        similarClipsQuery = similarClipsQuery.or("content_rating.is.null,content_rating.eq.general");
      }
      
      const { data: similarClips, error: similarClipsError } = await similarClipsQuery
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
  }, [profileId, profile]);

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

  // Convert feed filter clips to Clip format
  const convertFeedClipsToClips = useCallback((feedClips: any[]): Clip[] => {
    return feedClips.map((item) => {
      const clipData = item.clip_data || item;
      return {
        id: clipData.id || item.clip_id,
        profile_id: clipData.profile_id,
        audio_path: clipData.audio_path,
        duration_seconds: clipData.duration_seconds,
        title: clipData.title,
        captions: clipData.captions,
        summary: clipData.summary,
        tags: clipData.tags,
        mood_emoji: clipData.mood_emoji,
        status: clipData.status,
        listens_count: clipData.listens_count,
        reactions: clipData.reactions || {},
        created_at: clipData.created_at,
        topic_id: clipData.topic_id,
        completion_rate: clipData.completion_rate,
        trending_score: clipData.trending_score,
        city: clipData.city,
        parent_clip_id: clipData.parent_clip_id,
        reply_count: clipData.reply_count,
        remix_of_clip_id: clipData.remix_of_clip_id,
        remix_count: clipData.remix_count,
        chain_id: clipData.chain_id,
        challenge_id: clipData.challenge_id,
        is_podcast: clipData.is_podcast,
        profiles: null, // Will be populated if needed
      } as Clip;
    });
  }, []);

  const displayClips = useMemo(() => {
    // Use new feed filters if feedFilter is set
    if (feedFilter !== "for_you" && feedFilter !== null) {
      let feedClips: any[] = [];
      let isLoading = false;

      switch (feedFilter) {
        case "best":
          feedClips = bestClips;
          isLoading = isLoadingBest;
          break;
        case "rising":
          feedClips = risingClips;
          isLoading = isLoadingRising;
          break;
        case "controversial":
          feedClips = controversialClips;
          isLoading = isLoadingControversial;
          break;
        case "from_followed":
          feedClips = followedClips;
          isLoading = isLoadingFollowed;
          break;
        case "unheard":
          feedClips = unheardClips;
          isLoading = isLoadingUnheard;
          break;
        case "from_city":
          feedClips = cityClips;
          isLoading = isLoadingCity;
          break;
        default:
          break;
      }

      if (isLoading) {
        return [];
      }

      let filtered = convertFeedClipsToClips(feedClips);
      
      // Filter out blocked users
      if (blockedUserIds.size > 0) {
        filtered = filtered.filter((clip) => !clip.profile_id || !blockedUserIds.has(clip.profile_id));
      }
      
      // Apply topic filter if set
      const topicFilter = advancedFilters.topicId || selectedTopicId;
      if (topicFilter) {
        filtered = filtered.filter((clip) => clip.topic_id === topicFilter);
      }
      
      return filtered;
    }

    // If "For You" mode, use personalized clips
    if (sortMode === "for_you" || feedFilter === "for_you") {
      if (isLoadingPersonalized) {
        return [];
      }
      // Filter personalized clips the same way as regular clips
      let filtered = personalizedClips as Clip[];
      
      // Filter out blocked users
      if (blockedUserIds.size > 0) {
        filtered = filtered.filter((clip) => !clip.profile_id || !blockedUserIds.has(clip.profile_id));
      }
      
      // Apply filters
      const topicFilter = advancedFilters.topicId || selectedTopicId;
      if (topicFilter) {
        filtered = filtered.filter((clip) => clip.topic_id === topicFilter);
      }
      
      if (advancedFilters.moodEmoji) {
        filtered = filtered.filter((clip) => clip.mood_emoji === advancedFilters.moodEmoji);
      }
      
      // Return sorted by combined_score (already sorted by the hook)
      return filtered;
    }
    
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

    // Mood emoji filter (legacy support)
    if (advancedFilters.moodEmoji) {
      filtered = filtered.filter((clip) => clip.mood_emoji === advancedFilters.moodEmoji);
    }

    // Category filter (new professional system)
    if (categoryFilter) {
      // Map category to tags or content patterns
      const categoryPatterns: Record<string, (clip: Clip) => boolean> = {
        discussion: (clip) => 
          (clip.captions?.toLowerCase().includes('discuss') || 
           clip.captions?.toLowerCase().includes('talk') ||
           clip.captions?.toLowerCase().includes('conversation')) ?? false,
        story: (clip) => 
          (clip.captions?.toLowerCase().includes('story') || 
           clip.captions?.toLowerCase().includes('narrative') ||
           clip.captions?.toLowerCase().includes('tale')) ?? false,
        opinion: (clip) => 
          (clip.captions?.toLowerCase().includes('think') || 
           clip.captions?.toLowerCase().includes('opinion') ||
           clip.captions?.toLowerCase().includes('believe') ||
           clip.captions?.toLowerCase().includes('feel')) ?? false,
        question: (clip) => 
          (clip.captions?.includes('?') || 
           clip.captions?.toLowerCase().includes('question') ||
           clip.captions?.toLowerCase().includes('ask') ||
           clip.captions?.toLowerCase().includes('wonder')) ?? false,
        tutorial: (clip) => 
          (clip.captions?.toLowerCase().includes('how to') || 
           clip.captions?.toLowerCase().includes('tutorial') ||
           clip.captions?.toLowerCase().includes('guide') ||
           clip.captions?.toLowerCase().includes('learn')) ?? false,
        news: (clip) => 
          (clip.captions?.toLowerCase().includes('news') || 
           clip.captions?.toLowerCase().includes('update') ||
           clip.captions?.toLowerCase().includes('announcement')) ?? false,
        entertainment: (clip) => 
          (clip.captions?.toLowerCase().includes('entertainment') || 
           clip.captions?.toLowerCase().includes('fun') ||
           clip.captions?.toLowerCase().includes('enjoy')) ?? false,
        music: (clip) => 
          (clip.captions?.toLowerCase().includes('music') || 
           clip.captions?.toLowerCase().includes('song') ||
           clip.captions?.toLowerCase().includes('melody') ||
           clip.tags?.some(tag => tag.toLowerCase().includes('music'))) ?? false,
        sports: (clip) => 
          (clip.captions?.toLowerCase().includes('sport') || 
           clip.captions?.toLowerCase().includes('game') ||
           clip.captions?.toLowerCase().includes('team') ||
           clip.tags?.some(tag => tag.toLowerCase().includes('sport'))) ?? false,
        tech: (clip) => 
          (clip.captions?.toLowerCase().includes('tech') || 
           clip.captions?.toLowerCase().includes('technology') ||
           clip.captions?.toLowerCase().includes('software') ||
           clip.captions?.toLowerCase().includes('app') ||
           clip.tags?.some(tag => tag.toLowerCase().includes('tech'))) ?? false,
        business: (clip) => 
          (clip.captions?.toLowerCase().includes('business') || 
           clip.captions?.toLowerCase().includes('work') ||
           clip.captions?.toLowerCase().includes('career') ||
           clip.captions?.toLowerCase().includes('company')) ?? false,
        health: (clip) => 
          (clip.captions?.toLowerCase().includes('health') || 
           clip.captions?.toLowerCase().includes('wellness') ||
           clip.captions?.toLowerCase().includes('fitness') ||
           clip.captions?.toLowerCase().includes('medical')) ?? false,
        education: (clip) => 
          (clip.captions?.toLowerCase().includes('education') || 
           clip.captions?.toLowerCase().includes('learn') ||
           clip.captions?.toLowerCase().includes('study') ||
           clip.captions?.toLowerCase().includes('teach')) ?? false,
        comedy: (clip) => 
          (clip.captions?.toLowerCase().includes('funny') || 
           clip.captions?.toLowerCase().includes('comedy') ||
           clip.captions?.toLowerCase().includes('joke') ||
           clip.captions?.toLowerCase().includes('laugh') ||
           clip.mood_emoji === '😂') ?? false,
        inspiration: (clip) => 
          (clip.captions?.toLowerCase().includes('inspire') || 
           clip.captions?.toLowerCase().includes('motivate') ||
           clip.captions?.toLowerCase().includes('encourage') ||
           clip.captions?.toLowerCase().includes('uplift')) ?? false,
      };

      const pattern = categoryPatterns[categoryFilter];
      if (pattern) {
        filtered = filtered.filter(pattern);
      }
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
      
      // Filter out NSFW content if user hasn't enabled 18+ content
      // @ts-ignore - show_18_plus_content exists but not in generated types
      const has18PlusAccess = profile?.show_18_plus_content ?? false;
      if (!has18PlusAccess) {
        // Filter out clips with sensitive content rating
        if (clip.content_rating === "sensitive") {
          return false;
        }
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

        // Default to "hot" behavior if no sort mode is selected
        const effectiveSortMode = sortMode || "hot";

        if (effectiveSortMode === "hot") {
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
        } else if (effectiveSortMode === "top") {
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
        } else if (effectiveSortMode === "controversial") {
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
        } else if (effectiveSortMode === "rising") {
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
        } else if (effectiveSortMode === "trending") {
          // Trending: Use pre-calculated trending_score from database
          // This score is calculated server-side using engagement × freshness × quality
          score = clip.trending_score ?? 0;
        }

        return { clip, score };
      })
      .filter((entry): entry is { clip: Clip; score: number } => entry !== null)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.clip);
  }, [cityFilter, clips, sortMode, topTimePeriod, profile?.city, selectedTopicId, topicMetrics, advancedFilters, blockedUserIds, personalizedClips, isLoadingPersonalized, feedFilter, bestClips, risingClips, controversialClips, followedClips, unheardClips, cityClips, isLoadingBest, isLoadingRising, isLoadingControversial, isLoadingFollowed, isLoadingUnheard, isLoadingCity, convertFeedClipsToClips]);

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
    // If we have database search results, use those
    if (normalizedQuery && searchedTopics.length > 0) {
      return searchedTopics;
    }
    
    // Otherwise, filter from allTopics (todayTopic + recentTopics)
    if (!normalizedQuery) return allTopics;
    return allTopics.filter((topic) => {
      const haystack = `${topic.title} ${topic.description ?? ""}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [allTopics, normalizedQuery, searchedTopics]);

  // Enhanced search: Use database search when query exists, otherwise use client-side filtering
  const filteredClips = useMemo(() => {
    // @ts-ignore - show_18_plus_content exists but not in generated types
    const has18PlusAccess = profile?.show_18_plus_content ?? false;
    
    // If we have database search results, filter clips by those IDs
    if (normalizedQuery && searchResults.length > 0) {
      const resultSet = new Set(searchResults);
      return displayClips.filter((clip) => {
        if (!resultSet.has(clip.id)) return false;
        // Filter NSFW content if user hasn't enabled 18+ content
        if (!has18PlusAccess && clip.content_rating === "sensitive") {
          return false;
        }
        return true;
      });
    }
    
    // Fallback to client-side filtering for non-text searches or when database search hasn't run
    if (!normalizedQuery) {
      // Still filter NSFW content even when not searching
      if (!has18PlusAccess) {
        return displayClips.filter((clip) => clip.content_rating !== "sensitive");
      }
      return displayClips;
    }
    
    return displayClips.filter((clip) => {
      // Filter NSFW content if user hasn't enabled 18+ content
      if (!has18PlusAccess && clip.content_rating === "sensitive") {
        return false;
      }
      
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
  }, [displayClips, normalizedQuery, searchResults, profile]);

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
        advancedFilters.durationPreset !== null ||
        advancedFilters.dateFrom !== null ||
        advancedFilters.dateTo !== null ||
        advancedFilters.city !== null ||
        advancedFilters.topicId !== null ||
        advancedFilters.minReactions !== null ||
        advancedFilters.minListens !== null ||
        advancedFilters.minCompletionRate !== null ||
        advancedFilters.creatorReputation !== null ||
        advancedFilters.language !== null;

      // Only use database search if we have a query or filters
      if (!hasQuery && !hasFilters) {
        setSearchResults([]);
        setSearchedTopics([]);
        setIsSearchingDatabase(false);
        return;
      }

      setIsSearchingDatabase(true);
      try {
        // Search clips
        const result = await search.searchClips.mutateAsync({
          searchText: hasQuery ? debouncedSearchQuery : undefined,
          filters: hasFilters ? advancedFilters : undefined,
          limit: 100,
        });

        const clipIds = result.map((r) => r.clip_id);
        setSearchResults(clipIds);

        // Search topics if we have a query
        if (hasQuery) {
          const query = debouncedSearchQuery.trim();
          const { data: topicsData, error: topicsError } = await supabase
            .from('topics')
            .select('*')
            .eq('is_active', true)
            .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
            .order('trending_score', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(20);

          if (!topicsError && topicsData) {
            setSearchedTopics(topicsData as Topic[]);
          } else {
            console.error("Error searching topics:", topicsError);
            setSearchedTopics([]);
          }
        } else {
          setSearchedTopics([]);
        }

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
        setSearchedTopics([]);
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
        // Get admin profile IDs to exclude them from recommendations
        const { data: adminData } = await supabase
          .from("admins")
          .select("profile_id");
        const adminIds = new Set(adminData?.map((a) => a.profile_id) || []);

        const allRecommended: SearchProfile[] = [];
        const seenIds = new Set<string>([profile.id, ...adminIds]); // Exclude current user and admins

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
                    .filter((p): p is SearchProfile => p !== undefined && !adminIds.has(p.id));
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
                .filter((p): p is SearchProfile => p !== undefined && !adminIds.has(p.id));
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
            const cityProfiles = cityUsers.filter((p) => !seenIds.has(p.id) && !adminIds.has(p.id));
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
                .filter((p): p is SearchProfile => p !== undefined && !adminIds.has(p.id));
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
        // Get admin profile IDs to exclude them from search
        const { data: adminData } = await supabase
          .from("admins")
          .select("profile_id");
        const adminIds = new Set(adminData?.map((a) => a.profile_id) || []);

        const { data, error } = await supabase
          .from("profiles")
          .select("id, handle, emoji_avatar, city")
          .ilike("handle", `%${normalizedDebounced}%`)
          .neq("id", profile?.id) // Exclude current user
          .limit(20); // Fetch more to account for filtering

        if (error) {
          console.error("Error searching profiles:", error);
          setSearchProfiles([]);
          setShowSuggestions(false);
          return;
        }

        // Filter out admin accounts
        const profiles = ((data || []) as SearchProfile[])
          .filter((p) => !adminIds.has(p.id))
          .slice(0, 10); // Limit to 10 after filtering
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

  const loadMoreClips = useCallback(() => {
    if (hasMoreClips) {
      setDisplayedClipsCount((prev) => Math.min(prev + 20, displayClips.length));
    }
  }, [hasMoreClips, displayClips.length]);

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
      setRemixingFromClip(clip);
      setIsRemixModalOpen(true);
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

  // Refresh spotlight question periodically (every 2 minutes) to catch new engagement
  useEffect(() => {
    const interval = setInterval(() => {
      fetchSpotlightQuestion();
    }, 120000); // 2 minutes

    return () => clearInterval(interval);
  }, [fetchSpotlightQuestion]);

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
  useKeyboardShortcuts({
    onFocusSearch: () => {
      searchInputRef.current?.focus();
    },
    onNewRecording: () => {
      setIsRecordModalOpen(true);
    },
    onToggleTheme: () => {
      startTransition(() => {
        setTheme(theme === "dark" ? "light" : "dark");
      });
    },
    onGoHome: () => {
      navigate("/");
      setSortMode("hot");
    },
    onGoTrending: () => {
      navigate("/");
      setSortMode("trending");
    },
    onGoForYou: () => {
      navigate("/");
      setSortMode("for_you");
    },
    onGoSaved: () => {
      navigate("/saved");
    },
    onShowShortcuts: () => {
      setIsShortcutsDialogOpen(true);
    },
  });

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
  }, [sortMode, topTimePeriod, cityFilter, selectedTopicId, categoryFilter]);

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
          .createSignedUrl(clip.audio_path, 86400); // 24 hours for better CDN caching
        
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
    return (
      <ErrorBoundary>
        <OnboardingFlow onComplete={handleOnboardingComplete} />
      </ErrorBoundary>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-2xl font-bold">Echo Garden</h1>
            <div className="flex items-center gap-2" data-tutorial="navigation" style={{ position: 'relative', zIndex: 10000 }}>
              <ThemeToggle />
              <KeyboardShortcutsDialog 
                open={isShortcutsDialogOpen}
                onOpenChange={setIsShortcutsDialogOpen}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full" asChild>
                    <Link to="/voice-amas" aria-label="Voice AMAs">
                      <MessageCircle className="h-5 w-5" />
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Voice AMAs - Ask Me Anything sessions</p>
                </TooltipContent>
              </Tooltip>
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
                    <Link to="/leaderboards" aria-label="Leaderboards">
                      <Trophy className="h-5 w-5" />
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Leaderboards - See top creators, listeners, and more</p>
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
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full" asChild>
                    <Link to="/discovery" aria-label="Discovery">
                      <Compass className="h-5 w-5" />
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Discovery - Personalized recommendations</p>
                </TooltipContent>
              </Tooltip>
              {/* @ts-ignore - show_18_plus_content exists but not in generated types */}
              {profile?.show_18_plus_content && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="rounded-full" asChild>
                      <Link to="/18-plus" aria-label="18+ Content">
                        <span className="text-lg font-bold">18+</span>
                      </Link>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>18+ Content - NSFW content</p>
                  </TooltipContent>
                </Tooltip>
              )}
              <NotificationCenter />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full relative" asChild>
                    <Link to="/saved" aria-label="Saved Clips">
                      <Bookmark className="h-5 w-5" />
                      {savedClipsCount !== null && savedClipsCount > 0 && (
                        <Badge 
                          variant="default" 
                          className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs rounded-full"
                        >
                          {savedClipsCount > 99 ? '99+' : savedClipsCount}
                        </Badge>
                      )}
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Saved Clips - View your bookmarked voices{savedClipsCount !== null && savedClipsCount > 0 && ` (${savedClipsCount})`}</p>
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
              className="h-12 rounded-2xl border-transparent bg-muted/60 pl-11 pr-32 text-sm shadow-sm transition focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-ring/40"
              aria-label="Search clips and topics"
              aria-describedby="search-hint"
              data-tutorial="search"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
              <VoiceSearchButton
                onTranscript={(transcript) => {
                  setSearchQuery(transcript);
                  if (transcript.trim().length >= 2) {
                    setShowSuggestions(true);
                  }
                }}
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
                  className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors px-2"
                >
                  Clear
                </button>
              ) : (
                <span id="search-hint" className="pointer-events-none hidden text-xs font-medium text-muted-foreground/80 sm:block">
                  Press <kbd className="px-1.5 py-0.5 text-xs font-semibold text-muted-foreground bg-muted border border-border rounded">/</kbd> to search
                </span>
              )}
            </div>
            
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

      <main className="max-w-7xl mx-auto px-4 py-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left Sidebar - Hidden on mobile, visible on large screens */}
          <aside className="hidden lg:block lg:col-span-3">
            <LeftSidebar />
          </aside>

          {/* Main Content */}
          <div className="lg:col-span-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-card border border-border/50 rounded-lg p-2">
          <div className="flex items-center gap-2">
            <div data-tutorial="view-mode">
              <ViewModeToggle viewMode={viewMode} onViewModeChange={setViewMode} />
            </div>
            <div data-tutorial="feed-sorting">
              <FeedFilterSelector
                currentFilter={feedFilter}
                timePeriod={feedTimePeriod}
                onFilterChange={(filter) => {
                  setFeedFilter(filter);
                  // Also update sortMode for backward compatibility
                  if (filter === "for_you") {
                    setSortMode("for_you");
                  } else if (filter === "best") {
                    setSortMode("top");
                  } else if (filter === "rising") {
                    setSortMode("rising");
                  } else if (filter === "controversial") {
                    setSortMode("controversial");
                  } else {
                    setSortMode(null);
                  }
                }}
                onTimePeriodChange={(period) => setFeedTimePeriod(period)}
                showTimePeriod={feedFilter === "best"}
              />
              {/* Legacy sort mode buttons for backward compatibility */}
              {sortMode && sortMode !== "for_you" && (
                <div className="flex bg-muted/50 rounded-md p-0.5 mt-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        className="rounded-md px-3 text-xs h-7"
                        variant={sortMode === "hot" ? "default" : "ghost"}
                        onClick={() => setSortMode(sortMode === "hot" ? null : "hot")}
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
                        className="rounded-md px-3 text-xs h-7"
                        variant={sortMode === "top" ? "default" : "ghost"}
                        onClick={() => setSortMode(sortMode === "top" ? null : "top")}
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
                        className="rounded-md px-3 text-xs h-7"
                        variant={sortMode === "trending" ? "default" : "ghost"}
                        onClick={() => setSortMode(sortMode === "trending" ? null : "trending")}
                      >
                        Trending
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Trending - Algorithm picks based on quality and engagement</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              )}
              {profile?.id && sortMode === "for_you" && feedFilter !== "for_you" && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      className="rounded-md px-3 text-xs h-7"
                      variant={sortMode === "for_you" ? "default" : "ghost"}
                      onClick={() => {
                        setSortMode(null);
                        setFeedFilter("for_you");
                      }}
                    >
                      For You
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>For You - Personalized feed based on your interests and listening history</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            {sortMode === "top" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Select value={topTimePeriod} onValueChange={(value: "all" | "week" | "month") => setTopTimePeriod(value)}>
                      <SelectTrigger className="h-7 w-[100px] rounded-md bg-muted/50 border-transparent text-xs">
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
            <div className="flex bg-muted/50 rounded-md p-0.5" data-tutorial="filters">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    className="rounded-md px-3 text-xs h-7"
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
                    className="rounded-md px-3 text-xs h-7"
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
          <div className="flex items-center gap-2 flex-wrap" data-tutorial="filters">
            <Select value={categoryFilter || "all"} onValueChange={(value) => setCategoryFilter(value === "all" ? null : value)}>
              <SelectTrigger className="w-[200px] h-9">
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="discussion">Discussion</SelectItem>
                <SelectItem value="story">Story</SelectItem>
                <SelectItem value="opinion">Opinion</SelectItem>
                <SelectItem value="question">Question</SelectItem>
                <SelectItem value="tutorial">Tutorial</SelectItem>
                <SelectItem value="news">News</SelectItem>
                <SelectItem value="entertainment">Entertainment</SelectItem>
                <SelectItem value="music">Music</SelectItem>
                <SelectItem value="sports">Sports</SelectItem>
                <SelectItem value="tech">Technology</SelectItem>
                <SelectItem value="business">Business</SelectItem>
                <SelectItem value="health">Health & Wellness</SelectItem>
                <SelectItem value="education">Education</SelectItem>
                <SelectItem value="comedy">Comedy</SelectItem>
                <SelectItem value="inspiration">Inspiration</SelectItem>
              </SelectContent>
            </Select>
            {categoryFilter && (
              <Badge variant="secondary" className="gap-2 px-3 py-1.5">
                <span className="text-xs font-medium capitalize">{categoryFilter.replace('_', ' ')}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0 hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setCategoryFilter(null)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            )}
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
                  {filteredTopics.map((topic) => {
                    const isDuplicate = filteredTopics.some(
                      (t) => t.id !== topic.id && (t.date === topic.date || t.title.toLowerCase() === topic.title.toLowerCase())
                    );
                    
                    return (
                      <Link
                        key={topic.id}
                        to={`/topic/${topic.id}`}
                        onClick={() => {
                          setShowSuggestions(false);
                          setSearchQuery("");
                        }}
                        className="block rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg cursor-pointer"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground/70">
                            {(() => {
                              // Parse date string (YYYY-MM-DD) as local date to avoid timezone issues
                              const [year, month, day] = topic.date.split('-').map(Number);
                              const localDate = new Date(year, month - 1, day);
                              return localDate.toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                              });
                            })()}
                          </p>
                          {/* Show small creator badge if this is a duplicate topic */}
                          {isDuplicate && topic.user_created_by && topic.creator && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-[9px] text-muted-foreground/70 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-muted/40 border border-border/30">
                                  <span>{topic.creator.emoji_avatar}</span>
                                  <span>@{topic.creator.handle}</span>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Created by @{topic.creator.handle}</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                        <p className="mt-1 text-sm font-semibold">{topic.title}</p>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{topic.description}</p>
                        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                          <span>
                            {topicMetrics[topic.id]?.posts ?? 0}{" "}
                            {topicMetrics[topic.id]?.posts === 1 ? "voice" : "voices"}
                          </span>
                          <span>{topicMetrics[topic.id]?.listens ?? 0} listens</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}

        {!isSearching && !sortMode && (spotlightQuestion || todayTopic) && (
          <div className="space-y-4">
            <div className="bg-card border-2 border-primary/30 rounded-lg p-6 text-center space-y-3 shadow-sm" data-tutorial="today-topic">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Garden Spotlight
              </p>
              
              {spotlightQuestion ? (
                // Show spotlight question when we have a good one
                <>
                  <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
                    <Badge variant="default" className="rounded-md px-2 py-0.5 text-xs bg-primary">
                      🔥 Hot Question
                    </Badge>
                    {spotlightQuestion.is_answered && (
                      <Badge variant="secondary" className="rounded-md px-2 py-0.5 text-xs">
                        ✓ Answered
                      </Badge>
                    )}
                    {!spotlightQuestion.is_answered && (
                      <Badge variant="outline" className="rounded-md px-2 py-0.5 text-xs border-orange-500 text-orange-600 dark:text-orange-400">
                        💭 Need Answers
                      </Badge>
                    )}
                  </div>
                  <Link to={`/topic/${spotlightQuestion.topic_id}`} className="block">
                    <p className="text-sm text-muted-foreground mb-2 hover:underline">
                      {spotlightQuestion.topic_title}
                    </p>
                  </Link>
                  <h2 className="text-xl font-bold mb-3">{spotlightQuestion.content}</h2>
                  {spotlightQuestion.profile_handle && (
                    <p className="text-sm text-muted-foreground mb-3">
                      Asked by @{spotlightQuestion.profile_handle} {spotlightQuestion.profile_emoji_avatar}
                    </p>
                  )}
                  <div className="flex justify-center gap-4 text-sm text-muted-foreground mb-4">
                    <span className="flex items-center gap-1">
                      <span className="font-semibold text-foreground">{spotlightQuestion.upvotes_count}</span>
                      {spotlightQuestion.upvotes_count === 1 ? 'upvote' : 'upvotes'}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="font-semibold text-foreground">{spotlightQuestion.replies_count}</span>
                      {spotlightQuestion.replies_count === 1 ? 'reply' : 'replies'}
                    </span>
                  </div>
                  <Link to={`/topic/${spotlightQuestion.topic_id}`}>
                    <Button
                      size="lg"
                      className="mt-2 h-10 px-6 rounded-md"
                    >
                      Join the Discussion
                    </Button>
                  </Link>
                </>
              ) : todayTopic ? (
                // Fall back to topic spotlight when no good question
                <>
                  <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant={selectedTopicId === todayTopic.id ? "default" : "secondary"}
                          size="sm"
                          className="rounded-md text-xs h-7"
                          onClick={() => handleTopicToggle(todayTopic.id)}
                        >
                          {selectedTopicId === todayTopic.id ? "Focused on this topic" : "Focus this topic"}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{selectedTopicId === todayTopic.id ? "Click to show all topics" : "Show only clips about today's topic"}</p>
                      </TooltipContent>
                    </Tooltip>
                    <Badge variant="secondary" className="rounded-md px-2 py-0.5 text-xs">
                      {topicMetrics[todayTopic.id]?.listens ?? 0} listeners tuned in
                    </Badge>
                  </div>
                  <Link to={`/topic/${todayTopic.id}`} className="block">
                    <div className="flex items-center gap-2 justify-center mb-2">
                      <h2 className="text-2xl font-bold hover:underline">{todayTopic.title}</h2>
                      {/* Show creator badge if this is a duplicate topic (user-created) */}
                      {todayTopic.user_created_by && todayTopic.creator && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-xs text-muted-foreground/70 flex items-center gap-1 px-2 py-1 rounded-full bg-muted/50 border border-border/40">
                              <span>{todayTopic.creator.emoji_avatar}</span>
                              <span>@{todayTopic.creator.handle}</span>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Created by @{todayTopic.creator.handle}</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
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
                        className="mt-4 h-10 px-6 rounded-md"
                      >
                        <Mic className="mr-2 h-4 w-4" />
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
                          className="rounded-md text-xs h-7"
                        >
                          {seed}
                        </Button>
                      ))}
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </div>
        )}

        {!isSearching && recommendedClips.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">You might like</h3>
              <span className="text-xs text-muted-foreground">Based on your listening history</span>
            </div>
            <div className="space-y-3">
              {recommendedClips.map((clip) => (
                <ClipCard key={clip.id} clip={clip} showReplyButton={true} viewMode={viewMode} />
              ))}
            </div>
          </section>
        )}

        {!isSearching && similarVoicesClips.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Similar voices</h3>
              <span className="text-xs text-muted-foreground">Creators you might enjoy</span>
            </div>
            <div className="space-y-3">
              {similarVoicesClips.map((clip) => (
                <ClipCard key={clip.id} clip={clip} showReplyButton={true} viewMode={viewMode} />
              ))}
            </div>
          </section>
        )}

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{clipCountLabel}</h3>
          </div>

          {visibleClips.length === 0 && !isLoading && !(sortMode === "for_you" && isLoadingPersonalized) && (
            <div className="text-center py-12 space-y-3">
              {isSearching ? (
                <>
                  <p className="text-xl text-muted-foreground">
                    No voices match "{searchQuery.trim()}"
                  </p>
                  <p className="text-sm text-muted-foreground/80">
                    Try a different keyword or reset the filters.
                  </p>
                </>
              ) : sortMode === "for_you" ? (
                <>
                  <p className="text-xl text-muted-foreground">
                    Your personalized feed is empty
                  </p>
                  <p className="text-sm text-muted-foreground/80">
                    Follow topics and creators, or listen to clips to get personalized recommendations
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

          {(isLoading || (sortMode === "for_you" && isLoadingPersonalized)) ? (
            <ClipListSkeleton count={3} compact={viewMode === "compact"} />
          ) : (visibleClips.length > 0 || posts.length > 0) ? (
            <div className="space-y-4">
              {/* Posts Section */}
              {posts.length > 0 && !isSearching && (
                <div className="space-y-4">
                  {posts.slice(0, 10).map((post) => (
                    <PostCard key={post.id} post={post} onPostUpdate={loadData} />
                  ))}
                </div>
              )}
              {/* Clips Section */}
              {visibleClips.length > 0 && (
                <div className="space-y-4">
                  {/* Up Next Preview */}
                  <div className="px-2">
                    <UpNextPreview />
                  </div>
                  
                  <div className="h-[calc(100vh-300px)] min-h-[600px]">
                    <VirtualizedFeed
                      clips={visibleClips}
                      captionsDefault={profile?.default_captions ?? true}
                      highlightQuery={normalizedQuery}
                      onReply={handleReply}
                      onRemix={handleRemix}
                      onContinueChain={handleContinueChain}
                      viewMode={viewMode}
                      onLoadMore={!isSearching && hasMoreClips ? loadMoreClips : undefined}
                      hasMore={!isSearching && hasMoreClips}
                      prefetchNext={3}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
          </div>

          {/* Right Sidebar - Hidden on mobile, visible on large screens */}
          <aside className="hidden lg:block lg:col-span-3">
            <CommunityRecommendationsSidebar />
          </aside>
        </div>
      </main>

      <div data-tutorial="record-button" className="fixed bottom-6 right-6 z-50 flex flex-col gap-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={() => setIsPostModalOpen(true)}
              size="lg"
              variant="outline"
              className="h-14 w-14 rounded-full shadow-lg"
            >
              <MessageCircle className="h-6 w-6" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">
            <p>Create a post (text, video, audio, or link)</p>
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
        chainId={continuingChainId}
        onOpenBulkUpload={() => setIsBulkUploadModalOpen(true)}
        replyingTo={replyingToClip}
        continuingChain={continuingChain}
      />

      <PostModal
        isOpen={isPostModalOpen}
        onClose={() => setIsPostModalOpen(false)}
        onSuccess={loadData}
        topicId={(selectedTopicId ?? todayTopic?.id) || null}
      />

      {remixingFromClipId && remixingFromClip && (
        <RemixModal
          isOpen={isRemixModalOpen}
          onClose={() => {
            setIsRemixModalOpen(false);
            setRemixingFromClipId(null);
            setRemixingFromClip(null);
          }}
          onSuccess={loadData}
          originalClipId={remixingFromClipId}
          originalClip={{
            id: remixingFromClip.id,
            audio_path: remixingFromClip.audio_path,
            title: remixingFromClip.title,
            summary: remixingFromClip.summary,
            profiles: remixingFromClip.profiles,
          }}
        />
      )}

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
