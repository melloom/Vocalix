import { useEffect, useRef, useState } from "react";
import { isTouchDevice } from "@/utils/responsive";

interface SwipeHandlers {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
}

interface UseSwipeOptions extends SwipeHandlers {
  threshold?: number; // Minimum distance in pixels to trigger swipe
  velocityThreshold?: number; // Minimum velocity to trigger swipe (px/ms)
}

export function useSwipe<T extends HTMLElement = HTMLDivElement>({
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  onSwipeDown,
  threshold = 50,
  velocityThreshold = 0.3,
}: UseSwipeOptions) {
  const elementRef = useRef<T>(null);
  const [startPos, setStartPos] = useState<{ x: number; y: number; time: number } | null>(null);
  const [isSwiping, setIsSwiping] = useState(false);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    // Only enable swipe on touch-enabled devices (mobile, tablets)
    // Laptops/desktops without touch gestures won't have swipe functionality
    if (!isTouchDevice()) {
      return;
    }

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      setStartPos({
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
      });
      setIsSwiping(true);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!startPos) return;
      e.preventDefault(); // Prevent scrolling during swipe
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!startPos) return;

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - startPos.x;
      const deltaY = touch.clientY - startPos.y;
      const deltaTime = Date.now() - startPos.time;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      const velocity = distance / deltaTime;

      // Check if swipe meets threshold
      if (distance >= threshold && velocity >= velocityThreshold) {
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);

        // Determine primary direction
        if (absX > absY) {
          // Horizontal swipe
          if (deltaX > 0 && onSwipeRight) {
            onSwipeRight();
          } else if (deltaX < 0 && onSwipeLeft) {
            onSwipeLeft();
          }
        } else {
          // Vertical swipe
          if (deltaY > 0 && onSwipeDown) {
            onSwipeDown();
          } else if (deltaY < 0 && onSwipeUp) {
            onSwipeUp();
          }
        }
      }

      setStartPos(null);
      setIsSwiping(false);
    };

    element.addEventListener("touchstart", handleTouchStart, { passive: false });
    element.addEventListener("touchmove", handleTouchMove, { passive: false });
    element.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener("touchstart", handleTouchStart);
      element.removeEventListener("touchmove", handleTouchMove);
      element.removeEventListener("touchend", handleTouchEnd);
    };
  }, [startPos, threshold, velocityThreshold, onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown]);

  return { ref: elementRef, isSwiping };
}

