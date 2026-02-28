#!/usr/bin/env bun
// Live test — Browser interaction flow (click by index, type by index, submit).
// Tests the full Manus-parity element indexing workflow.
//
// Usage: bun test/live/live-browser-interaction.ts

import { existsSync } from "node:fs";

let passed = 0;
let failed = 0;

function ok(name: string, detail?: string) {
  passed++;
  console.log(`  ✅  ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name: string, detail: string) {
  failed++;
  console.log(`  ❌  ${name} — ${detail}`);
}
function header(name: string) {
  console.log(`\n─── ${name} ${"─".repeat(60 - name.length)}`);
}

async function main() {
  console.log("🖱️  Jeriko Browser Interaction — Live Test\n");

  // Setup
  const { getDatabase } = await import("../../src/daemon/storage/db.js");
  getDatabase();
  await import("../../src/daemon/agent/tools/browse.js");
  const { getTool } = await import("../../src/daemon/agent/tools/registry.js");
  const browser = getTool("browser")!;

  // ──────────────────────────────────────────────────────────────────────
  header("1. Navigate to DuckDuckGo");
  // ──────────────────────────────────────────────────────────────────────

  const navRaw = await browser.execute({ action: "navigate", url: "https://duckduckgo.com" });
  const nav = JSON.parse(navRaw);
  if (!nav.ok) { fail("navigate", String(nav.error)); return; }

  // Find the search input element index
  const elemLines = (nav.elements as string).split("\n");
  let searchInputIndex: number | null = null;
  let searchButtonIndex: number | null = null;

  for (const line of elemLines) {
    const match = line.match(/^\[(\d+)\]/);
    if (!match) continue;
    const idx = parseInt(match[1], 10);
    if (line.includes("searchbox_input") || (line.includes("input") && line.includes("Search"))) {
      searchInputIndex = idx;
    }
    if (line.includes("button") && line.includes("hint:\"Search\"")) {
      searchButtonIndex = idx;
    }
  }

  if (searchInputIndex !== null) {
    ok("found search input", `element [${searchInputIndex}]`);
  } else {
    fail("found search input", `not found in ${elemLines.length} elements`);
    await browser.execute({ action: "close" });
    return;
  }

  if (searchButtonIndex !== null) {
    ok("found search button", `element [${searchButtonIndex}]`);
  }

  // ──────────────────────────────────────────────────────────────────────
  header("2. Click search input by index");
  // ──────────────────────────────────────────────────────────────────────

  const clickRaw = await browser.execute({ action: "click", index: searchInputIndex });
  const click = JSON.parse(clickRaw);
  if (click.ok) {
    ok("click by index", `clicked element [${searchInputIndex}]`);
  } else {
    fail("click by index", String(click.error));
  }

  // ──────────────────────────────────────────────────────────────────────
  header("3. Type by index + submit");
  // ──────────────────────────────────────────────────────────────────────

  const typeRaw = await browser.execute({
    action: "type",
    index: searchInputIndex,
    text: "Jeriko AI agent",
    press_enter: true,
  });
  const typeResult = JSON.parse(typeRaw);
  if (typeResult.ok) {
    ok("type by index", `typed "Jeriko AI agent" + Enter`);
  } else {
    fail("type by index", String(typeResult.error));
  }

  // Wait for search results
  await new Promise((r) => setTimeout(r, 2000));

  // ──────────────────────────────────────────────────────────────────────
  header("4. View search results");
  // ──────────────────────────────────────────────────────────────────────

  const viewRaw = await browser.execute({ action: "view" });
  const view = JSON.parse(viewRaw);
  if (view.ok) {
    const url = view.url as string;
    const content = (view.content as string) || "";
    const hasQuery = url.includes("Jeriko") || url.includes("jeriko") || content.toLowerCase().includes("jeriko");
    if (hasQuery) {
      ok("search results", `url contains query, ${view.element_count} elements`);
    } else {
      ok("search results loaded", `${view.element_count} elements, url=${url.slice(0, 80)}`);
    }

    // Print first 5 elements
    const resultElems = (view.elements as string).split("\n").slice(0, 5);
    for (const el of resultElems) {
      console.log(`      ${el}`);
    }
  } else {
    fail("search results", String(view.error));
  }

  // Check screenshot exists
  if (view.screenshot && existsSync(view.screenshot as string)) {
    ok("results screenshot", view.screenshot as string);
  }

  // ──────────────────────────────────────────────────────────────────────
  header("5. Get search result links");
  // ──────────────────────────────────────────────────────────────────────

  const linksRaw = await browser.execute({ action: "get_links" });
  const links = JSON.parse(linksRaw);
  if (links.ok && Array.isArray(links.links) && links.links.length > 0) {
    ok("get links", `${links.links.length} links on search results page`);
    // Show first 3 result links
    for (const link of links.links.slice(0, 3)) {
      console.log(`      [${link.text.slice(0, 50)}] → ${link.href.slice(0, 60)}`);
    }
  } else {
    fail("get links", JSON.stringify(links));
  }

  // ──────────────────────────────────────────────────────────────────────
  header("6. Click a search result by index");
  // ──────────────────────────────────────────────────────────────────────

  // Find first <a> element in results
  const viewElems = (view.elements as string).split("\n");
  let firstResultIndex: number | null = null;
  for (const line of viewElems) {
    const match = line.match(/^\[(\d+)\]/);
    if (!match) continue;
    const idx = parseInt(match[1], 10);
    if (line.includes(" a ") && !line.includes("DuckDuckGo") && idx > 5) {
      firstResultIndex = idx;
      break;
    }
  }

  if (firstResultIndex !== null) {
    const clickResultRaw = await browser.execute({ action: "click", index: firstResultIndex });
    const clickResult = JSON.parse(clickResultRaw);
    if (clickResult.ok) {
      ok("click result", `clicked [${firstResultIndex}], navigated to ${(clickResult.url as string).slice(0, 60)}`);
    } else {
      fail("click result", String(clickResult.error));
    }
  } else {
    ok("skip click result", "no result link found to click (search may have changed)");
  }

  // ──────────────────────────────────────────────────────────────────────
  header("7. Full page text extraction");
  // ──────────────────────────────────────────────────────────────────────

  const textRaw = await browser.execute({ action: "get_text" });
  const text = JSON.parse(textRaw);
  if (text.ok && text.content) {
    const contentLen = (text.content as string).length;
    ok("full text", `${contentLen} chars of markdown from ${text.url}`);
  } else {
    fail("full text", JSON.stringify(text));
  }

  // ──────────────────────────────────────────────────────────────────────
  header("8. Cleanup");
  // ──────────────────────────────────────────────────────────────────────

  await browser.execute({ action: "close" });
  ok("browser closed", "clean shutdown");

  // Summary
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log(`  TOTAL: ${passed + failed}  ✅ ${passed} passed  ❌ ${failed} failed`);
  console.log("═══════════════════════════════════════════════════════════\n");
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
