import { useState, useEffect } from "react";
import { Share2, Copy, Check, Code } from "lucide-react";
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

  const shareUrl = `${window.location.origin}/clip/${clipId}`;
  const embedCode = `<iframe src="${shareUrl}" width="100%" height="400" frameborder="0" allow="autoplay"></iframe>`;

  useEffect(() => {
    if (typeof navigator !== "undefined" && typeof (navigator as Navigator & { share?: unknown }).share === "function") {
      setCanNativeShare(true);
    }
  }, []);

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
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

