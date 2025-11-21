import { useState } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { useSearchUsers } from "@/hooks/useCommunity";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { useAddPrivateChatParticipants } from "@/hooks/usePrivateChats";

interface InviteParticipantsModalProps {
  isOpen: boolean;
  onClose: () => void;
  chatId: string;
  existingParticipantIds: string[];
  onSuccess?: () => void;
}

export const InviteParticipantsModal = ({
  isOpen,
  onClose,
  chatId,
  existingParticipantIds,
  onSuccess,
}: InviteParticipantsModalProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedParticipants, setSelectedParticipants] = useState<Array<{ id: string; handle: string; emoji_avatar: string }>>([]);
  const { toast } = useToast();
  const addParticipants = useAddPrivateChatParticipants(chatId);
  const { data: searchResults = [] } = useSearchUsers(searchQuery);

  const handleAddParticipant = (user: { id: string; handle: string; emoji_avatar: string }) => {
    if (!selectedParticipants.find(p => p.id === user.id) && !existingParticipantIds.includes(user.id)) {
      setSelectedParticipants([...selectedParticipants, user]);
      setSearchQuery("");
    }
  };

  const handleRemoveParticipant = (userId: string) => {
    setSelectedParticipants(selectedParticipants.filter(p => p.id !== userId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedParticipants.length === 0) {
      toast({
        title: "No participants selected",
        description: "Please select at least one person to invite",
        variant: "destructive",
      });
      return;
    }

    try {
      await addParticipants.mutateAsync(selectedParticipants.map(p => p.id));

      toast({
        title: "Participants invited!",
        description: `Added ${selectedParticipants.length} participant(s) to the chat.`,
      });

      // Reset form
      setSelectedParticipants([]);
      setSearchQuery("");

      onSuccess?.();
      onClose();
    } catch (error: any) {
      toast({
        title: "Failed to invite participants",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    }
  };

  const filteredSearchResults = searchResults.filter(
    user => !selectedParticipants.find(p => p.id === user.id) && !existingParticipantIds.includes(user.id)
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invite Participants</DialogTitle>
          <DialogDescription>
            Search for users and add them to this private chat.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="search">Search Users</Label>
            <Input
              id="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search users by handle..."
            />
            {searchQuery.length >= 2 && filteredSearchResults.length > 0 && (
              <div className="border border-border rounded-lg mt-1 max-h-40 overflow-y-auto">
                {filteredSearchResults.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => handleAddParticipant(user)}
                    className="w-full px-3 py-2 text-left hover:bg-muted flex items-center gap-2"
                  >
                    <span className="text-xl">{user.emoji_avatar}</span>
                    <span>{user.handle}</span>
                  </button>
                ))}
              </div>
            )}
            {searchQuery.length >= 2 && filteredSearchResults.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">No users found</p>
            )}
          </div>

          {selectedParticipants.length > 0 && (
            <div className="space-y-1.5">
              <Label>Selected Participants ({selectedParticipants.length})</Label>
              <div className="flex flex-wrap gap-2">
                {selectedParticipants.map((participant) => (
                  <Badge
                    key={participant.id}
                    variant="secondary"
                    className="flex items-center gap-1 px-2 py-1"
                  >
                    <span>{participant.emoji_avatar}</span>
                    <span>{participant.handle}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveParticipant(participant.id)}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={addParticipants.isPending || selectedParticipants.length === 0}
            >
              {addParticipants.isPending ? "Inviting..." : `Invite ${selectedParticipants.length} Participant${selectedParticipants.length !== 1 ? 's' : ''}`}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

