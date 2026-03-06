// Layer 2 — Execution Gateway. THE entry point for all shell execution.
//
// Every shell command in Jeriko flows through this single function:
//   exec(agent, command, options?) → ExecResult
//
// Pipeline: create lease → validate → sandbox check → audit(start)
//           → strip env → spawn process → enforce timeout
//           → capture output → audit(end) → return result

import type { RiskLevel } from "../../shared/types.js";
import { createLease, validateLease } from "./lease.js";
import type { ExecutionLease, LeaseDecision } from "./lease.js";
import { auditAllow, auditDeny, auditComplete } from "./audit.js";
import { isCommandBlocked } from "./sandbox.js";

import { spawn } from "node:child_process";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

/** The result of executing a shell command through the gateway. */
export interface ExecResult {
  /** Captured standard output. */
  stdout: string;
  /** Captured standard error. */
  stderr: string;
  /** Process exit code (0 = success). */
  exit_code: number;
  /** Wall-clock execution time in milliseconds. */
  duration_ms: number;
  /** Lease ID linking this result to its audit trail. */
  lease_id: string;
  /** Whether stdout/stderr was truncated to fit max_output. */
  truncated: boolean;
}

/** Options for customizing execution behavior. */
export interface ExecOptions {
  /** Maximum execution time in ms (overrides lease default). */
  timeout?: number;
  /** Working directory for the spawned process. */
  cwd?: string;
  /** Additional environment variables (merged with sanitized env). */
  env?: Record<string, string>;
  /** Data piped to the process's stdin. */
  stdin?: string;
  /** Maximum bytes to capture for stdout+stderr (default: 1MB). */
  max_output?: number;
  /** Session ID for audit trail linkage. */
  session?: string;
  /** Override lease fields (risk, scope, network, etc.). */
  lease_overrides?: Partial<ExecutionLease>;
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const DEFAULT_MAX_OUTPUT = 1024 * 1024; // 1MB

/** Environment variable keys that must be stripped before spawning. */
const SENSITIVE_KEYS: readonly string[] = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "PAYPAL_CLIENT_SECRET",
  "GITHUB_TOKEN",
  "GH_TOKEN",
  "TWILIO_AUTH_TOKEN",
  "TELEGRAM_BOT_TOKEN",
  "NODE_AUTH_SECRET",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "DATABASE_URL",
  "REDIS_URL",
  "GOOGLE_API_KEY",
  "BLUEBUBBLES_PASSWORD",
  "GOOGLE_CHAT_SERVICE_ACCOUNT_KEY",
  "WHATSAPP_TOKEN",
  "CLOUDFLARE_API_TOKEN",
  "VERCEL_TOKEN",
];

// ═══════════════════════════════════════════════════════════════
// ENV SANITIZATION
// ═══════════════════════════════════════════════════════════════

/**
 * Create a sanitized copy of the environment, stripping all sensitive keys.
 * Merges in any user-provided env vars AFTER stripping (user env is trusted
 * since they explicitly passed it).
 */
function sanitizeEnv(userEnv?: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};

  // Copy process.env, skipping sensitive keys
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;

    // Skip keys in the sensitive list
    if (SENSITIVE_KEYS.includes(key)) continue;

    // Skip anything that looks like a secret by naming convention
    const upper = key.toUpperCase();
    if (
      upper.includes("SECRET") ||
      upper.includes("PASSWORD") ||
      upper.includes("PRIVATE_KEY") ||
      upper.endsWith("_TOKEN") ||
      (upper.endsWith("_KEY") && (upper.includes("API") || upper.includes("AUTH")))
    ) {
      continue;
    }

    env[key] = value;
  }

  // Merge user-provided env (these are explicit, not leaked)
  if (userEnv) {
    for (const [key, value] of Object.entries(userEnv)) {
      env[key] = value;
    }
  }

  return env;
}

// ═══════════════════════════════════════════════════════════════
// PROCESS SPAWNING
// ═══════════════════════════════════════════════════════════════

interface SpawnResult {
  stdout: string;
  stderr: string;
  exit_code: number;
  duration_ms: number;
  truncated: boolean;
}

/**
 * Spawn a shell command with timeout enforcement and output capping.
 */
function spawnCommand(
  command: string,
  options: {
    timeout: number;
    cwd?: string;
    env: Record<string, string>;
    stdin?: string;
    max_output: number;
  },
): Promise<SpawnResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const start = performance.now();
    let stdoutBuf = "";
    let stderrBuf = "";
    let truncated = false;
    let killed = false;

    const proc = spawn("sh", ["-c", command], {
      cwd: options.cwd,
      env: options.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Timeout enforcement
    const timer = setTimeout(() => {
      killed = true;
      proc.kill("SIGKILL");
    }, options.timeout);

    // Capture stdout with size cap
    proc.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf-8");
      if (stdoutBuf.length + stderrBuf.length < options.max_output) {
        const remaining = options.max_output - stdoutBuf.length - stderrBuf.length;
        stdoutBuf += text.slice(0, remaining);
        if (text.length > remaining) truncated = true;
      } else {
        truncated = true;
      }
    });

    // Capture stderr with size cap
    proc.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf-8");
      if (stdoutBuf.length + stderrBuf.length < options.max_output) {
        const remaining = options.max_output - stdoutBuf.length - stderrBuf.length;
        stderrBuf += text.slice(0, remaining);
        if (text.length > remaining) truncated = true;
      } else {
        truncated = true;
      }
    });

    // Pipe stdin if provided
    if (options.stdin) {
      proc.stdin.write(options.stdin);
      proc.stdin.end();
    } else {
      proc.stdin.end();
    }

    proc.on("close", (code) => {
      clearTimeout(timer);
      const duration_ms = Math.round(performance.now() - start);

      if (killed) {
        resolvePromise({
          stdout: stdoutBuf,
          stderr: stderrBuf + "\n[jeriko] process killed: timeout exceeded",
          exit_code: 137, // SIGKILL
          duration_ms,
          truncated,
        });
        return;
      }

      resolvePromise({
        stdout: stdoutBuf,
        stderr: stderrBuf,
        exit_code: code ?? 1,
        duration_ms,
        truncated,
      });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      const duration_ms = Math.round(performance.now() - start);
      resolvePromise({
        stdout: stdoutBuf,
        stderr: `[jeriko] spawn error: ${err.message}`,
        exit_code: 1,
        duration_ms,
        truncated,
      });
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC API — THE ENTRY POINT
// ═══════════════════════════════════════════════════════════════

/**
 * Execute a shell command through the Jeriko execution gateway.
 *
 * This is THE single entry point for all shell execution in the system.
 * Every agent, trigger, CLI command, and tool call that needs to run
 * a shell command must go through here.
 *
 * Pipeline:
 *   1. Create execution lease (auto-classify risk, scope, network)
 *   2. Sandbox check (command blocklist + path validation)
 *   3. Validate lease against policy (risk caps, agent permissions)
 *   4. Audit the allow/deny decision
 *   5. Strip sensitive env vars
 *   6. Spawn process with timeout enforcement
 *   7. Capture output (with size cap)
 *   8. Audit completion
 *   9. Return structured result
 *
 * @param agent   - Who is running the command: "cli", "agent:claude", etc.
 * @param command - The shell command to execute
 * @param options - Timeout, cwd, env, stdin, max_output overrides
 * @returns Structured result with stdout, stderr, exit code, timing
 *
 * @throws Never — all errors are captured in the ExecResult
 */
export async function exec(
  agent: string,
  command: string,
  options: ExecOptions = {},
): Promise<ExecResult> {
  // 1. Create lease with auto-classification
  const lease = createLease(agent, command, {
    timeout: options.timeout,
    session: options.session,
    ...options.lease_overrides,
  });

  // 2. Sandbox check — command blocklist
  const cmdCheck = isCommandBlocked(command);
  if (cmdCheck.blocked) {
    const denyResult: ExecResult = {
      stdout: "",
      stderr: `[jeriko] command blocked: ${cmdCheck.reason}`,
      exit_code: 126, // "Command cannot execute"
      duration_ms: 0,
      lease_id: "",
      truncated: false,
    };

    // Generate a lease ID for the audit trail even on denial
    const decision = validateLease(lease);
    denyResult.lease_id = decision.lease_id;
    auditDeny(lease, decision.lease_id, cmdCheck.reason ?? "blocked by sandbox");
    return denyResult;
  }

  // 3. Validate lease against policy
  const decision: LeaseDecision = validateLease(lease);

  if (!decision.allowed) {
    auditDeny(lease, decision.lease_id, decision.reason);
    return {
      stdout: "",
      stderr: `[jeriko] execution denied: ${decision.reason}`,
      exit_code: 126,
      duration_ms: 0,
      lease_id: decision.lease_id,
      truncated: false,
    };
  }

  // Apply any policy-enforced modifications
  if (decision.modifications) {
    if (decision.modifications.timeout !== undefined) {
      lease.timeout = decision.modifications.timeout;
    }
  }

  // 4. Audit the allow decision
  auditAllow(lease, decision.lease_id);

  // 5. Sanitize environment and spawn
  const sanitizedEnv = sanitizeEnv(options.env);
  const maxOutput = options.max_output ?? DEFAULT_MAX_OUTPUT;

  const spawnResult = await spawnCommand(command, {
    timeout: lease.timeout,
    cwd: options.cwd,
    env: sanitizedEnv,
    stdin: options.stdin,
    max_output: maxOutput,
  });

  // 6. Build result
  const result: ExecResult = {
    stdout: spawnResult.stdout,
    stderr: spawnResult.stderr,
    exit_code: spawnResult.exit_code,
    duration_ms: spawnResult.duration_ms,
    lease_id: decision.lease_id,
    truncated: spawnResult.truncated,
  };

  // 7. Audit completion
  auditComplete(lease, result);

  return result;
}

// ═══════════════════════════════════════════════════════════════
// CONVENIENCE EXPORTS
// ═══════════════════════════════════════════════════════════════

/** Re-export types that consumers need. */
export type { ExecutionLease, LeaseDecision } from "./lease.js";
