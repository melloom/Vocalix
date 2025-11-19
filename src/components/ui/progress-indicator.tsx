/**
 * Enhanced Progress Indicator Component
 * Provides various progress indicator styles
 */

import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProgressIndicatorProps {
  value?: number;
  max?: number;
  size?: "sm" | "md" | "lg";
  variant?: "default" | "success" | "error" | "spinner" | "pulse";
  showLabel?: boolean;
  label?: string;
  className?: string;
}

export const ProgressIndicator = ({
  value,
  max = 100,
  size = "md",
  variant = "default",
  showLabel = false,
  label,
  className,
}: ProgressIndicatorProps) => {
  const percentage = value !== undefined ? (value / max) * 100 : undefined;

  const sizeClasses = {
    sm: "h-1",
    md: "h-2",
    lg: "h-3",
  };

  const spinnerSizeClasses = {
    sm: "h-4 w-4",
    md: "h-6 w-6",
    lg: "h-8 w-8",
  };

  if (variant === "spinner") {
    return (
      <div className={cn("flex items-center justify-center", className)}>
        <Loader2
          className={cn(
            "animate-spin text-primary",
            spinnerSizeClasses[size]
          )}
        />
      </div>
    );
  }

  if (variant === "pulse") {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <div className="relative flex items-center justify-center">
          <div
            className={cn(
              "rounded-full bg-primary animate-pulse-soft",
              sizeClasses[size],
              size === "sm" ? "w-1" : size === "md" ? "w-2" : "w-3"
            )}
          />
        </div>
        {showLabel && label && (
          <span className="text-sm text-muted-foreground">{label}</span>
        )}
      </div>
    );
  }

  const variantClasses = {
    default: "bg-primary",
    success: "bg-green-500",
    error: "bg-destructive",
  };

  return (
    <div className={cn("w-full space-y-2", className)}>
      {showLabel && (
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">
            {label || "Progress"}
          </span>
          {percentage !== undefined && (
            <span className="text-sm text-muted-foreground">
              {Math.round(percentage)}%
            </span>
          )}
        </div>
      )}
      <div
        className={cn(
          "relative w-full rounded-full bg-muted overflow-hidden",
          sizeClasses[size]
        )}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300 ease-out",
            variantClasses[variant]
          )}
          style={{
            width: percentage !== undefined ? `${percentage}%` : "100%",
          }}
        />
      </div>
    </div>
  );
};

interface StepProgressProps {
  steps: string[];
  currentStep: number;
  completed?: boolean;
  error?: boolean;
  className?: string;
}

export const StepProgress = ({
  steps,
  currentStep,
  completed = false,
  error = false,
  className,
}: StepProgressProps) => {
  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const isCompleted = index < currentStep || completed;
          const isCurrent = index === currentStep && !completed && !error;
          const isError = index === currentStep && error;

          return (
            <div key={index} className="flex-1 flex items-center">
              <div className="flex flex-col items-center flex-1">
                <div
                  className={cn(
                    "h-8 w-8 rounded-full flex items-center justify-center border-2 transition-all",
                    isCompleted &&
                      !isError &&
                      "bg-primary border-primary text-primary-foreground",
                    isCurrent && "border-primary bg-primary/10 text-primary",
                    isError && "bg-destructive border-destructive text-destructive-foreground",
                    !isCompleted &&
                      !isCurrent &&
                      !isError &&
                      "border-muted-foreground/30 text-muted-foreground"
                  )}
                >
                  {isCompleted && !isError && (
                    <CheckCircle2 className="h-5 w-5" />
                  )}
                  {isError && <AlertCircle className="h-5 w-5" />}
                  {!isCompleted && !isError && (
                    <span className="text-sm font-medium">{index + 1}</span>
                  )}
                </div>
                <span
                  className={cn(
                    "mt-2 text-xs text-center max-w-[80px] truncate",
                    isCurrent && "font-medium text-foreground",
                    !isCurrent && "text-muted-foreground"
                  )}
                >
                  {step}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    "h-0.5 flex-1 mx-2 transition-colors",
                    index < currentStep
                      ? "bg-primary"
                      : "bg-muted-foreground/30"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

