// diagnostics tests — verify the facade shape + line renderer.

import { describe, it, expect } from "bun:test";
import { diagnosticsSnapshot, renderDiagnosticsLine } from "../../../src/shared/diagnostics.js";

describe("diagnosticsSnapshot", () => {
  const snap = diagnosticsSnapshot();

  it("exposes a version string", () => {
    expect(typeof snap.version).toBe("string");
    expect(snap.version.length).toBeGreaterThan(0);
  });

  it("exposes a build ref (falls back to 'unknown' in dev)", () => {
    expect(typeof snap.buildRef).toBe("string");
    expect(snap.buildRef.length).toBeGreaterThan(0);
  });

  it("describes the platform as <os>/<arch>", () => {
    expect(snap.platform).toMatch(/^(darwin|linux|win32|freebsd|openbsd|sunos|aix)\/(x64|arm64|ia32|arm|ppc64|s390x|mips|mipsel|riscv64)$/);
  });

  it("reports a uptimeMs that is monotonically non-negative", () => {
    expect(snap.uptimeMs).toBeGreaterThanOrEqual(0);
  });

  it("sets a recent now timestamp", () => {
    const drift = Math.abs(snap.now - Date.now());
    expect(drift).toBeLessThan(5000);
  });

  it("identifies the runtime", () => {
    expect(snap.runtime).toMatch(/^(bun|node)\//);
  });
});

describe("renderDiagnosticsLine", () => {
  it("renders the canonical one-liner", () => {
    const line = renderDiagnosticsLine();
    expect(line).toMatch(/^jeriko \S+ \(build \S+\) \S+\/\S+$/);
  });
});
