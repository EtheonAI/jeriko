// Daemon — Linux systemd service provider.
// Manages the Jeriko daemon as a systemd user service.

import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { homedir } from "node:os";
import { getLogger } from "../../../shared/logger.js";
import type { ServiceProvider, ServiceConfig, ServiceResult } from "../index.js";

const log = getLogger();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SERVICE_NAME = "jeriko";
const SYSTEMD_USER_DIR = path.join(
  process.env.XDG_CONFIG_HOME ?? path.join(homedir(), ".config"),
  "systemd",
  "user",
);
const UNIT_PATH = path.join(SYSTEMD_USER_DIR, `${SERVICE_NAME}.service`);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class LinuxServiceProvider implements ServiceProvider {
  readonly platform = "linux" as const;

  async install(config: ServiceConfig): Promise<ServiceResult> {
    if (!fs.existsSync(SYSTEMD_USER_DIR)) {
      fs.mkdirSync(SYSTEMD_USER_DIR, { recursive: true });
    }

    // Build wrapper script
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

    // Build systemd unit file
    const unit = buildUnit({
      description: "Jeriko AI Agent Daemon",
      execStart: wrapperPath,
      workDir: config.workDir,
      envFile: config.envFilePath,
    });

    fs.writeFileSync(UNIT_PATH, unit, "utf-8");

    // Reload systemd
    try {
      execSync("systemctl --user daemon-reload", { stdio: "pipe" });
    } catch {
      // May fail if systemd is not available (e.g. in containers)
    }

    log.info(`Linux service installed: ${UNIT_PATH}`);
    return { ok: true, status: "stopped", message: `Service installed at ${UNIT_PATH}` };
  }

  async uninstall(): Promise<ServiceResult> {
    try { await this.stop(); } catch { /* ignore */ }

    try {
      execSync(`systemctl --user disable ${SERVICE_NAME}`, { stdio: "pipe" });
    } catch { /* ignore if not enabled */ }

    if (fs.existsSync(UNIT_PATH)) {
      fs.unlinkSync(UNIT_PATH);
      try { execSync("systemctl --user daemon-reload", { stdio: "pipe" }); } catch { /* ignore */ }
      log.info("Linux service uninstalled");
      return { ok: true, status: "stopped", message: "Service uninstalled" };
    }

    return { ok: true, status: "stopped", message: "Service was not installed" };
  }

  async start(): Promise<ServiceResult> {
    if (!(await this.isInstalled())) {
      return { ok: false, status: "error", message: "Service not installed. Run `jeriko service install` first." };
    }

    try {
      execSync(`systemctl --user start ${SERVICE_NAME}`, { stdio: "pipe" });
      log.info("Linux service started");
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
      execSync(`systemctl --user stop ${SERVICE_NAME}`, { stdio: "pipe" });
      log.info("Linux service stopped");
      return { ok: true, status: "stopped", message: "Service stopped" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, status: "error", message: `Failed to stop: ${msg}` };
    }
  }

  async restart(): Promise<ServiceResult> {
    try {
      execSync(`systemctl --user restart ${SERVICE_NAME}`, { stdio: "pipe" });
      log.info("Linux service restarted");
      return { ok: true, status: "running", message: "Service restarted" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, status: "error", message: `Failed to restart: ${msg}` };
    }
  }

  async status(): Promise<ServiceResult> {
    if (!(await this.isInstalled())) {
      return { ok: true, status: "stopped", message: "Service not installed" };
    }

    try {
      const output = execSync(
        `systemctl --user is-active ${SERVICE_NAME} 2>&1`,
        { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
      ).trim();

      if (output === "active") {
        // Get PID
        const pidOutput = execSync(
          `systemctl --user show -p MainPID ${SERVICE_NAME}`,
          { encoding: "utf-8", stdio: "pipe" },
        ).trim();

        const pidMatch = pidOutput.match(/MainPID=(\d+)/);
        const pid = pidMatch?.[1] ? parseInt(pidMatch[1], 10) : undefined;

        return { ok: true, status: "running", message: `Running (PID: ${pid ?? "unknown"})`, pid };
      }

      return { ok: true, status: "stopped", message: `Service is ${output}` };
    } catch {
      return { ok: true, status: "stopped", message: "Service not active" };
    }
  }

  logPath(): string {
    return path.join(homedir(), ".local", "share", "jeriko", "daemon.log");
  }

  async isInstalled(): Promise<boolean> {
    return fs.existsSync(UNIT_PATH);
  }
}

// ---------------------------------------------------------------------------
// Unit file builder
// ---------------------------------------------------------------------------

function buildUnit(opts: {
  description: string;
  execStart: string;
  workDir: string;
  envFile: string;
}): string {
  return `[Unit]
Description=${opts.description}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${opts.execStart}
WorkingDirectory=${opts.workDir}
EnvironmentFile=-${opts.envFile}
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=jeriko

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=%h/.local/share/jeriko %h/.config/jeriko

[Install]
WantedBy=default.target
`;
}
