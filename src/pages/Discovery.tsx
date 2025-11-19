import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { 
  Sparkles, 
  Gem, 
  Clock, 
  Users, 
  UserPlus, 
  TrendingUp, 
  Calendar,
  Lightbulb,
  Hash,
  Search,
  Mic,
  RefreshCw
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProfile } from "@/hooks/useProfile";
import { useToast } from "@/hooks/use-toast";
import { logError } from "@/lib/logger";
import { ClipCard } from "@/components/ClipCard";
import { ClipListSkeleton } from "@/components/ui/clip-skeleton";

interface Clip {
  id: string;
  profile_id: string;
  audio_path: string;
  duration_seconds: number;
  title: string | null;
  captions: string | null;
  summary: string | null;
  tags: string[] | null;
  mood_emoji: string | null;
  status: string;
  listens_count: number;
  reactions: Record<string, number> | null;
  created_at: string;
  topic_id: string | null;
  completion_rate: number | null;
  trending_score: number | null;
  quality_score: number | null;
  profiles?: {
    handle: string;
    emoji_avatar: string;
  } | null;
}

interface RecommendationSection {
  title: string;
  icon: React.ReactNode;
  clips: Clip[];
  isLoading: boolean;
  reason?: string;
}

const Discovery = () => {
  const { profile } = useProfile();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("daily");
  const [sections, setSections] = useState<Record<string, RecommendationSection>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadDailyDiscovery = async () => {
    if (!profile?.id) return;

    setSections(prev => ({
      ...prev,
      daily: { ...prev.daily, isLoading: true }
    }));

    try {
      const { data, error } = await supabase.rpc("get_daily_discovery", {
        p_profile_id: profile.id,
        p_limit: 20
      });

      if (error) throw error;

      if (data && data.length > 0) {
        // Fetch full clip data
        const clipIds = data.map((item: any) => item.clip_id);
        const { data: clips, error: clipsError } = await supabase
          .from("clips")
          .select(`
            *,
            profiles (
              handle,
              emoji_avatar
            )
          `)
          .in("id", clipIds)
          .eq("status", "live");

        if (clipsError) throw clipsError;

        // Group by discovery type
        const grouped: Record<string, Clip[]> = {};
        data.forEach((item: any) => {
          const clip = clips?.find(c => c.id === item.clip_id);
          if (clip) {
            if (!grouped[item.discovery_type]) {
              grouped[item.discovery_type] = [];
            }
            grouped[item.discovery_type].push(clip as Clip);
          }
        });

        setSections(prev => ({
          ...prev,
          daily: {
            title: "Daily Discovery",
            icon: <Sparkles className="h-4 w-4" />,
            clips: clips || [],
            isLoading: false
          },
          hiddenGems: {
            title: "Hidden Gems",
            icon: <Gem className="h-4 w-4" />,
            clips: grouped.hidden_gem || [],
            isLoading: false,
            reason: "High quality clips with low visibility"
          },
          trendingNetwork: {
            title: "Trending in Your Network",
            icon: <Users className="h-4 w-4" />,
            clips: grouped.trending_network || [],
            isLoading: false,
            reason: "What people in your network are listening to"
          },
          throwback: {
            title: "Throwback",
            icon: <Clock className="h-4 w-4" />,
            clips: grouped.throwback || [],
            isLoading: false,
            reason: "Great clips from the past"
          },
          similar: {
            title: "Similar to What You Like",
            icon: <TrendingUp className="h-4 w-4" />,
            clips: grouped.similar || [],
            isLoading: false,
            reason: "Similar to clips you enjoyed"
          }
        }));
      }
    } catch (error) {
      logError("Error loading daily discovery", error);
      setSections(prev => ({
        ...prev,
        daily: { ...prev.daily, isLoading: false }
      }));
    }
  };

  const loadWeeklyDigest = async () => {
    if (!profile?.id) return;

    setSections(prev => ({
      ...prev,
      weekly: { ...prev.weekly, isLoading: true }
    }));

    try {
      const { data, error } = await supabase.rpc("get_weekly_digest", {
        p_profile_id: profile.id,
        p_limit: 20
      });

      if (error) throw error;

      if (data && data.length > 0) {
        const clipIds = data.map((item: any) => item.clip_id);
        const { data: clips, error: clipsError } = await supabase
          .from("clips")
          .select(`
            *,
            profiles (
              handle,
              emoji_avatar
            )
          `)
          .in("id", clipIds)
          .eq("status", "live");

        if (clipsError) throw clipsError;

        setSections(prev => ({
          ...prev,
          weekly: {
            title: "Weekly Digest",
            icon: <Calendar className="h-4 w-4" />,
            clips: clips || [],
            isLoading: false,
            reason: "Best clips of the week"
          }
        }));
      }
    } catch (error) {
      logError("Error loading weekly digest", error);
      setSections(prev => ({
        ...prev,
        weekly: { ...prev.weekly, isLoading: false }
      }));
    }
  };

  const loadNewVoices = async () => {
    if (!profile?.id) return;

    setSections(prev => ({
      ...prev,
      newVoices: { ...prev.newVoices, isLoading: true }
    }));

    try {
      const { data, error } = await supabase.rpc("get_new_voices_to_discover", {
        p_profile_id: profile.id,
        p_limit: 10
      });

      if (error) throw error;

      if (data && data.length > 0) {
        const profileIds = data.map((item: any) => item.profile_id);
        // Get clips from these creators
        const { data: clips, error: clipsError } = await supabase
          .from("clips")
          .select(`
            *,
            profiles (
              handle,
              emoji_avatar
            )
          `)
          .in("profile_id", profileIds)
          .eq("status", "live")
          .order("created_at", { ascending: false })
          .limit(20);

        if (clipsError) throw clipsError;

        setSections(prev => ({
          ...prev,
          newVoices: {
            title: "New Voices to Discover",
            icon: <UserPlus className="h-4 w-4" />,
            clips: clips || [],
            isLoading: false,
            reason: "Fresh creators to follow"
          }
        }));
      }
    } catch (error) {
      logError("Error loading new voices", error);
      setSections(prev => ({
        ...prev,
        newVoices: { ...prev.newVoices, isLoading: false }
      }));
    }
  };

  const loadTopicSuggestions = async () => {
    if (!profile?.id) return;

    setSections(prev => ({
      ...prev,
      topics: { ...prev.topics, isLoading: true }
    }));

    try {
      const { data, error } = await supabase.rpc("get_topic_suggestions", {
        p_profile_id: profile.id,
        p_limit: 10
      });

      if (error) throw error;

      // Store topic suggestions (we'll display them differently)
      setSections(prev => ({
        ...prev,
        topics: {
          title: "Topic Suggestions",
          icon: <Hash className="h-4 w-4" />,
          clips: [],
          isLoading: false,
          reason: "Topics you might like"
        }
      }));
    } catch (error) {
      logError("Error loading topic suggestions", error);
      setSections(prev => ({
        ...prev,
        topics: { ...prev.topics, isLoading: false }
      }));
    }
  };

  const loadCreatorSuggestions = async () => {
    if (!profile?.id) return;

    setSections(prev => ({
      ...prev,
      creators: { ...prev.creators, isLoading: true }
    }));

    try {
      const { data, error } = await supabase.rpc("get_creator_suggestions", {
        p_profile_id: profile.id,
        p_limit: 10
      });

      if (error) throw error;

      if (data && data.length > 0) {
        const profileIds = data.map((item: any) => item.profile_id);
        const { data: clips, error: clipsError } = await supabase
          .from("clips")
          .select(`
            *,
            profiles (
              handle,
              emoji_avatar
            )
          `)
          .in("profile_id", profileIds)
          .eq("status", "live")
          .order("created_at", { ascending: false })
          .limit(20);

        if (clipsError) throw clipsError;

        setSections(prev => ({
          ...prev,
          creators: {
            title: "Creator Suggestions",
            icon: <UserPlus className="h-4 w-4" />,
            clips: clips || [],
            isLoading: false,
            reason: "Similar creators to follow"
          }
        }));
      }
    } catch (error) {
      logError("Error loading creator suggestions", error);
      setSections(prev => ({
        ...prev,
        creators: { ...prev.creators, isLoading: false }
      }));
    }
  };

  const loadCommunitySuggestions = async () => {
    if (!profile?.id) return;

    setSections(prev => ({
      ...prev,
      communities: { ...prev.communities, isLoading: true }
    }));

    try {
      const { data, error } = await supabase.rpc("get_community_suggestions", {
        p_profile_id: profile.id,
        p_limit: 10
      });

      if (error) throw error;

      // Store community suggestions (we'll display them differently)
      setSections(prev => ({
        ...prev,
        communities: {
          title: "Community Suggestions",
          icon: <Users className="h-4 w-4" />,
          clips: [],
          isLoading: false,
          reason: "Communities you might like"
        }
      }));
    } catch (error) {
      logError("Error loading community suggestions", error);
      setSections(prev => ({
        ...prev,
        communities: { ...prev.communities, isLoading: false }
      }));
    }
  };

  const refreshAll = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        loadDailyDiscovery(),
        loadWeeklyDigest(),
        loadNewVoices(),
        loadTopicSuggestions(),
        loadCreatorSuggestions(),
        loadCommunitySuggestions()
      ]);
      toast({
        title: "Discovery refreshed",
        description: "Your discovery feed has been updated"
      });
    } catch (error) {
      logError("Error refreshing discovery", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (!profile?.id) return;

    if (activeTab === "daily") {
      loadDailyDiscovery();
    } else if (activeTab === "weekly") {
      loadWeeklyDigest();
    } else if (activeTab === "new-voices") {
      loadNewVoices();
    } else if (activeTab === "creators") {
      loadCreatorSuggestions();
    }
  }, [profile?.id, activeTab]);

  const renderSection = (section: RecommendationSection | undefined, key: string) => {
    if (!section) return null;

    return (
      <div key={key} className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {section.icon}
            <h2 className="text-lg font-semibold">{section.title}</h2>
            {section.reason && (
              <Badge variant="secondary" className="text-xs">
                {section.reason}
              </Badge>
            )}
          </div>
        </div>
        {section.isLoading ? (
          <ClipListSkeleton count={3} />
        ) : section.clips.length > 0 ? (
          <div className="space-y-4">
            {section.clips.map((clip) => (
              <ClipCard key={clip.id} clip={clip} />
            ))}
          </div>
        ) : (
          <Card className="p-8 text-center text-muted-foreground">
            <p>No recommendations available at this time.</p>
          </Card>
        )}
      </div>
    );
  };

  if (!profile) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <Skeleton className="h-12 w-64 mb-8" />
          <ClipListSkeleton count={5} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Discovery</h1>
            <p className="text-muted-foreground">
              Personalized recommendations to help you discover new content
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={refreshAll}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="daily">Daily</TabsTrigger>
            <TabsTrigger value="weekly">Weekly</TabsTrigger>
            <TabsTrigger value="new-voices">New Voices</TabsTrigger>
            <TabsTrigger value="creators">Creators</TabsTrigger>
          </TabsList>

          <TabsContent value="daily" className="space-y-8 mt-6">
            {renderSection(sections.daily, "daily")}
            {renderSection(sections.hiddenGems, "hiddenGems")}
            {renderSection(sections.trendingNetwork, "trendingNetwork")}
            {renderSection(sections.throwback, "throwback")}
            {renderSection(sections.similar, "similar")}
          </TabsContent>

          <TabsContent value="weekly" className="space-y-8 mt-6">
            {renderSection(sections.weekly, "weekly")}
          </TabsContent>

          <TabsContent value="new-voices" className="space-y-8 mt-6">
            {renderSection(sections.newVoices, "newVoices")}
          </TabsContent>

          <TabsContent value="creators" className="space-y-8 mt-6">
            {renderSection(sections.creators, "creators")}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Discovery;

