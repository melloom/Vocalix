import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AlertCircle, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { supabase, setSessionCookie } from "@/integrations/supabase/client";
import { useDeviceId } from "@/hooks/useDeviceId";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type RedemptionStatus = "checking" | "confirming" | "redeeming" | "success" | "error";

const LoginLink = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const deviceId = useDeviceId();
  const [status, setStatus] = useState<RedemptionStatus>("checking");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [profileHandle, setProfileHandle] = useState<string | null>(null);
  const [linkAccountHandle, setLinkAccountHandle] = useState<string | null>(null);
  const [linkExpiresAt, setLinkExpiresAt] = useState<Date | null>(null);
  const [isAdminAccount, setIsAdminAccount] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const attemptRef = useRef(false);

  const token = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("token")?.trim() ?? "";
  }, [location.search]);

  useEffect(() => {
    if (attemptRef.current) return;
    
    // Wait for device ID to be available (important on mobile where it might load slower)
    if (!deviceId) {
      // Give it a moment to initialize, especially on mobile
      const checkDeviceId = setTimeout(() => {
        if (!deviceId) {
          setStatus("error");
          setErrorMessage("Device identification failed. Please refresh the page and try again.");
        }
      }, 2000);
      return () => clearTimeout(checkDeviceId);
    }
    
    attemptRef.current = true;

    if (!token) {
      setStatus("error");
      setErrorMessage("This login link is missing its token. Request a fresh link from your settings and try again.");
      return;
    }

    // Preview link info to get account details and validate link
    const previewLink = async () => {
      try {
        // Ensure token is trimmed and valid
        const trimmedToken = token.trim();
        if (!trimmedToken || trimmedToken.length === 0) {
          setStatus("error");
          setErrorMessage("This login link is missing its token. Request a fresh link from your settings and try again.");
          return;
        }

        const { data, error } = await supabase.rpc("preview_magic_login_link", { link_token: trimmedToken });
        
        if (error) {
          console.error("Preview magic login link error:", error);
          // If the preview function isn't available in PostgREST yet (404 / not found),
          // fall back to directly redeeming the link instead of failing validation.
          if (
            error.code === "PGRST301" ||
            (error as any)?.status === 404 ||
            error.message?.includes("not found") ||
            error.message?.includes("does not exist")
          ) {
            // Skip preview UI and try redeeming immediately
            setStatus("redeeming");
            setShowConfirmDialog(false);
            await handleConfirmLink();
            return;
          }
          throw error;
        }

        const result = data?.[0];
        
        if (!result) {
          setStatus("error");
          setErrorMessage("This login link is invalid. Please request a new link from Settings.");
          return;
        }

        // Check if link is already used
        if (result.is_redeemed) {
          setStatus("error");
          setErrorMessage("This login link has already been used. Each link can only be used once. Please request a new link from Settings.");
          return;
        }

        // Check if link is expired
        if (result.is_expired) {
          setStatus("error");
          const expiresDate = result.expires_at ? new Date(result.expires_at) : null;
          const expiresText = expiresDate 
            ? `expired on ${expiresDate.toLocaleDateString()} at ${expiresDate.toLocaleTimeString()}`
            : "expired";
          setErrorMessage(`This login link has ${expiresText}. Please request a new link from Settings.`);
          return;
        }

        // Check if link is valid
        if (!result.link_valid) {
          setStatus("error");
          setErrorMessage("This login link is no longer valid. Please request a new link from Settings.");
          return;
        }

        // Store account info for confirmation dialog
        setLinkAccountHandle(result.handle);
        if (result.expires_at) {
          setLinkExpiresAt(new Date(result.expires_at));
        }

        // Show confirmation dialog with account info
        setStatus("confirming");
        setShowConfirmDialog(true);
      } catch (error) {
        console.error("Failed to preview login link", error);
        setStatus("error");
        const message =
          error instanceof Error
            ? error.message
            : "Failed to validate this login link. Please request a new one from Settings.";
        setErrorMessage(message);
      }
    };

    previewLink();
  }, [deviceId, token]);

  const handleConfirmLink = async () => {
    setShowConfirmDialog(false);
    
    // Ensure device ID is available before attempting redemption
    if (!deviceId) {
      setStatus("error");
      setErrorMessage("Device identification failed. Please refresh the page and try again.");
      return;
    }
    
    setStatus("redeeming");
    try {
      const { data, error } = await supabase.rpc("redeem_magic_login_link", { link_token: token });
      if (error) {
        // Create a proper Error object from Supabase error
        const errorMessage = error.message || error.details || error.hint || "Failed to redeem login link";
        const rpcError = new Error(errorMessage);
        // Preserve the original error object for better debugging
        (rpcError as any).originalError = error;
        throw rpcError;
      }

      const result = data?.[0];
      if (!result?.profile_id) {
        throw new Error("We couldn't find the account connected to this link.");
      }

      // Check if this is an admin account
      const { data: adminData } = await supabase
        .from("admins")
        .select("profile_id")
        .eq("profile_id", result.profile_id)
        .maybeSingle();
      
      setIsAdminAccount(!!adminData);

        // Create session for this profile
        // PERMANENTLY DISABLED until PostgREST cache refreshes
        const sessionCreationDisabled = typeof window !== "undefined" ? localStorage.getItem("disable_session_creation") === "true" : false;
        
        if (!sessionCreationDisabled) {
          try {
            const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : null;
            // Silently ignore 404 errors - function may not be visible to PostgREST yet
            const { data: sessionData, error: sessionError } = await supabase.rpc("create_session", {
            p_profile_id: result.profile_id,
            p_device_id: deviceId,
            p_user_agent: userAgent,
            p_duration_hours: 720, // 30 days
          });

          if (!sessionError && sessionData?.[0]?.session_token) {
            // Set cookie via edge function
            await setSessionCookie(sessionData[0].session_token);
          }
          // Silently ignore 404 errors (PostgREST cache issue)
          if (sessionError && (
            sessionError.code === "PGRST301" ||
            (sessionError as any)?.status === 404 ||
            sessionError.message?.includes("404") ||
            sessionError.message?.includes("not found") ||
            sessionError.message?.includes("does not exist")
          )) {
            // Completely silent - don't log 404 errors, but continue with redemption
          } else if (sessionError) {
            // Only log non-404 errors (non-critical, don't block redemption)
            console.warn("Failed to create session (non-critical):", sessionError);
          }
        } catch (sessionError: any) {
          // Silently ignore 404 errors (PostgREST cache issue)
          if (
            sessionError?.code === "PGRST301" ||
            sessionError?.status === 404 ||
            sessionError?.message?.includes("404") ||
            sessionError?.message?.includes("not found") ||
            sessionError?.message?.includes("does not exist")
          ) {
            // Completely silent - don't log 404 errors, but continue with redemption
          } else {
            // Only log non-404 errors (non-critical, don't block redemption)
          console.warn("Failed to create session (non-critical):", sessionError);
          }
        }
        }

      localStorage.setItem("profileId", result.profile_id);
      setProfileHandle(result.handle ?? null);
      setStatus("success");
      
      // Auto-redirect to home after a short delay
      setTimeout(() => {
        window.location.href = "/";
      }, 2000);
    } catch (error) {
      console.error("Login link redemption failed", error);
      let message = "Something went wrong while redeeming this link.";
      
      // Extract error message from various error object structures
      let errorMessage: string | null = null;
      
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (error && typeof error === 'object') {
        // Handle Supabase error objects
        const supabaseError = error as any;
        errorMessage = supabaseError.message || supabaseError.error?.message || supabaseError.details || supabaseError.hint || null;
      }
      
      if (errorMessage) {
        // Check for specific error messages from the database function
        const lowerMessage = errorMessage.toLowerCase();
        
        if (lowerMessage.includes("missing x-device-id header") || lowerMessage.includes("missing device")) {
          message = "Device identification failed. Please refresh the page and try again.";
        } else if (lowerMessage.includes("already been used") || lowerMessage.includes("already used")) {
          message = "This login link has already been used. Each link can only be used once. Please request a new link from Settings.";
        } else if (lowerMessage.includes("expired")) {
          message = "This login link has expired. Please request a new link from Settings.";
        } else if (lowerMessage.includes("not found") || lowerMessage.includes("invalid")) {
          message = "This login link is invalid or no longer exists. Please request a new link from Settings.";
        } else if (lowerMessage.includes("profile not found")) {
          message = "The account associated with this link no longer exists. Please request a new link from Settings.";
        } else if (lowerMessage.includes("login link not found")) {
          message = "This login link is invalid or no longer exists. Please request a new link from Settings.";
        } else {
          // Use the extracted error message if available, otherwise use generic
          message = errorMessage || message;
        }
      }
      
      setErrorMessage(message);
      setStatus("error");
    }
  };

  const handleCancelLink = () => {
    setShowConfirmDialog(false);
    navigate("/");
  };

  return (
    <>
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent className="rounded-3xl max-w-md">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-full bg-primary/10">
                <AlertTriangle className="h-6 w-6 text-primary" />
              </div>
              <AlertDialogTitle className="text-xl">Link this device?</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-left space-y-3 pt-2">
              {linkAccountHandle ? (
                <div className="rounded-xl bg-primary/5 dark:bg-primary/10 border border-primary/20 p-3 mb-3">
                  <p className="text-sm font-medium text-foreground mb-1">
                    You are linking to account:
                  </p>
                  <p className="text-lg font-semibold text-primary">
                    @{linkAccountHandle}
                  </p>
                  {linkExpiresAt && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Link expires: {linkExpiresAt.toLocaleDateString()} at {linkExpiresAt.toLocaleTimeString()}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  You are about to link this device to an Echo Garden account.
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                Once linked:
              </p>
              <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside ml-2">
                <li>This device will be able to access the account</li>
                <li>The device will appear in your account&apos;s device list</li>
                <li>You can manage or revoke access from Settings</li>
                <li className="font-medium text-foreground">This link can only be used once</li>
              </ul>
              <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 mt-4">
                <p className="text-xs font-medium text-amber-900 dark:text-amber-100 mb-1">
                  ⚠️ Important
                </p>
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  Only proceed if you trust this device and initiated the link from your account settings. Once used, this link cannot be used again.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel onClick={handleCancelLink} className="rounded-2xl">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmLink} className="rounded-2xl">
              Yes, link this device
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="min-h-screen bg-background px-4 py-12 flex items-center justify-center">
        <div className="max-w-md w-full space-y-6 text-center">
          {status === "checking" && (
            <>
              <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold">Checking link</h1>
                <p className="text-sm text-muted-foreground">
                  Verifying your login link...
                </p>
              </div>
            </>
          )}

          {status === "redeeming" && (
            <>
              <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold">Linking device</h1>
                <p className="text-sm text-muted-foreground">
                  Connecting this device to your Echo Garden account...
                </p>
              </div>
            </>
          )}

        {status === "success" && (
          <>
            <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold">Device linked successfully</h1>
              <p className="text-sm text-muted-foreground">
                {profileHandle
                  ? `Welcome back, ${profileHandle}! This device is now linked to your account.`
                  : "This device is now linked to your Echo Garden account."}
              </p>
              {isAdminAccount && (
                <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 mt-4">
                  <p className="text-xs font-medium text-amber-900 dark:text-amber-100">
                    ⚠️ Admin access granted
                  </p>
                  <p className="text-xs text-amber-800 dark:text-amber-200 mt-1">
                    This device now has admin access. You can manage devices in Settings.
                  </p>
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-4">
                This device will appear in your account&apos;s device list in Settings.
              </p>
            </div>
            <div className="flex justify-center gap-3">
              <Button asChild className="rounded-2xl">
                <Link to="/">Go to the feed</Link>
              </Button>
              <Button variant="outline" asChild className="rounded-2xl">
                <Link to="/settings">Open settings</Link>
              </Button>
            </div>
          </>
        )}

        {status === "error" && (
          <>
            <AlertCircle className="mx-auto h-10 w-10 text-destructive" />
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold">We couldn&apos;t use that link</h1>
              <p className="text-sm text-muted-foreground">
                {errorMessage ?? "The link may have expired. Request a new one from Settings."}
              </p>
            </div>
            <div className="flex justify-center gap-3">
              <Button asChild className="rounded-2xl">
                <Link to="/settings">Request a new link</Link>
              </Button>
              <Button variant="outline" asChild className="rounded-2xl">
                <Link to="/">Back home</Link>
              </Button>
            </div>
          </>
        )}
        </div>
      </div>
    </>
  );
};

export default LoginLink;


