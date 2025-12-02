import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, CheckCircle2, Loader2, Lock, Mail, ArrowLeft, Key } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type ResetStatus = 
  | "request" 
  | "requesting" 
  | "email-sent" 
  | "reset" 
  | "resetting" 
  | "success" 
  | "error";

const ResetPin = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const [status, setStatus] = useState<ResetStatus>("request");
  const [handle, setHandle] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Check if we have token and handle from URL (from email link)
  useEffect(() => {
    const urlHandle = searchParams.get("handle");
    const urlToken = searchParams.get("token");
    
    if (urlHandle && urlToken) {
      setHandle(urlHandle);
      setResetToken(urlToken);
      setStatus("reset");
    }
  }, [searchParams]);

  const normalizedHandle = handle.trim().replace(/^@+/, "");

  const handleRequestReset = async () => {
    if (!normalizedHandle) {
      setErrorMessage("Please enter your handle.");
      return;
    }

    if (!recoveryEmail.trim()) {
      setErrorMessage("Please enter your recovery email address.");
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(recoveryEmail.trim())) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }

    setStatus("requesting");
    setErrorMessage(null);

    try {
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${SUPABASE_URL}/functions/v1/send-pin-reset-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          handle: normalizedHandle,
          recovery_email: recoveryEmail.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to send reset email");
      }

      setStatus("email-sent");
    } catch (err: any) {
      console.error("Failed to request reset", err);
      setErrorMessage(
        err?.message || 
        "Failed to send reset email. Please check your handle and email address, then try again."
      );
      setStatus("error");
    }
  };

  const handleResetPin = async () => {
    if (!normalizedHandle || normalizedHandle.length === 0) {
      setErrorMessage("Please enter your handle.");
      return;
    }

    if (!resetToken.trim()) {
      setErrorMessage("Please enter the reset token from your email.");
      return;
    }

    if (!newPin.trim()) {
      setErrorMessage("Please enter a new PIN.");
      return;
    }

    // Validate PIN
    if (newPin.length < 4 || newPin.length > 8) {
      setErrorMessage("PIN must be between 4 and 8 digits.");
      return;
    }

    if (!/^\d+$/.test(newPin)) {
      setErrorMessage("PIN must contain only numbers.");
      return;
    }

    if (newPin !== confirmPin) {
      setErrorMessage("PINs do not match. Please try again.");
      return;
    }

    setStatus("resetting");
    setErrorMessage(null);

    try {
      // Verify token and get profile ID
      const { data: profileId, error: verifyError } = await (supabase.rpc as any)(
        "verify_pin_reset_token",
        {
          p_handle: normalizedHandle,
          p_token: resetToken.trim(),
        }
      );

      if (verifyError) {
        throw verifyError;
      }

      if (!profileId) {
        setErrorMessage("Invalid or expired reset token. Please request a new one.");
        setStatus("error");
        return;
      }

      // Reset PIN using token
      const { data: success, error: resetError } = await (supabase.rpc as any)(
        "reset_pin_with_token",
        {
          p_profile_id: profileId,
          p_token: resetToken.trim(),
          p_new_pin: newPin,
        }
      );

      if (resetError) {
        throw resetError;
      }

      if (!success) {
        setErrorMessage("Failed to reset PIN. The token may be invalid or expired.");
        setStatus("error");
        return;
      }

      setStatus("success");
      toast.success("PIN reset successfully! You can now log in with your new PIN.");

      // Redirect to login after 2 seconds
      setTimeout(() => {
        navigate("/login-pin");
      }, 2000);
    } catch (err: any) {
      console.error("Failed to reset PIN", err);
      setErrorMessage(
        err?.message || 
        "Failed to reset PIN. Please check your token and try again."
      );
      setStatus("error");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-10 flex items-center justify-center relative">
      {/* Back Button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => {
          if (window.history.length > 1) {
            navigate(-1);
          } else {
            navigate("/login-pin");
          }
        }}
        className="absolute top-4 left-4 rounded-full hover:bg-slate-900/60 text-slate-100 border border-slate-800/40 z-10"
        aria-label="Go back"
      >
        <ArrowLeft className="h-5 w-5" />
      </Button>

      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 -left-40 w-80 h-80 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-80 h-80 rounded-full bg-indigo-500/10 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md space-y-6 text-center">
        {/* Request Reset Form */}
        {(status === "request" || status === "error") && (
          <>
            <div className="space-y-4">
              <div className="flex justify-center">
                <div className="p-4 rounded-full bg-slate-900/60 border border-slate-700/60">
                  <Mail className="h-10 w-10 text-sky-300" />
                </div>
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-bold text-slate-50">Reset Your Login PIN</h1>
                <p className="text-sm text-slate-300">
                  Enter your handle and recovery email address. We'll send you a reset link.
                </p>
              </div>
            </div>

            <div className="space-y-4 mt-4">
              <div className="space-y-2 text-left">
                <Label className="text-xs font-medium text-slate-200 flex items-center gap-2">
                  <Lock className="h-4 w-4 text-slate-300" />
                  Echo Garden name
                </Label>
                <Input
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  placeholder="@vibesonly"
                  autoComplete="username"
                  className="rounded-2xl bg-slate-900/60 border-slate-700/70 text-slate-50 placeholder:text-slate-500"
                />
              </div>

              <div className="space-y-2 text-left">
                <Label className="text-xs font-medium text-slate-200 flex items-center gap-2">
                  <Mail className="h-4 w-4 text-slate-300" />
                  Recovery Email
                </Label>
                <Input
                  type="email"
                  value={recoveryEmail}
                  onChange={(e) => setRecoveryEmail(e.target.value)}
                  placeholder="your.email@example.com"
                  autoComplete="email"
                  className="rounded-2xl bg-slate-900/60 border-slate-700/70 text-slate-50 placeholder:text-slate-500"
                />
                <p className="text-xs text-slate-400">
                  This should be the email address you set up in Settings → Security → Email Recovery.
                </p>
              </div>

              {errorMessage && (
                <div className="flex items-start gap-2 rounded-2xl bg-red-950/50 border border-red-800/60 p-3 text-left">
                  <AlertCircle className="h-4 w-4 text-red-300 mt-0.5" />
                  <p className="text-sm text-red-100">{errorMessage}</p>
                </div>
              )}

              <Button
                className="w-full rounded-2xl bg-sky-600 hover:bg-sky-700 text-white"
                disabled={status === "requesting" || !normalizedHandle || !recoveryEmail.trim()}
                onClick={handleRequestReset}
              >
                {status === "requesting" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending reset email…
                  </>
                ) : (
                  "Send Reset Email"
                )}
              </Button>

              <p className="text-xs text-slate-400">
                Remember your PIN?{" "}
                <Link to="/login-pin" className="underline underline-offset-2 text-sky-400">
                  Sign in instead
                </Link>
              </p>
            </div>
          </>
        )}

        {/* Requesting State */}
        {status === "requesting" && (
          <div className="space-y-4">
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-sky-300" />
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-slate-50">Sending reset email…</h1>
              <p className="text-sm text-slate-300">
                Please wait while we send the reset link to your email.
              </p>
            </div>
          </div>
        )}

        {/* Email Sent State */}
        {status === "email-sent" && (
          <div className="space-y-4">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-300" />
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-slate-50">Check your email</h1>
              <p className="text-sm text-slate-300">
                We've sent a reset link to <strong>{recoveryEmail}</strong>. 
                Click the link in the email to reset your PIN.
              </p>
              <p className="text-xs text-slate-400 mt-4">
                Didn't receive the email? Check your spam folder or{" "}
                <button
                  onClick={() => {
                    setStatus("request");
                    setErrorMessage(null);
                  }}
                  className="underline underline-offset-2 text-sky-400"
                >
                  try again
                </button>
                .
              </p>
            </div>
          </div>
        )}

        {/* Reset PIN Form (from email link) */}
        {(status === "reset" || (status === "error" && resetToken)) && (
          <>
            <div className="space-y-4">
              <div className="flex justify-center">
                <div className="p-4 rounded-full bg-slate-900/60 border border-slate-700/60">
                  <Key className="h-10 w-10 text-sky-300" />
                </div>
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-bold text-slate-50">Set New PIN</h1>
                <p className="text-sm text-slate-300">
                  Enter a new 4-8 digit PIN for your account.
                </p>
              </div>
            </div>

            <div className="space-y-4 mt-4">
              <div className="space-y-2 text-left">
                <Label className="text-xs font-medium text-slate-200 flex items-center gap-2">
                  <Lock className="h-4 w-4 text-slate-300" />
                  Echo Garden name
                </Label>
                <Input
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  placeholder="@vibesonly"
                  autoComplete="username"
                  className="rounded-2xl bg-slate-900/60 border-slate-700/70 text-slate-50 placeholder:text-slate-500"
                />
              </div>
              
              <div className="space-y-2 text-left">
                <Label className="text-xs font-medium text-slate-200">
                  Reset Token
                </Label>
                <Input
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                  placeholder="Token from email"
                  className="rounded-2xl bg-slate-900/60 border-slate-700/70 text-slate-50 placeholder:text-slate-500 font-mono text-sm"
                />
                <p className="text-xs text-slate-400">
                  Find this token in the reset email we sent you.
                </p>
              </div>

              <div className="space-y-2 text-left">
                <Label className="text-xs font-medium text-slate-200">
                  New PIN (4-8 digits)
                </Label>
                <Input
                  type="tel"
                  value={newPin}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, "").slice(0, 8);
                    setNewPin(value);
                  }}
                  placeholder="1234"
                  maxLength={8}
                  className="rounded-2xl bg-slate-900/60 border-slate-700/70 text-slate-50 placeholder:text-slate-500 font-mono"
                />
              </div>

              <div className="space-y-2 text-left">
                <Label className="text-xs font-medium text-slate-200">
                  Confirm New PIN
                </Label>
                <Input
                  type="tel"
                  value={confirmPin}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, "").slice(0, 8);
                    setConfirmPin(value);
                  }}
                  placeholder="1234"
                  maxLength={8}
                  className="rounded-2xl bg-slate-900/60 border-slate-700/70 text-slate-50 placeholder:text-slate-500 font-mono"
                />
              </div>

              {errorMessage && (
                <div className="flex items-start gap-2 rounded-2xl bg-red-950/50 border border-red-800/60 p-3 text-left">
                  <AlertCircle className="h-4 w-4 text-red-300 mt-0.5" />
                  <p className="text-sm text-red-100">{errorMessage}</p>
                </div>
              )}

              <Button
                className="w-full rounded-2xl bg-sky-600 hover:bg-sky-700 text-white"
                disabled={
                  status === "resetting" ||
                  !normalizedHandle ||
                  !resetToken.trim() ||
                  !newPin ||
                  newPin.length < 4 ||
                  newPin !== confirmPin
                }
                onClick={handleResetPin}
              >
                {status === "resetting" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Resetting PIN…
                  </>
                ) : (
                  "Reset PIN"
                )}
              </Button>
            </div>
          </>
        )}

        {/* Resetting State */}
        {status === "resetting" && (
          <div className="space-y-4">
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-sky-300" />
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-slate-50">Resetting your PIN…</h1>
              <p className="text-sm text-slate-300">
                Please wait while we update your account.
              </p>
            </div>
          </div>
        )}

        {/* Success State */}
        {status === "success" && (
          <div className="space-y-4">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-300" />
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-slate-50">PIN Reset Successful!</h1>
              <p className="text-sm text-slate-300">
                Your login PIN has been reset. Redirecting you to login...
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ResetPin;

