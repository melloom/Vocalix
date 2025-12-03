import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { X, ArrowRight, ArrowLeft, Sparkles, Mic, Heart, MessageCircle, UserPlus, Bookmark, Search, Users, Radio, Filter, List, Grid3x3, Upload, Bell, Settings, Hash, PlayCircle, BookOpen, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface TutorialStep {
  id: string;
  title: string;
  description: string;
  targetSelector?: string;
  position?: "top" | "bottom" | "left" | "right" | "center";
  action?: () => void;
  icon: React.ReactNode;
  highlight?: boolean;
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "welcome",
    title: "Welcome to Vocalix",
    description: "The audio-first social platform where voice is everything. Let's take a quick tour to show you how to speak your mind, stay anonymous, and engage with the community. Search by voice, join communities, drop into live rooms, and build your audio world. No BS, just raw voice.",
    position: "center",
    icon: <Sparkles className="h-6 w-6" />,
  },
  {
    id: "record-button",
    title: "Record Your Voice",
    description: "Click the + button in the bottom-right corner (or press 'n' on your keyboard) to record your first voice clip. You can share thoughts, stories, or reactions in 30 seconds or less! The upload button above it lets you bulk upload multiple audio files.",
    targetSelector: '[data-tutorial="record-button"]',
    position: "top",
    icon: <Mic className="h-6 w-6" />,
    highlight: true,
  },
  {
    id: "today-topic",
    title: "Daily Topics",
    description: "Every day, there's a new topic to inspire conversations. Click 'Focus this topic' to see only clips about today's topic, or explore past topics below. Topics help organize conversations around shared themes!",
    targetSelector: '[data-tutorial="today-topic"]',
    position: "bottom",
    icon: <Sparkles className="h-6 w-6" />,
  },
  {
    id: "feed-sorting",
    title: "Feed Sorting",
    description: "Switch between different feed views: Hot (trending now), Top (all-time favorites with time period selector), Controversial (mixed reactions), Rising (gaining traction), or Trending (algorithm picks). Each mode shows clips in a different way!",
    targetSelector: '[data-tutorial="feed-sorting"]',
    position: "bottom",
    icon: <Filter className="h-6 w-6" />,
  },
  {
    id: "view-modes",
    title: "View Modes",
    description: "Toggle between List view (detailed cards) and Compact view (condensed cards) using the view mode buttons. Choose what works best for your browsing style!",
    targetSelector: '[data-tutorial="view-mode"]',
    position: "bottom",
    icon: <Grid3x3 className="h-6 w-6" />,
  },
  {
    id: "filters",
    title: "Filters & Discovery",
    description: "Use filters to find exactly what you want: City filter (Everyone/Near you), Mood filters (😊 🔥 ❤️ 🙏 😔 😂 😮 🧘 💡), and more. These help you discover content that matches your interests!",
    targetSelector: '[data-tutorial="filters"]',
    position: "bottom",
    icon: <Filter className="h-6 w-6" />,
  },
  {
    id: "clip-interactions",
    title: "Interact with Clips",
    description: "Listen to clips by clicking play. React with emojis (😊 🔥 ❤️ 🙏), reply with your voice, remix clips, continue chains, save clips you love, or share them with others! Each clip is a conversation starter.",
    targetSelector: '[data-tutorial="clip-card"]',
    position: "top",
    icon: <Heart className="h-6 w-6" />,
    highlight: true,
  },
  {
    id: "search",
    title: "Search & Discover",
    description: "Press '/' or click the search bar to find clips, creators, topics, or hashtags. Use advanced filters (duration, date range, mood, city, topic) to find exactly what you're looking for! You can also save your favorite searches.",
    targetSelector: '[data-tutorial="search"]',
    position: "bottom",
    icon: <Search className="h-6 w-6" />,
  },
  {
    id: "follow",
    title: "Follow Creators",
    description: "Click on any creator's handle or avatar to visit their profile. Click 'Follow' to see their clips in your Following feed! You can access your Following feed from the header. Build your personalized feed by following voices you love.",
    targetSelector: '[data-tutorial="navigation"]',
    position: "bottom",
    icon: <UserPlus className="h-6 w-6" />,
  },
  {
    id: "communities",
    title: "Communities",
    description: "Join audio communities to connect with like-minded voices! Click the Communities icon in the header to discover themed groups. Join communities, follow them, and participate in community-specific conversations and events.",
    targetSelector: '[data-tutorial="navigation"]',
    position: "bottom",
    icon: <Users className="h-6 w-6" />,
  },
  {
    id: "live-rooms",
    title: "Live Audio Rooms",
    description: "Join real-time voice conversations in Live Rooms! Click the Live Rooms icon to see active rooms. Host your own room, join as a speaker or listener, and engage in live discussions with the community.",
    targetSelector: '[data-tutorial="navigation"]',
    position: "bottom",
    icon: <Radio className="h-6 w-6" />,
  },
  {
    id: "saved-clips",
    title: "Saved Clips & Bookmarks",
    description: "Save clips you love for later! Click the bookmark icon on any clip, then access all your saved clips from the Saved icon in the header. Create playlists and organize your favorite voices into collections.",
    targetSelector: '[data-tutorial="navigation"]',
    position: "bottom",
    icon: <Bookmark className="h-6 w-6" />,
  },
  {
    id: "encrypted-diary",
    title: "Encrypted Diary",
    description: "Keep your private thoughts secure with the encrypted diary! Click the diary icon in the header to access your personal journal. All entries are encrypted with your password or PIN, ensuring complete privacy. Write entries, add tags and moods, pin favorites, and export your memories.",
    targetSelector: '[data-tutorial="diary"]',
    position: "bottom",
    icon: <Lock className="h-6 w-6" />,
  },
  {
    id: "account-linking",
    title: "Link Your Account",
    description: "Use the lock icon in the header to link this device to your account using a PIN! Go to Settings → Account to generate a 4-digit PIN, then enter it on another device to link them. PINs expire after 10 minutes for security.",
    targetSelector: '[data-tutorial="navigation"]',
    position: "bottom",
    icon: <Lock className="h-6 w-6" />,
  },
  {
    id: "notifications",
    title: "Notifications",
    description: "Stay updated with the bell icon in the header! Get notified about new followers, replies to your clips, reactions, and more. Never miss important interactions with your content!",
    targetSelector: '[data-tutorial="navigation"]',
    position: "bottom",
    icon: <Bell className="h-6 w-6" />,
  },
  {
    id: "my-recordings",
    title: "My Recordings",
    description: "Manage all your published clips from the My Recordings page! Access it via the microphone icon in the header. View your clips, see their stats, edit them, and track your voice journey.",
    targetSelector: '[data-tutorial="navigation"]',
    position: "bottom",
    icon: <Mic className="h-6 w-6" />,
  },
  {
    id: "settings",
    title: "Settings & Customization",
    description: "Customize your Echo Garden experience in Settings! Change your handle (with limits), update your avatar, set your city, adjust playback preferences, enable captions by default, and more. Make it yours!",
    targetSelector: '[data-tutorial="navigation"]',
    position: "bottom",
    icon: <Settings className="h-6 w-6" />,
  },
  {
    id: "keyboard-shortcuts",
    title: "Keyboard Shortcuts",
    description: "Speed up your workflow with keyboard shortcuts! Click the keyboard icon in the header to see all available shortcuts. Press '/' to search, 'n' to record, 'd' to toggle dark mode, and more!",
    targetSelector: '[data-tutorial="navigation"]',
    position: "bottom",
    icon: <Sparkles className="h-6 w-6" />,
  },
  {
    id: "advanced-features",
    title: "Advanced Features",
    description: "Explore more: Reply to clips with voice replies, remix clips with your own voice overlay, continue audio story chains, browse by hashtags, filter by city, and discover trending content. There's always something new to explore!",
    position: "center",
    icon: <PlayCircle className="h-6 w-6" />,
  },
  {
    id: "complete",
    title: "You're All Set! 🎉",
    description: "You now know all the amazing features Echo Garden has to offer! Start recording your first clip, explore communities, join live rooms, and share your voice with the world. Welcome to the garden - let your voice bloom! You can always access this tutorial again from Settings.",
    position: "center",
    icon: <Sparkles className="h-6 w-6" />,
  },
];

const TUTORIAL_STORAGE_KEY = "echo_garden_tutorial_completed";

interface InteractiveTutorialProps {
  onComplete: () => void;
}

export const InteractiveTutorial = ({ onComplete }: InteractiveTutorialProps) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const positionUpdateRef = useRef<number | null>(null);
  const isNavigatingRef = useRef(false); // Guard against rapid clicks
  const step = TUTORIAL_STEPS[currentStep];

  // Check if tutorial should be shown
  const shouldShowTutorial = useCallback(() => {
    const completed = localStorage.getItem(TUTORIAL_STORAGE_KEY);
    return !completed;
  }, []);

  // Disable body scroll when tutorial is active
  useEffect(() => {
    const isShowing = shouldShowTutorial();
    if (!isShowing) {
      return;
    }

    // Store original overflow style
    const originalOverflow = document.body.style.overflow;
    const originalPosition = document.body.style.position;
    const originalTop = document.body.style.top;
    const originalWidth = document.body.style.width;

    // Disable scrolling - prevent background from scrolling
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    // Save current scroll position
    const scrollY = window.scrollY;
    document.body.style.top = `-${scrollY}px`;

    // Prevent scroll events on the document
    const preventScroll = (e: WheelEvent | TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    // Prevent wheel and touch scroll events
    document.addEventListener('wheel', preventScroll, { passive: false });
    document.addEventListener('touchmove', preventScroll, { passive: false });

    return () => {
      // Re-enable scrolling when tutorial is closed
      document.body.style.overflow = originalOverflow;
      document.body.style.position = originalPosition;
      document.body.style.top = originalTop;
      document.body.style.width = originalWidth;
      // Restore scroll position
      window.scrollTo(0, scrollY);
      // Remove event listeners
      document.removeEventListener('wheel', preventScroll);
      document.removeEventListener('touchmove', preventScroll);
    };
  }, [shouldShowTutorial]);

  // Mark tutorial as completed
  const markCompleted = useCallback(() => {
    localStorage.setItem(TUTORIAL_STORAGE_KEY, "true");
    // Dispatch custom event so parent component can react immediately
    window.dispatchEvent(new Event("tutorial-completed"));
    onComplete();
  }, [onComplete]);

  // Calculate tooltip position with smooth updates
  const calculatePosition = useCallback(() => {
    if (positionUpdateRef.current) {
      cancelAnimationFrame(positionUpdateRef.current);
    }

    positionUpdateRef.current = requestAnimationFrame(() => {
      if (!step.targetSelector) {
        setTargetElement(null);
        setTooltipPosition(null);
        setHighlightRect(null);
        return;
      }

      // Use a more specific query to avoid matching wrong elements
      let element = document.querySelector(step.targetSelector) as HTMLElement;
      
      // Special handling for specific steps to ensure correct targeting
      if (step.id === "record-button") {
        // Find the fixed bottom-right container specifically
        const allRecordButtons = document.querySelectorAll('[data-tutorial="record-button"]');
        for (const btn of Array.from(allRecordButtons)) {
          if (btn.classList.contains("fixed")) {
            element = btn as HTMLElement;
            break;
          }
        }
      } else if (step.id === "filters") {
        // Find the mood filters container (the one with emoji buttons)
        const allFilters = document.querySelectorAll('[data-tutorial="filters"]');
        for (const filter of Array.from(allFilters)) {
          // Check if this container has emoji buttons or "All moods" text
          const buttons = filter.querySelectorAll('button');
          let hasEmojiButtons = false;
          for (const btn of Array.from(buttons)) {
            if (btn.textContent?.includes("😊") || btn.textContent?.includes("All moods")) {
              hasEmojiButtons = true;
              break;
            }
          }
          if (hasEmojiButtons || filter.textContent?.includes("All moods")) {
            element = filter as HTMLElement;
            break;
          }
        }
        // If no mood filters found, use the first filters container
        if (!element && allFilters.length > 0) {
          element = allFilters[0] as HTMLElement;
        }
      } else if (step.id === "clip-interactions") {
        // Find the first visible clip card
        const clipCard = document.querySelector('[data-tutorial="clip-card"]') as HTMLElement;
        if (clipCard) {
          element = clipCard;
        }
      } else if (step.targetSelector) {
        // For all other steps, ensure we get the correct element
        const found = document.querySelector(step.targetSelector) as HTMLElement;
        if (found) {
          element = found;
        }
      }
      
      if (!element) {
        setTargetElement(null);
        setTooltipPosition(null);
        setHighlightRect(null);
        return;
      }

      setTargetElement(element);
      const rect = element.getBoundingClientRect();
      setHighlightRect(rect);

      const tooltipWidth = Math.min(400, window.innerWidth - 40);
      const tooltipHeight = 280;
      const spacing = 48; // Increased from 24 to give more space from highlighted elements
      const highlightPadding = 12; // Padding around highlight ring
      const viewportPadding = 20;

      let top = 0;
      let left = 0;

      // Calculate spacing that accounts for highlight ring
      const effectiveSpacing = spacing + (step.highlight ? highlightPadding : 0);

      switch (step.position) {
        case "top":
          top = rect.top - tooltipHeight - effectiveSpacing;
          left = rect.left + rect.width / 2 - tooltipWidth / 2;
          break;
        case "bottom":
          top = rect.bottom + effectiveSpacing;
          left = rect.left + rect.width / 2 - tooltipWidth / 2;
          break;
        case "left":
          top = rect.top + rect.height / 2 - tooltipHeight / 2;
          left = rect.left - tooltipWidth - effectiveSpacing;
          break;
        case "right":
          top = rect.top + rect.height / 2 - tooltipHeight / 2;
          left = rect.right + effectiveSpacing;
          break;
        default:
          top = window.innerHeight / 2 - tooltipHeight / 2;
          left = window.innerWidth / 2 - tooltipWidth / 2;
      }

      // Special handling for record button at bottom-right - move tooltip to left side
      if (step.id === "record-button") {
        // Position tooltip to the left of the record button
        left = Math.max(viewportPadding, rect.left - tooltipWidth - effectiveSpacing);
        top = rect.top + rect.height / 2 - tooltipHeight / 2;
        // Keep within viewport
        if (top + tooltipHeight > window.innerHeight - viewportPadding) {
          top = window.innerHeight - tooltipHeight - viewportPadding;
        }
        if (top < viewportPadding) {
          top = viewportPadding;
        }
      }

      // Keep tooltip within viewport with smart positioning
      if (left < viewportPadding) left = viewportPadding;
      if (left + tooltipWidth > window.innerWidth - viewportPadding) {
        left = window.innerWidth - tooltipWidth - viewportPadding;
      }
      if (top < viewportPadding) top = viewportPadding;
      if (top + tooltipHeight > window.innerHeight - viewportPadding) {
        top = window.innerHeight - tooltipHeight - viewportPadding;
      }

      // Adjust if tooltip would overlap with highlighted element (with more generous spacing)
      if (step.highlight && rect) {
        const tooltipBottom = top + tooltipHeight;
        const tooltipRight = left + tooltipWidth;
        const elementTop = rect.top - highlightPadding;
        const elementBottom = rect.bottom + highlightPadding;
        const elementLeft = rect.left - highlightPadding;
        const elementRight = rect.right + highlightPadding;

        // If tooltip overlaps, adjust position more aggressively
        if (
          top < elementBottom + effectiveSpacing &&
          tooltipBottom > elementTop - effectiveSpacing &&
          left < elementRight + effectiveSpacing &&
          tooltipRight > elementLeft - effectiveSpacing
        ) {
          // Move tooltip to a better position - prefer side positioning
          if (step.position === "top" || step.position === "bottom") {
            // Try moving to the right side first
            if (elementRight + effectiveSpacing + tooltipWidth < window.innerWidth - viewportPadding) {
              left = elementRight + effectiveSpacing;
              top = elementTop + (elementBottom - elementTop) / 2 - tooltipHeight / 2;
              // Keep within bounds
              top = Math.max(viewportPadding, Math.min(top, window.innerHeight - tooltipHeight - viewportPadding));
            } else if (elementLeft - effectiveSpacing - tooltipWidth > viewportPadding) {
              // Move to the left side
              left = elementLeft - effectiveSpacing - tooltipWidth;
              top = elementTop + (elementBottom - elementTop) / 2 - tooltipHeight / 2;
              // Keep within bounds
              top = Math.max(viewportPadding, Math.min(top, window.innerHeight - tooltipHeight - viewportPadding));
            } else {
              // If can't fit on sides, move further away vertically
              if (step.position === "top") {
                top = elementTop - tooltipHeight - effectiveSpacing * 1.5;
              } else {
                top = elementBottom + effectiveSpacing * 1.5;
              }
            }
          }
        }
      }

      setTooltipPosition({ top, left });
    });
  }, [step]);

  // Update position on scroll/resize with debouncing
  useEffect(() => {
    if (step.targetSelector) {
      // Don't set transitioning on step change - let it be smooth
      // Initial calculation with minimal delay
      const initialTimeout = setTimeout(() => {
        calculatePosition();
      }, 50);

      let resizeTimeout: NodeJS.Timeout;
      const handleResize = () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
          calculatePosition();
        }, 150); // Increased debounce to reduce lag
      };

      let scrollTimeout: NodeJS.Timeout;
      const handleScroll = () => {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          calculatePosition();
        }, 100); // Increased debounce to reduce lag
      };

      // Throttle theme changes to prevent lag
      let themeChangeTimeout: NodeJS.Timeout;
      const handleThemeChange = () => {
        clearTimeout(themeChangeTimeout);
        themeChangeTimeout = setTimeout(() => {
          calculatePosition();
        }, 200); // Delay position recalculation on theme change
      };

      window.addEventListener("resize", handleResize, { passive: true });
      window.addEventListener("scroll", handleScroll, { passive: true, capture: true });
      // Listen for theme changes (class changes on html/body)
      const observer = new MutationObserver(handleThemeChange);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class']
      });

      // Smooth scroll to element if needed
      let element = document.querySelector(step.targetSelector) as HTMLElement;
      
      // Special handling for record button to ensure we get the right container
      if (step.id === "record-button") {
        const recordContainer = document.querySelector('[data-tutorial="record-button"]') as HTMLElement;
        if (recordContainer && recordContainer.classList.contains("fixed")) {
          // Make sure we got the fixed bottom-right container, not something else
          element = recordContainer;
        }
      }
      
      if (element && step.highlight) {
        const rect = element.getBoundingClientRect();
        const isVisible = 
          rect.top >= 0 &&
          rect.left >= 0 &&
          rect.bottom <= window.innerHeight &&
          rect.right <= window.innerWidth;

        if (!isVisible) {
          element.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
        }
      }

      return () => {
        clearTimeout(initialTimeout);
        clearTimeout(resizeTimeout);
        clearTimeout(scrollTimeout);
        clearTimeout(themeChangeTimeout);
        window.removeEventListener("resize", handleResize);
        window.removeEventListener("scroll", handleScroll, true);
        observer.disconnect();
        if (positionUpdateRef.current) {
          cancelAnimationFrame(positionUpdateRef.current);
        }
      };
    } else {
      setTargetElement(null);
      setTooltipPosition(null);
      setHighlightRect(null);
      setIsTransitioning(false);
    }
  }, [step, calculatePosition]);

  // Add data attributes to elements for targeting
  useEffect(() => {
    // The record button container should already have the data attribute from Index.tsx
    // Just ensure it exists and is properly set
    const recordButtonContainer = document.querySelector('[data-tutorial="record-button"]') as HTMLElement;
    if (recordButtonContainer) {
      // Ensure it's visible and has proper z-index
      recordButtonContainer.style.zIndex = "10000";
    }

    // Mark search input
    const searchInput = document.querySelector('input[placeholder*="Search"], input[type="search"]') as HTMLElement;
    if (searchInput && !searchInput.hasAttribute("data-tutorial")) {
      searchInput.setAttribute("data-tutorial", "search");
    }

    return () => {
      // Cleanup if needed
    };
  }, [currentStep]);

  const handleNext = () => {
    // Prevent rapid clicks
    if (isNavigatingRef.current || isTransitioning) {
      return;
    }
    
    if (currentStep < TUTORIAL_STEPS.length - 1) {
      isNavigatingRef.current = true;
      setIsTransitioning(true);
      // Shorter transition time to reduce flashing
      setTimeout(() => {
        setCurrentStep(currentStep + 1);
        // Small delay before re-enabling to ensure smooth transition
        setTimeout(() => {
          setIsTransitioning(false);
          isNavigatingRef.current = false;
        }, 50);
      }, 200);
    } else {
      isNavigatingRef.current = true;
      markCompleted();
      setTimeout(() => {
        isNavigatingRef.current = false;
      }, 200);
    }
  };

  const handlePrevious = () => {
    // Prevent rapid clicks
    if (isNavigatingRef.current || isTransitioning) {
      return;
    }
    
    if (currentStep > 0) {
      isNavigatingRef.current = true;
      setIsTransitioning(true);
      // Shorter transition time to reduce flashing
      setTimeout(() => {
        setCurrentStep(currentStep - 1);
        // Small delay before re-enabling to ensure smooth transition
        setTimeout(() => {
          setIsTransitioning(false);
          isNavigatingRef.current = false;
        }, 50);
      }, 200);
    }
  };

  const handleSkip = () => {
    // Prevent rapid clicks
    if (isNavigatingRef.current) {
      return;
    }
    isNavigatingRef.current = true;
    markCompleted();
    setTimeout(() => {
      isNavigatingRef.current = false;
    }, 300);
  };

  const progress = ((currentStep + 1) / TUTORIAL_STEPS.length) * 100;

  // Check if tutorial is completed - use direct localStorage check for immediate response
  const isCompleted = typeof window !== 'undefined' && localStorage.getItem(TUTORIAL_STORAGE_KEY) === "true";
  
  // Sync parent state if completed
  useEffect(() => {
    if (isCompleted) {
      onComplete();
    }
  }, [isCompleted, onComplete]);

  // Don't show if already completed
  if (isCompleted || !shouldShowTutorial()) {
    return null;
  }

  // Calculate spotlight position for overlay with smooth transitions
  const spotlightStyle = useMemo(() => {
    if (!highlightRect || !step.highlight) {
      return {};
    }

    const padding = 12;
    const left = Math.max(0, highlightRect.left - padding);
    const top = Math.max(0, highlightRect.top - padding);
    const right = Math.min(window.innerWidth, highlightRect.right + padding);
    const bottom = Math.min(window.innerHeight, highlightRect.bottom + padding);

    return {
      clipPath: `polygon(
        0% 0%, 
        0% 100%, 
        ${left}px 100%, 
        ${left}px ${top}px, 
        ${right}px ${top}px, 
        ${right}px ${bottom}px, 
        ${left}px ${bottom}px, 
        ${left}px 100%, 
        100% 100%, 
        100% 0%
      )`,
      transition: "clip-path 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
    };
  }, [highlightRect, step.highlight]);

  const highlightStyle = useMemo(() => {
    if (!highlightRect || !step.highlight) return null;

    return {
      top: `${highlightRect.top - 12}px`,
      left: `${highlightRect.left - 12}px`,
      width: `${highlightRect.width + 24}px`,
      height: `${highlightRect.height + 24}px`,
      transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
    };
  }, [highlightRect, step.highlight]);

  return (
    <div className="fixed inset-0 z-[99999] pointer-events-none">
      {/* Overlay with spotlight effect */}
      <div
        ref={overlayRef}
        className={cn(
          "absolute inset-0 bg-black/70 backdrop-blur-md transition-all duration-300 ease-in-out pointer-events-none"
        )}
        style={spotlightStyle}
      />

      {/* Highlight ring around target element with smooth animation */}
      {highlightRect && step.highlight && highlightStyle && (
        <div
          className="absolute pointer-events-none rounded-2xl z-[99998]"
          style={highlightStyle}
        >
          <div className="absolute inset-0 border-4 border-primary rounded-2xl shadow-[0_0_30px_rgba(var(--primary),0.6)] animate-pulse" />
          <div className="absolute inset-0 border-4 border-primary/50 rounded-2xl animate-ping" style={{ animationDuration: "2s" }} />
          <div className="absolute -inset-1 bg-primary/20 rounded-2xl blur-xl" />
        </div>
      )}

      {/* Tooltip Card with smooth animations */}
      <div
        ref={tooltipRef}
        className={cn(
          "absolute pointer-events-auto transition-all duration-300 ease-in-out z-[99999]"
        )}
        style={
          tooltipPosition
            ? {
                top: `${tooltipPosition.top}px`,
                left: `${tooltipPosition.left}px`,
                width: "min(400px, 90vw)",
                transform: "scale(1) translateY(0)",
                transition: "top 300ms ease-in-out, left 300ms ease-in-out",
                opacity: isTransitioning ? 0.9 : 1,
              }
            : {
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%) scale(1)",
                width: "min(400px, 90vw)",
                transition: "opacity 300ms ease-in-out",
                opacity: isTransitioning ? 0.9 : 1,
              }
        }
      >
        <Card className="shadow-2xl border border-primary/20 bg-background backdrop-blur-xl">
          <CardHeader className="space-y-3 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-primary/10 text-primary shadow-sm transition-transform hover:scale-110">
                  {step.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-xl font-semibold">{step.title}</CardTitle>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Badge variant="secondary" className="text-xs font-medium">
                      {currentStep + 1} of {TUTORIAL_STEPS.length}
                    </Badge>
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full hover:bg-destructive/10 hover:text-destructive transition-colors"
                onClick={handleSkip}
                aria-label="Skip tutorial"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <Progress value={progress} className="h-2 bg-muted" />
          </CardHeader>
          <CardContent className="space-y-4">
            <CardDescription className="text-base leading-relaxed text-foreground/80">
              {step.description}
            </CardDescription>
            {step.action && (
              <Button 
                onClick={step.action} 
                className="w-full rounded-xl font-medium shadow-sm hover:shadow-md transition-all"
              >
                Try it now
              </Button>
            )}
            <div className="flex items-center justify-between gap-2 pt-2">
              <Button
                variant="outline"
                onClick={handlePrevious}
                disabled={currentStep === 0 || isTransitioning || isNavigatingRef.current}
                className="flex-1 rounded-xl font-medium transition-all disabled:opacity-50"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Previous
              </Button>
              <Button
                onClick={handleNext}
                disabled={isTransitioning || isNavigatingRef.current}
                className="flex-1 rounded-xl font-medium shadow-sm hover:shadow-md transition-all disabled:opacity-50"
              >
                {currentStep === TUTORIAL_STEPS.length - 1 ? "Get Started" : "Next"}
                {currentStep < TUTORIAL_STEPS.length - 1 && (
                  <ArrowRight className="h-4 w-4 ml-2" />
                )}
              </Button>
            </div>
            <Button
              variant="ghost"
              onClick={handleSkip}
              className="w-full text-sm text-muted-foreground hover:text-foreground rounded-xl transition-colors"
            >
              Skip tutorial
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

// Hook to check if tutorial should be shown
export const useTutorial = () => {
  const shouldShow = () => {
    const completed = localStorage.getItem(TUTORIAL_STORAGE_KEY);
    return !completed;
  };

  const markCompleted = () => {
    localStorage.setItem(TUTORIAL_STORAGE_KEY, "true");
  };

  const reset = () => {
    localStorage.removeItem(TUTORIAL_STORAGE_KEY);
  };

  return { shouldShow: shouldShow(), markCompleted, reset };
};

