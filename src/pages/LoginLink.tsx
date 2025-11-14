import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useDeviceId } from "@/hooks/useDeviceId";

type RedemptionStatus = "initializing" | "redeeming" | "success" | "error";

const LoginLink = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const deviceId = useDeviceId();
  const [status, setStatus] = useState<RedemptionStatus>("initializing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [profileHandle, setProfileHandle] = useState<string | null>(null);
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

    const redeem = async () => {
      setStatus("redeeming");
      try {
        const { data, error } = await supabase.rpc("redeem_magic_login_link", { link_token: token });
        if (error) throw error;

        const result = data?.[0];
        if (!result?.profile_id) {
          throw new Error("We couldn't find the account connected to this link.");
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

    redeem().catch((error) => {
      console.error("Unhandled error in redeem:", error);
      setStatus("error");
      setErrorMessage("Something went wrong. Please try again.");
    });
  }, [deviceId, token]);

  return (
    <div className="min-h-screen bg-background px-4 py-12 flex items-center justify-center">
      <div className="max-w-md w-full space-y-6 text-center">
        {(status === "initializing" || status === "redeeming") && (
          <>
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold">Verifying your link</h1>
              <p className="text-sm text-muted-foreground">
                Sit tight—we&apos;re connecting this device to your Echo Garden account.
              </p>
            </div>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold">You&apos;re all set</h1>
              <p className="text-sm text-muted-foreground">
                {profileHandle
                  ? `Welcome back, ${profileHandle}! This device is linked to your account.`
                  : "This device is now linked to your Echo Garden account."}
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
  );
};

export default LoginLink;


