import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logError, logWarn } from "@/lib/logger";

interface EnqueueUploadOptions {
  topicId: string;
  profileId: string;
  deviceId: string;
  duration: number;
  moodEmoji: string;
  waveform: number[];
  audioBlob: Blob;
  city?: string | null;
  consentCity?: boolean;
  contentRating: "general" | "sensitive";
  title?: string | null;
  tags?: string[];
  parentClipId?: string | null;
  remixOfClipId?: string | null;
  chainId?: string | null;
  challengeId?: string | null;
  communityId?: string | null;
  isPodcast?: boolean;
}

interface UploadQueueItem {
  id: string;
  topicId: string;
  profileId: string;
  deviceId: string;
  duration: number;
  moodEmoji: string;
  waveform: number[];
  audioBase64: string;
  createdAt: number;
  city?: string | null;
  consentCity?: boolean;
  contentRating: "general" | "sensitive";
  title?: string | null;
  tags?: string[];
  parentClipId?: string | null;
  remixOfClipId?: string | null;
  chainId?: string | null;
  challengeId?: string | null;
  communityId?: string | null;
  isPodcast?: boolean;
}

interface UploadQueueContextValue {
  enqueueUpload: (options: EnqueueUploadOptions) => Promise<void>;
  queue: UploadQueueItem[];
  isProcessing: boolean;
}

// Create a default no-op implementation to prevent errors
const defaultContextValue: UploadQueueContextValue = {
  enqueueUpload: async () => {
    logWarn("useUploadQueue called outside UploadQueueProvider");
  },
  queue: [],
  isProcessing: false,
};

const UploadQueueContext = createContext<UploadQueueContextValue>(defaultContextValue);

const QUEUE_STORAGE_KEY = "echo-garden-upload-queue";

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to convert blob to data URL"));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

const dataUrlToBlob = (dataUrl: string) => {
  const [metadata, base64] = dataUrl.split(",");
  const mimeMatch = metadata.match(/data:(.*);base64/);
  const mime = mimeMatch ? mimeMatch[1] : "audio/webm";
  const binary = atob(base64);
  const len = binary.length;
  const buffer = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    buffer[i] = binary.charCodeAt(i);
  }
  return new Blob([buffer], { type: mime });
};

const loadQueueFromStorage = (): UploadQueueItem[] => {
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<UploadQueueItem>[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => ({
      ...item,
      contentRating: item?.contentRating === "sensitive" ? "sensitive" : "general",
    })) as UploadQueueItem[];
  } catch (error) {
    logError("Failed to load upload queue", error);
    return [];
  }
};

const saveQueueToStorage = (queue: UploadQueueItem[]) => {
  try {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
  } catch (error) {
    logError("Failed to persist upload queue", error);
  }
};

export const UploadQueueProvider = ({ children }: { children: ReactNode }) => {
  const [queue, setQueue] = useState<UploadQueueItem[]>(() => loadQueueFromStorage());
  const [isProcessing, setIsProcessing] = useState(false);
  const isProcessingRef = useRef(false);
  const { toast } = useToast();

  useEffect(() => {
    saveQueueToStorage(queue);
  }, [queue]);

  const enqueueUpload = useCallback(
    async ({
      topicId,
      profileId,
      deviceId,
      duration,
      moodEmoji,
      waveform,
      audioBlob,
      city,
      consentCity,
      contentRating,
      title,
      tags,
      parentClipId,
      remixOfClipId,
      chainId,
      challengeId,
      communityId,
      isPodcast,
    }: EnqueueUploadOptions) => {
      const id = crypto.randomUUID();
      const audioBase64 = await blobToDataUrl(audioBlob);

      const item: UploadQueueItem = {
        id,
        topicId,
        profileId,
        deviceId,
        duration,
        moodEmoji,
        waveform,
        audioBase64,
        createdAt: Date.now(),
        city,
        consentCity,
        contentRating,
        title: title?.trim() ? title.trim() : undefined,
        tags: tags?.length ? tags : undefined,
        parentClipId: parentClipId || undefined,
        remixOfClipId: remixOfClipId || undefined,
        chainId: chainId || undefined,
        challengeId: challengeId || undefined,
        communityId: communityId || undefined,
        isPodcast: isPodcast || false,
      };

      setQueue((prev) => [...prev, item]);

      toast({
        title: "Voice note queued",
        description: navigator.onLine
          ? "Uploading your clip in the background..."
          : "Offline detected. We'll upload once you're back online.",
      });
    },
    [toast],
  );

  const removeFromQueue = useCallback((id: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const processNext = useCallback(async () => {
    if (isProcessingRef.current) return;
    if (!navigator.onLine) return;
    if (queue.length === 0) return;

    isProcessingRef.current = true;
    setIsProcessing(true);

    const item = queue[0];
    try {
      const blob = dataUrlToBlob(item.audioBase64);
      const fileName = `${item.profileId}/${item.createdAt}.webm`;

      const { error: uploadError } = await supabase.storage.from("audio").upload(fileName, blob);
      if (uploadError) {
        throw uploadError;
      }

      const waveformPayload = item.waveform.map((value) => Number(value.toFixed(2)));

      const { data: clipData, error: insertError } = await supabase
        .from("clips")
        .insert({
          topic_id: item.topicId,
          profile_id: item.profileId,
          audio_path: fileName,
          duration_seconds: item.duration,
          mood_emoji: item.moodEmoji,
          status: "processing",
          waveform: waveformPayload,
          city: item.consentCity ? item.city : null,
          content_rating: item.contentRating,
          title: item.title ?? null,
          tags: item.tags && item.tags.length > 0 ? item.tags : null,
          parent_clip_id: item.parentClipId ?? null,
          remix_of_clip_id: item.remixOfClipId ?? null,
          chain_id: item.chainId ?? null,
          challenge_id: item.challengeId ?? null,
          community_id: item.communityId ?? null,
          is_podcast: item.isPodcast ?? false,
        })
        .select()
        .single();

      if (insertError) {
        throw insertError;
      }

      // Update device association (non-blocking - don't fail if this errors)
      const { error: deviceError } = await supabase
        .from("devices")
        .update({ profile_id: item.profileId })
        .eq("device_id", item.deviceId);
      
      if (deviceError) {
        logWarn("Failed to update device association", deviceError);
        // Continue anyway - this is not critical
      }

      // Trigger edge function in the background; don't block queue progression if it fails
      // This is fire-and-forget - errors are logged but don't prevent the upload from completing
      supabase.functions.invoke("on-clip-uploaded", {
        body: { clipId: clipData.id },
        headers: item.deviceId ? { "x-device-id": item.deviceId } : undefined,
      }).catch((invokeError) => {
        // Silently handle errors - this is a background process
        logWarn("on-clip-uploaded invocation failed (non-blocking)", invokeError);
      });

      toast({
        title: "Voice note posted! 💫",
        description: "Processing your clip...",
      });

      removeFromQueue(item.id);
    } catch (error) {
      logError("Background upload failed", error);
      toast({
        title: "Upload failed",
        description: "We'll retry automatically. Check your connection.",
        variant: "destructive",
      });
    } finally {
      isProcessingRef.current = false;
      setIsProcessing(false);
    }
  }, [queue, removeFromQueue, toast]);

  useEffect(() => {
    if (!isProcessingRef.current) {
      processNext().catch((error) => {
        logError("Error in processNext", error);
      });
    }
  }, [queue, processNext]);

  useEffect(() => {
    const handleOnline = () => {
      toast({
        title: "Back online",
        description: "Resuming uploads...",
      });
      processNext().catch((error) => {
        logError("Error in processNext (online)", error);
      });
    };

    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("online", handleOnline);
    };
  }, [processNext, toast]);

  const value = useMemo(
    () => ({
      enqueueUpload,
      queue,
      isProcessing,
    }),
    [enqueueUpload, queue, isProcessing],
  );

  return <UploadQueueContext.Provider value={value}>{children}</UploadQueueContext.Provider>;
};

export const useUploadQueue = () => {
  const context = useContext(UploadQueueContext);
  // Context should always have a value now (either from provider or default)
  return context;
};

