import type { EventMap } from "./types";

export interface EmitterOptions {
  debug?: boolean;
  maxListeners?: number;
  onError?: (
    error: Error,
    eventType: string,
    handler: (...args: any[]) => void,
  ) => void;
}

export class Emitter<T extends EventMap> {
  private handlers = new Map<keyof T, Set<(...args: any[]) => void>>();
  private options: EmitterOptions;
  private listenerCounts = new Map<keyof T, number>();

  constructor(options: EmitterOptions = {}) {
    this.options = {
      maxListeners: 100,
      debug: false,
      ...options,
    };
  }

  on<K extends keyof T>(type: K, handler: (...args: T[K]) => void) {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }

    // Check max listeners
    const currentCount = set.size;
    if (
      this.options.maxListeners &&
      currentCount === this.options.maxListeners
    ) {
      console.warn(
        `Emitter: Maximum listeners (${this.options.maxListeners}) exceeded for event "${String(type)}"`,
      );
    }

    set.add(handler as any);

    // Update listener count
    this.listenerCounts.set(type, set.size);

    this.log(`Added listener for "${String(type)}", total: ${set.size}`);

    return () => this.off(type, handler);
  }

  once<K extends keyof T>(type: K, handler: (...args: T[K]) => void) {
    const wrap = (...args: T[K]) => {
      this.off(type, wrap as any);
      handler(...args);
      this.log(`Once listener triggered for "${String(type)}"`);
    };
    return this.on(type, wrap);
  }

  off<K extends keyof T>(type: K, handler: (...args: T[K]) => void) {
    const set = this.handlers.get(type);
    if (!set) return;

    set.delete(handler as any);
    if (set.size === 0) {
      this.handlers.delete(type);
      this.listenerCounts.delete(type);
    } else {
      this.listenerCounts.set(type, set.size);
    }

    this.log(`Removed listener for "${String(type)}", remaining: ${set.size}`);
  }

  emit<K extends keyof T>(type: K, ...args: T[K]) {
    const set = this.handlers.get(type);
    if (!set) {
      this.log(`No listeners for event "${String(type)}"`);
      return;
    }

    this.log(`Emitting "${String(type)}" to ${set.size} listener(s)`);

    // Convert to array to avoid issues if handlers are added/removed during iteration
    const handlers = Array.from(set);
    for (const fn of handlers) {
      try {
        (fn as any)(...args);
      } catch (error) {
        if (this.options.onError) {
          this.options.onError(error as Error, String(type), fn);
        } else {
          console.error(
            `Emitter: Error in handler for event "${String(type)}":`,
            error,
          );
        }
      }
    }
  }

  removeAll(type?: keyof T) {
    if (type) {
      const count = this.handlers.get(type)?.size || 0;
      this.handlers.delete(type);
      this.listenerCounts.delete(type);
      this.log(`Removed all ${count} listeners for "${String(type)}"`);
    } else {
      const total = Array.from(this.listenerCounts.values()).reduce(
        (sum, count) => sum + count,
        0,
      );
      this.handlers.clear();
      this.listenerCounts.clear();
      this.log(`Removed all ${total} listeners`);
    }
  }

  // Utility methods
  listenerCount<K extends keyof T>(type: K): number {
    return this.listenerCounts.get(type) || 0;
  }

  eventNames(): (keyof T)[] {
    return Array.from(this.handlers.keys());
  }

  getStats() {
    const stats: Record<string, number> = {};
    for (const [event, count] of this.listenerCounts) {
      stats[String(event)] = count;
    }
    return {
      totalEvents: this.handlers.size,
      totalListeners: Array.from(this.listenerCounts.values()).reduce(
        (sum, count) => sum + count,
        0,
      ),
      listenersByEvent: stats,
    };
  }

  private log(message: string) {
    if (this.options.debug) {
      console.log(`[Emitter] ${message}`);
    }
  }

  // Performance optimization for high-frequency events
  emitThrottled<K extends keyof T>(type: K, delay: number, ...args: T[K]) {
    // Simple throttling implementation
    if (!this.throttleTimers) {
      this.throttleTimers = new Map();
    }

    const key = String(type);
    const existingTimer = this.throttleTimers.get(key);

    if (existingTimer) {
      return; // Skip if already throttled
    }

    this.emit(type, ...args);

    const timer = setTimeout(() => {
      this.throttleTimers?.delete(key);
    }, delay);

    this.throttleTimers.set(key, timer);
  }

  private throttleTimers?: Map<string, ReturnType<typeof setTimeout>>;

  destroy() {
    // Clean up throttle timers
    if (this.throttleTimers) {
      for (const timer of this.throttleTimers.values()) {
        clearTimeout(timer);
      }
      this.throttleTimers.clear();
    }

    this.removeAll();
  }
}
