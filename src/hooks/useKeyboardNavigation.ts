import { useEffect, useRef } from "react";

interface KeyboardNavigationOptions {
  onEscape?: () => void;
  onEnter?: () => void;
  onArrowUp?: () => void;
  onArrowDown?: () => void;
  onArrowLeft?: () => void;
  onArrowRight?: () => void;
  enabled?: boolean;
  trapFocus?: boolean; // Trap focus within element
}

export function useKeyboardNavigation({
  onEscape,
  onEnter,
  onArrowUp,
  onArrowDown,
  onArrowLeft,
  onArrowRight,
  enabled = true,
  trapFocus = false,
}: KeyboardNavigationOptions = {}) {
  const containerRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Store previous focus when trap is activated
  useEffect(() => {
    if (trapFocus && containerRef.current) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      // Focus first focusable element
      const firstFocusable = containerRef.current.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (firstFocusable) {
        firstFocusable.focus();
      }
    }

    return () => {
      // Restore focus when trap is deactivated
      if (trapFocus && previousFocusRef.current) {
        previousFocusRef.current.focus();
      }
    };
  }, [trapFocus]);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if typing in input/textarea/contenteditable
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      switch (e.key) {
        case "Escape":
          if (onEscape) {
            e.preventDefault();
            onEscape();
          }
          break;
        case "Enter":
          if (onEnter && (target.tagName === "BUTTON" || target.getAttribute("role") === "button")) {
            onEnter();
          }
          break;
        case "ArrowUp":
          if (onArrowUp) {
            e.preventDefault();
            onArrowUp();
          }
          break;
        case "ArrowDown":
          if (onArrowDown) {
            e.preventDefault();
            onArrowDown();
          }
          break;
        case "ArrowLeft":
          if (onArrowLeft) {
            e.preventDefault();
            onArrowLeft();
          }
          break;
        case "ArrowRight":
          if (onArrowRight) {
            e.preventDefault();
            onArrowRight();
          }
          break;
      }
    };

    // Focus trap for modals/dialogs
    const handleTabKey = (e: KeyboardEvent) => {
      if (!trapFocus || !containerRef.current || e.key !== "Tab") return;

      const focusableElements = containerRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );

      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keydown", handleTabKey);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keydown", handleTabKey);
    };
  }, [enabled, trapFocus, onEscape, onEnter, onArrowUp, onArrowDown, onArrowLeft, onArrowRight]);

  return containerRef;
}

