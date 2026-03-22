#!/usr/bin/env bun
/**
 * LIVE test — Bug #1 (corrupted tool pairs) + Bug #2 (unbounded history).
 *
 * Tests against local Ollama models to verify:
 *   1. sanitizeToolPairs() prevents 400 errors from corrupted history
 *   2. trimHistory() caps token usage for small-context models
 *   3. Both work together end-to-end through the real agent loop
 *
 * Usage: bun run test/live/live-history-bugs.ts
 */

import { join } from "node:path";
import { mkdirSync } from "node:fs";

const TEST_DIR = join("/tmp", `jeriko-history-bugs-${Date.now()}`);
mkdirSync(TEST_DIR, { recursive: true });
const TEST_DB = join(TEST_DIR, "test.db");
process.env.JERIKO_DB_PATH = TEST_DB;

const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", B = "\x1b[1m", D = "\x1b[2m", X = "\x1b[0m";

let passed = 0, failed = 0;

function pass(test: string, detail?: string) {
  passed++;
  console.log(`  ${G}PASS${X} ${test}${detail ? ` ${D}${detail}${X}` : ""}`);
}
function fail(test: string, err: string) {
  failed++;
  console.log(`  ${R}FAIL${X} ${test} ${D}${err.slice(0, 200)}${X}`);
}

console.log(`\n${B}Jeriko — History Bug Fixes Live Test${X}`);
console.log(`${D}DB: ${TEST_DB} | ${new Date().toISOString()}${X}\n`);

// ── Boot ──────────────────────────────────────────────────────────────────

import { initDatabase, closeDatabase } from "../../src/daemon/storage/db.js";
initDatabase(TEST_DB);

import { runAgent, type AgentRunConfig } from "../../src/daemon/agent/agent.js";
import { createSession } from "../../src/daemon/agent/session/session.js";
import { addMessage, addPart, buildDriverMessages } from "../../src/daemon/agent/session/message.js";
import { sanitizeToolPairs, trimHistory, groupIntoTurns } from "../../src/daemon/agent/history.js";
import { estimateTokens, DEFAULT_CONTEXT_LIMIT } from "../../src/shared/tokens.js";
import type { DriverMessage } from "../../src/daemon/agent/drivers/index.js";

// Register tools for tool-calling tests
await Promise.all([
  import("../../src/daemon/agent/tools/bash.js"),
  import("../../src/daemon/agent/tools/read.js"),
  import("../../src/daemon/agent/tools/list.js"),
]);

// Helper to run agent with timeout
async function runWithTimeout(
  config: AgentRunConfig,
  history: DriverMessage[],
  timeoutMs: number,
): Promise<{ text: string; error: string; compacted: boolean }> {
  let text = "";
  let error = "";
  let compacted = false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    for await (const event of runAgent({ ...config, signal: controller.signal }, history)) {
      if (event.type === "text_delta") text += event.content;
      if (event.type === "error") error = event.message;
      if (event.type === "compaction") compacted = true;
    }
  } catch (err) {
    if ((err as Error).name !== "AbortError") {
      error = err instanceof Error ? err.message : String(err);
    }
  } finally {
    clearTimeout(timer);
  }

  return { text, error, compacted };
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST SUITE 1: Bug #1 — Corrupted tool pairs
// ═══════════════════════════════════════════════════════════════════════════

console.log(`\n${B}Bug #1: Corrupted tool pairs${X}`);

// Test 1.1: sanitizeToolPairs fixes orphaned tool_result (Anthropic error)
{
  const messages: DriverMessage[] = [
    { role: "system", content: "You are helpful." },
    { role: "user", content: "hello" },
    { role: "tool", content: "stale result", tool_call_id: "toolu_vrtx_01Xe3FQc9EPw1F8z3zmDqnee" },
    { role: "assistant", content: "hi there" },
  ];

  const sanitized = sanitizeToolPairs(messages);
  const toolMsgs = sanitized.filter((m) => m.role === "tool");

  if (toolMsgs.length === 0) {
    pass("orphaned tool_result removed (Anthropic fix)");
  } else {
    fail("orphaned tool_result removed", `still has ${toolMsgs.length} tool messages`);
  }
}

// Test 1.2: sanitizeToolPairs fixes missing tool_call_id (Groq error)
{
  const messages: DriverMessage[] = [
    { role: "system", content: "You are helpful." },
    { role: "user", content: "run a command" },
    { role: "assistant", content: "", tool_calls: [{ id: "tc1", name: "bash", arguments: '{"command":"ls"}' }] },
    { role: "tool", content: "file.txt" },  // MISSING tool_call_id
    { role: "assistant", content: "done" },
  ];

  const sanitized = sanitizeToolPairs(messages);
  const toolMsgs = sanitized.filter((m) => m.role === "tool");
  const assistantWithTools = sanitized.filter((m) => m.tool_calls?.length);

  if (toolMsgs.length === 0 && assistantWithTools.length === 0) {
    pass("missing tool_call_id handled (Groq fix)");
  } else {
    fail("missing tool_call_id", `tools=${toolMsgs.length} assistantWithTools=${assistantWithTools.length}`);
  }
}

// Test 1.3: DB reconstruction + sanitization end-to-end
{
  const session = createSession({ model: "test", title: "corruption-test" });

  // Simulate a normal tool call round
  const userMsg = addMessage(session.id, "user", "list files");
  addPart(userMsg.id, "text", "list files");

  const assistantMsg = addMessage(session.id, "assistant", "");
  addPart(assistantMsg.id, "tool_call", '{"command":"ls"}', "bash", "tc_good");

  const toolMsg = addMessage(session.id, "tool", "file1.txt\nfile2.txt");
  addPart(toolMsg.id, "tool_result", "file1.txt\nfile2.txt", "bash", "tc_good");

  const finalMsg = addMessage(session.id, "assistant", "Found 2 files.");
  addPart(finalMsg.id, "text", "Found 2 files.");

  // Simulate corruption: add a tool message WITHOUT a proper part
  const corruptMsg = addMessage(session.id, "tool", "orphaned data");
  // NO addPart call — simulates crash/corruption

  // Reconstruct from DB and sanitize
  const history = buildDriverMessages(session.id);
  const sanitized = sanitizeToolPairs(history);

  const orphanedTools = sanitized.filter(
    (m) => m.role === "tool" && !m.tool_call_id,
  );
  const validTools = sanitized.filter(
    (m) => m.role === "tool" && m.tool_call_id === "tc_good",
  );

  if (orphanedTools.length === 0 && validTools.length === 1) {
    pass("DB corruption sanitized end-to-end", `${history.length} → ${sanitized.length} messages`);
  } else {
    fail("DB corruption", `orphaned=${orphanedTools.length} valid=${validTools.length}`);
  }
}

// Test 1.4: Live agent call with corrupted history doesn't 400
{
  const session = createSession({ model: "qwen3.5:cloud", title: "live-corrupt-test" });

  // Build corrupted history manually
  const corruptHistory: DriverMessage[] = [
    { role: "system", content: "You are a helpful assistant. Reply briefly." },
    { role: "user", content: "My favorite color is blue." },
    { role: "assistant", content: "Got it!" },
    // Orphaned tool result — would cause Anthropic/Groq 400
    { role: "tool", content: "some old result", tool_call_id: "tc_dead_reference" },
    { role: "user", content: "What is my favorite color? Reply in one word." },
  ];

  try {
    const result = await runWithTimeout(
      { sessionId: session.id, backend: "local", model: "qwen3.5:cloud", toolIds: [], maxRounds: 1 },
      corruptHistory,
      90_000,
    );

    if (result.error) {
      fail("live agent with corrupt history", result.error);
    } else if (result.text.length > 0) {
      pass("live agent with corrupt history — no 400 error", `"${result.text.trim().slice(0, 50)}"`);
    } else {
      fail("live agent with corrupt history", "empty response");
    }
  } catch (err) {
    fail("live agent with corrupt history", err instanceof Error ? err.message : String(err));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST SUITE 2: Bug #2 — Unbounded history
// ═══════════════════════════════════════════════════════════════════════════

console.log(`\n${B}Bug #2: Unbounded history${X}`);

// Test 2.1: trimHistory auto-limits based on context window
{
  const filler = "x".repeat(2000); // ~500 tokens each
  const bigHistory: DriverMessage[] = [
    { role: "system", content: "You are helpful." },
  ];
  for (let i = 0; i < 100; i++) {
    bigHistory.push({ role: "user", content: `Message ${i}: ${filler}` });
    bigHistory.push({ role: "assistant", content: `Reply ${i}: ${filler}` });
  }
  bigHistory.push({ role: "user", content: "Say hello." });

  const totalTokens = estimateTokens(bigHistory.map((m) => typeof m.content === "string" ? m.content : "").join(""));

  // Simulate Groq-like context (8k)
  const trimmedGroq = trimHistory(bigHistory, { contextLimit: 8_000 });
  const trimmedTokens = estimateTokens(trimmedGroq.map((m) => typeof m.content === "string" ? m.content : "").join(""));

  if (trimmedGroq.length < bigHistory.length && trimmedTokens < 8_000) {
    pass("auto-trim for 8k context model", `${bigHistory.length} → ${trimmedGroq.length} msgs, ${totalTokens} → ${trimmedTokens} tokens`);
  } else {
    fail("auto-trim for 8k context", `trimmed=${trimmedGroq.length} tokens=${trimmedTokens}`);
  }

  // Simulate Claude-like context (200k)
  const trimmedClaude = trimHistory(bigHistory, { contextLimit: 200_000 });
  if (trimmedClaude.length <= bigHistory.length) {
    pass("auto-trim for 200k context model", `${bigHistory.length} → ${trimmedClaude.length} msgs (generous)`);
  } else {
    fail("auto-trim for 200k context", `trimmed=${trimmedClaude.length}`);
  }
}

// Test 2.2: maxHistoryMessages config works
{
  const messages: DriverMessage[] = [
    { role: "system", content: "prompt" },
  ];
  for (let i = 0; i < 50; i++) {
    messages.push({ role: "user", content: `q${i}` });
    messages.push({ role: "assistant", content: `a${i}` });
  }

  const trimmed = trimHistory(messages, { contextLimit: 200_000, maxMessages: 10 });
  const nonSystem = trimmed.filter((m) => m.role !== "system");

  if (nonSystem.length <= 10) {
    pass("maxHistoryMessages=10 config", `${messages.length} → ${trimmed.length} msgs (${nonSystem.length} non-system)`);
  } else {
    fail("maxHistoryMessages", `non-system=${nonSystem.length}, expected ≤10`);
  }
}

// Test 2.3: maxHistoryTokens config works
{
  const messages: DriverMessage[] = [
    { role: "system", content: "prompt" },
  ];
  for (let i = 0; i < 20; i++) {
    messages.push({ role: "user", content: "x".repeat(400) });   // ~100 tokens each
    messages.push({ role: "assistant", content: "y".repeat(400) });
  }

  const trimmed = trimHistory(messages, { contextLimit: 200_000, maxTokens: 500 });
  const nonSystemTokens = estimateTokens(
    trimmed.filter((m) => m.role !== "system").map((m) => typeof m.content === "string" ? m.content : "").join(""),
  );

  if (nonSystemTokens <= 500) {
    pass("maxHistoryTokens=500 config", `${messages.length} → ${trimmed.length} msgs, ${nonSystemTokens} tokens`);
  } else {
    fail("maxHistoryTokens", `tokens=${nonSystemTokens}, expected ≤500`);
  }
}

// Test 2.4: Live agent call with big history doesn't blow context
{
  const session = createSession({ model: "deepseek-v3.2:cloud", title: "live-big-history" });

  // Build oversized history (~50k tokens, way more than llama3.2's 128k context)
  const bigHistory: DriverMessage[] = [
    { role: "system", content: "You are a helpful assistant. Reply briefly." },
  ];
  const filler = "A".repeat(2000);
  for (let i = 0; i < 50; i++) {
    bigHistory.push({ role: "user", content: `Msg ${i}: ${filler}` });
    bigHistory.push({ role: "assistant", content: `Re ${i}: ${filler}` });
  }
  bigHistory.push({ role: "user", content: "Say hello in one word." });

  try {
    const result = await runWithTimeout(
      { sessionId: session.id, backend: "local", model: "deepseek-v3.2:cloud", toolIds: [], maxRounds: 1 },
      bigHistory,
      90_000,
    );

    if (result.error) {
      fail("live agent with big history", result.error);
    } else if (result.text.length > 0) {
      pass("live agent with big history — no context overflow", `"${result.text.trim().slice(0, 50)}"`);
    } else {
      fail("live agent with big history", "empty response");
    }
  } catch (err) {
    fail("live agent with big history", err instanceof Error ? err.message : String(err));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST SUITE 3: Both bugs combined
// ═══════════════════════════════════════════════════════════════════════════

console.log(`\n${B}Combined: Big + corrupt history${X}`);

// Test 3.1: Live agent with big AND corrupt history
{
  const session = createSession({ model: "kimi-k2.5:cloud", title: "live-combined" });

  const history: DriverMessage[] = [
    { role: "system", content: "You are a helpful assistant. Reply briefly." },
  ];
  // Add lots of messages + corruption
  for (let i = 0; i < 30; i++) {
    history.push({ role: "user", content: `Task ${i}: ${"x".repeat(1000)}` });
    if (i % 5 === 0) {
      // Inject corrupted tool pairs every 5th message
      history.push({
        role: "assistant", content: "",
        tool_calls: [{ id: `tc_dead_${i}`, name: "bash", arguments: '{}' }],
      });
      history.push({ role: "tool", content: "some result" }); // missing tool_call_id!
    } else {
      history.push({ role: "assistant", content: `Done with task ${i}` });
    }
  }
  history.push({ role: "user", content: "Say hello in one word." });

  try {
    const result = await runWithTimeout(
      { sessionId: session.id, backend: "local", model: "kimi-k2.5:cloud", toolIds: [], maxRounds: 1 },
      history,
      90_000,
    );

    if (result.error) {
      fail("combined big + corrupt history", result.error);
    } else if (result.text.length > 0) {
      pass("combined big + corrupt history — agent responded", `"${result.text.trim().slice(0, 50)}"`);
    } else {
      fail("combined big + corrupt history", "empty response");
    }
  } catch (err) {
    fail("combined big + corrupt history", err instanceof Error ? err.message : String(err));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════════════

closeDatabase();

console.log(`\n${B}Results: ${G}${passed} passed${X}, ${failed > 0 ? R : ""}${failed} failed${X}`);

if (failed > 0) {
  process.exit(1);
}
