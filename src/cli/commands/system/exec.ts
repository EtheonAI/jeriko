import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagStr, flagBool } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import { createLease, validateLease } from "../../../daemon/exec/lease.js";
import { auditAllow, auditDeny } from "../../../daemon/exec/audit.js";
import { execSync } from "node:child_process";

export const command: CommandHandler = {
  name: "exec",
  description: "Execute shell command",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko exec <command> [--timeout <ms>] [--shell <path>]");
      console.log("\nExecute a shell command through the exec gateway.");
      console.log("All commands are risk-classified, audited, and lease-validated.");
      process.exit(0);
    }

    const cmd = parsed.positional.join(" ");
    if (!cmd) {
      fail("No command specified. Usage: jeriko exec <command>");
    }

    const timeout = parseInt(flagStr(parsed, "timeout", "30000"), 10);
    const shell = flagStr(parsed, "shell", "") || undefined;

    // Create and validate execution lease
    const lease = createLease("cli", cmd, { timeout });
    const decision = validateLease(lease);

    if (!decision.allowed) {
      auditDeny(lease, decision.lease_id, decision.reason);
      fail(`Execution denied: ${decision.reason}`);
    }

    auditAllow(lease, decision.lease_id);

    try {
      const effectiveTimeout = decision.modifications?.timeout ?? timeout;
      const output = execSync(cmd, {
        encoding: "utf-8",
        timeout: effectiveTimeout,
        shell: shell ?? "/bin/bash",
        maxBuffer: 10 * 1024 * 1024,
      });

      ok({
        command: cmd,
        exit_code: 0,
        stdout: output,
        lease_id: decision.lease_id,
      });
    } catch (err: unknown) {
      const e = err as { status?: number; stdout?: string; stderr?: string; message?: string };
      fail(`Command failed (exit ${e.status ?? 1}): ${e.stderr || e.message || "unknown error"}`);
    }
  },
};
