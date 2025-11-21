import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Sparkles, Users, Clock, ArrowRight, Hash } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface Topic {
  id: string;
  title: string;
  description: string | null;
  date: string;
  is_active: boolean;
  clips_count?: number;
  trending_score?: number;
  community_id?: string | null;
  user_created_by?: string | null;
  created_at: string;
  communities?: {
    id: string;
    name: string;
    slug: string;
    avatar_emoji: string;
  } | null;
  profiles?: {
    id: string;
    handle: string;
    emoji_avatar: string;
  } | null;
}

interface TopicDiscoveryProps {
  profileId?: string | null;
  currentTopicId?: string | null;
  className?: string;
  showRecommendations?: boolean;
  showSimilar?: boolean;
  showTrending?: boolean;
}

export const TopicDiscovery = ({
  profileId,
  currentTopicId,
  className,
  showRecommendations = true,
  showSimilar = true,
  showTrending = true,
}: TopicDiscoveryProps) => {
  const [recommendedTopics, setRecommendedTopics] = useState<Topic[]>([]);
  const [similarTopics, setSimilarTopics] = useState<Topic[]>([]);

  // Get recommended topics based on user interests (topics they've engaged with)
  const { data: recommended, isLoading: isLoadingRecommended } = useQuery({
    queryKey: ["topicRecommendations", profileId],
    queryFn: async () => {
      if (!profileId) return [];

      // Get topics the user has engaged with (clips they've listened to or reacted to)
      const { data: userClips } = await supabase
        .from("clips")
        .select("topic_id")
        .eq("profile_id", profileId)
        .not("topic_id", "is", null)
        .limit(50);

      if (!userClips || userClips.length === 0) {
        // No engagement history, return trending topics
        const { data: trending } = await supabase
          .from("topics")
          .select(`
            *,
            communities (
              id,
              name,
              slug,
              avatar_emoji
            )
          `)
          .eq("is_active", true)
          .gt("trending_score", 0)
          .order("trending_score", { ascending: false })
          .limit(5);

        return (trending || []) as Topic[];
      }

      // Get unique topic IDs the user has engaged with
      const userTopicIds = [...new Set(userClips.map((c) => c.topic_id).filter(Boolean))];

      if (userTopicIds.length === 0) {
        // No topics found, return trending
        const { data: trending } = await supabase
          .from("topics")
          .select(`
            *,
            communities (
              id,
              name,
              slug,
              avatar_emoji
            )
          `)
          .eq("is_active", true)
          .gt("trending_score", 0)
          .order("trending_score", { ascending: false })
          .limit(5);

        return (trending || []) as Topic[];
      }

      // Find similar topics (topics with similar engagement patterns)
      // Get topics that are trending and not in the user's history
      const { data: allTopics } = await supabase
        .from("topics")
        .select(`
          *,
          communities (
            id,
            name,
            slug,
            avatar_emoji
          )
        `)
        .eq("is_active", true)
        .gt("trending_score", 0)
        .order("trending_score", { ascending: false })
        .limit(20); // Get more to filter out user's topics

      // Filter out topics user has already engaged with
      const filtered = (allTopics || []).filter(
        (topic) => !userTopicIds.includes(topic.id)
      ).slice(0, 5);

      return filtered as Topic[];
    },
    enabled: !!profileId && showRecommendations,
  });

  // Get similar topics to the current one
  const { data: similar, isLoading: isLoadingSimilar } = useQuery({
    queryKey: ["similarTopics", currentTopicId],
    queryFn: async () => {
      if (!currentTopicId) return [];

      // Get the current topic
      const { data: currentTopic } = await supabase
        .from("topics")
        .select("*")
        .eq("id", currentTopicId)
        .single();

      if (!currentTopic) return [];

      // Find similar topics based on:
      // 1. Similar trending scores
      // 2. Similar clip counts
      // 3. Recent topics
      const { data: similar } = await supabase
        .from("topics")
        .select(`
          *,
          communities (
            id,
            name,
            slug,
            avatar_emoji
          )
        `)
        .eq("is_active", true)
        .neq("id", currentTopicId)
        .order("trending_score", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(5);

      return (similar || []) as Topic[];
    },
    enabled: !!currentTopicId && showSimilar,
  });

  // Get trending topics
  const { data: trending, isLoading: isLoadingTrending } = useQuery({
    queryKey: ["trendingTopicsDiscovery"],
    queryFn: async () => {
      // Try RPC function first
      const { data: rpcData, error: rpcError } = await supabase.rpc("get_trending_topics", {
        p_limit: 10,
      });

      if (!rpcError && rpcData && rpcData.length > 0) {
        return rpcData as Topic[];
      }

      // Fallback to direct query
      const { data, error } = await supabase
        .from("topics")
        .select(`
          *,
          communities (
            id,
            name,
            slug,
            avatar_emoji
          )
        `)
        .eq("is_active", true)
        .gt("trending_score", 0)
        .order("trending_score", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      return (data || []) as Topic[];
    },
    enabled: showTrending,
  });

  useEffect(() => {
    if (recommended) setRecommendedTopics(recommended);
  }, [recommended]);

  useEffect(() => {
    if (similar) setSimilarTopics(similar);
  }, [similar]);

  return (
    <div className={cn("space-y-6", className)}>
      {/* Recommended Topics */}
      {showRecommendations && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">Recommended for You</h3>
          </div>
          {isLoadingRecommended ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : recommendedTopics.length > 0 ? (
            <div className="space-y-2">
              {recommendedTopics.map((topic) => (
                <Link
                  key={topic.id}
                  to={`/topic/${topic.id}`}
                  className="block p-3 rounded-lg hover:bg-muted transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm truncate">{topic.title}</h4>
                      {topic.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                          {topic.description}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        {topic.clips_count !== undefined && (
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {topic.clips_count}
                          </span>
                        )}
                        {topic.trending_score !== undefined && topic.trending_score > 0 && (
                          <span className="flex items-center gap-1">
                            <TrendingUp className="h-3 w-3" />
                            {Math.round(topic.trending_score)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No recommendations yet. Start exploring topics!</p>
          )}
        </Card>
      )}

      {/* Similar Topics */}
      {showSimilar && currentTopicId && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <Hash className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">Similar Topics</h3>
          </div>
          {isLoadingSimilar ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : similarTopics.length > 0 ? (
            <div className="space-y-2">
              {similarTopics.map((topic) => (
                <Link
                  key={topic.id}
                  to={`/topic/${topic.id}`}
                  className="block p-3 rounded-lg hover:bg-muted transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm truncate">{topic.title}</h4>
                      {topic.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                          {topic.description}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        {topic.clips_count !== undefined && (
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {topic.clips_count}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(topic.created_at), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No similar topics found.</p>
          )}
        </Card>
      )}

      {/* Trending Topics */}
      {showTrending && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm">Trending Topics</h3>
            </div>
            <Link to="/topics">
              <Button variant="ghost" size="sm" className="h-7 text-xs">
                View All
                <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </div>
          {isLoadingTrending ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : trending && trending.length > 0 ? (
            <div className="space-y-2">
              {trending.map((topic, index) => (
                <Link
                  key={topic.id}
                  to={`/topic/${topic.id}`}
                  className="block p-3 rounded-lg hover:bg-muted transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="h-5 w-5 flex items-center justify-center text-xs font-bold">
                        {index + 1}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-sm truncate">{topic.title}</h4>
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          {topic.clips_count !== undefined && (
                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {topic.clips_count}
                            </span>
                          )}
                          {topic.trending_score !== undefined && topic.trending_score > 0 && (
                            <span className="flex items-center gap-1 text-primary">
                              <TrendingUp className="h-3 w-3" />
                              {Math.round(topic.trending_score)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No trending topics at the moment.</p>
          )}
        </Card>
      )}
    </div>
  );
};

