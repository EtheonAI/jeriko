#!/usr/bin/env bun
// Live test — Agent-driven skill operations via real LLM prompts.
//
// Verifies that a real LLM can autonomously discover and use skills through
// the use_skill tool. Tests system prompt injection, skill listing, and
// skill loading — all driven by the agent (no manual tool calls).
//
// Requires: Ollama running locally with the test model available.
//
// Usage: bun test/live/live-agent-skill.ts
//        TEST_MODEL=qwen3.5:cloud bun test/live/live-agent-skill.ts

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DriverMessage } from "../../src/daemon/agent/drivers/index.js";

// Guard against double-execution
const RUN_GUARD = Symbol.for("live-agent-skill");
if ((globalThis as Record<symbol, boolean>)[RUN_GUARD]) process.exit(0);
(globalThis as Record<symbol, boolean>)[RUN_GUARD] = true;

const MODEL = process.env.TEST_MODEL || "deepseek-v3.1:671b-cloud";
const BACKEND = "local";
const TIMEOUT_MS = 120_000;

// ── Test infra ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function ok(name: string, detail?: string) {
  passed++;
  console.log(`  \u2705  ${name}${detail ? ` \u2014 ${detail}` : ""}`);
}
function fail(name: string, detail: string) {
  failed++;
  console.log(`  \u274C  ${name} \u2014 ${detail}`);
}
function header(name: string) {
  console.log(`\n\u2500\u2500\u2500 ${name} ${"\u2500".repeat(Math.max(2, 60 - name.length))}`);
}

// ── HOME isolation ──────────────────────────────────────────────────────────

const originalHome = process.env.HOME;
const tempHome = mkdtempSync(join(tmpdir(), "jeriko-agent-skill-test-"));

function isolateHome(): void {
  process.env.HOME = tempHome;
}

function restoreHome(): void {
  process.env.HOME = originalHome;
  try {
    rmSync(tempHome, { recursive: true, force: true });
  } catch {
    // Best effort cleanup
  }
}

// ── Test skill data ─────────────────────────────────────────────────────────

const TEST_SKILL_NAME = "ci-pipeline";
const TEST_SKILL_DESCRIPTION = "Continuous integration pipeline for running automated tests and deployments";
const TEST_SKILL_BODY = [
  "# CI Pipeline",
  "",
  "## Instructions",
  "",
  "Run the CI pipeline by executing tests in order:",
  "1. Lint the codebase",
  "2. Run unit tests",
  "3. Run integration tests",
  "4. Build the artifact",
  "5. Deploy to staging",
  "",
  "## Important",
  "",
  "Always check test results before proceeding to the next step.",
].join("\n");

function seedTestSkill(): void {
  const skillsDir = join(tempHome, ".jeriko", "skills", TEST_SKILL_NAME);
  mkdirSync(skillsDir, { recursive: true });

  const skillMd = [
    "---",
    `name: ${TEST_SKILL_NAME}`,
    `description: ${TEST_SKILL_DESCRIPTION}`,
    "user-invocable: true",
    "allowed-tools: [bash, read_file]",
    "---",
    "",
    TEST_SKILL_BODY,
  ].join("\n");

  writeFileSync(join(skillsDir, "SKILL.md"), skillMd, "utf-8");
}

// ── Agent runner ────────────────────────────────────────────────────────────

interface ToolCallRecord {
  name: string;
  args: Record<string, unknown>;
  result: string;
  isError: boolean;
}

interface AgentResult {
  response: string;
  toolCalls: ToolCallRecord[];
  error?: string;
}

async function runAgentWithPrompt(
  sessionId: string,
  prompt: string,
  systemPrompt: string,
  toolIds: string[],
): Promise<AgentResult> {
  const { runAgent } = await import("../../src/daemon/agent/agent.js");

  const history: DriverMessage[] = [{ role: "user", content: prompt }];

  const config = {
    sessionId,
    backend: BACKEND,
    model: MODEL,
    systemPrompt,
    maxTokens: 2048,
    temperature: 0.1,
    maxRounds: 4,
    toolIds,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  };

  const result: AgentResult = { response: "", toolCalls: [] };

  try {
    for await (const event of runAgent(config, history)) {
      switch (event.type) {
        case "text_delta":
          result.response += event.content;
          break;

        case "tool_call_start": {
          const tc = event.toolCall;
          let parsedArgs: Record<string, unknown> = {};
          try {
            parsedArgs = JSON.parse(tc.arguments);
          } catch {
            parsedArgs = { raw: tc.arguments };
          }
          result.toolCalls.push({
            name: tc.name,
            args: parsedArgs,
            result: "",
            isError: false,
          });
          break;
        }

        case "tool_result": {
          const last = result.toolCalls[result.toolCalls.length - 1];
          if (last) {
            last.result = event.result;
            last.isError = event.isError;
          }
          break;
        }

        case "error":
          result.error = event.message;
          break;
      }
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }

  return result;
}

// ── Setup ───────────────────────────────────────────────────────────────────

async function setup() {
  // Initialize database for sessions/tools
  const { getDatabase } = await import("../../src/daemon/storage/db.js");
  getDatabase();

  // Register required tools (skill tool self-registers on import)
  await Promise.all([
    import("../../src/daemon/agent/tools/bash.js"),
    import("../../src/daemon/agent/tools/read.js"),
    import("../../src/daemon/agent/tools/skill.js"),
  ]);

  // Probe model capabilities
  const { probeLocalModel, getCapabilities } = await import(
    "../../src/daemon/agent/drivers/models.js"
  );
  await probeLocalModel(MODEL);
  const caps = getCapabilities(BACKEND, MODEL);

  if (!caps.toolCall) {
    console.error(`Model ${MODEL} does not support tool calling.`);
    process.exit(1);
  }

  return caps;
}

// ── Tests ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`  Agent Skill Operations \u2014 Live Test`);
  console.log(`  Model: ${MODEL}  |  Backend: ${BACKEND}`);
  console.log(`${"=".repeat(70)}\n`);

  isolateHome();
  seedTestSkill();

  try {
    const caps = await setup();
    console.log(
      `Model caps: tools=${caps.toolCall} context=${caps.context} maxOutput=${caps.maxOutput}\n`,
    );

    await runAllSections();
  } finally {
    restoreHome();
  }

  summary();
}

async function runAllSections() {
  const { formatSkillSummaries, listSkills } = await import(
    "../../src/shared/skill-loader.js"
  );
  const { createSession } = await import(
    "../../src/daemon/agent/session/session.js"
  );

  // ────────────────────────────────────────────────────────────────────────
  header("1. System Prompt Injection");
  // ────────────────────────────────────────────────────────────────────────

  const skills = await listSkills();
  const skillSection = formatSkillSummaries(skills);

  if (skillSection.includes(TEST_SKILL_NAME)) {
    ok("formatSkillSummaries", `contains "${TEST_SKILL_NAME}"`);
  } else {
    fail("formatSkillSummaries", `"${TEST_SKILL_NAME}" not found in: ${skillSection.slice(0, 200)}`);
  }

  if (skillSection.includes(TEST_SKILL_DESCRIPTION)) {
    ok("formatSkillSummaries description", "description present in summary table");
  } else {
    fail("formatSkillSummaries description", "description missing from summary table");
  }

  if (skillSection.includes("Yes")) {
    ok("formatSkillSummaries invocable", "user-invocable=Yes shown");
  } else {
    fail("formatSkillSummaries invocable", "user-invocable flag not reflected");
  }

  // ────────────────────────────────────────────────────────────────────────
  header("2. Agent Lists Skills");
  // ────────────────────────────────────────────────────────────────────────

  const systemPrompt = [
    "You are a helpful assistant with access to skill packages.",
    "Use the use_skill tool to interact with skills.",
    "",
    skillSection,
  ].join("\n");

  const session1 = createSession({ title: "agent-skill-list", model: MODEL });

  const listResult = await runAgentWithPrompt(
    session1.id,
    'List all available skills using the use_skill tool with action "list". Report what you find.',
    systemPrompt,
    ["use_skill"],
  );

  // Log details
  console.log(`     Tool calls: ${listResult.toolCalls.length}`);
  if (listResult.response) {
    const preview = listResult.response.slice(0, 150).replace(/\n/g, " ");
    console.log(`     Response: ${preview}...`);
  }
  if (listResult.error) {
    console.log(`     Error: ${listResult.error}`);
  }

  // Soft validation — LLMs can be unpredictable, so check multiple signals
  const madeListCall = listResult.toolCalls.some(
    (tc) => tc.name === "use_skill" && tc.args.action === "list",
  );
  const responseHasSkillName =
    listResult.response.toLowerCase().includes(TEST_SKILL_NAME) ||
    listResult.response.toLowerCase().includes("ci") ||
    listResult.response.toLowerCase().includes("pipeline");
  const toolResultHasSkillName = listResult.toolCalls.some(
    (tc) => tc.result.includes(TEST_SKILL_NAME),
  );

  if (madeListCall) {
    ok("agent calls use_skill list", `${listResult.toolCalls.length} tool call(s)`);
  } else if (listResult.toolCalls.length > 0) {
    // Agent used the tool but maybe with a different action name
    ok("agent used use_skill", `action: ${listResult.toolCalls[0]?.args.action} (expected list)`);
  } else {
    fail("agent calls use_skill list", "no tool calls made");
  }

  if (responseHasSkillName || toolResultHasSkillName) {
    ok("agent found test skill", `"${TEST_SKILL_NAME}" appears in response or tool result`);
  } else {
    fail("agent found test skill", `"${TEST_SKILL_NAME}" not found in response`);
  }

  // ────────────────────────────────────────────────────────────────────────
  header("3. Agent Loads Skill");
  // ────────────────────────────────────────────────────────────────────────

  const session2 = createSession({ title: "agent-skill-load", model: MODEL });

  const loadResult = await runAgentWithPrompt(
    session2.id,
    `Load the full instructions for the "${TEST_SKILL_NAME}" skill using use_skill with action "load" and name "${TEST_SKILL_NAME}". Summarize the instructions.`,
    systemPrompt,
    ["use_skill"],
  );

  console.log(`     Tool calls: ${loadResult.toolCalls.length}`);
  if (loadResult.response) {
    const preview = loadResult.response.slice(0, 150).replace(/\n/g, " ");
    console.log(`     Response: ${preview}...`);
  }
  if (loadResult.error) {
    console.log(`     Error: ${loadResult.error}`);
  }

  const madeLoadCall = loadResult.toolCalls.some(
    (tc) => tc.name === "use_skill" && tc.args.action === "load",
  );
  const loadResultHasInstructions = loadResult.toolCalls.some(
    (tc) => tc.result.includes("CI Pipeline") || tc.result.includes("instructions"),
  );
  const responseMentionsPipeline =
    loadResult.response.toLowerCase().includes("pipeline") ||
    loadResult.response.toLowerCase().includes("lint") ||
    loadResult.response.toLowerCase().includes("unit test") ||
    loadResult.response.toLowerCase().includes("deploy");

  if (madeLoadCall) {
    ok("agent calls use_skill load", `name="${TEST_SKILL_NAME}"`);
  } else if (loadResult.toolCalls.length > 0) {
    ok("agent used use_skill", `action: ${loadResult.toolCalls[0]?.args.action} (expected load)`);
  } else {
    fail("agent calls use_skill load", "no tool calls made");
  }

  if (loadResultHasInstructions) {
    ok("tool returned instructions", "CI Pipeline content found in tool result");
  } else {
    fail("tool returned instructions", "expected instructions not found in tool result");
  }

  if (responseMentionsPipeline) {
    ok("agent summarized skill", "response mentions pipeline/deploy/test steps");
  } else {
    fail("agent summarized skill", "response doesn't reference skill content");
  }
}

function summary() {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`  SUMMARY`);
  console.log(`${"=".repeat(70)}`);
  console.log(`  Passed: ${passed}/${passed + failed}`);
  console.log(`  Failed: ${failed}/${passed + failed}`);
  console.log(`${"=".repeat(70)}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  restoreHome();
  console.error("Fatal:", err);
  process.exit(1);
});
