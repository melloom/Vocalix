/**
 * Hook for optimistic UI updates
 * Provides a pattern for updating UI immediately, then syncing with server
 */

import { useState, useCallback, useRef, useEffect } from 'react';

export interface OptimisticAction<T> {
  type: string;
  data: T;
  timestamp: number;
  id: string;
}

interface UseOptimisticOptions<T> {
  onSuccess?: (data: T) => void;
  onError?: (error: Error, rollback: () => void) => void;
  timeout?: number;
}

export function useOptimistic<T>(
  initialValue: T,
  updateFn: (current: T, action: OptimisticAction<T>) => T,
  options: UseOptimisticOptions<T> = {}
) {
  const [state, setState] = useState<T>(initialValue);
  const [isPending, setIsPending] = useState(false);
  const historyRef = useRef<T[]>([initialValue]);
  const pendingActionsRef = useRef<Map<string, OptimisticAction<T>>>(new Map());
  const { onSuccess, onError, timeout = 10000 } = options;

  // Initialize history
  useEffect(() => {
    historyRef.current = [initialValue];
    setState(initialValue);
  }, [initialValue]);

  const execute = useCallback(
    async (
      action: OptimisticAction<T>,
      syncFn: () => Promise<T>
    ): Promise<T | null> => {
      // Store original state for rollback
      const originalState = state;
      historyRef.current.push(originalState);

      // Optimistic update
      const optimisticState = updateFn(state, action);
      setState(optimisticState);
      setIsPending(true);
      pendingActionsRef.current.set(action.id, action);

      try {
        // Sync with server
        const serverState = await Promise.race([
          syncFn(),
          new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error('Request timeout')), timeout)
          ),
        ]);

        // Update with server state
        setState(serverState);
        historyRef.current.push(serverState);
        pendingActionsRef.current.delete(action.id);

        if (onSuccess) {
          onSuccess(serverState);
        }

        setIsPending(false);
        return serverState;
      } catch (error) {
        // Rollback on error
        pendingActionsRef.current.delete(action.id);
        setState(originalState);
        historyRef.current = historyRef.current.slice(0, -1);
        setIsPending(false);

        const rollback = () => {
          setState(originalState);
        };

        if (onError) {
          onError(error as Error, rollback);
        }

        throw error;
      }
    },
    [state, updateFn, onSuccess, onError, timeout]
  );

  const rollback = useCallback(() => {
    if (historyRef.current.length > 1) {
      historyRef.current.pop();
      const previousState = historyRef.current[historyRef.current.length - 1];
      setState(previousState);
    }
  }, []);

  return {
    state,
    isPending,
    execute,
    rollback,
    pendingActions: Array.from(pendingActionsRef.current.values()),
  };
}

