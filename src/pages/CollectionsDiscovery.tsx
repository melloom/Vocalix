import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Music, Heart, Eye, Users, TrendingUp, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useProfile } from "@/hooks/useProfile";
import { useCollectionFollow } from "@/hooks/useCollectionFollow";
import { useToast } from "@/hooks/use-toast";
import { logError } from "@/lib/logger";

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
  created_at: string;
  updated_at: string;
  profiles?: {
    handle: string;
    emoji_avatar: string;
  };
}

type SortOption = "trending" | "newest" | "popular" | "most_followed";

const CollectionsDiscovery = () => {
  const { profile } = useProfile();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("trending");
  const { toast } = useToast();

  useEffect(() => {
    const loadCollections = async () => {
      setIsLoading(true);
      setError(null);

      try {
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
            query = query.order("follower_count", { ascending: false });
            break;
          case "trending":
          default:
            // Trending: combination of followers, views, and recency
            query = query.order("updated_at", { ascending: false });
            break;
        }

        const { data, error: collectionsError } = await query.limit(50);

        if (collectionsError) {
          setError("Couldn't load collections");
          logError("Error loading collections", collectionsError);
        } else {
          const collectionsWithCounts = (data || []).map((collection: any) => ({
            ...collection,
            clip_count: Array.isArray(collection.playlist_clips)
              ? collection.playlist_clips[0]?.count || 0
              : 0,
          }));
          setCollections(collectionsWithCounts);
        }
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
              <div className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                <span>{collection.clip_count || 0} clips</span>
              </div>
              {collection.follower_count !== undefined && collection.follower_count > 0 && (
                <div className="flex items-center gap-1">
                  <Heart className="h-3 w-3" />
                  <span>{collection.follower_count} followers</span>
                </div>
              )}
              {collection.view_count !== undefined && collection.view_count > 0 && (
                <div className="flex items-center gap-1">
                  <Eye className="h-3 w-3" />
                  <span>{collection.view_count} views</span>
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

