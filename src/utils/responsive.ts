/**
 * Responsive utilities for mobile/tablet design
 */

/**
 * Returns true if screen width is below the breakpoint
 */
export function isMobile(width?: number): boolean {
  if (typeof window === 'undefined') return false;
  const viewportWidth = width || window.innerWidth;
  return viewportWidth < 768; // md breakpoint
}

/**
 * Returns true if screen width is tablet size
 */
export function isTablet(width?: number): boolean {
  if (typeof window === 'undefined') return false;
  const viewportWidth = width || window.innerWidth;
  return viewportWidth >= 768 && viewportWidth < 1024; // md to lg breakpoint
}

/**
 * Returns true if screen width is desktop size
 */
export function isDesktop(width?: number): boolean {
  if (typeof window === 'undefined') return false;
  const viewportWidth = width || window.innerWidth;
  return viewportWidth >= 1024; // lg breakpoint
}

/**
 * Get responsive breakpoint value
 */
export function getResponsiveValue<T>(
  mobile: T,
  tablet?: T,
  desktop?: T,
  width?: number
): T {
  const viewportWidth = width || (typeof window !== 'undefined' ? window.innerWidth : 1024);
  
  if (viewportWidth >= 1024 && desktop !== undefined) {
    return desktop;
  }
  if (viewportWidth >= 768 && tablet !== undefined) {
    return tablet;
  }
  return mobile;
}

/**
 * Touch target size utilities
 */
export const TOUCH_TARGET_SIZES = {
  minimum: 44, // iOS minimum
  comfortable: 48, // Android minimum
  large: 56, // Comfortable for all users
} as const;

/**
 * Check if device supports touch
 */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    // @ts-ignore - legacy support
    navigator.msMaxTouchPoints > 0
  );
}

/**
 * Get appropriate touch target size
 */
export function getTouchTargetSize(comfortable = false): number {
  return comfortable ? TOUCH_TARGET_SIZES.comfortable : TOUCH_TARGET_SIZES.minimum;
}

