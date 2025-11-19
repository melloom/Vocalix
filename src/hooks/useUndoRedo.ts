/**
 * Hook for undo/redo functionality
 * Manages a history stack and provides undo/redo capabilities
 */

import { useState, useCallback, useRef, useEffect } from 'react';

interface UseUndoRedoOptions<T> {
  maxHistory?: number;
  onUndo?: (state: T) => void;
  onRedo?: (state: T) => void;
}

export function useUndoRedo<T>(
  initialState: T,
  options: UseUndoRedoOptions<T> = {}
) {
  const { maxHistory = 50, onUndo, onRedo } = options;
  const [currentState, setCurrentState] = useState<T>(initialState);
  const historyRef = useRef<T[]>([initialState]);
  const historyIndexRef = useRef<number>(0);

  const canUndo = historyIndexRef.current > 0;
  const canRedo = historyIndexRef.current < historyRef.current.length - 1;

  const push = useCallback(
    (newState: T) => {
      // Remove any states after current index (if we're not at the end)
      if (historyIndexRef.current < historyRef.current.length - 1) {
        historyRef.current = historyRef.current.slice(
          0,
          historyIndexRef.current + 1
        );
      }

      // Add new state
      historyRef.current.push(newState);

      // Enforce max history
      if (historyRef.current.length > maxHistory) {
        historyRef.current.shift();
      } else {
        historyIndexRef.current++;
      }

      setCurrentState(newState);
    },
    [maxHistory]
  );

  const undo = useCallback(() => {
    if (!canUndo) return;

    historyIndexRef.current--;
    const previousState = historyRef.current[historyIndexRef.current];
    setCurrentState(previousState);

    if (onUndo) {
      onUndo(previousState);
    }
  }, [canUndo, onUndo]);

  const redo = useCallback(() => {
    if (!canRedo) return;

    historyIndexRef.current++;
    const nextState = historyRef.current[historyIndexRef.current];
    setCurrentState(nextState);

    if (onRedo) {
      onRedo(nextState);
    }
  }, [canRedo, onRedo]);

  const reset = useCallback(() => {
    historyRef.current = [initialState];
    historyIndexRef.current = 0;
    setCurrentState(initialState);
  }, [initialState]);

  // Update history when initialState changes externally
  useEffect(() => {
    if (historyIndexRef.current === historyRef.current.length - 1) {
      // Only update if we're at the end of history
      const lastState = historyRef.current[historyRef.current.length - 1];
      if (JSON.stringify(lastState) !== JSON.stringify(initialState)) {
        push(initialState);
      }
    }
  }, [initialState, push]);

  return {
    state: currentState,
    push,
    undo,
    redo,
    reset,
    canUndo,
    canRedo,
    historyLength: historyRef.current.length,
    historyIndex: historyIndexRef.current,
  };
}

