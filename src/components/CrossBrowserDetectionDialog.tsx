import { useState, useEffect } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface CrossBrowserSession {
  session_id: string;
  device_id: string | null;
  user_agent: string | null;
  browser_name: string;
  created_at: string;
  last_accessed_at: string;
}

interface CrossBrowserDetectionDialogProps {
  profileId: string;
  deviceId: string | null;
  userAgent: string | null;
  onConfirm: () => void;
  onDismiss: () => void;
}

export const CrossBrowserDetectionDialog = ({
  profileId,
  deviceId,
  userAgent,
  onConfirm,
  onDismiss,
}: CrossBrowserDetectionDialogProps) => {
  const [sessions, setSessions] = useState<CrossBrowserSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isConfirming, setIsConfirming] = useState(false);

  useEffect(() => {
    const checkCrossBrowserSessions = async () => {
      try {
        // @ts-ignore - RPC function exists but not in types
        const { data, error } = await (supabase.rpc as any)(
          "check_cross_browser_sessions",
          {
            p_profile_id: profileId,
            p_current_user_agent: userAgent,
            p_current_device_id: deviceId,
          }
        );

        if (error) {
          // If function doesn't exist yet, just dismiss
          if (error.code === "42883" || error.message?.includes("does not exist")) {
            onDismiss();
            return;
          }
          // Silently handle network errors (connection lost, CORS, etc.)
          if (error.message?.includes("Load failed") || 
              error.message?.includes("network") ||
              error.message?.includes("Failed to fetch") ||
              error.message?.includes("connection")) {
            onDismiss(); // Dismiss on network errors
            return;
          }
          console.error("Error checking cross-browser sessions:", error);
        }

        if (data && Array.isArray(data) && data.length > 0) {
          setSessions(data);
        } else {
          // No cross-browser sessions found, dismiss dialog
          onDismiss();
        }
      } catch (error: any) {
        // Silently handle network errors
        if (error?.message?.includes("Load failed") || 
            error?.message?.includes("network") ||
            error?.message?.includes("Failed to fetch") ||
            error?.message?.includes("connection")) {
          onDismiss(); // Dismiss on network errors
          return;
        }
        console.error("Error checking cross-browser sessions:", error);
        onDismiss();
      } finally {
        setIsLoading(false);
      }
    };

    checkCrossBrowserSessions();
  }, [profileId, deviceId, userAgent, onDismiss]);

  const handleConfirm = async () => {
    setIsConfirming(true);
    // The parent component will handle the actual sign-in
    onConfirm();
  };

  if (isLoading) {
    return null; // Don't show dialog while loading
  }

  if (sessions.length === 0) {
    return null; // No cross-browser sessions found
  }

  // Get unique browser names
  const browsers = Array.from(new Set(sessions.map((s) => s.browser_name)));

  return (
    <Dialog open={true} onOpenChange={() => onDismiss()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-blue-500/10 border border-blue-500/20">
              <AlertCircle className="h-5 w-5 text-blue-400" />
            </div>
            <DialogTitle className="text-left">
              Device ID Found on Another Browser
            </DialogTitle>
          </div>
          <DialogDescription className="text-left pt-2">
            We found active sessions from this device on other browsers (
            {browsers.join(", ")}). Is this you? Would you like to sign in?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Active sessions found on:
            </p>
            <div className="space-y-2">
              {sessions.slice(0, 3).map((session) => (
                <div
                  key={session.session_id}
                  className="flex items-center justify-between p-2 rounded-lg bg-muted/50 border"
                >
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-green-500" />
                    <span className="text-sm font-medium">
                      {session.browser_name}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(session.last_accessed_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={onDismiss}
              className="flex-1"
              disabled={isConfirming}
            >
              No, Continue as Guest
            </Button>
            <Button
              onClick={handleConfirm}
              className="flex-1"
              disabled={isConfirming}
            >
              {isConfirming ? (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4 animate-pulse" />
                  Signing in...
                </>
              ) : (
                "Yes, Sign Me In"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

