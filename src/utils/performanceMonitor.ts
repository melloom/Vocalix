/**
 * Performance monitoring utilities
 * Helps track and optimize app performance
 */

interface PerformanceMetric {
  name: string;
  value: number;
  timestamp: number;
}

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private observers: PerformanceObserver[] = [];

  constructor() {
    if (typeof window !== "undefined" && "PerformanceObserver" in window) {
      this.initObservers();
    }
  }

  private initObservers() {
    // Observe long tasks (tasks > 50ms)
    if ("PerformanceObserver" in window) {
      try {
        const longTaskObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.duration > 50) {
              console.warn(`Long task detected: ${entry.duration.toFixed(2)}ms`);
              this.recordMetric("long_task", entry.duration);
            }
          }
        });
        longTaskObserver.observe({ entryTypes: ["longtask"] });
        this.observers.push(longTaskObserver);
      } catch (e) {
        // Long task observer not supported
      }

      // Observe layout shifts
      try {
        const layoutShiftObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if ((entry as any).value > 0.1) {
              console.warn(`Layout shift detected: ${(entry as any).value.toFixed(3)}`);
              this.recordMetric("layout_shift", (entry as any).value);
            }
          }
        });
        layoutShiftObserver.observe({ entryTypes: ["layout-shift"] });
        this.observers.push(layoutShiftObserver);
      } catch (e) {
        // Layout shift observer not supported
      }

      // Observe paint metrics
      try {
        const paintObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            this.recordMetric(entry.name, entry.startTime);
          }
        });
        paintObserver.observe({ entryTypes: ["paint"] });
        this.observers.push(paintObserver);
      } catch (e) {
        // Paint observer not supported
      }
    }
  }

  recordMetric(name: string, value: number) {
    this.metrics.push({
      name,
      value,
      timestamp: Date.now(),
    });

    // Keep only last 100 metrics
    if (this.metrics.length > 100) {
      this.metrics.shift();
    }
  }

  measureFunction<T>(name: string, fn: () => T): T {
    if (typeof performance === "undefined" || !performance.mark) {
      return fn();
    }

    const startMark = `${name}-start`;
    const endMark = `${name}-end`;
    const measureName = `${name}-measure`;

    performance.mark(startMark);
    const result = fn();
    performance.mark(endMark);

    try {
      performance.measure(measureName, startMark, endMark);
      const measure = performance.getEntriesByName(measureName)[0];
      this.recordMetric(name, measure.duration);
    } catch (e) {
      // Measure failed
    }

    return result;
  }

  async measureAsyncFunction<T>(name: string, fn: () => Promise<T>): Promise<T> {
    if (typeof performance === "undefined" || !performance.mark) {
      return fn();
    }

    const startMark = `${name}-start`;
    const endMark = `${name}-end`;
    const measureName = `${name}-measure`;

    performance.mark(startMark);
    const result = await fn();
    performance.mark(endMark);

    try {
      performance.measure(measureName, startMark, endMark);
      const measure = performance.getEntriesByName(measureName)[0];
      this.recordMetric(name, measure.duration);
    } catch (e) {
      // Measure failed
    }

    return result;
  }

  getMetrics() {
    return [...this.metrics];
  }

  getAverageMetric(name: string): number | null {
    const relevantMetrics = this.metrics.filter((m) => m.name === name);
    if (relevantMetrics.length === 0) return null;

    const sum = relevantMetrics.reduce((acc, m) => acc + m.value, 0);
    return sum / relevantMetrics.length;
  }

  clear() {
    this.metrics = [];
  }

  disconnect() {
    this.observers.forEach((observer) => observer.disconnect());
    this.observers = [];
  }
}

// Singleton instance
export const performanceMonitor = typeof window !== "undefined" 
  ? new PerformanceMonitor()
  : null;

