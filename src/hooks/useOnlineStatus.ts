import { useState, useEffect, useCallback } from "react";

/**
 * Enhanced hook for detecting online/offline status
 * Includes network quality detection and connection type
 */
export const useOnlineStatus = () => {
  const [isOnline, setIsOnline] = useState(() => {
    if (typeof navigator !== "undefined") {
      return navigator.onLine;
    }
    return true;
  });

  const [connectionType, setConnectionType] = useState<"slow-2g" | "2g" | "3g" | "4g" | "unknown">("unknown");
  const [effectiveType, setEffectiveType] = useState<string | null>(null);
  const [downlink, setDownlink] = useState<number | null>(null);
  const [rtt, setRtt] = useState<number | null>(null);

  // Check network quality using Network Information API if available
  const updateNetworkInfo = useCallback(() => {
    if (typeof navigator !== "undefined" && "connection" in navigator) {
      const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
      
      if (connection) {
        const effectiveType = connection.effectiveType || "unknown";
        const downlink = connection.downlink || null;
        const rtt = connection.rtt || null;

        setEffectiveType(effectiveType);
        setDownlink(downlink);
        setRtt(rtt);

        // Map effectiveType to our connection type
        if (effectiveType === "slow-2g" || effectiveType === "2g") {
          setConnectionType("slow-2g");
        } else if (effectiveType === "3g") {
          setConnectionType("3g");
        } else if (effectiveType === "4g") {
          setConnectionType("4g");
        } else {
          setConnectionType("unknown");
        }
      }
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      updateNetworkInfo();
    };

    const handleOffline = () => {
      setIsOnline(false);
      setConnectionType("unknown");
      setEffectiveType(null);
      setDownlink(null);
      setRtt(null);
    };

    // Initial check
    setIsOnline(navigator.onLine);
    updateNetworkInfo();

    // Listen to online/offline events
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Listen to connection changes (if available)
    if (typeof navigator !== "undefined" && "connection" in navigator) {
      const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
      if (connection) {
        connection.addEventListener("change", updateNetworkInfo);
      }
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      
      if (typeof navigator !== "undefined" && "connection" in navigator) {
        const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
        if (connection) {
          connection.removeEventListener("change", updateNetworkInfo);
        }
      }
    };
  }, [updateNetworkInfo]);

  // Determine if we should use low-quality assets
  const shouldUseLowQuality = useCallback(() => {
    if (!isOnline) return true;
    if (connectionType === "slow-2g" || connectionType === "2g") return true;
    if (downlink !== null && downlink < 0.5) return true; // Less than 0.5 Mbps
    return false;
  }, [isOnline, connectionType, downlink]);

  // Determine if we should prefetch
  const shouldPrefetch = useCallback(() => {
    if (!isOnline) return false;
    if (connectionType === "slow-2g" || connectionType === "2g") return false;
    if (downlink !== null && downlink < 1) return false; // Less than 1 Mbps
    return true;
  }, [isOnline, connectionType, downlink]);

  return {
    isOnline,
    connectionType,
    effectiveType,
    downlink,
    rtt,
    shouldUseLowQuality: shouldUseLowQuality(),
    shouldPrefetch: shouldPrefetch(),
  };
};

