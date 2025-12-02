/**
 * Hook for pinch-to-zoom gesture support
 * Provides pinch zoom functionality for touch devices
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { isTouchDevice } from '@/utils/responsive';

interface UsePinchZoomOptions {
  minScale?: number;
  maxScale?: number;
  initialScale?: number;
  onScaleChange?: (scale: number) => void;
  enabled?: boolean;
}

export function usePinchZoom<T extends HTMLElement = HTMLDivElement>(
  options: UsePinchZoomOptions = {}
) {
  const {
    minScale = 0.5,
    maxScale = 3,
    initialScale = 1,
    onScaleChange,
    enabled = true,
  } = options;

  const elementRef = useRef<T>(null);
  const [scale, setScale] = useState(initialScale);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const touchesRef = useRef<Map<number, Touch>>(new Map());
  const lastDistanceRef = useRef<number | null>(null);
  const lastCenterRef = useRef<{ x: number; y: number } | null>(null);

  const calculateDistance = useCallback((touches: Touch[]) => {
    if (touches.length < 2) return 0;
    const [t1, t2] = touches;
    const dx = t2.clientX - t1.clientX;
    const dy = t2.clientY - t1.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  const calculateCenter = useCallback((touches: Touch[]) => {
    if (touches.length < 2) return null;
    const [t1, t2] = touches;
    return {
      x: (t1.clientX + t2.clientX) / 2,
      y: (t1.clientY + t2.clientY) / 2,
    };
  }, []);

  const updateScale = useCallback(
    (newScale: number) => {
      const clampedScale = Math.max(minScale, Math.min(maxScale, newScale));
      setScale(clampedScale);
      if (onScaleChange) {
        onScaleChange(clampedScale);
      }
    },
    [minScale, maxScale, onScaleChange]
  );

  useEffect(() => {
    if (!enabled || !elementRef.current) return;

    // Only enable pinch zoom on touch-enabled devices (mobile, tablets)
    // Laptops/desktops without touch gestures won't have pinch zoom
    if (!isTouchDevice()) {
      return;
    }

    const element = elementRef.current;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        // Pinch gesture
        Array.from(e.touches).forEach((touch) => {
          touchesRef.current.set(touch.identifier, touch);
        });

        const touches = Array.from(touchesRef.current.values());
        lastDistanceRef.current = calculateDistance(touches);
        lastCenterRef.current = calculateCenter(touches);

        e.preventDefault();
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && lastDistanceRef.current !== null) {
        // Update touches
        Array.from(e.touches).forEach((touch) => {
          touchesRef.current.set(touch.identifier, touch);
        });

        const touches = Array.from(touchesRef.current.values());
        const currentDistance = calculateDistance(touches);
        const currentCenter = calculateCenter(touches);

        if (currentCenter && lastCenterRef.current && lastDistanceRef.current > 0) {
          // Calculate scale change
          const distanceChange = currentDistance / lastDistanceRef.current;
          const newScale = scale * distanceChange;
          updateScale(newScale);

          // Calculate translation based on center movement
          const dx = currentCenter.x - lastCenterRef.current.x;
          const dy = currentCenter.y - lastCenterRef.current.y;
          setTranslate((prev) => ({
            x: prev.x + dx,
            y: prev.y + dy,
          }));

          lastDistanceRef.current = currentDistance;
          lastCenterRef.current = currentCenter;
        }

        e.preventDefault();
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      // Remove ended touches
      Array.from(e.changedTouches).forEach((touch) => {
        touchesRef.current.delete(touch.identifier);
      });

      if (touchesRef.current.size < 2) {
        lastDistanceRef.current = null;
        lastCenterRef.current = null;
      }
    };

    element.addEventListener('touchstart', handleTouchStart, { passive: false });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });
    element.addEventListener('touchend', handleTouchEnd);
    element.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
      element.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [enabled, scale, calculateDistance, calculateCenter, updateScale]);

  const reset = useCallback(() => {
    setScale(initialScale);
    setTranslate({ x: 0, y: 0 });
    lastDistanceRef.current = null;
    lastCenterRef.current = null;
    touchesRef.current.clear();
  }, [initialScale]);

  const setScaleDirect = useCallback(
    (newScale: number) => {
      updateScale(newScale);
    },
    [updateScale]
  );

  return {
    ref: elementRef,
    scale,
    translate,
    reset,
    setScale: setScaleDirect,
    style: {
      transform: `scale(${scale}) translate(${translate.x}px, ${translate.y}px)`,
      transformOrigin: 'center center',
      transition: 'transform 0.1s ease-out',
    },
  };
}

