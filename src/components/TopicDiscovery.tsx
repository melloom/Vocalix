import { useState, useEffect, useMemo } from "react";
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
  tags?: string[] | null;
  similarity_score?: number;
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
  // Falls back to trending topics if no personalized data available
  const { data: recommended, isLoading: isLoadingRecommended } = useQuery({
    queryKey: ["topicRecommendations", profileId, currentTopicId],
    queryFn: async () => {
      try {
        // If no profile, show trending topics as recommendations
        if (!profileId) {
          let query = supabase
            .from("topics")
            .select(`
              *,
              communities (
                id,
                name,
                slug,
                avatar_emoji
              ),
              profiles:user_created_by (
                id,
                handle,
                emoji_avatar
              )
            `)
            .eq("is_active", true);
          
          if (currentTopicId) {
            query = query.neq("id", currentTopicId);
          }
          
          const { data: trending, error: trendingError } = await query
            .order("trending_score", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(5);

          if (trendingError) {
            console.error("Error fetching trending for recommendations:", trendingError);
            return [];
          }

          return (trending || []) as Topic[];
        }

        // Get topics the user has engaged with (clips they've listened to or reacted to)
        const { data: userClips, error: clipsError } = await supabase
          .from("clips")
          .select("topic_id")
          .eq("profile_id", profileId)
          .not("topic_id", "is", null)
          .limit(50);

        if (clipsError) {
          console.error("Error fetching user clips:", clipsError);
        }

        if (!userClips || userClips.length === 0) {
          // No engagement history, return trending topics (excluding current topic)
          let query = supabase
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
            .eq("is_active", true);
          
          if (currentTopicId) {
            query = query.neq("id", currentTopicId);
          }
          
          const { data: trending, error: trendingError } = await query
            .order("trending_score", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(5);

          if (trendingError) {
            console.error("Error fetching trending topics:", trendingError);
            return [];
          }

          return (trending || []) as Topic[];
        }

        // Get unique topic IDs the user has engaged with
        const userTopicIds = [...new Set(userClips.map((c) => c.topic_id).filter(Boolean))];

        if (userTopicIds.length === 0) {
          // No topics found, return trending (excluding current topic)
          let query = supabase
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
            .eq("is_active", true);
          
          if (currentTopicId) {
            query = query.neq("id", currentTopicId);
          }
          
          const { data: trending, error: trendingError } = await query
            .order("trending_score", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(5);

          if (trendingError) {
            console.error("Error fetching trending topics:", trendingError);
            return [];
          }

          return (trending || []) as Topic[];
        }

        // Find similar topics (topics with similar engagement patterns)
        // Get topics that are trending and not in the user's history
        let query = supabase
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
          .eq("is_active", true);
        
        if (currentTopicId) {
          query = query.neq("id", currentTopicId);
        }
        
        const { data: allTopics, error: topicsError } = await query
          .order("trending_score", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(20); // Get more to filter out user's topics

        if (topicsError) {
          console.error("Error fetching topics for recommendations:", topicsError);
          return [];
        }

        // Filter out topics user has already engaged with
        let filtered = (allTopics || []).filter(
          (topic) => !userTopicIds.includes(topic.id)
        );

        // If we don't have enough filtered topics, fill with trending topics
        if (filtered.length < 5) {
          let fillQuery = supabase
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
            .eq("is_active", true);
          
          if (currentTopicId) {
            fillQuery = fillQuery.neq("id", currentTopicId);
          }
          
          if (userTopicIds.length > 0) {
            fillQuery = fillQuery.not("id", "in", `(${userTopicIds.join(",")})`);
          }
          
          const { data: trending, error: trendingError } = await fillQuery
            .order("trending_score", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(5 - filtered.length);

          if (!trendingError && trending) {
            // Add trending topics that aren't already in filtered and aren't in user's history
            const trendingToAdd = (trending as Topic[]).filter(
              (topic) => !filtered.some(t => t.id === topic.id) && !userTopicIds.includes(topic.id)
            );
            filtered.push(...trendingToAdd);
          }
        }

        // Return up to 5 recommendations
        return filtered.slice(0, 5) as Topic[];
      } catch (error) {
        console.error("Error in topic recommendations query:", error);
        return [];
      }
    },
    enabled: showRecommendations, // Always enabled - shows trending if no profile
  });

  // Get similar topics to the current one using the similarity algorithm
  // Limit to 4 items when on a topic page
  const { data: similar, isLoading: isLoadingSimilar } = useQuery({
    queryKey: ["similarTopics", currentTopicId],
    queryFn: async () => {
      try {
        if (!currentTopicId) return [];

        const similarLimit = 4; // Always 4 on topic pages
        
        // Use the database function to get similar topics with similarity scoring
        const { data: similarData, error } = await supabase.rpc("get_similar_topics", {
          p_topic_id: currentTopicId,
          p_limit: similarLimit,
        });

        if (!error && similarData && similarData.length > 0) {
          // Transform the RPC result to match Topic interface
          return similarData.map((item: any) => ({
            id: item.id,
            title: item.title,
            description: item.description,
            date: item.date,
            is_active: item.is_active,
            clips_count: item.clips_count,
            trending_score: item.trending_score,
            community_id: item.community_id,
            user_created_by: item.user_created_by,
            created_at: item.created_at,
            communities: item.communities ? {
              id: item.communities.id,
              name: item.communities.name,
              slug: item.communities.slug,
              avatar_emoji: item.communities.avatar_emoji,
            } : null,
            profiles: item.profiles ? {
              id: item.profiles.id,
              handle: item.profiles.handle,
              emoji_avatar: item.profiles.emoji_avatar,
            } : null,
          })) as Topic[];
        }

        // Fallback to basic query if RPC fails or returns empty
        const { data: fallback, error: fallbackError } = await supabase
          .from("topics")
          .select(`
            *,
            communities (
              id,
              name,
              slug,
              avatar_emoji
            ),
            profiles:user_created_by (
              id,
              handle,
              emoji_avatar
            )
          `)
          .eq("is_active", true)
          .neq("id", currentTopicId)
          .order("trending_score", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(4); // Always 4 on topic pages

        if (fallbackError) {
          console.error("Error in fallback similar topics query:", fallbackError);
          return [];
        }

        return (fallback || []) as Topic[];
      } catch (error) {
        console.error("Error in similar topics query:", error);
        return [];
      }
    },
    enabled: !!currentTopicId && showSimilar,
  });

  // Get trending topics
  // Limit to 4 items when on a topic page, 10 otherwise
  const today = new Date().toISOString().slice(0, 10);
  const { data: trending, isLoading: isLoadingTrending } = useQuery({
    queryKey: ["trendingTopicsDiscovery", today, currentTopicId],
    queryFn: async () => {
      try {
        const trendingLimit = currentTopicId ? 4 : 10;
        
        // Try RPC function first
        const { data: rpcData, error: rpcError } = await supabase.rpc("get_trending_topics", {
          p_limit: trendingLimit,
        });

        if (!rpcError && rpcData && rpcData.length > 0) {
          // Transform RPC data to match Topic interface
          return rpcData.map((item: any) => ({
            id: item.id,
            title: item.title,
            description: item.description,
            date: item.date,
            is_active: item.is_active,
            clips_count: item.clips_count,
            trending_score: item.trending_score,
            community_id: item.community_id,
            user_created_by: item.user_created_by,
            created_at: item.created_at,
            communities: item.communities,
            profiles: item.profiles,
          })) as Topic[];
        }

        // Fallback to direct query - try with trending_score > 0 first
        let query = supabase
          .from("topics")
          .select(`
            *,
            communities (
              id,
              name,
              slug,
              avatar_emoji
            ),
            profiles:user_created_by (
              id,
              handle,
              emoji_avatar
            )
          `)
          .eq("is_active", true);
        
        if (currentTopicId) {
          query = query.neq("id", currentTopicId);
        }
        
        const { data, error } = await query
          .order("trending_score", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(currentTopicId ? 4 : 10);

        if (error) {
          console.error("Error fetching trending topics:", error);
          // Last resort: get any active topics (excluding current)
          let fallbackQuery = supabase
            .from("topics")
            .select(`
              *,
              communities (
                id,
                name,
                slug,
                avatar_emoji
              ),
              profiles:user_created_by (
                id,
                handle,
                emoji_avatar
              )
            `)
            .eq("is_active", true);
          
          if (currentTopicId) {
            fallbackQuery = fallbackQuery.neq("id", currentTopicId);
          }
          
          const { data: fallbackData, error: fallbackError } = await fallbackQuery
            .order("created_at", { ascending: false })
            .limit(currentTopicId ? 4 : 10);

          if (fallbackError) {
            console.error("Error in fallback query:", fallbackError);
            return [];
          }

          return (fallbackData || []) as Topic[];
        }

        return (data || []) as Topic[];
      } catch (error) {
        console.error("Error in trending topics query:", error);
        return [];
      }
    },
    enabled: showTrending,
    staleTime: 2 * 60 * 1000, // 2 minutes - refresh more frequently for trending topics
    refetchInterval: 10 * 60 * 1000, // Refetch every 10 minutes to get fresh trending topics
    refetchOnWindowFocus: true, // Refetch when user returns to the tab
  });

  useEffect(() => {
    if (recommended) setRecommendedTopics(recommended);
  }, [recommended]);

  useEffect(() => {
    if (similar) setSimilarTopics(similar);
  }, [similar]);

  // Deduplicate topics across sections to avoid showing the same topic multiple times
  // Priority: Recommended > Similar > Trending (so recommended topics don't get filtered out)
  const filteredRecommended = useMemo(() => {
    if (!recommendedTopics || recommendedTopics.length === 0) return [];
    
    // Get IDs of topics already shown in other sections
    const excludedIds = new Set<string>();
    if (currentTopicId) excludedIds.add(currentTopicId);
    // Don't exclude similar/trending from recommended - recommended has priority
    
    // Filter out current topic only
    return recommendedTopics.filter(topic => !excludedIds.has(topic.id)).slice(0, 5);
  }, [recommendedTopics, currentTopicId]);

  const filteredSimilar = useMemo(() => {
    if (!similarTopics || similarTopics.length === 0) return [];
    
    // Get IDs of topics already shown in other sections
    const excludedIds = new Set<string>();
    if (currentTopicId) excludedIds.add(currentTopicId);
    filteredRecommended.forEach(t => excludedIds.add(t.id));
    if (trending) trending.forEach(t => excludedIds.add(t.id));
    
    // Filter out duplicates and current topic, limit to 4 on topic pages
    const limit = currentTopicId ? 4 : 5;
    return similarTopics.filter(topic => !excludedIds.has(topic.id)).slice(0, limit);
  }, [similarTopics, filteredRecommended, trending, currentTopicId]);

  const filteredTrending = useMemo(() => {
    if (!trending || trending.length === 0) return [];
    
    // Get IDs of topics already shown in other sections
    const excludedIds = new Set<string>();
    if (currentTopicId) excludedIds.add(currentTopicId);
    filteredRecommended.forEach(t => excludedIds.add(t.id));
    filteredSimilar.forEach(t => excludedIds.add(t.id));
    
    // Filter out duplicates and current topic, limit to 4 on topic pages
    const limit = currentTopicId ? 4 : 10;
    return trending.filter(topic => !excludedIds.has(topic.id)).slice(0, limit);
  }, [trending, filteredRecommended, filteredSimilar, currentTopicId]);

  return (
    <div className={cn("space-y-6", className)}>
      {/* Recommended Topics - Shows personalized recommendations or trending topics */}
      {showRecommendations && (
        <Card className="p-4 border border-black/20 dark:border-border/30 hover:border-primary/50 dark:hover:border-primary/30 transition-colors">
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
          ) : filteredRecommended.length > 0 ? (
            <div className="space-y-2">
              {filteredRecommended.map((topic) => (
                <Link
                  key={topic.id}
                  to={`/topic/${topic.id}`}
                  className="block p-3 rounded-lg border border-black/20 dark:border-border/30 hover:border-primary/50 dark:hover:border-primary/30 hover:bg-primary/5 dark:hover:bg-muted/50 transition-all cursor-pointer"
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
        <Card className="p-4 border border-black/20 dark:border-border/30 hover:border-primary/50 dark:hover:border-primary/30 transition-colors">
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
          ) : filteredSimilar.length > 0 ? (
            <div className="space-y-2">
              {filteredSimilar.map((topic) => (
                <Link
                  key={topic.id}
                  to={`/topic/${topic.id}`}
                  className="block p-3 rounded-lg border border-black/20 dark:border-border/30 hover:border-primary/50 dark:hover:border-primary/30 hover:bg-primary/5 dark:hover:bg-muted/50 transition-all cursor-pointer"
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

      {/* Trending Topics - Reddit Style */}
      {showTrending && (
        <Card className="p-4 border border-black/20 dark:border-border/30 hover:border-primary/50 dark:hover:border-primary/30 transition-colors">
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
          ) : filteredTrending.length > 0 ? (
            <div className="space-y-1">
              {filteredTrending.map((topic, index) => (
                <Link
                  key={topic.id}
                  to={`/topic/${topic.id}`}
                  className="block"
                >
                  <div className="flex gap-3 p-2 rounded border border-black/10 dark:border-transparent hover:border-primary/40 dark:hover:border-border/30 hover:bg-primary/5 dark:hover:bg-muted/50 transition-all cursor-pointer">
                    {/* Left Side - Icon Area */}
                    <div className="flex flex-col items-center gap-1 pt-1">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                        {topic.communities ? (
                          <span className="text-lg">{topic.communities.avatar_emoji}</span>
                        ) : topic.profiles ? (
                          <span className="text-lg">{topic.profiles.emoji_avatar}</span>
                        ) : (
                          <TrendingUp className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>

                    {/* Main Content */}
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-sm mb-1 hover:text-primary transition-colors line-clamp-1">
                        {topic.title}
                      </h4>
                      {topic.description && (
                        <p className="text-xs text-muted-foreground mb-1.5 line-clamp-1">
                          {topic.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                        {topic.communities && (
                          <span className="flex items-center gap-1">
                            <span>{topic.communities.avatar_emoji}</span>
                            <span className="font-medium hover:text-foreground">r/{topic.communities.name}</span>
                          </span>
                        )}
                        {topic.profiles && (
                          <span className="flex items-center gap-1">
                            <span>u/{topic.profiles.handle}</span>
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          <span>{topic.clips_count || 0} {topic.clips_count === 1 ? 'clip' : 'clips'}</span>
                        </span>
                        {topic.trending_score !== undefined && topic.trending_score > 0 && (
                          <Badge variant="secondary" className="h-4 px-1.5 text-xs">
                            🔥 {Math.round(topic.trending_score)}
                          </Badge>
                        )}
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

