import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ReportClipDialogProps {
  clipId: string;
  trigger: React.ReactNode;
}

const REPORT_REASONS = ["harassment", "hate", "NSFW", "18+ content", "personal data", "self-harm", "other"] as const;

export const ReportClipDialog = ({ clipId, trigger }: ReportClipDialogProps) => {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof REPORT_REASONS)[number]>("harassment");
  const [details, setDetails] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async () => {
    const profileId = localStorage.getItem("profileId");
    if (!profileId) {
      toast({
        title: "Please onboard first",
        description: "Create a profile before submitting reports.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase.from("reports").insert({
        clip_id: clipId,
        reporter_profile_id: profileId,
        reason,
        details: details.trim() || null,
      });

      if (error) throw error;

      toast({
        title: "Report sent",
        description: "Thanks for helping keep Echo Garden supportive.",
      });
      setDetails("");
      setReason("harassment");
      setOpen(false);
    } catch (error) {
      console.error("Report failed:", error);
      toast({
        title: "Couldn't send report",
        description: "Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div onClick={() => setOpen(true)}>{trigger}</div>
      <DialogContent className="sm:max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle>Report clip</DialogTitle>
          <DialogDescription>
            Select a reason and share any details. Our moderation team will review it quickly.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-3 gap-2">
            {REPORT_REASONS.map((option) => (
              <Button
                key={option}
                variant={option === reason ? "default" : "outline"}
                className="rounded-2xl capitalize text-xs"
                onClick={() => setReason(option)}
              >
                {option}
              </Button>
            ))}
          </div>

          <Textarea
            placeholder="Extra context (optional)"
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            className="rounded-2xl min-h-[100px]"
            maxLength={500}
          />
          <p className="text-xs text-muted-foreground text-right">
            {details.length}/500 characters
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => setOpen(false)} className="rounded-2xl">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="rounded-2xl">
            {isSubmitting ? "Sending..." : "Submit Report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

