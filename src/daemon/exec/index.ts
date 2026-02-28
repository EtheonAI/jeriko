// Execution Gateway — barrel export.
//
// This module is THE critical architectural boundary. All shell execution
// in the entire Jeriko system flows through exec() from gateway.ts.
//
// Path alias: @jeriko/exec (see tsconfig.json)

export { exec } from "./gateway.js";
export type { ExecResult, ExecOptions } from "./gateway.js";

export { createLease, validateLease, classifyRisk } from "./lease.js";
export type { ExecutionLease, LeaseDecision } from "./lease.js";

export { auditAllow, auditDeny, auditComplete, AUDIT_LOG } from "./audit.js";
export type { AuditEvent } from "./audit.js";

export {
  isPathAllowed,
  isPathBlocked,
  isCommandBlocked,
  validateCommand,
  BLOCKED_COMMANDS,
} from "./sandbox.js";
export type { CommandCheckResult } from "./sandbox.js";
