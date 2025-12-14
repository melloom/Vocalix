import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Edit, Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";

interface Flair {
  id: string;
  name: string;
  emoji: string | null;
  color: string | null;
  background_color: string | null;
  is_user_assignable: boolean;
}

interface CommunityFlairsManagerProps {
  communityId: string;
  isHost: boolean;
}

export const CommunityFlairsManager = ({
  communityId,
  isHost,
}: CommunityFlairsManagerProps) => {
  const [flairs, setFlairs] = useState<Flair[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingFlair, setEditingFlair] = useState<Flair | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    emoji: "",
    color: "#000000",
    background_color: "#ffffff",
    is_user_assignable: false,
  });
  const { toast } = useToast();

  useEffect(() => {
    loadFlairs();
  }, [communityId]);

  const loadFlairs = async () => {
    try {
      const { data, error } = await supabase
        .from("community_flairs")
        .select("*")
        .eq("community_id", communityId)
        .order("name", { ascending: true });

      if (error) throw error;
      setFlairs(data || []);
    } catch (error) {
      console.error("Error loading flairs:", error);
      toast({
        title: "Error loading flairs",
        description: "Could not load community flairs.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      const profileId = localStorage.getItem("profileId");
      if (!profileId) {
        toast({
          title: "Error",
          description: "Please log in to create flairs.",
          variant: "destructive",
        });
        return;
      }

      const flairData = {
        community_id: communityId,
        name: formData.name,
        emoji: formData.emoji || null,
        color: formData.color,
        background_color: formData.background_color,
        is_user_assignable: formData.is_user_assignable,
        created_by_profile_id: profileId,
      };

      if (editingFlair) {
        const { error } = await supabase
          .from("community_flairs")
          .update(flairData)
          .eq("id", editingFlair.id);

        if (error) throw error;
        toast({
          title: "Flair updated",
          description: "Community flair has been updated.",
        });
      } else {
        const { error } = await supabase.from("community_flairs").insert(flairData);

        if (error) throw error;
        toast({
          title: "Flair created",
          description: "New community flair has been created.",
        });
      }

      setIsDialogOpen(false);
      setEditingFlair(null);
      setFormData({
        name: "",
        emoji: "",
        color: "#000000",
        background_color: "#ffffff",
        is_user_assignable: false,
      });
      loadFlairs();
    } catch (error) {
      console.error("Error saving flair:", error);
      toast({
        title: "Error",
        description: "Could not save flair. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (flairId: string) => {
    if (!confirm("Are you sure you want to delete this flair?")) return;

    try {
      const { error } = await supabase
        .from("community_flairs")
        .delete()
        .eq("id", flairId);

      if (error) throw error;
      toast({
        title: "Flair deleted",
        description: "Community flair has been deleted.",
      });
      loadFlairs();
    } catch (error) {
      console.error("Error deleting flair:", error);
      toast({
        title: "Error",
        description: "Could not delete flair. Please try again.",
        variant: "destructive",
      });
    }
  };

  const openEditDialog = (flair: Flair) => {
    setEditingFlair(flair);
    setFormData({
      name: flair.name,
      emoji: flair.emoji || "",
      color: flair.color || "#000000",
      background_color: flair.background_color || "#ffffff",
      is_user_assignable: flair.is_user_assignable,
    });
    setIsDialogOpen(true);
  };

  if (!isHost) {
    return (
      <Card className="p-6 rounded-2xl">
        <p className="text-muted-foreground">Only community hosts can manage flairs.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Community Flairs</h3>
          <p className="text-sm text-muted-foreground">
            Create flairs that members can use to identify themselves.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingFlair(null);
            setFormData({
              name: "",
              emoji: "",
              color: "#000000",
              background_color: "#ffffff",
              is_user_assignable: false,
            });
            setIsDialogOpen(true);
          }}
          className="rounded-2xl"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Flair
        </Button>
      </div>

      {flairs.length === 0 ? (
        <Card className="p-8 text-center rounded-2xl">
          <p className="text-muted-foreground">No flairs created yet.</p>
          <Button
            onClick={() => setIsDialogOpen(true)}
            variant="outline"
            className="mt-4 rounded-2xl"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create First Flair
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {flairs.map((flair) => (
            <Card key={flair.id} className="p-4 rounded-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {flair.emoji && (
                    <span className="text-2xl">{flair.emoji}</span>
                  )}
                  <div>
                    <div
                      className="inline-flex items-center px-3 py-1 rounded-xl text-sm font-medium"
                      style={{
                        color: flair.color || "#000000",
                        backgroundColor: flair.background_color || "#ffffff",
                      }}
                    >
                      {flair.name}
                    </div>
                    {flair.is_user_assignable && (
                      <Badge variant="outline" className="ml-2">
                        User-assignable
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEditDialog(flair)}
                    className="rounded-xl"
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(flair.id)}
                    className="rounded-xl text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-lg rounded-3xl">
          <DialogHeader>
            <DialogTitle>{editingFlair ? "Edit Flair" : "Create Flair"}</DialogTitle>
            <DialogDescription>
              Create a flair that members can use to identify themselves.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="name">Flair Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="e.g., Verified, Moderator, Contributor"
                className="rounded-2xl"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="emoji">Emoji (Optional)</Label>
              <Input
                id="emoji"
                value={formData.emoji}
                onChange={(e) =>
                  setFormData({ ...formData, emoji: e.target.value })
                }
                placeholder="🎖️"
                className="rounded-2xl"
                maxLength={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="color">Text Color</Label>
                <div className="flex gap-2">
                  <Input
                    id="color"
                    type="color"
                    value={formData.color}
                    onChange={(e) =>
                      setFormData({ ...formData, color: e.target.value })
                    }
                    className="w-16 h-10 rounded-xl"
                  />
                  <Input
                    value={formData.color}
                    onChange={(e) =>
                      setFormData({ ...formData, color: e.target.value })
                    }
                    className="rounded-2xl"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="background_color">Background Color</Label>
                <div className="flex gap-2">
                  <Input
                    id="background_color"
                    type="color"
                    value={formData.background_color}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        background_color: e.target.value,
                      })
                    }
                    className="w-16 h-10 rounded-xl"
                  />
                  <Input
                    value={formData.background_color}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        background_color: e.target.value,
                      })
                    }
                    className="rounded-2xl"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="user_assignable">Allow users to assign this flair</Label>
              <Switch
                id="user_assignable"
                checked={formData.is_user_assignable}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, is_user_assignable: checked })
                }
              />
            </div>

            <div className="p-4 bg-muted rounded-2xl">
              <p className="text-sm font-medium mb-2">Preview:</p>
              <div
                className="inline-flex items-center px-3 py-1 rounded-xl text-sm font-medium"
                style={{
                  color: formData.color,
                  backgroundColor: formData.background_color,
                }}
              >
                {formData.emoji && <span className="mr-1">{formData.emoji}</span>}
                {formData.name || "Flair Name"}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              className="rounded-2xl"
            >
              Cancel
            </Button>
            <Button onClick={handleSave} className="rounded-2xl">
              {editingFlair ? "Update" : "Create"} Flair
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

