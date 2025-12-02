import { useState, useEffect } from "react";
import { Share2, Copy, Check, Code, Twitter, Facebook, Linkedin, MessageCircle, QrCode, Download, Mail, Scissors, Sparkles, Loader2 } from "lucide-react";
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
import { QRCodeSVG } from "qrcode.react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { findBestSnippet, extractAudioSnippet } from "@/utils/audioSnippets";
import { Slider } from "@/components/ui/slider";

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
  const [qrCodeSize, setQrCodeSize] = useState(200);
  const [snippetStartTime, setSnippetStartTime] = useState(0);
  const [clipDuration, setClipDuration] = useState(0);
  const [isGeneratingSnippet, setIsGeneratingSnippet] = useState(false);
  const [snippetBlob, setSnippetBlob] = useState<Blob | null>(null);
  const [snippetUrl, setSnippetUrl] = useState<string | null>(null);
  const { toast } = useToast();
  const { profile } = useProfile();

  const shareUrl = `${window.location.origin}/clip/${clipId}`;
  const embedCode = `<iframe src="${shareUrl}" width="100%" height="400" frameborder="0" allow="autoplay"></iframe>`;
  
  // Generate preview card metadata
  const previewCardData = {
    title: clipTitle || `Voice clip by ${profileHandle || "Anonymous"}`,
    description: clipSummary || `Listen to this voice clip on Echo Garden`,
    url: shareUrl,
    image: `${window.location.origin}/og-image.png`, // You can customize this
  };

  useEffect(() => {
    if (typeof navigator !== "undefined" && typeof (navigator as Navigator & { share?: unknown }).share === "function") {
      setCanNativeShare(true);
    }
  }, []);

  // Load clip duration when dialog opens
  useEffect(() => {
    if (open && clipId) {
      loadClipInfo();
    }
  }, [open, clipId]);

  const loadClipInfo = async () => {
    try {
      const { data, error } = await supabase
        .from("clips")
        .select("duration_seconds, audio_path")
        .eq("id", clipId)
        .single();

      if (error) throw error;
      if (data) {
        setClipDuration(data.duration_seconds || 0);
      }
    } catch (error) {
      console.warn("Failed to load clip info:", error);
    }
  };

  const generateBestSnippet = async () => {
    if (!clipId || clipDuration < 10) {
      toast({
        title: "Cannot generate snippet",
        description: "Clip must be at least 10 seconds long",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingSnippet(true);
    try {
      // Fetch clip audio
      const { data: clipData, error: clipError } = await supabase
        .from("clips")
        .select("audio_path")
        .eq("id", clipId)
        .single();

      if (clipError || !clipData?.audio_path) throw new Error("Failed to get clip audio");

      // Download audio
      const { data: audioBlob, error: downloadError } = await supabase.storage
        .from("audio")
        .download(clipData.audio_path);

      if (downloadError || !audioBlob) throw new Error("Failed to download audio");

      // Find best snippet
      const { startTime, snippetBlob: snippet } = await findBestSnippet(audioBlob, 10);
      setSnippetStartTime(startTime);
      setSnippetBlob(snippet);
      const url = URL.createObjectURL(snippet);
      setSnippetUrl(url);

      toast({
        title: "Snippet generated!",
        description: `Found best moment at ${Math.round(startTime)}s`,
      });
    } catch (error) {
      console.error("Error generating snippet:", error);
      toast({
        title: "Failed to generate snippet",
        description: "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingSnippet(false);
    }
  };

  const generateSnippetAtTime = async (startTime: number) => {
    if (!clipId || clipDuration < 10) return;

    setIsGeneratingSnippet(true);
    try {
      // Fetch clip audio
      const { data: clipData, error: clipError } = await supabase
        .from("clips")
        .select("audio_path")
        .eq("id", clipId)
        .single();

      if (clipError || !clipData?.audio_path) throw new Error("Failed to get clip audio");

      // Download audio
      const { data: audioBlob, error: downloadError } = await supabase.storage
        .from("audio")
        .download(clipData.audio_path);

      if (downloadError || !audioBlob) throw new Error("Failed to download audio");

      // Extract snippet
      const snippet = await extractAudioSnippet(audioBlob, startTime, 10);
      setSnippetStartTime(startTime);
      setSnippetBlob(snippet);
      const url = URL.createObjectURL(snippet);
      setSnippetUrl(url);
    } catch (error) {
      console.error("Error generating snippet:", error);
      toast({
        title: "Failed to generate snippet",
        description: "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingSnippet(false);
    }
  };

  const downloadSnippet = () => {
    if (!snippetBlob) return;

    const url = URL.createObjectURL(snippetBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `echo-garden-snippet-${clipId}-${Math.round(snippetStartTime)}s.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Snippet downloaded",
      description: "Your 10-second snippet has been saved",
    });

    trackShare("snippet_download");
  };

  const copySnippetLink = () => {
    const snippetUrl = `${shareUrl}?t=${Math.round(snippetStartTime)}`;
    navigator.clipboard.writeText(snippetUrl);
    toast({
      title: "Snippet link copied!",
      description: "Share this link to start playback at the snippet",
    });
    trackShare("snippet_link");
  };

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

  const shareViaEmail = () => {
    const subject = encodeURIComponent(shareText);
    const body = encodeURIComponent(`${shareDescription}\n\n${shareUrl}`);
    trackShare("email");
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const downloadQRCode = () => {
    const svg = document.getElementById("qr-code-svg");
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `echo-garden-clip-${clipId}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          toast({
            title: "QR code downloaded",
            description: "The QR code has been saved to your device",
          });
        }
      });
    };

    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg rounded-3xl">
        <DialogHeader>
          <DialogTitle>Share Clip</DialogTitle>
          <DialogDescription>
            Share this voice clip with others
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="link" className="w-full">
          <TabsList className="grid w-full grid-cols-4 rounded-2xl">
            <TabsTrigger value="link" className="rounded-xl">Link</TabsTrigger>
            <TabsTrigger value="snippet" className="rounded-xl">Snippet</TabsTrigger>
            <TabsTrigger value="qr" className="rounded-xl">QR Code</TabsTrigger>
            <TabsTrigger value="embed" className="rounded-xl">Embed</TabsTrigger>
          </TabsList>
          
          <TabsContent value="link" className="space-y-4 py-4">
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

            {/* Preview Card */}
            <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
              <Label className="text-xs text-muted-foreground">Preview Card</Label>
              <div className="flex gap-3">
                <div className="w-16 h-16 rounded-xl bg-muted flex items-center justify-center">
                  <span className="text-2xl">🎙️</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{previewCardData.title}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">{previewCardData.description}</p>
                  <p className="text-xs text-muted-foreground mt-1 truncate">{new URL(shareUrl).hostname}</p>
                </div>
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
                <Button
                  onClick={shareViaEmail}
                  className="rounded-2xl"
                  variant="outline"
                >
                  <Mail className="mr-2 h-4 w-4" />
                  Email
                </Button>
                {canNativeShare && (
                  <Button
                    onClick={handleNativeShare}
                    className="rounded-2xl"
                    variant="outline"
                  >
                    <Share2 className="mr-2 h-4 w-4" />
                    More...
                  </Button>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="snippet" className="space-y-4 py-4">
            <div className="space-y-4">
              <div>
                <Label>10-Second Snippet</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Share a highlight from this clip
                </p>
              </div>

              {clipDuration > 0 && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Start Time: {Math.round(snippetStartTime)}s</Label>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={generateBestSnippet}
                        disabled={isGeneratingSnippet || clipDuration < 10}
                        className="rounded-xl"
                      >
                        <Sparkles className="mr-2 h-3 w-3" />
                        Find Best Moment
                      </Button>
                    </div>
                    <Slider
                      value={[snippetStartTime]}
                      onValueChange={([value]) => {
                        setSnippetStartTime(Math.min(value, clipDuration - 10));
                        setSnippetBlob(null);
                        setSnippetUrl(null);
                      }}
                      max={Math.max(0, clipDuration - 10)}
                      step={1}
                      className="w-full"
                    />
                    <p className="text-xs text-muted-foreground">
                      Drag to select start time (max: {Math.round(clipDuration - 10)}s)
                    </p>
                  </div>

                  {snippetBlob && snippetUrl ? (
                    <div className="space-y-3 p-4 rounded-2xl border border-border bg-card">
                      <div className="flex items-center gap-2">
                        <Scissors className="h-4 w-4 text-primary" />
                        <p className="text-sm font-medium">Snippet Ready</p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={copySnippetLink}
                          variant="outline"
                          className="flex-1 rounded-2xl"
                        >
                          <Copy className="mr-2 h-4 w-4" />
                          Copy Link
                        </Button>
                        <Button
                          onClick={downloadSnippet}
                          variant="outline"
                          className="flex-1 rounded-2xl"
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Download
                        </Button>
                      </div>
                      <audio
                        src={snippetUrl}
                        controls
                        className="w-full rounded-xl"
                        style={{ height: "40px" }}
                      />
                    </div>
                  ) : (
                    <Button
                      onClick={() => generateSnippetAtTime(snippetStartTime)}
                      disabled={isGeneratingSnippet || clipDuration < 10}
                      className="w-full rounded-2xl"
                    >
                      {isGeneratingSnippet ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Scissors className="mr-2 h-4 w-4" />
                          Generate Snippet
                        </>
                      )}
                    </Button>
                  )}
                </div>
              )}

              {clipDuration === 0 && (
                <div className="p-4 rounded-2xl border border-border bg-muted/50 text-center text-sm text-muted-foreground">
                  Loading clip information...
                </div>
              )}

              {clipDuration > 0 && clipDuration < 10 && (
                <div className="p-4 rounded-2xl border border-border bg-muted/50 text-center text-sm text-muted-foreground">
                  Clip must be at least 10 seconds long to create snippets
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="qr" className="space-y-4 py-4">
            <div className="space-y-4">
              <Label>QR Code</Label>
              <div className="flex flex-col items-center gap-4 p-6 rounded-2xl border border-border bg-card">
                <div id="qr-code-svg" className="p-4 bg-white rounded-xl">
                  <QRCodeSVG
                    value={shareUrl}
                    size={qrCodeSize}
                    level="H"
                    includeMargin={true}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={downloadQRCode}
                    variant="outline"
                    className="rounded-2xl"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download QR Code
                  </Button>
                  <Button
                    onClick={copyShareLink}
                    variant="outline"
                    className="rounded-2xl"
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copy Link
                  </Button>
                </div>
                <p className="text-xs text-center text-muted-foreground max-w-xs">
                  Scan this QR code to open the clip on any device
                </p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="embed" className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Embed Code</Label>
              <div className="space-y-2">
                <textarea
                  readOnly
                  value={embedCode}
                  className="w-full rounded-2xl border border-input bg-background px-3 py-2 text-sm font-mono min-h-[100px] resize-none"
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
              <p className="text-xs text-muted-foreground">
                Paste this code into your website to embed the clip
              </p>
            </div>
          </TabsContent>
        </Tabs>
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

