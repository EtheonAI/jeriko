import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool, flagStr } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import { createLease, validateLease } from "../../../daemon/exec/lease.js";
import { auditAllow, auditDeny } from "../../../daemon/exec/audit.js";
import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

export const command: CommandHandler = {
  name: "code",
  description: "Execute Python/Node/Bash code",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko code --lang <language> --code <snippet>");
      console.log("       jeriko code --lang <language> --file <path>");
      console.log("\nExecute code snippets in a sandboxed environment.");
      console.log("\nLanguages: python, node, bash, ruby, go");
      console.log("\nFlags:");
      console.log("  --lang <language>  Programming language");
      console.log("  --code <snippet>   Inline code to execute");
      console.log("  --file <path>      Path to script file");
      console.log("  --timeout <ms>     Execution timeout (default: 30000)");
      process.exit(0);
    }

    const lang = flagStr(parsed, "lang", "bash");
    const code = flagStr(parsed, "code", "");
    const file = flagStr(parsed, "file", "");
    const timeout = parseInt(flagStr(parsed, "timeout", "30000"), 10);

    if (!code && !file) {
      // Check positional args as inline code
      const inline = parsed.positional.join(" ");
      if (!inline) fail("Missing code. Use --code <snippet> or --file <path>");
      return executeCode(lang, inline, timeout);
    }

    if (file) {
      return executeFile(lang, file, timeout);
    }

    return executeCode(lang, code, timeout);
  },
};

const LANG_CMD: Record<string, { ext: string; runner: string }> = {
  python:     { ext: ".py",   runner: "python3" },
  python3:    { ext: ".py",   runner: "python3" },
  node:       { ext: ".js",   runner: "node" },
  javascript: { ext: ".js",   runner: "node" },
  bash:       { ext: ".sh",   runner: "bash" },
  sh:         { ext: ".sh",   runner: "sh" },
  ruby:       { ext: ".rb",   runner: "ruby" },
  go:         { ext: ".go",   runner: "go run" },
};

async function executeCode(lang: string, code: string, timeout: number): Promise<void> {
  const config = LANG_CMD[lang.toLowerCase()];
  if (!config) fail(`Unsupported language: "${lang}". Supported: ${Object.keys(LANG_CMD).join(", ")}`);

  // Write code to temp file
  const tmpFile = join(tmpdir(), `jeriko-code-${randomUUID()}${config.ext}`);
  writeFileSync(tmpFile, code);

  try {
    await executeFile(lang, tmpFile, timeout);
  } finally {
    try { unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}

async function executeFile(lang: string, file: string, timeout: number): Promise<void> {
  const config = LANG_CMD[lang.toLowerCase()];
  if (!config) fail(`Unsupported language: "${lang}"`);

  const cmd = `${config.runner} "${file}"`;

  // Create and validate execution lease
  const lease = createLease("cli:code", cmd, { timeout, scope: "exec" });
  const decision = validateLease(lease);

  if (!decision.allowed) {
    auditDeny(lease, decision.lease_id, decision.reason);
    fail(`Execution denied: ${decision.reason}`);
  }

  auditAllow(lease, decision.lease_id);

  try {
    const output = execSync(cmd, {
      encoding: "utf-8",
      timeout: decision.modifications?.timeout ?? timeout,
      maxBuffer: 10 * 1024 * 1024,
    });
    ok({ language: lang, file, stdout: output, exit_code: 0 });
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    fail(`Code execution failed (exit ${e.status ?? 1}): ${e.stderr || e.stdout || "unknown error"}`);
  }
}
