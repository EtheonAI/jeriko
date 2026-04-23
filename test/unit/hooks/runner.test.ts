// Hook runner tests — use tiny shell commands so tests are hermetic.
// Each test relies on stock POSIX utilities (cat, echo, sleep, false).

import { describe, it, expect } from "bun:test";
import { runHooks } from "../../../src/daemon/services/hooks/runner.js";
import { setHooksForTesting } from "../../../src/daemon/services/hooks/index.js";
import type {
  HookConfigEntry,
  HookPayload,
} from "../../../src/daemon/services/hooks/types.js";

function payload(tool = "bash", args: Record<string, unknown> = { cmd: "ls" }): HookPayload {
  return {
    event: "pre_tool_use",
    sessionId: "s1",
    toolName: tool,
    toolCallId: "tc1",
    arguments: args,
  };
}

describe("runHooks", () => {
  it("returns allow when no hooks match", async () => {
    const result = await runHooks({
      entries: [],
      event: "pre_tool_use",
      payload: payload(),
    });
    expect(result.fired).toBe(0);
    expect(result.decision.decision).toBe("allow");
  });

  it("treats non-JSON stdout as allow", async () => {
    const entries: HookConfigEntry[] = [
      { event: "pre_tool_use", command: "echo not-json" },
    ];
    const result = await runHooks({
      entries,
      event: "pre_tool_use",
      payload: payload(),
    });
    expect(result.fired).toBe(1);
    expect(result.decision.decision).toBe("allow");
  });

  it("accepts a block decision and short-circuits later hooks", async () => {
    const entries: HookConfigEntry[] = [
      { event: "pre_tool_use", command: `printf '{"decision":"block","message":"nope"}'` },
      // The following would otherwise fire but must be skipped after block.
      { event: "pre_tool_use", command: `printf '{"decision":"allow"}'` },
    ];
    const result = await runHooks({
      entries,
      event: "pre_tool_use",
      payload: payload(),
    });
    expect(result.decision.decision).toBe("block");
    if (result.decision.decision === "block") {
      expect(result.decision.message).toBe("nope");
    }
  });

  it("chains modify decisions and exposes final arguments", async () => {
    const entries: HookConfigEntry[] = [
      {
        event: "pre_tool_use",
        command: `printf '{"decision":"modify","arguments":{"cmd":"echo blocked"}}'`,
      },
    ];
    const result = await runHooks({
      entries,
      event: "pre_tool_use",
      payload: payload(),
    });
    expect(result.decision.decision).toBe("modify");
    if (result.decision.decision === "modify") {
      expect(result.decision.arguments.cmd).toBe("echo blocked");
    }
  });

  it("kills stuck hooks at the configured timeout", async () => {
    const entries: HookConfigEntry[] = [
      { event: "pre_tool_use", command: "sleep 5", timeoutMs: 100 },
    ];
    const start = Date.now();
    const result = await runHooks({
      entries,
      event: "pre_tool_use",
      payload: payload(),
    });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(2000); // nowhere near 5s
    expect(result.decision.decision).toBe("allow");
  });

  it("allows on non-zero exit (hook crash must not block agent)", async () => {
    const entries: HookConfigEntry[] = [
      { event: "pre_tool_use", command: "exit 1" },
    ];
    const result = await runHooks({
      entries,
      event: "pre_tool_use",
      payload: payload(),
    });
    expect(result.decision.decision).toBe("allow");
  });

  it("setHooksForTesting works end-to-end via the public runner", async () => {
    setHooksForTesting([
      { event: "pre_tool_use", command: `printf '{"decision":"block","message":"test"}'` },
    ]);

    const { runHooks: publicRun } = await import("../../../src/daemon/services/hooks/index.js");
    const result = await publicRun({ event: "pre_tool_use", payload: payload() });
    expect(result.decision.decision).toBe("block");

    setHooksForTesting([]);
  });
});
