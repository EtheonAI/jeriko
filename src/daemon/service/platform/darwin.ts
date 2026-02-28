// Daemon — macOS launchd service provider.
// Manages the Jeriko daemon as a launchd user agent via plist.

import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { homedir } from "node:os";
import { getLogger } from "../../../shared/logger.js";
import type { ServiceProvider, ServiceConfig, ServiceResult, ServiceStatus } from "../index.js";

const log = getLogger();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLIST_LABEL = "ai.jeriko.daemon";
const LAUNCH_AGENTS_DIR = path.join(homedir(), "Library", "LaunchAgents");
const PLIST_PATH = path.join(LAUNCH_AGENTS_DIR, `${PLIST_LABEL}.plist`);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class DarwinServiceProvider implements ServiceProvider {
  readonly platform = "darwin" as const;

  async install(config: ServiceConfig): Promise<ServiceResult> {
    // Ensure LaunchAgents directory exists
    if (!fs.existsSync(LAUNCH_AGENTS_DIR)) {
      fs.mkdirSync(LAUNCH_AGENTS_DIR, { recursive: true });
    }

    // Build wrapper script that sources daemon.env
    const wrapperPath = path.join(path.dirname(config.envFilePath), "daemon-wrapper.sh");
    const wrapperContent = [
      "#!/bin/sh",
      `# Jeriko daemon wrapper — auto-generated`,
      `[ -f "${config.envFilePath}" ] && . "${config.envFilePath}"`,
      `exec "${config.binaryPath}" serve --port ${config.port}`,
      "",
    ].join("\n");

    fs.writeFileSync(wrapperPath, wrapperContent, "utf-8");
    fs.chmodSync(wrapperPath, 0o755);

    // Build plist
    const plist = buildPlist({
      label: config.label,
      program: wrapperPath,
      workDir: config.workDir,
      logPath: config.logPath,
    });

    fs.writeFileSync(PLIST_PATH, plist, "utf-8");

    log.info(`macOS service installed: ${PLIST_PATH}`);
    return { ok: true, status: "stopped", message: `Service installed at ${PLIST_PATH}` };
  }

  async uninstall(): Promise<ServiceResult> {
    // Stop first if running
    try { await this.stop(); } catch { /* ignore */ }

    if (fs.existsSync(PLIST_PATH)) {
      fs.unlinkSync(PLIST_PATH);
      log.info("macOS service uninstalled");
      return { ok: true, status: "stopped", message: "Service uninstalled" };
    }

    return { ok: true, status: "stopped", message: "Service was not installed" };
  }

  async start(): Promise<ServiceResult> {
    if (!(await this.isInstalled())) {
      return { ok: false, status: "error", message: "Service not installed. Run `jeriko service install` first." };
    }

    try {
      execSync(`launchctl load -w "${PLIST_PATH}"`, { stdio: "pipe" });
      log.info("macOS service started");
      return { ok: true, status: "running", message: "Service started" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, status: "error", message: `Failed to start: ${msg}` };
    }
  }

  async stop(): Promise<ServiceResult> {
    if (!(await this.isInstalled())) {
      return { ok: false, status: "error", message: "Service not installed" };
    }

    try {
      execSync(`launchctl unload "${PLIST_PATH}"`, { stdio: "pipe" });
      log.info("macOS service stopped");
      return { ok: true, status: "stopped", message: "Service stopped" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, status: "error", message: `Failed to stop: ${msg}` };
    }
  }

  async restart(): Promise<ServiceResult> {
    await this.stop();
    return this.start();
  }

  async status(): Promise<ServiceResult> {
    if (!(await this.isInstalled())) {
      return { ok: true, status: "stopped", message: "Service not installed" };
    }

    try {
      const output = execSync(`launchctl list "${PLIST_LABEL}" 2>&1`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });

      // Parse PID from output
      const pidMatch = output.match(/"PID"\s*=\s*(\d+)/);
      const pid = pidMatch?.[1] ? parseInt(pidMatch[1], 10) : undefined;

      if (pid) {
        return { ok: true, status: "running", message: `Running (PID: ${pid})`, pid };
      }

      return { ok: true, status: "stopped", message: "Installed but not running" };
    } catch {
      return { ok: true, status: "stopped", message: "Service not loaded" };
    }
  }

  logPath(): string {
    return path.join(homedir(), ".local", "share", "jeriko", "daemon.log");
  }

  async isInstalled(): Promise<boolean> {
    return fs.existsSync(PLIST_PATH);
  }
}

// ---------------------------------------------------------------------------
// Plist builder
// ---------------------------------------------------------------------------

function buildPlist(opts: {
  label: string;
  program: string;
  workDir: string;
  logPath: string;
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${opts.label}</string>

    <key>Program</key>
    <string>${opts.program}</string>

    <key>WorkingDirectory</key>
    <string>${opts.workDir}</string>

    <key>RunAtLoad</key>
    <false/>

    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>

    <key>StandardOutPath</key>
    <string>${opts.logPath}</string>

    <key>StandardErrorPath</key>
    <string>${opts.logPath}</string>

    <key>ProcessType</key>
    <string>Background</string>

    <key>ThrottleInterval</key>
    <integer>10</integer>
</dict>
</plist>`;
}
