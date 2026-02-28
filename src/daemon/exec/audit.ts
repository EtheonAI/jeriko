// Layer 1 — Execution Audit Trail. Depends on lib/types and exec/lease.
//
// Every execution attempt — allowed or denied — is recorded as a JSONL
// audit event. This is the forensic record of every shell command that
// any agent, trigger, or CLI user attempted to run through the gateway.

import type { RiskLevel } from "../../shared/types.js";
import type { ExecutionLease } from "./lease.js";

import { appendFileSync, existsSync, mkdirSync, statSync, renameSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

/** A single audit event written to the JSONL audit log. */
export interface AuditEvent {
  /** ISO 8601 timestamp. */
  ts: string;
  /** Unique lease ID linking this event to the execution lease. */
  lease_id: string;
  /** Agent identity: "cli", "agent:claude", "trigger:cron-daily", etc. */
  agent: string;
  /** The shell command (truncated to 500 chars for log safety). */
  command: string;
  /** Risk classification at time of decision. */
  risk: RiskLevel;
  /** The gateway's decision: allow, deny, or deferred to human. */
  decision: "allow" | "deny" | "approval_required";
  /** Human-readable explanation for the decision. */
  reason: string;
  /** Execution duration in ms (only on completion events). */
  duration_ms?: number;
  /** Process exit code (only on completion events). */
  exit_code?: number;
  /** Session ID for audit trail linkage. */
  session?: string;
  /** Execution scope at time of decision. */
  scope?: string;
  /** Whether output was truncated. */
  truncated?: boolean;
}

// Re-export for consumers that only need the result shape
export type { RiskLevel };

// ═══════════════════════════════════════════════════════════════
// Forward reference for ExecResult (avoid circular import)
// ═══════════════════════════════════════════════════════════════

/** Minimal shape of ExecResult needed for audit — avoids importing gateway.ts. */
interface ExecResultLike {
  exit_code: number;
  duration_ms: number;
  lease_id: string;
  truncated: boolean;
}

// ═══════════════════════════════════════════════════════════════
// AUDIT LOG PATH + ROTATION
// ═══════════════════════════════════════════════════════════════

const DATA_DIR = join(homedir(), ".jeriko", "data");
const AUDIT_LOG_PATH = join(DATA_DIR, "exec-audit.log");
const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_ROTATIONS = 5;

/** Ensure the data directory exists. Called lazily on first write. */
let _dirEnsured = false;
function ensureDataDir(): void {
  if (_dirEnsured) return;
  try {
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }
    _dirEnsured = true;
  } catch {
    // Non-fatal: if we can't create the dir, writes will fail silently
  }
}

/** Rotate log file if it exceeds MAX_SIZE. */
function rotateIfNeeded(): void {
  try {
    if (!existsSync(AUDIT_LOG_PATH)) return;
    const stats = statSync(AUDIT_LOG_PATH);
    if (stats.size < MAX_SIZE) return;

    for (let i = MAX_ROTATIONS; i >= 1; i--) {
      const from = i === 1 ? AUDIT_LOG_PATH : `${AUDIT_LOG_PATH}.${i - 1}`;
      const to = `${AUDIT_LOG_PATH}.${i}`;
      if (i === MAX_ROTATIONS && existsSync(to)) {
        unlinkSync(to);
      }
      if (existsSync(from)) {
        renameSync(from, to);
      }
    }
  } catch {
    // Never throw from log rotation
  }
}

// ═══════════════════════════════════════════════════════════════
// SENSITIVE DATA REDACTION
// ═══════════════════════════════════════════════════════════════

const SENSITIVE_PATTERNS: RegExp[] = [
  /sk[-_](?:live|test)[-_][a-zA-Z0-9]{20,}/g,
  /ghp_[a-zA-Z0-9]{36,}/g,
  /ghs_[a-zA-Z0-9]{36,}/g,
  /xox[bsapr]-[a-zA-Z0-9-]{10,}/g,
  /AKIA[A-Z0-9]{16}/g,
  /sk-[a-zA-Z0-9]{20,}/g,
  /key-[a-zA-Z0-9]{20,}/g,
  /Bearer\s+[a-zA-Z0-9._\-]{20,}/g,
  /(?:password|passwd|pwd)\s*[:=]\s*["']?[^\s"',]{3,}/gi,
  /(?:secret|token|api_key|apikey|auth)\s*[:=]\s*["']?[^\s"',]{8,}/gi,
];

function redact(text: string): string {
  let result = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    pattern.lastIndex = 0;
    result = result.replace(pattern, "[REDACTED]");
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════
// CORE WRITE
// ═══════════════════════════════════════════════════════════════

/** Write an audit event to the JSONL log. Never throws. */
function writeAuditEvent(event: AuditEvent): void {
  try {
    ensureDataDir();
    rotateIfNeeded();
    const line = redact(JSON.stringify(event));
    appendFileSync(AUDIT_LOG_PATH, line + "\n");
  } catch {
    // Audit logging must never crash the system
  }
}

/** Build the base fields common to all audit events. */
function baseEvent(lease: ExecutionLease, lease_id: string): Omit<AuditEvent, "decision" | "reason"> {
  return {
    ts: new Date().toISOString(),
    lease_id,
    agent: lease.agent,
    command: lease.command.slice(0, 500),
    risk: lease.risk,
    session: lease.session,
    scope: lease.scope,
  };
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════

/**
 * Record that an execution lease was allowed.
 * Called immediately before the process is spawned.
 */
export function auditAllow(lease: ExecutionLease, lease_id: string): void {
  writeAuditEvent({
    ...baseEvent(lease, lease_id),
    decision: "allow",
    reason: "passed policy validation",
  });
}

/**
 * Record that an execution lease was denied.
 * Called when validateLease() returns allowed=false.
 */
export function auditDeny(lease: ExecutionLease, lease_id: string, reason: string): void {
  writeAuditEvent({
    ...baseEvent(lease, lease_id),
    decision: "deny",
    reason,
  });
}

/**
 * Record execution completion with result details.
 * Called after the spawned process exits (success or failure).
 */
export function auditComplete(lease: ExecutionLease, result: ExecResultLike): void {
  writeAuditEvent({
    ...baseEvent(lease, result.lease_id),
    decision: "allow",
    reason: "execution completed",
    duration_ms: result.duration_ms,
    exit_code: result.exit_code,
    truncated: result.truncated,
  });
}

/**
 * The path where audit events are written. Exposed for tooling
 * (e.g., `jeriko memory --agent-log`).
 */
export const AUDIT_LOG = AUDIT_LOG_PATH;
