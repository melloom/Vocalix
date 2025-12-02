import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";
import { Users, UserPlus, Network, TrendingUp } from "lucide-react";

interface MutualConnection {
  profile_id: string;
  handle: string;
  emoji_avatar: string;
  mutual_followers_count: number;
}

interface FriendOfFriend {
  profile_id: string;
  handle: string;
  emoji_avatar: string;
  mutual_connections_count: number;
  connection_path: Array<{ via: string; via_id: string }>;
}

interface SocialGraph {
  nodes: Array<{
    id: string;
    handle: string;
    emoji_avatar: string;
    depth: number;
  }>;
  edges: Array<{
    source: string;
    target: string;
  }>;
}

export const SocialDiscovery = () => {
  const { profile } = useProfile();
  const { toast } = useToast();
  const [mutualConnections, setMutualConnections] = useState<MutualConnection[]>([]);
  const [friendsOfFriends, setFriendsOfFriends] = useState<FriendOfFriend[]>([]);
  const [socialGraph, setSocialGraph] = useState<SocialGraph | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.id) {
      loadSocialDiscovery();
    }
  }, [profile?.id]);

  const loadSocialDiscovery = async () => {
    if (!profile?.id) return;

    setIsLoading(true);
    try {
      // Load friends of friends
      const { data: fofData, error: fofError } = await supabase.rpc("get_friends_of_friends", {
        p_profile_id: profile.id,
        p_limit: 20,
      });

      if (fofError) throw fofError;
      setFriendsOfFriends(fofData || []);

      // Load social graph
      const { data: graphData, error: graphError } = await supabase.rpc("get_social_graph", {
        p_profile_id: profile.id,
        p_depth: 2,
        p_limit: 50,
      });

      if (graphError) throw graphError;
      setSocialGraph(graphData || { nodes: [], edges: [] });
    } catch (error) {
      console.error("Error loading social discovery:", error);
      toast({
        title: "Error",
        description: "Failed to load social discovery data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadMutualConnections = async (otherProfileId: string) => {
    if (!profile?.id) return;

    try {
      const { data, error } = await supabase.rpc("get_mutual_connections", {
        p_profile_id_1: profile.id,
        p_profile_id_2: otherProfileId,
      });

      if (error) throw error;
      setMutualConnections(data || []);
      setSelectedProfileId(otherProfileId);
    } catch (error) {
      console.error("Error loading mutual connections:", error);
      toast({
        title: "Error",
        description: "Failed to load mutual connections",
        variant: "destructive",
      });
    }
  };

  const handleFollow = async (profileId: string) => {
    if (!profile?.id) return;

    try {
      const { error } = await supabase.from("follows").insert({
        follower_id: profile.id,
        following_id: profileId,
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "You are now following this user",
      });

      // Reload data
      loadSocialDiscovery();
    } catch (error) {
      console.error("Error following user:", error);
      toast({
        title: "Error",
        description: "Failed to follow user",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Tabs defaultValue="friends-of-friends" className="space-y-4">
        <TabsList>
          <TabsTrigger value="friends-of-friends">
            <Users className="h-4 w-4 mr-2" />
            Friends of Friends
          </TabsTrigger>
          <TabsTrigger value="mutual">
            <Network className="h-4 w-4 mr-2" />
            Mutual Connections
          </TabsTrigger>
          <TabsTrigger value="graph">
            <TrendingUp className="h-4 w-4 mr-2" />
            Social Graph
          </TabsTrigger>
        </TabsList>

        <TabsContent value="friends-of-friends" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Friends of Friends</CardTitle>
              <CardDescription>
                Discover people connected to your network
              </CardDescription>
            </CardHeader>
            <CardContent>
              {friendsOfFriends.length > 0 ? (
                <div className="space-y-3">
                  {friendsOfFriends.map((fof) => (
                    <div
                      key={fof.profile_id}
                      className="flex items-center justify-between p-3 rounded-lg border"
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="text-lg">
                            {fof.emoji_avatar}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <Link
                            to={`/profile/${fof.handle}`}
                            className="font-medium hover:underline block truncate"
                          >
                            @{fof.handle}
                          </Link>
                          <div className="text-sm text-muted-foreground">
                            {fof.mutual_connections_count} mutual connection
                            {fof.mutual_connections_count !== 1 ? "s" : ""}
                            {fof.connection_path.length > 0 && (
                              <span className="ml-1">
                                via @{fof.connection_path[0]?.via}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleFollow(fof.profile_id)}
                      >
                        <UserPlus className="h-4 w-4 mr-2" />
                        Follow
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  No friends of friends to discover yet
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mutual" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Mutual Connections</CardTitle>
              <CardDescription>
                View mutual connections with another user. Click on a user's profile to see mutual connections.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selectedProfileId ? (
                mutualConnections.length > 0 ? (
                  <div className="space-y-3">
                    {mutualConnections.map((mutual) => (
                      <Link
                        key={mutual.profile_id}
                        to={`/profile/${mutual.handle}`}
                        className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent transition-colors"
                      >
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="text-lg">
                            {mutual.emoji_avatar}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">@{mutual.handle}</div>
                          <div className="text-sm text-muted-foreground">
                            {mutual.mutual_followers_count} mutual connection
                            {mutual.mutual_followers_count !== 1 ? "s" : ""}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    No mutual connections found
                  </div>
                )
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  Visit a user's profile and click "View Mutual Connections" to see shared connections
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="graph" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Social Graph</CardTitle>
              <CardDescription>
                Visualize your social network connections (up to 2 degrees)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {socialGraph && socialGraph.nodes.length > 0 ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-4 rounded-lg border">
                      <div className="text-2xl font-bold">{socialGraph.nodes.length}</div>
                      <div className="text-sm text-muted-foreground">Total Nodes</div>
                    </div>
                    <div className="text-center p-4 rounded-lg border">
                      <div className="text-2xl font-bold">{socialGraph.edges.length}</div>
                      <div className="text-sm text-muted-foreground">Connections</div>
                    </div>
                    <div className="text-center p-4 rounded-lg border">
                      <div className="text-2xl font-bold">
                        {socialGraph.nodes.filter((n) => n.depth === 1).length}
                      </div>
                      <div className="text-sm text-muted-foreground">Direct Connections</div>
                    </div>
                    <div className="text-center p-4 rounded-lg border">
                      <div className="text-2xl font-bold">
                        {socialGraph.nodes.filter((n) => n.depth === 2).length}
                      </div>
                      <div className="text-sm text-muted-foreground">2nd Degree</div>
                    </div>
                  </div>

                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    <div className="text-sm font-medium mb-2">Network Nodes:</div>
                    {socialGraph.nodes.map((node) => (
                      <div
                        key={node.id}
                        className="flex items-center gap-2 p-2 rounded border text-sm"
                      >
                        <span className="text-lg">{node.emoji_avatar}</span>
                        <span className="font-medium">@{node.handle}</span>
                        <Badge variant="secondary" className="ml-auto">
                          Depth {node.depth}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  No social graph data available. Start following users to build your network!
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

