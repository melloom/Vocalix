/**
 * Batch API request utilities
 * Groups multiple API requests into batches to reduce network overhead
 */

interface BatchRequest<T> {
  key: string;
  request: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

interface BatchConfig {
  maxBatchSize?: number;
  maxWaitTime?: number; // milliseconds
}

class RequestBatcher<T> {
  private queue: BatchRequest<T>[] = [];
  private timer: NodeJS.Timeout | null = null;
  private config: Required<BatchConfig>;

  constructor(config: BatchConfig = {}) {
    this.config = {
      maxBatchSize: config.maxBatchSize ?? 10,
      maxWaitTime: config.maxWaitTime ?? 50, // 50ms default
    };
  }

  /**
   * Add a request to the batch queue
   */
  add(key: string, request: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({ key, request, resolve, reject });

      // If queue reaches max size, process immediately
      if (this.queue.length >= this.config.maxBatchSize) {
        this.processBatch();
      } else if (!this.timer) {
        // Otherwise, wait for maxWaitTime or until queue is full
        this.timer = setTimeout(() => {
          this.processBatch();
        }, this.config.maxWaitTime);
      }
    });
  }

  /**
   * Process the current batch of requests
   */
  private async processBatch(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.queue.length === 0) return;

    const batch = this.queue.splice(0, this.config.maxBatchSize);
    
    // Execute all requests in parallel
    const promises = batch.map((item) =>
      item
        .request()
        .then((result) => item.resolve(result))
        .catch((error) => item.reject(error))
    );

    await Promise.allSettled(promises);
  }

  /**
   * Force process any remaining requests
   */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.processBatch();
  }
}

/**
 * Create a batcher instance for a specific request type
 */
export function createBatcher<T>(config?: BatchConfig): RequestBatcher<T> {
  return new RequestBatcher<T>(config);
}

/**
 * Batch Supabase queries
 * Groups multiple Supabase queries into a single batch request
 */
export async function batchSupabaseQueries<T>(
  queries: Array<() => Promise<{ data: T | null; error: any }>>
): Promise<Array<{ data: T | null; error: any }>> {
  // Execute all queries in parallel
  const results = await Promise.all(queries.map((query) => query()));
  return results;
}

/**
 * Batch fetch requests
 * Groups multiple fetch requests into a single batch
 */
export async function batchFetch<T>(
  requests: Array<() => Promise<T>>
): Promise<Array<{ data?: T; error?: Error }>> {
  const results = await Promise.allSettled(
    requests.map((request) => request())
  );

  return results.map((result) => {
    if (result.status === "fulfilled") {
      return { data: result.value };
    } else {
      return { error: result.reason };
    }
  });
}

/**
 * Debounced batch processor
 * Collects requests over a time window and processes them in batches
 */
export class DebouncedBatcher<T> {
  private requests: Map<string, BatchRequest<T>> = new Map();
  private timer: NodeJS.Timeout | null = null;
  private config: Required<BatchConfig>;

  constructor(config: BatchConfig = {}) {
    this.config = {
      maxBatchSize: config.maxBatchSize ?? 10,
      maxWaitTime: config.maxWaitTime ?? 100,
    };
  }

  add(key: string, request: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      // If key already exists, reuse the existing promise
      if (this.requests.has(key)) {
        const existing = this.requests.get(key)!;
        existing.request().then(resolve).catch(reject);
        return;
      }

      this.requests.set(key, { key, request, resolve, reject });

      // Process if batch is full
      if (this.requests.size >= this.config.maxBatchSize) {
        this.processBatch();
      } else if (!this.timer) {
        // Otherwise, wait for debounce time
        this.timer = setTimeout(() => {
          this.processBatch();
        }, this.config.maxWaitTime);
      }
    });
  }

  private async processBatch(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.requests.size === 0) return;

    const batch = Array.from(this.requests.values());
    this.requests.clear();

    // Execute all requests in parallel
    const promises = batch.map((item) =>
      item
        .request()
        .then((result) => item.resolve(result))
        .catch((error) => item.reject(error))
    );

    await Promise.allSettled(promises);
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.processBatch();
  }
}

