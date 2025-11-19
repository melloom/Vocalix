/**
 * Onboarding Progress Component
 * Tracks and displays onboarding progress
 */

import { useState, useEffect, useCallback } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface OnboardingStep {
  id: string;
  title: string;
  description?: string;
  required?: boolean;
}

interface OnboardingProgressProps {
  steps: OnboardingStep[];
  currentStep?: number;
  completedSteps?: string[];
  onStepChange?: (stepId: string) => void;
  storageKey?: string;
  showProgress?: boolean;
  showSteps?: boolean;
}

const DEFAULT_STEPS: OnboardingStep[] = [
  { id: "account-created", title: "Account Created", required: true },
  { id: "profile-complete", title: "Profile Complete", required: true },
  { id: "first-clip", title: "First Clip", required: false },
  { id: "first-follow", title: "Follow a Creator", required: false },
  { id: "tutorial-complete", title: "Tutorial Complete", required: false },
];

export const OnboardingProgress = ({
  steps = DEFAULT_STEPS,
  currentStep,
  completedSteps: externalCompletedSteps,
  onStepChange,
  storageKey = "echo_garden_onboarding_progress",
  showProgress = true,
  showSteps = true,
}: OnboardingProgressProps) => {
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());

  // Load progress from storage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const completed = JSON.parse(stored) as string[];
        setCompletedSteps(new Set(completed));
      } else if (externalCompletedSteps) {
        setCompletedSteps(new Set(externalCompletedSteps));
      }
    } catch (error) {
      console.warn("Failed to load onboarding progress:", error);
      if (externalCompletedSteps) {
        setCompletedSteps(new Set(externalCompletedSteps));
      }
    }
  }, [storageKey, externalCompletedSteps]);

  // Save progress to storage
  const saveProgress = useCallback(
    (completed: Set<string>) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(Array.from(completed)));
      } catch (error) {
        console.warn("Failed to save onboarding progress:", error);
      }
    },
    [storageKey]
  );

  const markComplete = useCallback(
    (stepId: string) => {
      const newCompleted = new Set(completedSteps);
      newCompleted.add(stepId);
      setCompletedSteps(newCompleted);
      saveProgress(newCompleted);

      if (onStepChange) {
        onStepChange(stepId);
      }
    },
    [completedSteps, onStepChange, saveProgress]
  );

  const isComplete = (stepId: string) => completedSteps.has(stepId);

  const currentStepIndex =
    currentStep !== undefined
      ? currentStep
      : steps.findIndex((step) => !completedSteps.has(step.id));

  const progress =
    steps.length > 0 ? (completedSteps.size / steps.length) * 100 : 0;

  const requiredComplete = steps
    .filter((step) => step.required)
    .every((step) => completedSteps.has(step.id));

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg font-semibold">
              Getting Started
            </CardTitle>
            <CardDescription className="mt-1">
              Complete these steps to get the most out of Echo Garden
            </CardDescription>
          </div>
          {requiredComplete && (
            <Badge variant="secondary" className="ml-auto">
              Complete
            </Badge>
          )}
        </div>
        {showProgress && (
          <div className="mt-4 space-y-2">
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-muted-foreground text-right">
              {completedSteps.size} of {steps.length} completed
            </p>
          </div>
        )}
      </CardHeader>
      {showSteps && (
        <CardContent className="space-y-3">
          {steps.map((step, index) => {
            const completed = isComplete(step.id);
            const isCurrent = index === currentStepIndex && !completed;

            return (
              <div
                key={step.id}
                className={cn(
                  "flex items-start gap-3 p-3 rounded-lg transition-colors",
                  isCurrent && "bg-primary/5 border border-primary/20",
                  completed && "opacity-75"
                )}
              >
                <div className="mt-0.5 shrink-0">
                  {completed ? (
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                  ) : (
                    <Circle
                      className={cn(
                        "h-5 w-5",
                        isCurrent ? "text-primary" : "text-muted-foreground"
                      )}
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p
                      className={cn(
                        "font-medium text-sm",
                        completed && "line-through text-muted-foreground"
                      )}
                    >
                      {step.title}
                    </p>
                    {step.required && (
                      <Badge variant="outline" className="text-xs">
                        Required
                      </Badge>
                    )}
                  </div>
                  {step.description && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {step.description}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      )}
    </Card>
  );
};

// Hook to manage onboarding progress
export function useOnboardingProgress(
  storageKey = "echo_garden_onboarding_progress"
) {
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const completed = JSON.parse(stored) as string[];
        setCompletedSteps(new Set(completed));
      }
    } catch (error) {
      console.warn("Failed to load onboarding progress:", error);
    }
  }, [storageKey]);

  const markComplete = useCallback(
    (stepId: string) => {
      const newCompleted = new Set(completedSteps);
      newCompleted.add(stepId);
      setCompletedSteps(newCompleted);

      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify(Array.from(newCompleted))
        );
      } catch (error) {
        console.warn("Failed to save onboarding progress:", error);
      }
    },
    [completedSteps, storageKey]
  );

  const isComplete = useCallback(
    (stepId: string) => completedSteps.has(stepId),
    [completedSteps]
  );

  const reset = useCallback(() => {
    setCompletedSteps(new Set());
    try {
      localStorage.removeItem(storageKey);
    } catch (error) {
      console.warn("Failed to reset onboarding progress:", error);
    }
  }, [storageKey]);

  return {
    completedSteps: Array.from(completedSteps),
    markComplete,
    isComplete,
    reset,
  };
}

