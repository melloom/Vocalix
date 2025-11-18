import React, { useEffect, useRef, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ClipCard } from "./ClipCard";
import { ThreadView } from "./ThreadView";
import { ChainView } from "./ChainView";

interface Clip {
  id: string;
  profile_id: string | null;
  audio_path: string;
  mood_emoji: string;
  duration_seconds: number;
  captions: string | null;
  summary: string | null;
  status: string;
  reactions: Record<string, number>;
  created_at: string;
  listens_count?: number;
  city?: string | null;
  content_rating?: "general" | "sensitive";
  title?: string | null;
  tags?: string[] | null;
  parent_clip_id?: string | null;
  reply_count?: number;
  remix_of_clip_id?: string | null;
  remix_count?: number;
  chain_id?: string | null;
  challenge_id?: string | null;
  profiles: {
    handle: string;
    emoji_avatar: string;
  } | null;
}

interface VirtualizedFeedProps {
  clips: Clip[];
  captionsDefault?: boolean;
  highlightQuery?: string;
  onReply?: (clipId: string) => void;
  onRemix?: (clipId: string) => void;
  onContinueChain?: (clipId: string) => void;
  viewMode?: "list" | "compact";
  onLoadMore?: () => void;
  hasMore?: boolean;
  prefetchNext?: number; // Number of next clips to prefetch
}

export const VirtualizedFeed = ({
  clips,
  captionsDefault = true,
  highlightQuery = "",
  onReply,
  onRemix,
  onContinueChain,
  viewMode = "list",
  onLoadMore,
  hasMore = false,
  prefetchNext = 3,
}: VirtualizedFeedProps) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const loadMoreTriggered = useRef(false);

  // Estimate item height based on view mode
  const getItemSize = useCallback(
    (index: number) => {
      const clip = clips[index];
      if (!clip) return viewMode === "compact" ? 200 : 400;
      
      // Base height
      let height = viewMode === "compact" ? 180 : 350;
      
      // Add height for title
      if (clip.title) height += viewMode === "compact" ? 20 : 30;
      
      // Add height for summary
      if (clip.summary) height += viewMode === "compact" ? 40 : 60;
      
      // Add height for captions
      if (clip.captions && captionsDefault) height += viewMode === "compact" ? 30 : 50;
      
      // Add height for thread view
      if (clip.reply_count && clip.reply_count > 0 && viewMode === "list") height += 100;
      
      // Add height for chain view
      if (clip.chain_id && viewMode === "list") height += 150;
      
      return height;
    },
    [clips, viewMode, captionsDefault]
  );

  const virtualizer = useVirtualizer({
    count: clips.length,
    getScrollElement: () => parentRef.current,
    estimateSize: getItemSize,
    overscan: 5, // Render 5 extra items above and below viewport
  });

  // Prefetch audio for next clips
  useEffect(() => {
    if (prefetchNext <= 0) return;

    const prefetchAudio = async (clip: Clip) => {
      if (!clip.audio_path) return;
      
      try {
        // Use CDN-optimized URL for prefetching
        const { getAudioUrl } = await import("@/utils/audioUrl");
        const audioUrl = await getAudioUrl(clip.audio_path, {
          clipId: clip.id,
          expiresIn: 86400, // 24 hours for better CDN caching
        });
        
        // Prefetch the audio file
        const link = document.createElement("link");
        link.rel = "prefetch";
        link.as = "audio";
        link.href = audioUrl;
        document.head.appendChild(link);
      } catch (error) {
        // Silently fail - prefetching is optional
        console.debug("Failed to prefetch audio:", error);
      }
    };

    // Get currently visible items
    const visibleItems = virtualizer.getVirtualItems();
    if (visibleItems.length === 0) return;

    // Prefetch next N clips after the last visible one
    const lastVisibleIndex = visibleItems[visibleItems.length - 1]?.index ?? 0;
    const prefetchStart = lastVisibleIndex + 1;
    const prefetchEnd = Math.min(prefetchStart + prefetchNext, clips.length);

    for (let i = prefetchStart; i < prefetchEnd; i++) {
      const clip = clips[i];
      if (clip) {
        prefetchAudio(clip);
      }
    }
  }, [clips, virtualizer, prefetchNext]);

  // Load more when scrolling near the end
  useEffect(() => {
    if (!onLoadMore || !hasMore) return;

    const handleScroll = () => {
      if (loadMoreTriggered.current) return;

      const virtualItems = virtualizer.getVirtualItems();
      if (virtualItems.length === 0) return;

      const lastItem = virtualItems[virtualItems.length - 1];
      if (!lastItem) return;

      // Trigger load more when within 3 items of the end
      if (lastItem.index >= clips.length - 3) {
        loadMoreTriggered.current = true;
        onLoadMore();
        
        // Reset after a delay
        setTimeout(() => {
          loadMoreTriggered.current = false;
        }, 1000);
      }
    };

    const scrollElement = parentRef.current;
    if (!scrollElement) return;

    scrollElement.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      scrollElement.removeEventListener("scroll", handleScroll);
    };
  }, [virtualizer, clips.length, onLoadMore, hasMore]);

  return (
    <div
      ref={parentRef}
      className="h-full w-full overflow-auto"
      style={{
        contain: "strict",
      }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const clip = clips[virtualItem.index];
          if (!clip) return null;

          return (
            <div
              key={clip.id}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <div className="p-2">
                <ClipCard
                  clip={clip}
                  captionsDefault={captionsDefault}
                  highlightQuery={highlightQuery}
                  onReply={onReply}
                  onRemix={onRemix}
                  onContinueChain={onContinueChain}
                  showReplyButton={true}
                  viewMode={viewMode}
                />
                {clip.reply_count && clip.reply_count > 0 && viewMode === "list" && (
                  <ThreadView
                    parentClip={clip}
                    onReply={onReply}
                    highlightQuery={highlightQuery}
                  />
                )}
                {clip.chain_id && viewMode === "list" && (
                  <div className="mt-4">
                    <ChainView
                      chainId={clip.chain_id}
                      onReply={onReply}
                      onRemix={onRemix}
                      onContinueChain={onContinueChain}
                      highlightQuery={highlightQuery}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {hasMore && (
        <div className="h-20 flex items-center justify-center">
          <div className="text-sm text-muted-foreground">Loading more...</div>
        </div>
      )}
    </div>
  );
};

