import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Trophy, Medal, Award, TrendingUp, Users, Heart, Headphones, Flame } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProfile } from "@/hooks/useProfile";
import { useToast } from "@/hooks/use-toast";
import { ErrorDisplay } from "@/components/ErrorDisplay";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface LeaderboardEntry {
  profile_id: string;
  handle: string;
  emoji_avatar: string;
  rank: number;
  clips_count?: number;
  total_listens?: number;
  reputation?: number;
  listens_count?: number;
  reactions_count?: number;
  current_streak_days?: number;
  longest_streak_days?: number;
}

type LeaderboardType = "creators" | "listeners" | "reactors" | "streaks";
type TimePeriod = "day" | "week" | "month" | "all_time";

const Leaderboards = () => {
  const { profile } = useProfile();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<LeaderboardType>("creators");
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("all_time");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([]);
  const [userRank, setUserRank] = useState<number | null>(null);

  useEffect(() => {
    loadLeaderboard();
  }, [activeTab, timePeriod, profile?.id]);

  const loadLeaderboard = async () => {
    setIsLoading(true);
    setError(null);

    try {
      let data: LeaderboardEntry[] | null = null;
      let error: any = null;

      switch (activeTab) {
        case "creators":
          ({ data, error } = await supabase.rpc("get_top_creators", {
            p_period: timePeriod,
            p_limit: 100,
          }));
          break;
        case "listeners":
          ({ data, error } = await supabase.rpc("get_top_listeners", {
            p_period: timePeriod,
            p_limit: 100,
          }));
          break;
        case "reactors":
          ({ data, error } = await supabase.rpc("get_top_reactors", {
            p_period: timePeriod,
            p_limit: 100,
          }));
          break;
        case "streaks":
          ({ data, error } = await supabase.rpc("get_top_streaks", {
            p_limit: 100,
          }));
          break;
      }

      if (error) throw error;

      if (data) {
        setLeaderboardData(data);
        
        // Find user's rank
        if (profile?.id) {
          const userIndex = data.findIndex((entry) => entry.profile_id === profile.id);
          if (userIndex !== -1) {
            setUserRank(userIndex + 1);
          } else {
            setUserRank(null);
          }
        }
      }
    } catch (err: any) {
      const errorMessage = err?.message || "Failed to load leaderboard";
      setError(errorMessage);
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Trophy className="h-5 w-5 text-yellow-500" />;
    if (rank === 2) return <Medal className="h-5 w-5 text-gray-400" />;
    if (rank === 3) return <Award className="h-5 w-5 text-amber-600" />;
    return null;
  };

  const getRankBadgeColor = (rank: number) => {
    if (rank === 1) return "bg-yellow-500/20 text-yellow-600 border-yellow-500/30";
    if (rank === 2) return "bg-gray-400/20 text-gray-600 border-gray-400/30";
    if (rank === 3) return "bg-amber-600/20 text-amber-700 border-amber-600/30";
    return "bg-muted text-muted-foreground border-border";
  };

  const formatNumber = (num: number | undefined) => {
    if (num === undefined || num === null) return "0";
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const getLeaderboardTitle = () => {
    switch (activeTab) {
      case "creators":
        return "Top Creators";
      case "listeners":
        return "Top Listeners";
      case "reactors":
        return "Top Reactors";
      case "streaks":
        return "Top Streaks";
    }
  };

  const getLeaderboardDescription = () => {
    switch (activeTab) {
      case "creators":
        return "Ranked by clips created and total listens";
      case "listeners":
        return "Ranked by total clips listened to";
      case "reactors":
        return "Ranked by total reactions given";
      case "streaks":
        return "Ranked by current posting streak";
    }
  };

  const getMetricLabel = (entry: LeaderboardEntry) => {
    switch (activeTab) {
      case "creators":
        return `${formatNumber(entry.clips_count)} clips • ${formatNumber(entry.total_listens)} listens`;
      case "listeners":
        return `${formatNumber(entry.listens_count)} listens`;
      case "reactors":
        return `${formatNumber(entry.reactions_count)} reactions`;
      case "streaks":
        return `${entry.current_streak_days} days (best: ${entry.longest_streak_days})`;
    }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <ErrorDisplay error={error} onRetry={loadLeaderboard} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Trophy className="h-8 w-8 text-primary" />
              Leaderboards
            </h1>
            <p className="text-muted-foreground mt-1">
              See who's leading the community
            </p>
          </div>
          <Select value={timePeriod} onValueChange={(value) => setTimePeriod(value as TimePeriod)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="all_time">All Time</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* User Rank Card */}
        {userRank !== null && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Your Rank</p>
                  <p className="text-2xl font-bold">
                    #{userRank} out of {leaderboardData.length}
                  </p>
                </div>
                <Badge variant="default" className="text-lg px-4 py-2">
                  {getLeaderboardTitle()}
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Leaderboard Tabs */}
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as LeaderboardType)}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="creators" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Creators
            </TabsTrigger>
            <TabsTrigger value="listeners" className="flex items-center gap-2">
              <Headphones className="h-4 w-4" />
              Listeners
            </TabsTrigger>
            <TabsTrigger value="reactors" className="flex items-center gap-2">
              <Heart className="h-4 w-4" />
              Reactors
            </TabsTrigger>
            <TabsTrigger value="streaks" className="flex items-center gap-2">
              <Flame className="h-4 w-4" />
              Streaks
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>{getLeaderboardTitle()}</CardTitle>
                <CardDescription>{getLeaderboardDescription()}</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-4">
                    {[...Array(10)].map((_, i) => (
                      <div key={i} className="flex items-center gap-4">
                        <Skeleton className="h-12 w-12 rounded-full" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-24" />
                        </div>
                        <Skeleton className="h-6 w-16" />
                      </div>
                    ))}
                  </div>
                ) : leaderboardData.length === 0 ? (
                  <div className="text-center py-12">
                    <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">No data available for this period</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {leaderboardData.map((entry, index) => {
                      const isCurrentUser = entry.profile_id === profile?.id;
                      const rank = index + 1;

                      return (
                        <Link
                          key={entry.profile_id}
                          to={`/profile/${entry.handle}`}
                          className={`flex items-center gap-4 p-4 rounded-xl border transition-all hover:bg-accent/50 ${
                            isCurrentUser
                              ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                              : "border-border"
                          }`}
                        >
                          {/* Rank */}
                          <div className="flex items-center justify-center w-12">
                            {getRankIcon(rank) || (
                              <Badge
                                variant="outline"
                                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${getRankBadgeColor(
                                  rank
                                )}`}
                              >
                                {rank}
                              </Badge>
                            )}
                          </div>

                          {/* Avatar */}
                          <Avatar className="h-12 w-12">
                            <AvatarFallback className="text-xl">
                              {entry.emoji_avatar || "🎤"}
                            </AvatarFallback>
                          </Avatar>

                          {/* User Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold truncate">
                                @{entry.handle}
                                {isCurrentUser && (
                                  <Badge variant="secondary" className="ml-2 text-xs">
                                    You
                                  </Badge>
                                )}
                              </p>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {getMetricLabel(entry)}
                            </p>
                          </div>

                          {/* Additional Metrics */}
                          {activeTab === "creators" && entry.reputation !== undefined && (
                            <div className="text-right">
                              <p className="text-sm font-medium">{entry.reputation}</p>
                              <p className="text-xs text-muted-foreground">Reputation</p>
                            </div>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Leaderboards;

