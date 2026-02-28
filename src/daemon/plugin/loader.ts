// Daemon — Plugin discovery + loading.
// Finds plugins in known directories and loads their manifests.

import * as fs from "node:fs";
import * as path from "node:path";
import { getLogger } from "../../shared/logger.js";
import { getConfigDir, getDataDir } from "../../shared/config.js";
import { PluginRegistry, type PluginManifest } from "./registry.js";
import { createPluginSandbox, type PluginSandbox } from "./sandbox.js";
import { registerTool as reg } from "../agent/tools/registry.js";

const log = getLogger();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A loaded plugin instance. */
export interface LoadedPlugin {
  manifest: PluginManifest;
  sandbox: PluginSandbox;
  module: PluginModule | null;
}

/** The interface a plugin module must export. */
export interface PluginModule {
  /** Called when the plugin is loaded. */
  activate?(ctx: PluginContext): Promise<void> | void;
  /** Called when the plugin is unloaded. */
  deactivate?(): Promise<void> | void;
}

/** Context provided to plugins during activation. */
export interface PluginContext {
  /** The plugin's manifest. */
  manifest: PluginManifest;
  /** Register a tool that the agent can use. */
  registerTool(tool: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    execute: (args: Record<string, unknown>) => Promise<string>;
  }): void;
  /** Get a configuration value. */
  getConfig(key: string): unknown;
  /** Log a message. */
  log: {
    debug(msg: string): void;
    info(msg: string): void;
    warn(msg: string): void;
    error(msg: string): void;
  };
}

// ---------------------------------------------------------------------------
// Plugin directories
// ---------------------------------------------------------------------------

/**
 * Known plugin search directories (in priority order):
 *  1. Project-local: ./jeriko-plugins/
 *  2. User config:   ~/.config/jeriko/plugins/
 *  3. User data:     ~/.local/share/jeriko/plugins/
 */
function getPluginDirs(): string[] {
  return [
    path.resolve("jeriko-plugins"),
    path.join(getConfigDir(), "plugins"),
    path.join(getDataDir(), "plugins"),
  ];
}

// ---------------------------------------------------------------------------
// Plugin Loader
// ---------------------------------------------------------------------------

export class PluginLoader {
  private loaded = new Map<string, LoadedPlugin>();
  private registry = new PluginRegistry();

  /**
   * Discover and load all plugins from known directories.
   */
  async loadAll(): Promise<void> {
    const dirs = getPluginDirs();

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) continue;

      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const pluginDir = path.join(dir, entry.name);
        const manifestPath = path.join(pluginDir, "jeriko-plugin.json");

        if (!fs.existsSync(manifestPath)) {
          log.debug(`Skipping ${entry.name}: no jeriko-plugin.json`);
          continue;
        }

        try {
          await this.loadPlugin(pluginDir, manifestPath);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          log.error(`Failed to load plugin from ${pluginDir}: ${msg}`);
        }
      }
    }

    log.info(`Plugin loader: ${this.loaded.size} plugin(s) loaded`);
  }

  /**
   * Load a single plugin from a directory.
   */
  async loadPlugin(pluginDir: string, manifestPath: string): Promise<void> {
    // Read and validate manifest
    const raw = fs.readFileSync(manifestPath, "utf-8");
    const manifest = JSON.parse(raw) as PluginManifest;

    if (!manifest.name || !manifest.version) {
      throw new Error(`Invalid manifest: missing name or version`);
    }

    if (this.loaded.has(manifest.name)) {
      log.warn(`Plugin "${manifest.name}" already loaded, skipping duplicate`);
      return;
    }

    // Check trust
    if (!this.registry.isTrusted(manifest.name)) {
      log.warn(`Plugin "${manifest.name}" is not trusted, skipping. Run \`jeriko trust ${manifest.name}\``);
      return;
    }

    // Create sandbox
    const sandbox = createPluginSandbox(manifest);

    // Try to load the plugin module
    let module: PluginModule | null = null;
    const entryPoint = manifest.main ?? "index.js";
    const entryPath = path.join(pluginDir, entryPoint);

    if (fs.existsSync(entryPath)) {
      try {
        module = await import(entryPath);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error(`Failed to import plugin "${manifest.name}": ${msg}`);
      }
    }

    const plugin: LoadedPlugin = { manifest, sandbox, module };
    this.loaded.set(manifest.name, plugin);

    // Activate if the module has an activate function
    if (module?.activate) {
      const ctx = this.createContext(manifest);
      try {
        await module.activate(ctx);
        log.info(`Plugin activated: ${manifest.name}@${manifest.version}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error(`Plugin "${manifest.name}" activation failed: ${msg}`);
      }
    } else {
      log.info(`Plugin loaded: ${manifest.name}@${manifest.version}`);
    }

    this.registry.register(manifest);
  }

  /**
   * Unload a plugin by name.
   */
  async unload(name: string): Promise<boolean> {
    const plugin = this.loaded.get(name);
    if (!plugin) return false;

    if (plugin.module?.deactivate) {
      try {
        await plugin.module.deactivate();
      } catch (err) {
        log.warn(`Plugin "${name}" deactivation error: ${err}`);
      }
    }

    this.loaded.delete(name);
    log.info(`Plugin unloaded: ${name}`);
    return true;
  }

  /**
   * Unload all plugins.
   */
  async unloadAll(): Promise<void> {
    for (const name of [...this.loaded.keys()]) {
      await this.unload(name);
    }
  }

  /**
   * Get a loaded plugin by name.
   */
  get(name: string): LoadedPlugin | undefined {
    return this.loaded.get(name);
  }

  /**
   * List all loaded plugins.
   */
  list(): LoadedPlugin[] {
    return [...this.loaded.values()];
  }

  /**
   * Get the plugin registry.
   */
  getRegistry(): PluginRegistry {
    return this.registry;
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private createContext(manifest: PluginManifest): PluginContext {
    const prefix = `[plugin:${manifest.name}]`;
    return {
      manifest,
      registerTool(tool) {
        reg({
          ...tool,
          id: `plugin:${manifest.name}:${tool.name}`,
          parameters: tool.parameters as import("../agent/tools/registry.js").JSONSchema,
        });
      },
      getConfig(key: string) {
        return manifest.config?.[key];
      },
      log: {
        debug: (msg) => log.debug(`${prefix} ${msg}`),
        info: (msg) => log.info(`${prefix} ${msg}`),
        warn: (msg) => log.warn(`${prefix} ${msg}`),
        error: (msg) => log.error(`${prefix} ${msg}`),
      },
    };
  }
}
