/**
 * Command classifier — tests the data-driven safe-command taxonomy.
 *
 * Three behaviours under test:
 *   1. Each rule in the default rule set correctly categorizes known
 *      read-only commands.
 *   2. Shell metacharacters short-circuit to `null` (unknown) regardless
 *      of whether the inner command would have matched a rule.
 *   3. The factory {@link createCommandClassifier} accepts a custom
 *      rule set so deployments can narrow or extend the baseline.
 */

import { describe, test, expect } from "bun:test";
import {
  DEFAULT_CLASSIFIER_RULES,
  createCommandClassifier,
  defaultClassifier,
  type ClassifierRule,
} from "../../../../src/daemon/exec/classifier.js";

describe("defaultClassifier — canonical read-only commands", () => {
  const readCases: ReadonlyArray<string> = [
    "ls",
    "ls -la",
    "ls -la /",
    "pwd",
    "cat package.json",
    "head -n 20 README.md",
    "wc -l src/index.ts",
    "git status",
    "git status -sb",
    "git log",
    "git log --oneline -20",
    "git diff HEAD~1",
    "git show HEAD",
    "git branch",
    "git remote -v",
    "git config --get user.email",
    "rg --glob '!*.md' foo",
    "grep -rn TODO src",
    "ps aux",
    "echo hello",
    "true",
    "node --version",
    "bun --version",
    "npm ls",
    "npm outdated",
    "jeriko --version",
    "jeriko sys",
  ];

  for (const cmd of readCases) {
    test(`"${cmd}" → read`, () => {
      expect(defaultClassifier.classify(cmd)).toBe("read");
    });
  }
});

describe("defaultClassifier — conservative nulls", () => {
  const unknownCases: ReadonlyArray<string> = [
    "",                              // empty
    "   ",                           // whitespace
    "ls | grep foo",                 // pipe
    "ls && pwd",                     // and-chain
    "ls > out.txt",                  // redirect
    "echo $HOME",                    // variable expansion
    "cat `file`",                    // command substitution
    "cat $(file)",                   // command substitution modern
    "git commit -m 'x'",             // mutating subcommand
    "git push",                      // mutating subcommand
    "rm -rf /",                      // clearly not read
    "curl https://example.com",      // network
    "nmap 127.0.0.1",                // not in rule set, ambiguous
    "made-up-binary --flag",         // unknown binary
  ];

  for (const cmd of unknownCases) {
    test(`"${cmd}" → null`, () => {
      expect(defaultClassifier.classify(cmd)).toBeNull();
    });
  }
});

describe("createCommandClassifier — custom rule set", () => {
  test("empty rule set forces every command to null", () => {
    const c = createCommandClassifier({ rules: [] });
    expect(c.classify("ls")).toBeNull();
    expect(c.classify("git status")).toBeNull();
  });

  test("custom rule overrides default taxonomy", () => {
    const custom: ClassifierRule[] = [
      { intent: "write", match: { kind: "exact", value: "ls" }, rationale: "test-only" },
    ];
    const c = createCommandClassifier({ rules: custom });
    expect(c.classify("ls")).toBe("write");
    // Commands not in the custom set still return null even if the
    // default rules would have matched them.
    expect(c.classify("pwd")).toBeNull();
  });

  test("prefix matcher matches whole-token only (no false positives)", () => {
    const c = createCommandClassifier({
      rules: [
        { intent: "read", match: { kind: "prefix", value: "git status" }, rationale: "t" },
      ],
    });
    expect(c.classify("git status")).toBe("read");
    expect(c.classify("git status -sb")).toBe("read");
    // Prefix must not match a longer bare word that happens to start
    // the same way: "git stat" is NOT "git status".
    expect(c.classify("git stat")).toBeNull();
    expect(c.classify("gitstatus")).toBeNull();
  });

  test("regex matcher respects the full command", () => {
    const c = createCommandClassifier({
      rules: [
        { intent: "read", match: { kind: "regex", value: /^node --version$/ }, rationale: "t" },
      ],
    });
    expect(c.classify("node --version")).toBe("read");
    expect(c.classify("node --version --help")).toBeNull();
    expect(c.classify("node -v")).toBeNull();
  });
});

describe("rule set integrity", () => {
  test("every default rule has a non-empty rationale (auditability)", () => {
    for (const rule of DEFAULT_CLASSIFIER_RULES) {
      expect(rule.rationale.trim().length).toBeGreaterThan(0);
    }
  });

  test("every default rule classifies to a known intent", () => {
    const known = new Set(["read", "write", "exec", "network", "system", "unknown"]);
    for (const rule of DEFAULT_CLASSIFIER_RULES) {
      expect(known.has(rule.intent)).toBe(true);
    }
  });
});
