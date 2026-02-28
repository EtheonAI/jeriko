// Tool — Shell execution via the exec gateway.

import { registerTool } from "./registry.js";
import { createLease, validateLease } from "../../exec/lease.js";
import { auditAllow, auditDeny } from "../../exec/audit.js";
import type { ToolDefinition } from "./registry.js";
import { spawn } from "node:child_process";

async function execute(args: Record<string, unknown>): Promise<string> {
  const command = args.command as string;
  const timeout = (args.timeout as number) ?? 30_000;
  const cwd = (args.cwd as string) ?? process.cwd();

  if (!command) return JSON.stringify({ ok: false, error: "command is required" });

  const lease = createLease("agent:daemon", command, { timeout });
  const decision = validateLease(lease);

  if (!decision.allowed) {
    auditDeny(lease, decision.lease_id, decision.reason);
    return JSON.stringify({ ok: false, error: decision.reason });
  }

  auditAllow(lease, decision.lease_id);

  return new Promise<string>((resolve) => {
    const proc = spawn("bash", ["-c", command], {
      cwd,
      timeout,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on("close", (code) => {
      const output = stdout + (stderr ? `\n[stderr]\n${stderr}` : "");
      resolve(output.slice(0, 100_000) || `(exit code ${code ?? 0})`);
    });

    proc.on("error", (err) => {
      resolve(JSON.stringify({ ok: false, error: err.message }));
    });
  });
}

export const bashTool: ToolDefinition = {
  id: "bash",
  name: "bash",
  description: "Execute a shell command via bash. Returns stdout/stderr.",
  parameters: {
    type: "object",
    properties: {
      command: { type: "string", description: "The shell command to execute" },
      timeout: { type: "number", description: "Timeout in milliseconds (default: 30000)" },
      cwd: { type: "string", description: "Working directory (default: process cwd)" },
    },
    required: ["command"],
  },
  execute,
  // AGENT.md references "exec: <command>" as a CLI command. OSS models
  // confuse CLI command names with tool names and call "exec" instead of "bash".
  aliases: ["exec", "shell", "run", "execute", "run_command", "terminal"],
};

registerTool(bashTool);
