import { useState, useEffect } from "react";
import { Share2, Copy, Check, Code, Twitter, Facebook, Linkedin, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";

interface ShareClipDialogProps {
  clipId: string;
  clipTitle?: string | null;
  clipSummary?: string | null;
  profileHandle?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ShareClipDialog = ({
  clipId,
  clipTitle,
  clipSummary,
  profileHandle,
  open,
  onOpenChange,
}: ShareClipDialogProps) => {
  const [copied, setCopied] = useState(false);
  const [embedCopied, setEmbedCopied] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);
  const { toast } = useToast();
  const { profile } = useProfile();

  const shareUrl = `${window.location.origin}/clip/${clipId}`;
  const embedCode = `<iframe src="${shareUrl}" width="100%" height="400" frameborder="0" allow="autoplay"></iframe>`;

  useEffect(() => {
    if (typeof navigator !== "undefined" && typeof (navigator as Navigator & { share?: unknown }).share === "function") {
      setCanNativeShare(true);
    }
  }, []);

  const trackShare = async (shareMethod: string) => {
    try {
      // Detect device type
      const userAgent = navigator.userAgent || "";
      let deviceType = "unknown";
      if (/mobile|android|iphone|ipad|ipod/i.test(userAgent)) {
        deviceType = "mobile";
      } else if (/tablet|ipad/i.test(userAgent)) {
        deviceType = "tablet";
      } else {
        deviceType = "desktop";
      }

      await supabase.from("clip_shares").insert({
        clip_id: clipId,
        profile_id: profile?.id || null,
        share_method: shareMethod,
        device_type: deviceType,
        // Geographic data would need to be obtained from a service or headers
        country_code: null,
        city: null,
      });
    } catch (error) {
      // Silently fail - share tracking is not critical
      console.warn("Failed to track share:", error);
    }
  };

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      await trackShare("link");
      toast({
        title: "Link copied!",
        description: "Share this link with others",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy link", error);
      toast({
        title: "Couldn't copy link",
        description: "Please try again",
        variant: "destructive",
      });
    }
  };

  const copyEmbedCode = async () => {
    try {
      await navigator.clipboard.writeText(embedCode);
      setEmbedCopied(true);
      await trackShare("embed");
      toast({
        title: "Embed code copied!",
        description: "Paste this code into your website",
      });
      setTimeout(() => setEmbedCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy embed code", error);
      toast({
        title: "Couldn't copy embed code",
        description: "Please try again",
        variant: "destructive",
      });
    }
  };

  const handleNativeShare = async () => {
    if (!canNativeShare) return;

    const shareData: ShareData = {
      title: clipTitle || `Voice clip by ${profileHandle || "Anonymous"}`,
      text: clipSummary || `Listen to this voice clip on Echo Garden`,
      url: shareUrl,
    };

    try {
      await (navigator as Navigator & { share?: (data: ShareData) => Promise<void> }).share?.(shareData);
      await trackShare("native");
    } catch (error) {
      // User cancelled or error occurred
      if ((error as Error).name !== "AbortError") {
        console.error("Failed to share", error);
        toast({
          title: "Couldn't share",
          description: "Please try copying the link instead",
          variant: "destructive",
        });
      }
    }
  };

  const shareText = clipTitle || `Voice clip by ${profileHandle || "Anonymous"}`;
  const shareDescription = clipSummary || `Listen to this voice clip on Echo Garden`;

  const shareToTwitter = () => {
    const text = encodeURIComponent(`${shareText} - ${shareDescription}`);
    const url = encodeURIComponent(shareUrl);
    trackShare("twitter");
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank', 'width=550,height=420');
  };

  const shareToFacebook = () => {
    const url = encodeURIComponent(shareUrl);
    trackShare("facebook");
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank', 'width=550,height=420');
  };

  const shareToLinkedIn = () => {
    const url = encodeURIComponent(shareUrl);
    const title = encodeURIComponent(shareText);
    const summary = encodeURIComponent(shareDescription);
    trackShare("linkedin");
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${url}&title=${title}&summary=${summary}`, '_blank', 'width=550,height=420');
  };

  const shareToReddit = () => {
    const title = encodeURIComponent(shareText);
    const url = encodeURIComponent(shareUrl);
    trackShare("reddit");
    window.open(`https://reddit.com/submit?title=${title}&url=${url}`, '_blank', 'width=550,height=420');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle>Share Clip</DialogTitle>
          <DialogDescription>
            Share this voice clip with others
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Share Link</Label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={shareUrl}
                className="flex-1 rounded-2xl"
              />
              <Button
                onClick={copyShareLink}
                className="rounded-2xl"
                variant={copied ? "default" : "outline"}
              >
                {copied ? (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy
                  </>
                )}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Share to Platform</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={shareToTwitter}
                className="rounded-2xl"
                variant="outline"
              >
                <Twitter className="mr-2 h-4 w-4" />
                Twitter
              </Button>
              <Button
                onClick={shareToFacebook}
                className="rounded-2xl"
                variant="outline"
              >
                <Facebook className="mr-2 h-4 w-4" />
                Facebook
              </Button>
              <Button
                onClick={shareToLinkedIn}
                className="rounded-2xl"
                variant="outline"
              >
                <Linkedin className="mr-2 h-4 w-4" />
                LinkedIn
              </Button>
              <Button
                onClick={shareToReddit}
                className="rounded-2xl"
                variant="outline"
              >
                <MessageCircle className="mr-2 h-4 w-4" />
                Reddit
              </Button>
            </div>
          </div>

          {canNativeShare && (
            <div className="space-y-2">
              <Label>Native Share</Label>
              <Button
                onClick={handleNativeShare}
                className="w-full rounded-2xl"
                variant="outline"
              >
                <Share2 className="mr-2 h-4 w-4" />
                Share via...
              </Button>
            </div>
          )}

          <div className="space-y-2">
            <Label>Embed Code</Label>
            <div className="space-y-2">
              <textarea
                readOnly
                value={embedCode}
                className="w-full rounded-2xl border border-input bg-background px-3 py-2 text-sm font-mono min-h-[80px] resize-none"
                onClick={(e) => (e.target as HTMLTextAreaElement).select()}
              />
              <Button
                onClick={copyEmbedCode}
                className="w-full rounded-2xl"
                variant={embedCopied ? "default" : "outline"}
              >
                {embedCopied ? (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Embed Code Copied
                  </>
                ) : (
                  <>
                    <Code className="mr-2 h-4 w-4" />
                    Copy Embed Code
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-2xl"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

