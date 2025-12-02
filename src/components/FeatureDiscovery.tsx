/**
 * Feature Discovery Component
 * Highlights new features and helps users discover functionality
 */

import { useState, useEffect, useCallback } from "react";
import { X, Sparkles, ChevronRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { announceToScreenReader } from "@/utils/accessibility";

interface Feature {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  action?: () => void;
  actionLabel?: string;
  dismissible?: boolean;
  priority?: "high" | "medium" | "low";
  mobileOnly?: boolean; // Only show on mobile/tablet devices
}

interface FeatureDiscoveryProps {
  features?: Feature[];
  storageKey?: string;
  onDismiss?: (featureId: string) => void;
  position?: "top-right" | "top-left" | "bottom-right" | "bottom-left" | "center";
  maxVisible?: number;
}

const DEFAULT_FEATURES: Feature[] = [
  {
    id: "keyboard-shortcuts",
    title: "Keyboard Shortcuts",
    description: "Press '?' to see all available keyboard shortcuts for faster navigation.",
    icon: <Sparkles className="h-5 w-5" />,
    priority: "high",
  },
  {
    id: "swipe-gestures",
    title: "Swipe Gestures",
    description: "Swipe left or right on clips to quickly navigate. Pinch to zoom on images.",
    icon: <Sparkles className="h-5 w-5" />,
    priority: "medium",
    mobileOnly: true, // Only show on mobile/tablet devices
  },
  {
    id: "undo-redo",
    title: "Undo & Redo",
    description: "Made a mistake? Use Ctrl+Z (Cmd+Z on Mac) to undo actions.",
    icon: <Sparkles className="h-5 w-5" />,
    priority: "medium",
  },
  {
    id: "voice-reactions",
    title: "Voice Reactions",
    description: "React to clips with your voice! Click the microphone icon on any clip.",
    icon: <Sparkles className="h-5 w-5" />,
    priority: "high",
  },
];

export const FeatureDiscovery = ({
  features = DEFAULT_FEATURES,
  storageKey = "echo_garden_dismissed_features",
  onDismiss,
  position = "top-right",
  maxVisible = 1,
}: FeatureDiscoveryProps) => {
  const [visibleFeatures, setVisibleFeatures] = useState<Feature[]>([]);
  const [dismissedFeatures, setDismissedFeatures] = useState<Set<string>>(new Set());
  const [isMobile, setIsMobile] = useState(false);
  const [isOnboardingComplete, setIsOnboardingComplete] = useState(false);

  // Check if onboarding/tutorial is complete
  useEffect(() => {
    const checkOnboardingStatus = () => {
      // Check if tutorial is completed
      const tutorialCompleted = localStorage.getItem("echo_garden_tutorial_completed") === "true";
      
      // Check if profile exists (onboarding complete)
      const profileId = localStorage.getItem("profileId");
      const hasProfile = !!profileId;
      
      // Only show features after both tutorial and onboarding are complete
      setIsOnboardingComplete(tutorialCompleted && hasProfile);
    };

    checkOnboardingStatus();
    
    // Listen for storage changes (when tutorial/onboarding completes)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "echo_garden_tutorial_completed" || e.key === "profileId") {
        checkOnboardingStatus();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    // Also check periodically in case storage changes in same window
    const interval = setInterval(checkOnboardingStatus, 1000);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  // Detect if device is mobile/tablet
  useEffect(() => {
    const checkMobile = () => {
      // Check for touch support and screen width
      const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const isSmallScreen = window.innerWidth <= 1024; // Tablets and below
      const isMobileUserAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      
      setIsMobile(hasTouch && (isSmallScreen || isMobileUserAgent));
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Load dismissed features from storage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const dismissed = JSON.parse(stored) as string[];
        setDismissedFeatures(new Set(dismissed));
      }
    } catch (error) {
      console.warn("Failed to load dismissed features:", error);
    }
  }, [storageKey]);

  // Filter and prioritize features
  useEffect(() => {
    // Don't show any features if onboarding/tutorial is not complete
    if (!isOnboardingComplete) {
      setVisibleFeatures([]);
      return;
    }

    const available = features
      .filter((f) => {
        // Filter out dismissed features
        if (dismissedFeatures.has(f.id)) return false;
        // Filter out mobile-only features on desktop
        if (f.mobileOnly && !isMobile) return false;
        return true;
      })
      .sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return (
          (priorityOrder[a.priority || "low"] || 2) -
          (priorityOrder[b.priority || "low"] || 2)
        );
      })
      .slice(0, maxVisible);

    setVisibleFeatures(available);
  }, [features, dismissedFeatures, maxVisible, isMobile, isOnboardingComplete]);

  const dismissFeature = useCallback(
    (featureId: string) => {
      const newDismissed = new Set(dismissedFeatures);
      newDismissed.add(featureId);
      setDismissedFeatures(newDismissed);

      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify(Array.from(newDismissed))
        );
      } catch (error) {
        console.warn("Failed to save dismissed features:", error);
      }

      if (onDismiss) {
        onDismiss(featureId);
      }

      announceToScreenReader("Feature dismissed");
    },
    [dismissedFeatures, storageKey, onDismiss]
  );

  if (visibleFeatures.length === 0) {
    return null;
  }

  const positionClasses = {
    "top-right": "top-4 right-4",
    "top-left": "top-4 left-4",
    "bottom-right": "bottom-4 right-4",
    "bottom-left": "bottom-4 left-4",
    center: "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
  };

  return (
    <div
      className={cn(
        "fixed z-[9998] flex flex-col gap-3 max-w-md",
        positionClasses[position]
      )}
    >
      {visibleFeatures.map((feature) => (
        <Card
          key={feature.id}
          className="shadow-lg border border-primary/20 bg-background/95 backdrop-blur-sm animate-slide-in-right"
        >
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  {feature.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-lg font-semibold">
                    {feature.title}
                  </CardTitle>
                  {feature.priority === "high" && (
                    <Badge variant="secondary" className="mt-1 text-xs">
                      New
                    </Badge>
                  )}
                </div>
              </div>
              {feature.dismissible !== false && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 rounded-full shrink-0"
                  onClick={() => dismissFeature(feature.id)}
                  aria-label="Dismiss feature"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <CardDescription className="text-sm leading-relaxed">
              {feature.description}
            </CardDescription>
            {feature.action && (
              <Button
                onClick={feature.action}
                size="sm"
                className="w-full"
                variant="outline"
              >
                {feature.actionLabel || "Try it"}
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

