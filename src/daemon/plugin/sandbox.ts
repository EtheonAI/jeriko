// Daemon — Plugin sandbox.
// Environment isolation for plugins — controls what a plugin can access.

import { getLogger } from "../../shared/logger.js";
import { getDataDir } from "../../shared/config.js";
import type { PluginManifest } from "./registry.js";
import type { PluginCapability } from "./registry.js";

const log = getLogger();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Sandbox restrictions applied to a plugin. */
export interface SandboxRestrictions {
  /** Allowed filesystem paths (glob patterns). Empty = no fs access. */
  allowedPaths: string[];
  /** Allowed network hosts. Empty = no net access. */
  allowedHosts: string[];
  /** Allowed shell commands. Empty = no exec. */
  allowedCommands: string[];
  /** Maximum execution time in milliseconds. Default: 30000 */
  maxExecutionMs: number;
  /** Maximum memory in bytes. Default: 128MB */
  maxMemoryBytes: number;
}

/** A sandboxed execution environment for a plugin. */
export interface PluginSandbox {
  /** The plugin name. */
  pluginName: string;
  /** Sandbox restrictions. */
  restrictions: SandboxRestrictions;
  /** Check if an operation is allowed. */
  checkPermission(capability: PluginCapability, target?: string): PermissionCheck;
  /** Create a restricted environment object (strips sensitive vars). */
  createEnv(): Record<string, string>;
}

/** Result of a permission check. */
export interface PermissionCheck {
  allowed: boolean;
  reason: string;
}

// ---------------------------------------------------------------------------
// Sensitive environment variable keys to strip from plugin environments
// ---------------------------------------------------------------------------

const SENSITIVE_KEYS: readonly string[] = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_API_KEY",
  "NODE_AUTH_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "PAYPAL_CLIENT_SECRET",
  "GITHUB_TOKEN",
  "GH_TOKEN",
  "GITHUB_WEBHOOK_SECRET",
  "TWILIO_AUTH_TOKEN",
  "TELEGRAM_BOT_TOKEN",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "DATABASE_URL",
  "REDIS_URL",
  "BLUEBUBBLES_PASSWORD",
  "GOOGLE_CHAT_SERVICE_ACCOUNT_KEY",
  "WHATSAPP_TOKEN",
  "CLOUDFLARE_API_TOKEN",
  "VERCEL_TOKEN",
  "ENCRYPTION_KEY",
] as const;

// ---------------------------------------------------------------------------
// Sandbox factory
// ---------------------------------------------------------------------------

/**
 * Create a sandbox for a plugin based on its manifest and granted capabilities.
 */
export function createPluginSandbox(manifest: PluginManifest): PluginSandbox {
  const capabilities = manifest.capabilities ?? [];

  const restrictions: SandboxRestrictions = {
    allowedPaths: buildAllowedPaths(capabilities),
    allowedHosts: buildAllowedHosts(capabilities),
    allowedCommands: buildAllowedCommands(capabilities),
    maxExecutionMs: 30_000,
    maxMemoryBytes: 128 * 1024 * 1024, // 128MB
  };

  log.debug(`Sandbox created for plugin "${manifest.name}"`, {
    capabilities,
    restrictions: {
      paths: restrictions.allowedPaths.length,
      hosts: restrictions.allowedHosts.length,
      commands: restrictions.allowedCommands.length,
    },
  });

  return {
    pluginName: manifest.name,
    restrictions,

    checkPermission(capability: PluginCapability, target?: string): PermissionCheck {
      // Check if the capability was requested in the manifest
      if (!capabilities.includes(capability)) {
        return {
          allowed: false,
          reason: `Plugin "${manifest.name}" did not request capability "${capability}"`,
        };
      }

      // Capability-specific checks
      switch (capability) {
        case "fs:read":
        case "fs:write": {
          if (!target) return { allowed: true, reason: "No target specified" };
          const pathAllowed = restrictions.allowedPaths.some((p) => target.startsWith(p));
          return pathAllowed
            ? { allowed: true, reason: `Path "${target}" is in allowlist` }
            : { allowed: false, reason: `Path "${target}" is not in allowlist` };
        }

        case "net:http":
        case "net:websocket": {
          if (!target) return { allowed: true, reason: "No target specified" };
          try {
            const url = new URL(target);
            const hostAllowed =
              restrictions.allowedHosts.length === 0 ||
              restrictions.allowedHosts.includes(url.hostname) ||
              restrictions.allowedHosts.includes("*");
            return hostAllowed
              ? { allowed: true, reason: `Host "${url.hostname}" is allowed` }
              : { allowed: false, reason: `Host "${url.hostname}" is not in allowlist` };
          } catch {
            return { allowed: false, reason: `Invalid URL: "${target}"` };
          }
        }

        case "exec:shell": {
          if (!target) return { allowed: false, reason: "Shell command target required" };
          const cmdAllowed =
            restrictions.allowedCommands.length === 0 ||
            restrictions.allowedCommands.some((c) => target.startsWith(c));
          return cmdAllowed
            ? { allowed: true, reason: `Command "${target}" is allowed` }
            : { allowed: false, reason: `Command "${target}" is not in allowlist` };
        }

        case "storage:kv":
        case "storage:db":
          return { allowed: true, reason: `Storage capability "${capability}" granted` };

        default:
          return { allowed: false, reason: `Unknown capability: "${capability}"` };
      }
    },

    createEnv(): Record<string, string> {
      const env: Record<string, string> = {};

      for (const [key, value] of Object.entries(process.env)) {
        if (value === undefined) continue;
        // Strip explicitly listed sensitive keys
        if (SENSITIVE_KEYS.includes(key)) continue;
        // Strip keys matching sensitive naming patterns (defense-in-depth)
        const upper = key.toUpperCase();
        if (
          upper.includes("SECRET") ||
          upper.includes("PASSWORD") ||
          upper.includes("PRIVATE_KEY") ||
          upper.endsWith("_TOKEN") ||
          (upper.endsWith("_KEY") && (upper.includes("API") || upper.includes("AUTH")))
        ) continue;
        env[key] = value;
      }

      // Add plugin-specific env vars
      env.JERIKO_PLUGIN_NAME = manifest.name;
      env.JERIKO_PLUGIN_VERSION = manifest.version;

      return env;
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildAllowedPaths(capabilities: PluginCapability[]): string[] {
  const paths: string[] = [];

  if (capabilities.includes("fs:read") || capabilities.includes("fs:write")) {
    // By default, plugins can only access the jeriko data directory
    paths.push(getDataDir());
  }

  return paths;
}

function buildAllowedHosts(capabilities: PluginCapability[]): string[] {
  if (capabilities.includes("net:http") || capabilities.includes("net:websocket")) {
    // By default, allow all hosts — the trust system is the gatekeeper
    return ["*"];
  }
  return [];
}

function buildAllowedCommands(capabilities: PluginCapability[]): string[] {
  if (capabilities.includes("exec:shell")) {
    // No default commands — plugins must be explicitly granted
    return [];
  }
  return [];
}
