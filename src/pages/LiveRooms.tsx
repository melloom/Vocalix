import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Search, Users, Mic2, Radio, Clock, Calendar, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { CreateRoomModal } from "@/components/CreateRoomModal";
import { usePagination } from "@/hooks/usePagination";
import { ErrorDisplay } from "@/components/ErrorDisplay";
import { PaginationControls } from "@/components/PaginationControls";
import { logError } from "@/lib/logger";

// LiveRooms component for displaying and managing live audio rooms
interface LiveRoom {
  id: string;
  title: string;
  description: string | null;
  host_profile_id: string | null;
  community_id: string | null;
  status: "scheduled" | "live" | "ended";
  is_public: boolean;
  max_speakers: number;
  max_listeners: number;
  scheduled_start_time: string | null;
  started_at: string | null;
  ended_at: string | null;
  participant_count: number;
  speaker_count: number;
  listener_count: number;
  recording_enabled: boolean;
  transcription_enabled: boolean;
  created_at: string;
  profiles?: {
    handle: string;
    emoji_avatar: string;
  } | null;
  communities?: {
    name: string;
    slug: string;
  } | null;
}

type SortOption = "live" | "scheduled" | "newest";

const LiveRooms = () => {
  const { profile, isLoading: isProfileLoading } = useProfile();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("live");
  const [rooms, setRooms] = useState<LiveRoom[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const fetchRooms = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("live_rooms")
        .select(
          `
          *,
          host_profile:host_profile_id (
            handle,
            emoji_avatar
          ),
          communities (
            name,
            slug
          )
        `
        )
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;

      const formattedRooms: LiveRoom[] = (data || []).map((room: any) => ({
        ...room,
        profiles: Array.isArray(room.host_profile) ? room.host_profile[0] : room.host_profile,
        communities: Array.isArray(room.communities) ? room.communities[0] : room.communities,
      }));

      setRooms(formattedRooms);
      setError(null);
      setRetryCount(0);
    } catch (error: any) {
      const errorMessage = error?.message || "Failed to load live rooms";
      setError(errorMessage);
      logError("Error fetching rooms", error);
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRooms();

    // Subscribe to room updates
    const channel = supabase
      .channel("live-rooms-updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "live_rooms",
        },
        () => {
          fetchRooms();
        }
      )
      .subscribe((status, err) => {
        // Suppress WebSocket errors - non-critical
        if (err && (err.message?.includes("WebSocket") || err.message?.includes("websocket"))) {
          return;
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryCount]);

  const handleRetry = () => {
    setRetryCount((prev) => prev + 1);
  };

  const handleCreateSuccess = () => {
    fetchRooms();
  };

  // Filter and sort rooms
  const filteredAndSortedRooms = useMemo(() => {
    let filtered = [...rooms];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (room) =>
          room.title.toLowerCase().includes(query) ||
          room.description?.toLowerCase().includes(query) ||
          room.profiles?.handle.toLowerCase().includes(query)
      );
    }

    // Apply sorting
    switch (sortBy) {
      case "live":
        filtered.sort((a, b) => {
          // Live rooms first
          if (a.status === "live" && b.status !== "live") return -1;
          if (a.status !== "live" && b.status === "live") return 1;
          // Then by participant count
          return b.participant_count - a.participant_count;
        });
        break;
      case "scheduled":
        filtered.sort((a, b) => {
          // Scheduled rooms first
          if (a.status === "scheduled" && b.status !== "scheduled") return -1;
          if (a.status !== "scheduled" && b.status === "scheduled") return 1;
          // Then by scheduled time
          if (a.scheduled_start_time && b.scheduled_start_time) {
            return new Date(a.scheduled_start_time).getTime() - new Date(b.scheduled_start_time).getTime();
          }
          return 0;
        });
        break;
      case "newest":
      default:
        filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
    }

    return filtered;
  }, [rooms, sortBy, searchQuery]);

  const {
    paginatedData: paginatedRooms,
    currentPage,
    totalPages,
    goToPage,
  } = usePagination(filteredAndSortedRooms, { pageSize: 20 });

  const handleJoinRoom = (roomId: string) => {
    navigate(`/live-room/${roomId}`);
  };

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
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border" data-tutorial="live-rooms-header">
        <div className="w-full px-4 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild className="rounded-full">
              <Link to="/">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div className="flex items-center gap-2">
              <Radio className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-semibold">Live Rooms</h1>
            </div>
          </div>
          <Button
            onClick={() => setIsCreateModalOpen(true)}
            size="sm"
            className="rounded-full"
            data-tutorial="live-rooms-create-button"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Room
          </Button>
        </div>
      </header>

      <main className="w-full px-4 lg:px-8 py-6 space-y-6">
        {/* Search and Filters */}
        <div className="space-y-4">
          <div className="relative" data-tutorial="live-rooms-search">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search rooms..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 rounded-full"
            />
          </div>

          <Tabs value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)} data-tutorial="live-rooms-sort">
            <TabsList className="w-full">
              <TabsTrigger value="live" className="flex-1">
                <Radio className="h-4 w-4 mr-2" />
                Live
              </TabsTrigger>
              <TabsTrigger value="scheduled" className="flex-1">
                <Calendar className="h-4 w-4 mr-2" />
                Scheduled
              </TabsTrigger>
              <TabsTrigger value="newest" className="flex-1">
                <Clock className="h-4 w-4 mr-2" />
                Newest
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Rooms List */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 w-full rounded-3xl" />
            ))}
          </div>
        ) : error ? (
          <ErrorDisplay
            title="Failed to load rooms"
            message={error}
            onRetry={handleRetry}
            variant="card"
          />
        ) : filteredAndSortedRooms.length === 0 ? (
          <Card className="p-8 text-center rounded-3xl">
            <Radio className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No rooms found</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery ? "Try a different search term" : "Be the first to create a live room!"}
            </p>
            {!searchQuery && (
              <Button onClick={() => setIsCreateModalOpen(true)} className="rounded-full">
                <Plus className="h-4 w-4 mr-2" />
                Create Room
              </Button>
            )}
          </Card>
        ) : (
          <>
            <div className="space-y-4">
              {paginatedRooms.map((room, index) => (
              <Card
                key={room.id}
                className="p-6 rounded-3xl hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => handleJoinRoom(room.id)}
                data-tutorial={index === 0 ? "live-rooms-card" : undefined}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="text-3xl">{room.profiles?.emoji_avatar || "🎙️"}</div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-lg">{room.title}</h3>
                          {room.status === "live" && (
                            <Badge variant="destructive" className="gap-1">
                              <div className="h-2 w-2 rounded-full bg-current animate-pulse" />
                              LIVE
                            </Badge>
                          )}
                          {room.status === "scheduled" && (
                            <Badge variant="secondary" className="gap-1">
                              <Clock className="h-3 w-3" />
                              Scheduled
                            </Badge>
                          )}
                        </div>
                        {room.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2">{room.description}</p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Users className="h-4 w-4" />
                            <span>{room.participant_count}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Mic2 className="h-4 w-4" />
                            <span>{room.speaker_count} speaking</span>
                          </div>
                          {room.communities && (
                            <Link
                              to={`/community/${room.communities.slug}`}
                              onClick={(e) => e.stopPropagation()}
                              className="hover:underline"
                            >
                              {room.communities.name}
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant={room.status === "live" ? "default" : "outline"}
                    size="sm"
                    className="rounded-full"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleJoinRoom(room.id);
                    }}
                  >
                    {room.status === "live" ? (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        Join
                      </>
                    ) : (
                      "View"
                    )}
                  </Button>
                </div>
              </Card>
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
      </main>

      <CreateRoomModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={handleCreateSuccess}
      />
    </div>
  );
};

export default LiveRooms;

