/**
 * Tests for the permission matcher — targetFor, targetMatches, evaluate.
 */

import { describe, test, expect } from "bun:test";
import {
  evaluate,
  targetFor,
  targetMatches,
} from "../../../../src/cli/permission/index.js";
import type {
  PermissionRequest,
  PermissionRule,
} from "../../../../src/cli/permission/index.js";

function req(partial: Partial<PermissionRequest> & { body: PermissionRequest["body"] }): PermissionRequest {
  return {
    id: partial.id ?? "req-1",
    agent: partial.agent ?? "cli",
    sessionId: partial.sessionId ?? "s-1",
    risk: partial.risk ?? "medium",
    summary: partial.summary ?? "test request",
    issuedAt: partial.issuedAt ?? Date.now(),
    body: partial.body,
  };
}

function rule(partial: Partial<PermissionRule> & Pick<PermissionRule, "kind" | "target" | "decision">): PermissionRule {
  return {
    kind: partial.kind,
    target: partial.target,
    decision: partial.decision,
    origin: partial.origin ?? "session",
  };
}

// ---------------------------------------------------------------------------
// targetFor
// ---------------------------------------------------------------------------

describe("targetFor", () => {
  test("bash → command", () => {
    expect(targetFor(req({ body: { kind: "bash", command: "git status" } }))).toBe("git status");
  });
  test("file-write → path", () => {
    expect(targetFor(req({ body: { kind: "file-write", path: "/tmp/out", byteCount: 10 } }))).toBe("/tmp/out");
  });
  test("file-edit → path", () => {
    expect(targetFor(req({ body: { kind: "file-edit", path: "/src/x.ts", diffPreview: "…" } }))).toBe("/src/x.ts");
  });
  test("web-fetch → url", () => {
    expect(targetFor(req({ body: { kind: "web-fetch", url: "https://api.example.com/v1", method: "GET" } }))).toBe("https://api.example.com/v1");
  });
  test("connector → id:method", () => {
    expect(targetFor(req({ body: { kind: "connector", connectorId: "stripe", method: "charges.list" } }))).toBe("stripe:charges.list");
  });
  test("skill → id", () => {
    expect(targetFor(req({ body: { kind: "skill", skillId: "deploy-aws" } }))).toBe("deploy-aws");
  });
});

// ---------------------------------------------------------------------------
// targetMatches
// ---------------------------------------------------------------------------

describe("targetMatches", () => {
  test("empty rule target is a wildcard for the kind", () => {
    expect(targetMatches(rule({ kind: "bash", target: "", decision: "allow" }), "git status")).toBe(true);
  });
  test("prefix match succeeds", () => {
    expect(targetMatches(rule({ kind: "bash", target: "git ", decision: "allow" }), "git status")).toBe(true);
  });
  test("non-prefix fails", () => {
    expect(targetMatches(rule({ kind: "bash", target: "git ", decision: "allow" }), "npm install")).toBe(false);
  });
  test("exact match succeeds", () => {
    expect(targetMatches(rule({ kind: "skill", target: "deploy", decision: "allow" }), "deploy")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// evaluate — precedence
// ---------------------------------------------------------------------------

describe("evaluate", () => {
  const bashReq = req({ body: { kind: "bash", command: "git push origin main" } });

  test("no rules → null", () => {
    expect(evaluate({ request: bashReq, sessionRules: [], persistentRules: [] })).toBeNull();
  });

  test("session allow → 'allow'", () => {
    const result = evaluate({
      request: bashReq,
      sessionRules: [rule({ kind: "bash", target: "git ", decision: "allow" })],
      persistentRules: [],
    });
    expect(result).toBe("allow");
  });

  test("persistent allow → 'allow'", () => {
    const result = evaluate({
      request: bashReq,
      sessionRules: [],
      persistentRules: [rule({ kind: "bash", target: "git ", decision: "allow", origin: "persistent" })],
    });
    expect(result).toBe("allow");
  });

  test("deny overrides allow at the same tier", () => {
    const result = evaluate({
      request: bashReq,
      sessionRules: [
        rule({ kind: "bash", target: "git ",           decision: "allow" }),
        rule({ kind: "bash", target: "git push",       decision: "deny"  }),
      ],
      persistentRules: [],
    });
    expect(result).toBe("deny");
  });

  test("persistent deny beats session allow", () => {
    const result = evaluate({
      request: bashReq,
      sessionRules: [rule({ kind: "bash", target: "git push", decision: "allow" })],
      persistentRules: [rule({ kind: "bash", target: "git ",  decision: "deny", origin: "persistent" })],
    });
    expect(result).toBe("deny");
  });

  test("unrelated kind does not match", () => {
    const webReq = req({ body: { kind: "web-fetch", url: "https://x.test", method: "GET" } });
    expect(evaluate({
      request: webReq,
      sessionRules: [rule({ kind: "bash", target: "git ", decision: "allow" })],
      persistentRules: [],
    })).toBeNull();
  });

  test("specificity: longer target wins at same tier", () => {
    // Allow broad + deny specific → should deny (specific wins).
    const result = evaluate({
      request: bashReq,
      sessionRules: [
        rule({ kind: "bash", target: "",               decision: "allow" }),
        rule({ kind: "bash", target: "git push origin", decision: "deny"  }),
      ],
      persistentRules: [],
    });
    expect(result).toBe("deny");
  });
});
