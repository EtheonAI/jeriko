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
import { getActiveBroker } from "./broker.js";
import { safeSpawn } from "../../shared/spawn-safe.js";

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

/**
 * Grace period between SIGTERM and SIGKILL when a command blows its
 * timeout. Short by design — the gateway's callers (agent tools, CLI
 * dispatch) all run under a user-facing latency budget and a stuck
 * command must not block the loop for the full `gracefulKillDelayMs`
 * default of `safeSpawn`.
 */
const GATEWAY_KILL_GRACE_MS = 500;

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
 * Run a shell command through `safeSpawn` and project the outcome into
 * the gateway's result shape.
 *
 * The gateway historically enforced a *shared* stdout+stderr output cap
 * (`max_output`) so a command emitting heavily onto one stream couldn't
 * blow the memory budget of the other. `safeSpawn` uses per-stream
 * limits; we preserve the original contract by setting both limits to
 * the same number (callers still see truncation when either stream
 * hits the cap) and OR the truncation flags.
 */
async function spawnCommand(
  command: string,
  options: {
    timeout: number;
    cwd?: string;
    env: Record<string, string>;
    stdin?: string;
    max_output: number;
  },
): Promise<SpawnResult> {
  const outcome = await safeSpawn({
    command,
    shell: true,
    cwd: options.cwd,
    env: options.env,
    stdin: options.stdin,
    timeoutMs: options.timeout,
    gracefulKillDelayMs: GATEWAY_KILL_GRACE_MS,
    stdoutLimit: options.max_output,
    stderrLimit: options.max_output,
  });

  switch (outcome.status) {
    case "exited": {
      return {
        stdout: outcome.stdout,
        stderr: outcome.stderr,
        exit_code: outcome.code,
        duration_ms: outcome.durationMs,
        truncated: outcome.stdoutTruncated || outcome.stderrTruncated,
      };
    }
    case "timeout": {
      const tail = outcome.stderr.endsWith("\n") ? "" : "\n";
      return {
        stdout: outcome.stdout,
        stderr: `${outcome.stderr}${tail}[jeriko] process killed: timeout exceeded`,
        // 137 = 128 + SIGKILL(9). Kept for backwards-compat with callers
        // that inspect the exit code to detect timeouts.
        exit_code: 137,
        duration_ms: outcome.durationMs,
        truncated: outcome.stdoutTruncated || outcome.stderrTruncated,
      };
    }
    case "aborted": {
      return {
        stdout: outcome.stdout,
        stderr: `${outcome.stderr}\n[jeriko] process aborted`,
        exit_code: 143, // 128 + SIGTERM(15)
        duration_ms: outcome.durationMs,
        truncated: false,
      };
    }
    case "error": {
      return {
        stdout: "",
        stderr: `[jeriko] spawn error: ${outcome.error.message}`,
        exit_code: 1,
        duration_ms: 0,
        truncated: false,
      };
    }
  }
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

  // 4b. Interactive consent — if a broker is registered and the lease
  // clears its `shouldAsk` policy, route the decision to the broker
  // before spawning. A rejected broker (either `false` or a thrown
  // error) converts the audited-allow into an audited-deny so the
  // trail stays accurate. When no broker is registered the pipeline
  // runs unchanged — that is the headless/CI default.
  const broker = getActiveBroker();
  if (broker !== null && broker.shouldAsk(lease)) {
    let consent = false;
    try {
      consent = await broker.ask({ lease, leaseId: decision.lease_id });
    } catch {
      consent = false;
    }
    if (!consent) {
      auditDeny(lease, decision.lease_id, "user denied via permission broker");
      return {
        stdout: "",
        stderr: "[jeriko] execution denied: user rejected via permission prompt",
        exit_code: 126,
        duration_ms: 0,
        lease_id: decision.lease_id,
        truncated: false,
      };
    }
  }

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
