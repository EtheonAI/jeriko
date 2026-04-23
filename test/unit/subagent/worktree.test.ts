// Worktree lifecycle tests — create a throwaway git repo, spin up a
// worktree, verify cleanup semantics in both "no changes" and
// "has changes" paths. Skipped if the environment has no `git` binary.

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { createWorktree, WorktreeError } from "../../../src/daemon/agent/subagent/worktree.js";

const hasGit = spawnSync("git", ["--version"]).status === 0;

let repoRoot = "";

beforeAll(async () => {
  if (!hasGit) return;
  repoRoot = await mkdtemp(join(tmpdir(), "jeriko-wt-repo-"));
  // Minimal git repo with one commit so worktrees have a branch to base on.
  run(repoRoot, "git", "init", "-q", "-b", "main");
  run(repoRoot, "git", "config", "user.email", "test@example.com");
  run(repoRoot, "git", "config", "user.name", "test");
  run(repoRoot, "git", "config", "commit.gpgsign", "false");
  await writeFile(join(repoRoot, "README.md"), "seed\n");
  run(repoRoot, "git", "add", ".");
  run(repoRoot, "git", "commit", "-q", "-m", "seed");
});

afterAll(async () => {
  if (repoRoot && existsSync(repoRoot)) {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

function run(cwd: string, cmd: string, ...args: string[]) {
  const result = spawnSync(cmd, args, { cwd, stdio: "pipe" });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed: ${result.stderr.toString()}`);
  }
}

describe.skipIf(!hasGit)("createWorktree", () => {
  it("creates a worktree on a fresh branch", async () => {
    const wt = await createWorktree({ cwd: repoRoot, taskId: "tcreate" });
    try {
      expect(wt.branch).toBe("jeriko/subagent/tcreate");
      expect(existsSync(wt.path)).toBe(true);
      expect(existsSync(join(wt.path, "README.md"))).toBe(true);
    } finally {
      await wt.release({ preserveIfChanged: false });
    }
  });

  it("removes the worktree and branch when nothing changed", async () => {
    const wt = await createWorktree({ cwd: repoRoot, taskId: "tclean" });
    const outcome = await wt.release({ preserveIfChanged: true });
    expect(outcome.removed).toBe(true);
    expect(outcome.preservedDueToChanges).toBe(false);
    expect(existsSync(wt.path)).toBe(false);
  });

  it("preserves the worktree when changes exist", async () => {
    const wt = await createWorktree({ cwd: repoRoot, taskId: "tkeep" });
    try {
      await writeFile(join(wt.path, "new-file.txt"), "child output\n");
      const outcome = await wt.release({ preserveIfChanged: true });
      expect(outcome.preservedDueToChanges).toBe(true);
      expect(outcome.removed).toBe(false);
      // Path still exists for the user to inspect.
      expect(existsSync(wt.path)).toBe(true);
    } finally {
      // Clean up ourselves so the next test doesn't inherit stale state.
      spawnSync("git", ["worktree", "remove", "--force", "jeriko/subagent/tkeep"], { cwd: repoRoot });
      spawnSync("git", ["branch", "-D", "jeriko/subagent/tkeep"], { cwd: repoRoot });
    }
  });

  it("rejects a cwd outside any git repo with WorktreeError", async () => {
    const outside = await mkdtemp(join(tmpdir(), "jeriko-wt-outside-"));
    try {
      await expect(
        createWorktree({ cwd: outside, taskId: "toutside" }),
      ).rejects.toBeInstanceOf(WorktreeError);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});
