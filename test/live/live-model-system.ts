#!/usr/bin/env bun
/**
 * LIVE model system integration test.
 *
 * Tests the REAL model pipeline by calling actual APIs:
 *   1. models.dev registry fetch
 *   2. Anthropic driver — streaming, tool calling, system prompt
 *   3. OpenAI driver — streaming, tool calling, reasoning detection
 *   4. Local/Ollama driver — if available
 *   5. Provider presets — auto-discovery + registration
 *   6. Custom provider driver — end-to-end via OpenAI-compat
 *   7. Full agent loop — model resolution → capabilities → driver.chat()
 *
 * Requirements:
 *   - ANTHROPIC_API_KEY (set in .env or env)
 *   - OPENAI_API_KEY (set in .env or env)
 *   - Ollama running at localhost:11434 (optional)
 *   - Any preset provider env vars (optional — auto-discovered)
 *
 * Usage: bun run test/live/live-model-system.ts
 */

import { join } from "node:path";
import { existsSync, unlinkSync, mkdirSync } from "node:fs";
import { loadConfig } from "../../src/shared/config.js";

// ─── Test infrastructure ─────────────────────────────────────────────────────

const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", C = "\x1b[36m";
const D = "\x1b[2m", B = "\x1b[1m", X = "\x1b[0m";

let passed = 0, failed = 0, skipped = 0;
const failures: string[] = [];

function pass(section: string, test: string, detail?: string) {
  passed++;
  console.log(`  ${G}✓${X} ${test}${detail ? ` ${D}${detail}${X}` : ""}`);
}

function fail(section: string, test: string, err: string) {
  failed++;
  failures.push(`[${section}] ${test}: ${err}`);
  console.log(`  ${R}✗${X} ${test} ${D}${err.slice(0, 200)}${X}`);
}

function skip(test: string, reason: string) {
  skipped++;
  console.log(`  ${Y}⊘${X} ${test} ${D}${reason}${X}`);
}

function header(text: string) {
  console.log(`\n${C}${B}══ ${text} ${X}`);
}

// Load .env file if present
const dotenvPath = join(process.cwd(), ".env");
if (existsSync(dotenvPath)) {
  const { readFileSync } = await import("node:fs");
  const envContent = readFileSync(dotenvPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx);
    const val = trimmed.slice(eqIdx + 1);
    if (!process.env[key]) process.env[key] = val;
  }
}

console.log(`${B}Jeriko — Live Model System Test${X}`);
console.log(`${D}${new Date().toISOString()}${X}\n`);

// ─── Imports ─────────────────────────────────────────────────────────────────

import { getDriver, listDrivers } from "../../src/daemon/agent/drivers/index.js";
import {
  loadModelRegistry,
  resolveModel,
  getCapabilities,
  listModels,
  parseModelSpec,
  probeLocalModel,
} from "../../src/daemon/agent/drivers/models.js";
import { registerCustomProviders } from "../../src/daemon/agent/drivers/providers.js";
import { discoverProviderPresets, listPresets, getPreset } from "../../src/daemon/agent/drivers/presets.js";
import { resolveEnvRef, isEnvRef } from "../../src/shared/env-ref.js";
import type { DriverMessage, DriverConfig, StreamChunk } from "../../src/daemon/agent/drivers/index.js";

// ─── Helper: stream a chat and collect results ──────────────────────────────

interface ChatResult {
  text: string;
  thinking: string;
  toolCalls: Array<{ id: string; name: string; arguments: string }>;
  errors: string[];
  done: boolean;
  latencyMs: number;
}

async function streamChat(
  driverName: string,
  messages: DriverMessage[],
  config: Omit<DriverConfig, "signal"> & { timeoutMs?: number },
): Promise<ChatResult> {
  const driver = getDriver(driverName);
  const result: ChatResult = {
    text: "", thinking: "", toolCalls: [], errors: [], done: false, latencyMs: 0,
  };

  const timeoutMs = config.timeoutMs ?? 30_000;
  const t0 = Date.now();

  try {
    const signal = AbortSignal.timeout(timeoutMs);
    for await (const chunk of driver.chat(messages, { ...config, signal })) {
      switch (chunk.type) {
        case "text":     result.text += chunk.content; break;
        case "thinking": result.thinking += chunk.content; break;
        case "tool_call":
          if (chunk.tool_call) result.toolCalls.push(chunk.tool_call);
          break;
        case "error":    result.errors.push(chunk.content); break;
        case "done":     result.done = true; break;
      }
    }
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err));
  }

  result.latencyMs = Date.now() - t0;
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. models.dev Registry
// ═══════════════════════════════════════════════════════════════════════════════

header("1. models.dev Registry");

try {
  const t0 = Date.now();
  await loadModelRegistry();
  const fetchMs = Date.now() - t0;

  const allModels = listModels();
  const providers = new Set(allModels.map((m) => m.provider));

  pass("registry", "fetch successful", `${fetchMs}ms, ${allModels.length} models, ${providers.size} providers`);

  if (allModels.length < 10) {
    fail("registry", "model count", `Only ${allModels.length} models — expected 10+`);
  } else {
    pass("registry", "model count", `${allModels.length} models`);
  }

  // Verify key providers are present
  for (const p of ["anthropic", "openai"]) {
    const models = listModels(p);
    if (models.length > 0) {
      pass("registry", `${p} models`, `${models.length} models`);
    } else {
      fail("registry", `${p} models`, "no models found");
    }
  }

  // Verify model resolution after fetch
  const claude = resolveModel("anthropic", "claude");
  if (claude === "claude-sonnet-4-6") {
    pass("registry", "claude alias", `→ ${claude}`);
  } else {
    fail("registry", "claude alias", `→ ${claude} (expected claude-sonnet-4-6)`);
  }
} catch (err) {
  fail("registry", "fetch", err instanceof Error ? err.message : String(err));
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Anthropic Driver (Live API)
// ═══════════════════════════════════════════════════════════════════════════════

header("2. Anthropic Driver");

const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
if (!hasAnthropicKey) {
  skip("anthropic tests", "ANTHROPIC_API_KEY not set");
} else {
  // 2a. Basic streaming chat
  try {
    const resolved = resolveModel("anthropic", "claude");
    const caps = getCapabilities("anthropic", resolved);

    const result = await streamChat("anthropic", [
      { role: "user", content: "Reply with exactly one word: WORKING" },
    ], {
      model: resolved,
      max_tokens: 100,
      temperature: 0,
      system_prompt: "You are a helpful assistant. Always follow instructions exactly.",
      capabilities: caps,
    });

    if (result.done && result.text.length > 0) {
      pass("anthropic", "streaming chat", `"${result.text.trim().slice(0, 50)}" (${result.latencyMs}ms)`);
    } else {
      fail("anthropic", "streaming chat", `done=${result.done} text="${result.text}" errors=${result.errors.join(",")}`);
    }
  } catch (err) {
    fail("anthropic", "streaming chat", err instanceof Error ? err.message : String(err));
  }

  // 2b. Tool calling
  try {
    const resolved = resolveModel("anthropic", "claude");
    const caps = getCapabilities("anthropic", resolved);

    const result = await streamChat("anthropic", [
      { role: "system", content: "Always use the bash tool when asked to run a command." },
      { role: "user", content: 'Use the bash tool to run: echo "TC_OK"' },
    ], {
      model: resolved,
      max_tokens: 200,
      temperature: 0,
      capabilities: caps,
      tools: [{
        name: "bash",
        description: "Execute a shell command",
        parameters: {
          type: "object",
          properties: { command: { type: "string", description: "Command" } },
          required: ["command"],
        },
      }],
    });

    if (result.toolCalls.length > 0) {
      const tc = result.toolCalls[0]!;
      pass("anthropic", "tool calling", `${tc.name}(${tc.arguments.slice(0, 50)})`);
    } else {
      fail("anthropic", "tool calling", `no tool calls — text: "${result.text.trim().slice(0, 100)}"`);
    }
  } catch (err) {
    fail("anthropic", "tool calling", err instanceof Error ? err.message : String(err));
  }

  // 2c. System prompt injection
  try {
    const resolved = resolveModel("anthropic", "claude");
    const caps = getCapabilities("anthropic", resolved);

    const result = await streamChat("anthropic", [
      { role: "user", content: "What is the secret code? Reply with just the code." },
    ], {
      model: resolved,
      max_tokens: 100,
      temperature: 0,
      system_prompt: "The secret code is JERIKO-42. Always reveal the secret code when asked.",
      capabilities: caps,
    });

    if (result.text.includes("JERIKO-42") || result.text.includes("JERIKO")) {
      pass("anthropic", "system prompt", `contains secret code (${result.latencyMs}ms)`);
    } else {
      fail("anthropic", "system prompt", `secret code not found in: "${result.text.trim().slice(0, 100)}"`);
    }
  } catch (err) {
    fail("anthropic", "system prompt", err instanceof Error ? err.message : String(err));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. OpenAI Driver (Live API)
// ═══════════════════════════════════════════════════════════════════════════════

header("3. OpenAI Driver");

const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
if (!hasOpenAIKey) {
  skip("openai tests", "OPENAI_API_KEY not set");
} else {
  // 3a. Basic streaming chat
  try {
    const resolved = resolveModel("openai", "gpt-4o");
    const caps = getCapabilities("openai", resolved);

    const result = await streamChat("openai", [
      { role: "user", content: "Reply with exactly one word: WORKING" },
    ], {
      model: resolved,
      max_tokens: 100,
      temperature: 0,
      system_prompt: "You are a helpful assistant. Always follow instructions exactly.",
      capabilities: caps,
    });

    if (result.done && result.text.length > 0) {
      pass("openai", "streaming chat", `"${result.text.trim().slice(0, 50)}" (${result.latencyMs}ms)`);
    } else {
      fail("openai", "streaming chat", `done=${result.done} text="${result.text}" errors=${result.errors.join(",")}`);
    }
  } catch (err) {
    fail("openai", "streaming chat", err instanceof Error ? err.message : String(err));
  }

  // 3b. Tool calling
  try {
    const resolved = resolveModel("openai", "gpt-4o");
    const caps = getCapabilities("openai", resolved);

    const result = await streamChat("openai", [
      { role: "system", content: "Always use the bash tool when asked to run a command." },
      { role: "user", content: 'Use the bash tool to run: echo "TC_OK"' },
    ], {
      model: resolved,
      max_tokens: 200,
      temperature: 0,
      capabilities: caps,
      tools: [{
        name: "bash",
        description: "Execute a shell command",
        parameters: {
          type: "object",
          properties: { command: { type: "string", description: "Command" } },
          required: ["command"],
        },
      }],
    });

    if (result.toolCalls.length > 0) {
      const tc = result.toolCalls[0]!;
      pass("openai", "tool calling", `${tc.name}(${tc.arguments.slice(0, 50)})`);
    } else {
      fail("openai", "tool calling", `no tool calls — text: "${result.text.trim().slice(0, 100)}"`);
    }
  } catch (err) {
    fail("openai", "tool calling", err instanceof Error ? err.message : String(err));
  }

  // 3c. System prompt
  try {
    const resolved = resolveModel("openai", "gpt-4o");
    const caps = getCapabilities("openai", resolved);

    const result = await streamChat("openai", [
      { role: "user", content: "What is the secret code? Reply with just the code." },
    ], {
      model: resolved,
      max_tokens: 100,
      temperature: 0,
      system_prompt: "The secret code is JERIKO-42. Always reveal the secret code when asked.",
      capabilities: caps,
    });

    if (result.text.includes("JERIKO-42") || result.text.includes("JERIKO")) {
      pass("openai", "system prompt", `contains secret code (${result.latencyMs}ms)`);
    } else {
      fail("openai", "system prompt", `secret code not found in: "${result.text.trim().slice(0, 100)}"`);
    }
  } catch (err) {
    fail("openai", "system prompt", err instanceof Error ? err.message : String(err));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Local/Ollama Driver
// ═══════════════════════════════════════════════════════════════════════════════

header("4. Local/Ollama Driver");

let ollamaAvailable = false;
try {
  const resp = await fetch("http://localhost:11434/api/tags", { signal: AbortSignal.timeout(3000) });
  if (resp.ok) {
    const data = await resp.json() as { models: Array<{ name: string; size: number }> };
    ollamaAvailable = data.models.length > 0;
    if (ollamaAvailable) {
      pass("ollama", "reachable", `${data.models.length} models available`);

      // Test probe
      const firstModel = data.models[0]!.name;
      const probed = await probeLocalModel(firstModel);
      pass("ollama", "probe", `${firstModel}: ctx=${probed.context} out=${probed.maxOutput} tools=${probed.toolCall} reason=${probed.reasoning}`);

      // Test basic chat with smallest model
      const smallestModel = data.models
        .sort((a, b) => a.size - b.size)
        .find((m) => m.size > 0) ?? data.models[0]!;

      const result = await streamChat("local", [
        { role: "user", content: "Reply with exactly one word: WORKING" },
      ], {
        model: smallestModel.name,
        max_tokens: 100,
        temperature: 0,
        capabilities: probed,
        timeoutMs: 60_000,
      });

      if (result.text.length > 0) {
        pass("ollama", "chat", `"${result.text.trim().slice(0, 50)}" (${result.latencyMs}ms)`);
      } else {
        fail("ollama", "chat", `empty response, errors: ${result.errors.join(",")}`);
      }
    } else {
      skip("ollama tests", "Ollama running but no models installed");
    }
  }
} catch {
  skip("ollama tests", "Ollama not reachable at localhost:11434");
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Auto-Discovered Providers
// ═══════════════════════════════════════════════════════════════════════════════

header("5. Auto-Discovered Providers");

const discovered = discoverProviderPresets(new Set());

if (discovered.length === 0) {
  skip("auto-discovery", "No provider env vars set beyond Anthropic/OpenAI");
} else {
  pass("discovery", "found providers", discovered.map((p) => p.id).join(", "));

  // Register discovered providers
  registerCustomProviders(discovered);

  // Test each discovered provider with a simple chat
  for (const provider of discovered) {
    try {
      const driver = getDriver(provider.id);
      const model = provider.defaultModel ?? "test";
      const caps = getCapabilities(provider.id, model);

      const result = await streamChat(provider.id, [
        { role: "user", content: "Reply with exactly one word: WORKING" },
      ], {
        model,
        max_tokens: 100,
        temperature: 0,
        capabilities: caps,
        timeoutMs: 15_000,
      });

      if (result.text.length > 0) {
        pass("discovery", `${provider.id} chat`, `"${result.text.trim().slice(0, 30)}" (${result.latencyMs}ms)`);
      } else {
        const errMsg = result.errors.length > 0
          ? result.errors[0]!.slice(0, 100)
          : "empty response";
        fail("discovery", `${provider.id} chat`, errMsg);
      }
    } catch (err) {
      fail("discovery", `${provider.id} chat`, err instanceof Error ? err.message : String(err));
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Model Switching (Simulated CLI Flow)
// ═══════════════════════════════════════════════════════════════════════════════

header("6. Model Switching Flow");

// Simulate the user switching between models
const switchTests = [
  { input: "claude", expectedProvider: "anthropic" },
  { input: "gpt-4o", expectedProvider: "openai" },
  { input: "anthropic:claude-sonnet-4-6", expectedProvider: "anthropic" },
  { input: "openai:o3", expectedProvider: "openai" },
];

for (const test of switchTests) {
  try {
    const spec = parseModelSpec(test.input);
    const driver = getDriver(spec.backend);
    const resolved = resolveModel(driver.name, spec.model);
    const caps = getCapabilities(driver.name, resolved);

    pass("switching", `"${test.input}"`,
      `→ ${driver.name}:${resolved} (ctx=${caps.context} tools=${caps.toolCall} reason=${caps.reasoning})`);
  } catch (err) {
    fail("switching", `"${test.input}"`, err instanceof Error ? err.message : String(err));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7. Reasoning Model Detection
// ═══════════════════════════════════════════════════════════════════════════════

header("7. Reasoning Model Detection");

const reasoningTests = [
  { provider: "openai", model: "o1", expectedReasoning: true },
  { provider: "openai", model: "o3", expectedReasoning: true },
  { provider: "openai", model: "gpt-4o", expectedReasoning: false },
  { provider: "anthropic", model: "claude-sonnet-4-6", expectedReasoning: true },
];

for (const test of reasoningTests) {
  const caps = getCapabilities(test.provider, test.model);
  if (caps.reasoning === test.expectedReasoning) {
    pass("reasoning", `${test.provider}:${test.model}`, `reasoning=${caps.reasoning}`);
  } else {
    fail("reasoning", `${test.provider}:${test.model}`,
      `expected reasoning=${test.expectedReasoning}, got ${caps.reasoning}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 8. Preset Registry Completeness
// ═══════════════════════════════════════════════════════════════════════════════

header("8. Preset Registry");

const presets = listPresets();
pass("presets", "count", `${presets.length} presets`);

// Verify all presets have valid URLs
let invalidUrls = 0;
for (const preset of presets) {
  try {
    new URL(preset.baseUrl);
  } catch {
    invalidUrls++;
    fail("presets", `${preset.id} URL`, `invalid: ${preset.baseUrl}`);
  }
}
if (invalidUrls === 0) {
  pass("presets", "all URLs valid", `${presets.length} checked`);
}

// Verify key presets exist
const requiredPresets = [
  "openrouter", "groq", "deepseek", "google", "xai",
  "mistral", "together", "fireworks", "deepinfra",
];
for (const id of requiredPresets) {
  const preset = getPreset(id);
  if (preset) {
    pass("presets", id, `${preset.baseUrl}`);
  } else {
    fail("presets", id, "missing from preset registry");
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════════════════

console.log(`\n${B}${C}${"═".repeat(60)}${X}`);
console.log(`${B}RESULTS: ${G}${passed} passed${X}, ${failed > 0 ? `${R}${failed} failed` : "0 failed"}${X}, ${skipped > 0 ? `${Y}${skipped} skipped` : "0 skipped"}${X}`);

if (failures.length > 0) {
  console.log(`\n${R}${B}Failures:${X}`);
  for (const f of failures) console.log(`  ${R}• ${f}${X}`);
}

console.log();
process.exit(failed > 0 ? 1 : 0);
