import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface Community {
  id: string;
  name: string;
  slug: string;
  avatar_emoji: string;
}

interface CrosspostDialogProps {
  clipId: string;
  clipTitle?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function CrosspostDialog({
  clipId,
  clipTitle,
  open,
  onOpenChange,
  onSuccess,
}: CrosspostDialogProps) {
  const { profile } = useProfile();
  const { toast } = useToast();
  const [communities, setCommunities] = useState<Community[]>([]);
  const [selectedCommunityId, setSelectedCommunityId] = useState<string>("");
  const [customTitle, setCustomTitle] = useState("");
  const [isCrossposting, setIsCrossposting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open && profile?.id) {
      loadUserCommunities();
    }
  }, [open, profile?.id]);

  const loadUserCommunities = async () => {
    if (!profile?.id) return;

    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("community_members")
        .select(
          `
          community_id,
          communities (
            id,
            name,
            slug,
            avatar_emoji
          )
        `
        )
        .eq("profile_id", profile.id);

      if (error) throw error;

      const comms = (data || [])
        .map((item: any) => item.communities)
        .filter(Boolean) as Community[];

      setCommunities(comms);
    } catch (error: any) {
      console.error("Error loading communities:", error);
      toast({
        title: "Error",
        description: "Failed to load communities",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCrosspost = async () => {
    if (!selectedCommunityId) {
      toast({
        title: "Select a community",
        description: "Please select a community to crosspost to",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsCrossposting(true);
      const { error } = await supabase.from("crossposts").insert({
        original_clip_id: clipId,
        crossposted_to_community_id: selectedCommunityId,
        crossposted_by_profile_id: profile?.id || null,
        title: customTitle.trim() || null,
      });

      if (error) throw error;

      toast({
        title: "Crossposted!",
        description: "Your clip has been shared to the community",
      });

      setSelectedCommunityId("");
      setCustomTitle("");
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      console.error("Error crossposting:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to crosspost",
        variant: "destructive",
      });
    } finally {
      setIsCrossposting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle>Crosspost to Community</DialogTitle>
          <DialogDescription>
            Share this clip to one of your communities
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Select Community</Label>
            {isLoading ? (
              <div className="text-sm text-muted-foreground">Loading communities...</div>
            ) : communities.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                You need to join a community first to crosspost
              </div>
            ) : (
              <Select value={selectedCommunityId} onValueChange={setSelectedCommunityId}>
                <SelectTrigger className="rounded-2xl">
                  <SelectValue placeholder="Choose a community" />
                </SelectTrigger>
                <SelectContent>
                  {communities.map((comm) => (
                    <SelectItem key={comm.id} value={comm.id}>
                      <span className="flex items-center gap-2">
                        <span>{comm.avatar_emoji}</span>
                        <span>{comm.name}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label>Custom Title (optional)</Label>
            <Input
              placeholder={clipTitle || "Custom title for crosspost"}
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              className="rounded-2xl"
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to use original title
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-2xl">
            Cancel
          </Button>
          <Button
            onClick={handleCrosspost}
            disabled={isCrossposting || !selectedCommunityId || isLoading}
            className="rounded-2xl"
          >
            {isCrossposting ? "Crossposting..." : "Crosspost"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

