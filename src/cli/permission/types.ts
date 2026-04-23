/**
 * Permission Subsystem — type contracts.
 *
 * The CLI-side view of a permission decision. The daemon's exec-gateway
 * already has its own `ExecutionLease` / `LeaseDecision` shapes; those are
 * daemon-internal types. This subsystem speaks a higher-level vocabulary
 * (kind + risk + target) that a user-facing dialog can render and reason
 * about. The bridge layer (bridge.ts) converts between the two.
 *
 * Design rules:
 *   - All fields `readonly`.
 *   - Kind-specific payloads are discriminated unions — adding a new kind
 *     is a compile-time enforcement across render, matcher, and bridge.
 *   - No React / Ink imports. Pure data.
 */

// ---------------------------------------------------------------------------
// Kinds
// ---------------------------------------------------------------------------

/**
 * Canonical permission categories. Each entry carries kind-specific
 * payload data that the UI uses to render a preview.
 */
export const PERMISSION_KINDS = [
  "bash",
  "file-write",
  "file-edit",
  "web-fetch",
  "connector",
  "skill",
] as const;

export type PermissionKind = (typeof PERMISSION_KINDS)[number];

// ---------------------------------------------------------------------------
// Risk levels — drive badge tone and default dialog intent
// ---------------------------------------------------------------------------

export const RISK_LEVELS = ["low", "medium", "high", "critical"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

/**
 * The user's choice for a request.
 *
 * Lifetime semantics:
 *   - `*-once`:    this request only.
 *   - `*-session`: cached in-memory until the CLI exits.
 *   - `*-always`:  persisted to ~/.config/jeriko/permissions.json.
 */
export const PERMISSION_DECISIONS = [
  "allow-once",
  "allow-session",
  "allow-always",
  "deny-once",
  "deny-always",
] as const;

export type PermissionDecision = (typeof PERMISSION_DECISIONS)[number];

/** True iff the decision grants access. Pure helper for the store. */
export function isAllow(decision: PermissionDecision): boolean {
  return decision === "allow-once" || decision === "allow-session" || decision === "allow-always";
}

/** True iff the decision should persist to disk. */
export function persistsToDisk(decision: PermissionDecision): boolean {
  return decision === "allow-always" || decision === "deny-always";
}

/** True iff the decision should live in the session cache. */
export function persistsInSession(decision: PermissionDecision): boolean {
  return decision === "allow-session" || decision === "deny-session" as never;
  // `deny-session` is intentionally excluded from the decision union — denying
  // once defaults to deny-once (ask again later). Users who want permanent
  // denial pick deny-always. This one-liner documents that constraint.
}

// ---------------------------------------------------------------------------
// Kind-specific request bodies
// ---------------------------------------------------------------------------

export interface BashRequestBody     { readonly kind: "bash";       readonly command: string; readonly cwd?: string; }
export interface FileWriteRequestBody { readonly kind: "file-write"; readonly path: string; readonly byteCount: number; }
export interface FileEditRequestBody  { readonly kind: "file-edit";  readonly path: string; readonly diffPreview: string; }
export interface WebFetchRequestBody  { readonly kind: "web-fetch";  readonly url: string; readonly method: string; }
export interface ConnectorRequestBody { readonly kind: "connector";  readonly connectorId: string; readonly method: string; }
export interface SkillRequestBody     { readonly kind: "skill";      readonly skillId: string; readonly scriptPath?: string; }

export type PermissionRequestBody =
  | BashRequestBody
  | FileWriteRequestBody
  | FileEditRequestBody
  | WebFetchRequestBody
  | ConnectorRequestBody
  | SkillRequestBody;

// ---------------------------------------------------------------------------
// Request envelope
// ---------------------------------------------------------------------------

/**
 * A permission request crossing the daemon→CLI boundary. The `id` is the
 * correlation handle the bridge uses to resolve the decision back to the
 * waiting daemon lease.
 */
export interface PermissionRequest {
  readonly id: string;
  readonly agent: string;
  readonly sessionId: string;
  readonly risk: RiskLevel;
  readonly summary: string;
  readonly issuedAt: number;
  readonly body: PermissionRequestBody;
}

// ---------------------------------------------------------------------------
// Rules — the data we persist + cache
// ---------------------------------------------------------------------------

/**
 * A matching rule. `target` is kind-specific:
 *   - bash:       a prefix of the command line (e.g. "git ")
 *   - file-write: a glob-style path pattern
 *   - file-edit:  a glob-style path pattern
 *   - web-fetch:  a URL hostname or origin prefix
 *   - connector:  connectorId (exact) + optional ":method"
 *   - skill:      skillId (exact)
 *
 * Empty `target` is a wildcard for the kind (e.g. allow all web-fetch).
 */
export interface PermissionRule {
  readonly kind: PermissionKind;
  readonly target: string;
  readonly decision: "allow" | "deny";
  /** Origin — determines persistence behaviour and UI labelling. */
  readonly origin: "session" | "persistent";
}

// ---------------------------------------------------------------------------
// Store snapshot types
// ---------------------------------------------------------------------------

export interface PermissionSnapshot {
  readonly queue: readonly PermissionRequest[];
  readonly sessionRules: readonly PermissionRule[];
  readonly persistentRules: readonly PermissionRule[];
}
