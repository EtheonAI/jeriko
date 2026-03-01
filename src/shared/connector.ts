// Layer 0 — Connector CLI utilities.
//
// Shared helpers for all integration CLI commands (stripe, paypal, github, etc.).
// Handles method resolution from positional args, universal flag collection,
// and connector metadata for channel gateway commands (/connectors, /auth).

// ---------------------------------------------------------------------------
// Connector definitions — canonical registry of all supported connectors.
// Used by: channel router (/connectors, /auth), CLI init, health checks.
// ---------------------------------------------------------------------------

export interface ConnectorDef {
  /** Short name used in CLI commands (e.g. "stripe", "x"). */
  name: string;
  /** Human-readable label shown in channels. */
  label: string;
  /** One-line description of capabilities. */
  description: string;
  /**
   * Env vars required for the connector to work.
   * Each entry is a string OR a string[] for alternatives (any one suffices).
   * Example: ["GITHUB_TOKEN", "GH_TOKEN"] means either one works.
   */
  required: Array<string | string[]>;
  /** Env vars for optional features (webhooks, sandbox, etc.). */
  optional: string[];
  /** OAuth config — present only for connectors that support OAuth redirect flow. */
  oauth?: {
    clientIdVar: string;
    clientSecretVar: string;
  };
  /**
   * API-specific parameter name for pagination limit.
   * Used by the unified gateway to map `--limit N` to the correct param.
   * Examples: "max_results" (Google), "top" (Microsoft), "per_page" (GitHub).
   * If undefined or matches "limit", no renaming is needed.
   */
  limitParam?: string;
}

export const CONNECTOR_DEFS: ConnectorDef[] = [
  {
    name: "stripe",
    label: "Stripe",
    description: "Payments, subscriptions, invoices",
    required: ["STRIPE_SECRET_KEY"],
    optional: ["STRIPE_WEBHOOK_SECRET", "STRIPE_ACCESS_TOKEN", "STRIPE_REFRESH_TOKEN"],
    oauth: { clientIdVar: "STRIPE_OAUTH_CLIENT_ID", clientSecretVar: "STRIPE_SECRET_KEY" },
    // Stripe natively uses "limit" — no remapping needed
  },
  {
    name: "paypal",
    label: "PayPal",
    description: "Orders, subscriptions, payouts, invoices",
    required: ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET"],
    optional: ["PAYPAL_WEBHOOK_ID", "PAYPAL_SANDBOX"],
    limitParam: "page_size",
  },
  {
    name: "github",
    label: "GitHub",
    description: "Repos, issues, PRs, actions, releases",
    required: [["GITHUB_TOKEN", "GH_TOKEN"]],
    optional: ["GITHUB_WEBHOOK_SECRET"],
    oauth: { clientIdVar: "GITHUB_OAUTH_CLIENT_ID", clientSecretVar: "GITHUB_OAUTH_CLIENT_SECRET" },
    limitParam: "per_page",
  },
  {
    name: "twilio",
    label: "Twilio",
    description: "SMS, voice calls, WhatsApp",
    required: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"],
    optional: ["TWILIO_FROM_NUMBER"],
    // Twilio natively uses "limit" — no remapping needed
  },
  {
    name: "vercel",
    label: "Vercel",
    description: "Deployments, projects, domains",
    required: ["VERCEL_TOKEN"],
    optional: ["VERCEL_TEAM_ID", "VERCEL_REFRESH_TOKEN"],
    oauth: { clientIdVar: "VERCEL_OAUTH_CLIENT_ID", clientSecretVar: "VERCEL_OAUTH_CLIENT_SECRET" },
    // Vercel natively uses "limit" — no remapping needed
  },
  {
    name: "x",
    label: "X (Twitter)",
    description: "Tweets, users, DMs, timelines",
    required: [["X_BEARER_TOKEN", "TWITTER_BEARER_TOKEN"]],
    optional: ["X_API_KEY", "X_API_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_TOKEN_SECRET"],
    oauth: { clientIdVar: "X_OAUTH_CLIENT_ID", clientSecretVar: "X_OAUTH_CLIENT_SECRET" },
    limitParam: "max_results",
  },
  {
    name: "gdrive",
    label: "Google Drive",
    description: "Files, permissions, sharing",
    required: ["GDRIVE_ACCESS_TOKEN"],
    optional: [],
    oauth: { clientIdVar: "GDRIVE_OAUTH_CLIENT_ID", clientSecretVar: "GDRIVE_OAUTH_CLIENT_SECRET" },
    limitParam: "page_size",
  },
  {
    name: "onedrive",
    label: "OneDrive",
    description: "Files, folders, sharing",
    required: ["ONEDRIVE_ACCESS_TOKEN"],
    optional: [],
    oauth: { clientIdVar: "ONEDRIVE_OAUTH_CLIENT_ID", clientSecretVar: "ONEDRIVE_OAUTH_CLIENT_SECRET" },
    limitParam: "top",
  },
  {
    name: "gmail",
    label: "Gmail",
    description: "Email, labels, drafts, threads",
    required: ["GMAIL_ACCESS_TOKEN"],
    optional: [],
    oauth: { clientIdVar: "GMAIL_OAUTH_CLIENT_ID", clientSecretVar: "GMAIL_OAUTH_CLIENT_SECRET" },
    limitParam: "max_results",
  },
  {
    name: "outlook",
    label: "Outlook",
    description: "Email, folders, calendar",
    required: ["OUTLOOK_ACCESS_TOKEN"],
    optional: [],
    oauth: { clientIdVar: "OUTLOOK_OAUTH_CLIENT_ID", clientSecretVar: "OUTLOOK_OAUTH_CLIENT_SECRET" },
    limitParam: "top",
  },
];

/** Look up a connector definition by name. */
export function getConnectorDef(name: string): ConnectorDef | undefined {
  return CONNECTOR_DEFS.find((c) => c.name === name);
}

/** Check if a connector has all its required env vars set. */
export function isConnectorConfigured(name: string): boolean {
  const def = getConnectorDef(name);
  if (!def) return false;
  return def.required.every((entry) => {
    if (Array.isArray(entry)) {
      // Alternatives — any one of them suffices
      return entry.some((v) => !!process.env[v]);
    }
    return !!process.env[entry];
  });
}

/**
 * Get the primary env var name for a required slot.
 * For alternatives like ["GITHUB_TOKEN", "GH_TOKEN"], returns the first one.
 */
export function primaryVarName(entry: string | string[]): string {
  return Array.isArray(entry) ? entry[0]! : entry;
}

/**
 * Check if a required slot is satisfied.
 * For alternatives, returns true if any one is set.
 */
export function isSlotSet(entry: string | string[]): boolean {
  if (Array.isArray(entry)) {
    return entry.some((v) => !!process.env[v]);
  }
  return !!process.env[entry];
}

/**
 * Get display label for a required slot.
 * For alternatives, shows "VAR1 or VAR2".
 */
export function slotLabel(entry: string | string[]): string {
  if (Array.isArray(entry)) return entry.join(" or ");
  return entry;
}

// ---------------------------------------------------------------------------
// Action verbs — words that indicate a connector action, not a value/ID.
// Used to decide whether to join two positionals into resource.action format.
// ---------------------------------------------------------------------------

const ACTION_VERBS = new Set([
  "list", "get", "create", "update", "delete", "send", "cancel",
  "capture", "refund", "search", "retrieve", "make", "suspend",
  "activate", "resume", "pause", "remind", "export", "authorize",
  "finalize", "void", "verify", "merge", "trigger", "watch",
  "copy", "move", "rename", "share", "upload", "download",
  "add", "remove", "close", "reopen", "enable", "disable",
]);

// ---------------------------------------------------------------------------
// Method resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a connector method from CLI positional arguments.
 *
 * Supports both dot-notation and space-separated syntax:
 *
 *   ["customers.list"]              → method = "customers.list", rest = []
 *   ["customers", "list"]           → method = "customers.list", rest = []
 *   ["customers", "get", "cus_123"] → method = "customers.get",  rest = ["cus_123"]
 *   ["post", "Hello world"]         → method = "post",           rest = ["Hello world"]
 *   ["balance"]                     → method = "balance",         rest = []
 *
 * The second positional is joined with a dot only if it looks like an action verb
 * (list, get, create, etc.). Otherwise it's treated as a value and kept in rest.
 */
export function resolveMethod(positional: string[]): { method: string; rest: string[] } {
  if (positional.length === 0) return { method: "", rest: [] };

  const first = positional[0]!;

  // Already dot-notation → use as-is
  if (first.includes(".")) {
    return { method: first, rest: positional.slice(1) };
  }

  // Single positional → single-word method
  if (positional.length === 1) {
    return { method: first, rest: [] };
  }

  // Two+ positionals → join if second word is an action verb
  const second = positional[1]!;
  if (ACTION_VERBS.has(second.toLowerCase())) {
    return { method: `${first}.${second}`, rest: positional.slice(2) };
  }

  // Second positional is a value, not an action → single-word method
  return { method: first, rest: positional.slice(1) };
}

// ---------------------------------------------------------------------------
// Flag collection
// ---------------------------------------------------------------------------

/**
 * Collect all parsed flags into a params object for connector calls.
 *
 * - Strips `help` (already handled by the CLI command)
 * - Converts kebab-case keys to snake_case (connector convention)
 * - Numeric strings are kept as strings (connectors handle conversion)
 */
export function collectFlags(flags: Record<string, string | boolean>): Record<string, unknown> {
  const params: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(flags)) {
    if (key === "help") continue;

    // kebab-case → snake_case (API convention for most connectors)
    const snakeKey = key.replace(/-/g, "_");
    params[snakeKey] = value;
  }

  return params;
}
