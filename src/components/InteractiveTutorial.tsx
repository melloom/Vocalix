import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { X, ArrowRight, ArrowLeft, Sparkles, Mic, Heart, MessageCircle, UserPlus, Bookmark, Search } from "lucide-react";
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
    title: "Welcome to Echo Garden! 🌱",
    description: "Let's take a quick tour to help you get started. This will only take a minute!",
    position: "center",
    icon: <Sparkles className="h-6 w-6" />,
  },
  {
    id: "record-button",
    title: "Record Your Voice",
    description: "Click the + button in the bottom-right corner (or press 'n' on your keyboard) to record your first voice clip. You can share thoughts, stories, or reactions in 30 seconds or less!",
    targetSelector: '[data-tutorial="record-button"]',
    position: "top",
    icon: <Mic className="h-6 w-6" />,
    highlight: true,
  },
  {
    id: "today-topic",
    title: "Daily Topics",
    description: "Every day, there's a new topic to inspire conversations. Click 'Focus this topic' to see only clips about today's topic, or explore past topics below.",
    targetSelector: '[data-tutorial="today-topic"]',
    position: "bottom",
    icon: <Sparkles className="h-6 w-6" />,
  },
  {
    id: "feed-sorting",
    title: "Feed Sorting",
    description: "Switch between different feed views: Hot (trending now), Top (all-time favorites), Controversial (mixed reactions), Rising (gaining traction), or Trending (algorithm picks).",
    targetSelector: '[data-tutorial="feed-sorting"]',
    position: "bottom",
    icon: <Sparkles className="h-6 w-6" />,
  },
  {
    id: "clip-interactions",
    title: "Interact with Clips",
    description: "Listen to clips by clicking play. React with emojis (😊 🔥 ❤️ 🙏), reply with your voice, save clips you love, or share them with others!",
    targetSelector: '[data-tutorial="clip-card"]',
    position: "top",
    icon: <Heart className="h-6 w-6" />,
    highlight: true,
  },
  {
    id: "search",
    title: "Search & Discover",
    description: "Press '/' or click the search bar to find clips, creators, topics, or hashtags. Use advanced filters to find exactly what you're looking for!",
    targetSelector: '[data-tutorial="search"]',
    position: "bottom",
    icon: <Search className="h-6 w-6" />,
  },
  {
    id: "follow",
    title: "Follow Creators",
    description: "Click on any creator's handle or avatar to visit their profile. Click 'Follow' to see their clips in your Following feed! You can access your Following feed from the header.",
    targetSelector: '[data-tutorial="navigation"]',
    position: "bottom",
    icon: <UserPlus className="h-6 w-6" />,
  },
  {
    id: "navigation",
    title: "Navigation",
    description: "Use the header icons to explore: Communities, Live Rooms, Following feed, Saved clips, Your recordings, and Settings. Everything is just a click away!",
    targetSelector: '[data-tutorial="navigation"]',
    position: "bottom",
    icon: <Sparkles className="h-6 w-6" />,
  },
  {
    id: "complete",
    title: "You're All Set! 🎉",
    description: "You now know the basics of Echo Garden. Start recording your first clip, explore the community, and share your voice! You can always access this tutorial again from Settings.",
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
  const step = TUTORIAL_STEPS[currentStep];

  // Check if tutorial should be shown
  const shouldShowTutorial = useCallback(() => {
    const completed = localStorage.getItem(TUTORIAL_STORAGE_KEY);
    return !completed;
  }, []);

  // Mark tutorial as completed
  const markCompleted = useCallback(() => {
    localStorage.setItem(TUTORIAL_STORAGE_KEY, "true");
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

      const element = document.querySelector(step.targetSelector) as HTMLElement;
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
      const spacing = 24;
      const viewportPadding = 20;

      let top = 0;
      let left = 0;

      switch (step.position) {
        case "top":
          top = rect.top - tooltipHeight - spacing;
          left = rect.left + rect.width / 2 - tooltipWidth / 2;
          break;
        case "bottom":
          top = rect.bottom + spacing;
          left = rect.left + rect.width / 2 - tooltipWidth / 2;
          break;
        case "left":
          top = rect.top + rect.height / 2 - tooltipHeight / 2;
          left = rect.left - tooltipWidth - spacing;
          break;
        case "right":
          top = rect.top + rect.height / 2 - tooltipHeight / 2;
          left = rect.right + spacing;
          break;
        default:
          top = window.innerHeight / 2 - tooltipHeight / 2;
          left = window.innerWidth / 2 - tooltipWidth / 2;
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

      // Adjust if tooltip would overlap with highlighted element
      if (step.highlight && highlightRect) {
        const tooltipBottom = top + tooltipHeight;
        const tooltipRight = left + tooltipWidth;
        const elementTop = highlightRect.top;
        const elementBottom = highlightRect.bottom;
        const elementLeft = highlightRect.left;
        const elementRight = highlightRect.right;

        // If tooltip overlaps, adjust position
        if (
          top < elementBottom + spacing &&
          tooltipBottom > elementTop - spacing &&
          left < elementRight + spacing &&
          tooltipRight > elementLeft - spacing
        ) {
          // Move tooltip to a better position
          if (step.position === "bottom" || step.position === "top") {
            // Try moving to the side
            if (elementRight + spacing + tooltipWidth < window.innerWidth - viewportPadding) {
              left = elementRight + spacing;
              top = elementTop + element.height / 2 - tooltipHeight / 2;
            } else if (elementLeft - spacing - tooltipWidth > viewportPadding) {
              left = elementLeft - spacing - tooltipWidth;
              top = elementTop + element.height / 2 - tooltipHeight / 2;
            }
          }
        }
      }

      setTooltipPosition({ top, left });
    });
  }, [step, highlightRect]);

  // Update position on scroll/resize with debouncing
  useEffect(() => {
    if (step.targetSelector) {
      setIsTransitioning(true);
      
      // Initial calculation with delay for smooth transition
      const initialTimeout = setTimeout(() => {
        calculatePosition();
        setIsTransitioning(false);
      }, 150);

      let resizeTimeout: NodeJS.Timeout;
      const handleResize = () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
          calculatePosition();
        }, 100);
      };

      let scrollTimeout: NodeJS.Timeout;
      const handleScroll = () => {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          calculatePosition();
        }, 50);
      };

      window.addEventListener("resize", handleResize, { passive: true });
      window.addEventListener("scroll", handleScroll, { passive: true, capture: true });

      // Smooth scroll to element if needed
      const element = document.querySelector(step.targetSelector) as HTMLElement;
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
        window.removeEventListener("resize", handleResize);
        window.removeEventListener("scroll", handleScroll, true);
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
    // Add data attributes to key elements
    const recordButton = document.querySelector('button[aria-label*="record"], button:has(svg)') as HTMLElement;
    if (recordButton && !recordButton.closest('[data-tutorial="record-button"]')) {
      const wrapper = document.createElement("div");
      wrapper.setAttribute("data-tutorial", "record-button");
      wrapper.style.position = "relative";
      wrapper.style.zIndex = "10000";
      recordButton.parentNode?.insertBefore(wrapper, recordButton);
      wrapper.appendChild(recordButton);
    }

    // Mark other elements
    const searchInput = document.querySelector('input[placeholder*="Search"], input[type="search"]') as HTMLElement;
    if (searchInput) {
      searchInput.setAttribute("data-tutorial", "search");
    }

    return () => {
      // Cleanup if needed
    };
  }, [currentStep]);

  const handleNext = () => {
    if (currentStep < TUTORIAL_STEPS.length - 1) {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentStep(currentStep + 1);
        setIsTransitioning(false);
      }, 200);
    } else {
      markCompleted();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentStep(currentStep - 1);
        setIsTransitioning(false);
      }, 200);
    }
  };

  const handleSkip = () => {
    markCompleted();
  };

  const progress = ((currentStep + 1) / TUTORIAL_STEPS.length) * 100;

  // Don't show if already completed
  if (!shouldShowTutorial()) {
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
    <div className="fixed inset-0 z-[9999] pointer-events-none">
      {/* Overlay with spotlight effect */}
      <div
        ref={overlayRef}
        className={cn(
          "absolute inset-0 bg-black/70 backdrop-blur-md transition-all duration-500",
          isTransitioning && "opacity-0"
        )}
        style={spotlightStyle}
      />

      {/* Highlight ring around target element with smooth animation */}
      {highlightRect && step.highlight && highlightStyle && (
        <div
          className="absolute pointer-events-none rounded-2xl z-[10001]"
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
          "absolute pointer-events-auto transition-all duration-500 ease-out",
          isTransitioning && "opacity-0 scale-95 translate-y-2"
        )}
        style={
          tooltipPosition
            ? {
                top: `${tooltipPosition.top}px`,
                left: `${tooltipPosition.left}px`,
                width: "min(400px, 90vw)",
                transform: isTransitioning ? "scale(0.95) translateY(8px)" : "scale(1) translateY(0)",
              }
            : {
                top: "50%",
                left: "50%",
                transform: isTransitioning 
                  ? "translate(-50%, -45%) scale(0.95)" 
                  : "translate(-50%, -50%) scale(1)",
                width: "min(400px, 90vw)",
              }
        }
      >
        <Card className="shadow-2xl border-2 border-primary/30 bg-background/95 backdrop-blur-xl">
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
                      Step {currentStep + 1} of {TUTORIAL_STEPS.length}
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
                disabled={currentStep === 0 || isTransitioning}
                className="flex-1 rounded-xl font-medium transition-all disabled:opacity-50"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Previous
              </Button>
              <Button
                onClick={handleNext}
                disabled={isTransitioning}
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

