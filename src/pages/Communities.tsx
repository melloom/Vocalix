import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Plus, Search, Users, TrendingUp, Clock, Users2, Mic2, Sparkles, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useCommunities } from "@/hooks/useCommunity";
import { useFollowedCommunities } from "@/hooks/useCommunityFollow";
import { CommunityCard } from "@/components/CommunityCard";
import { CreateCommunityModal } from "@/components/CreateCommunityModal";
import { useProfile } from "@/hooks/useProfile";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VoiceBasedCommunitySuggestions } from "@/components/VoiceBasedCommunitySuggestions";

type SortOption = "trending" | "newest" | "members" | "clips";

const Communities = () => {
  const { profile, isLoading: isProfileLoading } = useProfile();
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("trending");
  const [filterJoined, setFilterJoined] = useState<boolean | null>(null);
  const [filterFollowed, setFilterFollowed] = useState<boolean | null>(null);
  
  // Use followed communities hook when filtering by following
  const { followedCommunities, isLoading: isLoadingFollowed, error: followedError, refetch: refetchFollowed } = useFollowedCommunities();
  
  // Only apply search to useCommunities when not filtering by following
  // When filtering by following, we'll do client-side search on followedCommunities
  const { communities, isLoading, error, refetch } = useCommunities({
    search: (searchQuery && filterFollowed !== true) ? searchQuery : undefined,
    limit: 200,
  });

  const handleCreateSuccess = () => {
    refetch();
    refetchFollowed();
  };

  // Filter and sort communities
  const filteredAndSortedCommunities = useMemo(() => {
    // When filtering by followed, use followedCommunities instead of all communities
    let sourceCommunities = filterFollowed === true 
      ? (followedCommunities || [])
      : (communities || []);
    
    let filtered = [...sourceCommunities];

    // Apply search filter
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      filtered = filtered.filter((c) => 
        c.name.toLowerCase().includes(searchLower) || 
        (c.description && c.description.toLowerCase().includes(searchLower))
      );
    }

    // Apply filters
    if (filterJoined === true) {
      filtered = filtered.filter((c) => c.is_member);
    } else if (filterJoined === false) {
      filtered = filtered.filter((c) => !c.is_member);
    }
    
    // Note: filterFollowed === true is already handled by using followedCommunities
    if (filterFollowed === false) {
      filtered = filtered.filter((c) => !c.is_following);
    }

    // Apply sorting
    switch (sortBy) {
      case "newest":
        filtered.sort((a, b) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        break;
      case "members":
        filtered.sort((a, b) => b.member_count - a.member_count);
        break;
      case "clips":
        filtered.sort((a, b) => b.clip_count - a.clip_count);
        break;
      case "trending":
      default:
        // Trending: combination of members, clips, and recency
        filtered.sort((a, b) => {
          const scoreA = a.member_count * 2 + a.clip_count * 3 + 
            (new Date(a.created_at).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000 ? 10 : 0);
          const scoreB = b.member_count * 2 + b.clip_count * 3 + 
            (new Date(b.created_at).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000 ? 10 : 0);
          return scoreB - scoreA;
        });
        break;
    }

    // Sort: voice-based communities first, then regular ones
    const voiceBased = filtered.filter((c) => c.is_voice_based);
    const regular = filtered.filter((c) => !c.is_voice_based);
    return [...voiceBased, ...regular];
  }, [communities, followedCommunities, sortBy, filterJoined, filterFollowed, searchQuery]);

  if (isProfileLoading) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border">
          <div className="w-full px-4 lg:px-8 py-4 flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <Skeleton className="h-8 w-32" />
          </div>
        </header>
        <main className="w-full px-4 lg:px-8 py-6 space-y-8">
          <Skeleton className="h-32 w-full rounded-3xl" />
          <Skeleton className="h-24 w-full rounded-3xl" />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="w-full px-4 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild className="rounded-full">
              <Link to="/">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <h1 className="text-2xl font-bold">Audio Communities</h1>
          </div>
          {profile && (
            <Button
              onClick={() => setIsCreateModalOpen(true)}
              size="sm"
              className="rounded-2xl"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create
            </Button>
          )}
        </div>
      </header>

      <main className="w-full px-4 lg:px-8 py-6 space-y-6">
        {/* Stats Banner */}
        {communities && communities.length > 0 && (
          <Card className="p-4 rounded-2xl bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-foreground">{communities.length}</div>
                  <div className="text-xs text-muted-foreground">Communities</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-foreground">
                    {communities.reduce((sum, c) => sum + c.member_count, 0).toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">Total Members</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-foreground">
                    {communities.reduce((sum, c) => sum + c.clip_count, 0).toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">Total Clips</div>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Voice-Based Community Suggestions */}
        <VoiceBasedCommunitySuggestions />

        {/* Search and Filters */}
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search communities..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 rounded-2xl"
            />
          </div>

          {/* Sort and Filter Tabs */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Tabs value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)} className="flex-1">
              <TabsList className="grid w-full grid-cols-4 h-10">
                <TabsTrigger value="trending" className="text-xs sm:text-sm flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  <span className="hidden sm:inline">Trending</span>
                </TabsTrigger>
                <TabsTrigger value="newest" className="text-xs sm:text-sm flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span className="hidden sm:inline">Newest</span>
                </TabsTrigger>
                <TabsTrigger value="members" className="text-xs sm:text-sm flex items-center gap-1">
                  <Users2 className="w-3 h-3" />
                  <span className="hidden sm:inline">Members</span>
                </TabsTrigger>
                <TabsTrigger value="clips" className="text-xs sm:text-sm flex items-center gap-1">
                  <Mic2 className="w-3 h-3" />
                  <span className="hidden sm:inline">Clips</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex gap-2">
              <Button
                variant={filterFollowed === true ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterFollowed(filterFollowed === true ? null : true)}
                className="rounded-xl"
              >
                <Heart className="w-3 h-3 mr-1.5" />
                Following
              </Button>
              <Button
                variant={filterJoined === true ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterJoined(filterJoined === true ? null : true)}
                className="rounded-xl"
              >
                <Users className="w-3 h-3 mr-1.5" />
                Joined
              </Button>
              <Button
                variant={filterJoined === null && filterFollowed === null ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setFilterJoined(null);
                  setFilterFollowed(null);
                }}
                className="rounded-xl"
              >
                <Sparkles className="w-3 h-3 mr-1.5" />
                All
              </Button>
            </div>
          </div>
        </div>

        {/* Communities List */}
        {(isLoading || (filterFollowed === true && isLoadingFollowed)) ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-32 w-full rounded-3xl" />
            ))}
          </div>
        ) : (error || (filterFollowed === true && followedError)) ? (
          <Card className="p-6 rounded-3xl bg-muted text-center text-muted-foreground">
            {(error || followedError) instanceof Error ? (error || followedError)?.message : "Couldn't load communities"}
          </Card>
        ) : (filterFollowed === true ? followedCommunities.length === 0 : communities.length === 0) ? (
          <Card className="p-6 rounded-3xl bg-muted text-center text-muted-foreground space-y-3">
            <Users className="h-12 w-12 mx-auto opacity-50" />
            <p>No communities found.</p>
            {searchQuery ? (
              <p className="text-sm">Try a different search term.</p>
            ) : (
              <>
                <p className="text-sm">Be the first to create an audio community!</p>
                {profile && (
                  <Button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="rounded-2xl mt-4"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create Community
                  </Button>
                )}
              </>
            )}
          </Card>
        ) : filteredAndSortedCommunities.length === 0 ? (
          <Card className="p-6 rounded-3xl bg-muted text-center text-muted-foreground space-y-3">
            <Users className="h-12 w-12 mx-auto opacity-50" />
            <p>No communities match your filters.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFilterJoined(null);
                setFilterFollowed(null);
                setSearchQuery("");
              }}
              className="rounded-2xl mt-4"
            >
              Clear Filters
            </Button>
          </Card>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm text-muted-foreground px-2">
              <span>
                Showing {filteredAndSortedCommunities.length} {filteredAndSortedCommunities.length === 1 ? "community" : "communities"}
              </span>
            </div>
            {filteredAndSortedCommunities.map((community) => (
              <CommunityCard key={community.id} community={community} />
            ))}
          </div>
        )}
      </main>

      <CreateCommunityModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={handleCreateSuccess}
      />
    </div>
  );
};

export default Communities;

