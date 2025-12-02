import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { X, UserPlus, Mic } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { useToast } from "@/hooks/use-toast";

interface CoCreateClipDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onInvite: (handle: string) => Promise<void>;
  collaborators: Array<{
    profile_id: string;
    handle: string;
    emoji_avatar: string;
    role: string;
  }>;
  clipId?: string;
}

export const CoCreateClipDialog = ({
  isOpen,
  onClose,
  onInvite,
  collaborators,
  clipId,
}: CoCreateClipDialogProps) => {
  const { profile } = useProfile();
  const { toast } = useToast();
  const [inviteHandle, setInviteHandle] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleInvite = async () => {
    if (!inviteHandle.trim()) {
      toast({
        title: "Error",
        description: "Please enter a username",
        variant: "destructive",
      });
      return;
    }

    setIsInviting(true);
    try {
      await onInvite(inviteHandle.trim());
      setInviteHandle("");
    } catch (error) {
      console.error("Error inviting collaborator:", error);
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemoveCollaborator = async (collaboratorId: string) => {
    if (!clipId) return;

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from("clip_collaborators")
        .delete()
        .eq("clip_id", clipId)
        .eq("profile_id", collaboratorId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Collaborator removed",
      });
    } catch (error) {
      console.error("Error removing collaborator:", error);
      toast({
        title: "Error",
        description: "Failed to remove collaborator",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Co-Create Clip</DialogTitle>
          <DialogDescription>
            Invite other users to collaborate on this clip. Multiple users can record together.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current Collaborators */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Collaborators</Label>
            <div className="space-y-2">
              {collaborators.map((collab) => (
                <div
                  key={collab.profile_id}
                  className="flex items-center justify-between p-2 rounded-lg border"
                >
                  <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-lg">
                        {collab.emoji_avatar}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium text-sm">@{collab.handle}</div>
                      <Badge variant="secondary" className="text-xs">
                        {collab.role}
                      </Badge>
                    </div>
                  </div>
                  {profile?.id === collab.profile_id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveCollaborator(collab.profile_id)}
                      disabled={isLoading}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Invite New Collaborator */}
          <div>
            <Label htmlFor="invite-handle" className="text-sm font-medium mb-2 block">
              Invite Collaborator
            </Label>
            <div className="flex gap-2">
              <Input
                id="invite-handle"
                placeholder="@username"
                value={inviteHandle}
                onChange={(e) => setInviteHandle(e.target.value.replace("@", ""))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleInvite();
                  }
                }}
              />
              <Button
                onClick={handleInvite}
                disabled={isInviting || !inviteHandle.trim()}
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Invite
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Enter a username to invite them to collaborate
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

