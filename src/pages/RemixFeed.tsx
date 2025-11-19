import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles, TrendingUp, Radio, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipCard } from "@/components/ClipCard";
import { RemixChainView } from "@/components/RemixChainView";
import { RemixAnalytics } from "@/components/RemixAnalytics";
import { RemixOfTheDay } from "@/components/RemixOfTheDay";
import { RemixLeaderboard } from "@/components/RemixLeaderboard";
import { RemixChallengeCard } from "@/components/RemixChallengeCard";

interface RemixClip {
  id: string;
  title: string | null;
  summary: string | null;
  audio_path: string;
  duration_seconds: number;
  listens_count: number;
  reactions_count: number;
  created_at: string;
  remix_of_clip_id: string | null;
  profiles: {
    handle: string;
    emoji_avatar: string;
  } | null;
  remix_of: {
    id: string;
    title: string | null;
    profiles: {
      handle: string;
      emoji_avatar: string;
    } | null;
  } | null;
}

export default function RemixFeed() {
  const [remixes, setRemixes] = useState<RemixClip[]>([]);
  const [trendingRemixes, setTrendingRemixes] = useState<RemixClip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState<"recent" | "popular" | "trending">("recent");

  useEffect(() => {
    loadRemixes();
  }, [sortBy]);

  const loadRemixes = async () => {
    try {
      setIsLoading(true);
      
      let query = supabase
        .from("clips")
        .select(`
          id,
          title,
          summary,
          audio_path,
          duration_seconds,
          listens_count,
          reactions_count,
          created_at,
          remix_of_clip_id,
          profiles:profile_id (
            handle,
            emoji_avatar
          ),
          remix_of:remix_of_clip_id (
            id,
            title,
            profiles:profile_id (
              handle,
              emoji_avatar
            )
          )
        `)
        .not("remix_of_clip_id", "is", null)
        .eq("status", "published");

      // Apply sorting
      if (sortBy === "recent") {
        query = query.order("created_at", { ascending: false });
      } else if (sortBy === "popular") {
        query = query.order("listens_count", { ascending: false });
      } else if (sortBy === "trending") {
        // Trending = recent + high engagement
        query = query.order("reactions_count", { ascending: false });
      }

      const { data, error } = await query.limit(50);

      if (error) throw error;

      setRemixes((data as RemixClip[]) || []);

      // Load trending remixes separately
      const { data: trendingData } = await supabase
        .from("clips")
        .select(`
          id,
          title,
          summary,
          audio_path,
          duration_seconds,
          listens_count,
          reactions_count,
          created_at,
          remix_of_clip_id,
          profiles:profile_id (
            handle,
            emoji_avatar
          ),
          remix_of:remix_of_clip_id (
            id,
            title,
            profiles:profile_id (
              handle,
              emoji_avatar
            )
          )
        `)
        .not("remix_of_clip_id", "is", null)
        .eq("status", "published")
        .order("reactions_count", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(10);

      setTrendingRemixes((trendingData as RemixClip[]) || []);
    } catch (error) {
      console.error("Error loading remixes:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Sparkles className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">Remix Feed</h1>
        </div>
        <p className="text-muted-foreground">
          Discover creative remixes and audio mashups from the community
        </p>
      </div>

      <Tabs defaultValue="all" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="all">All Remixes</TabsTrigger>
          <TabsTrigger value="trending">Trending</TabsTrigger>
          <TabsTrigger value="chains">Remix Chains</TabsTrigger>
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          <TabsTrigger value="challenges">Challenges</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">All Remixes</h2>
            <Select value={sortBy} onValueChange={(value: "recent" | "popular" | "trending") => setSortBy(value)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Most Recent</SelectItem>
                <SelectItem value="popular">Most Popular</SelectItem>
                <SelectItem value="trending">Trending</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-32 w-full rounded-3xl" />
              ))}
            </div>
          ) : remixes.length === 0 ? (
            <Card className="rounded-3xl">
              <CardContent className="p-8 text-center">
                <Sparkles className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">No remixes yet. Be the first to create one!</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {remixes.map((remix) => (
                <Card key={remix.id} className="rounded-3xl">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="secondary" className="rounded-full">
                            <Sparkles className="h-3 w-3 mr-1" />
                            Remix
                          </Badge>
                          {remix.remix_of && (
                            <Link
                              to={`/clip/${remix.remix_of.id}`}
                              className="text-xs text-muted-foreground hover:underline"
                            >
                              Remix of @{remix.remix_of.profiles?.handle || "Anonymous"}
                            </Link>
                          )}
                        </div>
                        <ClipCard
                          clip={{
                            ...remix,
                            topic_id: null,
                            mood_emoji: null,
                            waveform: [],
                          }}
                          showTopic={false}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="trending" className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">Trending Remixes</h2>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-32 w-full rounded-3xl" />
              ))}
            </div>
          ) : trendingRemixes.length === 0 ? (
            <Card className="rounded-3xl">
              <CardContent className="p-8 text-center">
                <TrendingUp className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">No trending remixes yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {trendingRemixes.map((remix, index) => (
                <Card key={remix.id} className="rounded-3xl">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0">
                        <Badge variant="default" className="rounded-full w-8 h-8 flex items-center justify-center">
                          {index + 1}
                        </Badge>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="secondary" className="rounded-full">
                            <Sparkles className="h-3 w-3 mr-1" />
                            Remix
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {remix.reactions_count} reactions
                          </span>
                        </div>
                        <ClipCard
                          clip={{
                            ...remix,
                            topic_id: null,
                            mood_emoji: null,
                            waveform: [],
                          }}
                          showTopic={false}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="chains" className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <Radio className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">Remix Chains</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Explore remix chains - remixes of remixes that create viral audio threads
          </p>
          
          {remixes.length > 0 ? (
            <div className="space-y-4">
              {remixes.slice(0, 10).map((remix) => (
                <RemixChainView key={remix.id} clipId={remix.id} />
              ))}
            </div>
          ) : (
            <Card className="rounded-3xl">
              <CardContent className="p-8 text-center">
                <Radio className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">No remix chains yet.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="leaderboard" className="space-y-4">
          <div className="mb-4">
            <RemixOfTheDay />
          </div>
          <RemixLeaderboard period="all" limit={20} />
        </TabsContent>

        <TabsContent value="challenges" className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">Remix Challenges</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Participate in community remix contests and win prizes
          </p>
          
          <ActiveRemixChallenges />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ActiveRemixChallenges() {
  const [challenges, setChallenges] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadChallenges();
  }, []);

  const loadChallenges = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase.rpc('get_active_remix_challenges');

      if (error) throw error;
      setChallenges(data || []);
    } catch (error) {
      console.error("Error loading challenges:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-48 w-full rounded-3xl" />
        ))}
      </div>
    );
  }

  if (challenges.length === 0) {
    return (
      <Card className="rounded-3xl">
        <CardContent className="p-8 text-center">
          <Sparkles className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">No active challenges at the moment.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {challenges.map((challenge) => (
        <RemixChallengeCard
          key={challenge.challenge_id}
          challengeId={challenge.challenge_id}
        />
      ))}
    </div>
  );
}

