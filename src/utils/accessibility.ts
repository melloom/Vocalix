/**
 * Accessibility utility functions
 */

/**
 * Generates a unique ID for ARIA attributes
 */
let idCounter = 0;
export function generateAriaId(prefix = "aria"): string {
  return `${prefix}-${++idCounter}-${Date.now()}`;
}

/**
 * Gets or creates an ID for an element, useful for aria-labelledby
 */
export function getOrCreateId(element: HTMLElement | null, prefix = "id"): string {
  if (!element) return "";
  if (element.id) return element.id;
  const id = generateAriaId(prefix);
  element.id = id;
  return id;
}

/**
 * Announces a message to screen readers
 */
export function announceToScreenReader(message: string, priority: "polite" | "assertive" = "polite") {
  const announcement = document.createElement("div");
  announcement.setAttribute("role", "status");
  announcement.setAttribute("aria-live", priority);
  announcement.setAttribute("aria-atomic", "true");
  announcement.className = "sr-only";
  announcement.textContent = message;

  document.body.appendChild(announcement);

  // Remove after announcement
  setTimeout(() => {
    document.body.removeChild(announcement);
  }, 1000);
}

/**
 * Focuses the first focusable element in a container
 */
export function focusFirstFocusable(container: HTMLElement | null): void {
  if (!container) return;

  const focusableSelectors = [
    'button:not([disabled])',
    '[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(", ");

  const firstFocusable = container.querySelector<HTMLElement>(focusableSelectors);
  if (firstFocusable) {
    firstFocusable.focus();
  }
}

/**
 * Checks if an element is focusable
 */
export function isFocusable(element: HTMLElement): boolean {
  if (
    element.tabIndex >= 0 ||
    (element.tagName === "A" && (element as HTMLAnchorElement).href) ||
    element.tagName === "BUTTON" ||
    element.tagName === "INPUT" ||
    element.tagName === "SELECT" ||
    element.tagName === "TEXTAREA"
  ) {
    return !element.hasAttribute("disabled");
  }
  return false;
}

/**
 * Gets all focusable elements within a container
 */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const focusableSelectors = [
    'button:not([disabled])',
    '[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(", ");

  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelectors)).filter(isFocusable);
}

/**
 * Traps focus within a container (for modals)
 */
export function trapFocus(container: HTMLElement, event: KeyboardEvent) {
  const focusableElements = getFocusableElements(container);
  if (focusableElements.length === 0) return;

  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  if (event.key === 'Tab') {
    if (event.shiftKey) {
      // Shift + Tab
      if (document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      }
    } else {
      // Tab
      if (document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }
  }
}

/**
 * Manages focus restoration after closing a modal
 */
let previousFocus: HTMLElement | null = null;

export function saveFocus() {
  previousFocus = document.activeElement as HTMLElement;
}

export function restoreFocus() {
  if (previousFocus && typeof previousFocus.focus === 'function') {
    previousFocus.focus();
    previousFocus = null;
  }
}

/**
 * Checks if user prefers reduced motion
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Checks if user prefers high contrast
 */
export function prefersHighContrast(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-contrast: high)').matches;
}

/**
 * Gets appropriate animation duration based on user preferences
 */
export function getAnimationDuration(defaultDuration: number = 300): number {
  if (prefersReducedMotion()) {
    return 0;
  }
  return defaultDuration;
}

