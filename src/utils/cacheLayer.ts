/**
 * Advanced caching layer with TTL and size management
 * Provides Redis-like functionality using in-memory cache and IndexedDB
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  accessCount: number;
  lastAccessed: number;
  size: number; // Estimated size in bytes
}

interface CacheConfig {
  maxSize?: number; // Maximum cache size in bytes
  maxEntries?: number; // Maximum number of entries
  defaultTTL?: number; // Default TTL in milliseconds
  enableIndexedDB?: boolean; // Use IndexedDB for persistence
}

class CacheLayer<T> {
  private memoryCache: Map<string, CacheEntry<T>> = new Map();
  private config: Required<CacheConfig>;
  private currentSize: number = 0;
  private indexedDB: IDBDatabase | null = null;
  private dbName: string = "echo-garden-cache";
  private dbVersion: number = 1;

  constructor(config: CacheConfig = {}) {
    this.config = {
      maxSize: config.maxSize ?? 50 * 1024 * 1024, // 50MB default
      maxEntries: config.maxEntries ?? 1000,
      defaultTTL: config.defaultTTL ?? 5 * 60 * 1000, // 5 minutes default
      enableIndexedDB: config.enableIndexedDB ?? false,
    };

    if (this.config.enableIndexedDB && typeof window !== "undefined" && "indexedDB" in window) {
      this.initIndexedDB();
    }
  }

  /**
   * Initialize IndexedDB for persistent caching
   */
  private async initIndexedDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        console.warn("[Cache] Failed to open IndexedDB, using memory cache only");
        resolve();
      };

      request.onsuccess = () => {
        this.indexedDB = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains("cache")) {
          db.createObjectStore("cache", { keyPath: "key" });
        }
      };
    });
  }

  /**
   * Estimate the size of a value in bytes
   */
  private estimateSize(value: T): number {
    try {
      const str = JSON.stringify(value);
      return new Blob([str]).size;
    } catch {
      // Fallback estimation
      return 1024; // 1KB default
    }
  }

  /**
   * Evict least recently used entries when cache is full
   */
  private evictLRU(): void {
    if (this.memoryCache.size === 0) return;

    // Sort by last accessed time
    const entries = Array.from(this.memoryCache.entries()).sort(
      (a, b) => a[1].lastAccessed - b[1].lastAccessed
    );

    // Remove oldest 10% of entries
    const toRemove = Math.max(1, Math.floor(entries.length * 0.1));
    for (let i = 0; i < toRemove; i++) {
      const [key, entry] = entries[i];
      this.memoryCache.delete(key);
      this.currentSize -= entry.size;
    }
  }

  /**
   * Set a value in the cache
   */
  async set(key: string, value: T, ttl?: number): Promise<void> {
    const expiresAt = Date.now() + (ttl ?? this.config.defaultTTL);
    const size = this.estimateSize(value);

    const entry: CacheEntry<T> = {
      value,
      expiresAt,
      accessCount: 0,
      lastAccessed: Date.now(),
      size,
    };

    // Check if we need to evict entries
    if (
      this.currentSize + size > this.config.maxSize ||
      this.memoryCache.size >= this.config.maxEntries
    ) {
      this.evictLRU();
    }

    // Remove old entry if exists
    const oldEntry = this.memoryCache.get(key);
    if (oldEntry) {
      this.currentSize -= oldEntry.size;
    }

    this.memoryCache.set(key, entry);
    this.currentSize += size;

    // Also store in IndexedDB if enabled
    if (this.config.enableIndexedDB && this.indexedDB) {
      try {
        const transaction = this.indexedDB.transaction(["cache"], "readwrite");
        const store = transaction.objectStore("cache");
        await store.put({
          key,
          entry: {
            ...entry,
            value: JSON.stringify(value), // Serialize for IndexedDB
          },
        });
      } catch (error) {
        console.warn("[Cache] Failed to store in IndexedDB:", error);
      }
    }
  }

  /**
   * Get a value from the cache
   */
  async get(key: string): Promise<T | null> {
    // Check memory cache first
    const entry = this.memoryCache.get(key);

    if (entry) {
      // Check if expired
      if (Date.now() > entry.expiresAt) {
        this.memoryCache.delete(key);
        this.currentSize -= entry.size;
        return null;
      }

      // Update access stats
      entry.accessCount++;
      entry.lastAccessed = Date.now();
      return entry.value;
    }

    // Check IndexedDB if enabled
    if (this.config.enableIndexedDB && this.indexedDB) {
      try {
        const transaction = this.indexedDB.transaction(["cache"], "readonly");
        const store = transaction.objectStore("cache");
        const request = store.get(key);

        return new Promise((resolve) => {
          request.onsuccess = () => {
            const result = request.result;
            if (!result) {
              resolve(null);
              return;
            }

            const entry = result.entry;
            if (Date.now() > entry.expiresAt) {
              // Remove expired entry
              const deleteTransaction = this.indexedDB!.transaction(["cache"], "readwrite");
              deleteTransaction.objectStore("cache").delete(key);
              resolve(null);
              return;
            }

            // Deserialize and add to memory cache
            try {
              const value = JSON.parse(entry.value as unknown as string) as T;
              this.set(key, value, entry.expiresAt - Date.now());
              resolve(value);
            } catch {
              resolve(null);
            }
          };

          request.onerror = () => resolve(null);
        });
      } catch (error) {
        console.warn("[Cache] Failed to read from IndexedDB:", error);
        return null;
      }
    }

    return null;
  }

  /**
   * Check if a key exists in the cache
   */
  async has(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== null;
  }

  /**
   * Delete a key from the cache
   */
  async delete(key: string): Promise<void> {
    const entry = this.memoryCache.get(key);
    if (entry) {
      this.memoryCache.delete(key);
      this.currentSize -= entry.size;
    }

    if (this.config.enableIndexedDB && this.indexedDB) {
      try {
        const transaction = this.indexedDB.transaction(["cache"], "readwrite");
        transaction.objectStore("cache").delete(key);
      } catch (error) {
        console.warn("[Cache] Failed to delete from IndexedDB:", error);
      }
    }
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    this.memoryCache.clear();
    this.currentSize = 0;

    if (this.config.enableIndexedDB && this.indexedDB) {
      try {
        const transaction = this.indexedDB.transaction(["cache"], "readwrite");
        await transaction.objectStore("cache").clear();
      } catch (error) {
        console.warn("[Cache] Failed to clear IndexedDB:", error);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    entries: number;
    maxSize: number;
    maxEntries: number;
    hitRate?: number;
  } {
    return {
      size: this.currentSize,
      entries: this.memoryCache.size,
      maxSize: this.config.maxSize,
      maxEntries: this.config.maxEntries,
    };
  }

  /**
   * Clean up expired entries
   */
  async cleanup(): Promise<void> {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.memoryCache.entries()) {
      if (now > entry.expiresAt) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      await this.delete(key);
    }
  }
}

// Global cache instances for different use cases
export const apiCache = new CacheLayer({
  maxSize: 10 * 1024 * 1024, // 10MB
  maxEntries: 500,
  defaultTTL: 5 * 60 * 1000, // 5 minutes
});

export const audioCache = new CacheLayer({
  maxSize: 100 * 1024 * 1024, // 100MB
  maxEntries: 200,
  defaultTTL: 7 * 24 * 60 * 60 * 1000, // 7 days
  enableIndexedDB: true, // Persist audio metadata
});

export const userDataCache = new CacheLayer({
  maxSize: 5 * 1024 * 1024, // 5MB
  maxEntries: 1000,
  defaultTTL: 10 * 60 * 1000, // 10 minutes
});

// Periodic cleanup
if (typeof window !== "undefined") {
  setInterval(() => {
    apiCache.cleanup();
    audioCache.cleanup();
    userDataCache.cleanup();
  }, 60 * 1000); // Cleanup every minute
}

export { CacheLayer };
export type { CacheConfig };

