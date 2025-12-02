import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertCircle, CheckCircle2, Loader2, Mail, ArrowLeft, LinkIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type RequestStatus = 
  | "request" 
  | "requesting" 
  | "email-sent" 
  | "error";

const RequestMagicLink = () => {
  const navigate = useNavigate();
  
  const [status, setStatus] = useState<RequestStatus>("request");
  const [handle, setHandle] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const normalizedHandle = handle.trim().replace(/^@+/, "");

  const handleRequestLink = async () => {
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
      const response = await fetch(`${SUPABASE_URL}/functions/v1/send-magic-link-email`, {
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
        throw new Error(data.error || "Failed to send login link");
      }

      setStatus("email-sent");
      toast.success("Login link sent! Check your email.");
    } catch (err: any) {
      console.error("Failed to request login link", err);
      setErrorMessage(
        err?.message || 
        "Failed to send login link. Please check your handle and email address, then try again."
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
            navigate("/");
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
        {/* Request Form */}
        {(status === "request" || status === "error") && (
          <>
            <div className="space-y-4">
              <div className="flex justify-center">
                <div className="p-4 rounded-full bg-slate-900/60 border border-slate-700/60">
                  <LinkIcon className="h-10 w-10 text-sky-300" />
                </div>
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-bold text-slate-50">Request Login Link</h1>
                <p className="text-sm text-slate-300">
                  Enter your handle and recovery email address. We'll send you a login link.
                </p>
              </div>
            </div>

            <div className="space-y-4 mt-4">
              <div className="space-y-2 text-left">
                <Label className="text-xs font-medium text-slate-200 flex items-center gap-2">
                  <LinkIcon className="h-4 w-4 text-slate-300" />
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
                onClick={handleRequestLink}
              >
                {status === "requesting" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending login link…
                  </>
                ) : (
                  <>
                    <Mail className="mr-2 h-4 w-4" />
                    Send Login Link
                  </>
                )}
              </Button>

              <div className="space-y-2">
                <p className="text-xs text-slate-400">
                  Remember your PIN?{" "}
                  <Link to="/login-pin" className="underline underline-offset-2 text-sky-400">
                    Sign in with PIN instead
                  </Link>
                </p>
                <p className="text-xs text-slate-400">
                  Forgot your PIN?{" "}
                  <Link to="/reset-pin" className="underline underline-offset-2 text-sky-400">
                    Reset your PIN
                  </Link>
                </p>
              </div>
            </div>
          </>
        )}

        {/* Requesting State */}
        {status === "requesting" && (
          <div className="space-y-4">
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-sky-300" />
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-slate-50">Sending login link…</h1>
              <p className="text-sm text-slate-300">
                Please wait while we send the login link to your email.
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
                We've sent a login link to <strong>{recoveryEmail}</strong>. 
                Click the link in the email to sign in.
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
      </div>
    </div>
  );
};

export default RequestMagicLink;

