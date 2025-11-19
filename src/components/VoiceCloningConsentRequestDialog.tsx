import { useState } from "react";
import { Mic, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { logError } from "@/lib/logger";

interface VoiceCloningConsentRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clipId: string;
  creatorId: string;
  creatorHandle: string;
  onSuccess?: () => void;
}

export function VoiceCloningConsentRequestDialog({
  open,
  onOpenChange,
  clipId,
  creatorId,
  creatorHandle,
  onSuccess,
}: VoiceCloningConsentRequestDialogProps) {
  const { toast } = useToast();
  const [purpose, setPurpose] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!purpose) {
      toast({
        title: "Purpose required",
        description: "Please select a purpose for cloning this voice.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("device_id", localStorage.getItem("device_id"))
        .single();

      if (!profile) {
        throw new Error("Profile not found");
      }

      const { error } = await supabase
        .from("voice_cloning_consents")
        .insert({
          requester_id: profile.id,
          creator_id: creatorId,
          source_clip_id: clipId,
          purpose,
          message: message || null,
          status: "pending",
        });

      if (error) {
        if (error.code === "23505") {
          // Unique constraint violation - request already exists
          toast({
            title: "Request already exists",
            description: "You have already requested to clone this voice.",
            variant: "destructive",
          });
        } else {
          throw error;
        }
      } else {
        toast({
          title: "Request sent",
          description: `Your request to clone ${creatorHandle}'s voice has been sent.`,
        });
        onSuccess?.();
        onOpenChange(false);
        setPurpose("");
        setMessage("");
      }
    } catch (error) {
      logError("Failed to request voice cloning consent", error);
      toast({
        title: "Request failed",
        description: "Failed to send voice cloning request. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg rounded-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic className="h-5 w-5" />
            Request Voice Cloning Permission
          </DialogTitle>
          <DialogDescription>
            Request permission to clone {creatorHandle}'s voice for ethical use cases.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="purpose">Purpose *</Label>
            <Select value={purpose} onValueChange={setPurpose}>
              <SelectTrigger id="purpose" className="rounded-2xl">
                <SelectValue placeholder="Select a purpose" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="accessibility">
                  Accessibility (text-to-speech)
                </SelectItem>
                <SelectItem value="translation">
                  Translation (multi-language content)
                </SelectItem>
                <SelectItem value="content_creation">
                  Content Creation (remixes, adaptations)
                </SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">Message (optional)</Label>
            <Textarea
              id="message"
              placeholder="Explain how you plan to use the cloned voice..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="rounded-2xl min-h-[100px]"
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground">
              {message.length}/500 characters
            </p>
          </div>

          <div className="flex items-start gap-2 p-3 bg-muted rounded-2xl">
            <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div className="text-sm text-muted-foreground">
              <p className="font-medium mb-1">Ethical Guidelines:</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>All cloned content must credit the original creator</li>
                <li>Revenue from cloned content will be shared with the original creator</li>
                <li>AI-generated content will be watermarked</li>
              </ul>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="rounded-2xl"
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              className="rounded-2xl"
              disabled={isSubmitting || !purpose}
            >
              {isSubmitting ? "Sending..." : "Send Request"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

