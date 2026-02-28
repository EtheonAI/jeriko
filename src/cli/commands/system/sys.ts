import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool } from "../../../shared/args.js";
import { ok } from "../../../shared/output.js";
import { cpus, totalmem, freemem, hostname, platform, arch, uptime, networkInterfaces } from "node:os";
import { execSync } from "node:child_process";

export const command: CommandHandler = {
  name: "sys",
  description: "System info (CPU, RAM, disk, battery, network)",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko sys [--cpu] [--ram] [--disk] [--network] [--battery] [--all]");
      console.log("\nShow system information. With no flags, shows a summary.");
      process.exit(0);
    }

    const showAll = flagBool(parsed, "all") || Object.keys(parsed.flags).length === 0;
    const data: Record<string, unknown> = {};

    if (showAll || flagBool(parsed, "cpu")) {
      const cpuInfo = cpus();
      data.cpu = {
        model: cpuInfo[0]?.model ?? "unknown",
        cores: cpuInfo.length,
        arch: arch(),
      };
    }

    if (showAll || flagBool(parsed, "ram")) {
      data.ram = {
        total_mb: Math.round(totalmem() / 1024 / 1024),
        free_mb: Math.round(freemem() / 1024 / 1024),
        used_pct: Math.round((1 - freemem() / totalmem()) * 100),
      };
    }

    if (showAll || flagBool(parsed, "disk")) {
      data.disk = getDiskInfo();
    }

    if (showAll || flagBool(parsed, "network")) {
      const ifaces = networkInterfaces();
      const nets: Record<string, string[]> = {};
      for (const [name, addrs] of Object.entries(ifaces)) {
        if (addrs) {
          nets[name] = addrs.filter((a) => !a.internal).map((a) => a.address);
        }
      }
      data.network = nets;
    }

    if (showAll || flagBool(parsed, "battery")) {
      data.battery = getBatteryInfo();
    }

    data.hostname = hostname();
    data.platform = platform();
    data.uptime_s = Math.round(uptime());

    ok(data);
  },
};

/** Get disk usage info using df. */
function getDiskInfo(): Record<string, unknown> {
  try {
    const output = execSync("df -h / 2>/dev/null", { encoding: "utf-8", timeout: 5000 });
    const lines = output.trim().split("\n");
    if (lines.length < 2) return { available: "unknown" };
    // Parse the second line: Filesystem Size Used Avail Capacity Mounted
    const parts = lines[1]!.split(/\s+/);
    return {
      total: parts[1] ?? "unknown",
      used: parts[2] ?? "unknown",
      available: parts[3] ?? "unknown",
      used_pct: parts[4] ?? "unknown",
      mount: parts[5] ?? "/",
    };
  } catch {
    return { available: "unknown" };
  }
}

/** Get battery info (macOS only). */
function getBatteryInfo(): Record<string, unknown> {
  if (platform() !== "darwin") return { supported: false };
  try {
    const output = execSync("pmset -g batt 2>/dev/null", { encoding: "utf-8", timeout: 5000 });
    const pctMatch = output.match(/(\d+)%/);
    const charging = output.includes("AC Power") || output.includes("charging");
    return {
      percent: pctMatch ? parseInt(pctMatch[1]!, 10) : null,
      charging,
    };
  } catch {
    return { supported: false };
  }
}
