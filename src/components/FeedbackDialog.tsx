import { useState } from "react";
import { MessageSquare, Bug, Sparkles, AlertCircle, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
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
import { useAuth } from "@/context/AuthContext";

interface FeedbackDialogProps {
  trigger?: React.ReactNode;
  defaultType?: "bug" | "feature_request" | "general_feedback" | "issue" | "other";
}

const FEEDBACK_TYPES = [
  { value: "bug", label: "Report a Bug", icon: Bug, description: "Something isn't working" },
  { value: "feature_request", label: "Feature Request", icon: Sparkles, description: "Suggest a new feature" },
  { value: "issue", label: "Report an Issue", icon: AlertCircle, description: "Technical or usability issue" },
  { value: "general_feedback", label: "General Feedback", icon: MessageSquare, description: "Share your thoughts" },
  { value: "other", label: "Other", icon: MessageSquare, description: "Something else" },
] as const;

const CATEGORIES = [
  { value: "audio", label: "Audio/Recording" },
  { value: "ui", label: "User Interface" },
  { value: "performance", label: "Performance" },
  { value: "mobile", label: "Mobile App" },
  { value: "communities", label: "Communities" },
  { value: "notifications", label: "Notifications" },
  { value: "privacy", label: "Privacy/Security" },
  { value: "other", label: "Other" },
] as const;

export const FeedbackDialog = ({ trigger, defaultType = "general_feedback" }: FeedbackDialogProps) => {
  const [open, setOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState<string>(defaultType);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("");
  const [contactEmail, setContactEmail] = useState("");
  const [allowContact, setAllowContact] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { profileId, deviceId } = useAuth();

  const selectedType = FEEDBACK_TYPES.find(t => t.value === feedbackType);

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast({
        title: "Title required",
        description: "Please provide a title for your feedback.",
        variant: "destructive",
      });
      return;
    }

    if (!description.trim()) {
      toast({
        title: "Description required",
        description: "Please provide more details about your feedback.",
        variant: "destructive",
      });
      return;
    }

    if (description.trim().length < 10) {
      toast({
        title: "Description too short",
        description: "Please provide at least 10 characters of detail.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Collect metadata
      const metadata: any = {
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        url: typeof window !== 'undefined' ? window.location.href : null,
        timestamp: new Date().toISOString(),
      };

      // Add screen info if available
      if (typeof window !== 'undefined' && window.screen) {
        metadata.screen = {
          width: window.screen.width,
          height: window.screen.height,
        };
      }

      const feedbackData: any = {
        profile_id: profileId || null,
        device_id: deviceId || null,
        feedback_type: feedbackType,
        title: title.trim(),
        description: description.trim(),
        category: category || null,
        metadata,
        allow_contact: allowContact,
        contact_email: allowContact && contactEmail.trim() ? contactEmail.trim() : null,
        status: "open",
        priority: feedbackType === "bug" ? "normal" : "low",
      };

      const { error } = await supabase
        .from("user_feedback")
        .insert(feedbackData);

      if (error) throw error;

      toast({
        title: "Feedback submitted",
        description: "Thank you for your feedback! We'll review it and get back to you if needed.",
      });

      // Reset form
      setTitle("");
      setDescription("");
      setCategory("");
      setContactEmail("");
      setAllowContact(false);
      setOpen(false);
    } catch (error: any) {
      console.error("Feedback submission failed:", error);
      toast({
        title: "Couldn't submit feedback",
        description: error.message || "Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {selectedType && <selectedType.icon className="h-5 w-5" />}
            Submit Feedback
          </DialogTitle>
          <DialogDescription>
            Help us improve Echo Chamber by sharing your feedback, reporting bugs, or suggesting features.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Feedback Type */}
          <div className="space-y-2">
            <Label htmlFor="feedback-type">Type</Label>
            <Select value={feedbackType} onValueChange={setFeedbackType}>
              <SelectTrigger id="feedback-type">
                <SelectValue placeholder="Select feedback type" />
              </SelectTrigger>
              <SelectContent>
                {FEEDBACK_TYPES.map((type) => {
                  const Icon = type.icon;
                  return (
                    <SelectItem key={type.value} value={type.value}>
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        <span>{type.label}</span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {selectedType && (
              <p className="text-xs text-muted-foreground">{selectedType.description}</p>
            )}
          </div>

          {/* Category (optional) */}
          <div className="space-y-2">
            <Label htmlFor="category">Category (optional)</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="category">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Brief summary of your feedback"
              maxLength={200}
            />
            <p className="text-xs text-muted-foreground">{title.length}/200 characters</p>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Please provide as much detail as possible. For bugs, include steps to reproduce. For feature requests, explain the use case."
              rows={6}
              maxLength={2000}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">{description.length}/2000 characters</p>
          </div>

          {/* Contact Options */}
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="allow-contact"
                checked={allowContact}
                onChange={(e) => setAllowContact(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="allow-contact" className="cursor-pointer">
                Allow us to contact you about this feedback
              </Label>
            </div>
            {allowContact && (
              <div className="space-y-2 pl-6">
                <Label htmlFor="contact-email">Email (optional)</Label>
                <Input
                  id="contact-email"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="your@email.com"
                />
                <p className="text-xs text-muted-foreground">
                  We'll only use this to follow up on your feedback if needed.
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !title.trim() || !description.trim() || description.trim().length < 10}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Submit Feedback
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

