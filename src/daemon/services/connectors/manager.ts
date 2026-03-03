/**
 * ConnectorManager — daemon-level lifecycle manager for all connectors.
 *
 * Provides:
 *   - Lazy initialization: connectors are loaded on first access, not at boot
 *   - Instance caching: each connector is initialized once and reused
 *   - Unified health checks: call health() on any or all configured connectors
 *   - Graceful shutdown: shuts down all active connectors in parallel
 *   - Webhook dispatch: route webhook payloads to the correct connector
 *
 * The manager wraps CONNECTOR_FACTORIES (the static registry) with runtime
 * lifecycle. CLI commands continue to use loadConnector() for one-shot calls.
 * The daemon uses ConnectorManager for long-lived connector instances.
 */

import { getLogger } from "../../../shared/logger.js";
import { isConnectorConfigured, CONNECTOR_DEFS } from "../../../shared/connector.js";
import { CONNECTOR_FACTORIES } from "./registry.js";
import type { ConnectorInterface, HealthResult, WebhookEvent } from "./interface.js";

const log = getLogger();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConnectorStatus {
  name: string;
  label: string;
  configured: boolean;
  initialized: boolean;
  healthy: boolean;
  latency_ms?: number;
  last_check?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// ConnectorManager
// ---------------------------------------------------------------------------

export class ConnectorManager {
  /** Live connector instances, keyed by name. Populated on first access. */
  private instances = new Map<string, ConnectorInterface>();

  /** Names currently being initialized (prevents concurrent init for same connector). */
  private initializing = new Map<string, Promise<ConnectorInterface>>();

  /** Cached health results, keyed by name. */
  private healthCache = new Map<string, { result: HealthResult; checkedAt: number }>();

  /** How long health results are cached (ms). */
  private readonly healthCacheTtl: number;

  constructor(opts?: { healthCacheTtlMs?: number }) {
    this.healthCacheTtl = opts?.healthCacheTtlMs ?? 30_000;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Get a live connector instance by name. Initializes on first access.
   *
   * Returns null if the connector is unknown, not configured, or init fails.
   * The instance is cached — subsequent calls return the same object.
   *
   * License gate: new connector activations are checked against the billing
   * tier's connector limit. Already-active connectors bypass the check.
   */
  async get(name: string): Promise<ConnectorInterface | null> {
    // Return cached instance (already-active connectors are never gated)
    const existing = this.instances.get(name);
    if (existing) return existing;

    // Check if this connector exists in the factory registry
    if (!CONNECTOR_FACTORIES[name]) {
      log.warn(`ConnectorManager: unknown connector "${name}"`);
      return null;
    }

    // Check if credentials are configured
    if (!isConnectorConfigured(name)) {
      log.debug(`ConnectorManager: connector "${name}" is not configured (missing env vars)`);
      return null;
    }

    // License gate: check if the tier allows a new connector activation.
    // Only active when billing is configured (STRIPE_BILLING_SECRET_KEY is set).
    // When billing is not configured, the gate is a no-op — all tiers get unlimited connectors.
    if (process.env.STRIPE_BILLING_SECRET_KEY) {
      try {
        const { canActivateConnector } = await import("../../billing/license.js");
        const check = canActivateConnector(this.instances.size);
        if (!check.allowed) {
          log.info(`ConnectorManager: connector "${name}" blocked by license — ${check.reason}`);
          throw new Error(check.reason);
        }
      } catch (err: unknown) {
        // Re-throw license gate errors (they have user-facing messages)
        if (err instanceof Error && err.message.includes("Connector limit reached")) {
          throw err;
        }
        // Swallow import/init errors — billing module may not be initialized yet
        log.debug(`ConnectorManager: license check skipped — ${err}`);
      }
    }

    // Deduplicate concurrent init calls for the same connector
    const pending = this.initializing.get(name);
    if (pending) return pending;

    const initPromise = this.initConnector(name);
    this.initializing.set(name, initPromise);

    try {
      const connector = await initPromise;
      return connector;
    } catch {
      return null;
    } finally {
      this.initializing.delete(name);
    }
  }

  /**
   * Check if a connector is available (configured and can be initialized).
   */
  has(name: string): boolean {
    return !!CONNECTOR_FACTORIES[name] && isConnectorConfigured(name);
  }

  /**
   * Get a live connector, throwing if unavailable. Use when the connector
   * is expected to exist (e.g. webhook dispatch for a known service).
   */
  async require(name: string): Promise<ConnectorInterface> {
    const connector = await this.get(name);
    if (!connector) {
      throw new Error(`Connector "${name}" is not available`);
    }
    return connector;
  }

  /**
   * List all known connector names (from CONNECTOR_FACTORIES).
   */
  get names(): string[] {
    return Object.keys(CONNECTOR_FACTORIES);
  }

  // -----------------------------------------------------------------------
  // Health
  // -----------------------------------------------------------------------

  /**
   * Get health status for a single connector.
   * Uses cached results within the TTL window.
   */
  async health(name: string): Promise<ConnectorStatus> {
    const def = CONNECTOR_DEFS.find((d) => d.name === name);
    const label = def?.label ?? name;
    const configured = isConnectorConfigured(name);

    if (!configured) {
      return { name, label, configured: false, initialized: false, healthy: false };
    }

    // Check cache
    const cached = this.healthCache.get(name);
    if (cached && Date.now() - cached.checkedAt < this.healthCacheTtl) {
      return {
        name,
        label,
        configured: true,
        initialized: this.instances.has(name),
        healthy: cached.result.healthy,
        latency_ms: cached.result.latency_ms,
        last_check: new Date(cached.checkedAt).toISOString(),
        error: cached.result.error,
      };
    }

    // Live health check
    const connector = await this.get(name);
    if (!connector) {
      return {
        name,
        label,
        configured: true,
        initialized: false,
        healthy: false,
        error: "Failed to initialize connector",
      };
    }

    const result = await connector.health();
    const now = Date.now();
    this.healthCache.set(name, { result, checkedAt: now });

    return {
      name,
      label,
      configured: true,
      initialized: true,
      healthy: result.healthy,
      latency_ms: result.latency_ms,
      last_check: new Date(now).toISOString(),
      error: result.error,
    };
  }

  /**
   * Get health status for all known connectors.
   * Runs health checks in parallel for configured connectors.
   */
  async healthAll(): Promise<ConnectorStatus[]> {
    const names = this.names;
    const results = await Promise.all(names.map((name) => this.health(name)));
    return results;
  }

  // -----------------------------------------------------------------------
  // Webhook dispatch
  // -----------------------------------------------------------------------

  /**
   * Route a webhook payload to the appropriate connector for verification
   * and rich event parsing.
   *
   * @param connectorName  The connector to dispatch to (e.g. "stripe", "github")
   * @param headers        Lowercased HTTP headers from the webhook request
   * @param rawBody        Raw request body string (needed for HMAC verification)
   * @returns Parsed WebhookEvent, or null if the connector is unavailable
   */
  async dispatchWebhook(
    connectorName: string,
    headers: Record<string, string>,
    rawBody: string,
  ): Promise<WebhookEvent | null> {
    const connector = await this.get(connectorName);
    if (!connector) {
      log.warn(`ConnectorManager: webhook dispatch failed — connector "${connectorName}" unavailable`);
      return null;
    }

    return connector.webhook(headers, rawBody);
  }

  // -----------------------------------------------------------------------
  // License enforcement
  // -----------------------------------------------------------------------

  /**
   * Enforce connector limits after a license downgrade.
   *
   * Evicts excess cached instances beyond the allowed limit. Evicted connectors
   * are gracefully shut down. They are NOT deleted — they will simply re-gate
   * through canActivateConnector() on the next get() call.
   *
   * @param maxConnectors  The new connector limit from the license
   * @returns Names of connectors that were evicted
   */
  async enforceLimits(maxConnectors: number): Promise<string[]> {
    const activeCount = this.instances.size;
    if (activeCount <= maxConnectors) return [];

    const excess = activeCount - maxConnectors;
    const evicted: string[] = [];

    // Evict the most recently added connectors first (LIFO) —
    // the oldest/most-used connectors are more likely to be critical.
    const entries = [...this.instances.entries()].reverse();

    for (const [name, connector] of entries) {
      if (evicted.length >= excess) break;

      try {
        await connector.shutdown();
        log.info(`ConnectorManager: evicted "${name}" (license enforcement)`);
      } catch (err) {
        log.warn(`ConnectorManager: "${name}" shutdown error during enforcement: ${err}`);
      }

      this.instances.delete(name);
      this.healthCache.delete(name);
      evicted.push(name);
    }

    log.info(`ConnectorManager: enforced limit ${maxConnectors} — evicted ${evicted.length} connector(s): ${evicted.join(", ")}`);
    return evicted;
  }

  /**
   * Number of currently active (cached) connector instances.
   */
  get activeCount(): number {
    return this.instances.size;
  }

  // -----------------------------------------------------------------------
  // Shutdown
  // -----------------------------------------------------------------------

  /**
   * Gracefully shut down all active connector instances.
   * Called during daemon shutdown (kernel.ts).
   */
  async shutdownAll(): Promise<void> {
    const entries = [...this.instances.entries()];
    if (entries.length === 0) return;

    log.info(`ConnectorManager: shutting down ${entries.length} connector(s)`);

    const results = await Promise.allSettled(
      entries.map(async ([name, connector]) => {
        try {
          await connector.shutdown();
          log.debug(`ConnectorManager: ${name} shut down`);
        } catch (err) {
          log.warn(`ConnectorManager: ${name} shutdown error: ${err}`);
        }
      }),
    );

    this.instances.clear();
    this.healthCache.clear();

    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) {
      log.warn(`ConnectorManager: ${failed} connector(s) had shutdown errors`);
    }
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  /**
   * Initialize a connector: resolve factory, instantiate, call init(), cache.
   */
  private async initConnector(name: string): Promise<ConnectorInterface> {
    const factory = CONNECTOR_FACTORIES[name];
    if (!factory) throw new Error(`Unknown connector: ${name}`);

    log.debug(`ConnectorManager: initializing "${name}"`);

    const Ctor = await factory();
    const connector = new Ctor();
    await connector.init();

    this.instances.set(name, connector);
    log.info(`ConnectorManager: "${name}" initialized (v${connector.version})`);

    return connector;
  }
}
