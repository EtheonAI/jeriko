// Instructions discovery + format tests. Uses a tmpdir layered project
// tree so no real repo paths leak into assertions.

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { buildInstructionsBlock } from "../../../src/daemon/agent/instructions/index.js";
import { discoverInstructions } from "../../../src/daemon/agent/instructions/discovery.js";
import { formatInstructions } from "../../../src/daemon/agent/instructions/format.js";

let projectRoot: string;
let innerDir: string;

beforeAll(() => {
  projectRoot = mkdtempSync(join(tmpdir(), "jeriko-instr-"));
  // Fake repo marker at the root so the walk stops here.
  writeFileSync(join(projectRoot, "package.json"), "{}");
  writeFileSync(join(projectRoot, "CLAUDE.md"), "root level CLAUDE");
  writeFileSync(join(projectRoot, "AGENTS.md"), "root level AGENTS");

  innerDir = join(projectRoot, "src", "deep");
  mkdirSync(innerDir, { recursive: true });
  writeFileSync(join(innerDir, "CLAUDE.md"), "nearest CLAUDE wins");
});

afterAll(() => {
  try { rmSync(projectRoot, { recursive: true, force: true }); } catch { /* best effort */ }
});

describe("discoverInstructions", () => {
  it("finds nearest-first and stops at the repo marker", () => {
    const out = discoverInstructions({ cwd: innerDir });
    const paths = out.map((d) => d.path);
    expect(paths[0]).toContain("src/deep/CLAUDE.md");
    expect(paths.some((p) => p.endsWith("CLAUDE.md"))).toBe(true);
    expect(paths.some((p) => p.endsWith("AGENTS.md"))).toBe(true);
    // Walking stops once the repo marker is seen.
    const oneAbove = out.filter((d) => d.depth > 2);
    expect(oneAbove).toHaveLength(0);
  });

  it("returns [] when nothing is found", () => {
    const empty = mkdtempSync(join(tmpdir(), "jeriko-instr-empty-"));
    try {
      writeFileSync(join(empty, "package.json"), "{}");
      expect(discoverInstructions({ cwd: empty })).toHaveLength(0);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe("formatInstructions", () => {
  it("returns empty block for empty input", () => {
    const block = formatInstructions([]);
    expect(block.text).toBe("");
    expect(block.sources).toEqual([]);
    expect(block.truncated).toBe(false);
  });

  it("prepends header and wraps each file", () => {
    const block = formatInstructions([
      { path: "/a/CLAUDE.md", depth: 0, content: "project rules", kind: "CLAUDE" },
    ]);
    expect(block.text).toContain("PROJECT INSTRUCTIONS");
    expect(block.text).toContain("CLAUDE");
    expect(block.text).toContain("/a/CLAUDE.md");
    expect(block.text).toContain("project rules");
    expect(block.sources).toEqual(["/a/CLAUDE.md"]);
  });

  it("truncates when the budget is exceeded", () => {
    const huge = "x".repeat(20_000);
    const block = formatInstructions(
      [
        { path: "/a/CLAUDE.md", depth: 0, content: huge, kind: "CLAUDE" },
        { path: "/a/AGENTS.md", depth: 0, content: huge, kind: "AGENTS" },
      ],
      { maxTokens: 1000 },
    );
    // Either truncated=true, or 0/1 sources kept.
    expect(block.sources.length).toBeLessThanOrEqual(1);
    if (block.sources.length < 2) expect(block.truncated).toBe(true);
  });
});

describe("buildInstructionsBlock integration", () => {
  it("returns a block with the nearest file first", () => {
    const block = buildInstructionsBlock({ cwd: innerDir });
    expect(block.sources.length).toBeGreaterThan(0);
    expect(block.sources[0]).toContain("src/deep/CLAUDE.md");
    expect(block.text).toContain("nearest CLAUDE wins");
  });
});
