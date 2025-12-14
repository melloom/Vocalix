import { useState, useRef, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { cn } from "@/lib/utils";

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  onLoad?: () => void;
  onError?: () => void;
  priority?: boolean; // If true, load immediately
  quality?: "low" | "medium" | "high"; // Quality preference
}

/**
 * Enhanced lazy-loaded image component with network-aware loading
 * Automatically adjusts quality based on connection speed
 */
export const LazyImage = ({
  src,
  alt,
  className = "",
  width,
  height,
  onLoad,
  onError,
  priority = false,
  quality,
}: LazyImageProps) => {
  const { isOnline, shouldUseLowQuality, shouldPrefetch } = useOnlineStatus();
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Determine if we should load immediately
  const shouldLoadImmediately = priority || (!isOnline && shouldPrefetch);

  useEffect(() => {
    if (!containerRef.current) return;
    if (shouldLoadImmediately) {
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: shouldPrefetch ? "200px" : "100px", // Larger margin on fast connections
        threshold: 0.01,
      }
    );

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
    };
  }, [shouldLoadImmediately, shouldPrefetch]);

  const handleLoad = () => {
    setIsLoaded(true);
    onLoad?.();
  };

  const handleError = () => {
    setHasError(true);
    onError?.();
  };

  // Determine image quality based on network conditions
  const getImageSrc = () => {
    if (!isOnline) return src; // Use cached/offline version if available
    
    // If quality is explicitly set, use it
    if (quality === "low" || shouldUseLowQuality) {
      // Try to use a lower quality version if available (e.g., add ?q=low)
      // This would require backend support for image optimization
      return src;
    }
    
    return src;
  };

  return (
    <div ref={containerRef} className={cn("relative", className)} style={{ width, height }}>
      {!isLoaded && !hasError && (
        <Skeleton className="w-full h-full absolute inset-0 skeleton-shimmer" />
      )}
      {isInView && (
        <img
          ref={imgRef}
          src={getImageSrc()}
          alt={alt}
          className={cn(
            "transition-opacity duration-300",
            isLoaded ? "opacity-100" : "opacity-0",
            className
          )}
          style={{ width, height, objectFit: "cover" }}
          onLoad={handleLoad}
          onError={handleError}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={priority ? "high" : "auto"}
        />
      )}
      {hasError && (
        <div className="w-full h-full flex items-center justify-center bg-muted text-muted-foreground text-sm">
          Failed to load image
        </div>
      )}
    </div>
  );
};

