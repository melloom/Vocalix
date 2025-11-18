import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Music, Heart, Eye, Users, TrendingUp, Clock, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useProfile } from "@/hooks/useProfile";
import { useCollectionFollow } from "@/hooks/useCollectionFollow";
import { useToast } from "@/hooks/use-toast";
import { logError } from "@/lib/logger";
import { useQueryClient } from "@tanstack/react-query";

interface Collection {
  id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  share_token: string | null;
  is_auto_generated: boolean;
  profile_id: string;
  follower_count?: number;
  view_count?: number;
  clip_count?: number;
  category?: string;
  trending_score?: number;
  recommendation_reason?: string;
  created_at: string;
  updated_at: string;
  profiles?: {
    handle: string;
    emoji_avatar: string;
  };
}

type SortOption = "trending" | "newest" | "popular" | "most_followed" | "recommended";

const CollectionsDiscovery = () => {
  const { profile } = useProfile();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("trending");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    const loadCollections = async () => {
      setIsLoading(true);
      setError(null);

      try {
        let data: any[] = [];

        if (sortBy === "trending") {
          // Use trending function for better algorithm
          const { data: trendingData, error: trendingError } = await supabase.rpc(
            "get_trending_collections",
            {
              p_category: null,
              p_limit: 50,
            }
          );

          if (trendingError) {
            logError("Error loading trending collections", trendingError);
            // Fallback to regular query
            const { data: fallbackData, error: fallbackError } = await supabase
              .from("playlists")
              .select(
                `
                *,
                profiles (
                  handle,
                  emoji_avatar
                ),
                playlist_clips(count)
              `,
              )
              .eq("is_public", true)
              .eq("is_auto_generated", false)
              .order("trending_score", { ascending: false })
              .limit(50);

            if (!fallbackError && fallbackData) {
              data = fallbackData;
            }
          } else if (trendingData) {
            // Transform trending data to match collection format
            data = await Promise.all(
              trendingData.map(async (item: any) => {
                const { data: playlistData } = await supabase
                  .from("playlists")
                  .select(
                    `
                    *,
                    profiles (
                      handle,
                      emoji_avatar
                    ),
                    playlist_clips(count)
                  `,
                  )
                  .eq("id", item.playlist_id)
                  .single();

                return {
                  ...(playlistData || {}),
                  follower_count: item.follower_count,
                  clip_count: item.clip_count,
                  view_count: item.view_count,
                  trending_score: item.trending_score,
                };
              })
            );
          }
        } else if (sortBy === "recommended" && profile?.id) {
          // Use recommended function for personalized recommendations
          const { data: recommendedData, error: recommendedError } = await supabase.rpc(
            "get_recommended_collections",
            {
              p_profile_id: profile.id,
              p_limit: 50,
            }
          );

          if (recommendedError) {
            logError("Error loading recommended collections", recommendedError);
            data = [];
          } else if (recommendedData) {
            // Transform recommended data to match collection format
            data = await Promise.all(
              recommendedData.map(async (item: any) => {
                const { data: playlistData } = await supabase
                  .from("playlists")
                  .select(
                    `
                    *,
                    profiles (
                      handle,
                      emoji_avatar
                    ),
                    playlist_clips(count)
                  `,
                  )
                  .eq("id", item.playlist_id)
                  .single();

                return {
                  ...(playlistData || {}),
                  category: item.category,
                  trending_score: item.trending_score,
                  recommendation_reason: item.recommendation_reason,
                };
              })
            );
          }
        } else {
          // Use regular query for other sort options
          let query = supabase
            .from("playlists")
            .select(
              `
              *,
              profiles (
                handle,
                emoji_avatar
              ),
              playlist_clips(count)
            `,
            )
            .eq("is_public", true)
            .eq("is_auto_generated", false);

          // Apply search filter
          if (searchQuery.trim()) {
            query = query.or(
              `name.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`,
            );
          }

          // Apply sorting
          switch (sortBy) {
            case "newest":
              query = query.order("created_at", { ascending: false });
              break;
            case "popular":
              query = query.order("view_count", { ascending: false });
              break;
            case "most_followed":
              // Get follower counts for sorting
              const { data: followerData } = await supabase
                .from("collection_follows")
                .select("playlist_id");

              const followerCounts: Record<string, number> = {};
              if (followerData) {
                followerData.forEach((follow: any) => {
                  followerCounts[follow.playlist_id] = (followerCounts[follow.playlist_id] || 0) + 1;
                });
              }

              const { data: allPlaylists } = await query.order("created_at", { ascending: false });
              if (allPlaylists) {
                data = allPlaylists.sort((a, b) => {
                  const aCount = followerCounts[a.id] || 0;
                  const bCount = followerCounts[b.id] || 0;
                  return bCount - aCount;
                });
              }
              break;
            default:
              query = query.order("updated_at", { ascending: false });
              break;
          }

          if (sortBy !== "most_followed") {
            const { data: queryData, error: queryError } = await query.limit(50);
            if (queryError) {
              throw queryError;
            }
            data = queryData || [];
          }
        }

        const collectionsWithCounts = data.map((collection: any) => ({
          ...collection,
          clip_count: Array.isArray(collection.playlist_clips)
            ? collection.playlist_clips[0]?.count || collection.clip_count || 0
            : collection.clip_count || 0,
        }));

        setCollections(collectionsWithCounts);
      } catch (err) {
        setError("Couldn't load collections");
        logError("Error loading collections", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadCollections();
  }, [searchQuery, sortBy]);

  const handleFollow = async (collectionId: string, isFollowing: boolean) => {
    if (!profile?.id) {
      toast({
        title: "Sign in required",
        description: "Please sign in to follow collections",
        variant: "destructive",
      });
      return;
    }

    try {
      if (isFollowing) {
        const { error } = await supabase
          .from("collection_follows")
          .delete()
          .eq("profile_id", profile.id)
          .eq("playlist_id", collectionId);

        if (error) throw error;

        toast({
          title: "Unfollowed",
          description: "Collection unfollowed",
        });
      } else {
        const { error } = await supabase
          .from("collection_follows")
          .insert({
            profile_id: profile.id,
            playlist_id: collectionId,
          });

        if (error) throw error;

      toast({
        title: "Following",
        description: "You're now following this collection",
      });
      }

      // Invalidate queries to refresh stats
      queryClient.invalidateQueries({ queryKey: ['playlist', collectionId] });
      queryClient.invalidateQueries({ queryKey: ['followed-collections', profile.id] });

      // Reload collections to update follow counts
      const { data } = await supabase
        .from("playlists")
        .select(
          `
          *,
          profiles (
            handle,
            emoji_avatar
          ),
          playlist_clips(count)
        `,
        )
        .eq("is_public", true)
        .eq("is_auto_generated", false)
        .order("updated_at", { ascending: false })
        .limit(50);

      if (data) {
        const collectionsWithCounts = data.map((collection: any) => ({
          ...collection,
          clip_count: Array.isArray(collection.playlist_clips)
            ? collection.playlist_clips[0]?.count || 0
            : 0,
        }));
        setCollections(collectionsWithCounts);
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to update follow status",
        variant: "destructive",
      });
      logError("Error updating follow", err);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold mb-4">Discover Collections</h1>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search collections..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 rounded-2xl"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-3 overflow-x-auto pb-2">
            {profile?.id && (
              <Button
                variant={sortBy === "recommended" ? "default" : "outline"}
                size="sm"
                onClick={() => setSortBy("recommended")}
                className="rounded-2xl whitespace-nowrap"
              >
                <Sparkles className="h-3 w-3 mr-1" />
                Recommended
              </Button>
            )}
            <Button
              variant={sortBy === "trending" ? "default" : "outline"}
              size="sm"
              onClick={() => setSortBy("trending")}
              className="rounded-2xl whitespace-nowrap"
            >
              <TrendingUp className="h-3 w-3 mr-1" />
              Trending
            </Button>
            <Button
              variant={sortBy === "newest" ? "default" : "outline"}
              size="sm"
              onClick={() => setSortBy("newest")}
              className="rounded-2xl whitespace-nowrap"
            >
              <Clock className="h-3 w-3 mr-1" />
              Newest
            </Button>
            <Button
              variant={sortBy === "popular" ? "default" : "outline"}
              size="sm"
              onClick={() => setSortBy("popular")}
              className="rounded-2xl whitespace-nowrap"
            >
              <Eye className="h-3 w-3 mr-1" />
              Popular
            </Button>
            <Button
              variant={sortBy === "most_followed" ? "default" : "outline"}
              size="sm"
              onClick={() => setSortBy("most_followed")}
              className="rounded-2xl whitespace-nowrap"
            >
              <Heart className="h-3 w-3 mr-1" />
              Most Followed
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-32 w-full rounded-3xl" />
            ))}
          </div>
        ) : error ? (
          <Card className="p-6 rounded-3xl bg-muted text-center text-muted-foreground">
            {error}
          </Card>
        ) : collections.length === 0 ? (
          <Card className="p-6 rounded-3xl bg-muted text-center text-muted-foreground space-y-3">
            <Music className="h-12 w-12 mx-auto opacity-50" />
            <p>No collections found.</p>
            {searchQuery && (
              <p className="text-sm">Try a different search term.</p>
            )}
          </Card>
        ) : (
          <div className="space-y-4">
            {collections.map((collection) => (
              <CollectionCard
                key={collection.id}
                collection={collection}
                currentProfileId={profile?.id}
                onFollow={handleFollow}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

interface CollectionCardProps {
  collection: Collection;
  currentProfileId?: string;
  onFollow: (collectionId: string, isFollowing: boolean) => void;
}

const CollectionCard = ({ collection, currentProfileId, onFollow }: CollectionCardProps) => {
  const { isFollowing, toggleFollow, isToggling } = useCollectionFollow(collection.id);
  const isOwner = currentProfileId === collection.profile_id;

  return (
    <Card className="p-4 rounded-3xl hover:bg-card/80 transition-colors">
      <Link to={`/playlist/${collection.share_token || collection.id}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Music className="h-4 w-4 text-primary flex-shrink-0" />
              <h3 className="font-semibold truncate">{collection.name}</h3>
            </div>
            {collection.description && (
              <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                {collection.description}
              </p>
            )}
            <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
              {collection.category && (
                <Badge variant="outline" className="text-xs">
                  {collection.category}
                </Badge>
              )}
              {collection.recommendation_reason && (
                <Badge variant="secondary" className="text-xs">
                  {collection.recommendation_reason}
                </Badge>
              )}
              <div className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                <span className="font-medium">{collection.clip_count || 0} clips</span>
              </div>
              {collection.follower_count !== undefined && (
                <div className="flex items-center gap-1">
                  <Heart className="h-3 w-3" />
                  <span className="font-medium">{collection.follower_count || 0} {collection.follower_count === 1 ? "follower" : "followers"}</span>
                </div>
              )}
              {collection.view_count !== undefined && (
                <div className="flex items-center gap-1">
                  <Eye className="h-3 w-3" />
                  <span className="font-medium">{collection.view_count || 0} {collection.view_count === 1 ? "view" : "views"}</span>
                </div>
              )}
              {collection.profiles && (
                <span className="truncate">by @{collection.profiles.handle}</span>
              )}
            </div>
          </div>
          {!isOwner && (
            <Button
              variant={isFollowing ? "default" : "outline"}
              size="sm"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleFollow();
                onFollow(collection.id, isFollowing);
              }}
              disabled={isToggling}
              className="rounded-2xl flex-shrink-0"
            >
              <Heart className={`h-4 w-4 mr-2 ${isFollowing ? "fill-current" : ""}`} />
              {isFollowing ? "Following" : "Follow"}
            </Button>
          )}
        </div>
      </Link>
    </Card>
  );
};

export default CollectionsDiscovery;

