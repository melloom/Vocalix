import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mic, Calendar, Clock, Users, Radio, Play, Plus, Search, TrendingUp, Star, MessageCircle, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProfile } from "@/hooks/useProfile";
import { useToast } from "@/hooks/use-toast";
import { CreateRoomModal } from "@/components/CreateRoomModal";
import { format, formatDistanceToNow, isPast, isFuture } from "date-fns";
import { logError } from "@/lib/logger";

interface VoiceAMA {
  id: string;
  title: string;
  description: string | null;
  host_profile_id: string | null;
  status: "scheduled" | "live" | "ended";
  scheduled_start_time: string | null;
  started_at: string | null;
  participant_count: number;
  is_ama: boolean;
  ama_question_submission_enabled: boolean;
  ama_question_deadline: string | null;
  profiles?: {
    handle: string;
    emoji_avatar: string;
  } | null;
  question_count?: number;
  upvoted_question_count?: number;
}

export default function VoiceAMAs() {
  const { profile } = useProfile();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [amas, setAmas] = useState<VoiceAMA[]>([]);
  const [upcomingAmas, setUpcomingAmas] = useState<VoiceAMA[]>([]);
  const [liveAmas, setLiveAmas] = useState<VoiceAMA[]>([]);
  const [pastAmas, setPastAmas] = useState<VoiceAMA[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"upcoming" | "live" | "past" | "all">("upcoming");

  useEffect(() => {
    loadAMAs();
    
    // Subscribe to real-time updates
    const channel = supabase
      .channel("voice-amas")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "live_rooms",
          filter: "is_ama=eq.true",
        },
        () => {
          loadAMAs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadAMAs = async () => {
    try {
      setIsLoading(true);
      
      // Load all AMAs with question counts
      const { data, error } = await supabase
        .from("live_rooms")
        .select(`
          *,
          host_profile:host_profile_id (
            handle,
            emoji_avatar
          )
        `)
        .eq("is_ama", true)
        .order("scheduled_start_time", { ascending: true, nullsLast: true })
        .order("started_at", { ascending: false, nullsLast: true })
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Get question counts for each AMA
      const amasWithCounts = await Promise.all(
        (data || []).map(async (ama: any) => {
          const { count } = await supabase
            .from("ama_questions")
            .select("*", { count: "exact", head: true })
            .eq("room_id", ama.id);

          const { count: upvotedCount } = await supabase
            .from("ama_questions")
            .select("*", { count: "exact", head: true })
            .eq("room_id", ama.id)
            .gt("upvotes", 0);

          return {
            ...ama,
            profiles: Array.isArray(ama.host_profile) ? ama.host_profile[0] : ama.host_profile,
            question_count: count || 0,
            upvoted_question_count: upvotedCount || 0,
          };
        })
      );

      setAmas(amasWithCounts);

      // Filter by status
      const now = new Date();
      const upcoming = amasWithCounts.filter(
        (ama) =>
          ama.status === "scheduled" &&
          ama.scheduled_start_time &&
          new Date(ama.scheduled_start_time) > now
      );
      const live = amasWithCounts.filter((ama) => ama.status === "live");
      const past = amasWithCounts.filter(
        (ama) => ama.status === "ended" || (ama.status === "scheduled" && ama.scheduled_start_time && new Date(ama.scheduled_start_time) < now)
      );

      setUpcomingAmas(upcoming);
      setLiveAmas(live);
      setPastAmas(past);
    } catch (error) {
      logError("Error loading AMAs", error);
      toast({
        title: "Error",
        description: "Failed to load AMAs",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const filteredAmas = (() => {
    let list: VoiceAMA[] = [];
    switch (activeTab) {
      case "upcoming":
        list = upcomingAmas;
        break;
      case "live":
        list = liveAmas;
        break;
      case "past":
        list = pastAmas;
        break;
      case "all":
        list = amas;
        break;
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      return list.filter(
        (ama) =>
          ama.title.toLowerCase().includes(query) ||
          ama.description?.toLowerCase().includes(query) ||
          ama.profiles?.handle.toLowerCase().includes(query)
      );
    }

    return list;
  })();

  const handleJoinAMA = (amaId: string) => {
    navigate(`/live-room/${amaId}`);
  };

  return (
    <div className="w-full px-4 lg:px-8 py-6">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(-1)}
              className="mr-2"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Mic className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">Voice AMAs</h1>
              <p className="text-muted-foreground">
                Ask Me Anything - Submit audio or text questions to creators
              </p>
            </div>
          </div>
          {profile && (
            <Button onClick={() => setIsCreateModalOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Host an AMA
            </Button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
        <div className="flex items-center justify-between mb-4">
          <TabsList>
            <TabsTrigger value="upcoming">
              <Calendar className="h-4 w-4 mr-2" />
              Upcoming
            </TabsTrigger>
            <TabsTrigger value="live">
              <Radio className="h-4 w-4 mr-2" />
              Live Now
            </TabsTrigger>
            <TabsTrigger value="past">
              <Clock className="h-4 w-4 mr-2" />
              Past
            </TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
          <div className="flex-1 max-w-sm ml-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search AMAs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </div>

        <TabsContent value="upcoming" className="space-y-4">
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-48 w-full rounded-3xl" />
              ))}
            </div>
          ) : filteredAmas.length === 0 ? (
            <Card className="rounded-3xl">
              <CardContent className="p-8 text-center">
                <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">No upcoming AMAs scheduled</p>
                {profile && (
                  <Button onClick={() => setIsCreateModalOpen(true)} className="mt-4">
                    <Plus className="h-4 w-4 mr-2" />
                    Be the first to host an AMA
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredAmas.map((ama) => (
                <Card key={ama.id} className="rounded-3xl hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex items-start justify-between mb-2">
                      <Badge variant="secondary" className="rounded-full">
                        <Mic className="h-3 w-3 mr-1" />
                        AMA
                      </Badge>
                      {ama.status === "scheduled" && ama.scheduled_start_time && (
                        <Badge variant="outline">
                          {formatDistanceToNow(new Date(ama.scheduled_start_time), { addSuffix: true })}
                        </Badge>
                      )}
                    </div>
                    <CardTitle className="text-lg line-clamp-2">{ama.title}</CardTitle>
                    {ama.description && (
                      <CardDescription className="line-clamp-2">{ama.description}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="text-lg">{ama.profiles?.emoji_avatar || "👤"}</span>
                      <span>@{ama.profiles?.handle || "Anonymous"}</span>
                    </div>

                    {ama.scheduled_start_time && (
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span>{format(new Date(ama.scheduled_start_time), "PPP 'at' p")}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <span>{ama.participant_count || 0}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <MessageCircle className="h-4 w-4 text-muted-foreground" />
                          <span>{ama.question_count || 0} questions</span>
                        </div>
                      </div>
                    </div>

                    {ama.ama_question_submission_enabled && (
                      <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                        {ama.ama_question_deadline && new Date(ama.ama_question_deadline) > new Date() ? (
                          <p>Questions accepted until {format(new Date(ama.ama_question_deadline), "PPp")}</p>
                        ) : (
                          <p>Questions can be submitted during the AMA</p>
                        )}
                      </div>
                    )}

                    <Button
                      onClick={() => handleJoinAMA(ama.id)}
                      className="w-full"
                      variant={ama.status === "live" ? "default" : "outline"}
                    >
                      {ama.status === "live" ? (
                        <>
                          <Play className="h-4 w-4 mr-2" />
                          Join Live
                        </>
                      ) : (
                        <>
                          <Calendar className="h-4 w-4 mr-2" />
                          View Details
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="live" className="space-y-4">
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-48 w-full rounded-3xl" />
              ))}
            </div>
          ) : liveAmas.length === 0 ? (
            <Card className="rounded-3xl">
              <CardContent className="p-8 text-center">
                <Radio className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">No live AMAs right now</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {liveAmas.map((ama) => (
                <Card key={ama.id} className="rounded-3xl border border-primary/20">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="default" className="rounded-full animate-pulse">
                            <Radio className="h-3 w-3 mr-1" />
                            LIVE NOW
                          </Badge>
                          <Badge variant="secondary" className="rounded-full">
                            <Mic className="h-3 w-3 mr-1" />
                            AMA
                          </Badge>
                        </div>
                        <h3 className="text-xl font-bold mb-1">{ama.title}</h3>
                        {ama.description && (
                          <p className="text-muted-foreground line-clamp-2">{ama.description}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 mb-4 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{ama.profiles?.emoji_avatar || "👤"}</span>
                        <span>@{ama.profiles?.handle || "Anonymous"}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span>{ama.participant_count || 0} listening</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <MessageCircle className="h-4 w-4 text-muted-foreground" />
                        <span>{ama.question_count || 0} questions</span>
                      </div>
                    </div>

                    <Button
                      onClick={() => handleJoinAMA(ama.id)}
                      className="w-full"
                      size="lg"
                    >
                      <Play className="h-4 w-4 mr-2" />
                      Join Live AMA
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="past" className="space-y-4">
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-32 w-full rounded-3xl" />
              ))}
            </div>
          ) : filteredAmas.length === 0 ? (
            <Card className="rounded-3xl">
              <CardContent className="p-8 text-center">
                <Clock className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">No past AMAs</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredAmas.map((ama) => (
                <Card key={ama.id} className="rounded-3xl">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold">{ama.title}</h3>
                          <Badge variant="outline" className="text-xs">
                            Ended
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>{ama.profiles?.emoji_avatar} @{ama.profiles?.handle}</span>
                          {ama.started_at && (
                            <span>{formatDistanceToNow(new Date(ama.started_at), { addSuffix: true })}</span>
                          )}
                          <span>{ama.question_count || 0} questions</span>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/live-room/${ama.id}`)}
                      >
                        View Recording
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="all" className="space-y-4">
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-32 w-full rounded-3xl" />
              ))}
            </div>
          ) : filteredAmas.length === 0 ? (
            <Card className="rounded-3xl">
              <CardContent className="p-8 text-center">
                <Mic className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">No AMAs found</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredAmas.map((ama) => (
                <Card key={ama.id} className="rounded-3xl hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex items-start justify-between mb-2">
                      <Badge variant="secondary" className="rounded-full">
                        <Mic className="h-3 w-3 mr-1" />
                        AMA
                      </Badge>
                      <Badge
                        variant={
                          ama.status === "live"
                            ? "default"
                            : ama.status === "scheduled"
                            ? "outline"
                            : "secondary"
                        }
                      >
                        {ama.status === "live" ? "Live" : ama.status === "scheduled" ? "Scheduled" : "Ended"}
                      </Badge>
                    </div>
                    <CardTitle className="text-lg line-clamp-2">{ama.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2 text-sm mb-3">
                      <span className="text-lg">{ama.profiles?.emoji_avatar || "👤"}</span>
                      <span>@{ama.profiles?.handle || "Anonymous"}</span>
                    </div>
                    <Button
                      onClick={() => handleJoinAMA(ama.id)}
                      className="w-full"
                      variant={ama.status === "live" ? "default" : "outline"}
                    >
                      {ama.status === "live" ? "Join Live" : "View Details"}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <CreateRoomModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => {
          loadAMAs();
          setIsCreateModalOpen(false);
        }}
      />
    </div>
  );
}

