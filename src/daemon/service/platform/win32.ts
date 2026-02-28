// Daemon — Windows Task Scheduler service provider.
// Manages the Jeriko daemon as a Windows scheduled task with a logon trigger.

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

const TASK_NAME = "JerikoDaemon";
const DATA_DIR = path.join(
  process.env.LOCALAPPDATA ?? path.join(homedir(), "AppData", "Local"),
  "jeriko",
);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class Win32ServiceProvider implements ServiceProvider {
  readonly platform = "win32" as const;

  async install(config: ServiceConfig): Promise<ServiceResult> {
    // Ensure data directory exists
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    // Build a batch wrapper script
    const wrapperPath = path.join(DATA_DIR, "daemon-wrapper.bat");
    const envFile = config.envFilePath.replace(/\//g, "\\");
    const batchContent = [
      "@echo off",
      `REM Jeriko daemon wrapper — auto-generated`,
      `if exist "${envFile}" (`,
      `  for /f "tokens=1,* delims==" %%a in ('type "${envFile}"') do (`,
      `    set "%%a=%%b"`,
      `  )`,
      `)`,
      `"${config.binaryPath}" serve --port ${config.port}`,
      "",
    ].join("\r\n");

    fs.writeFileSync(wrapperPath, batchContent, "utf-8");

    // Create scheduled task with logon trigger
    try {
      // Delete existing task if present
      try {
        execSync(`schtasks /delete /tn "${TASK_NAME}" /f`, { stdio: "pipe" });
      } catch { /* ignore if not exists */ }

      const xmlPath = path.join(DATA_DIR, "task.xml");
      const xml = buildTaskXml({
        name: TASK_NAME,
        command: wrapperPath,
        workDir: config.workDir,
        logPath: config.logPath,
      });

      fs.writeFileSync(xmlPath, xml, "utf-8");
      execSync(`schtasks /create /tn "${TASK_NAME}" /xml "${xmlPath}"`, { stdio: "pipe" });

      log.info(`Windows service installed: ${TASK_NAME}`);
      return { ok: true, status: "stopped", message: `Task "${TASK_NAME}" created` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, status: "error", message: `Failed to install: ${msg}` };
    }
  }

  async uninstall(): Promise<ServiceResult> {
    try { await this.stop(); } catch { /* ignore */ }

    try {
      execSync(`schtasks /delete /tn "${TASK_NAME}" /f`, { stdio: "pipe" });
      log.info("Windows service uninstalled");
      return { ok: true, status: "stopped", message: "Task removed" };
    } catch {
      return { ok: true, status: "stopped", message: "Task was not installed" };
    }
  }

  async start(): Promise<ServiceResult> {
    if (!(await this.isInstalled())) {
      return { ok: false, status: "error", message: "Service not installed. Run `jeriko service install` first." };
    }

    try {
      execSync(`schtasks /run /tn "${TASK_NAME}"`, { stdio: "pipe" });
      log.info("Windows service started");
      return { ok: true, status: "running", message: "Task started" };
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
      execSync(`schtasks /end /tn "${TASK_NAME}"`, { stdio: "pipe" });
      log.info("Windows service stopped");
      return { ok: true, status: "stopped", message: "Task stopped" };
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
      return { ok: true, status: "stopped", message: "Task not installed" };
    }

    try {
      const output = execSync(
        `schtasks /query /tn "${TASK_NAME}" /fo csv /nh`,
        { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
      ).trim();

      if (output.includes("Running")) {
        return { ok: true, status: "running", message: "Task is running" };
      }

      return { ok: true, status: "stopped", message: "Task is not running" };
    } catch {
      return { ok: true, status: "unknown", message: "Could not query task status" };
    }
  }

  logPath(): string {
    return path.join(DATA_DIR, "daemon.log");
  }

  async isInstalled(): Promise<boolean> {
    try {
      execSync(`schtasks /query /tn "${TASK_NAME}"`, { stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// Task XML builder
// ---------------------------------------------------------------------------

function buildTaskXml(opts: {
  name: string;
  command: string;
  workDir: string;
  logPath: string;
}): string {
  // Windows Task Scheduler XML schema
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Jeriko AI Agent Daemon</Description>
    <Author>Jeriko</Author>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <RestartOnFailure>
      <Interval>PT1M</Interval>
      <Count>3</Count>
    </RestartOnFailure>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${opts.command.replace(/&/g, "&amp;")}</Command>
      <WorkingDirectory>${opts.workDir.replace(/&/g, "&amp;")}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>`;
}
