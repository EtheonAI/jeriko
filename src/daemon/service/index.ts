// Daemon — ServiceProvider interface + platform detection.
// Cross-platform OS service management for the Jeriko daemon.

import { getLogger } from "../../shared/logger.js";
import { getDataDir } from "../../shared/config.js";
import type { Platform } from "../../shared/types.js";
import * as path from "node:path";
import * as os from "node:os";

const log = getLogger();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Service status. */
export type ServiceStatus = "running" | "stopped" | "error" | "unknown";

/** Result of a service operation. */
export interface ServiceResult {
  ok: boolean;
  status: ServiceStatus;
  message: string;
  pid?: number;
}

/** Configuration for the service. */
export interface ServiceConfig {
  /** Path to the jeriko binary. */
  binaryPath: string;
  /** Port for the HTTP server. */
  port: number;
  /** Path to the environment file. */
  envFilePath: string;
  /** Service label / identifier. */
  label: string;
  /** Working directory. */
  workDir: string;
  /** Log file path. */
  logPath: string;
}

/**
 * The contract every platform service provider must satisfy.
 *
 * Each platform (macOS launchd, Linux systemd, Windows Task Scheduler)
 * implements this interface to manage the daemon as an OS-level service.
 */
export interface ServiceProvider {
  /** Platform identifier. */
  readonly platform: Platform;

  /** Install the daemon as a system service. */
  install(config: ServiceConfig): Promise<ServiceResult>;

  /** Uninstall the daemon service. */
  uninstall(): Promise<ServiceResult>;

  /** Start the daemon service. */
  start(): Promise<ServiceResult>;

  /** Stop the daemon service. */
  stop(): Promise<ServiceResult>;

  /** Restart the daemon service. */
  restart(): Promise<ServiceResult>;

  /** Get the current status of the daemon service. */
  status(): Promise<ServiceResult>;

  /** Get the path to the service log file. */
  logPath(): string;

  /** Check if the service is installed. */
  isInstalled(): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Platform detection and provider factory
// ---------------------------------------------------------------------------

/**
 * Detect the current platform and return the appropriate ServiceProvider.
 */
export async function getServiceProvider(): Promise<ServiceProvider> {
  const platform = process.platform as string;

  switch (platform) {
    case "darwin": {
      const { DarwinServiceProvider } = await import("./platform/darwin.js");
      return new DarwinServiceProvider();
    }

    case "linux": {
      const { LinuxServiceProvider } = await import("./platform/linux.js");
      return new LinuxServiceProvider();
    }

    case "win32": {
      const { Win32ServiceProvider } = await import("./platform/win32.js");
      return new Win32ServiceProvider();
    }

    default:
      throw new Error(
        `Unsupported platform for service management: "${platform}". ` +
        `Supported: darwin (macOS), linux, win32 (Windows).`,
      );
  }
}

/**
 * Build a default ServiceConfig from standard paths.
 */
export function getDefaultServiceConfig(): ServiceConfig {
  const dataDir = getDataDir();

  return {
    binaryPath: process.argv[0] ?? "jeriko",
    port: Number(process.env.JERIKO_PORT) || 3000,
    envFilePath: path.join(dataDir, "daemon.env"),
    label: "ai.jeriko.daemon",
    workDir: os.homedir(),
    logPath: path.join(dataDir, "daemon.log"),
  };
}
