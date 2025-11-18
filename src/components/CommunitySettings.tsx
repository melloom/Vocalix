import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Settings, Shield, Users, Trash2, X, Plus, Save, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface CommunitySettingsProps {
  communityId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Moderator {
  id: string;
  moderator_profile_id: string;
  permissions: {
    manage_community?: boolean;
    manage_moderators?: boolean;
    manage_members?: boolean;
    manage_content?: boolean;
    manage_announcements?: boolean;
    manage_events?: boolean;
  };
  elected_at: string;
  profiles: {
    handle: string;
    emoji_avatar: string;
  } | null;
}

const PERMISSIONS = [
  { key: "manage_community", label: "Manage Community", description: "Edit community details, settings, and guidelines" },
  { key: "manage_moderators", label: "Manage Moderators", description: "Add or remove moderators (hosts only)" },
  { key: "manage_members", label: "Manage Members", description: "Remove members from the community" },
  { key: "manage_content", label: "Manage Content", description: "Remove clips and posts" },
  { key: "manage_announcements", label: "Manage Announcements", description: "Create, edit, and delete announcements" },
  { key: "manage_events", label: "Manage Events", description: "Create and manage community events" },
] as const;

export const CommunitySettings = ({ communityId, isOpen, onOpenChange }: CommunitySettingsProps) => {
  const { profile } = useProfile();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("general");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedModerator, setSelectedModerator] = useState<Moderator | null>(null);
  const [isEditPermissionsOpen, setIsEditPermissionsOpen] = useState(false);
  const [isRemoveModeratorOpen, setIsRemoveModeratorOpen] = useState(false);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});

  // Fetch community data
  const { data: community, isLoading: isLoadingCommunity } = useQuery({
    queryKey: ["community", communityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("communities")
        .select("*")
        .eq("id", communityId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: isOpen && !!communityId,
  });

  // Fetch moderators
  const { data: moderators = [], isLoading: isLoadingModerators, refetch: refetchModerators } = useQuery({
    queryKey: ["community-moderators", communityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_moderators")
        .select(`
          *,
          profiles:moderator_profile_id (
            handle,
            emoji_avatar
          )
        `)
        .eq("community_id", communityId);
      if (error) throw error;
      return (data || []) as Moderator[];
    },
    enabled: isOpen && !!communityId,
  });

  // Search users for adding moderators
  const { data: searchResults = [] } = useQuery({
    queryKey: ["search-users", searchQuery],
    queryFn: async () => {
      if (!searchQuery || searchQuery.length < 2) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, handle, emoji_avatar")
        .ilike("handle", `%${searchQuery}%`)
        .limit(10);
      if (error) throw error;
      return data || [];
    },
    enabled: searchQuery.length >= 2,
  });

  // Update community mutation
  const updateCommunityMutation = useMutation({
    mutationFn: async (updates: {
      name?: string;
      description?: string;
      guidelines?: string;
      is_public?: boolean;
    }) => {
      const { error } = await supabase
        .from("communities")
        .update(updates)
        .eq("id", communityId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community", communityId] });
      toast.success("Community updated successfully");
    },
  });

  // Add moderator mutation
  const addModeratorMutation = useMutation({
    mutationFn: async (profileId: string) => {
      const { error } = await supabase
        .from("community_moderators")
        .insert({
          community_id: communityId,
          moderator_profile_id: profileId,
          elected_by_profile_id: profile?.id,
          permissions: {},
        });
      if (error) throw error;
    },
    onSuccess: () => {
      refetchModerators();
      setSearchQuery("");
      toast.success("Moderator added successfully");
    },
  });

  // Update moderator permissions mutation
  const updatePermissionsMutation = useMutation({
    mutationFn: async ({ moderatorId, permissions }: { moderatorId: string; permissions: Record<string, boolean> }) => {
      const { error } = await supabase
        .from("community_moderators")
        .update({ permissions })
        .eq("id", moderatorId);
      if (error) throw error;
    },
    onSuccess: () => {
      refetchModerators();
      setIsEditPermissionsOpen(false);
      setSelectedModerator(null);
      toast.success("Permissions updated successfully");
    },
  });

  // Remove moderator mutation
  const removeModeratorMutation = useMutation({
    mutationFn: async (moderatorId: string) => {
      const { error } = await supabase
        .from("community_moderators")
        .delete()
        .eq("id", moderatorId);
      if (error) throw error;
    },
    onSuccess: () => {
      refetchModerators();
      setIsRemoveModeratorOpen(false);
      setSelectedModerator(null);
      toast.success("Moderator removed successfully");
    },
  });

  const isHost = community?.created_by_profile_id === profile?.id;

  const handleEditPermissions = (moderator: Moderator) => {
    setSelectedModerator(moderator);
    setPermissions(moderator.permissions || {});
    setIsEditPermissionsOpen(true);
  };

  const handleSavePermissions = () => {
    if (!selectedModerator) return;
    updatePermissionsMutation.mutate({
      moderatorId: selectedModerator.id,
      permissions,
    });
  };

  if (!isHost) {
    return null;
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Community Settings
            </DialogTitle>
            <DialogDescription>
              Manage your community settings, moderators, and permissions
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="moderators">Moderators</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="space-y-4 mt-4">
              {isLoadingCommunity ? (
                <div className="space-y-4">
                  <div className="h-10 bg-muted animate-pulse rounded-xl" />
                  <div className="h-32 bg-muted animate-pulse rounded-xl" />
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="name">Community Name</Label>
                    <Input
                      id="name"
                      defaultValue={community?.name}
                      onBlur={(e) => {
                        if (e.target.value !== community?.name) {
                          updateCommunityMutation.mutate({ name: e.target.value });
                        }
                      }}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      defaultValue={community?.description || ""}
                      rows={4}
                      onBlur={(e) => {
                        if (e.target.value !== community?.description) {
                          updateCommunityMutation.mutate({ description: e.target.value });
                        }
                      }}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="guidelines">Community Guidelines</Label>
                    <Textarea
                      id="guidelines"
                      defaultValue={community?.guidelines || ""}
                      rows={6}
                      placeholder="Set rules and guidelines for your community..."
                      onBlur={(e) => {
                        if (e.target.value !== community?.guidelines) {
                          updateCommunityMutation.mutate({ guidelines: e.target.value });
                        }
                      }}
                    />
                  </div>

                  <Card className="p-4 rounded-2xl">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="is_public">Public Community</Label>
                        <p className="text-sm text-muted-foreground">
                          Allow anyone to view and join this community
                        </p>
                      </div>
                      <Switch
                        id="is_public"
                        checked={community?.is_public ?? true}
                        onCheckedChange={(checked) => {
                          updateCommunityMutation.mutate({ is_public: checked });
                        }}
                      />
                    </div>
                  </Card>
                </>
              )}
            </TabsContent>

            <TabsContent value="moderators" className="space-y-4 mt-4">
              <div className="space-y-4">
                {/* Add Moderator */}
                <Card className="p-4 rounded-2xl">
                  <Label className="mb-2 block">Add Moderator</Label>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Input
                        placeholder="Search by handle..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                      {searchQuery && searchResults.length > 0 && (
                        <div className="mt-2 border rounded-xl overflow-hidden">
                          {searchResults
                            .filter((user) => !moderators.some((m) => m.moderator_profile_id === user.id))
                            .map((user) => (
                              <div
                                key={user.id}
                                className="p-3 hover:bg-muted cursor-pointer flex items-center gap-2"
                                onClick={() => {
                                  addModeratorMutation.mutate(user.id);
                                }}
                              >
                                <span className="text-2xl">{user.emoji_avatar}</span>
                                <span className="font-medium">@{user.handle}</span>
                                <Button size="sm" className="ml-auto" variant="ghost">
                                  <UserPlus className="w-4 h-4" />
                                </Button>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                </Card>

                {/* Current Moderators */}
                <div className="space-y-2">
                  <Label>Current Moderators ({moderators.length})</Label>
                  {isLoadingModerators ? (
                    <div className="space-y-2">
                      {Array.from({ length: 2 }).map((_, i) => (
                        <div key={i} className="h-16 bg-muted animate-pulse rounded-xl" />
                      ))}
                    </div>
                  ) : moderators.length === 0 ? (
                    <Card className="p-8 rounded-2xl text-center">
                      <Shield className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                      <p className="text-muted-foreground">No moderators yet</p>
                      <p className="text-sm text-muted-foreground mt-2">
                        Add moderators to help manage your community
                      </p>
                    </Card>
                  ) : (
                    <div className="space-y-2">
                      {moderators.map((mod) => (
                        <Card key={mod.id} className="p-4 rounded-2xl">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="text-2xl">{mod.profiles?.emoji_avatar || "👤"}</span>
                              <div>
                                <div className="font-medium">@{mod.profiles?.handle || "Unknown"}</div>
                                <div className="text-xs text-muted-foreground">
                                  Added {formatDistanceToNow(new Date(mod.elected_at), { addSuffix: true })}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex gap-1">
                                {Object.entries(mod.permissions || {})
                                  .filter(([_, enabled]) => enabled)
                                  .map(([key]) => (
                                    <Badge key={key} variant="secondary" className="text-xs">
                                      {PERMISSIONS.find((p) => p.key === key)?.label || key}
                                    </Badge>
                                  ))}
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleEditPermissions(mod)}
                              >
                                <Settings className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setSelectedModerator(mod);
                                  setIsRemoveModeratorOpen(true);
                                }}
                              >
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Edit Permissions Dialog */}
      <Dialog open={isEditPermissionsOpen} onOpenChange={setIsEditPermissionsOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle>Edit Moderator Permissions</DialogTitle>
            <DialogDescription>
              Configure what @{selectedModerator?.profiles?.handle || "this moderator"} can do
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {PERMISSIONS.filter((p) => p.key !== "manage_moderators").map((permission) => (
              <Card key={permission.key} className="p-4 rounded-2xl">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <Label className="font-semibold">{permission.label}</Label>
                    <p className="text-sm text-muted-foreground mt-1">{permission.description}</p>
                  </div>
                  <Switch
                    checked={permissions[permission.key] || false}
                    onCheckedChange={(checked) => {
                      setPermissions((prev) => ({ ...prev, [permission.key]: checked }));
                    }}
                  />
                </div>
              </Card>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsEditPermissionsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSavePermissions} disabled={updatePermissionsMutation.isPending}>
              <Save className="w-4 h-4 mr-2" />
              Save Permissions
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Remove Moderator Confirmation */}
      <AlertDialog open={isRemoveModeratorOpen} onOpenChange={setIsRemoveModeratorOpen}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Moderator</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove @{selectedModerator?.profiles?.handle || "this moderator"}? 
              They will lose all moderator privileges.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedModerator) {
                  removeModeratorMutation.mutate(selectedModerator.id);
                }
              }}
              className="bg-destructive text-destructive-foreground"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

