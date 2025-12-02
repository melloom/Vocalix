import { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertCircle, CheckCircle2, Loader2, AlertTriangle, ArrowLeft, Lock, Smartphone, Shield, Link2, Key } from "lucide-react";

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
  const [linkMethod, setLinkMethod] = useState<"login-pin" | "linking-pin" | "login-link">("linking-pin");
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

    // Ensure device ID is available before validating
    if (!deviceId) {
      setErrorMessage("Device identification failed. Please refresh the page and try again.");
      setStatus("error");
      return;
    }

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

    try {
      // Set profileId in localStorage FIRST - this is critical
      localStorage.setItem("profileId", accountInfo.profile_id);

      // Create session for this profile (non-blocking, fire and forget)
      const sessionCreationDisabled =
        typeof window !== "undefined"
          ? localStorage.getItem("disable_session_creation") === "true"
          : false;

      if (!sessionCreationDisabled) {
          const userAgent =
            typeof navigator !== "undefined" ? navigator.userAgent : null;
        // Fire and forget - don't await or handle errors
        (supabase.rpc as any)(
            "create_session",
            {
              p_profile_id: accountInfo.profile_id,
              p_device_id: deviceId,
              p_user_agent: userAgent,
            p_duration_hours: 720,
          }
        ).then(({ data: sessionData, error: sessionError }: any) => {
          if (!sessionError && sessionData && Array.isArray(sessionData) && sessionData[0]?.session_token) {
            setSessionCookie(sessionData[0].session_token).catch(() => {});
          }
        }).catch(() => {});
      }

      // Trigger profile refetch (fire and forget)
      try {
        refetchProfile();
      } catch {}
      
      // Mark as unmounted to prevent any React updates
      isMountedRef.current = false;
      
      // Use requestAnimationFrame to ensure we're outside React's render cycle
      requestAnimationFrame(() => {
        // Double RAF to ensure we're completely outside React's reconciliation
        requestAnimationFrame(() => {
          try {
            // Navigate using replace - this is synchronous and immediate
            window.location.replace("/");
          } catch (navError) {
            // Fallback if replace fails
        window.location.href = "/";
          }
        });
      });
      
    } catch (error) {
      // If something fails before navigation, show error
      console.error("Account linking failed", error);
      setErrorMessage("Failed to link account. Please try again.");
      setStatus("error");
      setShowConfirmDialog(false);
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
    // Focus first input on mount (with delay for mobile to ensure keyboard appears)
    const timer = setTimeout(() => {
      // On mobile, ensure device ID is ready before focusing
      if (deviceId) {
        inputRefs.current[0]?.focus();
      }
    }, 300); // Longer delay on mobile to ensure everything is ready
    return () => clearTimeout(timer);
  }, [deviceId]);

  // Track mounted state and clear timeouts on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Clear any pending navigation timeouts
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
        navigationTimeoutRef.current = null;
      }
      // IMPORTANT: do NOT call setState here; React is unmounting this component.
      // Calling setStatus/setShowConfirmDialog during unmount can cause the
      // "removeChild" DOM error we keep seeing in production.
    };
  }, []);

  return (
    <>
      <AlertDialog 
        open={showConfirmDialog && isMountedRef.current} 
        onOpenChange={(open) => {
          if (isMountedRef.current) {
            setShowConfirmDialog(open);
          }
        }}
      >
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
              {/* Header */}
              <div className="space-y-4 mb-6">
                <div className="flex justify-center">
                  <div className="p-4 rounded-full bg-gradient-to-br from-red-900/40 to-amber-900/40 border border-red-800/30">
                    <Lock className="h-10 w-10 text-red-300" />
                  </div>
                </div>
                <h1 className="text-3xl font-extrabold text-white">Link Your Account</h1>
                <p className="text-sm text-gray-300">
                  Link this device to your existing Echo Garden account to access your profile, clips, and settings across all devices.
                </p>
              </div>

              {/* Tab Switcher - 3 options */}
              <div className="flex gap-2 p-1 rounded-2xl bg-red-950/40 border border-red-800/40 mb-6">
                <Button
                  variant={linkMethod === "login-pin" ? "default" : "ghost"}
                  className={`flex-1 rounded-xl text-xs ${linkMethod === "login-pin" ? "bg-red-600 hover:bg-red-700 text-white" : "hover:bg-red-950/40 text-gray-300"}`}
                  onClick={() => setLinkMethod("login-pin")}
                >
                  <Key className="mr-1 h-3 w-3" />
                  Login PIN
                </Button>
                <Button
                  variant={linkMethod === "linking-pin" ? "default" : "ghost"}
                  className={`flex-1 rounded-xl text-xs ${linkMethod === "linking-pin" ? "bg-red-600 hover:bg-red-700 text-white" : "hover:bg-red-950/40 text-gray-300"}`}
                  onClick={() => setLinkMethod("linking-pin")}
                >
                  <Key className="mr-1 h-3 w-3" />
                  Linking PIN
                </Button>
                <Button
                  variant={linkMethod === "login-link" ? "default" : "ghost"}
                  className={`flex-1 rounded-xl text-xs ${linkMethod === "login-link" ? "bg-red-600 hover:bg-red-700 text-white" : "hover:bg-red-950/40 text-gray-300"}`}
                  onClick={() => setLinkMethod("login-link")}
                >
                  <Link2 className="mr-1 h-3 w-3" />
                  Login Link
                </Button>
              </div>

              {/* Login PIN Tab Content - For Authentication */}
              {linkMethod === "login-pin" && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-red-900/50 dark:border-red-800/40 bg-gradient-to-br from-red-950/50 to-amber-950/50 p-4 text-left space-y-3">
                    <p className="text-sm text-gray-200 font-medium">
                      <strong className="text-white">Login with your handle and PIN</strong>
                    </p>
                    <p className="text-xs text-gray-300">
                      Use your personal login PIN (like a password) to sign in on any device. This is for <strong className="text-white">authentication</strong> - logging into your account.
                    </p>
                    <div className="flex items-start gap-2 pt-2 border-t border-red-800/30">
                      <Smartphone className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-gray-300">
                        Set your login PIN in <strong className="text-white">Settings → Account</strong>, then use it with your handle to log in.
                      </p>
                    </div>
                    <div className="flex items-start gap-2">
                      <Shield className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-gray-300">
                        Login PINs are personal and permanent (until you change them). They work like a password.
                      </p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <Button
                      asChild
                      className="w-full rounded-2xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white border-0"
                    >
                      <Link to="/login-pin">Go to Login with PIN Page</Link>
                    </Button>
                    <div className="rounded-xl bg-red-950/30 border border-red-800/30 p-3 text-left">
                      <p className="text-xs text-gray-300 mb-2">
                        <strong className="text-white">Forgot your PIN?</strong>
                      </p>
                      <div className="space-y-1">
                        <Link 
                          to="/reset-pin" 
                          className="block text-xs text-red-300 hover:text-red-200 underline underline-offset-2"
                        >
                          Reset your login PIN with recovery email
                        </Link>
                        <Link 
                          to="/request-magic-link" 
                          className="block text-xs text-red-300 hover:text-red-200 underline underline-offset-2"
                        >
                          Request a login link via email
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Linking PIN Tab Content - For Device Linking */}
              {linkMethod === "linking-pin" && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-red-900/50 dark:border-red-800/40 bg-gradient-to-br from-red-950/50 to-amber-950/50 p-4 text-left space-y-3">
                    <p className="text-sm text-gray-200 font-medium">
                      <strong className="text-white">Link this device to your account</strong>
                    </p>
                    <p className="text-xs text-gray-300">
                      Use a temporary linking PIN to connect this device to your account. This is for <strong className="text-white">device linking</strong> - adding this device to your account.
                    </p>
                    <div className="flex items-start gap-2 pt-2 border-t border-red-800/30">
                      <Smartphone className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-gray-300">
                        Generate a 4-digit linking PIN from <strong className="text-white">Settings → Account</strong> on your other device, then enter it here.
                      </p>
                    </div>
                    <div className="flex items-start gap-2">
                      <Shield className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-gray-300">
                        Linking PINs expire after 10 minutes and can only be used once for security.
                      </p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <h2 className="text-xl font-bold text-white">Enter Linking PIN</h2>
                      <p className="text-sm text-gray-300">
                        Enter the 4-digit linking PIN from your other device
                      </p>
                    </div>
                    <div className="flex justify-center gap-3" onPaste={handlePaste}>
                      {pin.map((digit, index) => (
                        <Input
                          key={index}
                          ref={(el) => (inputRefs.current[index] = el)}
                          type="tel"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={1}
                          value={digit}
                          onChange={(e) => handlePinChange(index, e.target.value)}
                          onKeyDown={(e) => handleKeyDown(index, e)}
                          className="w-16 h-16 text-center text-2xl font-mono font-bold rounded-2xl border-2 border-red-800/40 bg-red-950/30 text-white focus:border-red-500 focus:ring-2 focus:ring-red-500/20 touch-manipulation"
                          autoComplete="one-time-code"
                        />
                      ))}
                    </div>
                    {errorMessage && (
                      <div className="rounded-xl bg-red-950/50 border border-red-800/50 p-3">
                        <p className="text-sm text-red-200 font-medium">{errorMessage}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Login Link Tab Content - Works for both login and device linking */}
              {linkMethod === "login-link" && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-red-900/50 dark:border-red-800/40 bg-gradient-to-br from-red-950/50 to-amber-950/50 p-4 text-left space-y-3">
                    <p className="text-sm text-gray-200 font-medium">
                      <strong className="text-white">Use a magic login link</strong>
                    </p>
                    <p className="text-xs text-gray-300">
                      A login link can be used to <strong className="text-white">log in</strong> or <strong className="text-white">link this device</strong> to your account. Generate a link from your other device and open it here.
                    </p>
                    <div className="space-y-3 pt-2 border-t border-red-800/30">
                      <div className="flex items-start gap-2">
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center text-xs font-bold mt-0.5">1</div>
                        <p className="text-xs text-gray-300">
                          On your other device, go to <strong className="text-white">Settings → Account</strong>
                        </p>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center text-xs font-bold mt-0.5">2</div>
                        <p className="text-xs text-gray-300">
                          Click <strong className="text-white">"Send link"</strong> in the Device Linking section
                        </p>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center text-xs font-bold mt-0.5">3</div>
                        <p className="text-xs text-gray-300">
                          Choose a link type and click <strong className="text-white">"Generate link"</strong>
                        </p>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center text-xs font-bold mt-0.5">4</div>
                        <p className="text-xs text-gray-300">
                          Copy the link or scan the QR code, then open it on <strong className="text-white">this device</strong>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 pt-2 border-t border-red-800/30">
                      <Shield className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-gray-300">
                        Login links expire after 7 days (or 1 hour for quick share) and can only be used once for security.
                      </p>
                    </div>
                  </div>
                  <div className="rounded-xl bg-red-950/30 border border-red-800/30 p-4 space-y-3">
                    <div>
                      <p className="text-sm text-gray-200 font-medium mb-2">💡 Don't have a login link yet?</p>
                      <p className="text-xs text-gray-300">
                        Generate one from your other device's Settings → Account page, then come back here and open the link on this device.
                      </p>
                    </div>
                    <div className="pt-2 border-t border-red-800/30">
                      <p className="text-xs text-gray-300 mb-2">
                        <strong className="text-white">Can't access your other device?</strong>
                      </p>
                      <div className="space-y-1.5">
                        <Link 
                          to="/request-magic-link" 
                          className="block text-xs text-red-300 hover:text-red-200 underline underline-offset-2"
                        >
                          Request a login link via email
                        </Link>
                        <Link 
                          to="/reset-pin" 
                          className="block text-xs text-red-300 hover:text-red-200 underline underline-offset-2"
                        >
                          Reset your login PIN
                        </Link>
                        <Link 
                          to="/login-pin" 
                          className="block text-xs text-red-300 hover:text-red-200 underline underline-offset-2"
                        >
                          Try logging in with handle + PIN
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              )}
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
              <div className="space-y-3">
                <div className="rounded-xl bg-red-950/30 border border-red-800/30 p-4 text-left">
                  <p className="text-xs font-medium text-white mb-2">🔐 Account Recovery Options</p>
                  <div className="space-y-2">
                    <p className="text-xs text-gray-300">
                      <strong className="text-white">Forgot your PIN?</strong> You can recover your account:
                    </p>
                    <ul className="text-xs text-gray-300 space-y-1.5 list-disc list-inside ml-2">
                      <li>
                        <Link to="/reset-pin" className="underline underline-offset-2 text-red-300 hover:text-red-200">
                          Reset your login PIN
                        </Link>{" "}
                        with your recovery email
                      </li>
                      <li>
                        <Link to="/request-magic-link" className="underline underline-offset-2 text-red-300 hover:text-red-200">
                          Request a login link
                        </Link>{" "}
                        via email
                      </li>
                      <li>
                        <Link to="/login-pin" className="underline underline-offset-2 text-red-300 hover:text-red-200">
                          Try logging in with your handle + PIN
                        </Link>
                      </li>
                    </ul>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row justify-center gap-3">
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
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default LinkPin;

