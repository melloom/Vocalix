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
import { Sparkles, Crown, Users, Heart } from "lucide-react";

interface ReviveCommunityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  communityName: string;
  communityEmoji: string;
  onAccept: () => Promise<void>;
  onDecline: () => void;
  isTransferring?: boolean;
  rateLimitInfo?: {
    transfers_last_6_hours: number;
    transfers_last_day: number;
    transfers_last_week: number;
    communities_owned: number;
    account_age_days: number;
    hours_since_last_transfer: number | null;
    max_per_6_hours: number;
    max_per_day: number;
    max_per_week: number;
    max_total: number;
    min_account_age_days: number;
    min_hours_between_claims: number;
  } | null;
}

export function ReviveCommunityDialog({
  open,
  onOpenChange,
  communityName,
  communityEmoji,
  onAccept,
  onDecline,
  isTransferring = false,
  rateLimitInfo,
}: ReviveCommunityDialogProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleAccept = async () => {
    setIsProcessing(true);
    try {
      await onAccept();
      onOpenChange(false);
    } catch (error) {
      console.error("Error transferring ownership:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDecline = () => {
    onDecline();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center justify-center mb-4">
            <div className="relative">
              <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full blur opacity-75 animate-pulse"></div>
              <div className="relative bg-background rounded-full p-4">
                <Sparkles className="h-12 w-12 text-purple-500" />
              </div>
            </div>
          </div>
          <DialogTitle className="text-2xl text-center">
            Revive This Community? 🎉
          </DialogTitle>
          <DialogDescription className="text-center pt-2">
            <div className="space-y-3">
              <p className="text-base font-medium">
                This community <span className="font-bold">{communityName}</span>{" "}
                <span className="text-2xl">{communityEmoji}</span> has no members or host!
              </p>
              <p className="text-sm text-muted-foreground">
                Would you like to become the host and bring it back to life?
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-3">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
            <Crown className="h-5 w-5 text-yellow-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">Become the Host</p>
              <p className="text-xs text-muted-foreground">
                You'll be the community creator and moderator
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
            <Users className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">Build the Community</p>
              <p className="text-xs text-muted-foreground">
                Invite others and shape the community's future
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
            <Heart className="h-5 w-5 text-pink-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">Make It Your Own</p>
              <p className="text-xs text-muted-foreground">
                Set guidelines, moderate content, and grow the community
              </p>
            </div>
          </div>
        </div>

        {rateLimitInfo && (
          <div className="py-2 px-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
            <p className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
              <div>
                <strong>Your progress:</strong> {rateLimitInfo.communities_owned}/{rateLimitInfo.max_total} communities owned
              </div>
              <div>
                {rateLimitInfo.transfers_last_day}/{rateLimitInfo.max_per_day} claimed today • {rateLimitInfo.transfers_last_week}/{rateLimitInfo.max_per_week} this week
              </div>
              {rateLimitInfo.hours_since_last_transfer !== null && rateLimitInfo.hours_since_last_transfer < rateLimitInfo.min_hours_between_claims && (
                <div className="text-orange-600 dark:text-orange-400">
                  ⏱️ Wait {Math.ceil(rateLimitInfo.min_hours_between_claims - rateLimitInfo.hours_since_last_transfer)} more hours before claiming again
                </div>
              )}
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={handleDecline}
            disabled={isProcessing || isTransferring}
            className="flex-1 sm:flex-initial"
          >
            Maybe Later
          </Button>
          <Button
            onClick={handleAccept}
            disabled={isProcessing || isTransferring}
            className="flex-1 sm:flex-initial bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
          >
            {isProcessing || isTransferring ? (
              <>
                <Sparkles className="h-4 w-4 mr-2 animate-spin" />
                Becoming Host...
              </>
            ) : (
              <>
                <Crown className="h-4 w-4 mr-2" />
                Yes, I'll Host!
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

