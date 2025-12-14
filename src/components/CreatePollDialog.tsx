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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Calendar } from "lucide-react";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface CreatePollDialogProps {
  communityId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function CreatePollDialog({
  communityId,
  open,
  onOpenChange,
  onSuccess,
}: CreatePollDialogProps) {
  const { profile } = useProfile();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [isMultipleChoice, setIsMultipleChoice] = useState(false);
  const [expiresAt, setExpiresAt] = useState<Date | undefined>(undefined);
  const [isCreating, setIsCreating] = useState(false);

  const addOption = () => {
    if (options.length < 10) {
      setOptions([...options, ""]);
    }
  };

  const removeOption = (index: number) => {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== index));
    }
  };

  const updateOption = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      toast({
        title: "Error",
        description: "Please enter a poll title",
        variant: "destructive",
      });
      return;
    }

    const validOptions = options.filter((opt) => opt.trim().length > 0);
    if (validOptions.length < 2) {
      toast({
        title: "Error",
        description: "Please add at least 2 options",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsCreating(true);
      const pollOptions = validOptions.map((text, index) => ({
        id: String(index + 1),
        text: text.trim(),
      }));

      const { error } = await supabase.from("community_polls").insert({
        community_id: communityId,
        created_by_profile_id: profile?.id || null,
        title: title.trim(),
        description: description.trim() || null,
        options: pollOptions,
        is_multiple_choice: isMultipleChoice,
        expires_at: expiresAt?.toISOString() || null,
      });

      if (error) throw error;

      toast({
        title: "Poll created!",
        description: "Your poll is now live in the community",
      });

      setTitle("");
      setDescription("");
      setOptions(["", ""]);
      setIsMultipleChoice(false);
      setExpiresAt(undefined);
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      console.error("Error creating poll:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create poll",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Poll</DialogTitle>
          <DialogDescription>
            Create a poll for your community members to vote on
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Poll Title *</Label>
            <Input
              placeholder="What should we discuss?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-2xl"
            />
          </div>

          <div className="space-y-2">
            <Label>Description (optional)</Label>
            <Textarea
              placeholder="Add more context about your poll..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="rounded-2xl min-h-[100px]"
            />
          </div>

          <div className="space-y-2">
            <Label>Options *</Label>
            <div className="space-y-2">
              {options.map((option, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    placeholder={`Option ${index + 1}`}
                    value={option}
                    onChange={(e) => updateOption(index, e.target.value)}
                    className="rounded-2xl"
                  />
                  {options.length > 2 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeOption(index)}
                      className="rounded-2xl"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              {options.length < 10 && (
                <Button
                  variant="outline"
                  onClick={addOption}
                  className="rounded-2xl w-full"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Option
                </Button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Allow Multiple Choices</Label>
              <p className="text-xs text-muted-foreground">
                Users can select multiple options
              </p>
            </div>
            <Switch checked={isMultipleChoice} onCheckedChange={setIsMultipleChoice} />
          </div>

          <div className="space-y-2">
            <Label>Expiration Date (optional)</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal rounded-2xl",
                    !expiresAt && "text-muted-foreground"
                  )}
                >
                  <Calendar className="mr-2 h-4 w-4" />
                  {expiresAt ? format(expiresAt, "PPP") : "No expiration"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 rounded-2xl">
                <CalendarComponent
                  mode="single"
                  selected={expiresAt}
                  onSelect={setExpiresAt}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-2xl">
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={isCreating || !title.trim() || options.filter((o) => o.trim()).length < 2}
            className="rounded-2xl"
          >
            {isCreating ? "Creating..." : "Create Poll"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

