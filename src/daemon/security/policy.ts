// Layer 0 — Command policy engine.

import type { RiskLevel } from "../../shared/types.js";
import { RISK_WEIGHT } from "../../shared/types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PolicyAction = "allow" | "deny" | "approve" | "log";

export interface PolicyRule {
  pattern: RegExp;
  action: PolicyAction;
  risk: RiskLevel;
  reason: string;
}

export interface PolicyResult {
  action: PolicyAction;
  risk: RiskLevel;
  reason: string;
}

// ---------------------------------------------------------------------------
// Action severity — used to pick the most restrictive match
// ---------------------------------------------------------------------------

const ACTION_WEIGHT: Record<PolicyAction, number> = {
  allow:   0,
  log:     1,
  approve: 2,
  deny:    3,
};

// ---------------------------------------------------------------------------
// Default policy rules
// ---------------------------------------------------------------------------

export const DEFAULT_POLICIES: PolicyRule[] = [
  // Critical — instant deny
  {
    pattern: /\brm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?(-[a-zA-Z]*r[a-zA-Z]*\s+)?\//,
    action: "deny",
    risk: "critical",
    reason: "Recursive delete from root is forbidden",
  },
  {
    pattern: /\brm\s+-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*\s+\//,
    action: "deny",
    risk: "critical",
    reason: "Recursive force-delete from root is forbidden",
  },
  {
    pattern: /\bsudo\b/,
    action: "deny",
    risk: "critical",
    reason: "Privilege escalation via sudo is forbidden",
  },
  {
    pattern: /\b(curl|wget)\b.*\|\s*(ba)?sh/,
    action: "deny",
    risk: "critical",
    reason: "Piping remote content to shell is forbidden",
  },
  {
    pattern: /\bdd\b.*\bof=\/dev\//,
    action: "deny",
    risk: "critical",
    reason: "Direct device writes via dd are forbidden",
  },
  {
    pattern: /\bmkfs\b/,
    action: "deny",
    risk: "critical",
    reason: "Filesystem formatting is forbidden",
  },
  {
    pattern: />\s*\/dev\/[sh]d[a-z]/,
    action: "deny",
    risk: "critical",
    reason: "Redirecting output to block devices is forbidden",
  },
  {
    pattern: /\bchmod\s+(-[a-zA-Z]*\s+)?[0-7]*[2367][0-7]*\s+\//,
    action: "deny",
    risk: "high",
    reason: "Changing permissions on system paths is forbidden",
  },
  {
    pattern: /\bchown\b.*\//,
    action: "deny",
    risk: "high",
    reason: "Changing ownership on system paths is forbidden",
  },

  // High — require approval
  {
    pattern: /\b(curl|wget)\b/,
    action: "approve",
    risk: "high",
    reason: "Network downloads require approval",
  },
  {
    pattern: /\bnpm\s+(install|i)\s+-g\b/,
    action: "approve",
    risk: "high",
    reason: "Global npm installs require approval",
  },
  {
    pattern: /\bpip\s+install\b/,
    action: "approve",
    risk: "high",
    reason: "pip installs require approval",
  },
  {
    pattern: /\bgit\s+push\b/,
    action: "approve",
    risk: "medium",
    reason: "Git pushes require approval",
  },

  // Medium — log
  {
    pattern: /\bgit\b/,
    action: "log",
    risk: "low",
    reason: "Git operations are logged",
  },
  {
    pattern: /\bnpm\b/,
    action: "log",
    risk: "low",
    reason: "npm operations are logged",
  },
];

// ---------------------------------------------------------------------------
// Mutable rule store — starts with a copy of defaults
// ---------------------------------------------------------------------------

const rules: PolicyRule[] = [...DEFAULT_POLICIES];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate a command string against all policy rules.
 * Returns the most restrictive matching result.
 * If no rule matches, returns allow/low.
 */
export function evaluatePolicy(command: string): PolicyResult {
  let worstAction: PolicyAction = "allow";
  let worstRisk: RiskLevel = "low";
  let worstReason = "No policy matched — allowed by default";
  let worstScore = -1;

  for (const rule of rules) {
    if (rule.pattern.test(command)) {
      const actionScore = ACTION_WEIGHT[rule.action];
      const riskScore = RISK_WEIGHT[rule.risk];
      const combined = actionScore * 10 + riskScore;

      if (combined > worstScore) {
        worstScore = combined;
        worstAction = rule.action;
        worstRisk = rule.risk;
        worstReason = rule.reason;
      }
    }
  }

  return { action: worstAction, risk: worstRisk, reason: worstReason };
}

/**
 * Add a policy rule to the end of the rule set.
 */
export function addPolicy(rule: PolicyRule): void {
  rules.push(rule);
}

/**
 * Remove all rules whose pattern source matches the given regex source.
 */
export function removePolicy(pattern: RegExp): void {
  const source = pattern.source;
  const flags = pattern.flags;
  for (let i = rules.length - 1; i >= 0; i--) {
    const rule = rules[i];
    if (rule && rule.pattern.source === source && rule.pattern.flags === flags) {
      rules.splice(i, 1);
    }
  }
}
