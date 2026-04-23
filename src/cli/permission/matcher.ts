/**
 * Permission matcher — pure evaluation of a request against existing rules.
 *
 * Given a PermissionRequest and the current session + persistent rule sets,
 * return one of:
 *   - An auto-decision (the store skips the UI and resolves immediately).
 *   - `null` (no matching rule; the store must queue the request for UI).
 *
 * Precedence:
 *   1. Persistent deny (user said deny-always before).
 *   2. Session deny (user said deny-session... not currently issuable but
 *      reserved — see types.ts notes; falls through to persistent).
 *   3. Persistent allow (user said allow-always before).
 *   4. Session allow (user said allow-session earlier this run).
 *   5. No match → null.
 *
 * Deny rules always take precedence over allow rules at the same tier so
 * a specific deny can override a broader allow. Within a tier, the most
 * specific rule (longest target) wins.
 */

import type {
  PermissionKind,
  PermissionRequest,
  PermissionRule,
} from "./types.js";

// ---------------------------------------------------------------------------
// Target extraction — pulls the comparable string from a request body
// ---------------------------------------------------------------------------

/**
 * Derive the target string for a request. Must agree with the target
 * semantics documented on PermissionRule; a change here requires a
 * corresponding change to the rule-authoring path (UI when users pick
 * "allow-always").
 */
export function targetFor(request: PermissionRequest): string {
  switch (request.body.kind) {
    case "bash":       return request.body.command;
    case "file-write": return request.body.path;
    case "file-edit":  return request.body.path;
    case "web-fetch":  return request.body.url;
    case "connector":  return `${request.body.connectorId}:${request.body.method}`;
    case "skill":      return request.body.skillId;
  }
}

// ---------------------------------------------------------------------------
// Target matching
// ---------------------------------------------------------------------------

/**
 * Determine whether a rule's target matches a request target.
 *
 * Matching rules:
 *   - Empty rule target → wildcard (matches any target of the same kind).
 *   - For bash / file-write / file-edit / web-fetch: rule target is a
 *     prefix of the request target (command prefix, path prefix, URL
 *     prefix).
 *   - For connector / skill: rule target matches request target as a
 *     prefix (supports `stripe:` to allow every stripe method).
 *
 * Glob characters are NOT expanded — a user writes `git ` to cover every
 * command starting with `git `, not `git *`. Keeps the rule language
 * unambiguous and trivially testable.
 */
export function targetMatches(rule: PermissionRule, target: string): boolean {
  if (rule.target === "") return true;
  return target.startsWith(rule.target);
}

// ---------------------------------------------------------------------------
// Rule specificity — longer target wins
// ---------------------------------------------------------------------------

function bySpecificity(a: PermissionRule, b: PermissionRule): number {
  return b.target.length - a.target.length;
}

// ---------------------------------------------------------------------------
// Tier lookup
// ---------------------------------------------------------------------------

function findBestMatch(
  rules: readonly PermissionRule[],
  kind: PermissionKind,
  target: string,
  decision: "allow" | "deny",
): PermissionRule | null {
  const candidates = rules.filter(
    (r) => r.kind === kind && r.decision === decision && targetMatches(r, target),
  );
  if (candidates.length === 0) return null;
  const [best] = [...candidates].sort(bySpecificity);
  return best ?? null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type AutoDecision = "allow" | "deny" | null;

export interface MatchInput {
  readonly request: PermissionRequest;
  readonly sessionRules: readonly PermissionRule[];
  readonly persistentRules: readonly PermissionRule[];
}

/**
 * Evaluate a request. Returns "allow" / "deny" when a rule matched, or
 * `null` when the user must be asked.
 */
export function evaluate(input: MatchInput): AutoDecision {
  const { request, sessionRules, persistentRules } = input;
  const kind = request.body.kind;
  const target = targetFor(request);

  // Deny tier — persistent first, then session.
  if (findBestMatch(persistentRules, kind, target, "deny") !== null) return "deny";
  if (findBestMatch(sessionRules, kind, target, "deny") !== null) return "deny";

  // Allow tier — persistent first, then session.
  if (findBestMatch(persistentRules, kind, target, "allow") !== null) return "allow";
  if (findBestMatch(sessionRules, kind, target, "allow") !== null) return "allow";

  return null;
}
