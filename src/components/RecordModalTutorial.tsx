import { useState, useEffect, useRef, useCallback } from "react";
import { X, ArrowRight, ArrowLeft, Mic, Upload, Radio, Smile, Type, Hash, Scissors, Lock, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface RecordModalTutorialStep {
  id: string;
  title: string;
  description: string;
  targetSelector: string;
  position?: "top" | "bottom" | "left" | "right" | "center";
  icon: React.ReactNode;
}

const RECORD_MODAL_TUTORIAL_STEPS: RecordModalTutorialStep[] = [
  {
    id: "upload",
    title: "Upload Audio Files",
    description: "You can upload pre-recorded audio files instead of recording live. Click this button to select audio files from your device. Supports .webm, .mp3, .wav, .ogg, .m4a, and .aac formats (max 10MB).",
    targetSelector: '[data-tutorial="record-modal-upload"]',
    position: "bottom",
    icon: <Upload className="h-5 w-5" />,
  },
  {
    id: "podcast-mode",
    title: "Podcast Mode",
    description: "Toggle Podcast Mode to record longer content (up to 10 minutes) instead of the standard 30-second clips. Perfect for deeper conversations, stories, or podcast-style content!",
    targetSelector: '[data-tutorial="record-modal-podcast-mode"]',
    position: "bottom",
    icon: <Radio className="h-5 w-5" />,
  },
  {
    id: "mic-button",
    title: "Record Button",
    description: "This is the main recording button! Tap (or hold) to start recording your voice. The waveform will show your audio levels in real-time. Release or tap again to stop recording.",
    targetSelector: '[data-tutorial="record-modal-mic-button"]',
    position: "top",
    icon: <Mic className="h-5 w-5" />,
  },
  {
    id: "mood",
    title: "Mood Emoji",
    description: "Select a mood emoji that represents how you're feeling or the vibe of your clip. This helps others understand the tone of your voice note. You can use any emoji!",
    targetSelector: '[data-tutorial="record-modal-mood"]',
    position: "bottom",
    icon: <Smile className="h-5 w-5" />,
  },
  {
    id: "title",
    title: "Title (Optional)",
    description: "Give your voice clip a title to help people discover it. Titles make your clips easier to find and more engaging. You can also use AI Help to generate suggestions!",
    targetSelector: '[data-tutorial="record-modal-title"]',
    position: "bottom",
    icon: <Type className="h-5 w-5" />,
  },
  {
    id: "caption",
    title: "Caption (Optional)",
    description: "Add a caption with hashtags (#tags) and mentions (@username). Captions help people understand your clip and make it discoverable through search. You can add up to 500 characters.",
    targetSelector: '[data-tutorial="record-modal-caption"]',
    position: "bottom",
    icon: <Type className="h-5 w-5" />,
  },
  {
    id: "tags",
    title: "Tags",
    description: "Add tags to help people find your clip! Use #hashtags or separate tags with commas. Tags make your content discoverable and help build communities around topics.",
    targetSelector: '[data-tutorial="record-modal-tags"]',
    position: "bottom",
    icon: <Hash className="h-5 w-5" />,
  },
  {
    id: "audio-editing",
    title: "Audio Editing Tools",
    description: "Enhance your audio with editing tools! Trim/cut unwanted parts, normalize volume, auto-enhance with noise reduction, or open the full editor for advanced effects like reverb, echo, and background music.",
    targetSelector: '[data-tutorial="record-modal-audio-editing"]',
    position: "top",
    icon: <Scissors className="h-5 w-5" />,
  },
  {
    id: "privacy",
    title: "Privacy Settings",
    description: "Control who can see your clip! Choose Public (everyone), Followers (only people who follow you), or Private (only you). Your privacy matters!",
    targetSelector: '[data-tutorial="record-modal-privacy"]',
    position: "top",
    icon: <Lock className="h-5 w-5" />,
  },
  {
    id: "post-button",
    title: "Post Your Clip",
    description: "Ready to share? Click Post to publish your voice clip! You can also Save as Draft to finish later, or Re-record if you want to start over. Your voice will be heard!",
    targetSelector: '[data-tutorial="record-modal-post-button"]',
    position: "top",
    icon: <Send className="h-5 w-5" />,
  },
];

interface RecordModalTutorialProps {
  isActive: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

export const RecordModalTutorial = ({ isActive, onComplete, onSkip }: RecordModalTutorialProps) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(null);
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const step = currentStep >= 0 && currentStep < RECORD_MODAL_TUTORIAL_STEPS.length 
    ? RECORD_MODAL_TUTORIAL_STEPS[currentStep] 
    : null;

  const progress = ((currentStep + 1) / RECORD_MODAL_TUTORIAL_STEPS.length) * 100;

  // Update target element and position when step changes
  useEffect(() => {
    if (!isActive || !step) {
      setTargetElement(null);
      setTooltipPosition(null);
      setHighlightRect(null);
      return;
    }

    const updateTarget = () => {
      const element = document.querySelector(step.targetSelector) as HTMLElement | null;
      
      if (element) {
        setTargetElement(element);
        const rect = element.getBoundingClientRect();
        setHighlightRect(rect);
        
        // Calculate tooltip position based on step position preference
        const tooltipWidth = 320;
        const tooltipHeight = 200;
        const spacing = 16;
        
        let top = 0;
        let left = 0;
        
        switch (step.position) {
          case "top":
            top = rect.top - tooltipHeight - spacing;
            left = rect.left + (rect.width / 2) - (tooltipWidth / 2);
            break;
          case "bottom":
            top = rect.bottom + spacing;
            left = rect.left + (rect.width / 2) - (tooltipWidth / 2);
            break;
          case "left":
            top = rect.top + (rect.height / 2) - (tooltipHeight / 2);
            left = rect.left - tooltipWidth - spacing;
            break;
          case "right":
            top = rect.top + (rect.height / 2) - (tooltipHeight / 2);
            left = rect.right + spacing;
            break;
          case "center":
          default:
            top = window.innerHeight / 2 - tooltipHeight / 2;
            left = window.innerWidth / 2 - tooltipWidth / 2;
            break;
        }
        
        // Keep tooltip within viewport
        top = Math.max(16, Math.min(top, window.innerHeight - tooltipHeight - 16));
        left = Math.max(16, Math.min(left, window.innerWidth - tooltipWidth - 16));
        
        setTooltipPosition({ top, left });
      } else {
        // Element not found, show center tooltip
        const tooltipWidth = 320;
        const tooltipHeight = 200;
        setTooltipPosition({
          top: window.innerHeight / 2 - tooltipHeight / 2,
          left: window.innerWidth / 2 - tooltipWidth / 2,
        });
        setHighlightRect(null);
      }
    };

    // Initial update
    updateTarget();

    // Update on scroll/resize
    const handleUpdate = () => {
      requestAnimationFrame(updateTarget);
    };

    window.addEventListener("scroll", handleUpdate, true);
    window.addEventListener("resize", handleUpdate);
    
    // Also try to find element after a short delay (in case it's still rendering)
    const timeoutId = setTimeout(updateTarget, 100);

    return () => {
      window.removeEventListener("scroll", handleUpdate, true);
      window.removeEventListener("resize", handleUpdate);
      clearTimeout(timeoutId);
    };
  }, [isActive, step, currentStep]);

  const handleNext = useCallback(() => {
    if (currentStep < RECORD_MODAL_TUTORIAL_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      onComplete();
    }
  }, [currentStep, onComplete]);

  const handlePrevious = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  }, [currentStep]);

  if (!isActive || !step) {
    return null;
  }

  return (
    <>
      {/* Overlay with highlight */}
      <div
        ref={overlayRef}
        className="fixed inset-0 z-[10000] pointer-events-none"
        style={{
          background: highlightRect
            ? `radial-gradient(ellipse ${highlightRect.width + 40}px ${highlightRect.height + 40}px at ${highlightRect.left + highlightRect.width / 2}px ${highlightRect.top + highlightRect.height / 2}px, transparent 40%, rgba(0, 0, 0, 0.7) 70%)`
            : "rgba(0, 0, 0, 0.7)",
        }}
      >
        {/* Highlight border around target element */}
        {highlightRect && (
          <div
            className="absolute border-2 border-primary rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.7)] pointer-events-none"
            style={{
              top: highlightRect.top - 4,
              left: highlightRect.left - 4,
              width: highlightRect.width + 8,
              height: highlightRect.height + 8,
              boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.7), 0 0 20px hsl(var(--primary) / 0.5)",
            }}
          />
        )}
      </div>

      {/* Tooltip */}
      {tooltipPosition && (
        <Card
          ref={tooltipRef}
          className="fixed z-[10001] w-80 shadow-2xl border-2 border-primary"
          style={{
            top: `${tooltipPosition.top}px`,
            left: `${tooltipPosition.left}px`,
          }}
        >
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 flex-1">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  {step.icon}
                </div>
                <div className="flex-1">
                  <CardTitle className="text-base">{step.title}</CardTitle>
                  <div className="flex items-center gap-2 mt-1">
                    <Progress value={progress} className="h-1 flex-1" />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {currentStep + 1}/{RECORD_MODAL_TUTORIAL_STEPS.length}
                    </span>
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={onSkip}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <CardDescription className="text-sm leading-relaxed">
              {step.description}
            </CardDescription>
            <div className="flex items-center justify-between gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrevious}
                disabled={currentStep === 0}
                className="flex-1"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <Button
                size="sm"
                onClick={handleNext}
                className="flex-1"
              >
                {currentStep === RECORD_MODAL_TUTORIAL_STEPS.length - 1 ? (
                  "Got it!"
                ) : (
                  <>
                    Next
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
};

