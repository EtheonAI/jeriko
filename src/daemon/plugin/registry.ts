// Daemon — Plugin manifest + trust management.
// Tracks installed plugins and which ones the user has explicitly trusted.

import * as fs from "node:fs";
import * as path from "node:path";
import { getLogger } from "../../shared/logger.js";
import { getDataDir } from "../../shared/config.js";

const log = getLogger();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Plugin manifest — read from jeriko-plugin.json in the plugin directory. */
export interface PluginManifest {
  /** Plugin name (unique identifier). */
  name: string;
  /** SemVer version. */
  version: string;
  /** Human-readable description. */
  description?: string;
  /** Author name or email. */
  author?: string;
  /** Plugin homepage URL. */
  homepage?: string;
  /** License identifier (e.g. "MIT"). */
  license?: string;
  /** Entry point relative to plugin directory. Default: "index.js" */
  main?: string;
  /** Tools this plugin provides. */
  tools?: string[];
  /** Capabilities this plugin requests. */
  capabilities?: PluginCapability[];
  /** Plugin-specific configuration. */
  config?: Record<string, unknown>;
  /** Minimum Jeriko version required. */
  minJerikoVersion?: string;
}

/** Capabilities a plugin can request. */
export type PluginCapability =
  | "fs:read"
  | "fs:write"
  | "net:http"
  | "net:websocket"
  | "exec:shell"
  | "storage:kv"
  | "storage:db";

/** Trust record for a plugin. */
interface TrustRecord {
  name: string;
  trustedAt: string;
  trustedVersion?: string;
  capabilities: PluginCapability[];
}

/** The trust store file shape. */
interface TrustStore {
  version: 1;
  plugins: Record<string, TrustRecord>;
}

// ---------------------------------------------------------------------------
// Plugin Registry
// ---------------------------------------------------------------------------

export class PluginRegistry {
  private manifests = new Map<string, PluginManifest>();
  private trustStore: TrustStore;
  private trustStorePath: string;

  constructor() {
    this.trustStorePath = path.join(getDataDir(), "plugin-trust.json");
    this.trustStore = this.loadTrustStore();
  }

  // -----------------------------------------------------------------------
  // Manifest management
  // -----------------------------------------------------------------------

  /** Register a plugin manifest. */
  register(manifest: PluginManifest): void {
    this.manifests.set(manifest.name, manifest);
  }

  /** Unregister a plugin. */
  unregister(name: string): boolean {
    return this.manifests.delete(name);
  }

  /** Get a plugin manifest by name. */
  get(name: string): PluginManifest | undefined {
    return this.manifests.get(name);
  }

  /** List all registered plugin manifests. */
  list(): PluginManifest[] {
    return [...this.manifests.values()];
  }

  // -----------------------------------------------------------------------
  // Trust management
  // -----------------------------------------------------------------------

  /** Check if a plugin is trusted. */
  isTrusted(name: string): boolean {
    return name in this.trustStore.plugins;
  }

  /** Trust a plugin, granting its requested capabilities. */
  trust(name: string, capabilities: PluginCapability[] = [], version?: string): void {
    this.trustStore.plugins[name] = {
      name,
      trustedAt: new Date().toISOString(),
      trustedVersion: version,
      capabilities,
    };
    this.saveTrustStore();
    log.info(`Plugin trusted: ${name}`, { capabilities });
  }

  /** Revoke trust for a plugin. */
  untrust(name: string): boolean {
    if (!(name in this.trustStore.plugins)) return false;
    delete this.trustStore.plugins[name];
    this.saveTrustStore();
    log.info(`Plugin trust revoked: ${name}`);
    return true;
  }

  /** Get the trust record for a plugin. */
  getTrustRecord(name: string): TrustRecord | undefined {
    return this.trustStore.plugins[name];
  }

  /** List all trusted plugins. */
  listTrusted(): TrustRecord[] {
    return Object.values(this.trustStore.plugins);
  }

  /** Check if a plugin has a specific capability granted. */
  hasCapability(name: string, capability: PluginCapability): boolean {
    const record = this.trustStore.plugins[name];
    if (!record) return false;
    return record.capabilities.includes(capability);
  }

  // -----------------------------------------------------------------------
  // Persistence
  // -----------------------------------------------------------------------

  private loadTrustStore(): TrustStore {
    try {
      if (fs.existsSync(this.trustStorePath)) {
        const raw = fs.readFileSync(this.trustStorePath, "utf-8");
        const parsed = JSON.parse(raw) as TrustStore;
        if (parsed.version === 1 && parsed.plugins) {
          return parsed;
        }
      }
    } catch {
      log.warn("Could not load plugin trust store, starting fresh");
    }

    return { version: 1, plugins: {} };
  }

  private saveTrustStore(): void {
    try {
      const dir = path.dirname(this.trustStorePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(
        this.trustStorePath,
        JSON.stringify(this.trustStore, null, 2),
        "utf-8",
      );
    } catch (err) {
      log.error(`Failed to save trust store: ${err}`);
    }
  }
}
