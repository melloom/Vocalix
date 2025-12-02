/**
 * Offline sync utilities for cross-device synchronization
 * Syncs downloaded clips, playlists, saved clips, and listening progress
 */

import { supabase } from "@/integrations/supabase/client";
import { logError, logWarn } from "@/lib/logger";

export interface SyncedDownload {
  clipId: string;
  deviceId: string;
  syncedAt: string;
}

export interface ListeningProgress {
  clipId: string;
  progressSeconds: number;
  progressPercentage: number;
  lastPlayedAt: string;
}

/**
 * Sync a downloaded clip to the cloud
 */
export async function syncDownloadedClip(
  profileId: string,
  clipId: string,
  deviceId: string
): Promise<boolean> {
  try {
    const { error } = await supabase.from("synced_downloads").upsert(
      {
        profile_id: profileId,
        clip_id: clipId,
        device_id: deviceId,
        synced_at: new Date().toISOString(),
        last_modified: new Date().toISOString(),
      },
      {
        onConflict: "profile_id,clip_id,device_id",
      }
    );

    if (error) throw error;
    return true;
  } catch (error) {
    logError("Failed to sync downloaded clip", error);
    return false;
  }
}

/**
 * Remove a synced download from the cloud
 */
export async function unsyncDownloadedClip(
  profileId: string,
  clipId: string,
  deviceId: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("synced_downloads")
      .delete()
      .eq("profile_id", profileId)
      .eq("clip_id", clipId)
      .eq("device_id", deviceId);

    if (error) throw error;
    return true;
  } catch (error) {
    logError("Failed to unsync downloaded clip", error);
    return false;
  }
}

/**
 * Get all synced downloads for a profile
 */
export async function getSyncedDownloads(profileId: string): Promise<SyncedDownload[]> {
  try {
    const { data, error } = await supabase
      .from("synced_downloads")
      .select("clip_id, device_id, synced_at")
      .eq("profile_id", profileId)
      .order("synced_at", { ascending: false });

    if (error) throw error;

    return (
      data?.map((item) => ({
        clipId: item.clip_id,
        deviceId: item.device_id,
        syncedAt: item.synced_at,
      })) || []
    );
  } catch (error) {
    logError("Failed to get synced downloads", error);
    return [];
  }
}

/**
 * Sync listening progress to the cloud
 */
export async function syncListeningProgress(
  profileId: string,
  clipId: string,
  progressSeconds: number,
  progressPercentage: number,
  deviceId?: string | null
): Promise<boolean> {
  try {
    const { error } = await supabase.rpc("sync_listening_progress", {
      p_profile_id: profileId,
      p_clip_id: clipId,
      p_progress_seconds: progressSeconds,
      p_progress_percentage: progressPercentage,
      p_device_id: deviceId || null,
    });

    if (error) throw error;
    return true;
  } catch (error) {
    logError("Failed to sync listening progress", error);
    return false;
  }
}

/**
 * Get listening progress for a profile
 */
export async function getListeningProgress(
  profileId: string
): Promise<ListeningProgress[]> {
  try {
    const { data, error } = await supabase
      .from("listening_progress")
      .select("clip_id, progress_seconds, progress_percentage, last_played_at")
      .eq("profile_id", profileId)
      .order("last_played_at", { ascending: false });

    if (error) throw error;

    return (
      data?.map((item) => ({
        clipId: item.clip_id,
        progressSeconds: Number(item.progress_seconds),
        progressPercentage: Number(item.progress_percentage),
        lastPlayedAt: item.last_played_at,
      })) || []
    );
  } catch (error) {
    logError("Failed to get listening progress", error);
    return [];
  }
}

/**
 * Get listening progress for a specific clip
 */
export async function getClipListeningProgress(
  profileId: string,
  clipId: string
): Promise<ListeningProgress | null> {
  try {
    const { data, error } = await supabase
      .from("listening_progress")
      .select("clip_id, progress_seconds, progress_percentage, last_played_at")
      .eq("profile_id", profileId)
      .eq("clip_id", clipId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // No row found
        return null;
      }
      throw error;
    }

    if (!data) return null;

    return {
      clipId: data.clip_id,
      progressSeconds: Number(data.progress_seconds),
      progressPercentage: Number(data.progress_percentage),
      lastPlayedAt: data.last_played_at,
    };
  } catch (error) {
    logError("Failed to get clip listening progress", error);
    return null;
  }
}

/**
 * Sync all local downloads to cloud
 */
export async function syncAllDownloads(
  profileId: string,
  deviceId: string,
  downloadedClipIds: string[]
): Promise<{ synced: number; failed: number }> {
  let synced = 0;
  let failed = 0;

  for (const clipId of downloadedClipIds) {
    const success = await syncDownloadedClip(profileId, clipId, deviceId);
    if (success) {
      synced++;
    } else {
      failed++;
    }
  }

  return { synced, failed };
}

/**
 * Sync all listening progress to cloud
 */
export async function syncAllListeningProgress(
  profileId: string,
  deviceId: string | null,
  progressMap: Map<string, { seconds: number; percentage: number }>
): Promise<{ synced: number; failed: number }> {
  let synced = 0;
  let failed = 0;

  for (const [clipId, progress] of progressMap.entries()) {
    const success = await syncListeningProgress(
      profileId,
      clipId,
      progress.seconds,
      progress.percentage,
      deviceId
    );
    if (success) {
      synced++;
    } else {
      failed++;
    }
  }

  return { synced, failed };
}

