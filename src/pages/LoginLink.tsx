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
  const [isAdminAccount, setIsAdminAccount] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const attemptRef = useRef(false);

  const token = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("token")?.trim() ?? "";
  }, [location.search]);

  useEffect(() => {
    if (attemptRef.current) return;
    if (!deviceId) return;
    attemptRef.current = true;

    if (!token) {
      setStatus("error");
      setErrorMessage("This login link is missing its token. Request a fresh link from your settings and try again.");
      return;
    }

    // Show confirmation dialog before linking
    setStatus("confirming");
    setShowConfirmDialog(true);
  }, [deviceId, token]);

  const handleConfirmLink = async () => {
    setShowConfirmDialog(false);
    setStatus("redeeming");
    try {
      const { data, error } = await supabase.rpc("redeem_magic_login_link", { link_token: token });
      if (error) throw error;

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
            // Completely silent - don't log 404 errors
            return;
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
            // Completely silent - don't log 404 errors
            return;
          }
          // Only log non-404 errors
          console.warn("Failed to create session (non-critical):", sessionError);
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
      const message =
        error instanceof Error
          ? error.message
          : "Something went wrong while redeeming this link. Please request a new one.";
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
              <p className="text-sm text-muted-foreground">
                You are about to link this device to an Echo Garden account. Once linked:
              </p>
              <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside ml-2">
                <li>This device will be able to access the account</li>
                <li>The device will appear in your account&apos;s device list</li>
                <li>You can manage or revoke access from Settings</li>
              </ul>
              <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 mt-4">
                <p className="text-xs font-medium text-amber-900 dark:text-amber-100 mb-1">
                  ⚠️ Important
                </p>
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  Only proceed if you trust this device and initiated the link from your account settings.
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


