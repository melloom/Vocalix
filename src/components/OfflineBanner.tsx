import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { Card } from "@/components/ui/card";
import { WifiOff, Wifi, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

/**
 * Enhanced offline banner with network quality information
 */
export function OfflineBanner() {
  const { isOnline, connectionType, shouldUseLowQuality } = useOnlineStatus();
  const [show, setShow] = useState(false);
  const [wasOffline, setWasOffline] = useState(!isOnline);

  useEffect(() => {
    if (!isOnline) {
      setShow(true);
      setWasOffline(true);
    } else if (wasOffline) {
      // Show "back online" message briefly
      setShow(true);
      const timer = setTimeout(() => {
        setShow(false);
        setWasOffline(false);
      }, 3000);
      return () => clearTimeout(timer);
    } else {
      setShow(false);
    }
  }, [isOnline, wasOffline]);

  if (!show) return null;

  return (
    <Card
      className={cn(
        "fixed top-4 left-1/2 -translate-x-1/2 z-50 p-3 flex items-center gap-2 shadow-lg transition-all duration-300 animate-slide-in-down",
        isOnline
          ? "bg-green-500/10 border-green-500/20 text-green-700 dark:text-green-400"
          : "bg-destructive/10 border-destructive/20 text-destructive",
        connectionType === "slow-2g" || connectionType === "2g"
          ? "bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400"
          : ""
      )}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {isOnline ? (
        <>
          <Wifi className="h-4 w-4 animate-pulse-soft" aria-hidden="true" />
          <span className="text-sm font-medium">Back online</span>
        </>
      ) : (
        <>
          <WifiOff className="h-4 w-4" aria-hidden="true" />
          <span className="text-sm font-medium">You&apos;re offline</span>
        </>
      )}
      {(connectionType === "slow-2g" || connectionType === "2g" || shouldUseLowQuality) && isOnline && (
        <>
          <AlertCircle className="h-3 w-3 ml-1" aria-hidden="true" />
          <span className="text-xs opacity-75">Slow connection</span>
        </>
      )}
    </Card>
  );
}

