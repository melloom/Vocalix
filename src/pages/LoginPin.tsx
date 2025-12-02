import { useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertCircle, CheckCircle2, Loader2, Lock, User, ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase, setSessionCookie } from "@/integrations/supabase/client";
import { useDeviceId } from "@/hooks/useDeviceId";

type LoginStatus = "entering" | "submitting" | "success" | "error";

const LoginPin = () => {
  const navigate = useNavigate();
  const deviceId = useDeviceId();

  const [status, setStatus] = useState<LoginStatus>("entering");
  const [handle, setHandle] = useState("");
  const [pin, setPin] = useState(["", "", "", ""]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [profileHandle, setProfileHandle] = useState<string | null>(null);

  const pinInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const normalizedHandle = handle.trim().replace(/^@+/, "");

  const handlePinChange = (index: number, value: string) => {
    if (value && !/^\d$/.test(value)) return;

    const newPin = [...pin];
    newPin[index] = value;
    setPin(newPin);

    if (value && index < pin.length - 1) {
      pinInputRefs.current[index + 1]?.focus();
    }
  };

  const handlePinKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !pin[index] && index > 0) {
      pinInputRefs.current[index - 1]?.focus();
    }
  };

  const handlePinPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").trim();
    if (/^\d{4,8}$/.test(pasted)) {
      const digits = pasted.slice(0, pin.length).split("");
      const padded = [...digits, "", "", "", ""].slice(0, pin.length);
      setPin(padded);
    }
  };

  const submitLogin = async () => {
    const pinCode = pin.join("").trim();
    if (!normalizedHandle) {
      setErrorMessage("Enter your handle (name) to continue.");
      return;
    }
    if (pinCode.length < 4) {
      setErrorMessage("PIN must be at least 4 digits.");
      return;
    }

    setStatus("submitting");
    setErrorMessage(null);

    try {
      const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : null;

      // @ts-ignore - RPC is defined in migrations but not in generated types
      const { data, error } = await (supabase.rpc as any)("login_with_pin", {
        p_handle: normalizedHandle,
        p_pin_code: pinCode,
        p_device_id: deviceId,
        p_user_agent: userAgent,
        p_duration_hours: 720,
      });

      if (error) {
        console.error("login_with_pin RPC error", error);
        throw error;
      }

      const result = Array.isArray(data) ? data[0] : null;

      if (!result || !result.success) {
        const message =
          result?.message ||
          "We couldn't log you in with that handle and PIN. Please double-check and try again.";
        setErrorMessage(message);
        setStatus("error");
        return;
      }

      if (!result.profile_id) {
        setErrorMessage("We couldn't find the account for that handle.");
        setStatus("error");
        return;
      }

      // Store profileId locally for the existing profile lookup logic
      localStorage.setItem("profileId", result.profile_id);
      setProfileHandle(result.handle ?? normalizedHandle);

      // Create cookie session if we received a session token
      const sessionToken: string | undefined = result.session_token;
      if (sessionToken) {
        try {
          await setSessionCookie(sessionToken);
        } catch {
          // Non-fatal; device-based lookup will still work
        }
      }

      setStatus("success");

      setTimeout(() => {
        window.location.href = "/";
      }, 1500);
    } catch (err: any) {
      console.error("Handle+PIN login failed", err);
      const message =
        err?.message ??
        "Something went wrong while logging you in. Please try again in a moment.";
      setErrorMessage(message);
      setStatus("error");
    }
  };

  const canSubmit = normalizedHandle.length > 0 && pin.join("").trim().length >= 4;

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
        {status === "entering" || status === "error" ? (
          <>
            <div className="space-y-4">
              <div className="flex justify-center">
                <div className="p-4 rounded-full bg-slate-900/60 border border-slate-700/60">
                  <Lock className="h-10 w-10 text-sky-300" />
                </div>
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-bold text-slate-50">Login with PIN</h1>
                <p className="text-sm text-slate-300">
                  Enter your Echo Garden name and your personal PIN to sign in on this device.
                </p>
              </div>
            </div>

            <div className="space-y-4 mt-4">
              <div className="space-y-2 text-left">
                <label className="text-xs font-medium text-slate-200 flex items-center gap-2">
                  <User className="h-4 w-4 text-slate-300" />
                  Echo Garden name
                </label>
                <Input
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  placeholder="@vibesonly"
                  autoComplete="username"
                  className="rounded-2xl bg-slate-900/60 border-slate-700/70 text-slate-50 placeholder:text-slate-500"
                />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-200 text-left">
                  PIN (4–8 digits)
                </p>
                <div
                  className="flex justify-center gap-3"
                  onPaste={handlePinPaste}
                >
                  {pin.map((digit, index) => (
                    <Input
                      key={index}
                      ref={(el) => (pinInputRefs.current[index] = el)}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handlePinChange(index, e.target.value)}
                      onKeyDown={(e) => handlePinKeyDown(index, e)}
                      className="w-12 h-12 text-center text-xl font-mono font-semibold rounded-2xl border-2 border-slate-700/70 bg-slate-950/60 text-slate-50 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30"
                    />
                  ))}
                </div>
              </div>

              {errorMessage && (
                <div className="flex items-start gap-2 rounded-2xl bg-red-950/50 border border-red-800/60 p-3 text-left">
                  <AlertCircle className="h-4 w-4 text-red-300 mt-0.5" />
                  <p className="text-sm text-red-100">{errorMessage}</p>
                </div>
              )}

              <Button
                className="w-full rounded-2xl bg-sky-600 hover:bg-sky-700 text-white"
                disabled={!canSubmit || status === "submitting"}
                onClick={submitLogin}
              >
                {status === "submitting" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing you in…
                  </>
                ) : (
                  "Sign in with PIN"
                )}
              </Button>

              <p className="text-xs text-slate-400">
                You can set or change your personal login PIN in{" "}
                <Link to="/settings?tab=account" className="underline underline-offset-2">
                  Settings → Account
                </Link>{" "}
                on any device that&apos;s already signed in.
              </p>
              <p className="text-xs text-slate-400">
                Forgot your PIN?{" "}
                <Link to="/reset-pin" className="underline underline-offset-2 text-sky-400">
                  Reset it with your recovery email
                </Link>
              </p>
              <p className="text-xs text-slate-400">
                Don't have a PIN?{" "}
                <Link to="/request-magic-link" className="underline underline-offset-2 text-sky-400">
                  Request a login link via email
                </Link>
              </p>
            </div>
          </>
        ) : null}

        {status === "submitting" && (
          <div className="space-y-4">
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-sky-300" />
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-slate-50">Signing you in…</h1>
              <p className="text-sm text-slate-300">
                Verifying your handle and PIN. This usually takes just a moment.
              </p>
            </div>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-4">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-300" />
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-slate-50">Welcome back</h1>
              <p className="text-sm text-slate-300">
                {profileHandle
                  ? `Signing you in as @${profileHandle}…`
                  : "Signing you in…"}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LoginPin;


