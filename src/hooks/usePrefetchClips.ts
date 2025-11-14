import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Clip {
  id: string;
  audio_path: string;
}

/**
 * Hook to prefetch audio files for upcoming clips
 * Prefetches the next N clips when a clip becomes visible
 */
export const usePrefetchClips = (
  clips: Clip[],
  currentVisibleIndex: number | null,
  prefetchCount: number = 3
) => {
  const prefetchedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (currentVisibleIndex === null || clips.length === 0) return;

    const prefetchAudio = async (clip: Clip) => {
      // Skip if already prefetched
      if (prefetchedRef.current.has(clip.id) || !clip.audio_path) return;

      try {
        // Create signed URL
        const { data, error } = await supabase.storage
          .from("audio")
          .createSignedUrl(clip.audio_path, 3600);

        if (error) {
          console.debug("Failed to prefetch audio:", error);
          return;
        }

        if (data?.signedUrl) {
          // Prefetch using link tag for browser caching
          const link = document.createElement("link");
          link.rel = "prefetch";
          link.as = "audio";
          link.href = data.signedUrl;
          document.head.appendChild(link);

          // Also prefetch using fetch for service worker caching
          fetch(data.signedUrl, { method: "GET", cache: "force-cache" }).catch(() => {
            // Silently fail - prefetching is optional
          });

          prefetchedRef.current.add(clip.id);
        }
      } catch (error) {
        // Silently fail - prefetching is optional
        console.debug("Error prefetching audio:", error);
      }
    };

    // Prefetch next N clips after current visible index
    const startIndex = currentVisibleIndex + 1;
    const endIndex = Math.min(startIndex + prefetchCount, clips.length);

    for (let i = startIndex; i < endIndex; i++) {
      const clip = clips[i];
      if (clip) {
        prefetchAudio(clip);
      }
    }
  }, [clips, currentVisibleIndex, prefetchCount]);
};

/**
 * Hook to track which clip is currently visible in the viewport
 */
export const useVisibleClipIndex = (
  clips: Clip[],
  enabled: boolean = true
): number | null => {
  const [visibleIndex, setVisibleIndex] = useState<number | null>(null);
  const clipRefsRef = useRef<Map<string, IntersectionObserverEntry>>(new Map());

  useEffect(() => {
    if (!enabled || clips.length === 0) return;

    const observers: IntersectionObserver[] = [];

    const handleIntersection = (entries: IntersectionObserverEntry[]) => {
      entries.forEach((entry) => {
        const clipId = entry.target.getAttribute("data-clip-id");
        if (!clipId) return;

        if (entry.isIntersecting) {
          clipRefsRef.current.set(clipId, entry);
        } else {
          clipRefsRef.current.delete(clipId);
        }
      });

      // Find the most visible clip (highest intersection ratio)
      let mostVisible: { id: string; ratio: number } | null = null;
      clipRefsRef.current.forEach((entry, clipId) => {
        if (!mostVisible || entry.intersectionRatio > mostVisible.ratio) {
          mostVisible = { id: clipId, ratio: entry.intersectionRatio };
        }
      });

      if (mostVisible) {
        const index = clips.findIndex((clip) => clip.id === mostVisible!.id);
        if (index !== -1) {
          setVisibleIndex(index);
        }
      }
    };

    // Observe all clip elements
    clips.forEach((clip) => {
      const element = document.querySelector(`[data-clip-id="${clip.id}"]`);
      if (element) {
        const observer = new IntersectionObserver(handleIntersection, {
          rootMargin: "50% 0px", // Consider visible when 50% in viewport
          threshold: [0, 0.25, 0.5, 0.75, 1],
        });
        observer.observe(element);
        observers.push(observer);
      }
    });

    return () => {
      observers.forEach((observer) => observer.disconnect());
      clipRefsRef.current.clear();
    };
  }, [clips, enabled]);

  return visibleIndex;
};

