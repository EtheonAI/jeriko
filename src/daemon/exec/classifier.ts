// Command classifier — decides whether a shell command is unambiguously
// read-only so the permission broker can auto-approve it without
// nagging the user.
//
// Scope (what this module DOES)
// =============================
//   • Maps a command string to a typed {@link CommandIntent}.
//   • Owns the canonical taxonomy: read, write, exec, network, system,
//     unknown.
//   • Ships a default rule set of well-known read-only commands. The
//     rule set is data, not code — callers can extend or replace it by
//     constructing a new {@link CommandClassifier}.
//
// Scope (what this module does NOT do)
// ====================================
//   • It does not make permission decisions. The classifier's output
//     is one input among several to the broker's `shouldAsk` predicate
//     (risk level, policy, user overrides are others).
//   • It does not parse shell syntax. A command that uses pipes,
//     substitutions, or chained operators is treated as unknown — the
//     conservative default — because a full shell parse is fragile
//     and the classifier's only job is to recognize the obvious safe
//     cases.
//   • It does not execute commands. Pure function, no I/O.
//
// Safety invariant
// ================
// `null` is returned whenever the classifier is *not sure*. Callers
// convert `null` to the high-friction path (prompt the user). Adding
// a command to the read-safe rule set is a privilege escalation — do
// it intentionally.

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Coarse intent inferred from a command. Ordered by increasing danger:
 *
 *   • read     — inspects local state without modifying it (`ls`, `cat`).
 *   • write    — mutates local state (`touch`, `mkdir`).
 *   • exec     — runs an arbitrary program whose effects aren't known.
 *   • network  — contacts a remote host (`curl`, `wget`, `ssh`, …).
 *   • system   — touches system-wide resources or privileged paths
 *                (`sudo`, `systemctl`, `launchctl`).
 *   • unknown  — the classifier can't decide; treat as unsafe.
 */
export type CommandIntent =
  | "read"
  | "write"
  | "exec"
  | "network"
  | "system"
  | "unknown";

/**
 * A single classification rule. The command's first token (or the
 * whole first clause for multi-word matchers) is compared against
 * `match`; on success the rule's `intent` is the verdict.
 *
 * `match` is a discriminated union so rule authoring is explicit:
 *
 *   • `{ kind: "exact", value: "ls" }`      matches only when the first
 *                                           token is exactly `ls`.
 *   • `{ kind: "prefix", value: "git log" }`matches any command whose
 *                                           head starts with `git log`
 *                                           (covers `git log --oneline`,
 *                                           etc.).
 *   • `{ kind: "regex", value: /…/ }`       matches the full command
 *                                           string; used sparingly for
 *                                           patterns that don't fit
 *                                           exact/prefix.
 */
export type ClassifierRule = {
  readonly intent: CommandIntent;
  readonly match:
    | { readonly kind: "exact"; readonly value: string }
    | { readonly kind: "prefix"; readonly value: string }
    | { readonly kind: "regex"; readonly value: RegExp };
  /** One-line rationale so future readers can judge safety quickly. */
  readonly rationale: string;
};

export interface CommandClassifier {
  /**
   * Classify a command string. Returns `null` when the command can't
   * be safely categorized (complex shell, unknown binary, ambiguous
   * arguments) — callers should treat null as "not safe".
   */
  classify(command: string): CommandIntent | null;
  /** The active rule set. Exposed for tests and `/status` introspection. */
  readonly rules: readonly ClassifierRule[];
}

export interface CommandClassifierOptions {
  /** Override the rule set. When omitted, {@link DEFAULT_CLASSIFIER_RULES} is used. */
  readonly rules?: readonly ClassifierRule[];
}

// ---------------------------------------------------------------------------
// Default rule set
// ---------------------------------------------------------------------------

/**
 * Shell metacharacters that defeat classification. Any command containing
 * one of these is reported as "unknown" because we'd need a real shell
 * parser to know what the inner command actually is.
 */
const COMPLEX_SHELL_METACHARS = /[|&;`$(){}<>]/;

/**
 * Built-in rule set. Every entry is a well-known read-only command
 * shipped by POSIX userspace or git, curated to minimise user friction
 * on truly safe invocations (listing files, printing contents, reading
 * version control state) while staying conservative about anything with
 * side effects.
 *
 * To extend: prefer adding a rule here and submitting as PR rather than
 * shipping an ad-hoc override — that keeps the baseline surface
 * auditable. Runtime overrides are supported via
 * {@link CommandClassifierOptions.rules} for bespoke deployments.
 */
export const DEFAULT_CLASSIFIER_RULES: readonly ClassifierRule[] = [
  // File inspection
  { intent: "read", match: { kind: "exact", value: "ls" }, rationale: "directory listing" },
  { intent: "read", match: { kind: "exact", value: "pwd" }, rationale: "print working directory" },
  { intent: "read", match: { kind: "exact", value: "whoami" }, rationale: "print current user" },
  { intent: "read", match: { kind: "exact", value: "id" }, rationale: "print user identity" },
  { intent: "read", match: { kind: "exact", value: "cat" }, rationale: "print file contents" },
  { intent: "read", match: { kind: "exact", value: "head" }, rationale: "print file head" },
  { intent: "read", match: { kind: "exact", value: "tail" }, rationale: "print file tail" },
  { intent: "read", match: { kind: "exact", value: "file" }, rationale: "identify file type" },
  { intent: "read", match: { kind: "exact", value: "stat" }, rationale: "print file stats" },
  { intent: "read", match: { kind: "exact", value: "wc" }, rationale: "count lines/words/bytes" },
  { intent: "read", match: { kind: "exact", value: "find" }, rationale: "locate files" },
  { intent: "read", match: { kind: "exact", value: "tree" }, rationale: "print directory tree" },
  { intent: "read", match: { kind: "exact", value: "du" }, rationale: "disk usage (read-only)" },
  { intent: "read", match: { kind: "exact", value: "df" }, rationale: "filesystem usage" },

  // Text search
  { intent: "read", match: { kind: "exact", value: "grep" }, rationale: "text search" },
  { intent: "read", match: { kind: "exact", value: "rg" }, rationale: "ripgrep text search" },
  { intent: "read", match: { kind: "exact", value: "ag" }, rationale: "the silver searcher" },
  { intent: "read", match: { kind: "exact", value: "awk" }, rationale: "text processor (stdout only)" },
  { intent: "read", match: { kind: "exact", value: "sed" }, rationale: "text transform (stdout only when no -i)" },

  // Version control — read-only subcommands only. `git` alone or any
  // mutating subcommand (`commit`, `push`, `reset`) falls through to
  // unknown and gets prompted.
  { intent: "read", match: { kind: "prefix", value: "git status" }, rationale: "git working tree status" },
  { intent: "read", match: { kind: "prefix", value: "git log" }, rationale: "git commit log" },
  { intent: "read", match: { kind: "prefix", value: "git diff" }, rationale: "git diff (read-only)" },
  { intent: "read", match: { kind: "prefix", value: "git show" }, rationale: "git object inspection" },
  { intent: "read", match: { kind: "prefix", value: "git branch" }, rationale: "list branches (when no args)" },
  { intent: "read", match: { kind: "prefix", value: "git blame" }, rationale: "blame a file" },
  { intent: "read", match: { kind: "prefix", value: "git remote -v" }, rationale: "list remotes" },
  { intent: "read", match: { kind: "prefix", value: "git config --get" }, rationale: "read git config" },
  { intent: "read", match: { kind: "prefix", value: "git rev-parse" }, rationale: "resolve git refs" },
  { intent: "read", match: { kind: "prefix", value: "git describe" }, rationale: "describe commit" },
  { intent: "read", match: { kind: "prefix", value: "git reflog" }, rationale: "reflog inspection" },
  { intent: "read", match: { kind: "prefix", value: "git ls-files" }, rationale: "list tracked files" },
  { intent: "read", match: { kind: "prefix", value: "git ls-tree" }, rationale: "list tree objects" },

  // Process / system introspection
  { intent: "read", match: { kind: "exact", value: "ps" }, rationale: "process list" },
  { intent: "read", match: { kind: "exact", value: "top" }, rationale: "process monitor (read-only UI)" },
  { intent: "read", match: { kind: "exact", value: "uname" }, rationale: "kernel info" },
  { intent: "read", match: { kind: "exact", value: "uptime" }, rationale: "system uptime" },
  { intent: "read", match: { kind: "exact", value: "hostname" }, rationale: "print hostname" },
  { intent: "read", match: { kind: "exact", value: "date" }, rationale: "print date/time" },
  { intent: "read", match: { kind: "exact", value: "env" }, rationale: "print environment (sanitized)" },
  { intent: "read", match: { kind: "exact", value: "printenv" }, rationale: "print environment (sanitized)" },
  { intent: "read", match: { kind: "exact", value: "which" }, rationale: "locate binary" },
  { intent: "read", match: { kind: "exact", value: "type" }, rationale: "command type lookup" },
  { intent: "read", match: { kind: "exact", value: "command" }, rationale: "command lookup (-v)" },

  // Language/tool introspection
  { intent: "read", match: { kind: "regex", value: /^(node|bun|python3?|ruby|go|rustc|cargo)\s+--version\s*$/ },
    rationale: "version probe" },
  { intent: "read", match: { kind: "regex", value: /^(npm|pnpm|yarn|bun)\s+(ls|list|outdated|why|view|info)\b/ },
    rationale: "package manager read-only" },
  { intent: "read", match: { kind: "regex", value: /^jeriko\s+(sys|help|version|--version|--help)\b/ },
    rationale: "jeriko read-only introspection" },

  // `echo` is intent=read because it's stdout-only; no file touch.
  { intent: "read", match: { kind: "exact", value: "echo" }, rationale: "print argument (stdout only)" },
  { intent: "read", match: { kind: "exact", value: "true" }, rationale: "no-op success" },
  { intent: "read", match: { kind: "exact", value: "false" }, rationale: "no-op failure" },
];

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Construct a command classifier. The default rule set is sufficient
 * for the CLI broker; tests and specialised deployments can pass a
 * narrower rule set (e.g. an empty one to force every command to
 * prompt).
 */
export function createCommandClassifier(
  options: CommandClassifierOptions = {},
): CommandClassifier {
  const rules = options.rules ?? DEFAULT_CLASSIFIER_RULES;

  const classify = (command: string): CommandIntent | null => {
    const trimmed = command.trim();
    if (trimmed.length === 0) return null;

    // Refuse to classify commands that rely on shell metacharacters —
    // a real shell parser would be required to know what's actually
    // being executed, and we deliberately don't ship one.
    if (COMPLEX_SHELL_METACHARS.test(trimmed)) return null;

    const head = trimmed.split(/\s+/, 1)[0]!;

    for (const rule of rules) {
      if (matches(rule.match, trimmed, head)) {
        return rule.intent;
      }
    }
    return null;
  };

  return { classify, rules };
}

function matches(
  match: ClassifierRule["match"],
  full: string,
  head: string,
): boolean {
  switch (match.kind) {
    case "exact":
      return head === match.value;
    case "prefix":
      // Match whole tokens only so `git stat` doesn't match `git status` and vice versa.
      return full === match.value || full.startsWith(`${match.value} `);
    case "regex":
      return match.value.test(full);
  }
}

// ---------------------------------------------------------------------------
// Module-scope default instance
// ---------------------------------------------------------------------------

/**
 * Shared classifier used by the broker in production. Tests and the
 * CLI unit suite should construct their own instance via
 * {@link createCommandClassifier} so they don't depend on module state.
 */
export const defaultClassifier: CommandClassifier = createCommandClassifier();
