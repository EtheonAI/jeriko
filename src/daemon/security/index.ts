// Layer 0 — Security barrel. Re-exports from all security modules.

export {
  type PolicyAction,
  type PolicyRule,
  type PolicyResult,
  DEFAULT_POLICIES,
  evaluatePolicy,
  addPolicy,
  removePolicy,
} from "./policy.js";

export {
  ALLOWED_ROOTS,
  BLOCKED_PATHS,
  BLOCKED_SEGMENTS,
  isPathAllowed,
  isPathBlocked,
} from "./paths.js";

export {
  REDACTION_PATTERNS,
  redact,
  containsSecrets,
} from "./redaction.js";

export {
  type Capability,
  type AgentCapabilities,
  DEFAULT_CAPABILITIES,
  grantCapability,
  revokeCapability,
  hasCapability,
  getCapabilities,
  resetCapabilities,
  listAgents,
} from "./capabilities.js";

export {
  type ApprovalRequest,
  type ApprovalStatus,
  requestApproval,
  approveRequest,
  denyRequest,
  getPendingApprovals,
  getApprovalStatus,
  clearApprovals,
} from "./approval.js";
