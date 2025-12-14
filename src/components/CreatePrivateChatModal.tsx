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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useCreatePrivateChat } from "@/hooks/usePrivateChats";
import { EmojiPicker } from "@/components/EmojiPicker";
import { useSearchUsers } from "@/hooks/useCommunity";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

interface CreatePrivateChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const CreatePrivateChatModal = ({
  isOpen,
  onClose,
  onSuccess,
}: CreatePrivateChatModalProps) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avatarEmoji, setAvatarEmoji] = useState("💬");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedParticipants, setSelectedParticipants] = useState<Array<{ id: string; handle: string; emoji_avatar: string }>>([]);
  const { toast } = useToast();
  const createChat = useCreatePrivateChat();
  const { data: searchResults = [] } = useSearchUsers(searchQuery);

  const handleAddParticipant = (user: { id: string; handle: string; emoji_avatar: string }) => {
    if (!selectedParticipants.find(p => p.id === user.id)) {
      setSelectedParticipants([...selectedParticipants, user]);
      setSearchQuery("");
    }
  };

  const handleRemoveParticipant = (userId: string) => {
    setSelectedParticipants(selectedParticipants.filter(p => p.id !== userId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast({
        title: "Name required",
        description: "Please enter a chat name",
        variant: "destructive",
      });
      return;
    }

    try {
      await createChat.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        avatar_emoji: avatarEmoji,
        participant_ids: selectedParticipants.map(p => p.id),
      });

      toast({
        title: "Private chat created!",
        description: `Your private chat "${name}" has been created.`,
      });

      // Reset form
      setName("");
      setDescription("");
      setAvatarEmoji("💬");
      setSelectedParticipants([]);
      setSearchQuery("");

      onSuccess?.();
      onClose();
    } catch (error: any) {
      toast({
        title: "Failed to create chat",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    }
  };

  const filteredSearchResults = searchResults.filter(
    user => !selectedParticipants.find(p => p.id === user.id)
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Private Chat</DialogTitle>
          <DialogDescription>
            Create a private group chat with selected users.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Chat Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Team Chat, Friends Group"
              maxLength={50}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this chat about?"
              maxLength={500}
              rows={2}
              className="resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Chat Avatar</Label>
            <div className="flex items-center gap-2">
              <div className="text-3xl">{avatarEmoji}</div>
              <EmojiPicker
                value={avatarEmoji}
                onChange={setAvatarEmoji}
                className="h-9 text-lg"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="participants">Add Participants</Label>
            <Input
              id="participants"
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
              disabled={createChat.isPending || !name.trim()}
            >
              {createChat.isPending ? "Creating..." : "Create Chat"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

