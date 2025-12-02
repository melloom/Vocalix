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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface EnhancedReportDialogProps {
  contentType: "clip" | "profile" | "comment";
  contentId: string;
  contentTitle?: string;
  communityId?: string;
  trigger: React.ReactNode;
  onReportSubmitted?: () => void;
}

// Enhanced report categories with subcategories
const REPORT_CATEGORIES = {
  harassment: {
    label: "Harassment",
    subcategories: [
      "Bullying",
      "Threats",
      "Personal attacks",
      "Stalking",
      "Other harassment",
    ],
  },
  hate: {
    label: "Hate Speech",
    subcategories: [
      "Racism",
      "Sexism",
      "Homophobia",
      "Religious discrimination",
      "Other hate speech",
    ],
  },
  spam: {
    label: "Spam",
    subcategories: [
      "Repetitive content",
      "Promotional content",
      "Scam",
      "Misleading information",
      "Other spam",
    ],
  },
  nsfw: {
    label: "NSFW Content",
    subcategories: [
      "Explicit sexual content",
      "Nudity",
      "Violence",
      "Graphic content",
      "Other NSFW",
    ],
  },
  impersonation: {
    label: "Impersonation",
    subcategories: [
      "Pretending to be someone else",
      "Fake account",
      "Misleading identity",
      "Other impersonation",
    ],
  },
  self_harm: {
    label: "Self-Harm",
    subcategories: [
      "Suicide threats",
      "Self-injury",
      "Eating disorders",
      "Other self-harm",
    ],
  },
  personal_data: {
    label: "Personal Data",
    subcategories: [
      "Phone number",
      "Email address",
      "Physical address",
      "Financial information",
      "Other personal data",
    ],
  },
  other: {
    label: "Other",
    subcategories: [
      "Violates community rules",
      "Copyright violation",
      "Other",
    ],
  },
} as const;

export const EnhancedReportDialog = ({
  contentType,
  contentId,
  contentTitle,
  communityId,
  trigger,
  onReportSubmitted,
}: EnhancedReportDialogProps) => {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<keyof typeof REPORT_CATEGORIES>("harassment");
  const [subcategory, setSubcategory] = useState<string>("");
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

    // Prevent self-reporting for profiles
    if (contentType === "profile" && profileId === contentId) {
      toast({
        title: "Cannot report yourself",
        description: "You cannot report your own profile.",
        variant: "destructive",
      });
      return;
    }

    if (!subcategory) {
      toast({
        title: "Please select a subcategory",
        description: "This helps us understand the issue better.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const reportData: any = {
        reporter_profile_id: profileId,
        reason: category,
        category: category,
        subcategory: subcategory,
        details: details.trim() || null,
        report_metadata: {
          content_title: contentTitle,
          reported_at: new Date().toISOString(),
        },
        workflow_state: "pending",
        priority: 0,
      };

      // Set the appropriate ID field based on content type
      if (contentType === "clip") {
        reportData.clip_id = contentId;
      } else if (contentType === "profile") {
        reportData.profile_id = contentId;
      } else if (contentType === "comment") {
        // Assuming comments table exists - adjust if needed
        reportData.comment_id = contentId;
      }

      // Add community_id if provided
      if (communityId) {
        reportData.community_id = communityId;
      }

      const { error } = await supabase.from("reports").insert(reportData);

      if (error) throw error;

      toast({
        title: "Report submitted",
        description: "Thank you for helping keep our community safe. We'll review this report soon.",
      });

      // Reset form
      setDetails("");
      setCategory("harassment");
      setSubcategory("");
      setOpen(false);

      // Call callback if provided
      if (onReportSubmitted) {
        onReportSubmitted();
      }
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

  const selectedCategory = REPORT_CATEGORIES[category];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div onClick={() => setOpen(true)}>{trigger}</div>
      <DialogContent className="sm:max-w-lg rounded-3xl">
        <DialogHeader>
          <DialogTitle>Report {contentType}</DialogTitle>
          <DialogDescription>
            {contentTitle && (
              <span className="block mb-2">Reporting: {contentTitle}</span>
            )}
            Help us understand the issue by selecting a category and providing details.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select value={category} onValueChange={(value) => {
              setCategory(value as keyof typeof REPORT_CATEGORIES);
              setSubcategory(""); // Reset subcategory when category changes
            }}>
              <SelectTrigger id="category" className="rounded-2xl">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(REPORT_CATEGORIES).map(([key, value]) => (
                  <SelectItem key={key} value={key}>
                    {value.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedCategory && (
            <div className="space-y-2">
              <Label htmlFor="subcategory">Subcategory</Label>
              <Select value={subcategory} onValueChange={setSubcategory}>
                <SelectTrigger id="subcategory" className="rounded-2xl">
                  <SelectValue placeholder="Select a subcategory" />
                </SelectTrigger>
                <SelectContent>
                  {selectedCategory.subcategories.map((sub) => (
                    <SelectItem key={sub} value={sub}>
                      {sub}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="details">Additional Details (Optional)</Label>
            <Textarea
              id="details"
              placeholder="Provide any additional context that might help us understand the issue..."
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              className="rounded-2xl min-h-[100px]"
              maxLength={1000}
            />
            <p className="text-xs text-muted-foreground text-right">
              {details.length}/1000 characters
            </p>
          </div>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Reports are reviewed by our moderation team. You'll receive updates on the status of your report.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => setOpen(false)} className="rounded-2xl">
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={isSubmitting || !subcategory} 
            className="rounded-2xl"
          >
            {isSubmitting ? "Submitting..." : "Submit Report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

