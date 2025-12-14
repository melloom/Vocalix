/**
 * Audio levels indicator component
 * Shows real-time audio levels during recording with visual feedback
 */

import { useEffect, useRef, useState } from "react";
import { Volume2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface AudioLevelsIndicatorProps {
  analyserNode: AnalyserNode | null;
  isRecording: boolean;
  className?: string;
}

export const AudioLevelsIndicator = ({
  analyserNode,
  isRecording,
  className,
}: AudioLevelsIndicatorProps) => {
  const [currentLevel, setCurrentLevel] = useState(0);
  const [peakLevel, setPeakLevel] = useState(0);
  const [averageLevel, setAverageLevel] = useState(0);
  const [isTooQuiet, setIsTooQuiet] = useState(false);
  const [isTooLoud, setIsTooLoud] = useState(false);
  const animationFrameRef = useRef<number | null>(null);
  const peakHoldRef = useRef<number>(0);
  const peakDecayTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!analyserNode || !isRecording) {
      setCurrentLevel(0);
      setPeakLevel(0);
      setAverageLevel(0);
      setIsTooQuiet(false);
      setIsTooLoud(false);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const updateLevels = () => {
      analyserNode.getByteFrequencyData(dataArray);

      // Calculate RMS (Root Mean Square) for average level
      let sum = 0;
      let max = 0;
      for (let i = 0; i < bufferLength; i++) {
        const value = dataArray[i] / 255;
        sum += value * value;
        if (value > max) {
          max = value;
        }
      }

      const rms = Math.sqrt(sum / bufferLength);
      const current = max;
      const avg = rms;

      setCurrentLevel(current);
      setAverageLevel(avg);

      // Update peak with hold and decay
      if (current > peakHoldRef.current) {
        peakHoldRef.current = current;
        setPeakLevel(current);

        // Clear existing timeout
        if (peakDecayTimeoutRef.current) {
          clearTimeout(peakDecayTimeoutRef.current);
        }

        // Decay peak after 1 second
        peakDecayTimeoutRef.current = setTimeout(() => {
          peakHoldRef.current = Math.max(0, peakHoldRef.current - 0.05);
          setPeakLevel(peakHoldRef.current);
        }, 1000);
      }

      // Warn if too quiet or too loud
      setIsTooQuiet(avg < 0.15 && current < 0.2);
      setIsTooLoud(current > 0.95 || avg > 0.85);

      animationFrameRef.current = requestAnimationFrame(updateLevels);
    };

    updateLevels();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (peakDecayTimeoutRef.current) {
        clearTimeout(peakDecayTimeoutRef.current);
      }
    };
  }, [analyserNode, isRecording]);

  const getLevelColor = (level: number): string => {
    if (level < 0.3) return "bg-red-500";
    if (level < 0.6) return "bg-yellow-500";
    if (level < 0.9) return "bg-green-500";
    return "bg-red-500"; // Clipping
  };

  const getBarColor = (index: number, total: number): string => {
    const threshold = currentLevel * total;
    const peakThreshold = peakLevel * total;

    if (index <= peakThreshold) {
      return getLevelColor(peakLevel);
    }
    if (index <= threshold) {
      return getLevelColor(currentLevel);
    }
    return "bg-gray-200 dark:bg-gray-700";
  };

  return (
    <div className={cn("space-y-2", className)}>
      {/* Visual level bars */}
      <div className="flex items-end justify-center gap-1 h-12">
        {Array.from({ length: 20 }).map((_, i) => {
          const height = Math.max(
            2,
            (i < currentLevel * 20 ? (i + 1) / 20 : 0.1) * 100
          );
          return (
            <div
              key={i}
              className={cn(
                "w-2 rounded-t transition-all duration-75",
                getBarColor(i, 20)
              )}
              style={{
                height: `${height}%`,
              }}
            />
          );
        })}
      </div>

      {/* Status indicators */}
      <div className="flex items-center justify-center gap-4 text-xs">
        {isTooQuiet && (
          <div className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
            <AlertCircle className="h-3 w-3" />
            <span>Too quiet</span>
          </div>
        )}
        {isTooLoud && (
          <div className="flex items-center gap-1 text-red-600 dark:text-red-400">
            <AlertCircle className="h-3 w-3" />
            <span>Too loud</span>
          </div>
        )}
        {!isTooQuiet && !isTooLoud && (
          <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
            <Volume2 className="h-3 w-3" />
            <span>Good levels</span>
          </div>
        )}
      </div>

      {/* Numerical display */}
      <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
        <span>Peak: {Math.round(peakLevel * 100)}%</span>
        <span>Avg: {Math.round(averageLevel * 100)}%</span>
      </div>
    </div>
  );
};

