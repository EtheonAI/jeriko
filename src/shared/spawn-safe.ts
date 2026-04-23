// spawn-safe — single-source process wrapper used anywhere we shell out.
//
// Every caller gets, for free:
//   • a timeout that cannot be forgotten (SIGTERM first, SIGKILL escalation)
//   • process-group signalling on POSIX — signals reach shell children,
//     pipelines, and forked descendants, not just the direct PID
//   • abort-signal integration
//   • captured stdout + stderr with configurable buffer caps (no OOM)
//   • exit-code and elapsed-time reporting
//   • a helper to collect the result as a tidy typed object
//
// The goal: remove every ad-hoc `setTimeout → child.kill` pattern strewn
// through tool and service code. One timer, one kill path, one test surface.

import {
  spawn,
  type ChildProcess,
  type ChildProcessWithoutNullStreams,
  type SpawnOptions,
} from "node:child_process";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SafeSpawnInput {
  /** Command to run. Passed verbatim to `spawn()`. */
  readonly command: string;
  /** Arguments to pass after the command. */
  readonly args?: readonly string[];
  /** Working directory. Defaults to the parent process's cwd. */
  readonly cwd?: string;
  /** Env map. Defaults to `process.env`. Keys pass through unmodified. */
  readonly env?: NodeJS.ProcessEnv;
  /**
   * Maximum wall-clock ms before the child is killed. Default: 30_000.
   * Set to `0` to disable (caller must guarantee termination another way).
   */
  readonly timeoutMs?: number;
  /** Optional AbortSignal — killing the child when fired. */
  readonly signal?: AbortSignal;
  /** Data fed to the child's stdin once (then stdin is closed). */
  readonly stdin?: string | Uint8Array;
  /** Maximum bytes of stdout to keep in memory. Default: 1_048_576 (1 MiB). */
  readonly stdoutLimit?: number;
  /** Maximum bytes of stderr to keep in memory. Default: 65_536 (64 KiB). */
  readonly stderrLimit?: number;
  /**
   * Delay between SIGTERM and SIGKILL when the timeout fires. Default: 2_000.
   * If the child is already dead by SIGKILL time, no-op.
   */
  readonly gracefulKillDelayMs?: number;
  /** When `true`, run the command through a shell. Mirrors `spawn`'s option. */
  readonly shell?: boolean;
  /**
   * When `true` (the default when {@link shell} is `true` on POSIX), the
   * child is spawned in its own process group and signals are delivered
   * to the whole subtree via `process.kill(-pid, …)`. This is the only
   * way to reliably terminate shell pipelines, compound commands, and
   * long-running subcommands that ignore SIGTERM (notably `sleep` on
   * several Linux distros). Windows has no `setsid()` equivalent, so
   * the flag is silently ignored there and kills fall back to the
   * direct PID — strictly no worse than the prior one-signal path.
   *
   * Set explicitly to `false` when the caller *wants* a signal to hit
   * only the top-level child (rare; pretty much exclusively for daemon
   * managers that share a controlling process group with the parent).
   */
  readonly killTree?: boolean;
}

export type SafeSpawnOutcome =
  | { readonly status: "exited"; readonly code: number; readonly signal: NodeJS.Signals | null; readonly stdout: string; readonly stderr: string; readonly durationMs: number; readonly stdoutTruncated: boolean; readonly stderrTruncated: boolean }
  | { readonly status: "timeout"; readonly stdout: string; readonly stderr: string; readonly durationMs: number; readonly stdoutTruncated: boolean; readonly stderrTruncated: boolean; readonly timeoutMs: number }
  | { readonly status: "aborted"; readonly stdout: string; readonly stderr: string; readonly durationMs: number }
  | { readonly status: "error"; readonly error: Error };

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_STDOUT_LIMIT = 1_048_576;
const DEFAULT_STDERR_LIMIT = 65_536;
const DEFAULT_GRACEFUL_KILL_DELAY_MS = 2_000;

const IS_POSIX = process.platform !== "win32";

/**
 * Send a signal to a child process, preferring the process-group form
 * when {@link killTree} is enabled (POSIX only). Swallows errors from
 * already-dead processes so callers don't need try/catch at the call
 * site. Exported so other daemon services (mcp-stdio, etc.) can reuse
 * the single correct kill path without re-implementing the invariant.
 */
export function terminateChild(
  child: ChildProcess,
  signal: NodeJS.Signals,
  opts: { killTree?: boolean } = {},
): void {
  if (child.pid === undefined) return;
  const tree = opts.killTree === true && IS_POSIX;
  try {
    if (tree) {
      process.kill(-child.pid, signal);
    } else {
      child.kill(signal);
    }
  } catch {
    // Already dead, or race between close and kill — both safe to ignore.
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Spawn a process and resolve with a typed outcome. Never rejects in
 * normal operation — failures are expressed through `SafeSpawnOutcome`
 * so callers don't need try/catch around standard termination paths.
 */
export function safeSpawn(input: SafeSpawnInput): Promise<SafeSpawnOutcome> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const stdoutLimit = input.stdoutLimit ?? DEFAULT_STDOUT_LIMIT;
    const stderrLimit = input.stderrLimit ?? DEFAULT_STDERR_LIMIT;
    const gracefulDelay = input.gracefulKillDelayMs ?? DEFAULT_GRACEFUL_KILL_DELAY_MS;

    // Default: kill the whole tree when running through a shell. Direct
    // argv spawns (shell:false, which is the default) don't need a new
    // process group because the child IS the command, not a shell parent.
    const killTree = input.killTree ?? (input.shell === true);

    const options: SpawnOptions = {
      cwd: input.cwd,
      env: input.env,
      stdio: ["pipe", "pipe", "pipe"],
      shell: input.shell ?? false,
      // `detached: true` puts the child in its own process group on POSIX
      // so signals delivered via `process.kill(-pid, …)` reach the whole
      // tree. We deliberately do not call `child.unref()` — the parent
      // still awaits the child; detached only affects the group.
      detached: killTree && IS_POSIX,
    };

    let child: ChildProcessWithoutNullStreams;
    try {
      // `shell: false` (default) narrows the return type; the branch is safe
      // because we always request piped stdio.
      child = spawn(input.command, input.args ? [...input.args] : [], options) as ChildProcessWithoutNullStreams;
    } catch (err) {
      resolve({ status: "error", error: err instanceof Error ? err : new Error(String(err)) });
      return;
    }

    let stdout = "";
    let stderr = "";
    let stdoutTruncated = false;
    let stderrTruncated = false;

    child.stdout.setEncoding("utf-8");
    child.stdout.on("data", (chunk: string) => {
      if (stdoutTruncated) return;
      if (stdout.length + chunk.length > stdoutLimit) {
        stdout += chunk.slice(0, stdoutLimit - stdout.length);
        stdoutTruncated = true;
        return;
      }
      stdout += chunk;
    });

    child.stderr.setEncoding("utf-8");
    child.stderr.on("data", (chunk: string) => {
      if (stderrTruncated) return;
      if (stderr.length + chunk.length > stderrLimit) {
        stderr += chunk.slice(0, stderrLimit - stderr.length);
        stderrTruncated = true;
        return;
      }
      stderr += chunk;
    });

    if (input.stdin !== undefined) {
      try { child.stdin.end(input.stdin); } catch { /* best-effort */ }
    } else {
      try { child.stdin.end(); } catch { /* ignore */ }
    }

    // ---- Timeout escalation ----
    let timer: ReturnType<typeof setTimeout> | undefined;
    let killDelay: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        terminateChild(child, "SIGTERM", { killTree });
        killDelay = setTimeout(() => {
          if (!child.killed) {
            terminateChild(child, "SIGKILL", { killTree });
          }
        }, gracefulDelay);
      }, timeoutMs);
    }

    // ---- Abort-signal integration ----
    let aborted = false;
    const abortHandler = () => {
      aborted = true;
      terminateChild(child, "SIGTERM", { killTree });
    };
    if (input.signal) {
      if (input.signal.aborted) abortHandler();
      else input.signal.addEventListener("abort", abortHandler, { once: true });
    }

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (killDelay) clearTimeout(killDelay);
      if (input.signal) input.signal.removeEventListener("abort", abortHandler);
    };

    child.on("error", (err) => {
      cleanup();
      resolve({ status: "error", error: err });
    });

    child.on("exit", (code, signal) => {
      cleanup();
      const durationMs = Date.now() - startedAt;

      if (aborted) {
        resolve({ status: "aborted", stdout, stderr, durationMs });
        return;
      }
      if (timedOut) {
        resolve({ status: "timeout", stdout, stderr, durationMs, stdoutTruncated, stderrTruncated, timeoutMs });
        return;
      }
      resolve({
        status: "exited",
        code: code ?? 0,
        signal,
        stdout,
        stderr,
        durationMs,
        stdoutTruncated,
        stderrTruncated,
      });
    });
  });
}

/**
 * Convenience wrapper: await `safeSpawn` and throw on any status other
 * than `exited` with exit code 0. Use when the caller only cares about
 * the happy path and wants a one-liner.
 */
export async function safeSpawnSuccess(input: SafeSpawnInput): Promise<{ stdout: string; stderr: string; durationMs: number }> {
  const outcome = await safeSpawn(input);
  if (outcome.status === "exited" && outcome.code === 0) {
    return { stdout: outcome.stdout, stderr: outcome.stderr, durationMs: outcome.durationMs };
  }
  if (outcome.status === "exited") {
    throw new Error(
      `${input.command} exited with code ${outcome.code}${outcome.signal ? ` (signal ${outcome.signal})` : ""}: ${outcome.stderr.trim() || outcome.stdout.trim() || "no output"}`,
    );
  }
  if (outcome.status === "timeout") {
    throw new Error(`${input.command} timed out after ${outcome.timeoutMs}ms`);
  }
  if (outcome.status === "aborted") {
    throw new Error(`${input.command} aborted`);
  }
  throw outcome.error;
}
