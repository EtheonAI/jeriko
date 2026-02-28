// Layer 1 — Execution Lease System. Depends only on lib/types.
//
// Every shell execution must acquire a lease first. The lease captures
// who is running what, the classified risk level, and resource limits.
// Policy validation happens here — before any process is spawned.

import type { RiskLevel } from "../../shared/types.js";
import { randomUUID } from "node:crypto";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

/** Resource and permission scope for a single command execution. */
export interface ExecutionLease {
  /** Who is executing: "cli", "agent:claude", "trigger:cron-daily", etc. */
  agent: string;
  /** Session ID for audit trail linkage. */
  session?: string;
  /** The actual shell command to be executed. */
  command: string;
  /** Auto-classified or manually overridden risk level. */
  risk: RiskLevel;
  /** Permission scope: what the command intends to do. */
  scope: "read" | "write" | "exec" | "admin";
  /** Network access required by the command. */
  network: "none" | "local" | "internet";
  /** Filesystem access mode. */
  rw_mode: "readonly" | "readwrite" | "append";
  /** Maximum execution time in milliseconds. */
  timeout: number;
  /** Maximum memory in bytes (optional, OS-level enforcement). */
  mem_limit?: number;
  /** Maximum CPU percentage (optional, OS-level enforcement). */
  cpu_limit?: number;
  /** Paths the command is explicitly allowed to access. */
  allowed_paths?: string[];
  /** Paths the command is explicitly forbidden from accessing. */
  blocked_paths?: string[];
}

/** The outcome of validating a lease against the current policy. */
export interface LeaseDecision {
  /** Whether execution is permitted. */
  allowed: boolean;
  /** Human-readable explanation (logged in audit trail). */
  reason: string;
  /** Unique identifier for this lease decision. */
  lease_id: string;
  /** Policy-enforced modifications to the original lease (e.g., reduced timeout). */
  modifications?: Partial<ExecutionLease>;
}

// ═══════════════════════════════════════════════════════════════
// DEFAULTS
// ═══════════════════════════════════════════════════════════════

const DEFAULT_TIMEOUT = 30_000;
const MAX_TIMEOUT_BY_RISK: Record<RiskLevel, number> = {
  low: 60_000,
  medium: 120_000,
  high: 300_000,
  critical: 30_000, // critical commands get SHORT leashes
};

// ═══════════════════════════════════════════════════════════════
// RISK CLASSIFICATION
// ═══════════════════════════════════════════════════════════════

/** Patterns mapped to risk levels. Checked in order — first match wins. */
const RISK_PATTERNS: Array<{ pattern: RegExp; risk: RiskLevel }> = [
  // CRITICAL — system-level destructive operations
  { pattern: /rm\s+(-[a-zA-Z]*)?r[a-zA-Z]*f\s+\//, risk: "critical" },
  { pattern: /sudo\s+/, risk: "critical" },
  { pattern: /mkfs\b/, risk: "critical" },
  { pattern: /dd\s+.*of=\/dev/, risk: "critical" },
  { pattern: /:\(\)\s*\{\s*:\|\s*:\s*&\s*\}/, risk: "critical" },
  { pattern: /shutdown\b/, risk: "critical" },
  { pattern: /reboot\b/, risk: "critical" },
  { pattern: /halt\b/, risk: "critical" },
  { pattern: /init\s+0/, risk: "critical" },
  { pattern: />\s*\/dev\/sd[a-z]/, risk: "critical" },
  { pattern: /launchctl\s+unload/, risk: "critical" },
  { pattern: /chmod\s+777\s/, risk: "critical" },

  // HIGH — network piping, mass deletion, service manipulation
  { pattern: /curl\s.*\|\s*(?:ba)?sh/, risk: "high" },
  { pattern: /wget\s.*\|\s*(?:ba)?sh/, risk: "high" },
  { pattern: /killall\s+-9\s+/, risk: "high" },
  { pattern: /rm\s+(-[a-zA-Z]*)?r[a-zA-Z]*\s+~\/?$/, risk: "high" },
  { pattern: /npm\s+publish/, risk: "high" },
  { pattern: /docker\s+rm/, risk: "high" },
  { pattern: /git\s+push\s+.*--force/, risk: "high" },

  // MEDIUM — writes, installs, network access
  { pattern: /npm\s+install/, risk: "medium" },
  { pattern: /pip\s+install/, risk: "medium" },
  { pattern: /brew\s+install/, risk: "medium" },
  { pattern: /curl\s/, risk: "medium" },
  { pattern: /wget\s/, risk: "medium" },
  { pattern: /git\s+push/, risk: "medium" },
  { pattern: /git\s+commit/, risk: "medium" },
  { pattern: /rm\s/, risk: "medium" },
  { pattern: /mv\s/, risk: "medium" },
  { pattern: /cp\s/, risk: "medium" },
  { pattern: /mkdir\s/, risk: "medium" },
  { pattern: /touch\s/, risk: "medium" },
  { pattern: /tee\s/, risk: "medium" },
  { pattern: />\s/, risk: "medium" },
  { pattern: />>\s/, risk: "medium" },
];

/**
 * Auto-classify a shell command's risk level.
 *
 * Walks the pattern list top-to-bottom; first match wins.
 * Unknown commands default to "low".
 */
export function classifyRisk(command: string): RiskLevel {
  if (!command) return "low";

  for (const { pattern, risk } of RISK_PATTERNS) {
    if (pattern.test(command)) return risk;
  }
  return "low";
}

// ═══════════════════════════════════════════════════════════════
// SCOPE INFERENCE
// ═══════════════════════════════════════════════════════════════

const WRITE_PATTERNS = [
  /rm\s/, /mv\s/, /cp\s/, /mkdir\s/, /touch\s/, /tee\s/,
  />\s/, />>\s/, /git\s+commit/, /git\s+push/, /npm\s+publish/,
];

const NETWORK_PATTERNS = [
  /curl\s/, /wget\s/, /ssh\s/, /scp\s/, /rsync\s/,
  /git\s+(clone|pull|push|fetch)/, /npm\s+(install|publish)/,
  /pip\s+install/, /brew\s+install/,
];

const ADMIN_PATTERNS = [
  /sudo\s/, /launchctl\s/, /systemctl\s/, /mkfs\b/, /shutdown\b/, /reboot\b/,
];

function inferScope(command: string): ExecutionLease["scope"] {
  for (const p of ADMIN_PATTERNS) {
    if (p.test(command)) return "admin";
  }
  for (const p of WRITE_PATTERNS) {
    if (p.test(command)) return "write";
  }
  return "read";
}

function inferNetwork(command: string): ExecutionLease["network"] {
  for (const p of NETWORK_PATTERNS) {
    if (p.test(command)) return "internet";
  }
  return "none";
}

function inferRwMode(command: string): ExecutionLease["rw_mode"] {
  if (/>>\s/.test(command)) return "append";
  const scope = inferScope(command);
  return scope === "read" ? "readonly" : "readwrite";
}

// ═══════════════════════════════════════════════════════════════
// LEASE CREATION
// ═══════════════════════════════════════════════════════════════

/**
 * Create an execution lease with auto-classification.
 *
 * Infers risk, scope, network, and rw_mode from the command text.
 * Any field can be overridden via the `overrides` parameter.
 */
export function createLease(
  agent: string,
  command: string,
  overrides?: Partial<ExecutionLease>,
): ExecutionLease {
  const risk = overrides?.risk ?? classifyRisk(command);

  return {
    ...overrides,
    // Ensure agent and command are never overridden (they are the identity)
    agent,
    command,
    risk,
    scope: overrides?.scope ?? inferScope(command),
    network: overrides?.network ?? inferNetwork(command),
    rw_mode: overrides?.rw_mode ?? inferRwMode(command),
    timeout: overrides?.timeout ?? DEFAULT_TIMEOUT,
  };
}

// ═══════════════════════════════════════════════════════════════
// LEASE VALIDATION
// ═══════════════════════════════════════════════════════════════

/**
 * Validate an execution lease against the current security policy.
 *
 * Returns a decision with a unique lease_id. If the lease is denied,
 * `allowed` is false and `reason` explains why. If the lease is allowed
 * but the policy modifies it (e.g., capping timeout), `modifications`
 * contains the enforced changes.
 */
export function validateLease(lease: ExecutionLease): LeaseDecision {
  const lease_id = randomUUID();

  // 1. Critical commands are always denied (they should never reach execution)
  if (lease.risk === "critical") {
    return {
      allowed: false,
      reason: `critical-risk command denied by policy: "${lease.command.slice(0, 100)}"`,
      lease_id,
    };
  }

  // 2. Admin scope requires explicit CLI agent (no remote agents)
  if (lease.scope === "admin" && !lease.agent.startsWith("cli")) {
    return {
      allowed: false,
      reason: `admin-scope commands require CLI agent, got "${lease.agent}"`,
      lease_id,
    };
  }

  // 3. Empty commands are invalid
  if (!lease.command.trim()) {
    return {
      allowed: false,
      reason: "empty command",
      lease_id,
    };
  }

  // 4. Enforce timeout caps by risk level
  const maxTimeout = MAX_TIMEOUT_BY_RISK[lease.risk];
  const modifications: Partial<ExecutionLease> = {};
  let modified = false;

  if (lease.timeout > maxTimeout) {
    modifications.timeout = maxTimeout;
    modified = true;
  }

  // 5. High-risk commands from non-CLI agents need tighter limits
  if (lease.risk === "high" && !lease.agent.startsWith("cli")) {
    if (!lease.timeout || lease.timeout > 60_000) {
      modifications.timeout = 60_000;
      modified = true;
    }
  }

  return {
    allowed: true,
    reason: modified
      ? `allowed with policy modifications: ${Object.keys(modifications).join(", ")}`
      : "allowed by policy",
    lease_id,
    ...(modified ? { modifications } : {}),
  };
}
