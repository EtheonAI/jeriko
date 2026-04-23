/**
 * Tests for flow types + toWizardConfig adapter.
 */

import { describe, test, expect } from "bun:test";
import { toWizardConfig } from "../../../../src/cli/flows/index.js";
import type { WizardFlow } from "../../../../src/cli/flows/index.js";

describe("toWizardConfig", () => {
  test("preserves title and steps", () => {
    const flow: WizardFlow<{ value: string }> = {
      id: "demo",
      title: "Demo",
      steps: [{ type: "text", message: "Say:" }],
      parseResults: (raw) => ({ value: raw[0] ?? "" }),
      onComplete: () => {},
    };
    const config = toWizardConfig(flow);
    expect(config.title).toBe("Demo");
    expect(config.steps.length).toBe(1);
  });

  test("engine onComplete parses raw results and calls flow.onComplete typed", async () => {
    let received: { value: string } | null = null;
    const flow: WizardFlow<{ value: string }> = {
      id: "demo",
      title: "Demo",
      steps: [{ type: "text", message: "Say:" }],
      parseResults: (raw) => ({ value: raw[0] ?? "" }),
      onComplete: (r) => { received = r; },
    };
    const config = toWizardConfig(flow);
    await config.onComplete(["hello"]);
    expect(received).toEqual({ value: "hello" });
  });

  test("parseResults errors route through onParseError, not onComplete", async () => {
    let completed = false;
    let captured: unknown = null;
    const flow: WizardFlow<{ value: string }> = {
      id: "demo",
      title: "Demo",
      steps: [{ type: "text", message: "Say:" }],
      parseResults: () => { throw new Error("bad"); },
      onComplete: () => { completed = true; },
      onParseError: (err) => { captured = err; },
    };
    await toWizardConfig(flow).onComplete(["x"]);
    expect(completed).toBe(false);
    expect((captured as Error).message).toBe("bad");
  });

  test("parseResults errors without onParseError are swallowed (no unhandled rejection)", async () => {
    const flow: WizardFlow<{ value: string }> = {
      id: "demo",
      title: "Demo",
      steps: [{ type: "text", message: "Say:" }],
      parseResults: () => { throw new Error("bad"); },
      onComplete: () => {},
    };
    // Just check it does not throw.
    await expect(toWizardConfig(flow).onComplete(["x"])).resolves.toBeUndefined();
  });
});
