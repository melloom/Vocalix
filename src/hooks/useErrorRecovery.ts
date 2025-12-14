/**
 * Hook for error recovery with retry logic
 * Provides automatic retry and graceful error handling
 */

import { useState, useCallback, useRef } from 'react';

interface UseErrorRecoveryOptions {
  maxRetries?: number;
  retryDelay?: number;
  exponentialBackoff?: boolean;
  onRetry?: (attempt: number) => void;
  onMaxRetries?: () => void;
}

interface ErrorState {
  error: Error | null;
  hasError: boolean;
  retryCount: number;
  isRetrying: boolean;
}

export function useErrorRecovery<T>(
  asyncFn: (...args: any[]) => Promise<T>,
  options: UseErrorRecoveryOptions = {}
) {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    exponentialBackoff = true,
    onRetry,
    onMaxRetries,
  } = options;

  const [errorState, setErrorState] = useState<ErrorState>({
    error: null,
    hasError: false,
    retryCount: 0,
    isRetrying: false,
  });

  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const retryTimeoutRef = useRef<number | null>(null);

  const calculateDelay = useCallback(
    (attempt: number): number => {
      if (!exponentialBackoff) return retryDelay;
      return retryDelay * Math.pow(2, attempt);
    },
    [retryDelay, exponentialBackoff]
  );

  const execute = useCallback(
    async (...args: any[]): Promise<T | null> => {
      setIsLoading(true);
      setErrorState({
        error: null,
        hasError: false,
        retryCount: 0,
        isRetrying: false,
      });

      let attempt = 0;

      while (attempt <= maxRetries) {
        try {
          const result = await asyncFn(...args);
          setData(result);
          setErrorState({
            error: null,
            hasError: false,
            retryCount: attempt,
            isRetrying: false,
          });
          setIsLoading(false);
          return result;
        } catch (error) {
          attempt++;

          if (attempt > maxRetries) {
            // Max retries reached
            setErrorState({
              error: error as Error,
              hasError: true,
              retryCount: attempt - 1,
              isRetrying: false,
            });
            setIsLoading(false);

            if (onMaxRetries) {
              onMaxRetries();
            }
            return null;
          }

          // Will retry
          setErrorState({
            error: error as Error,
            hasError: true,
            retryCount: attempt - 1,
            isRetrying: true,
          });

          if (onRetry) {
            onRetry(attempt);
          }

          // Wait before retrying
          const delay = calculateDelay(attempt - 1);
          await new Promise((resolve) => {
            retryTimeoutRef.current = window.setTimeout(resolve, delay);
          });
        }
      }

      setIsLoading(false);
      return null;
    },
    [
      asyncFn,
      maxRetries,
      calculateDelay,
      onRetry,
      onMaxRetries,
    ]
  );

  const retry = useCallback(
    (...args: any[]) => {
      return execute(...args);
    },
    [execute]
  );

  const clearError = useCallback(() => {
    setErrorState({
      error: null,
      hasError: false,
      retryCount: 0,
      isRetrying: false,
    });
  }, []);

  // Cleanup timeout on unmount
  const cleanup = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, []);

  return {
    data,
    isLoading,
    error: errorState.error,
    hasError: errorState.hasError,
    retryCount: errorState.retryCount,
    isRetrying: errorState.isRetrying,
    execute,
    retry,
    clearError,
    cleanup,
  };
}

