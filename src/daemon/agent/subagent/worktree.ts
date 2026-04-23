// Worktree isolation for subagents (Feature 5).
//
// When a subagent runs destructive or experimental work (mass edits, code
// migrations, risky refactors), spawning it inside a dedicated git worktree
// keeps the parent's working tree pristine. On completion:
//   • if the child made no changes, the worktree is deleted silently.
//   • if the child made changes, the worktree path and branch are preserved
//     and returned so the parent (or user) can inspect, merge, or discard.
//
// Non-git directories are supported gracefully — the caller gets an
// informative error instead of a mysterious failure, and should fall back
// to a non-isolated run.

import { mkdtemp, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getLogger } from "../../../shared/logger.js";
import { safeSpawn } from "../../../shared/spawn-safe.js";

/**
 * Wall-clock ceiling for a single git operation in the worktree helper.
 * `git worktree add` on a large repo is the slowest call; 60 s covers
 * that with headroom while still cutting off a deadlocked config lock
 * or hung `git status`.
 */
const GIT_COMMAND_TIMEOUT_MS = 60_000;

const log = getLogger();

export class WorktreeError extends Error {
  constructor(message: string, override readonly cause?: unknown) {
    super(message);
    this.name = "WorktreeError";
  }
}

export interface WorktreeHandle {
  /** Absolute path to the worktree root. */
  path: string;
  /** Branch name used for the worktree. */
  branch: string;
  /** Repository root (the parent's git top-level) for reference. */
  repoRoot: string;
  /**
   * Release the worktree. If `preserveIfChanged` is true (default) and the
   * worktree has any staged/unstaged changes or commits, the path and
   * branch are kept intact. Otherwise the worktree and branch are removed.
   */
  release: (opts?: { preserveIfChanged?: boolean }) => Promise<WorktreeReleaseOutcome>;
}

export interface WorktreeReleaseOutcome {
  /** True if the worktree was cleaned up (removed). */
  removed: boolean;
  /** True if the worktree had changes that were preserved. */
  preservedDueToChanges: boolean;
  /** Absolute path (only meaningful when preservedDueToChanges === true). */
  path?: string;
  /** Branch name (only meaningful when preservedDueToChanges === true). */
  branch?: string;
}

export interface CreateWorktreeInput {
  /** Any path inside the target repo — used to locate the git root. */
  cwd: string;
  /** Task id — used in the branch name for traceability. */
  taskId: string;
  /** Optional explicit branch; defaults to `jeriko/subagent/<taskId>`. */
  branch?: string;
}

/**
 * Create a fresh git worktree for a subagent. Throws {@link WorktreeError}
 * if the repo or git binary is unavailable.
 */
export async function createWorktree(input: CreateWorktreeInput): Promise<WorktreeHandle> {
  const repoRoot = await findRepoRoot(input.cwd);
  const branch = input.branch ?? `jeriko/subagent/${input.taskId}`;

  const tmpRoot = await mkdtemp(join(tmpdir(), "jeriko-wt-"));
  const worktreePath = join(tmpRoot, "wt");

  try {
    await runGit(repoRoot, ["worktree", "add", "-b", branch, worktreePath]);
  } catch (err) {
    await safeRm(tmpRoot);
    throw new WorktreeError(
      `Failed to create git worktree at ${worktreePath} on branch ${branch}`,
      err,
    );
  }

  log.info(
    `Worktree created: taskId=${input.taskId} branch=${branch} path=${worktreePath}`,
  );

  const handle: WorktreeHandle = {
    path: worktreePath,
    branch,
    repoRoot,
    release: async (opts) => releaseWorktree(handle, tmpRoot, opts),
  };

  return handle;
}

async function releaseWorktree(
  handle: WorktreeHandle,
  tmpRoot: string,
  opts: { preserveIfChanged?: boolean } = {},
): Promise<WorktreeReleaseOutcome> {
  const preserveIfChanged = opts.preserveIfChanged ?? true;

  let hasChanges = false;
  try {
    hasChanges = await worktreeHasChanges(handle.path);
  } catch (err) {
    log.warn(`Worktree ${handle.path}: failed to detect changes — ${err}`);
  }

  if (hasChanges && preserveIfChanged) {
    log.info(
      `Worktree preserved (has changes): path=${handle.path} branch=${handle.branch}`,
    );
    return {
      removed: false,
      preservedDueToChanges: true,
      path: handle.path,
      branch: handle.branch,
    };
  }

  // Remove the worktree first (git will fail if we just rm -rf).
  try {
    await runGit(handle.repoRoot, ["worktree", "remove", "--force", handle.path]);
  } catch (err) {
    log.warn(`Worktree remove failed (will try fs cleanup): ${err}`);
  }

  // Delete the branch if no changes (nothing of value on it).
  if (!hasChanges) {
    try {
      await runGit(handle.repoRoot, ["branch", "-D", handle.branch]);
    } catch {
      // Branch may already be gone — ignore.
    }
  }

  await safeRm(tmpRoot);

  log.info(`Worktree released: path=${handle.path} branch=${handle.branch}`);
  return { removed: true, preservedDueToChanges: false };
}

// ---------------------------------------------------------------------------
// git helpers
// ---------------------------------------------------------------------------

async function findRepoRoot(cwd: string): Promise<string> {
  if (!existsSync(cwd)) {
    throw new WorktreeError(`cwd does not exist: ${cwd}`);
  }
  const dirStat = await stat(cwd);
  const startDir = dirStat.isDirectory() ? cwd : join(cwd, "..");

  const { stdout } = await runGit(startDir, ["rev-parse", "--show-toplevel"]);
  const root = stdout.trim();
  if (!root) {
    throw new WorktreeError(`Not inside a git repository: ${startDir}`);
  }
  return root;
}

async function worktreeHasChanges(path: string): Promise<boolean> {
  const { stdout } = await runGit(path, ["status", "--porcelain"]);
  return stdout.trim().length > 0;
}

interface GitResult {
  stdout: string;
  stderr: string;
}

async function runGit(cwd: string, args: readonly string[]): Promise<GitResult> {
  const outcome = await safeSpawn({
    command: "git",
    args,
    cwd,
    timeoutMs: GIT_COMMAND_TIMEOUT_MS,
  });

  if (outcome.status === "exited" && outcome.code === 0) {
    return { stdout: outcome.stdout, stderr: outcome.stderr };
  }
  if (outcome.status === "timeout") {
    throw new WorktreeError(
      `git ${args.join(" ")} timed out after ${outcome.timeoutMs}ms in ${cwd}`,
    );
  }
  if (outcome.status === "error") {
    throw new WorktreeError(`git ${args.join(" ")} failed to start`, outcome.error);
  }
  if (outcome.status === "aborted") {
    throw new WorktreeError(`git ${args.join(" ")} aborted`);
  }
  throw new WorktreeError(
    `git ${args.join(" ")} exited with code ${outcome.code}: ${outcome.stderr.trim() || outcome.stdout.trim()}`,
  );
}

async function safeRm(path: string): Promise<void> {
  try {
    await rm(path, { recursive: true, force: true });
  } catch (err) {
    log.warn(`Failed to remove ${path}: ${err}`);
  }
}
