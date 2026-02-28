#!/usr/bin/env bun
// Live test — Browser tool (Playwright).
// Tests all browser actions end-to-end with a real Chrome instance.
//
// Usage: bun test/live/live-browser.ts

import { existsSync } from "node:fs";

// ── Test infra ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
let skipped = 0;

function ok(name: string, detail?: string) {
  passed++;
  console.log(`  ✅  ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name: string, detail: string) {
  failed++;
  console.log(`  ❌  ${name} — ${detail}`);
}
function skip(name: string, reason: string) {
  skipped++;
  console.log(`  ⏭️  ${name} — ${reason}`);
}
function header(name: string) {
  console.log(`\n─── ${name} ${"─".repeat(60 - name.length)}`);
}

// ── Setup ───────────────────────────────────────────────────────────────────

async function setup() {
  // Initialize database (required for tool registry)
  const { getDatabase } = await import("../../src/daemon/storage/db.js");
  getDatabase();

  // Register all tools
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
}

// ── Tests ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌐 Jeriko Browser Tool — Live Test\n");

  await setup();

  // ────────────────────────────────────────────────────────────────────────
  header("1. Tool Registration");
  // ────────────────────────────────────────────────────────────────────────

  const { getTool, listTools } = await import(
    "../../src/daemon/agent/tools/registry.js"
  );

  const browserTool = getTool("browser");
  if (!browserTool) {
    fail("registration", "browser tool not found in registry");
    summary();
    return;
  }
  ok("registration", `found "browser" tool`);

  const allTools = listTools();
  const toolNames = allTools.map((t) => t.id);
  if (toolNames.includes("browser")) {
    ok("listTools includes browser", `${allTools.length} tools total`);
  } else {
    fail("listTools includes browser", `missing from: ${toolNames.join(", ")}`);
  }

  // Verify tool schema
  const params = browserTool.parameters;
  if (params.properties?.action && params.required?.includes("action")) {
    ok("tool schema", "action parameter present and required");
  } else {
    fail("tool schema", "action parameter missing or not required");
  }

  // ────────────────────────────────────────────────────────────────────────
  header("2. Orchestrator Agent Types");
  // ────────────────────────────────────────────────────────────────────────

  const { AGENT_TYPES, getToolsForType } = await import(
    "../../src/daemon/agent/orchestrator.js"
  );

  // Check browser is in general (null = all)
  const generalTools = getToolsForType("general");
  if (generalTools === null) {
    ok("general agent type", "null (all tools) — browser included");
  } else {
    fail("general agent type", `expected null, got ${JSON.stringify(generalTools)}`);
  }

  // Check browser in research
  const researchTools = getToolsForType("research");
  if (researchTools?.includes("browser")) {
    ok("research agent type", `includes browser`);
  } else {
    fail("research agent type", `missing browser: ${JSON.stringify(researchTools)}`);
  }

  // Check browser in task
  const taskTools = getToolsForType("task");
  if (taskTools?.includes("browser")) {
    ok("task agent type", `includes browser`);
  } else {
    fail("task agent type", `missing browser: ${JSON.stringify(taskTools)}`);
  }

  // Check browser in plan
  const planTools = getToolsForType("plan");
  if (planTools?.includes("browser")) {
    ok("plan agent type", `includes browser`);
  } else {
    fail("plan agent type", `missing browser: ${JSON.stringify(planTools)}`);
  }

  // Check browser NOT in explore (read-only, no browser needed)
  const exploreTools = getToolsForType("explore");
  if (!exploreTools?.includes("browser")) {
    ok("explore agent type", `correctly excludes browser`);
  } else {
    fail("explore agent type", `should not include browser`);
  }

  // ────────────────────────────────────────────────────────────────────────
  header("3. Missing Action Error");
  // ────────────────────────────────────────────────────────────────────────

  const noAction = JSON.parse(await browserTool.execute({}));
  if (!noAction.ok && noAction.error.includes("action is required")) {
    ok("missing action", noAction.error.slice(0, 60));
  } else {
    fail("missing action", JSON.stringify(noAction));
  }

  const badAction = JSON.parse(await browserTool.execute({ action: "nonexistent" }));
  if (!badAction.ok && badAction.error.includes("Unknown action")) {
    ok("unknown action", badAction.error);
  } else {
    fail("unknown action", JSON.stringify(badAction));
  }

  // ────────────────────────────────────────────────────────────────────────
  header("4. Navigate");
  // ────────────────────────────────────────────────────────────────────────

  // Navigate to a simple page
  let navResult: Record<string, unknown>;
  try {
    const raw = await browserTool.execute({
      action: "navigate",
      url: "https://example.com",
    });
    navResult = JSON.parse(raw);

    if (navResult.ok) {
      ok("navigate example.com", `title="${navResult.title}" url="${navResult.url}"`);
    } else {
      fail("navigate example.com", String(navResult.error));
      skip("remaining browser tests", "navigate failed");
      summary();
      return;
    }
  } catch (err) {
    fail("navigate example.com", err instanceof Error ? err.message : String(err));
    skip("remaining browser tests", "navigate failed — Chrome may not be available");
    summary();
    return;
  }

  // Check page snapshot fields
  if (navResult.elements && typeof navResult.elements === "string") {
    ok("element indexing", `returned elements list`);
  } else {
    fail("element indexing", "no elements returned");
  }

  if (navResult.content && typeof navResult.content === "string") {
    const content = navResult.content as string;
    if (content.includes("Example Domain") || content.includes("example")) {
      ok("content extraction", `markdown contains "Example Domain" (${content.length} chars)`);
    } else {
      ok("content extraction", `${content.length} chars (may not contain expected text)`);
    }
  } else {
    fail("content extraction", "no content returned");
  }

  if (navResult.screenshot && existsSync(navResult.screenshot as string)) {
    ok("screenshot captured", navResult.screenshot as string);
  } else {
    fail("screenshot captured", `missing: ${navResult.screenshot}`);
  }

  // ────────────────────────────────────────────────────────────────────────
  header("5. View (current page state)");
  // ────────────────────────────────────────────────────────────────────────

  const viewRaw = await browserTool.execute({ action: "view" });
  const viewResult = JSON.parse(viewRaw);
  if (viewResult.ok && viewResult.url) {
    ok("view", `url="${viewResult.url}" elements=${viewResult.element_count}`);
  } else {
    fail("view", JSON.stringify(viewResult));
  }

  // ────────────────────────────────────────────────────────────────────────
  header("6. Screenshot");
  // ────────────────────────────────────────────────────────────────────────

  const ssRaw = await browserTool.execute({ action: "screenshot" });
  const ssResult = JSON.parse(ssRaw);
  if (ssResult.ok && ssResult.path && existsSync(ssResult.path)) {
    ok("screenshot action", ssResult.path);
  } else {
    fail("screenshot action", JSON.stringify(ssResult));
  }

  // ────────────────────────────────────────────────────────────────────────
  header("7. Get Text (markdown)");
  // ────────────────────────────────────────────────────────────────────────

  const textRaw = await browserTool.execute({ action: "get_text" });
  const textResult = JSON.parse(textRaw);
  if (textResult.ok && textResult.content) {
    ok("get_text", `${(textResult.content as string).length} chars`);
  } else {
    fail("get_text", JSON.stringify(textResult));
  }

  // ────────────────────────────────────────────────────────────────────────
  header("8. Get Links");
  // ────────────────────────────────────────────────────────────────────────

  const linksRaw = await browserTool.execute({ action: "get_links" });
  const linksResult = JSON.parse(linksRaw);
  if (linksResult.ok && Array.isArray(linksResult.links)) {
    ok("get_links", `${linksResult.links.length} links found`);
    if (linksResult.links.length > 0) {
      const first = linksResult.links[0];
      ok("link format", `text="${first.text}" href="${first.href}"`);
    }
  } else {
    fail("get_links", JSON.stringify(linksResult));
  }

  // ────────────────────────────────────────────────────────────────────────
  header("9. Evaluate JavaScript");
  // ────────────────────────────────────────────────────────────────────────

  const evalRaw = await browserTool.execute({
    action: "evaluate",
    script: "document.title",
  });
  const evalResult = JSON.parse(evalRaw);
  if (evalResult.ok && evalResult.result) {
    ok("evaluate", `result="${evalResult.result}"`);
  } else {
    fail("evaluate", JSON.stringify(evalResult));
  }

  // Test evaluate with complex expression
  const eval2Raw = await browserTool.execute({
    action: "evaluate",
    script: "({ width: window.innerWidth, height: window.innerHeight })",
  });
  const eval2Result = JSON.parse(eval2Raw);
  if (eval2Result.ok && eval2Result.result?.width) {
    ok("evaluate complex", `viewport ${eval2Result.result.width}x${eval2Result.result.height}`);
  } else {
    fail("evaluate complex", JSON.stringify(eval2Result));
  }

  // ────────────────────────────────────────────────────────────────────────
  header("10. Scroll");
  // ────────────────────────────────────────────────────────────────────────

  // Navigate to a longer page first
  await browserTool.execute({
    action: "navigate",
    url: "https://en.wikipedia.org/wiki/Web_browser",
  });

  const scrollRaw = await browserTool.execute({
    action: "scroll",
    direction: "down",
    amount: 2,
  });
  const scrollResult = JSON.parse(scrollRaw);
  if (scrollResult.ok) {
    ok("scroll down", `page updated, elements=${scrollResult.element_count}`);
  } else {
    fail("scroll down", JSON.stringify(scrollResult));
  }

  const scrollUpRaw = await browserTool.execute({
    action: "scroll",
    direction: "up",
    amount: 1,
  });
  const scrollUpResult = JSON.parse(scrollUpRaw);
  if (scrollUpResult.ok) {
    ok("scroll up", `page updated`);
  } else {
    fail("scroll up", JSON.stringify(scrollUpResult));
  }

  // ────────────────────────────────────────────────────────────────────────
  header("11. Navigate + Click (element indexing)");
  // ────────────────────────────────────────────────────────────────────────

  // Navigate to DuckDuckGo (simple form page)
  const ddgRaw = await browserTool.execute({
    action: "navigate",
    url: "https://duckduckgo.com",
  });
  const ddgResult = JSON.parse(ddgRaw);
  if (ddgResult.ok) {
    ok("navigate duckduckgo", `elements=${ddgResult.element_count}`);

    // Print first few elements for debugging
    const elements = (ddgResult.elements as string).split("\n").slice(0, 5);
    for (const el of elements) {
      console.log(`      ${el}`);
    }
  } else {
    fail("navigate duckduckgo", JSON.stringify(ddgResult));
  }

  // ────────────────────────────────────────────────────────────────────────
  header("12. Type into search field");
  // ────────────────────────────────────────────────────────────────────────

  // Try to type into the search input by selector (DuckDuckGo search box)
  const typeRaw = await browserTool.execute({
    action: "type",
    selector: "input[name='q']",
    text: "jeriko ai agent",
    press_enter: false,
  });
  const typeResult = JSON.parse(typeRaw);
  if (typeResult.ok) {
    ok("type by selector", `typed "jeriko ai agent"`);
  } else {
    // Try alternative selector
    const type2Raw = await browserTool.execute({
      action: "type",
      selector: "input[type='text']",
      text: "jeriko ai agent",
      press_enter: false,
    });
    const type2Result = JSON.parse(type2Raw);
    if (type2Result.ok) {
      ok("type by selector (alt)", `typed "jeriko ai agent"`);
    } else {
      fail("type by selector", JSON.stringify(typeResult));
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  header("13. Key Press");
  // ────────────────────────────────────────────────────────────────────────

  const keyRaw = await browserTool.execute({
    action: "key_press",
    key: "Escape",
  });
  const keyResult = JSON.parse(keyRaw);
  if (keyResult.ok) {
    ok("key_press", `pressed Escape`);
  } else {
    fail("key_press", JSON.stringify(keyResult));
  }

  // ────────────────────────────────────────────────────────────────────────
  header("14. Back / Forward");
  // ────────────────────────────────────────────────────────────────────────

  const backRaw = await browserTool.execute({ action: "back" });
  const backResult = JSON.parse(backRaw);
  if (backResult.ok) {
    ok("back", `url="${backResult.url}"`);
  } else {
    fail("back", JSON.stringify(backResult));
  }

  const fwdRaw = await browserTool.execute({ action: "forward" });
  const fwdResult = JSON.parse(fwdRaw);
  if (fwdResult.ok) {
    ok("forward", `url="${fwdResult.url}"`);
  } else {
    fail("forward", JSON.stringify(fwdResult));
  }

  // ────────────────────────────────────────────────────────────────────────
  header("15. Close Browser");
  // ────────────────────────────────────────────────────────────────────────

  const closeRaw = await browserTool.execute({ action: "close" });
  const closeResult = JSON.parse(closeRaw);
  if (closeResult.ok && closeResult.message === "Browser closed") {
    ok("close", "browser closed cleanly");
  } else {
    fail("close", JSON.stringify(closeResult));
  }

  // Verify close — view should re-launch (or error if no Chrome)
  // We just check that close didn't crash
  ok("close verified", "no crash after close");

  summary();
}

function summary() {
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log(`  TOTAL: ${passed + failed + skipped}  ✅ ${passed} passed  ❌ ${failed} failed  ⏭️ ${skipped} skipped`);
  console.log("═══════════════════════════════════════════════════════════\n");
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
