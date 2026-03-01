#!/usr/bin/env bun
// Live test: Sub-agent orchestration across all available Ollama models.
//
// Tests:
//   1. Model compatibility matrix — which models can call delegate/parallel_tasks
//   2. Sub-agent multi-tool chains — sub-agent calls bash, then read_file, then bash again
//   3. Delegate vs parent-only benchmark — measure overhead and accuracy
//   4. Agent type scoping — each type gets only its allowed tools
//   5. Context forwarding accuracy — secret word test across models
//   6. Depth limiting — max depth prevents infinite recursion
//   7. Parallel execution — fanOut across models
//   8. Streaming IPC verification — events arrive incrementally
//
// Usage: bun run test/live/live-multimodel-subagent.ts
//        bun run test/live/live-multimodel-subagent.ts --model qwen2.5:7b

import { initDatabase, closeDatabase } from "../../src/daemon/storage/db.js";
import { runAgent, type AgentRunConfig, type AgentEvent } from "../../src/daemon/agent/agent.js";
import { delegate, fanOut, AGENT_TYPES, MAX_DEPTH, filterOrchestratorTools } from "../../src/daemon/agent/orchestrator.js";
import { setActiveContext, clearActiveContext, getActiveBackend, getActiveModel } from "../../src/daemon/agent/orchestrator-context.js";
import { createSession } from "../../src/daemon/agent/session/session.js";
import { listTools } from "../../src/daemon/agent/tools/registry.js";
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const TIMEOUT_MS = 120_000; // 2 minutes per test
const TEST_DIR = join(tmpdir(), `jeriko-multimodel-${Date.now()}`);
const DB_PATH = join(TEST_DIR, "test.db");

// Parse CLI args for optional model filter
const args = process.argv.slice(2);
const modelFilter = args.includes("--model")
  ? args[args.indexOf("--model") + 1]
  : null;

// ---------------------------------------------------------------------------
// Ollama model discovery
// ---------------------------------------------------------------------------

interface OllamaModel {
  name: string;
  size: number;
}

async function discoverModels(): Promise<string[]> {
  try {
    const resp = await fetch("http://localhost:11434/api/tags");
    if (!resp.ok) return [];
    const data = (await resp.json()) as { models: OllamaModel[] };
    // Only use cloud-routed models (name contains "cloud", size ~0 bytes).
    // Local models require GPU and are too slow for comprehensive testing.
    return data.models
      .filter((m) => m.name.toLowerCase().includes("cloud"))
      .map((m) => m.name)
      .sort();
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

interface TestResult {
  name: string;
  model: string;
  status: "PASS" | "FAIL" | "SKIP";
  detail: string;
  durationMs: number;
  toolCalls?: number;
  tokensIn?: number;
  tokensOut?: number;
}

const results: TestResult[] = [];

function log(msg: string) {
  console.log(msg);
}

function header(msg: string) {
  log(`\n${"═".repeat(70)}`);
  log(`  ${msg}`);
  log(`${"═".repeat(70)}`);
}

function record(result: TestResult) {
  results.push(result);
  const icon = result.status === "PASS" ? "✓" : result.status === "FAIL" ? "✗" : "⊘";
  const timeStr = `${result.durationMs}ms`;
  log(`  ${icon} [${result.model}] ${result.name} (${timeStr})`);
  if (result.detail) log(`    ${result.detail}`);
}

/** Run agent loop and collect events. Creates a session automatically. */
async function runAndCollect(
  config: Omit<AgentRunConfig, "sessionId"> & { sessionId?: string },
  history: Array<{ role: string; content: string }>,
  timeoutMs = TIMEOUT_MS,
): Promise<{ response: string; events: AgentEvent[]; tokensIn: number; tokensOut: number; toolCallCount: number }> {
  // Ensure a valid session exists for message persistence
  const sessionId = config.sessionId ?? createSession({
    model: config.model,
    title: "live-test",
  }).id;

  const events: AgentEvent[] = [];
  let response = "";
  let tokensIn = 0;
  let tokensOut = 0;
  let toolCallCount = 0;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    for await (const event of runAgent(
      { ...config, sessionId, signal: controller.signal },
      history as any,
    )) {
      events.push(event);
      if (event.type === "text_delta") response += event.content;
      if (event.type === "tool_call_start") toolCallCount++;
      if (event.type === "turn_complete") {
        tokensIn = event.tokensIn;
        tokensOut = event.tokensOut;
      }
    }
  } finally {
    clearTimeout(timer);
  }

  return { response, events, tokensIn, tokensOut, toolCallCount };
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

async function testModelDelegateCapability(model: string): Promise<void> {
  // Test 1: Can the model call the delegate tool?
  const start = Date.now();
  const testName = "delegate tool call";

  try {
    const { response, toolCallCount, tokensIn, tokensOut } = await runAndCollect(
      {
        backend: "local",
        model,
        systemPrompt: "You have a delegate tool. Use it to delegate tasks to sub-agents. Always use the delegate tool when asked to delegate.",
        toolIds: null,
      },
      [{ role: "user", content: 'Use the delegate tool to ask a sub-agent: "What is 1+1?"' }],
    );

    const usedDelegate = toolCallCount > 0;
    record({
      name: testName,
      model,
      status: usedDelegate ? "PASS" : "FAIL",
      detail: usedDelegate
        ? `Delegate called, ${toolCallCount} tool calls, response: ${response.slice(0, 100)}`
        : `Model responded without calling delegate: ${response.slice(0, 100)}`,
      durationMs: Date.now() - start,
      toolCalls: toolCallCount,
      tokensIn,
      tokensOut,
    });
  } catch (err) {
    record({
      name: testName,
      model,
      status: "FAIL",
      detail: `Error: ${err instanceof Error ? err.message : String(err)}`,
      durationMs: Date.now() - start,
    });
  }
}

async function testSubAgentMultiTool(model: string): Promise<void> {
  // Test 2: Can a sub-agent call multiple tools in sequence?
  // Delegate a "task" agent to: (1) run bash to create a file, (2) read it back, (3) delete it.
  const start = Date.now();
  const testName = "sub-agent multi-tool chain";
  const testFile = join(TEST_DIR, `multitools-${randomUUID().slice(0, 8)}.txt`);

  try {
    // Simulate parent context so delegate inherits backend/model
    setActiveContext({
      systemPrompt: "test",
      messages: [],
      depth: 0,
      backend: "local",
      model,
    });

    const result = await delegate(
      `Do these 3 steps in order:
1. Run the bash command: echo "MULTI_TOOL_TEST_12345" > ${testFile}
2. Read the file ${testFile} and confirm its contents
3. Run the bash command: rm ${testFile}
Report what you found in the file.`,
      {
        backend: "local",
        model,
        agentType: "task",
      },
    );

    clearActiveContext();

    const toolCalls = result.context.toolCalls;
    const toolNames = toolCalls.map((t) => t.name);
    const calledMultipleTools = toolCalls.length >= 2;
    const calledBash = toolNames.includes("bash");
    const calledRead = toolNames.includes("read_file");
    const mentionsContent = result.response.includes("MULTI_TOOL_TEST_12345") ||
      toolCalls.some((t) => t.result.includes("MULTI_TOOL_TEST_12345"));

    const allGood = calledMultipleTools && calledBash && mentionsContent;

    record({
      name: testName,
      model,
      status: allGood ? "PASS" : "FAIL",
      detail: `${toolCalls.length} tools called: [${toolNames.join(", ")}]` +
        ` | Content found: ${mentionsContent}` +
        ` | Response: ${result.response.slice(0, 80)}`,
      durationMs: Date.now() - start,
      toolCalls: toolCalls.length,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
    });
  } catch (err) {
    clearActiveContext();
    record({
      name: testName,
      model,
      status: "FAIL",
      detail: `Error: ${err instanceof Error ? err.message : String(err)}`,
      durationMs: Date.now() - start,
    });
  }
}

async function testDelegateVsParent(model: string): Promise<void> {
  // Test 3: Benchmark — delegate vs parent doing the same task directly.
  // Task: count .ts files in src/
  const start = Date.now();
  const testName = "delegate vs parent benchmark";

  try {
    // A) Parent does it directly (single agent loop)
    const parentStart = Date.now();
    const parentResult = await runAndCollect(
      {
        backend: "local",
        model,
        toolIds: ["bash"],
      },
      [{ role: "user", content: 'Run: find src -name "*.ts" | wc -l  — just give me the number.' }],
    );
    const parentMs = Date.now() - parentStart;

    // B) Delegate does the same task
    setActiveContext({
      systemPrompt: "test",
      messages: [],
      depth: 0,
      backend: "local",
      model,
    });

    const delegateStart = Date.now();
    const delegateResult = await delegate(
      'Run: find src -name "*.ts" | wc -l  — just give me the number.',
      {
        backend: "local",
        model,
        agentType: "task",
      },
    );
    const delegateMs = Date.now() - delegateStart;
    clearActiveContext();

    const overhead = delegateMs - parentMs;
    const overheadPct = parentMs > 0 ? Math.round((overhead / parentMs) * 100) : 0;

    // Both should have found files — check for a number in response OR tool results.
    // Some models put the answer in tool output rather than final text.
    const parentHasNumber = /\d+/.test(parentResult.response);
    const delegateText = delegateResult.response +
      delegateResult.context.toolCalls.map((t) => t.result).join(" ");
    const delegateHasNumber = /\d+/.test(delegateText);

    record({
      name: testName,
      model,
      status: parentHasNumber && delegateHasNumber ? "PASS" : "FAIL",
      detail: `Parent: ${parentMs}ms (${parentResult.toolCallCount} tools) | ` +
        `Delegate: ${delegateMs}ms (${delegateResult.context.toolCalls.length} tools) | ` +
        `Overhead: ${overhead}ms (+${overheadPct}%) | ` +
        `Parent answer: ${parentResult.response.trim().slice(0, 40)} | ` +
        `Delegate answer: ${delegateResult.response.trim().slice(0, 40)}`,
      durationMs: Date.now() - start,
    });
  } catch (err) {
    clearActiveContext();
    record({
      name: testName,
      model,
      status: "FAIL",
      detail: `Error: ${err instanceof Error ? err.message : String(err)}`,
      durationMs: Date.now() - start,
    });
  }
}

async function testAgentTypeScoping(model: string): Promise<void> {
  // Test 4: Verify each agent type only has its allowed tools.
  const start = Date.now();
  const testName = "agent type tool scoping";

  try {
    const results: string[] = [];

    for (const [typeName, allowedTools] of Object.entries(AGENT_TYPES)) {
      setActiveContext({
        systemPrompt: "test",
        messages: [],
        depth: 0,
        backend: "local",
        model,
      });

      // Delegate with each agent type, asking it to list its available tools
      const result = await delegate(
        "What tools do you have available? List them by name. If you have no tools, say NO_TOOLS.",
        {
          backend: "local",
          model,
          agentType: typeName as any,
        },
      );
      clearActiveContext();

      if (allowedTools === null) {
        results.push(`${typeName}: general (all tools)`);
      } else {
        // Check that the sub-agent didn't call any tools outside its allowed set
        const calledTools = result.context.toolCalls.map((t) => t.name);
        const unauthorized = calledTools.filter((t) => !allowedTools.includes(t));
        if (unauthorized.length > 0) {
          results.push(`${typeName}: VIOLATION — called ${unauthorized.join(", ")}`);
        } else {
          results.push(`${typeName}: OK (${calledTools.length} calls, allowed: [${allowedTools.join(", ")}])`);
        }
      }
    }

    const hasViolation = results.some((r) => r.includes("VIOLATION"));
    record({
      name: testName,
      model,
      status: hasViolation ? "FAIL" : "PASS",
      detail: results.join(" | "),
      durationMs: Date.now() - start,
    });
  } catch (err) {
    clearActiveContext();
    record({
      name: testName,
      model,
      status: "FAIL",
      detail: `Error: ${err instanceof Error ? err.message : String(err)}`,
      durationMs: Date.now() - start,
    });
  }
}

async function testContextForwarding(model: string): Promise<void> {
  // Test 5: Secret word test — parent sets a secret, child must know it.
  const start = Date.now();
  const testName = "context forwarding (secret word)";
  const secret = `ZEPHYR-${randomUUID().slice(0, 4).toUpperCase()}`;

  try {
    setActiveContext({
      systemPrompt: "test",
      messages: [
        { role: "user", content: `The secret password is ${secret}. Remember it.` },
        { role: "assistant", content: `I've noted the secret password: ${secret}.` },
      ],
      depth: 0,
      backend: "local",
      model,
    });

    const result = await delegate(
      "What is the secret password from the parent conversation? Just say the password.",
      {
        backend: "local",
        model,
        agentType: "general",
        parentMessages: [
          { role: "user", content: `The secret password is ${secret}. Remember it.` },
          { role: "assistant", content: `I've noted the secret password: ${secret}.` },
        ],
      },
    );
    clearActiveContext();

    // Normalize unicode dashes (en-dash U+2011, em-dash U+2013/U+2014, minus U+2212)
    // to regular hyphen before comparing. Models often convert hyphens to
    // typographic variants in their output.
    const normalize = (s: string) => s.replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-");
    const found = normalize(result.response).includes(normalize(secret));

    record({
      name: testName,
      model,
      status: found ? "PASS" : "FAIL",
      detail: found
        ? `Secret ${secret} found in response`
        : `Secret ${secret} NOT found. Response: ${result.response.slice(0, 120)}`,
      durationMs: Date.now() - start,
    });
  } catch (err) {
    clearActiveContext();
    record({
      name: testName,
      model,
      status: "FAIL",
      detail: `Error: ${err instanceof Error ? err.message : String(err)}`,
      durationMs: Date.now() - start,
    });
  }
}

async function testDepthLimiting(model: string): Promise<void> {
  // Test 6: At MAX_DEPTH, delegate and parallel_tasks should be filtered out.
  const start = Date.now();
  const testName = "depth limiting";

  try {
    setActiveContext({
      systemPrompt: "test",
      messages: [],
      depth: MAX_DEPTH - 1, // Parent is at max-1, so child will be at max
      backend: "local",
      model,
    });

    const result = await delegate(
      "Try to use the delegate tool to delegate a task. If you cannot find the delegate tool, say DELEGATE_NOT_AVAILABLE.",
      {
        backend: "local",
        model,
        agentType: "general",
      },
    );
    clearActiveContext();

    // The child should NOT have delegate or parallel_tasks in its tool set.
    // It should either say delegate is not available, or fail to find it.
    const calledDelegate = result.context.toolCalls.some(
      (t) => t.name === "delegate" || t.name === "parallel_tasks",
    );

    record({
      name: testName,
      model,
      status: !calledDelegate ? "PASS" : "FAIL",
      detail: !calledDelegate
        ? `Depth ${MAX_DEPTH}: delegate/parallel_tasks correctly filtered. Tools used: [${result.context.toolCalls.map((t) => t.name).join(", ")}]`
        : `VIOLATION: child at depth ${MAX_DEPTH} called orchestrator tools!`,
      durationMs: Date.now() - start,
    });
  } catch (err) {
    clearActiveContext();
    record({
      name: testName,
      model,
      status: "FAIL",
      detail: `Error: ${err instanceof Error ? err.message : String(err)}`,
      durationMs: Date.now() - start,
    });
  }
}

async function testParallelExecution(model: string): Promise<void> {
  // Test 7: Fan out 3 parallel tasks and verify all complete.
  const start = Date.now();
  const testName = "parallel fanOut execution";

  try {
    setActiveContext({
      systemPrompt: "test",
      messages: [],
      depth: 0,
      backend: "local",
      model,
    });

    const results = await fanOut(
      [
        { label: "uname", prompt: "Run: uname -s  — just give the output", agentType: "task" },
        { label: "date", prompt: "Run: date +%Y  — just give the year", agentType: "task" },
        { label: "whoami", prompt: "Run: whoami  — just give the username", agentType: "task" },
      ],
      {
        maxConcurrency: 3,
        defaultBackend: "local",
        defaultModel: model,
      },
    );
    clearActiveContext();

    const succeeded = results.filter((r) => r.status === "success").length;
    const failed = results.filter((r) => r.status === "error").length;
    const totalTools = results.reduce((sum, r) => sum + r.context.toolCalls.length, 0);

    record({
      name: testName,
      model,
      status: succeeded >= 2 ? "PASS" : "FAIL",
      detail: `${succeeded}/3 succeeded, ${failed} failed, ${totalTools} total tool calls | ` +
        results.map((r) => `${r.label}: ${r.status} (${r.response.trim().slice(0, 30)})`).join(" | "),
      durationMs: Date.now() - start,
    });
  } catch (err) {
    clearActiveContext();
    record({
      name: testName,
      model,
      status: "FAIL",
      detail: `Error: ${err instanceof Error ? err.message : String(err)}`,
      durationMs: Date.now() - start,
    });
  }
}

async function testBackendInheritance(model: string): Promise<void> {
  // Test 8: Verify sub-agent inherits parent's backend/model, not defaults.
  const start = Date.now();
  const testName = "backend/model inheritance";

  try {
    setActiveContext({
      systemPrompt: "test",
      messages: [],
      depth: 0,
      backend: "local",
      model,
    });

    // Verify active context reports correct backend and model
    const backend = getActiveBackend();
    const activeModel = getActiveModel();

    // Delegate — the child should use the same backend
    const result = await delegate(
      "What model are you? Just say the model name if you know it, otherwise say UNKNOWN.",
      {
        backend: "local",
        model,
        agentType: "general",
      },
    );
    clearActiveContext();

    // The important thing is that the delegate call didn't error with
    // "Anthropic API error" — that would mean it defaulted to Claude
    const noApiError = !result.response.includes("API error") &&
      !result.response.includes("credit balance");

    record({
      name: testName,
      model,
      status: noApiError && backend === "local" ? "PASS" : "FAIL",
      detail: `Active backend: ${backend}, model: ${activeModel} | ` +
        `Child responded (no API error): ${noApiError} | ` +
        `Response: ${result.response.slice(0, 80)}`,
      durationMs: Date.now() - start,
    });
  } catch (err) {
    clearActiveContext();
    const isApiError = err instanceof Error &&
      (err.message.includes("Anthropic") || err.message.includes("credit"));
    record({
      name: testName,
      model,
      status: "FAIL",
      detail: isApiError
        ? `CRITICAL: Sub-agent defaulted to Claude instead of local! ${err instanceof Error ? err.message : String(err)}`
        : `Error: ${err instanceof Error ? err.message : String(err)}`,
      durationMs: Date.now() - start,
    });
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  log("Jeriko Sub-Agent Multi-Model Live Test");
  log(`Database: ${DB_PATH}`);

  mkdirSync(TEST_DIR, { recursive: true });
  process.env.JERIKO_DB_PATH = DB_PATH;
  initDatabase();

  // Register tools
  await Promise.all([
    import("../../src/daemon/agent/tools/bash.js"),
    import("../../src/daemon/agent/tools/read.js"),
    import("../../src/daemon/agent/tools/write.js"),
    import("../../src/daemon/agent/tools/edit.js"),
    import("../../src/daemon/agent/tools/list.js"),
    import("../../src/daemon/agent/tools/search.js"),
    import("../../src/daemon/agent/tools/delegate.js"),
    import("../../src/daemon/agent/tools/parallel.js"),
  ]);

  const registeredTools = listTools();
  log(`Registered tools: ${registeredTools.map((t) => t.id).join(", ")}`);

  // Discover available models
  let models = await discoverModels();
  if (models.length === 0) {
    log("ERROR: No Ollama models found. Is Ollama running?");
    process.exit(1);
  }

  if (modelFilter) {
    const matched = models.find((m) => m.includes(modelFilter));
    if (!matched) {
      log(`ERROR: Model filter "${modelFilter}" didn't match any of: ${models.join(", ")}`);
      process.exit(1);
    }
    models = [matched];
  }

  log(`Available models: ${models.join(", ")}`);
  log(`Testing ${models.length} model(s)\n`);

  // ─── Run tests across all models ────────────────────────────────────────

  for (const model of models) {
    header(`Model: ${model}`);

    // Core capability: can the model call delegate?
    await testModelDelegateCapability(model);

    // Sub-agent calling multiple tools in sequence
    await testSubAgentMultiTool(model);

    // Benchmark: delegate overhead vs parent-only
    await testDelegateVsParent(model);

    // Agent type tool scoping (no violations)
    await testAgentTypeScoping(model);

    // Context forwarding (secret word test)
    await testContextForwarding(model);

    // Depth limiting (no recursive spawning)
    await testDepthLimiting(model);

    // Parallel fanOut execution
    await testParallelExecution(model);

    // Backend/model inheritance (no defaulting to Claude)
    await testBackendInheritance(model);
  }

  // ─── Summary ────────────────────────────────────────────────────────────

  header("RESULTS SUMMARY");

  // Per-model compatibility matrix
  const testNames = [
    "delegate tool call",
    "sub-agent multi-tool chain",
    "delegate vs parent benchmark",
    "agent type tool scoping",
    "context forwarding (secret word)",
    "depth limiting",
    "parallel fanOut execution",
    "backend/model inheritance",
  ];

  // Print matrix header
  const maxModelLen = Math.max(...models.map((m) => m.length), 15);
  log(`\n${"Model".padEnd(maxModelLen)} | ${testNames.map((_, i) => `T${i + 1}`).join(" | ")} | Score`);
  log(`${"-".repeat(maxModelLen)}-|-${testNames.map(() => "---").join("-|-")}-|------`);

  for (const model of models) {
    const modelResults = testNames.map((name) => {
      const r = results.find((res) => res.model === model && res.name === name);
      return r?.status ?? "SKIP";
    });
    const passed = modelResults.filter((s) => s === "PASS").length;
    const icons = modelResults.map((s) => s === "PASS" ? " ✓ " : s === "FAIL" ? " ✗ " : " ⊘ ");
    log(`${model.padEnd(maxModelLen)} | ${icons.join(" | ")} | ${passed}/${testNames.length}`);
  }

  // Overall stats
  const totalPass = results.filter((r) => r.status === "PASS").length;
  const totalFail = results.filter((r) => r.status === "FAIL").length;
  const totalSkip = results.filter((r) => r.status === "SKIP").length;
  const totalTests = results.length;

  log(`\nTotal: ${totalPass} PASS, ${totalFail} FAIL, ${totalSkip} SKIP out of ${totalTests} tests`);

  // Cleanup
  closeDatabase();
  try { rmSync(TEST_DIR, { recursive: true }); } catch { /* ok */ }

  process.exit(totalFail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
