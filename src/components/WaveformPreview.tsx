import { useEffect, useState } from "react";
import { generateWaveformFromUrl } from "@/utils/audioWaveform";
import { getAudioUrl } from "@/utils/audioUrl";

interface WaveformPreviewProps {
  clipId: string;
  audioPath: string;
  duration: number;
  progress?: number; // 0-100
  height?: number;
  className?: string;
}

/**
 * Waveform preview component
 * Shows audio waveform visualization with optional progress indicator
 */
export const WaveformPreview = ({
  clipId,
  audioPath,
  duration,
  progress = 0,
  height = 24,
  className = "",
}: WaveformPreviewProps) => {
  const [waveform, setWaveform] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadWaveform = async () => {
      try {
        setIsLoading(true);
        // Try to get waveform from clip data first (if stored in DB)
        // Otherwise generate from audio URL
        const audioUrl = await getAudioUrl(audioPath);
        const generated = await generateWaveformFromUrl(audioUrl, 24);
        
        if (!cancelled) {
          setWaveform(generated);
          setIsLoading(false);
        }
      } catch (error) {
        console.warn("Failed to load waveform:", error);
        if (!cancelled) {
          // Fallback to default waveform
          setWaveform(Array.from({ length: 24 }, () => Math.random() * 0.5 + 0.3));
          setIsLoading(false);
        }
      }
    };

    loadWaveform();

    return () => {
      cancelled = true;
    };
  }, [clipId, audioPath]);

  if (isLoading && waveform.length === 0) {
    return (
      <div className={`flex items-center gap-0.5 ${className}`} style={{ height }}>
        {Array.from({ length: 24 }).map((_, i) => (
          <div
            key={i}
            className="bg-muted animate-pulse rounded-sm"
            style={{
              width: "3px",
              height: `${Math.random() * 60 + 40}%`,
            }}
          />
        ))}
      </div>
    );
  }

  const progressIndex = Math.floor((progress / 100) * waveform.length);

  return (
    <div className={`flex items-center gap-0.5 ${className}`} style={{ height }}>
      {waveform.map((value, index) => {
        const barHeight = Math.max(20, value * 100);
        const isPlayed = index < progressIndex;
        const isCurrent = index === progressIndex;

        return (
          <div
            key={index}
            className={`rounded-sm transition-all ${
              isCurrent
                ? "bg-primary"
                : isPlayed
                ? "bg-primary/60"
                : "bg-muted"
            }`}
            style={{
              width: "3px",
              height: `${barHeight}%`,
            }}
          />
        );
      })}
    </div>
  );
};

