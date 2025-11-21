import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProfile } from "@/hooks/useProfile";
import { useToast } from "@/hooks/use-toast";
import { 
  muteTopic, 
  unmuteTopic, 
  muteCreator, 
  unmuteCreator,
  useMutedTopics,
  useMutedCreators
} from "@/hooks/useFeedFilters";
import { useBlockedUsers, useBlock } from "@/hooks/useBlock";
import { supabase } from "@/integrations/supabase/client";
import { 
  VolumeX, 
  UserX, 
  Search,
  X,
  Ban,
  UserMinus
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";

interface Topic {
  id: string;
  title: string;
  description: string;
}

interface Creator {
  id: string;
  handle: string;
  emoji_avatar: string;
}

export function MuteBlockSettings() {
  const { profile } = useProfile();
  const { toast } = useToast();
  const { blockedUsers, refetch: refetchBlocked } = useBlockedUsers();
  const { blockUser, unblockUser } = useBlock();
  const { data: mutedTopicIds = [], refetch: refetchMutedTopics } = useMutedTopics(profile?.id);
  const { data: mutedCreatorIds = [], refetch: refetchMutedCreators } = useMutedCreators(profile?.id);
  
  const [mutedTopics, setMutedTopics] = useState<Topic[]>([]);
  const [mutedCreators, setMutedCreators] = useState<Creator[]>([]);
  const [isLoadingTopics, setIsLoadingTopics] = useState(false);
  const [isLoadingCreators, setIsLoadingCreators] = useState(false);
  const [topicSearchQuery, setTopicSearchQuery] = useState("");
  const [creatorSearchQuery, setCreatorSearchQuery] = useState("");

  useEffect(() => {
    if (profile?.id && mutedTopicIds.length > 0) {
      loadMutedTopics();
    } else {
      setMutedTopics([]);
    }
  }, [profile?.id, mutedTopicIds]);

  useEffect(() => {
    if (profile?.id && mutedCreatorIds.length > 0) {
      loadMutedCreators();
    } else {
      setMutedCreators([]);
    }
  }, [profile?.id, mutedCreatorIds]);

  const loadMutedTopics = async () => {
    if (!profile?.id || mutedTopicIds.length === 0) return;

    try {
      setIsLoadingTopics(true);
      const { data, error } = await supabase
        .from("topics")
        .select("id, title, description")
        .in("id", mutedTopicIds);

      if (error) throw error;
      setMutedTopics(data || []);
    } catch (error: any) {
      console.error("Error loading muted topics:", error);
      toast({
        title: "Error",
        description: "Failed to load muted topics",
        variant: "destructive",
      });
    } finally {
      setIsLoadingTopics(false);
    }
  };

  const loadMutedCreators = async () => {
    if (!profile?.id || mutedCreatorIds.length === 0) return;

    try {
      setIsLoadingCreators(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("id, handle, emoji_avatar")
        .in("id", mutedCreatorIds);

      if (error) throw error;
      setMutedCreators(data || []);
    } catch (error: any) {
      console.error("Error loading muted creators:", error);
      toast({
        title: "Error",
        description: "Failed to load muted creators",
        variant: "destructive",
      });
    } finally {
      setIsLoadingCreators(false);
    }
  };

  const handleUnmuteTopic = async (topicId: string) => {
    if (!profile?.id) return;

    const success = await unmuteTopic(profile.id, topicId);
    if (success) {
      toast({
        title: "Success",
        description: "Topic unmuted",
      });
      refetchMutedTopics();
    } else {
      toast({
        title: "Error",
        description: "Failed to unmute topic",
        variant: "destructive",
      });
    }
  };

  const handleUnmuteCreator = async (creatorId: string) => {
    if (!profile?.id) return;

    const success = await unmuteCreator(profile.id, creatorId);
    if (success) {
      toast({
        title: "Success",
        description: "Creator unmuted",
      });
      refetchMutedCreators();
    } else {
      toast({
        title: "Error",
        description: "Failed to unmute creator",
        variant: "destructive",
      });
    }
  };

  const handleUnblockUser = async (blockedId: string) => {
    if (!profile?.id) return;

    try {
      await unblockUser(blockedId);
      toast({
        title: "Success",
        description: "User unblocked",
      });
      refetchBlocked();
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to unblock user",
        variant: "destructive",
      });
    }
  };

  const searchTopics = async () => {
    if (!topicSearchQuery.trim() || !profile?.id) return;

    try {
      const { data, error } = await supabase
        .from("topics")
        .select("id, title, description")
        .ilike("title", `%${topicSearchQuery}%`)
        .limit(10);

      if (error) throw error;

      if (data && data.length > 0) {
        // Show search results in a dialog or dropdown
        // For now, just show first result
        const topic = data[0];
        const success = await muteTopic(profile.id, topic.id);
        if (success) {
          toast({
            title: "Success",
            description: `Muted topic: ${topic.title}`,
          });
          setTopicSearchQuery("");
          refetchMutedTopics();
        }
      } else {
        toast({
          title: "Not found",
          description: "No topics found with that name",
        });
      }
    } catch (error: any) {
      console.error("Error searching topics:", error);
      toast({
        title: "Error",
        description: "Failed to search topics",
        variant: "destructive",
      });
    }
  };

  const searchCreators = async () => {
    if (!creatorSearchQuery.trim() || !profile?.id) return;

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, handle, emoji_avatar")
        .ilike("handle", `%${creatorSearchQuery}%`)
        .neq("id", profile.id)
        .limit(10);

      if (error) throw error;

      if (data && data.length > 0) {
        const creator = data[0];
        const success = await muteCreator(profile.id, creator.id);
        if (success) {
          toast({
            title: "Success",
            description: `Muted creator: @${creator.handle}`,
          });
          setCreatorSearchQuery("");
          refetchMutedCreators();
        }
      } else {
        toast({
          title: "Not found",
          description: "No creators found with that handle",
        });
      }
    } catch (error: any) {
      console.error("Error searching creators:", error);
      toast({
        title: "Error",
        description: "Failed to search creators",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Muted Topics */}
      <Card className="p-6 rounded-3xl space-y-4">
        <div className="flex items-center gap-2">
          <VolumeX className="h-5 w-5" />
          <h3 className="text-lg font-semibold">Muted Topics</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Topics you've muted won't appear in your feed. You can unmute them anytime.
        </p>

        <div className="flex gap-2">
          <Input
            placeholder="Search topics to mute..."
            value={topicSearchQuery}
            onChange={(e) => setTopicSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                searchTopics();
              }
            }}
            className="flex-1"
          />
          <Button onClick={searchTopics} size="sm">
            <Search className="h-4 w-4" />
          </Button>
        </div>

        {isLoadingTopics ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : mutedTopics.length === 0 ? (
          <p className="text-sm text-muted-foreground">No muted topics</p>
        ) : (
          <div className="space-y-2">
            {mutedTopics.map((topic) => (
              <div
                key={topic.id}
                className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
              >
                <div>
                  <p className="font-medium">{topic.title}</p>
                  {topic.description && (
                    <p className="text-sm text-muted-foreground line-clamp-1">
                      {topic.description}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleUnmuteTopic(topic.id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Muted Creators */}
      <Card className="p-6 rounded-3xl space-y-4">
        <div className="flex items-center gap-2">
          <UserX className="h-5 w-5" />
          <h3 className="text-lg font-semibold">Muted Creators</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Creators you've muted won't appear in your feed. This is separate from blocking.
        </p>

        <div className="flex gap-2">
          <Input
            placeholder="Search creators to mute..."
            value={creatorSearchQuery}
            onChange={(e) => setCreatorSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                searchCreators();
              }
            }}
            className="flex-1"
          />
          <Button onClick={searchCreators} size="sm">
            <Search className="h-4 w-4" />
          </Button>
        </div>

        {isLoadingCreators ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : mutedCreators.length === 0 ? (
          <p className="text-sm text-muted-foreground">No muted creators</p>
        ) : (
          <div className="space-y-2">
            {mutedCreators.map((creator) => (
              <div
                key={creator.id}
                className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl">{creator.emoji_avatar}</span>
                  <div>
                    <p className="font-medium">@{creator.handle}</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleUnmuteCreator(creator.id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Blocked Users */}
      <Card className="p-6 rounded-3xl space-y-4">
        <div className="flex items-center gap-2">
          <Ban className="h-5 w-5" />
          <h3 className="text-lg font-semibold">Blocked Users</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Blocked users cannot interact with you and their content is hidden.
        </p>

        {blockedUsers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No blocked users</p>
        ) : (
          <div className="space-y-2">
            {blockedUsers.map((blocked) => (
              <div
                key={blocked.blocked_id}
                className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="destructive">Blocked</Badge>
                  <p className="text-sm text-muted-foreground">
                    User ID: {blocked.blocked_id.substring(0, 8)}...
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <UserMinus className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Unblock User?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to unblock this user? They will be able to interact with you again.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleUnblockUser(blocked.blocked_id)}
                      >
                        Unblock
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

