import { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertCircle, CheckCircle2, Loader2, AlertTriangle, ArrowLeft, Lock, Smartphone, Shield } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase, setSessionCookie } from "@/integrations/supabase/client";
import { useDeviceId } from "@/hooks/useDeviceId";
import { useAuth } from "@/context/AuthContext";
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

type PinStatus = "entering" | "validating" | "confirming" | "redeeming" | "success" | "error";

const LinkPin = () => {
  const navigate = useNavigate();
  const deviceId = useDeviceId();
  const { refetchProfile } = useAuth();
  const [status, setStatus] = useState<PinStatus>("entering");
  const [pin, setPin] = useState(["", "", "", ""]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [profileHandle, setProfileHandle] = useState<string | null>(null);
  const [isAdminAccount, setIsAdminAccount] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [accountInfo, setAccountInfo] = useState<{ profile_id: string; handle: string } | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const isMountedRef = useRef(true);
  const navigationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handlePinChange = (index: number, value: string) => {
    // Only allow digits
    if (value && !/^\d$/.test(value)) return;

    const newPin = [...pin];
    newPin[index] = value;
    setPin(newPin);

    // Auto-focus next input
    if (value && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-validate when all 4 digits are entered
    if (newPin.every((digit) => digit !== "") && newPin.join("").length === 4) {
      validatePin(newPin.join(""));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !pin[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").trim();
    if (/^\d{4}$/.test(pasted)) {
      const digits = pasted.split("");
      setPin(digits);
      validatePin(pasted);
    }
  };

  const validatePin = async (pinCode: string) => {
    if (pinCode.length !== 4) return;
    if (!isMountedRef.current) return;

    setStatus("validating");
    setErrorMessage(null);

    try {
      // @ts-ignore - Function exists but not in generated types
      const { data, error } = await (supabase.rpc as any)("redeem_account_link_pin", {
        p_pin_code: pinCode,
      });

      if (!isMountedRef.current) return; // Check again after async operation

      if (error) throw error;

      const result = data?.[0];
      if (!result) {
        throw new Error("Invalid PIN");
      }

      if (!result.success) {
        if (!isMountedRef.current) return;
        setErrorMessage(result.message || "Invalid or expired PIN");
        setStatus("error");
        // Clear PIN on error
        setPin(["", "", "", ""]);
        requestAnimationFrame(() => {
          inputRefs.current[0]?.focus();
        });
        return;
      }

      // Store account info for confirmation
      if (!isMountedRef.current) return;
      setAccountInfo({
        profile_id: result.profile_id,
        handle: result.handle,
      });

      // Check if this is an admin account
      const { data: adminData } = await supabase
        .from("admins")
        .select("profile_id")
        .eq("profile_id", result.profile_id)
        .maybeSingle();

      if (!isMountedRef.current) return;
      setIsAdminAccount(!!adminData);

      // Show confirmation dialog
      setStatus("confirming");
      setShowConfirmDialog(true);
    } catch (error) {
      if (!isMountedRef.current) return;
      console.error("PIN validation failed", error);
      const message =
        error instanceof Error
          ? error.message
          : "Failed to validate PIN. Please try again.";
      setErrorMessage(message);
      setStatus("error");
      setPin(["", "", "", ""]);
      requestAnimationFrame(() => {
        inputRefs.current[0]?.focus();
      });
    }
  };

  const handleConfirmLink = async () => {
    if (!accountInfo) return;

    setShowConfirmDialog(false);
    setStatus("redeeming");

    try {
      // Create session for this profile
      const sessionCreationDisabled =
        typeof window !== "undefined"
          ? localStorage.getItem("disable_session_creation") === "true"
          : false;

      if (!sessionCreationDisabled) {
        try {
          const userAgent =
            typeof navigator !== "undefined" ? navigator.userAgent : null;
          // @ts-ignore - Function exists but not in generated types
          const { data: sessionData, error: sessionError } = await (supabase.rpc as any)(
            "create_session",
            {
              p_profile_id: accountInfo.profile_id,
              p_device_id: deviceId,
              p_user_agent: userAgent,
              p_duration_hours: 720, // 30 days
            }
          );

          if (!sessionError && sessionData && Array.isArray(sessionData) && sessionData[0]?.session_token) {
            await setSessionCookie(sessionData[0].session_token);
          }
        } catch (sessionError: any) {
          if (
            sessionError?.code === "PGRST301" ||
            sessionError?.status === 404 ||
            sessionError?.message?.includes("404") ||
            sessionError?.message?.includes("not found") ||
            sessionError?.message?.includes("does not exist")
          ) {
            return;
          }
          console.warn("Failed to create session (non-critical):", sessionError);
        }
      }

      localStorage.setItem("profileId", accountInfo.profile_id);
      setProfileHandle(accountInfo.handle);
      
      // Trigger profile refetch so AuthContext picks up the new profile
      try {
        refetchProfile();
      } catch (refetchError) {
        console.warn("Failed to refetch profile (non-critical):", refetchError);
      }
      
      // Don't set status to success - navigate immediately to avoid React DOM errors
      // The full page reload will handle the success state on the next page
      if (!isMountedRef.current) return;
      
      // Clear any pending timeouts
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
        navigationTimeoutRef.current = null;
      }
      
      // Navigate immediately with a small delay to ensure localStorage is set
      // Use window.location.href for a clean full page reload
      setTimeout(() => {
        // Double-check we're still mounted (though we're about to navigate away)
        if (isMountedRef.current) {
          window.location.href = "/";
        }
      }, 100);
    } catch (error) {
      console.error("Account linking failed", error);
      setErrorMessage("Failed to link account. Please try again.");
      setStatus("error");
    }
  };

  const handleCancelLink = () => {
    setShowConfirmDialog(false);
    setStatus("entering");
    setPin(["", "", "", ""]);
    setAccountInfo(null);
    inputRefs.current[0]?.focus();
  };

  useEffect(() => {
    // Focus first input on mount
    const timer = setTimeout(() => {
      inputRefs.current[0]?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Cleanup on unmount to prevent DOM errors
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Clear any pending navigation timeouts
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
        navigationTimeoutRef.current = null;
      }
    };
  }, []);

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
              {accountInfo?.handle && (
                <div className="rounded-xl bg-primary/5 dark:bg-primary/10 border border-primary/20 p-3 mb-3">
                  <p className="text-sm font-medium text-foreground mb-1">
                    You are linking to account:
                  </p>
                  <p className="text-lg font-semibold text-primary">@{accountInfo.handle}</p>
                </div>
              )}
              <p className="text-sm text-muted-foreground">
                Once linked:
              </p>
              <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside ml-2">
                <li>This device will be able to access the account</li>
                <li>The device will appear in your account&apos;s device list</li>
                <li>You can manage or revoke access from Settings</li>
                <li className="font-medium text-foreground">This PIN can only be used once</li>
              </ul>
              <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 mt-4">
                <p className="text-xs font-medium text-amber-900 dark:text-amber-100 mb-1">
                  ⚠️ Important
                </p>
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  Only proceed if you trust this device and generated the PIN from your account settings. Once used, this PIN cannot be used again.
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

      <div className="min-h-screen bg-gradient-to-br from-red-950 via-amber-950 to-red-950 dark:from-red-950 dark:via-amber-950 dark:to-red-950 px-4 py-12 flex items-center justify-center relative">
        {/* Background decorations */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-red-500/10 blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full bg-amber-500/10 blur-3xl" />
        </div>

        {/* Back Button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            if (window.history.length > 1) {
              navigate(-1);
            } else {
              navigate("/");
            }
          }}
          className="absolute top-4 left-4 rounded-full hover:bg-red-950/40 text-white border border-red-800/30 z-10"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        
        <div className="max-w-md w-full space-y-6 text-center relative z-10">
          {status === "entering" && (
            <>
              {/* Header with explanation */}
              <div className="space-y-4 mb-8">
                <div className="flex justify-center">
                  <div className="p-4 rounded-full bg-gradient-to-br from-red-900/40 to-amber-900/40 border border-red-800/30">
                    <Lock className="h-10 w-10 text-red-300" />
                  </div>
                </div>
                <div className="space-y-3">
                  <h1 className="text-3xl font-extrabold text-white">Link Your Account</h1>
                  <div className="rounded-2xl border border-red-900/50 dark:border-red-800/40 bg-gradient-to-br from-red-950/50 to-amber-950/50 p-4 text-left space-y-2">
                    <p className="text-sm text-gray-200 font-medium">
                      <strong className="text-white">What is account linking?</strong>
                    </p>
                    <p className="text-xs text-gray-300 leading-relaxed">
                      Link this device to your existing Echo Garden account. You&apos;ll access the same profile, clips, and settings across all your devices. Perfect for using the app on your phone, tablet, and computer.
                    </p>
                    <div className="flex items-start gap-2 pt-2 border-t border-red-800/30">
                      <Smartphone className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-gray-300">
                        Generate a 4-digit PIN from <strong className="text-white">Settings → Account</strong> on your other device, then enter it here.
                      </p>
                    </div>
                    <div className="flex items-start gap-2">
                      <Shield className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-gray-300">
                        PINs expire after 10 minutes and can only be used once for security.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <h2 className="text-xl font-bold text-white">Enter Your PIN</h2>
                  <p className="text-sm text-gray-300">
                    Enter the 4-digit PIN from your other device
                  </p>
                </div>
                <div className="flex justify-center gap-3" onPaste={handlePaste}>
                  {pin.map((digit, index) => (
                    <Input
                      key={index}
                      ref={(el) => (inputRefs.current[index] = el)}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handlePinChange(index, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(index, e)}
                      className="w-16 h-16 text-center text-2xl font-mono font-bold rounded-2xl border-2 border-red-800/40 bg-red-950/30 text-white focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
                    />
                  ))}
                </div>
                {errorMessage && (
                  <div className="rounded-xl bg-red-950/50 border border-red-800/50 p-3">
                    <p className="text-sm text-red-200 font-medium">{errorMessage}</p>
                  </div>
                )}
              </div>
            </>
          )}

          {status === "validating" && (
            <>
              <div className="flex justify-center">
                <div className="p-4 rounded-full bg-gradient-to-br from-red-900/40 to-amber-900/40 border border-red-800/30">
                  <Loader2 className="h-10 w-10 animate-spin text-red-300" />
                </div>
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-bold text-white">Validating PIN</h1>
                <p className="text-sm text-gray-300">
                  Checking your PIN...
                </p>
              </div>
            </>
          )}

          {status === "redeeming" && (
            <>
              <div className="flex justify-center">
                <div className="p-4 rounded-full bg-gradient-to-br from-red-900/40 to-amber-900/40 border border-red-800/30">
                  <Loader2 className="h-10 w-10 animate-spin text-red-300" />
                </div>
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-bold text-white">Linking Device</h1>
                <p className="text-sm text-gray-300">
                  Connecting this device to your Echo Garden account...
                </p>
              </div>
            </>
          )}

          {status === "success" && (
            <>
              <div className="flex justify-center">
                <div className="p-4 rounded-full bg-gradient-to-br from-green-900/40 to-emerald-900/40 border border-green-800/30">
                  <CheckCircle2 className="h-10 w-10 text-green-300" />
                </div>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <h1 className="text-3xl font-extrabold text-white">Device Linked!</h1>
                  <p className="text-sm text-gray-200 font-medium">
                    {profileHandle
                      ? `Welcome back, @${profileHandle}!`
                      : "Success!"}
                  </p>
                  <p className="text-sm text-gray-300">
                    This device is now linked to your Echo Garden account. You can access your profile, clips, and settings from here.
                  </p>
                </div>
                {isAdminAccount && (
                  <div className="rounded-xl bg-amber-950/50 border border-amber-800/50 p-3">
                    <p className="text-xs font-medium text-amber-200">
                      ⚠️ Admin access granted
                    </p>
                    <p className="text-xs text-amber-300 mt-1">
                      This device now has admin access. You can manage devices in Settings.
                    </p>
                  </div>
                )}
                <div className="rounded-xl bg-red-950/30 border border-red-800/30 p-3">
                  <p className="text-xs text-gray-300">
                    This device will appear in your account&apos;s device list in Settings. You can manage or revoke access anytime.
                  </p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row justify-center gap-3 pt-4">
                <Button asChild className="rounded-2xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white border-0">
                  <Link to="/">Go to Feed</Link>
                </Button>
                <Button variant="outline" asChild className="rounded-2xl border-red-800/40 bg-red-950/20 text-white hover:bg-red-950/40">
                  <Link to="/settings">Open Settings</Link>
                </Button>
              </div>
            </>
          )}

          {status === "error" && (
            <>
              <div className="flex justify-center">
                <div className="p-4 rounded-full bg-red-950/50 border border-red-800/50">
                  <AlertCircle className="h-10 w-10 text-red-400" />
                </div>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <h1 className="text-2xl font-bold text-white">Invalid PIN</h1>
                  <div className="rounded-xl bg-red-950/50 border border-red-800/50 p-3">
                    <p className="text-sm text-red-200">
                      {errorMessage ?? "The PIN may have expired or is incorrect. Please request a new PIN from Settings."}
                    </p>
                  </div>
                </div>
                <div className="rounded-xl bg-red-950/30 border border-red-800/30 p-3 text-left">
                  <p className="text-xs font-medium text-white mb-1">💡 Need help?</p>
                  <ul className="text-xs text-gray-300 space-y-1 list-disc list-inside">
                    <li>PINs expire after 10 minutes</li>
                    <li>Each PIN can only be used once</li>
                    <li>Generate a new PIN from Settings → Account</li>
                  </ul>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row justify-center gap-3 pt-4">
                <Button
                  onClick={() => {
                    setStatus("entering");
                    setPin(["", "", "", ""]);
                    setErrorMessage(null);
                    inputRefs.current[0]?.focus();
                  }}
                  className="rounded-2xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white border-0"
                >
                  Try Again
                </Button>
                <Button variant="outline" asChild className="rounded-2xl border-red-800/40 bg-red-950/20 text-white hover:bg-red-950/40">
                  <Link to="/">Back Home</Link>
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default LinkPin;

