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

interface ReportProfileDialogProps {
  profileId: string;
  profileHandle: string;
  trigger: React.ReactNode;
}

const REPORT_REASONS = ["harassment", "hate", "spam", "impersonation", "inappropriate content", "other"] as const;

export const ReportProfileDialog = ({ profileId, profileHandle, trigger }: ReportProfileDialogProps) => {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof REPORT_REASONS)[number]>("harassment");
  const [details, setDetails] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async () => {
    const reporterProfileId = localStorage.getItem("profileId");
    if (!reporterProfileId) {
      toast({
        title: "Please onboard first",
        description: "Create a profile before submitting reports.",
        variant: "destructive",
      });
      return;
    }

    // Prevent self-reporting
    if (reporterProfileId === profileId) {
      toast({
        title: "Cannot report yourself",
        description: "You cannot report your own profile.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase.from("reports").insert({
        profile_id: profileId,
        reporter_profile_id: reporterProfileId,
        reason,
        details: details.trim() || null,
      });

      if (error) throw error;

      toast({
        title: "Report sent",
        description: "Thanks for helping keep Echo Garden supportive. Our moderation team will review it.",
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
          <DialogTitle>Report profile</DialogTitle>
          <DialogDescription>
            Report @{profileHandle} for violating our community guidelines. Our moderation team will review it quickly.
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

