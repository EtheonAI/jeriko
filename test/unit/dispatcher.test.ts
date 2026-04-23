import { describe, expect, it, spyOn, afterEach, beforeEach } from "bun:test";
import { VERSION } from "../../src/shared/version.js";

describe("dispatcher", () => {
  let exitSpy: ReturnType<typeof spyOn>;
  let logSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    exitSpy = spyOn(process, "exit").mockImplementation(() => { throw new Error("EXIT"); });
    logSpy = spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("--version prints a diagnostics line with version + build ref + platform and exits", async () => {
    const { dispatcher } = await import("../../src/cli/dispatcher.js");
    try {
      await dispatcher(["--version"]);
    } catch (e: any) {
      // Only swallow the EXIT error from our process.exit mock
      if (e?.message !== "EXIT") throw e;
    }
    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    // Format: `jeriko <version> (build <ref>) <platform>/<arch>` — see renderDiagnosticsLine
    expect(output).toContain(`jeriko ${VERSION}`);
    expect(output).toMatch(/\(build \S+\)/);
  });

  it("--help prints help and exits", async () => {
    const { dispatcher } = await import("../../src/cli/dispatcher.js");
    try {
      await dispatcher(["--help"]);
    } catch (e: any) {
      if (e?.message !== "EXIT") throw e;
    }
    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("Unix-first CLI toolkit");
    expect(output).toContain("Commands:");
  });
});
