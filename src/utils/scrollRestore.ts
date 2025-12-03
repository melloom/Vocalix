/**
 * Utility functions to ensure scrolling is always properly enabled
 * This prevents scroll lock issues that can occur from various components
 */

/**
 * Ensures body scroll is enabled by removing any inline styles that might block it
 */
export const ensureScrollEnabled = () => {
  // Remove inline overflow styles that might block scrolling
  if (document.body.style.overflow === 'hidden') {
    document.body.style.overflow = '';
  }
  if (document.body.style.position === 'fixed') {
    document.body.style.position = '';
  }
  
  // Ensure html element allows scrolling too
  if (document.documentElement.style.overflow === 'hidden') {
    document.documentElement.style.overflow = '';
  }
};

/**
 * Initializes scroll restoration on app load
 * This ensures scroll is never permanently locked
 */
export const initializeScrollRestore = () => {
  // Ensure scroll is enabled on load
  ensureScrollEnabled();
  
  // Periodically check and restore scroll (safety mechanism)
  // Only runs in development or if scroll appears locked
  const checkScroll = () => {
    const bodyOverflow = window.getComputedStyle(document.body).overflow;
    const bodyPosition = window.getComputedStyle(document.body).position;
    
    // If body has inline styles that prevent scrolling and content exceeds viewport
    const hasScrollLock = 
      (document.body.style.overflow === 'hidden' || bodyOverflow === 'hidden') &&
      document.body.scrollHeight > window.innerHeight;
    
    if (hasScrollLock) {
      // Only fix if we're not in a modal/tutorial (check for common overlay patterns)
      const hasOverlay = 
        document.querySelector('[role="dialog"]') || 
        document.querySelector('.tutorial-overlay') ||
        document.querySelector('[data-tutorial-active="true"]');
      
      if (!hasOverlay) {
        console.warn('[ScrollRestore] Detected scroll lock, restoring...');
        ensureScrollEnabled();
      }
    }
  };
  
  // Check on load and after a delay
  window.addEventListener('load', checkScroll);
  setTimeout(checkScroll, 2000);
  
  // Also check on visibility change (tab switch)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      setTimeout(checkScroll, 100);
    }
  });
};

