/**
 * Error Recovery Component
 * Displays error messages with retry options and graceful fallbacks
 */

import { useEffect } from "react";
import { AlertCircle, RefreshCw, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { announceToScreenReader } from "@/utils/accessibility";

interface ErrorRecoveryProps {
  error: Error | string | null;
  onRetry?: () => void;
  onDismiss?: () => void;
  retryCount?: number;
  maxRetries?: number;
  isRetrying?: boolean;
  fallbackMessage?: string;
  position?: "top" | "bottom" | "inline";
  variant?: "alert" | "card" | "toast";
  className?: string;
}

export const ErrorRecovery = ({
  error,
  onRetry,
  onDismiss,
  retryCount = 0,
  maxRetries = 3,
  isRetrying = false,
  fallbackMessage,
  position = "top",
  variant = "alert",
  className,
}: ErrorRecoveryProps) => {
  if (!error) return null;

  const errorMessage =
    typeof error === "string" ? error : error.message || "An error occurred";

  const canRetry = onRetry && retryCount < maxRetries;

  // Announce error to screen readers
  useEffect(() => {
    if (error) {
      announceToScreenReader(`Error: ${errorMessage}`, "assertive");
    }
  }, [error, errorMessage]);

  const handleDismiss = () => {
    if (onDismiss) {
      onDismiss();
    }
  };

  const handleRetry = () => {
    if (onRetry && canRetry) {
      onRetry();
    }
  };

  const content = (
    <>
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          {variant === "alert" && (
            <>
              <AlertTitle>Something went wrong</AlertTitle>
              <AlertDescription className="mt-2">
                {errorMessage}
                {fallbackMessage && (
                  <span className="block mt-2 text-sm text-muted-foreground">
                    {fallbackMessage}
                  </span>
                )}
              </AlertDescription>
            </>
          )}
          {variant === "card" && (
            <>
              <CardTitle className="text-lg">Error</CardTitle>
              <CardDescription className="mt-2">
                {errorMessage}
                {fallbackMessage && (
                  <span className="block mt-2 text-sm">
                    {fallbackMessage}
                  </span>
                )}
              </CardDescription>
            </>
          )}
          {variant === "toast" && (
            <div>
              <p className="font-semibold">Error</p>
              <p className="text-sm text-muted-foreground mt-1">
                {errorMessage}
              </p>
            </div>
          )}
        </div>
        {onDismiss && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-full shrink-0"
            onClick={handleDismiss}
            aria-label="Dismiss error"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      {(canRetry || isRetrying) && (
        <div className="flex items-center gap-2 mt-4">
          {canRetry && (
            <Button
              onClick={handleRetry}
              disabled={isRetrying}
              size="sm"
              variant="outline"
            >
              <RefreshCw
                className={cn(
                  "h-4 w-4 mr-2",
                  isRetrying && "animate-spin"
                )}
              />
              {isRetrying ? "Retrying..." : "Retry"}
              {retryCount > 0 && (
                <span className="ml-2 text-xs text-muted-foreground">
                  ({retryCount}/{maxRetries})
                </span>
              )}
            </Button>
          )}
          {isRetrying && (
            <p className="text-sm text-muted-foreground">
              Attempting to recover...
            </p>
          )}
        </div>
      )}
    </>
  );

  const positionClasses = {
    top: "fixed top-4 left-1/2 -translate-x-1/2 z-[10000]",
    bottom: "fixed bottom-4 left-1/2 -translate-x-1/2 z-[10000]",
    inline: "",
  };

  if (variant === "alert") {
    return (
      <div className={cn(positionClasses[position], className)}>
        <Alert variant="destructive" className="max-w-2xl animate-slide-in-down">
          {content}
        </Alert>
      </div>
    );
  }

  if (variant === "card") {
    return (
      <div className={cn(positionClasses[position], className)}>
        <Card className="max-w-2xl animate-slide-in-down border-destructive/50 bg-destructive/5">
          <CardHeader>{content}</CardHeader>
        </Card>
      </div>
    );
  }

  // Toast variant
  return (
    <div className={cn(positionClasses[position], className)}>
      <div className="rounded-lg border border-destructive bg-destructive/10 p-4 max-w-md animate-slide-in-down">
        {content}
      </div>
    </div>
  );
};

