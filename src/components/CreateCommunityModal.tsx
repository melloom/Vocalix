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
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useCreateCommunity } from "@/hooks/useCommunity";
import { EmojiPicker } from "@/components/EmojiPicker";

interface CreateCommunityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const CreateCommunityModal = ({
  isOpen,
  onClose,
  onSuccess,
}: CreateCommunityModalProps) => {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [avatarEmoji, setAvatarEmoji] = useState("🎙️");
  const [guidelines, setGuidelines] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [isVisiblePublicly, setIsVisiblePublicly] = useState(false);
  const { toast } = useToast();
  const createCommunity = useCreateCommunity();

  // Auto-generate slug from name
  const handleNameChange = (value: string) => {
    setName(value);
    // Generate slug: lowercase, replace spaces with hyphens, remove special chars
    const generatedSlug = value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    setSlug(generatedSlug);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast({
        title: "Name required",
        description: "Please enter a community name",
        variant: "destructive",
      });
      return;
    }

    if (!slug.trim()) {
      toast({
        title: "Slug required",
        description: "Please enter a community slug",
        variant: "destructive",
      });
      return;
    }

    try {
      await createCommunity.mutateAsync({
        name: name.trim(),
        slug: slug.trim(),
        description: description.trim() || undefined,
        avatar_emoji: avatarEmoji,
        guidelines: guidelines.trim() || undefined,
        is_public: isPublic,
        is_visible_publicly: !isPublic ? isVisiblePublicly : false, // Only relevant for private communities
      });

      toast({
        title: "Community created!",
        description: `Welcome to ${name}! You've been automatically added as a member.`,
      });

      // Reset form
      setName("");
      setSlug("");
      setDescription("");
      setAvatarEmoji("🎙️");
      setGuidelines("");
      setIsPublic(true);
      setIsVisiblePublicly(false);

      onSuccess?.();
      onClose();
    } catch (error: any) {
      // Extract error message - could be from validation or database
      const errorMessage = error.message || "Something went wrong";
      toast({
        title: "Failed to create community",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[420px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Audio Community</DialogTitle>
          <DialogDescription>
            Create a new community for voice-based discussions. You can make it private so only members can see it.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="name">Community Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g., Tech Talk, Music Lovers"
              maxLength={50}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="slug">URL Slug *</Label>
            <Input
              id="slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              placeholder="tech-talk"
              pattern="^[a-z0-9-]+$"
              required
            />
            <p className="text-xs text-muted-foreground">
              /community/{slug || "your-slug"}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this community about?"
              maxLength={500}
              rows={2}
              className="resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Community Avatar</Label>
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
            <Label htmlFor="guidelines">Community Guidelines (Optional)</Label>
            <Textarea
              id="guidelines"
              value={guidelines}
              onChange={(e) => setGuidelines(e.target.value)}
              placeholder="Audio-based community guidelines..."
              maxLength={1000}
              rows={3}
              className="resize-none"
            />
          </div>

          <div className="flex items-center justify-between py-1">
            <div className="space-y-0.5">
              <Label htmlFor="isPublic" className="text-sm">Public Community</Label>
              <p className="text-xs text-muted-foreground">
                {isPublic ? "Anyone can view and join" : "Only members can view and join"}
              </p>
            </div>
            <Switch
              id="isPublic"
              checked={isPublic}
              onCheckedChange={setIsPublic}
            />
          </div>

          {!isPublic && (
            <div className="flex items-center justify-between py-1 border-t border-border pt-3">
              <div className="space-y-0.5">
                <Label htmlFor="isVisiblePublicly" className="text-sm">Visible in Public Listings</Label>
                <p className="text-xs text-muted-foreground">
                  {isVisiblePublicly 
                    ? "Community appears in public listings but requires permission to join" 
                    : "Community is hidden from public listings"}
                </p>
              </div>
              <Switch
                id="isVisiblePublicly"
                checked={isVisiblePublicly}
                onCheckedChange={setIsVisiblePublicly}
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createCommunity.isPending || !name.trim() || !slug.trim()}
            >
              {createCommunity.isPending ? "Creating..." : "Create Community"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

