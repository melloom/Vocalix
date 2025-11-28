import { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertCircle, CheckCircle2, Loader2, AlertTriangle, Key } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

type PinStatus = "entering" | "validating" | "confirming" | "redeeming" | "success" | "error";

const LinkPin = () => {
  const navigate = useNavigate();
  const deviceId = useDeviceId();
  const [status, setStatus] = useState<PinStatus>("entering");
  const [pin, setPin] = useState(["", "", "", ""]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [profileHandle, setProfileHandle] = useState<string | null>(null);
  const [isAdminAccount, setIsAdminAccount] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [accountInfo, setAccountInfo] = useState<{ profile_id: string; handle: string } | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

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

    setStatus("validating");
    setErrorMessage(null);

    try {
      // @ts-ignore - Function exists but not in generated types
      const { data, error } = await (supabase.rpc as any)("redeem_account_link_pin", {
        p_pin_code: pinCode,
      });

      if (error) throw error;

      const result = data?.[0];
      if (!result) {
        throw new Error("Invalid PIN");
      }

      if (!result.success) {
        setErrorMessage(result.message || "Invalid or expired PIN");
        setStatus("error");
        // Clear PIN on error
        setPin(["", "", "", ""]);
        inputRefs.current[0]?.focus();
        return;
      }

      // Store account info for confirmation
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

      setIsAdminAccount(!!adminData);

      // Show confirmation dialog
      setStatus("confirming");
      setShowConfirmDialog(true);
    } catch (error) {
      console.error("PIN validation failed", error);
      const message =
        error instanceof Error
          ? error.message
          : "Failed to validate PIN. Please try again.";
      setErrorMessage(message);
      setStatus("error");
      setPin(["", "", "", ""]);
      inputRefs.current[0]?.focus();
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
          // @ts-ignore
          const { data: sessionData, error: sessionError } = await supabase.rpc(
            "create_session",
            {
              p_profile_id: accountInfo.profile_id,
              p_device_id: deviceId,
              p_user_agent: userAgent,
              p_duration_hours: 720, // 30 days
            }
          );

          if (!sessionError && sessionData?.[0]?.session_token) {
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
      setStatus("success");

      // Auto-redirect to home after a short delay
      setTimeout(() => {
        window.location.href = "/";
      }, 2000);
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
    inputRefs.current[0]?.focus();
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

      <div className="min-h-screen bg-background px-4 py-12 flex items-center justify-center">
        <div className="max-w-md w-full space-y-6 text-center">
          {status === "entering" && (
            <>
              <div className="flex justify-center">
                <div className="p-4 rounded-full bg-primary/10">
                  <Key className="h-10 w-10 text-primary" />
                </div>
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold">Enter PIN</h1>
                <p className="text-sm text-muted-foreground">
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
                    className="w-16 h-16 text-center text-2xl font-mono font-bold rounded-2xl"
                  />
                ))}
              </div>
              {errorMessage && (
                <p className="text-sm text-destructive">{errorMessage}</p>
              )}
            </>
          )}

          {status === "validating" && (
            <>
              <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold">Validating PIN</h1>
                <p className="text-sm text-muted-foreground">
                  Checking your PIN...
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
                <h1 className="text-2xl font-semibold">Invalid PIN</h1>
                <p className="text-sm text-muted-foreground">
                  {errorMessage ?? "The PIN may have expired or is incorrect. Please request a new PIN from Settings."}
                </p>
              </div>
              <div className="flex justify-center gap-3">
                <Button
                  onClick={() => {
                    setStatus("entering");
                    setPin(["", "", "", ""]);
                    setErrorMessage(null);
                    inputRefs.current[0]?.focus();
                  }}
                  className="rounded-2xl"
                >
                  Try Again
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

export default LinkPin;

