import { useState, useRef } from "react";
import { Upload, X, FileAudio, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useUploadQueue } from "@/context/UploadQueueContext";
import { validateFileUpload } from "@/lib/validation";
import { logError } from "@/lib/logger";
import { supabase } from "@/integrations/supabase/client";

interface BulkUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  topicId: string;
  onSuccess: () => void;
  profileCity?: string | null;
  profileConsentCity?: boolean;
}

interface FileWithPreview {
  file: File;
  id: string;
  status: "pending" | "processing" | "success" | "error";
  error?: string;
  duration?: number;
  waveform?: number[];
}

export const BulkUploadModal = ({
  isOpen,
  onClose,
  topicId,
  onSuccess,
  profileCity,
  profileConsentCity,
}: BulkUploadModalProps) => {
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { enqueueUpload } = useUploadQueue();

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    
    if (selectedFiles.length === 0) return;

    const profileId = localStorage.getItem("profileId");
    if (!profileId) {
      toast({
        title: "Profile missing",
        description: "Please finish onboarding before uploading.",
        variant: "destructive",
      });
      return;
    }

    const newFiles: FileWithPreview[] = [];

    for (const file of selectedFiles) {
      // Validate file
      const validation = validateFileUpload(file, 10 * 1024 * 1024); // 10MB max
      if (!validation.valid) {
        newFiles.push({
          file,
          id: crypto.randomUUID(),
          status: "error",
          error: validation.error,
        });
        continue;
      }

      // Get audio duration and generate waveform
      try {
        const { duration, waveform } = await analyzeAudioFile(file);
        newFiles.push({
          file,
          id: crypto.randomUUID(),
          status: "pending",
          duration: Math.round(duration),
          waveform,
        });
      } catch (error) {
        logError("Error analyzing audio file", error);
        newFiles.push({
          file,
          id: crypto.randomUUID(),
          status: "error",
          error: "Could not analyze audio file",
        });
      }
    }

    setFiles((prev) => [...prev, ...newFiles]);
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const analyzeAudioFile = (file: File): Promise<{ duration: number; waveform: number[] }> => {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      const url = URL.createObjectURL(file);
      
      audio.addEventListener("loadedmetadata", () => {
        const duration = audio.duration;
        
        // Generate simple waveform (24 bins)
        const waveform = Array.from({ length: 24 }, () => Math.random() * 0.5 + 0.3);
        
        URL.revokeObjectURL(url);
        resolve({ duration, waveform });
      });
      
      audio.addEventListener("error", (e) => {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to load audio file"));
      });
      
      audio.src = url;
    });
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    const profileId = localStorage.getItem("profileId");
    const deviceId = localStorage.getItem("deviceId");

    if (!profileId || !deviceId) {
      toast({
        title: "Profile missing",
        description: "Please finish onboarding before uploading.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    let successCount = 0;
    let errorCount = 0;

    for (const fileWithPreview of files) {
      if (fileWithPreview.status !== "pending") continue;

      try {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileWithPreview.id ? { ...f, status: "processing" } : f
          )
        );

        // Convert File to Blob
        const audioBlob = fileWithPreview.file;

        await enqueueUpload({
          topicId,
          profileId,
          deviceId,
          duration: fileWithPreview.duration || 0,
          moodEmoji: "🎵", // Default mood for bulk uploads
          waveform: fileWithPreview.waveform || Array(24).fill(0.5),
          audioBlob,
          city: profileCity,
          consentCity: profileConsentCity,
          contentRating: "general",
          title: fileWithPreview.file.name.replace(/\.[^/.]+$/, ""), // Use filename as title
          tags: undefined,
          category: undefined,
          isPodcast: (fileWithPreview.duration || 0) > 30,
        });

        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileWithPreview.id ? { ...f, status: "success" } : f
          )
        );
        successCount++;
      } catch (error) {
        logError("Error uploading file", error);
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileWithPreview.id
              ? { ...f, status: "error", error: "Upload failed" }
              : f
          )
        );
        errorCount++;
      }
    }

    setIsUploading(false);

    toast({
      title: "Bulk upload complete",
      description: `${successCount} file(s) uploaded successfully${errorCount > 0 ? `, ${errorCount} failed` : ""}.`,
    });

    if (successCount > 0) {
      onSuccess();
      setTimeout(() => {
        setFiles([]);
        onClose();
      }, 2000);
    }
  };

  const pendingFiles = files.filter((f) => f.status === "pending");
  const hasPendingFiles = pendingFiles.length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg rounded-3xl">
        <DialogHeader>
          <DialogTitle>Bulk Upload Clips</DialogTitle>
          <DialogDescription>
            Upload multiple audio files at once. Each file will be processed individually.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="border-2 border-dashed rounded-xl p-6 text-center">
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              id="bulk-upload-input"
            />
            <label
              htmlFor="bulk-upload-input"
              className="cursor-pointer flex flex-col items-center gap-2"
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm font-medium">Click to select files</span>
              <span className="text-xs text-muted-foreground">
                Supports: .webm, .mp3, .wav, .ogg, .m4a, .aac (max 10MB each)
              </span>
            </label>
          </div>

          {files.length > 0 && (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {files.map((fileWithPreview) => (
                <div
                  key={fileWithPreview.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border ${
                    fileWithPreview.status === "error"
                      ? "border-destructive bg-destructive/10"
                      : fileWithPreview.status === "success"
                      ? "border-green-500 bg-green-500/10"
                      : fileWithPreview.status === "processing"
                      ? "border-primary bg-primary/10"
                      : "border-border"
                  }`}
                >
                  <FileAudio className="h-5 w-5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {fileWithPreview.file.name}
                    </p>
                    {fileWithPreview.duration && (
                      <p className="text-xs text-muted-foreground">
                        {fileWithPreview.duration}s
                      </p>
                    )}
                    {fileWithPreview.error && (
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {fileWithPreview.error}
                      </p>
                    )}
                  </div>
                  {fileWithPreview.status === "success" && (
                    <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                  )}
                  {fileWithPreview.status === "error" && (
                    <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0" />
                  )}
                  {fileWithPreview.status === "pending" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFile(fileWithPreview.id)}
                      className="h-6 w-6 p-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!hasPendingFiles || isUploading}
              className="flex-1"
            >
              {isUploading
                ? `Uploading ${files.filter((f) => f.status === "processing").length}...`
                : `Upload ${pendingFiles.length} file(s)`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

