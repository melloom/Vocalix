/**
 * First Clip Guidance Component
 * Helps users create their first clip with step-by-step guidance
 * Only shows after account creation, tutorial completion, and if user hasn't created clips yet
 */

import { useState, useEffect } from "react";
import { Mic, ArrowRight, X, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { announceToScreenReader } from "@/utils/accessibility";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface GuidanceStep {
  id: string;
  title: string;
  description: string;
  action?: () => void;
  actionLabel?: string;
}

const GUIDANCE_STEPS: GuidanceStep[] = [
  {
    id: "welcome",
    title: "Ready to Create Your First Clip? 🎙️",
    description: "Now that you've explored Echo Garden, let's help you record and share your first voice clip. It's quick and easy!",
    actionLabel: "Let's Go",
  },
  {
    id: "find-record",
    title: "Find the Record Button",
    description: "Look for the + button in the bottom-right corner, or press 'n' on your keyboard.",
    actionLabel: "Show Me",
  },
  {
    id: "click-record",
    title: "Click to Record",
    description: "When you're ready, click the record button and start speaking. You have up to 30 seconds!",
    actionLabel: "Start Recording",
  },
  {
    id: "add-details",
    title: "Add Details (Optional)",
    description: "Add a title, topic, or mood to help others discover your clip.",
  },
  {
    id: "publish",
    title: "Publish Your Clip",
    description: "Click 'Publish' when you're happy with your recording. You can always edit it later!",
    actionLabel: "I Understand",
  },
];

interface FirstClipGuidanceProps {
  onComplete?: () => void;
  onDismiss?: () => void;
  storageKey?: string;
  onStartRecording?: () => void;
}

const TUTORIAL_STORAGE_KEY = "echo_garden_tutorial_completed";

export const FirstClipGuidance = ({
  onComplete,
  onDismiss,
  storageKey = "echo_garden_first_clip_guidance_completed",
  onStartRecording,
}: FirstClipGuidanceProps) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const { profile, isLoading: isProfileLoading } = useAuth();

  useEffect(() => {
    const checkShouldShow = async () => {
      setIsChecking(true);
      
      try {
        // 1. Check if guidance was already completed
        const completed = localStorage.getItem(storageKey);
        if (completed) {
          setIsVisible(false);
          setIsChecking(false);
          return;
        }

        // 2. Wait for profile to load
        if (isProfileLoading) {
          return; // Will re-run when profile loads
        }

        // 3. Check if user has created an account (has a profile)
        if (!profile?.id) {
          setIsVisible(false);
          setIsChecking(false);
          return;
        }

        // 4. Check if tutorial is completed
        const tutorialCompleted = localStorage.getItem(TUTORIAL_STORAGE_KEY);
        if (!tutorialCompleted) {
          setIsVisible(false);
          setIsChecking(false);
          return;
        }

        // 5. Check if user has already created clips
        const { data: clips, error } = await supabase
          .from("clips")
          .select("id")
          .eq("profile_id", profile.id)
          .in("status", ["live", "processing"])
          .limit(1);

        if (error) {
          console.warn("Failed to check clips:", error);
          // If we can't check, don't show guidance to be safe
          setIsVisible(false);
          setIsChecking(false);
          return;
        }

        // 6. Only show if user hasn't created any clips yet
        if (clips && clips.length > 0) {
          // User has clips, mark guidance as completed
          localStorage.setItem(storageKey, "true");
          setIsVisible(false);
          setIsChecking(false);
          return;
        }

        // All conditions met - show guidance
        setIsVisible(true);
        announceToScreenReader("First clip guidance available");
      } catch (error) {
        console.warn("Failed to check guidance status:", error);
        setIsVisible(false);
      } finally {
        setIsChecking(false);
      }
    };

    checkShouldShow();
  }, [storageKey, profile?.id, isProfileLoading]);

  const markCompleted = () => {
    try {
      localStorage.setItem(storageKey, "true");
      setIsVisible(false);
      if (onComplete) {
        onComplete();
      }
      announceToScreenReader("Guidance completed");
    } catch (error) {
      console.warn("Failed to save guidance status:", error);
    }
  };

  const handleDismiss = () => {
    markCompleted();
    if (onDismiss) {
      onDismiss();
    }
  };

  const handleNext = () => {
    if (currentStep < GUIDANCE_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      markCompleted();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleAction = () => {
    const step = GUIDANCE_STEPS[currentStep];
    if (step.id === "click-record" && onStartRecording) {
      onStartRecording();
      markCompleted();
    } else if (step.action) {
      step.action();
    } else {
      handleNext();
    }
  };

  // Don't show anything while checking or if not visible
  if (isChecking || !isVisible) {
    return null;
  }

  const step = GUIDANCE_STEPS[currentStep];
  const progress = ((currentStep + 1) / GUIDANCE_STEPS.length) * 100;

  return (
    <div className="fixed inset-0 z-[10000] pointer-events-none">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm pointer-events-auto" />
      <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
        <Card className="w-full max-w-md shadow-2xl pointer-events-auto animate-scale-in">
          <CardHeader className="space-y-3 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                  <Mic className="h-6 w-6" />
                </div>
                <div>
                  <CardTitle className="text-xl font-semibold">
                    {step.title}
                  </CardTitle>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">
                      Step {currentStep + 1} of {GUIDANCE_STEPS.length}
                    </span>
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full"
                onClick={handleDismiss}
                aria-label="Dismiss guidance"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <Progress value={progress} className="h-2" />
          </CardHeader>
          <CardContent className="space-y-4">
            <CardDescription className="text-base leading-relaxed">
              {step.description}
            </CardDescription>
            <div className="flex items-center justify-between gap-2 pt-2">
              <Button
                variant="outline"
                onClick={handlePrevious}
                disabled={currentStep === 0}
              >
                Previous
              </Button>
              <Button onClick={handleAction} className="flex-1">
                {step.actionLabel || "Next"}
                {step.actionLabel && (
                  <ArrowRight className="h-4 w-4 ml-2" />
                )}
              </Button>
            </div>
            <Button
              variant="ghost"
              onClick={handleDismiss}
              className="w-full text-sm text-muted-foreground hover:text-foreground"
            >
              Skip guidance
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

