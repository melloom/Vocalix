/**
 * Enhanced component lazy loading utilities
 * Provides utilities for lazy loading heavy components on-demand
 */

import React, { lazy, ComponentType, Suspense, ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Options for lazy component loading
 */
export interface LazyComponentOptions {
  /** Fallback component to show while loading */
  fallback?: ReactNode;
  /** Retry count for failed loads */
  retryCount?: number;
  /** Retry delay in milliseconds */
  retryDelay?: number;
}

/**
 * Create a lazy-loaded component with retry logic
 */
export function createLazyComponent<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  options: LazyComponentOptions = {}
): ComponentType<any> {
  const { retryCount = 3, retryDelay = 300 } = options;

  const retryImport = async (): Promise<{ default: T }> => {
    let attempt = 0;

    while (attempt < retryCount) {
      try {
        return await importFn();
      } catch (error) {
        attempt++;
        if (attempt >= retryCount) {
          throw error;
        }
        // Wait before retrying with exponential backoff
        await new Promise((resolve) => setTimeout(resolve, retryDelay * attempt));
      }
    }

    throw new Error('Failed to load component after retries');
  };

  return lazy(retryImport);
}

/**
 * Default fallback component for lazy loading
 */
const DefaultFallback = () => (
  <div className="w-full p-4 space-y-3">
    <Skeleton className="h-8 w-3/4" />
    <Skeleton className="h-4 w-full" />
    <Skeleton className="h-4 w-5/6" />
  </div>
);

/**
 * Wrap a lazy component with Suspense and fallback
 */
export function withLazySuspense<T extends ComponentType<any>>(
  LazyComponent: ComponentType<T>,
  fallback?: ReactNode
) {
  return function LazySuspenseWrapper(props: any) {
    return (
      <Suspense fallback={fallback || <DefaultFallback />}>
        <LazyComponent {...props} />
      </Suspense>
    );
  };
}

/**
 * Preload a component module (useful for prefetching)
 */
export async function preloadComponent(
  importFn: () => Promise<any>
): Promise<void> {
  try {
    await importFn();
  } catch (error) {
    console.debug('Failed to preload component:', error);
    // Silently fail - preloading is optional
  }
}

/**
 * Preload multiple components in parallel
 */
export async function preloadComponents(
  importFns: Array<() => Promise<any>>,
  maxConcurrent: number = 3
): Promise<void> {
  for (let i = 0; i < importFns.length; i += maxConcurrent) {
    const batch = importFns.slice(i, i + maxConcurrent);
    await Promise.allSettled(batch.map((fn) => preloadComponent(fn)));
  }
}

/**
 * Intersection observer-based lazy component loader
 * Loads component only when it's about to enter viewport
 */
export function useIntersectionLazyLoad(
  ref: React.RefObject<HTMLElement>,
  onIntersect: () => void,
  options: IntersectionObserverInit = {}
) {
  const observerOptions: IntersectionObserverInit = {
    rootMargin: '100px', // Start loading 100px before entering viewport
    threshold: 0.01,
    ...options,
  };

  React.useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          onIntersect();
          observer.unobserve(element);
        }
      });
    }, observerOptions);

    observer.observe(element);

    return () => {
      observer.unobserve(element);
    };
  }, [ref, onIntersect]);
}

