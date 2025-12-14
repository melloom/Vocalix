import { useEffect, useCallback, useRef } from "react";
import { useOnlineStatus } from "./useOnlineStatus";

/**
 * Hook for performance optimizations based on network and device capabilities
 */
export const usePerformanceOptimization = () => {
  const { isOnline, shouldUseLowQuality, shouldPrefetch } = useOnlineStatus();
  const prefetchCache = useRef<Set<string>>(new Set());

  // Prefetch critical resources
  const prefetchResource = useCallback((url: string, as: "audio" | "image" | "script" | "style" = "audio") => {
    if (!shouldPrefetch || prefetchCache.current.has(url)) return;

    try {
      const link = document.createElement("link");
      link.rel = "prefetch";
      link.as = as;
      link.href = url;
      document.head.appendChild(link);
      prefetchCache.current.add(url);
    } catch (error) {
      console.warn("Failed to prefetch resource:", error);
    }
  }, [shouldPrefetch]);

  // Preconnect to external domains
  const preconnect = useCallback((url: string) => {
    if (!shouldPrefetch) return;

    try {
      const link = document.createElement("link");
      link.rel = "preconnect";
      link.href = url;
      document.head.appendChild(link);
    } catch (error) {
      console.warn("Failed to preconnect:", error);
    }
  }, [shouldPrefetch]);

  // Debounce function for expensive operations
  const debounce = useCallback(<T extends (...args: any[]) => any>(
    func: T,
    wait: number
  ): ((...args: Parameters<T>) => void) => {
    let timeout: NodeJS.Timeout | null = null;
    return (...args: Parameters<T>) => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  }, []);

  // Throttle function for frequent operations
  const throttle = useCallback(<T extends (...args: any[]) => any>(
    func: T,
    limit: number
  ): ((...args: Parameters<T>) => void) => {
    let inThrottle: boolean;
    return (...args: Parameters<T>) => {
      if (!inThrottle) {
        func(...args);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  }, []);

  // Lazy load images with intersection observer
  const observeElement = useCallback((element: HTMLElement | null, callback: () => void) => {
    if (!element) return () => {};

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            callback();
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: shouldPrefetch ? "200px" : "100px",
        threshold: 0.01,
      }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [shouldPrefetch]);

  // Check if device is low-end
  const isLowEndDevice = useCallback(() => {
    if (typeof navigator === "undefined") return false;
    
    // Check hardware concurrency (CPU cores)
    const cores = navigator.hardwareConcurrency || 2;
    if (cores < 4) return true;

    // Check device memory (if available)
    const memory = (navigator as any).deviceMemory;
    if (memory && memory < 4) return true;

    return false;
  }, []);

  // Get recommended batch size for operations
  const getBatchSize = useCallback(() => {
    if (isLowEndDevice() || shouldUseLowQuality) return 5;
    if (shouldPrefetch) return 20;
    return 10;
  }, [isLowEndDevice, shouldUseLowQuality, shouldPrefetch]);

  return {
    isOnline,
    shouldUseLowQuality,
    shouldPrefetch,
    prefetchResource,
    preconnect,
    debounce,
    throttle,
    observeElement,
    isLowEndDevice: isLowEndDevice(),
    getBatchSize,
  };
};

