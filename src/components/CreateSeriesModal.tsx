import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

interface CreateSeriesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateSeriesModal({ isOpen, onClose, onSuccess }: CreateSeriesModalProps) {
  const { profile } = useProfile();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("general");
  const [isPublic, setIsPublic] = useState(true);
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (!profile) {
      toast({
        title: "Error",
        description: "Please log in to create a series",
        variant: "destructive",
      });
      return;
    }

    if (!title.trim()) {
      toast({
        title: "Error",
        description: "Please enter a title",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsCreating(true);
      const { data, error } = await supabase
        .from("series")
        .insert({
          profile_id: profile.id,
          title: title.trim(),
          description: description.trim() || null,
          category: category || null,
          is_public: isPublic,
          cover_image_url: coverImageUrl.trim() || null,
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Series created!",
        description: "You can now add episodes to your series.",
      });

      setTitle("");
      setDescription("");
      setCategory("general");
      setCoverImageUrl("");
      setIsPublic(true);
      onSuccess();
    } catch (error: any) {
      console.error("Error creating series:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create series",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="rounded-3xl max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Series</DialogTitle>
          <DialogDescription>
            Create a podcast-like series to organize your clips into episodes
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              placeholder="My Amazing Series"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-2xl"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="What is this series about?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="rounded-2xl min-h-[100px]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="rounded-2xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">General</SelectItem>
                <SelectItem value="music">Music</SelectItem>
                <SelectItem value="comedy">Comedy</SelectItem>
                <SelectItem value="storytelling">Storytelling</SelectItem>
                <SelectItem value="education">Education</SelectItem>
                <SelectItem value="news">News</SelectItem>
                <SelectItem value="entertainment">Entertainment</SelectItem>
                <SelectItem value="sports">Sports</SelectItem>
                <SelectItem value="tech">Tech</SelectItem>
                <SelectItem value="lifestyle">Lifestyle</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="coverImage">Cover Image URL (optional)</Label>
            <Input
              id="coverImage"
              placeholder="https://example.com/image.jpg"
              value={coverImageUrl}
              onChange={(e) => setCoverImageUrl(e.target.value)}
              className="rounded-2xl"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="public">Public Series</Label>
              <p className="text-sm text-muted-foreground">
                Anyone can discover and follow your series
              </p>
            </div>
            <Switch
              id="public"
              checked={isPublic}
              onCheckedChange={setIsPublic}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} className="rounded-2xl">
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={isCreating || !title.trim()}
            className="rounded-2xl"
          >
            {isCreating ? "Creating..." : "Create Series"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

