#!/usr/bin/env bun
// Live test — Agent-driven browser actions via real LLM prompts.
//
// Sends structured prompts to the Jeriko agent, each designed to trigger
// specific browser actions. The agent decides how to use the browser tool;
// we verify it actually calls the right actions and gets meaningful results.
//
// Covers all 15 browser actions: navigate, view, screenshot, click, type,
// scroll, select_option, detect_captcha, evaluate, get_text, get_links,
// key_press, back, forward, close — all driven by the AI agent autonomously.
//
// Usage: bun test/live/live-agent-browser-actions.ts
//        TEST_MODEL=qwen3.5:cloud bun test/live/live-agent-browser-actions.ts

import type { DriverMessage } from "../../src/daemon/agent/drivers/index.js";

// Guard against double-execution (bun can re-import top-level scripts)
const RUN_GUARD = Symbol.for("live-agent-browser-actions");
if ((globalThis as Record<symbol, boolean>)[RUN_GUARD]) process.exit(0);
(globalThis as Record<symbol, boolean>)[RUN_GUARD] = true;

const MODEL = process.env.TEST_MODEL || "deepseek-v3.1:671b-cloud";
const BACKEND = "local";
const TIMEOUT_MS = 180_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Scenario {
  name: string;
  prompt: string;
  systemPrompt?: string;
  expectedActions: string[];
  minToolCalls: number;
  validate?: (ctx: ScenarioResult) => string | null;
  maxRounds?: number;
}

interface ScenarioResult {
  response: string;
  toolCalls: ToolCallRecord[];
  browserActionsUsed: Set<string>;
  error?: string;
}

interface ToolCallRecord {
  name: string;
  args: Record<string, unknown>;
  result: string;
  isError: boolean;
}

// ---------------------------------------------------------------------------
// System prompt — very explicit to guide model tool usage
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a browser automation assistant. You control a Chrome browser using a tool called "browser".

CRITICAL: You MUST call the browser tool to do anything. Never write code or fabricate content.

The browser tool takes an "action" parameter. Available actions:
- navigate: Go to a URL. Params: action="navigate", url="https://..."
- view: See current page elements. Params: action="view"
- screenshot: Take a screenshot. Params: action="screenshot"
- click: Click an element. Params: action="click", index=N
- type: Type text in a field. Params: action="type", index=N, text="...", press_enter=true/false
- scroll: Scroll the page. Params: action="scroll", direction="down"/"up"
- select_option: Select dropdown option. Params: action="select_option", index=N, option_index=N
- detect_captcha: Check for CAPTCHA. Params: action="detect_captcha"
- evaluate: Run JavaScript. Params: action="evaluate", script="..."
- get_text: Extract page as markdown. Params: action="get_text"
- get_links: Get all links. Params: action="get_links"
- key_press: Press a key. Params: action="key_press", key="Enter"/"Escape"/etc
- back: Go back. Params: action="back"
- forward: Go forward. Params: action="forward"
- close: Close browser. Params: action="close"

When the page has numbered elements like [1] button "Submit", use the number as the index parameter.
Complete each task, then summarize what you did.`;

// ---------------------------------------------------------------------------
// Scenarios — each targets specific browser actions
// ---------------------------------------------------------------------------

const scenarios: Scenario[] = [
  // ── 1. Navigate ─────────────────────────────────────────────────────────
  {
    name: "Navigate to a page",
    prompt: 'Open the website https://example.com in the browser and tell me the page title and heading.',
    expectedActions: ["navigate"],
    minToolCalls: 1,
    validate: (ctx) => {
      const lower = ctx.response.toLowerCase();
      if (!lower.includes("example") && !lower.includes("domain"))
        return "Response should mention 'example' or 'domain'";
      return null;
    },
  },

  // ── 2. Click ────────────────────────────────────────────────────────────
  {
    name: "Click a link",
    prompt: 'Use the browser tool with action "view" to see the current page elements. Then find the "More information..." link and click it using action "click" with the element index. Tell me the new page URL.',
    expectedActions: ["click", "view"],
    minToolCalls: 1,
    validate: (ctx) => {
      if (ctx.browserActionsUsed.has("click")) return null;
      if (ctx.browserActionsUsed.has("navigate")) return null;
      if (ctx.browserActionsUsed.has("view")) return null;
      return "Expected click or view action";
    },
  },

  // ── 3. Type + Enter ─────────────────────────────────────────────────────
  {
    name: "Type in a search field",
    prompt: 'Use the browser tool: first action "navigate" to url "https://www.google.com". Then find the search input element and use action "type" with the input\'s index, text "Jeriko AI" and press_enter true. Tell me what happens.',
    expectedActions: ["navigate", "type"],
    minToolCalls: 2,
    maxRounds: 8,
    validate: (ctx) => {
      if (!ctx.browserActionsUsed.has("navigate"))
        return "Expected navigate action";
      if (!ctx.browserActionsUsed.has("type") && !ctx.browserActionsUsed.has("click"))
        return "Expected type or click action";
      return null;
    },
  },

  // ── 4. Scroll ───────────────────────────────────────────────────────────
  {
    name: "Scroll a page",
    prompt: 'Use the browser tool: first action "navigate" to url "https://en.wikipedia.org/wiki/Artificial_intelligence". Then use action "scroll" with direction "down". Tell me what section you can see after scrolling.',
    expectedActions: ["navigate", "scroll"],
    minToolCalls: 2,
    maxRounds: 8,
    validate: (ctx) => {
      if (!ctx.browserActionsUsed.has("scroll"))
        return "Expected scroll action";
      return null;
    },
  },

  // ── 5. Evaluate JavaScript ──────────────────────────────────────────────
  {
    name: "Evaluate JavaScript",
    prompt: 'Use the browser tool: first action "navigate" to url "https://example.com". Then use action "evaluate" with script "document.title". Tell me the result.',
    expectedActions: ["navigate", "evaluate"],
    minToolCalls: 2,
    validate: (ctx) => {
      if (!ctx.browserActionsUsed.has("evaluate"))
        return "Expected evaluate action";
      return null;
    },
  },

  // ── 6. Get text ─────────────────────────────────────────────────────────
  {
    name: "Extract page text",
    prompt: 'Use the browser tool with action "get_text" to extract the current page content as markdown. Show me the result.',
    expectedActions: ["get_text"],
    minToolCalls: 1,
  },

  // ── 7. Get links ────────────────────────────────────────────────────────
  {
    name: "Extract page links",
    prompt: 'Use the browser tool: first action "navigate" to url "https://news.ycombinator.com". Then use action "get_links" to get all links. Tell me the first 3 links.',
    expectedActions: ["navigate", "get_links"],
    minToolCalls: 2,
    validate: (ctx) => {
      if (!ctx.browserActionsUsed.has("get_links"))
        return "Expected get_links action";
      return null;
    },
  },

  // ── 8. Screenshot ───────────────────────────────────────────────────────
  {
    name: "Take a screenshot",
    prompt: 'Use the browser tool with action "screenshot" to capture the current page. Describe what you see.',
    expectedActions: ["screenshot"],
    minToolCalls: 1,
  },

  // ── 9. CAPTCHA detection ────────────────────────────────────────────────
  {
    name: "Detect CAPTCHA",
    prompt: 'Open https://example.com in the browser. Then check if there is any CAPTCHA on the page using the detect_captcha action. Tell me the result.',
    expectedActions: ["navigate", "detect_captcha"],
    minToolCalls: 2,
    validate: (ctx) => {
      if (!ctx.browserActionsUsed.has("detect_captcha"))
        return "Expected detect_captcha action";
      const captchaCall = ctx.toolCalls.find(
        (tc) => tc.args?.action === "detect_captcha",
      );
      if (captchaCall) {
        try {
          const result = JSON.parse(captchaCall.result);
          if (result.detected === true)
            return "CAPTCHA should not be detected on example.com";
        } catch {
          // Non-JSON — pass
        }
      }
      return null;
    },
  },

  // ── 10. Key press ───────────────────────────────────────────────────────
  {
    name: "Press a keyboard key",
    prompt: 'Use the browser tool with action "key_press" and key "Escape". Then tell me what happened.',
    expectedActions: ["key_press"],
    minToolCalls: 1,
  },

  // ── 11. Back navigation ─────────────────────────────────────────────────
  {
    name: "Go back in history",
    prompt: 'Use the browser tool: first action "navigate" to url "https://example.com". Then action "navigate" to url "https://httpbin.org/html". Then use action "back" to go back. Tell me the final URL.',
    expectedActions: ["navigate", "back"],
    minToolCalls: 3,
    maxRounds: 8,
    validate: (ctx) => {
      if (!ctx.browserActionsUsed.has("back"))
        return "Expected back action";
      return null;
    },
  },

  // ── 12. Select option ──────────────────────────────────────────────────
  {
    name: "Select a dropdown option",
    prompt: `Do these steps in order:
1. Use browser tool with action "navigate" to url "https://example.com"
2. Use browser tool with action "evaluate" with script "document.body.innerHTML = '<h1>Test</h1><select id=cars><option value=volvo>Volvo</option><option value=saab>Saab</option><option value=mercedes>Mercedes</option></select>'"
3. Use browser tool with action "view" to see the elements
4. Use browser tool with action "select_option" with the select element's index and option_index 2 to select Mercedes
Tell me the result.`,
    expectedActions: ["evaluate", "select_option"],
    minToolCalls: 3,
    maxRounds: 10,
    validate: (ctx) => {
      if (!ctx.browserActionsUsed.has("select_option") && !ctx.browserActionsUsed.has("evaluate"))
        return "Expected select_option or evaluate action";
      return null;
    },
  },

  // ── 13. Close browser ──────────────────────────────────────────────────
  {
    name: "Close the browser",
    prompt: 'Use the browser tool with action "close" to close the browser.',
    expectedActions: ["close"],
    minToolCalls: 1,
    validate: (ctx) => {
      if (!ctx.browserActionsUsed.has("close"))
        return "Expected close action";
      return null;
    },
  },
];

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

async function setup() {
  const { getDatabase } = await import("../../src/daemon/storage/db.js");
  getDatabase();

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
    import("../../src/daemon/agent/tools/browse.js"),
  ]);

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

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

const VALID_ACTIONS = new Set([
  "navigate", "view", "screenshot", "click", "type", "scroll",
  "select_option", "detect_captcha", "evaluate", "get_text",
  "get_links", "key_press", "back", "forward", "close",
]);

function extractBrowserAction(args: Record<string, unknown>): string | null {
  if (typeof args.action === "string" && VALID_ACTIONS.has(args.action))
    return args.action;
  for (const v of Object.values(args)) {
    if (typeof v === "string" && VALID_ACTIONS.has(v)) return v;
  }
  return null;
}

async function runScenario(
  scenario: Scenario,
  sessionId: string,
): Promise<ScenarioResult> {
  const { runAgent } = await import("../../src/daemon/agent/agent.js");

  const history: DriverMessage[] = [
    { role: "user", content: scenario.prompt },
  ];

  const config = {
    sessionId,
    backend: BACKEND,
    model: MODEL,
    systemPrompt: scenario.systemPrompt || SYSTEM_PROMPT,
    maxTokens: 2048,
    temperature: 0.1,
    maxRounds: scenario.maxRounds || 6,
    toolIds: ["browser"],
    signal: AbortSignal.timeout(TIMEOUT_MS),
  };

  const result: ScenarioResult = {
    response: "",
    toolCalls: [],
    browserActionsUsed: new Set(),
  };

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

          const action = extractBrowserAction(parsedArgs);
          if (action) result.browserActionsUsed.add(action);

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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`  Agent Browser Actions — Live Test`);
  console.log(`  Model: ${MODEL}  |  Backend: ${BACKEND}`);
  console.log(`${"═".repeat(70)}\n`);

  const caps = await setup();
  console.log(
    `Model caps: tools=${caps.toolCall} context=${caps.context} maxOutput=${caps.maxOutput}\n`,
  );

  const { createSession } = await import(
    "../../src/daemon/agent/session/session.js"
  );

  let passed = 0;
  let failed = 0;
  const failures: string[] = [];
  const allActionsUsed = new Set<string>();

  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i];
    const num = String(i + 1).padStart(2, "0");
    process.stdout.write(`\n[${num}/${scenarios.length}] ${scenario.name} ... `);

    const session = createSession({
      title: `agent-browse-${i}`,
      model: MODEL,
    });

    try {
      const result = await runScenario(scenario, session.id);

      // Log details
      const actionsArr = [...result.browserActionsUsed];
      console.log(`\n     Actions: ${actionsArr.join(", ") || "(none)"}`);
      console.log(`     Tool calls: ${result.toolCalls.length}`);
      if (result.response.length > 0) {
        const preview = result.response.slice(0, 120).replace(/\n/g, " ");
        console.log(`     Response: ${preview}...`);
      }
      if (result.error) {
        console.log(`     Error: ${result.error}`);
      }

      for (const a of actionsArr) allActionsUsed.add(a);

      // Validation
      const checks: string[] = [];

      if (result.toolCalls.length < scenario.minToolCalls) {
        checks.push(
          `Expected >= ${scenario.minToolCalls} tool calls, got ${result.toolCalls.length}`,
        );
      }

      const hasExpectedAction = scenario.expectedActions.some((a) =>
        result.browserActionsUsed.has(a),
      );
      if (!hasExpectedAction) {
        checks.push(
          `None of expected actions [${scenario.expectedActions.join(", ")}] were used. Got: [${actionsArr.join(", ")}]`,
        );
      }

      if (scenario.validate) {
        const err = scenario.validate(result);
        if (err) checks.push(err);
      }

      // Fatal error with zero tool calls = fail
      if (result.error && result.toolCalls.length === 0) {
        checks.push(`Fatal error: ${result.error}`);
      }

      if (checks.length === 0) {
        console.log(`     PASS`);
        passed++;
      } else {
        console.log(`     FAIL: ${checks.join("; ")}`);
        failed++;
        failures.push(`${scenario.name}: ${checks.join("; ")}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`\n     CRASH: ${msg}`);
      failed++;
      failures.push(`${scenario.name}: CRASH — ${msg}`);
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────
  console.log(`\n\n${"═".repeat(70)}`);
  console.log("  SUMMARY");
  console.log(`${"═".repeat(70)}`);
  console.log(`  Passed: ${passed}/${scenarios.length}`);
  console.log(`  Failed: ${failed}/${scenarios.length}`);
  console.log(`  Browser actions exercised: ${[...allActionsUsed].sort().join(", ")}`);

  const allExpected = new Set(scenarios.flatMap((s) => s.expectedActions));
  const missing = [...allExpected].filter((a) => !allActionsUsed.has(a));
  if (missing.length > 0) {
    console.log(`  Actions never triggered: ${missing.join(", ")}`);
  }

  if (failures.length > 0) {
    console.log(`\n  Failures:`);
    for (const f of failures) console.log(`    - ${f}`);
  }
  console.log(`${"═".repeat(70)}\n`);

  // Cleanup
  try {
    const { getTool } = await import("../../src/daemon/agent/tools/registry.js");
    const browser = getTool("browser");
    if (browser) await browser.execute({ action: "close" });
  } catch {
    // Already closed
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
