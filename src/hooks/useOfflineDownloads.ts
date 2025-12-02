import { useState, useEffect, useCallback } from "react";
import { offlineStorage, formatFileSize } from "@/utils/offlineStorage";
import { supabase } from "@/integrations/supabase/client";
import { logError } from "@/lib/logger";

interface DownloadedClipMetadata {
  clipId: string;
  title: string | null;
  summary: string | null;
  duration: number;
  profiles: {
    handle: string | null;
    emoji_avatar: string | null;
  } | null;
  downloadedAt: number;
  fileSize: number;
}

/**
 * Hook to manage offline clip downloads
 */
export const useOfflineDownloads = () => {
  const [downloadedClips, setDownloadedClips] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [storageUsed, setStorageUsed] = useState(0);

  // Load downloaded clip IDs on mount
  useEffect(() => {
    const loadDownloadedClips = async () => {
      try {
        const clipIds = await offlineStorage.getAllDownloadedClipIds();
        setDownloadedClips(new Set(clipIds));
        
        const used = await offlineStorage.getStorageUsed();
        setStorageUsed(used);
      } catch (error) {
        logError("Error loading downloaded clips", error);
      }
    };

    loadDownloadedClips();
  }, []);

  /**
   * Download a clip for offline playback
   */
  const downloadClip = useCallback(async (
    clipId: string,
    audioPath: string,
    metadata: {
      title: string | null;
      summary: string | null;
      duration: number;
      profiles: {
        handle: string | null;
        emoji_avatar: string | null;
      } | null;
    }
  ): Promise<boolean> => {
    setIsLoading(true);
    try {
      // Check if already downloaded
      if (downloadedClips.has(clipId)) {
        return true;
      }

      // Download audio file from Supabase
      const { data: audioBlob, error } = await supabase.storage
        .from("audio")
        .download(audioPath);

      if (error) throw error;
      if (!audioBlob) throw new Error("No audio data received");

      // Store in IndexedDB
      await offlineStorage.downloadClip(clipId, audioPath, audioBlob, metadata);

      // Sync to cloud (non-blocking)
      const profileId = localStorage.getItem("profileId");
      const deviceId = localStorage.getItem("deviceId");
      if (profileId && deviceId) {
        // Import sync utility
        const { syncDownloadedClip } = await import("@/utils/offlineSync");
        syncDownloadedClip(profileId, clipId, deviceId).catch((error) => {
          // Silent failure - sync will happen on next sync
          console.warn("Failed to sync download immediately:", error);
        });
      }

      // Update state
      setDownloadedClips((prev) => new Set([...prev, clipId]));
      
      const used = await offlineStorage.getStorageUsed();
      setStorageUsed(used);

      return true;
    } catch (error) {
      logError("Error downloading clip", error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [downloadedClips]);

  /**
   * Delete a downloaded clip
   */
  const deleteDownloadedClip = useCallback(async (clipId: string): Promise<boolean> => {
    try {
      await offlineStorage.deleteDownloadedClip(clipId);
      
      // Unsync from cloud (non-blocking)
      const profileId = localStorage.getItem("profileId");
      const deviceId = localStorage.getItem("deviceId");
      if (profileId && deviceId) {
        // Import sync utility
        const { unsyncDownloadedClip } = await import("@/utils/offlineSync");
        unsyncDownloadedClip(profileId, clipId, deviceId).catch((error) => {
          // Silent failure
          console.warn("Failed to unsync download:", error);
        });
      }
      
      // Update state
      setDownloadedClips((prev) => {
        const next = new Set(prev);
        next.delete(clipId);
        return next;
      });

      const used = await offlineStorage.getStorageUsed();
      setStorageUsed(used);

      return true;
    } catch (error) {
      logError("Error deleting downloaded clip", error);
      return false;
    }
  }, []);

  /**
   * Check if a clip is downloaded
   */
  const isClipDownloaded = useCallback((clipId: string): boolean => {
    return downloadedClips.has(clipId);
  }, [downloadedClips]);

  /**
   * Get audio blob for a downloaded clip
   */
  const getAudioBlob = useCallback(async (clipId: string): Promise<Blob | null> => {
    try {
      return await offlineStorage.getAudioBlob(clipId);
    } catch (error) {
      logError("Error getting audio blob", error);
      return null;
    }
  }, []);

  /**
   * Get all downloaded clips with metadata
   */
  const getAllDownloadedClips = useCallback(async (): Promise<DownloadedClipMetadata[]> => {
    try {
      const clips = await offlineStorage.getAllDownloadedClips();
      return clips.map((clip) => ({
        clipId: clip.clipId,
        title: clip.title,
        summary: clip.summary,
        duration: clip.duration,
        profiles: clip.profiles,
        downloadedAt: clip.downloadedAt,
        fileSize: clip.fileSize,
      }));
    } catch (error) {
      logError("Error getting downloaded clips", error);
      return [];
    }
  }, []);

  /**
   * Clear all downloaded clips
   */
  const clearAll = useCallback(async (): Promise<boolean> => {
    try {
      await offlineStorage.clearAll();
      setDownloadedClips(new Set());
      setStorageUsed(0);
      return true;
    } catch (error) {
      logError("Error clearing downloaded clips", error);
      return false;
    }
  }, []);

  return {
    downloadedClips,
    isClipDownloaded,
    downloadClip,
    deleteDownloadedClip,
    getAudioBlob,
    getAllDownloadedClips,
    clearAll,
    isLoading,
    storageUsed,
    storageUsedFormatted: formatFileSize(storageUsed),
  };
};

