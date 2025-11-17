/**
 * IndexedDB utility for storing downloaded clips for offline playback
 * Uses IndexedDB to persist audio files and clip metadata
 */

interface DownloadedClip {
  clipId: string;
  audioBlob: Blob;
  audioPath: string;
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

const DB_NAME = "EchoGardenOffline";
const DB_VERSION = 1;
const STORE_NAME = "downloadedClips";

class OfflineStorage {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize IndexedDB
   */
  private async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error("Failed to open IndexedDB:", request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "clipId" });
          store.createIndex("downloadedAt", "downloadedAt", { unique: false });
          store.createIndex("title", "title", { unique: false });
        }
      };
    });

    return this.initPromise;
  }

  /**
   * Download and store a clip for offline playback
   */
  async downloadClip(
    clipId: string,
    audioPath: string,
    audioBlob: Blob,
    metadata: {
      title: string | null;
      summary: string | null;
      duration: number;
      profiles: {
        handle: string | null;
        emoji_avatar: string | null;
      } | null;
    }
  ): Promise<void> {
    await this.init();

    if (!this.db) {
      throw new Error("IndexedDB not initialized");
    }

    const downloadedClip: DownloadedClip = {
      clipId,
      audioBlob,
      audioPath,
      title: metadata.title,
      summary: metadata.summary,
      duration: metadata.duration,
      profiles: metadata.profiles,
      downloadedAt: Date.now(),
      fileSize: audioBlob.size,
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(downloadedClip);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Check if a clip is downloaded
   */
  async isClipDownloaded(clipId: string): Promise<boolean> {
    await this.init();

    if (!this.db) return false;

    return new Promise((resolve) => {
      const transaction = this.db!.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(clipId);

      request.onsuccess = () => {
        resolve(!!request.result);
      };

      request.onerror = () => {
        resolve(false);
      };
    });
  }

  /**
   * Get downloaded clip data
   */
  async getDownloadedClip(clipId: string): Promise<DownloadedClip | null> {
    await this.init();

    if (!this.db) return null;

    return new Promise((resolve) => {
      const transaction = this.db!.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(clipId);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        resolve(null);
      };
    });
  }

  /**
   * Get audio blob for a downloaded clip
   */
  async getAudioBlob(clipId: string): Promise<Blob | null> {
    const clip = await this.getDownloadedClip(clipId);
    return clip?.audioBlob || null;
  }

  /**
   * Get all downloaded clip IDs
   */
  async getAllDownloadedClipIds(): Promise<string[]> {
    await this.init();

    if (!this.db) return [];

    return new Promise((resolve) => {
      const transaction = this.db!.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAllKeys();

      request.onsuccess = () => {
        resolve(request.result as string[]);
      };

      request.onerror = () => {
        resolve([]);
      };
    });
  }

  /**
   * Get all downloaded clips with metadata
   */
  async getAllDownloadedClips(): Promise<DownloadedClip[]> {
    await this.init();

    if (!this.db) return [];

    return new Promise((resolve) => {
      const transaction = this.db!.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        resolve([]);
      };
    });
  }

  /**
   * Delete a downloaded clip
   */
  async deleteDownloadedClip(clipId: string): Promise<void> {
    await this.init();

    if (!this.db) {
      throw new Error("IndexedDB not initialized");
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(clipId);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Get total storage used by downloaded clips
   */
  async getStorageUsed(): Promise<number> {
    const clips = await this.getAllDownloadedClips();
    return clips.reduce((total, clip) => total + (clip.fileSize || 0), 0);
  }

  /**
   * Clear all downloaded clips
   */
  async clearAll(): Promise<void> {
    await this.init();

    if (!this.db) {
      throw new Error("IndexedDB not initialized");
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }
}

// Singleton instance
export const offlineStorage = new OfflineStorage();

// Helper function to format file size
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

