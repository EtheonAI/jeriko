// Tests for the auto-background race wrapper. No DB or agent loop needed —
// just verifies the race semantics.

import { describe, it, expect } from "bun:test";
import {
  raceAutoBackground,
  clampAutoBackgroundMs,
} from "../../../src/daemon/agent/subagent/auto-background.js";
import {
  SUBAGENT_AUTO_BACKGROUND_MAX_MS,
  SUBAGENT_AUTO_BACKGROUND_MIN_MS,
  SUBAGENT_AUTO_BACKGROUND_MS,
  type SubagentAsyncLaunch,
  type SubagentCompletion,
} from "../../../src/daemon/agent/subagent/types.js";

function makeCompletion(ms: number): Promise<SubagentCompletion> {
  return new Promise((resolve) =>
    setTimeout(() => resolve({
      taskId: "t1",
      childSessionId: "s1",
      status: "completed",
      response: "done",
      tokensIn: 1,
      tokensOut: 1,
      durationMs: ms,
      mode: "sync",
    }), ms),
  );
}

const ACK: SubagentAsyncLaunch = {
  taskId: "t1",
  childSessionId: "s1",
  status: "async_launched",
  mode: "sync",
};

describe("clampAutoBackgroundMs", () => {
  it("returns the default when undefined", () => {
    expect(clampAutoBackgroundMs(undefined)).toBe(SUBAGENT_AUTO_BACKGROUND_MS);
  });

  it("returns 0 to disable the race", () => {
    expect(clampAutoBackgroundMs(0)).toBe(0);
  });

  it("clamps below the minimum to the minimum", () => {
    expect(clampAutoBackgroundMs(50)).toBe(SUBAGENT_AUTO_BACKGROUND_MIN_MS);
  });

  it("clamps above the maximum to the maximum", () => {
    expect(clampAutoBackgroundMs(1_000_000)).toBe(SUBAGENT_AUTO_BACKGROUND_MAX_MS);
  });

  it("passes values inside the range unchanged", () => {
    expect(clampAutoBackgroundMs(1500)).toBe(1500);
  });
});

describe("raceAutoBackground", () => {
  it("returns the sync completion when it finishes first", async () => {
    const outcome = await raceAutoBackground({
      completion: makeCompletion(30),
      thresholdMs: 500,
      onBackground: () => ACK,
    });
    expect(outcome.type).toBe("completed");
    if (outcome.type === "completed") {
      expect(outcome.completion.response).toBe("done");
    }
  });

  it("transitions to async when the timer wins", async () => {
    let hookCalled = false;
    const outcome = await raceAutoBackground({
      completion: makeCompletion(200),
      thresholdMs: 50,
      onBackground: () => { hookCalled = true; return ACK; },
    });
    expect(hookCalled).toBe(true);
    expect(outcome.type).toBe("backgrounded");
    if (outcome.type === "backgrounded") {
      expect(outcome.ack.status).toBe("async_launched");
    }
  });

  it("skips the race entirely when threshold=0", async () => {
    const outcome = await raceAutoBackground({
      completion: makeCompletion(20),
      thresholdMs: 0,
      onBackground: () => { throw new Error("should not fire"); },
    });
    expect(outcome.type).toBe("completed");
  });
});
