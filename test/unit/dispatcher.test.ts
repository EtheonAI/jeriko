import { describe, expect, it, spyOn, afterEach, beforeEach } from "bun:test";

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

  it("--version prints version and exits", async () => {
    const { dispatcher } = await import("../../src/cli/dispatcher.js");
    try {
      await dispatcher(["--version"]);
    } catch { /* EXIT thrown by mock */ }
    expect(logSpy).toHaveBeenCalledWith("jeriko 2.0.0-alpha.0");
  });

  it("--help prints help and exits", async () => {
    const { dispatcher } = await import("../../src/cli/dispatcher.js");
    try {
      await dispatcher(["--help"]);
    } catch { /* EXIT thrown by mock */ }
    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("Unix-first CLI toolkit");
    expect(output).toContain("Commands:");
  });
});
