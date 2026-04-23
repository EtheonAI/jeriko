/**
 * Live ollama smoke test.
 *
 * Hits the local ollama daemon (localhost:11434) through the LocalDriver,
 * sends a minimal prompt, and verifies streaming chunks + a completed
 * response arrive. Confirms the Subsystem 1–8 stack is wired correctly
 * end-to-end to a real language model.
 *
 * The test is GATED: if ollama isn't reachable, it skips cleanly. This
 * keeps CI green on machines without ollama while letting the author
 * (and any release engineer) run `bun test test/integration/ollama-live`
 * to validate against their running model.
 */

import { describe, test, expect } from "bun:test";
import { LocalDriver } from "../../src/daemon/agent/drivers/local.js";
import type { DriverConfig, DriverMessage, StreamChunk } from "../../src/daemon/agent/drivers/index.js";

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://localhost:11434";
const SMOKE_MODEL = process.env.OLLAMA_SMOKE_MODEL ?? "llama3.2:latest";
const TIMEOUT_MS = 60_000;

// ---------------------------------------------------------------------------
// Reachability probe
// ---------------------------------------------------------------------------

async function ollamaReachable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2_000);
    const response = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: controller.signal });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

async function smokeModelAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${OLLAMA_HOST}/api/tags`);
    if (!response.ok) return false;
    const body = (await response.json()) as { models?: Array<{ name: string }> };
    return (body.models ?? []).some((m) => m.name === SMOKE_MODEL);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

describe("live ollama smoke", () => {
  test("LocalDriver streams a response for a short prompt", async () => {
    if (!(await ollamaReachable())) {
      console.log("⚠ ollama not reachable at", OLLAMA_HOST, "— skipping live test");
      return;
    }
    if (!(await smokeModelAvailable())) {
      console.log("⚠ model", SMOKE_MODEL, "not available — skipping live test");
      return;
    }

    const driver = new LocalDriver();

    const messages: DriverMessage[] = [
      { role: "user", content: "Say 'hello from jeriko' and nothing else." },
    ];
    const config: DriverConfig = {
      model: SMOKE_MODEL,
      max_tokens: 64,
      temperature: 0,
    };

    let textReceived = "";
    let sawDone = false;
    let chunkCount = 0;

    const start = Date.now();
    for await (const chunk of driver.chat(messages, config)) {
      chunkCount++;
      if (chunk.type === "text") textReceived += chunk.content;
      if (chunk.type === "done") sawDone = true;
      if (Date.now() - start > TIMEOUT_MS) {
        throw new Error(`live test exceeded ${TIMEOUT_MS}ms`);
      }
    }

    expect(sawDone).toBe(true);
    expect(chunkCount).toBeGreaterThan(0);
    expect(textReceived.length).toBeGreaterThan(0);
    // Model should actually have responded with something that looks like
    // language output — not an empty success.
    expect(textReceived.trim().length).toBeGreaterThan(3);
  }, TIMEOUT_MS);
});
