/**
 * Hook for managing offline sync across devices
 * Syncs downloaded clips, playlists, saved clips, and listening progress
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useProfile } from "@/hooks/useProfile";
import {
  syncDownloadedClip,
  unsyncDownloadedClip,
  getSyncedDownloads,
  syncListeningProgress,
  getListeningProgress,
  getClipListeningProgress,
  syncAllDownloads,
  syncAllListeningProgress,
  type SyncedDownload,
  type ListeningProgress,
} from "@/utils/offlineSync";
import { offlineStorage } from "@/utils/offlineStorage";
import { logError, logWarn } from "@/lib/logger";
import { useToast } from "@/hooks/use-toast";

interface UseOfflineSyncReturn {
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  syncedDownloads: SyncedDownload[];
  listeningProgress: ListeningProgress[];
  syncNow: () => Promise<void>;
  syncDownload: (clipId: string) => Promise<boolean>;
  unsyncDownload: (clipId: string) => Promise<boolean>;
  syncProgress: (clipId: string, seconds: number, percentage: number) => Promise<boolean>;
  getProgressForClip: (clipId: string) => Promise<ListeningProgress | null>;
  loadSyncedData: () => Promise<void>;
}

/**
 * Hook to manage offline sync
 */
export const useOfflineSync = (): UseOfflineSyncReturn => {
  const { profile } = useProfile();
  const { toast } = useToast();
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [syncedDownloads, setSyncedDownloads] = useState<SyncedDownload[]>([]);
  const [listeningProgress, setListeningProgress] = useState<ListeningProgress[]>([]);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const progressMapRef = useRef<Map<string, { seconds: number; percentage: number }>>(
    new Map()
  );

  // Get device ID
  const getDeviceId = useCallback((): string => {
    return localStorage.getItem("deviceId") || "";
  }, []);

  /**
   * Load synced data from cloud
   */
  const loadSyncedData = useCallback(async () => {
    if (!profile?.id) return;

    try {
      // Load synced downloads
      const downloads = await getSyncedDownloads(profile.id);
      setSyncedDownloads(downloads);

      // Load listening progress
      const progress = await getListeningProgress(profile.id);
      setListeningProgress(progress);
    } catch (error) {
      logError("Failed to load synced data", error);
    }
  }, [profile?.id]);

  /**
   * Sync a single download
   */
  const syncDownload = useCallback(
    async (clipId: string): Promise<boolean> => {
      if (!profile?.id) return false;

      const deviceId = getDeviceId();
      if (!deviceId) {
        logWarn("Device ID not found, cannot sync");
        return false;
      }

      try {
        const success = await syncDownloadedClip(profile.id, clipId, deviceId);
        if (success) {
          // Update local state
          await loadSyncedData();
        }
        return success;
      } catch (error) {
        logError("Failed to sync download", error);
        return false;
      }
    },
    [profile?.id, getDeviceId, loadSyncedData]
  );

  /**
   * Unsync a download
   */
  const unsyncDownload = useCallback(
    async (clipId: string): Promise<boolean> => {
      if (!profile?.id) return false;

      const deviceId = getDeviceId();
      if (!deviceId) return false;

      try {
        const success = await unsyncDownloadedClip(profile.id, clipId, deviceId);
        if (success) {
          // Update local state
          await loadSyncedData();
        }
        return success;
      } catch (error) {
        logError("Failed to unsync download", error);
        return false;
      }
    },
    [profile?.id, getDeviceId, loadSyncedData]
  );

  /**
   * Sync listening progress
   */
  const syncProgress = useCallback(
    async (
      clipId: string,
      seconds: number,
      percentage: number
    ): Promise<boolean> => {
      if (!profile?.id) return false;

      const deviceId = getDeviceId();

      try {
        // Store in progress map for batch sync
        progressMapRef.current.set(clipId, { seconds, percentage });

        // Sync immediately
        const success = await syncListeningProgress(
          profile.id,
          clipId,
          seconds,
          percentage,
          deviceId || null
        );

        if (success) {
          // Update local state
          await loadSyncedData();
        }

        return success;
      } catch (error) {
        logError("Failed to sync listening progress", error);
        return false;
      }
    },
    [profile?.id, getDeviceId, loadSyncedData]
  );

  /**
   * Get progress for a specific clip
   */
  const getProgressForClip = useCallback(
    async (clipId: string): Promise<ListeningProgress | null> => {
      if (!profile?.id) return null;

      try {
        return await getClipListeningProgress(profile.id, clipId);
      } catch (error) {
        logError("Failed to get clip progress", error);
        return null;
      }
    },
    [profile?.id]
  );

  /**
   * Sync all data
   */
  const syncNow = useCallback(async () => {
    if (!profile?.id || isSyncing) return;

    setIsSyncing(true);
    try {
      const deviceId = getDeviceId();
      if (!deviceId) {
        logWarn("Device ID not found, cannot sync");
        return;
      }

      // Sync downloaded clips
      const downloadedClipIds = await offlineStorage.getAllDownloadedClipIds();
      const downloadResult = await syncAllDownloads(
        profile.id,
        deviceId,
        downloadedClipIds
      );

      // Sync listening progress
      const progressResult = await syncAllListeningProgress(
        profile.id,
        deviceId,
        progressMapRef.current
      );

      // Load synced data
      await loadSyncedData();

      setLastSyncedAt(new Date());

      // Show toast if there were failures
      if (downloadResult.failed > 0 || progressResult.failed > 0) {
        toast({
          title: "Sync completed with errors",
          description: `Synced ${downloadResult.synced} downloads and ${progressResult.synced} progress entries. ${downloadResult.failed + progressResult.failed} failed.`,
          variant: "destructive",
        });
      }
    } catch (error) {
      logError("Failed to sync", error);
      toast({
        title: "Sync failed",
        description: "Could not sync data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  }, [profile?.id, isSyncing, getDeviceId, loadSyncedData, toast]);

  // Load synced data on mount and when profile changes
  useEffect(() => {
    if (profile?.id) {
      loadSyncedData();
    }
  }, [profile?.id, loadSyncedData]);

  // Auto-sync periodically (every 5 minutes)
  useEffect(() => {
    if (!profile?.id) return;

    // Initial sync after 30 seconds
    const initialTimeout = setTimeout(() => {
      syncNow();
    }, 30000);

    // Then sync every 5 minutes
    syncIntervalRef.current = setInterval(() => {
      syncNow();
    }, 5 * 60 * 1000);

    return () => {
      clearTimeout(initialTimeout);
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [profile?.id, syncNow]);

  // Sync on window focus (when user returns to app)
  useEffect(() => {
    const handleFocus = () => {
      if (profile?.id && !isSyncing) {
        syncNow();
      }
    };

    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, [profile?.id, isSyncing, syncNow]);

  return {
    isSyncing,
    lastSyncedAt,
    syncedDownloads,
    listeningProgress,
    syncNow,
    syncDownload,
    unsyncDownload,
    syncProgress,
    getProgressForClip,
    loadSyncedData,
  };
};

