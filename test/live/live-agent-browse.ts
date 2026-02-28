#!/usr/bin/env bun
// Live test — Agent loop with browser tool.
// Gives a real LLM a browsing task and watches it use the browser tool.
//
// Usage: bun test/live/live-agent-browse.ts

import type { DriverMessage } from "../../src/daemon/agent/drivers/index.js";

const MODEL = process.env.TEST_MODEL || "deepseek-v3.1:671b-cloud";
const BACKEND = "local";
const TIMEOUT_MS = 120_000;

async function main() {
  console.log(`🤖 Agent + Browser — Live Test (model: ${MODEL})\n`);

  // ── Setup ─────────────────────────────────────────────────────────────
  const { getDatabase } = await import("../../src/daemon/storage/db.js");
  getDatabase();

  // Register all tools including browser
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

  // Probe model capabilities
  const { probeLocalModel, getCapabilities } = await import(
    "../../src/daemon/agent/drivers/models.js"
  );
  await probeLocalModel(MODEL);
  const caps = getCapabilities(BACKEND, MODEL);
  console.log(`Model: ${MODEL}  tools=${caps.toolCall}  context=${caps.context}  maxOutput=${caps.maxOutput}\n`);

  if (!caps.toolCall) {
    console.log("❌ Model does not support tool calling — cannot test agent browse.");
    process.exit(1);
  }

  // List registered tools
  const { listTools } = await import("../../src/daemon/agent/tools/registry.js");
  const tools = listTools();
  console.log(`Registered tools (${tools.length}): ${tools.map(t => t.id).join(", ")}\n`);

  // ── Create session ────────────────────────────────────────────────────
  const { createSession } = await import("../../src/daemon/agent/session/session.js");
  const session = createSession({ title: "agent-browse-test", model: MODEL });

  // ── Agent config ──────────────────────────────────────────────────────
  const { runAgent } = await import("../../src/daemon/agent/agent.js");

  const systemPrompt = `You are a helpful assistant with browser access. You can browse the web using the browser tool.

When asked to browse a website:
1. Use the browser tool with action "navigate" and the URL
2. Read the page content and elements from the response
3. Report what you found: the page title, key content, and notable elements

Always use the browser tool — never make up information about web pages.`;

  const prompt = `Go to https://news.ycombinator.com and tell me the top 3 stories on Hacker News right now. Use the browser tool to navigate there.`;

  console.log(`📝 Prompt: ${prompt}\n`);
  console.log("─".repeat(70));

  const history: DriverMessage[] = [
    { role: "user", content: prompt },
  ];

  const config = {
    sessionId: session.id,
    backend: BACKEND,
    model: MODEL,
    systemPrompt,
    maxTokens: 2048,
    temperature: 0.3,
    maxRounds: 5,
    // Only send browser tool — sending all 10 tools makes qwen2.5 very slow
    toolIds: ["browser"],
    signal: AbortSignal.timeout(TIMEOUT_MS),
  };

  // ── Run agent loop ────────────────────────────────────────────────────
  let response = "";
  let toolCallCount = 0;
  let browserUsed = false;
  const toolCalls: Array<{ name: string; args: string; result: string }> = [];

  try {
    for await (const event of runAgent(config, history)) {
      switch (event.type) {
        case "text_delta":
          process.stdout.write(event.content);
          response += event.content;
          break;

        case "tool_call_start":
          toolCallCount++;
          const tcName = event.toolCall.name;
          let argsPreview = event.toolCall.arguments.slice(0, 100);
          if (tcName === "browser") browserUsed = true;
          console.log(`\n\n🔧 Tool call #${toolCallCount}: ${tcName}(${argsPreview})`);
          toolCalls.push({ name: tcName, args: event.toolCall.arguments, result: "" });
          break;

        case "tool_result":
          const lastTc = toolCalls[toolCalls.length - 1];
          if (lastTc) lastTc.result = event.result.slice(0, 200);
          const preview = event.result.slice(0, 150).replace(/\n/g, " ");
          const status = event.isError ? "❌" : "✅";
          console.log(`   ${status} Result: ${preview}...`);
          break;

        case "turn_complete":
          console.log(`\n\n─── Turn complete: ${event.tokensIn} in / ${event.tokensOut} out ───`);
          break;

        case "error":
          console.log(`\n❌ Error: ${event.message}`);
          break;
      }
    }
  } catch (err) {
    console.log(`\n❌ Fatal: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── Results ───────────────────────────────────────────────────────────
  console.log("\n\n═══════════════════════════════════════════════════════════");
  console.log("Results:");
  console.log(`  Tool calls: ${toolCallCount}`);
  console.log(`  Browser used: ${browserUsed ? "✅ YES" : "❌ NO"}`);
  console.log(`  Response length: ${response.length} chars`);

  if (browserUsed && response.length > 0) {
    console.log("\n  ✅ SUCCESS — Agent used browser tool and generated response");
  } else if (browserUsed) {
    console.log("\n  ⚠️  PARTIAL — Agent used browser but no text response");
  } else if (response.length > 0) {
    console.log("\n  ⚠️  PARTIAL — Agent responded but did NOT use browser tool");
  } else {
    console.log("\n  ❌ FAIL — No browser use and no response");
  }
  console.log("═══════════════════════════════════════════════════════════\n");

  // Close browser if still open
  const { getTool } = await import("../../src/daemon/agent/tools/registry.js");
  const browser = getTool("browser");
  if (browser) await browser.execute({ action: "close" });

  process.exit(browserUsed ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
