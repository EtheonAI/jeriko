// Layer 0 — Type-safe event bus. Zero internal imports.

/**
 * A strongly-typed event bus.
 *
 * @typeParam EventMap  An interface mapping event names to their payload types.
 *
 * @example
 *   interface AppEvents {
 *     "agent:started": { model: string };
 *     "agent:error":   { error: string };
 *     "tick":          undefined;
 *   }
 *
 *   const bus = new Bus<AppEvents>();
 *   bus.on("agent:started", ({ model }) => console.log(model));
 *   bus.emit("agent:started", { model: "claude" });
 */
export class Bus<EventMap extends Record<string, unknown> = Record<string, unknown>> {
  private handlers = new Map<keyof EventMap, Set<(data: any) => void>>();

  /**
   * Subscribe to an event. Returns an unsubscribe function.
   */
  on<K extends keyof EventMap>(
    event: K,
    handler: (data: EventMap[K]) => void,
  ): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler);
    return () => this.off(event, handler);
  }

  /**
   * Unsubscribe a specific handler from an event.
   */
  off<K extends keyof EventMap>(
    event: K,
    handler: (data: EventMap[K]) => void,
  ): void {
    const set = this.handlers.get(event);
    if (set) {
      set.delete(handler);
      if (set.size === 0) this.handlers.delete(event);
    }
  }

  /**
   * Subscribe to an event, but only fire the handler once.
   */
  once<K extends keyof EventMap>(
    event: K,
    handler: (data: EventMap[K]) => void,
  ): () => void {
    const wrapper = ((data: EventMap[K]) => {
      this.off(event, wrapper);
      handler(data);
    }) as (data: EventMap[K]) => void;
    return this.on(event, wrapper);
  }

  /**
   * Emit an event, calling all registered handlers synchronously.
   * Handlers that throw are caught and logged to stderr — they never
   * break the emit loop.
   */
  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of set) {
      try {
        handler(data);
      } catch (err) {
        console.error(`[Bus] handler threw on "${String(event)}":`, err);
      }
    }
  }

  /**
   * Remove all handlers for a specific event, or all events if no arg.
   */
  clear(event?: keyof EventMap): void {
    if (event !== undefined) {
      this.handlers.delete(event);
    } else {
      this.handlers.clear();
    }
  }

  /**
   * Return the number of handlers registered for a given event.
   */
  listenerCount(event: keyof EventMap): number {
    return this.handlers.get(event)?.size ?? 0;
  }

  /**
   * Wait for a single occurrence of an event, returned as a promise.
   */
  waitFor<K extends keyof EventMap>(
    event: K,
    timeoutMs?: number,
  ): Promise<EventMap[K]> {
    return new Promise<EventMap[K]>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const unsub = this.once(event, (data) => {
        if (timer) clearTimeout(timer);
        resolve(data);
      });
      if (timeoutMs !== undefined) {
        timer = setTimeout(() => {
          unsub();
          reject(new Error(`Bus.waitFor("${String(event)}") timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Global singleton — use this for application-wide events.
// Import-specific Bus instances are fine for isolated subsystems.
// ---------------------------------------------------------------------------

/** Global event bus singleton. */
export const globalBus = new Bus();
