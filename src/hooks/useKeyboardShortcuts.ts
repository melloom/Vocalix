/**
 * Centralized keyboard shortcuts hook
 * Provides keyboard shortcuts for common actions across the app
 */

import { useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAudioPlayer } from '@/context/AudioPlayerContext';
import { useProfile } from '@/hooks/useProfile';

interface KeyboardShortcutsOptions {
  onFocusSearch?: () => void;
  onNewRecording?: () => void;
  onToggleTheme?: () => void;
  onOpenMessages?: () => void;
  onOpenProfile?: () => void;
  onOpenNotifications?: () => void;
  onSaveClip?: () => void;
  onReact?: () => void;
  onComment?: () => void;
  onShare?: () => void;
  onNavigateUp?: () => void;
  onNavigateDown?: () => void;
  onNavigateNext?: () => void;
  onNavigatePrevious?: () => void;
  onGoHome?: () => void;
  onGoTrending?: () => void;
  onGoForYou?: () => void;
  onGoSaved?: () => void;
  onShowShortcuts?: () => void;
  enabled?: boolean;
}

export const useKeyboardShortcuts = (options: KeyboardShortcutsOptions = {}) => {
  const navigate = useNavigate();
  const { togglePlayPause, seek, currentClip, duration, progress, playbackRate, setPlaybackRate } = useAudioPlayer();
  const { profile } = useProfile();
  const keySequenceRef = useRef<string[]>([]);
  const sequenceTimeoutRef = useRef<number | null>(null);

  const {
    onFocusSearch,
    onNewRecording,
    onToggleTheme,
    onOpenMessages,
    onOpenProfile,
    onOpenNotifications,
    onSaveClip,
    onReact,
    onComment,
    onShare,
    onNavigateUp,
    onNavigateDown,
    onNavigateNext,
    onNavigatePrevious,
    onGoHome,
    onGoTrending,
    onGoForYou,
    onGoSaved,
    onShowShortcuts,
    enabled = true,
  } = options;

  // Clear key sequence after timeout
  const clearSequence = useCallback(() => {
    if (sequenceTimeoutRef.current) {
      clearTimeout(sequenceTimeoutRef.current);
    }
    sequenceTimeoutRef.current = window.setTimeout(() => {
      keySequenceRef.current = [];
    }, 1000);
  }, []);

  // Handle 'g' key sequences (like vim)
  const handleGSequence = useCallback((key: string) => {
    keySequenceRef.current.push(key);
    clearSequence();

    if (keySequenceRef.current.length === 2) {
      const sequence = keySequenceRef.current.join('');
      
      switch (sequence) {
        case 'gg':
          // Go to top
          window.scrollTo({ top: 0, behavior: 'smooth' });
          keySequenceRef.current = [];
          return true;
        case 'gh':
          // Go home
          if (onGoHome) {
            onGoHome();
          } else {
            navigate('/');
          }
          keySequenceRef.current = [];
          return true;
        case 'gt':
          // Go trending
          if (onGoTrending) {
            onGoTrending();
          } else {
            navigate('/?sort=trending');
          }
          keySequenceRef.current = [];
          return true;
        case 'gf':
          // Go for you
          if (onGoForYou) {
            onGoForYou();
          } else {
            navigate('/?sort=for_you');
          }
          keySequenceRef.current = [];
          return true;
        case 'gs':
          // Go saved
          if (onGoSaved) {
            onGoSaved();
          } else {
            navigate('/saved');
          }
          keySequenceRef.current = [];
          return true;
        default:
          keySequenceRef.current = [];
          return false;
      }
    }
    return false;
  }, [navigate, onGoHome, onGoTrending, onGoForYou, onGoSaved, clearSequence]);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs or textareas
      const target = event.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || 
                     target.tagName === 'TEXTAREA' || 
                     target.isContentEditable ||
                     target.getAttribute('role') === 'textbox';

      // Allow some shortcuts even in inputs (like Escape)
      if (isInput && event.key !== 'Escape' && event.key !== 'Enter') {
        return;
      }

      // Handle modifier keys
      const hasModifier = event.ctrlKey || event.metaKey || event.altKey || event.shiftKey;

      // Space bar - Play/pause (only if not in input)
      if (event.key === ' ' && !isInput && !hasModifier) {
        event.preventDefault();
        if (currentClip) {
          togglePlayPause();
        }
        return;
      }

      // Arrow keys for navigation (only if not in input)
      if (!isInput && !hasModifier) {
        switch (event.key) {
          case 'ArrowUp':
            event.preventDefault();
            if (onNavigateUp) {
              onNavigateUp();
            } else {
              // Default: scroll up
              window.scrollBy({ top: -100, behavior: 'smooth' });
            }
            return;
          case 'ArrowDown':
            event.preventDefault();
            if (onNavigateDown) {
              onNavigateDown();
            } else {
              // Default: scroll down
              window.scrollBy({ top: 100, behavior: 'smooth' });
            }
            return;
          case 'ArrowLeft':
            event.preventDefault();
            if (onNavigatePrevious) {
              onNavigatePrevious();
            } else if (currentClip && duration > 0) {
              // Seek backward 5 seconds
              const newTime = Math.max(0, progress - 5);
              seek(newTime);
            }
            return;
          case 'ArrowRight':
            event.preventDefault();
            if (onNavigateNext) {
              onNavigateNext();
            } else if (currentClip && duration > 0) {
              // Seek forward 5 seconds
              const newTime = Math.min(duration, progress + 5);
              seek(newTime);
            }
            return;
        }
      }

      // Single key shortcuts (only if no modifier and not in input)
      if (!hasModifier && !isInput) {
        switch (event.key.toLowerCase()) {
          case '/':
            event.preventDefault();
            if (onFocusSearch) {
              onFocusSearch();
            }
            return;
          case 'n':
            event.preventDefault();
            if (onNewRecording) {
              onNewRecording();
            }
            return;
          case 'd':
            event.preventDefault();
            if (onToggleTheme) {
              onToggleTheme();
            }
            return;
          case 'm':
            event.preventDefault();
            if (onOpenMessages) {
              onOpenMessages();
            } else {
              navigate('/messages');
            }
            return;
          case 'p':
            event.preventDefault();
            if (onOpenProfile) {
              onOpenProfile();
            } else if (profile?.handle) {
              navigate(`/profile/${profile.handle}`);
            }
            return;
          case 's':
            event.preventDefault();
            if (onSaveClip) {
              onSaveClip();
            }
            return;
          case 'r':
            event.preventDefault();
            if (onReact) {
              onReact();
            }
            return;
          case 'c':
            event.preventDefault();
            if (onComment) {
              onComment();
            }
            return;
          case '?':
            event.preventDefault();
            if (onShowShortcuts) {
              onShowShortcuts();
            }
            return;
          case 'j':
            event.preventDefault();
            // Navigate down (vim-style)
            if (onNavigateDown) {
              onNavigateDown();
            } else {
              window.scrollBy({ top: 100, behavior: 'smooth' });
            }
            return;
          case 'k':
            event.preventDefault();
            // Navigate up (vim-style)
            if (onNavigateUp) {
              onNavigateUp();
            } else {
              window.scrollBy({ top: -100, behavior: 'smooth' });
            }
            return;
          case 'g':
            event.preventDefault();
            handleGSequence('g');
            return;
          case 'h':
            if (keySequenceRef.current.length === 1 && keySequenceRef.current[0] === 'g') {
              event.preventDefault();
              handleGSequence('h');
            }
            return;
          case 't':
            if (keySequenceRef.current.length === 1 && keySequenceRef.current[0] === 'g') {
              event.preventDefault();
              handleGSequence('t');
            }
            return;
          case 'f':
            if (keySequenceRef.current.length === 1 && keySequenceRef.current[0] === 'g') {
              event.preventDefault();
              handleGSequence('f');
            } else if (!keySequenceRef.current.length) {
              event.preventDefault();
              if (onGoForYou) {
                onGoForYou();
              } else {
                navigate('/?sort=for_you');
              }
            }
            return;
        }
      }

      // Number keys for playback speed (1-5 = 0.5x to 2.0x)
      if (!hasModifier && !isInput && event.key >= '1' && event.key <= '5') {
        const speeds = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
        const speedIndex = parseInt(event.key) - 1;
        if (speedIndex >= 0 && speedIndex < speeds.length) {
          event.preventDefault();
          setPlaybackRate(speeds[speedIndex]);
        }
        return;
      }

      // Undo/Redo (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z)
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key === 'z') {
        event.preventDefault();
        // Undo functionality - will be handled by components using undo hook
        return;
      }
      if ((event.ctrlKey || event.metaKey) && (event.key === 'y' || (event.shiftKey && event.key === 'z'))) {
        event.preventDefault();
        // Redo functionality - will be handled by components using redo hook
        return;
      }

      // Additional shortcuts
      if (!hasModifier && !isInput) {
        switch (event.key.toLowerCase()) {
          case 'h':
            event.preventDefault();
            if (onGoHome) {
              onGoHome();
            } else {
              navigate('/');
            }
            return;
          case 'u':
            event.preventDefault();
            if (onOpenProfile) {
              onOpenProfile();
            } else if (profile?.handle) {
              navigate(`/profile/${profile.handle}`);
            }
            return;
          case 'i':
            event.preventDefault();
            if (onGoSaved) {
              onGoSaved();
            } else {
              navigate('/saved');
            }
            return;
          case 'a':
            event.preventDefault();
            navigate('/activity');
            return;
          case 'l':
            event.preventDefault();
            if (onReact) {
              onReact();
            }
            return;
          case 'b':
            event.preventDefault();
            if (onSaveClip) {
              onSaveClip();
            }
            return;
        }
      }

      // Escape - Close modals, clear search, etc.
      if (event.key === 'Escape') {
        if (isInput && target.tagName === 'INPUT') {
          // Clear search if in search input
          if (onFocusSearch && target.getAttribute('type') === 'search') {
            (target as HTMLInputElement).value = '';
          }
        }
        // Let Escape bubble up for modal closing
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (sequenceTimeoutRef.current) {
        clearTimeout(sequenceTimeoutRef.current);
      }
    };
  }, [
    enabled,
    currentClip,
    duration,
    progress,
    playbackRate,
    profile,
    navigate,
    togglePlayPause,
    seek,
    setPlaybackRate,
    onFocusSearch,
    onNewRecording,
    onToggleTheme,
    onOpenMessages,
    onOpenProfile,
    onSaveClip,
    onReact,
    onComment,
    onGoHome,
    onGoTrending,
    onGoForYou,
    onGoSaved,
    onShowShortcuts,
    onNavigateUp,
    onNavigateDown,
    onNavigateNext,
    onNavigatePrevious,
    handleGSequence,
    clearSequence,
  ]);
};

