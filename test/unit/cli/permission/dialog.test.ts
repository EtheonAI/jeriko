/**
 * Tests for PermissionDialog — per-kind rendering + theme reactivity.
 */

import { describe, test, expect } from "bun:test";
import React from "react";
import { render } from "ink-testing-library";

import { PermissionDialog } from "../../../../src/cli/permission/index.js";
import { ThemeProvider } from "../../../../src/cli/themes/index.js";
import type { PermissionRequest } from "../../../../src/cli/permission/index.js";

const ANSI = /\[[0-9;]*m/g;
function stripAnsi(s: string | undefined): string { return (s ?? "").replace(ANSI, ""); }

function wrap(node: React.ReactElement): React.ReactElement {
  return React.createElement(ThemeProvider, null, node);
}

function makeRequest(body: PermissionRequest["body"], overrides: Partial<PermissionRequest> = {}): PermissionRequest {
  return {
    id:        overrides.id        ?? "r-1",
    agent:     overrides.agent     ?? "agent:claude",
    sessionId: overrides.sessionId ?? "s-1",
    risk:      overrides.risk      ?? "medium",
    summary:   overrides.summary   ?? "Perform an action",
    issuedAt:  overrides.issuedAt  ?? Date.now(),
    body,
  };
}

// ---------------------------------------------------------------------------
// Kind coverage
// ---------------------------------------------------------------------------

describe("PermissionDialog renders each kind", () => {
  test("bash — shows command", () => {
    const request = makeRequest({ kind: "bash", command: "git push origin main", cwd: "/repo" });
    const { lastFrame } = render(wrap(React.createElement(PermissionDialog, { request })));
    const frame = stripAnsi(lastFrame());
    expect(frame).toContain("Run shell command?");
    expect(frame).toContain("git push origin main");
    expect(frame).toContain("/repo");
  });

  test("file-write — shows path + byteCount", () => {
    const request = makeRequest({ kind: "file-write", path: "/tmp/out.txt", byteCount: 2048 });
    const { lastFrame } = render(wrap(React.createElement(PermissionDialog, { request })));
    const frame = stripAnsi(lastFrame());
    expect(frame).toContain("Write file?");
    expect(frame).toContain("/tmp/out.txt");
    expect(frame).toContain("2,048");
  });

  test("file-edit — shows path + diff preview", () => {
    const request = makeRequest({ kind: "file-edit", path: "/src/app.ts", diffPreview: "- old\n+ new" });
    const { lastFrame } = render(wrap(React.createElement(PermissionDialog, { request })));
    const frame = stripAnsi(lastFrame());
    expect(frame).toContain("Edit file?");
    expect(frame).toContain("/src/app.ts");
    expect(frame).toContain("- old");
  });

  test("web-fetch — shows url + method", () => {
    const request = makeRequest({ kind: "web-fetch", url: "https://api.stripe.com/v1/charges", method: "POST" });
    const { lastFrame } = render(wrap(React.createElement(PermissionDialog, { request })));
    const frame = stripAnsi(lastFrame());
    expect(frame).toContain("Allow web request?");
    expect(frame).toContain("https://api.stripe.com/v1/charges");
    expect(frame).toContain("POST");
  });

  test("connector — shows id + method", () => {
    const request = makeRequest({ kind: "connector", connectorId: "stripe", method: "charges.create" });
    const { lastFrame } = render(wrap(React.createElement(PermissionDialog, { request })));
    const frame = stripAnsi(lastFrame());
    expect(frame).toContain("Call connector?");
    expect(frame).toContain("stripe");
    expect(frame).toContain("charges.create");
  });

  test("skill — shows id + scriptPath when present", () => {
    const request = makeRequest({ kind: "skill", skillId: "deploy-aws", scriptPath: "/skills/deploy-aws/run.sh" });
    const { lastFrame } = render(wrap(React.createElement(PermissionDialog, { request })));
    const frame = stripAnsi(lastFrame());
    expect(frame).toContain("Run skill?");
    expect(frame).toContain("deploy-aws");
    expect(frame).toContain("/skills/deploy-aws/run.sh");
  });
});

// ---------------------------------------------------------------------------
// Risk + hints
// ---------------------------------------------------------------------------

describe("PermissionDialog surfaces risk + hints", () => {
  test("risk label appears in the body", () => {
    const request = makeRequest(
      { kind: "bash", command: "rm -rf /" },
      { risk: "critical", summary: "dangerous" },
    );
    const { lastFrame } = render(wrap(React.createElement(PermissionDialog, { request })));
    const frame = stripAnsi(lastFrame());
    expect(frame).toContain("CRITICAL");
    expect(frame).toContain("dangerous");
  });

  test("every canonical keybinding hint is present", () => {
    const request = makeRequest({ kind: "bash", command: "echo hi" });
    const { lastFrame } = render(wrap(React.createElement(PermissionDialog, { request })));
    const frame = stripAnsi(lastFrame());
    for (const hint of ["y", "Shift+Y", "a", "n", "d", "Esc"]) {
      expect(frame).toContain(hint);
    }
  });
});

// ---------------------------------------------------------------------------
// Theme reactivity
// ---------------------------------------------------------------------------

describe("PermissionDialog is theme-reactive", () => {
  test("different themes produce different frames", () => {
    const request = makeRequest({ kind: "bash", command: "git status" });
    const element = React.createElement(PermissionDialog, { request });

    const dark = render(React.createElement(ThemeProvider, { initialTheme: "jeriko" }, element));
    const light = render(React.createElement(ThemeProvider, { initialTheme: "jeriko-light" }, element));
    try {
      expect(dark.lastFrame()).not.toBe(light.lastFrame());
    } finally {
      dark.unmount();
      light.unmount();
    }
  });
});
