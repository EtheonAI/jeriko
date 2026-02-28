/**
 * ConnectorRegistry — singleton that discovers, initialises, and manages
 * the lifecycle of every registered connector.
 */

import type {
  ConnectorInterface,
  HealthResult,
} from "./interface.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConnectorFactory = () => ConnectorInterface;

interface RegistryEntry {
  factory: ConnectorFactory;
  instance: ConnectorInterface | null;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export class ConnectorRegistry {
  private entries = new Map<string, RegistryEntry>();

  /**
   * Register a connector factory under `name`.
   * The factory is lazily invoked — the connector is only instantiated
   * when `get()` or `initAll()` is called.
   */
  register(name: string, factory: ConnectorFactory): void {
    if (this.entries.has(name)) {
      throw new Error(`Connector "${name}" is already registered`);
    }
    this.entries.set(name, { factory, instance: null });
  }

  /**
   * Get an initialised connector by name.
   * Returns `undefined` if the name is not registered or if the connector
   * has not been initialised yet.
   */
  get(name: string): ConnectorInterface | undefined {
    return this.entries.get(name)?.instance ?? undefined;
  }

  /**
   * Return the names of all registered connectors (initialised or not).
   */
  list(): string[] {
    return Array.from(this.entries.keys());
  }

  /**
   * Instantiate (if needed) and `init()` every registered connector.
   * Connectors that throw during init are logged and skipped — they will
   * not appear in `get()` results.
   */
  async initAll(): Promise<void> {
    const results = await Promise.allSettled(
      Array.from(this.entries.entries()).map(async ([name, entry]) => {
        try {
          if (!entry.instance) {
            entry.instance = entry.factory();
          }
          await entry.instance.init();
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[connector:${name}] init failed: ${message}`);
          // Null out so `get()` doesn't return a half-initialised connector.
          entry.instance = null;
          throw err;
        }
      }),
    );

    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length > 0) {
      console.warn(
        `[connector-registry] ${failed.length}/${results.length} connectors failed to init`,
      );
    }
  }

  /**
   * Run a health check on every initialised connector.
   * Connectors that are registered but not yet initialised are reported
   * as unhealthy with an appropriate error message.
   */
  async healthAll(): Promise<Record<string, HealthResult>> {
    const out: Record<string, HealthResult> = {};

    await Promise.allSettled(
      Array.from(this.entries.entries()).map(async ([name, entry]) => {
        if (!entry.instance) {
          out[name] = { healthy: false, latency_ms: 0, error: "not initialised" };
          return;
        }
        try {
          out[name] = await entry.instance.health();
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          out[name] = { healthy: false, latency_ms: 0, error: message };
        }
      }),
    );

    return out;
  }

  /**
   * Gracefully shut down every initialised connector.
   * Errors are logged but never propagated.
   */
  async shutdownAll(): Promise<void> {
    await Promise.allSettled(
      Array.from(this.entries.entries()).map(async ([name, entry]) => {
        if (!entry.instance) return;
        try {
          await entry.instance.shutdown();
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[connector:${name}] shutdown error: ${message}`);
        } finally {
          entry.instance = null;
        }
      }),
    );
  }
}
