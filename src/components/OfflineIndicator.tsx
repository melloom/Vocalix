import { useEffect, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShow(true);
      // Hide after 3 seconds
      setTimeout(() => setShow(false), 3000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShow(true);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Show on initial load if offline
    if (!navigator.onLine) {
      setShow(true);
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (!show) return null;

  return (
    <Card
      className={cn(
        "fixed top-4 right-4 z-50 p-3 flex items-center gap-2 shadow-lg transition-all duration-300",
        isOnline
          ? "bg-green-500/10 border-green-500/20 text-green-700 dark:text-green-400"
          : "bg-destructive/10 border-destructive/20 text-destructive"
      )}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {isOnline ? (
        <>
          <Wifi className="h-4 w-4" aria-hidden="true" />
          <span className="text-sm font-medium">Back online</span>
        </>
      ) : (
        <>
          <WifiOff className="h-4 w-4" aria-hidden="true" />
          <span className="text-sm font-medium">You're offline</span>
        </>
      )}
    </Card>
  );
}

