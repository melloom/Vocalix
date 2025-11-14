import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { X, Upload, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface UploadProgressProps {
  progress: number;
  fileName?: string;
  status?: "uploading" | "processing" | "success" | "error";
  error?: string;
  onCancel?: () => void;
  onRetry?: () => void;
  className?: string;
}

export function UploadProgress({
  progress,
  fileName,
  status = "uploading",
  error,
  onCancel,
  onRetry,
  className,
}: UploadProgressProps) {
  const isComplete = progress >= 100 && status === "success";
  const isError = status === "error";
  const isProcessing = status === "processing";

  return (
    <Card className={cn("p-4 space-y-3 transition-all duration-300", className)}>
      <div className="flex items-center gap-3">
        <div className={cn(
          "flex h-10 w-10 items-center justify-center rounded-full transition-colors",
          isComplete && "bg-green-500/10 text-green-600",
          isError && "bg-destructive/10 text-destructive",
          isProcessing && "bg-primary/10 text-primary animate-spin",
          !isComplete && !isError && !isProcessing && "bg-primary/10 text-primary"
        )}>
          {isComplete && <CheckCircle2 className="h-5 w-5" />}
          {isError && <AlertCircle className="h-5 w-5" />}
          {isProcessing && <Loader2 className="h-5 w-5" />}
          {!isComplete && !isError && !isProcessing && <Upload className="h-5 w-5" />}
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <p className="text-sm font-medium truncate">
            {fileName || "Voice note"}
          </p>
          <div className="flex items-center gap-2">
            <Progress 
              value={isProcessing ? undefined : progress} 
              className="h-1.5 flex-1"
              aria-label={`Upload progress: ${Math.round(progress)}%`}
            />
            {!isProcessing && (
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {Math.round(progress)}%
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {isComplete && "Upload complete"}
            {isError && (error || "Upload failed")}
            {isProcessing && "Processing audio..."}
            {!isComplete && !isError && !isProcessing && "Uploading..."}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {isError && onRetry && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRetry}
              className="h-8 w-8 p-0"
              aria-label="Retry upload"
            >
              <Loader2 className="h-4 w-4" />
            </Button>
          )}
          {!isComplete && onCancel && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              className="h-8 w-8 p-0"
              aria-label="Cancel upload"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

interface UploadQueueProps {
  uploads: Array<{
    id: string;
    progress: number;
    fileName?: string;
    status?: "uploading" | "processing" | "success" | "error";
    error?: string;
  }>;
  onCancel?: (id: string) => void;
  onRetry?: (id: string) => void;
}

export function UploadQueue({ uploads, onCancel, onRetry }: UploadQueueProps) {
  if (uploads.length === 0) return null;

  return (
    <div className="fixed bottom-20 right-4 z-50 w-full max-w-sm space-y-2 transition-all duration-300">
      {uploads.map((upload) => (
        <UploadProgress
          key={upload.id}
          progress={upload.progress}
          fileName={upload.fileName}
          status={upload.status}
          error={upload.error}
          onCancel={onCancel ? () => onCancel(upload.id) : undefined}
          onRetry={onRetry ? () => onRetry(upload.id) : undefined}
        />
      ))}
    </div>
  );
}

