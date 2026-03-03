import { describe, expect, it } from "bun:test";
import { withTimeout, LLM_REQUEST_TIMEOUT_MS } from "../../src/daemon/agent/drivers/signal.js";

describe("withTimeout", () => {
  it("returns a timeout-only signal when no user signal is provided", () => {
    const signal = withTimeout(undefined, 1000);
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);
  });

  it("returns a signal that aborts after the timeout", async () => {
    const signal = withTimeout(undefined, 50);
    expect(signal.aborted).toBe(false);
    await new Promise((r) => setTimeout(r, 100));
    expect(signal.aborted).toBe(true);
  });

  it("returns a composite signal when user signal is provided", () => {
    const controller = new AbortController();
    const signal = withTimeout(controller.signal, 5000);
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);
  });

  it("aborts when the user signal aborts", () => {
    const controller = new AbortController();
    const signal = withTimeout(controller.signal, 60_000);
    expect(signal.aborted).toBe(false);
    controller.abort();
    expect(signal.aborted).toBe(true);
  });

  it("aborts when the timeout expires (even if user signal is active)", async () => {
    const controller = new AbortController();
    const signal = withTimeout(controller.signal, 50);
    expect(signal.aborted).toBe(false);
    await new Promise((r) => setTimeout(r, 100));
    expect(signal.aborted).toBe(true);
    // User signal is still alive — only the timeout fired
    expect(controller.signal.aborted).toBe(false);
  });

  it("returns an already-aborted signal if user signal was pre-aborted", () => {
    const controller = new AbortController();
    controller.abort();
    const signal = withTimeout(controller.signal, 60_000);
    expect(signal.aborted).toBe(true);
  });

  it("uses the default timeout constant when no timeoutMs is specified", () => {
    expect(LLM_REQUEST_TIMEOUT_MS).toBe(120_000);
    // Verify it accepts the default (doesn't throw)
    const signal = withTimeout(undefined);
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it("accepts a custom timeout value", async () => {
    const signal = withTimeout(undefined, 30);
    expect(signal.aborted).toBe(false);
    await new Promise((r) => setTimeout(r, 80));
    expect(signal.aborted).toBe(true);
  });
});
