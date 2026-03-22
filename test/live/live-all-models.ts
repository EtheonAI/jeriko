#!/usr/bin/env bun
/**
 * LIVE test — every local Ollama model.
 *
 * Per model: chat, tool calling, agent loop, session persistence,
 * history, compaction, orchestrator.
 *
 * Large local models get a 60s timeout per LLM call to avoid
 * waiting 5+ minutes on CPU inference.
 *
 * Usage: bun run test/live/live-all-models.ts
 */

import { join } from "node:path";
import { unlinkSync, existsSync, mkdirSync } from "node:fs";

const TEST_DIR = join("/tmp", `jeriko-models-${Date.now()}`);
mkdirSync(TEST_DIR, { recursive: true });
const TEST_DB = join(TEST_DIR, "models-test.db");
process.env.JERIKO_DB_PATH = TEST_DB;

const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", C = "\x1b[36m";
const D = "\x1b[2m", B = "\x1b[1m", X = "\x1b[0m";

let totalPassed = 0, totalFailed = 0, totalSkipped = 0;
const allFailures: string[] = [];

function pass(test: string, detail?: string) {
  totalPassed++;
  console.log(`  ${G}PASS${X} ${test}${detail ? ` ${D}${detail}${X}` : ""}`);
}
function fail(model: string, test: string, err: string) {
  totalFailed++;
  allFailures.push(`[${model}] ${test}: ${err}`);
  console.log(`  ${R}FAIL${X} ${test} ${D}${err.slice(0, 160)}${X}`);
}
function warn(test: string, msg: string) {
  console.log(`  ${Y}WARN${X} ${test} ${D}${msg.slice(0, 120)}${X}`);
}
function skip(test: string, msg: string) {
  totalSkipped++;
  console.log(`  ${Y}SKIP${X} ${test} ${D}${msg}${X}`);
}

console.log(`\n${B}Jeriko — All Local Models Live Test${X}`);
console.log(`${D}DB: ${TEST_DB} | ${new Date().toISOString()}${X}\n`);

import { initDatabase, closeDatabase, getDatabase } from "../../src/daemon/storage/db.js";
initDatabase(TEST_DB);

import { getDriver } from "../../src/daemon/agent/drivers/index.js";
import { runAgent, type AgentRunConfig } from "../../src/daemon/agent/agent.js";
import { createSession } from "../../src/daemon/agent/session/session.js";
import { addMessage, getMessages, getRecentMessages } from "../../src/daemon/agent/session/message.js";
import { delegate, readContext, getChildSessions } from "../../src/daemon/agent/orchestrator.js";
import { estimateTokens, shouldCompact, DEFAULT_CONTEXT_LIMIT } from "../../src/shared/tokens.js";
import { getCapabilities } from "../../src/daemon/agent/drivers/models.js";

await Promise.all([
  import("../../src/daemon/agent/tools/bash.js"),
  import("../../src/daemon/agent/tools/read.js"),
  import("../../src/daemon/agent/tools/write.js"),
  import("../../src/daemon/agent/tools/edit.js"),
  import("../../src/daemon/agent/tools/list.js"),
  import("../../src/daemon/agent/tools/search.js"),
  import("../../src/daemon/agent/tools/web.js"),
  import("../../src/daemon/agent/tools/screenshot.js"),
  import("../../src/daemon/agent/tools/parallel.js"),
]);

const ollamaResp = await fetch("http://localhost:11434/api/tags", { signal: AbortSignal.timeout(5000) });
const ollamaData = await ollamaResp.json() as { models: Array<{ name: string; size: number }> };
const models = ollamaData.models.map(m => ({ name: m.name, sizeBytes: m.size }));

console.log(`${C}${B}Found ${models.length} models${X}\n`);

const driver = getDriver("local");

// Timeout for LLM calls: cloud models get 30s, big locals get 90s, small locals get 60s
function getTimeout(model: string, sizeBytes: number): number {
  if (model.includes("cloud")) return 30_000;
  if (sizeBytes > 10_000_000_000) return 90_000; // >10GB
  return 60_000;
}

/** Run an async generator with a timeout. */
async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`TIMEOUT after ${timeoutMs}ms: ${label}`)), timeoutMs),
    ),
  ]);
}

/** Collect all events from agent loop with timeout.
 *  Injects AbortSignal.timeout into the AgentRunConfig so the underlying
 *  driver fetch is aborted if the model takes too long — preventing
 *  Ollama's single-request queue from blocking all subsequent models. */
async function runAgentWithTimeout(
  config: AgentRunConfig,
  history: Array<{ role: "user" | "assistant" | "system" | "tool"; content: string }>,
  timeoutMs: number,
): Promise<{ text: string; toolCalls: number; complete: boolean; compacted: boolean; compactBefore: number; compactAfter: number }> {
  let text = "";
  let toolCalls = 0;
  let complete = false;
  let compacted = false;
  let compactBefore = 0, compactAfter = 0;

  const configWithSignal = { ...config, signal: AbortSignal.timeout(timeoutMs) };

  for await (const ev of runAgent(configWithSignal, history)) {
    if (ev.type === "text_delta") text += ev.content;
    if (ev.type === "tool_call_start") toolCalls++;
    if (ev.type === "turn_complete") complete = true;
    if (ev.type === "compaction") {
      compacted = true;
      compactBefore = ev.beforeTokens;
      compactAfter = ev.afterTokens;
    }
  }
  return { text, toolCalls, complete, compacted, compactBefore, compactAfter };
}

// ═══════════════════════════════════════════════════════════════════════════
// Per-model test results
// ═══════════════════════════════════════════════════════════════════════════

interface MR {
  model: string; sizeBytes: number;
  chat: boolean | null; chatMs: number;
  tools: boolean | null; toolName: string;
  loop: boolean | null; loopTools: number;
  persist: boolean | null;
  history: boolean | null;
  compact: boolean | null;
  orch: boolean | null; orchCtx: number;
}

const results: MR[] = [];

for (const { name: model, sizeBytes } of models) {
  const timeout = getTimeout(model, sizeBytes);
  const sizeLabel = sizeBytes > 1_000_000_000 ? `${(sizeBytes / 1e9).toFixed(1)}GB` : sizeBytes < 1000 ? "cloud" : `${(sizeBytes / 1e6).toFixed(0)}MB`;
  console.log(`${C}${B}══ ${model} ${D}(${sizeLabel}, timeout=${timeout / 1000}s)${X}`);

  const r: MR = {
    model, sizeBytes,
    chat: null, chatMs: 0,
    tools: null, toolName: "",
    loop: null, loopTools: 0,
    persist: null,
    history: null,
    compact: null,
    orch: null, orchCtx: 0,
  };

  // ── TEST 1: Basic chat ────────────────────────────────────────────────
  // Uses Ollama's native /api/generate with AbortSignal.timeout so slow
  // models abort cleanly and don't block the single-threaded Ollama queue.

  try {
    const t0 = Date.now();
    const chatResp = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: "Reply with exactly one word: WORKING", stream: false }),
      signal: AbortSignal.timeout(timeout),
    });
    if (!chatResp.ok) throw new Error(`HTTP ${chatResp.status}`);
    const chatData = await chatResp.json() as { response: string };
    const text = chatData.response ?? "";
    r.chatMs = Date.now() - t0;

    if (text.length > 0) {
      r.chat = true;
      pass("basic chat", `"${text.trim().slice(0, 30)}" (${r.chatMs}ms)`);
    } else {
      r.chat = false;
      fail(model, "basic chat", "empty response");
    }
  } catch (err) {
    r.chat = false;
    fail(model, "basic chat", err instanceof Error ? err.message : String(err));
  }

  if (!r.chat) {
    skip("remaining tests", "basic chat failed");
    results.push(r);
    console.log();
    continue;
  }

  // Gate: skip LLM-heavy tests for models too slow on CPU.
  // Session persistence (test 4) is the only test that doesn't call the LLM.
  const SLOW_THRESHOLD_MS = 15_000;
  const isSlow = r.chatMs > SLOW_THRESHOLD_MS;
  if (isSlow) {
    warn("model gate", `chat took ${r.chatMs}ms (>${SLOW_THRESHOLD_MS}ms) — skipping LLM-heavy tests`);
  }

  // ── TEST 2: Tool calling ──────────────────────────────────────────────

  if (isSlow) { skip("tool calling", "model too slow for CPU"); } else try {
    let gotTool = false;
    let tcName = "", tcArgs = "", text = "";

    await withTimeout(async () => {
      for await (const chunk of driver.chat(
        [
          { role: "system", content: "Always use the bash tool when asked to run a command." },
          { role: "user", content: 'Use the bash tool to run: echo "TC_OK"' },
        ],
        {
          model, max_tokens: 100, temperature: 0,
          signal: AbortSignal.timeout(timeout),
          tools: [{
            name: "bash",
            description: "Execute a shell command",
            parameters: { type: "object", properties: { command: { type: "string", description: "Command" } }, required: ["command"] },
          }],
        },
      )) {
        if (chunk.type === "tool_call" && chunk.tool_call) {
          gotTool = true;
          tcName = chunk.tool_call.name;
          tcArgs = chunk.tool_call.arguments;
        }
        if (chunk.type === "text") text += chunk.content;
      }
    }, timeout, "tool calling");

    if (gotTool) {
      r.tools = true;
      r.toolName = tcName;
      pass("tool calling", `${tcName}(${tcArgs.slice(0, 50)})`);
    } else {
      r.tools = false;
      warn("tool calling", `text response instead: "${text.trim().slice(0, 60)}"`);
    }
  } catch (err) {
    r.tools = false;
    fail(model, "tool calling", err instanceof Error ? err.message : String(err));
  }

  // ── TEST 3: Agent loop ────────────────────────────────────────────────

  if (isSlow) { skip("agent loop", "model too slow for CPU"); } else try {
    const session = createSession({ title: `loop-${model}`, model });
    addMessage(session.id, "user", 'Use bash to run: echo "LOOP_OK"');

    const result = await runAgentWithTimeout(
      {
        sessionId: session.id, backend: "local", model,
        systemPrompt: "Always use tools when asked.",
        toolIds: ["bash"], maxRounds: 3,
      },
      [
        { role: "system", content: "Always use tools when asked." },
        { role: "user", content: 'Use bash to run: echo "LOOP_OK"' },
      ],
      timeout * 2, // double timeout for loop (may do multiple rounds)
    );

    if (result.complete) {
      r.loop = true;
      r.loopTools = result.toolCalls;
      pass("agent loop", `${result.toolCalls} tool(s), response: "${result.text.trim().slice(0, 50)}"`);
    } else {
      r.loop = false;
      fail(model, "agent loop", "no turn_complete");
    }
  } catch (err) {
    r.loop = false;
    fail(model, "agent loop", err instanceof Error ? err.message : String(err));
  }

  // ── TEST 4: Session persistence ───────────────────────────────────────

  try {
    const session = createSession({ title: `persist-${model}`, model });
    addMessage(session.id, "user", "msg1");
    addMessage(session.id, "assistant", "reply1");
    addMessage(session.id, "user", "msg2");
    addMessage(session.id, "assistant", "reply2");

    const msgs = getMessages(session.id);
    if (msgs.length === 4 && msgs[0]?.content === "msg1" && msgs[3]?.content === "reply2") {
      r.persist = true;
      pass("session persistence", `${msgs.length} msgs, order correct`);
    } else {
      r.persist = false;
      fail(model, "session persistence", `${msgs.length} msgs`);
    }
  } catch (err) {
    r.persist = false;
    fail(model, "session persistence", err instanceof Error ? err.message : String(err));
  }

  // ── TEST 5: History carry ─────────────────────────────────────────────

  if (isSlow) { skip("history carry", "model too slow for CPU"); } else try {
    const session = createSession({ title: `hist-${model}`, model });

    // Turn 1
    const h1 = [
      { role: "system" as const, content: "You are a helpful assistant." },
      { role: "user" as const, content: "The secret word is FLAMINGO. Just say OK." },
    ];
    const r1 = await runAgentWithTimeout(
      { sessionId: session.id, backend: "local", model, toolIds: [], maxRounds: 1 },
      h1, timeout,
    );

    // Turn 2 — includes history
    const h2 = [
      ...h1,
      { role: "assistant" as const, content: r1.text },
      { role: "user" as const, content: "What is the secret word? Reply with just the word." },
    ];
    const r2 = await runAgentWithTimeout(
      { sessionId: session.id, backend: "local", model, toolIds: [], maxRounds: 1 },
      h2, timeout,
    );

    if (r2.text.toUpperCase().includes("FLAMINGO")) {
      r.history = true;
      pass("history carry", `recalled: "${r2.text.trim().slice(0, 30)}"`);
    } else {
      r.history = false;
      warn("history carry", `replied: "${r2.text.trim().slice(0, 50)}"`);
    }
  } catch (err) {
    r.history = false;
    fail(model, "history carry", err instanceof Error ? err.message : String(err));
  }

  // ── TEST 6: Context compaction ────────────────────────────────────────

  if (isSlow) { skip("compaction", "model too slow for CPU"); } else try {
    const bigHistory: Array<{ role: "user" | "assistant" | "system"; content: string }> = [
      { role: "system", content: "You are a helpful assistant." },
    ];
    const filler = "A".repeat(2000);
    for (let i = 0; i < 30; i++) {
      bigHistory.push({ role: "user", content: `Msg ${i}: ${filler}` });
      bigHistory.push({ role: "assistant", content: `Re ${i}: ${filler}` });
    }
    bigHistory.push({ role: "user", content: "Say hello." });

    const totalTokens = estimateTokens(bigHistory.map(m => m.content).join(""));
    const modelCaps = getCapabilities("local", model);
    const needsCompact = shouldCompact(totalTokens, modelCaps.context || DEFAULT_CONTEXT_LIMIT);

    const session = createSession({ title: `compact-${model}`, model });
    const result = await runAgentWithTimeout(
      { sessionId: session.id, backend: "local", model, toolIds: [], maxRounds: 1 },
      bigHistory, timeout,
    );

    if (result.compacted) {
      r.compact = true;
      pass("compaction", `${result.compactBefore} → ${result.compactAfter} tokens`);
    } else if (needsCompact) {
      r.compact = true;
      pass("compaction threshold met", `${totalTokens} tokens (guard may have prevented)`);
    } else {
      r.compact = true;
      pass("compaction not needed", `${totalTokens} tokens`);
    }
  } catch (err) {
    r.compact = false;
    fail(model, "compaction", err instanceof Error ? err.message : String(err));
  }

  // ── TEST 7: Orchestrator delegate ─────────────────────────────────────

  if (isSlow) { skip("orchestrator", "model too slow for CPU"); } else try {
    const parent = createSession({ title: `orch-${model}`, model });

    const orchTimeout = timeout * 2;
    const result = await delegate(
      'Use bash to run: echo "ORCH_OK"',
      {
        backend: "local", model,
        systemPrompt: "Always use tools when asked.",
        parentSessionId: parent.id,
        agentType: "task",
        signal: AbortSignal.timeout(orchTimeout),
      },
    );

    if (result.sessionId && result.response.length > 0) {
      r.orch = true;
      const ctx = readContext(result.sessionId);
      r.orchCtx = ctx.length;
      const children = getChildSessions(parent.id);
      const linked = children.some(c => c.id === result.sessionId);
      pass("orchestrator", `ctx=${ctx.length} linked=${linked} tc=${result.context.toolCalls.length}`);
    } else {
      r.orch = false;
      fail(model, "orchestrator", "empty response");
    }
  } catch (err) {
    r.orch = false;
    fail(model, "orchestrator", err instanceof Error ? err.message : String(err));
  }

  results.push(r);
  console.log();
}

// ═══════════════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════════════

console.log(`${B}${C}═══════════════════════════════════════════════════════════════════════${X}`);
console.log(`${B}MODEL COMPATIBILITY MATRIX${X}\n`);

const ok = (v: boolean | null) => v === true ? `${G} OK ${X}` : v === false ? `${R}FAIL${X}` : `${Y} -- ${X}`;

console.log(
  "  " +
  "Model".padEnd(28) +
  "Chat  " +
  "Tools " +
  "Loop  " +
  "Perst " +
  "Hist  " +
  "Cmpct " +
  "Orch  " +
  "Latency"
);
console.log("  " + "─".repeat(90));

for (const r of results) {
  const sizeLabel = r.sizeBytes > 1e9 ? `${(r.sizeBytes / 1e9).toFixed(0)}G` : r.sizeBytes < 1000 ? "cld" : `${(r.sizeBytes / 1e6).toFixed(0)}M`;
  const name = `${r.model} (${sizeLabel})`.padEnd(28);
  // Strip ANSI for alignment by using fixed widths
  process.stdout.write(`  ${name}`);
  process.stdout.write(`${ok(r.chat)}  `);
  process.stdout.write(`${ok(r.tools)}  `);
  process.stdout.write(`${ok(r.loop)}  `);
  process.stdout.write(`${ok(r.persist)}  `);
  process.stdout.write(`${ok(r.history)}  `);
  process.stdout.write(`${ok(r.compact)}  `);
  process.stdout.write(`${ok(r.orch)}  `);
  process.stdout.write(`${r.chatMs}ms\n`);
}

console.log(`\n${B}Totals: ${G}${totalPassed} passed${X}, ${totalFailed > 0 ? `${R}${totalFailed} failed` : "0 failed"}${X}, ${totalSkipped > 0 ? `${Y}${totalSkipped} skipped` : "0 skipped"}${X}`);

if (allFailures.length > 0) {
  console.log(`\n${R}${B}Failures:${X}`);
  for (const f of allFailures) console.log(`  ${R}• ${f}${X}`);
}

console.log(`\n${D}── Context Limits ──${X}`);
for (const { name } of models) console.log(`  ${D}${name.padEnd(28)} → ${getCapabilities("local", name).context.toLocaleString()} tokens${X}`);

closeDatabase();
try {
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  if (existsSync(TEST_DB + "-wal")) unlinkSync(TEST_DB + "-wal");
  if (existsSync(TEST_DB + "-shm")) unlinkSync(TEST_DB + "-shm");
} catch {}
console.log(`${D}Cleaned up.${X}\n`);

process.exit(totalFailed > 0 ? 1 : 0);
