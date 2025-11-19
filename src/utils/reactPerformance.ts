/**
 * React performance optimization utilities
 * Provides helpers for memoization and performance optimization
 */

import React, { memo, useMemo, useCallback, ComponentType, DependencyList } from 'react';

/**
 * Memoize a component with deep comparison of props
 * Useful for components that receive complex objects
 */
export function deepMemo<T extends ComponentType<any>>(
  Component: T,
  propsAreEqual?: (prevProps: any, nextProps: any) => boolean
): T {
  return memo(Component, propsAreEqual) as T;
}

/**
 * Memoize a value with deep comparison
 * Useful for expensive calculations with complex dependencies
 */
export function useDeepMemo<T>(
  factory: () => T,
  deps: DependencyList
): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(factory, deps);
}

/**
 * Memoize a callback with deep comparison of dependencies
 * Useful when dependencies are objects or arrays
 */
export function useDeepCallback<T extends (...args: any[]) => any>(
  callback: T,
  deps: DependencyList
): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback(callback, deps);
}

/**
 * Check if two objects are deeply equal
 * Simplified deep equality check for performance
 */
export function deepEqual(obj1: any, obj2: any): boolean {
  if (obj1 === obj2) return true;
  if (obj1 == null || obj2 == null) return false;
  if (typeof obj1 !== typeof obj2) return false;

  if (typeof obj1 !== 'object') return obj1 === obj2;

  if (Array.isArray(obj1) !== Array.isArray(obj2)) return false;

  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);

  if (keys1.length !== keys2.length) return false;

  for (const key of keys1) {
    if (!keys2.includes(key)) return false;
    if (!deepEqual(obj1[key], obj2[key])) return false;
  }

  return true;
}

/**
 * Memoize a component with custom comparison function
 */
export function memoWithCompare<T extends ComponentType<any>>(
  Component: T,
  compare: (prevProps: any, nextProps: any) => boolean = deepEqual
): T {
  return memo(Component, compare) as T;
}

/**
 * Shallow compare props for React.memo
 */
export function shallowEqual(prevProps: any, nextProps: any): boolean {
  if (prevProps === nextProps) return true;
  if (prevProps == null || nextProps == null) return false;

  const keys1 = Object.keys(prevProps);
  const keys2 = Object.keys(nextProps);

  if (keys1.length !== keys2.length) return false;

  for (const key of keys1) {
    if (prevProps[key] !== nextProps[key]) return false;
  }

  return true;
}

/**
 * Create a debounced callback
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number,
  deps: DependencyList = []
): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback(
    ((...args: Parameters<T>) => {
      const timeoutId = setTimeout(() => {
        callback(...args);
      }, delay);

      return () => clearTimeout(timeoutId);
    }) as T,
    [callback, delay, ...deps]
  );
}

/**
 * Create a throttled callback
 */
export function useThrottledCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number,
  deps: DependencyList = []
): T {
  const lastRunRef = React.useRef<number>(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback(
    ((...args: Parameters<T>) => {
      const now = Date.now();
      if (now - lastRunRef.current >= delay) {
        lastRunRef.current = now;
        callback(...args);
      }
    }) as T,
    [callback, delay, ...deps]
  );
}

