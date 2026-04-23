// Task reaper — reclaims subagent_task rows left in a non-terminal state
// by a crashed or killed daemon.
//
// The tests exercise:
//   1. reapStaleTasks() marks stale pending/running rows as timeout;
//      terminal statuses (completed/failed/cancelled/timeout) are never
//      touched even if they're older than the cutoff.
//   2. createTaskReaper() validates its inputs and uses sensible defaults.
//   3. reaper.start()/stop() idempotent and release the timer handle.
//   4. reaper.tick() is callable without .start() for one-shot use.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync, unlinkSync } from "node:fs";
import { initDatabase, closeDatabase, getDatabase } from "../../../src/daemon/storage/db.js";

const TEST_DB = join(tmpdir(), `jeriko-subagent-reaper-${Date.now()}.db`);

beforeAll(() => { initDatabase(TEST_DB); });
afterAll(() => {
  closeDatabase();
  for (const suffix of ["", "-wal", "-shm"]) {
    try { if (existsSync(TEST_DB + suffix)) unlinkSync(TEST_DB + suffix); } catch { /* best effort */ }
  }
});

beforeEach(() => {
  // Truncate between tests so row counts are predictable.
  getDatabase().prepare("DELETE FROM subagent_task").run();
});

import {
  createTask,
  completeTask,
  getTask,
  reapStaleTasks,
} from "../../../src/daemon/agent/subagent/store.js";
import {
  createTaskReaper,
  DEFAULT_STALE_TTL_MS,
  DEFAULT_TICK_INTERVAL_MS,
} from "../../../src/daemon/agent/subagent/reaper.js";
import { createSession } from "../../../src/daemon/agent/session/session.js";

function makeStaleTask(parentId: string, id: string, ageMs: number): void {
  const child = createSession({ title: `child-${id}`, parentSessionId: parentId });
  createTask({
    id, parentSessionId: parentId, childSessionId: child.id,
    mode: "async", agentType: "general", label: id, prompt: `p-${id}`,
  });
  // Backdate started_at to simulate a long-running orphan. The store
  // always stamps `now` on insert, so we mutate directly to simulate
  // age without waiting.
  getDatabase()
    .prepare("UPDATE subagent_task SET started_at = ? WHERE id = ?")
    .run(Date.now() - ageMs, id);
}

describe("reapStaleTasks", () => {
  it("marks stale pending/running tasks as timeout", () => {
    const parent = createSession({ title: "reaper-parent-1" });
    makeStaleTask(parent.id, "t_stale_pending", 2 * 60 * 60 * 1_000);

    const child = createSession({ title: "child-running", parentSessionId: parent.id });
    createTask({
      id: "t_stale_running", parentSessionId: parent.id, childSessionId: child.id,
      mode: "async", agentType: "general", label: "running", prompt: "p",
    });
    getDatabase().prepare(
      "UPDATE subagent_task SET status = 'running', started_at = ? WHERE id = ?",
    ).run(Date.now() - 2 * 60 * 60 * 1_000, "t_stale_running");

    const reaped = reapStaleTasks(60 * 60 * 1_000); // 1 h cutoff
    expect(reaped).toBe(2);

    expect(getTask("t_stale_pending")?.status).toBe("timeout");
    expect(getTask("t_stale_running")?.status).toBe("timeout");
    // completed_at populated so /tasks shows a terminal time.
    expect(typeof getTask("t_stale_pending")?.completed_at).toBe("number");
    // error defaulted when previously null.
    expect(getTask("t_stale_pending")?.error).toContain("reaped");
  });

  it("ignores terminal tasks even when older than cutoff", () => {
    const parent = createSession({ title: "reaper-parent-2" });
    makeStaleTask(parent.id, "t_completed", 2 * 60 * 60 * 1_000);
    completeTask("t_completed", { status: "completed", tokensIn: 10, tokensOut: 5 });
    makeStaleTask(parent.id, "t_failed", 2 * 60 * 60 * 1_000);
    completeTask("t_failed", { status: "failed", tokensIn: 1, tokensOut: 0, error: "boom" });

    const reaped = reapStaleTasks(60 * 60 * 1_000);
    expect(reaped).toBe(0);
    expect(getTask("t_completed")?.status).toBe("completed");
    expect(getTask("t_failed")?.status).toBe("failed");
  });

  it("ignores fresh pending tasks inside the TTL window", () => {
    const parent = createSession({ title: "reaper-parent-3" });
    makeStaleTask(parent.id, "t_fresh", 30 * 60 * 1_000); // 30 min old

    const reaped = reapStaleTasks(60 * 60 * 1_000); // 1 h cutoff
    expect(reaped).toBe(0);
    expect(getTask("t_fresh")?.status).toBe("pending");
  });

  it("preserves existing error message when reaping", () => {
    const parent = createSession({ title: "reaper-parent-4" });
    makeStaleTask(parent.id, "t_with_error", 2 * 60 * 60 * 1_000);
    getDatabase()
      .prepare("UPDATE subagent_task SET error = ? WHERE id = ?")
      .run("pre-existing detail", "t_with_error");

    reapStaleTasks(60 * 60 * 1_000);
    // COALESCE keeps the pre-existing error; reaper only backfills nulls.
    expect(getTask("t_with_error")?.error).toBe("pre-existing detail");
  });
});

describe("createTaskReaper", () => {
  it("rejects non-positive intervals", () => {
    expect(() => createTaskReaper({ staleTtlMs: 0 })).toThrow();
    expect(() => createTaskReaper({ tickIntervalMs: -1 })).toThrow();
  });

  it("uses the documented defaults", () => {
    // Indirect — we check the constants are exported and make sense.
    expect(DEFAULT_STALE_TTL_MS).toBeGreaterThanOrEqual(60 * 60 * 1_000);
    expect(DEFAULT_TICK_INTERVAL_MS).toBeGreaterThanOrEqual(60 * 1_000);
    expect(DEFAULT_TICK_INTERVAL_MS).toBeLessThanOrEqual(DEFAULT_STALE_TTL_MS);
  });

  it("tick() runs a single sweep without starting the timer", () => {
    const parent = createSession({ title: "reaper-one-shot" });
    makeStaleTask(parent.id, "t_oneshot", 2 * 60 * 60 * 1_000);

    const reaper = createTaskReaper({ staleTtlMs: 60 * 60 * 1_000, tickIntervalMs: 10 * 60 * 1_000 });
    const reaped = reaper.tick();
    expect(reaped).toBe(1);
    expect(getTask("t_oneshot")?.status).toBe("timeout");
  });

  it("start() is idempotent; stop() releases the timer handle", () => {
    const reaper = createTaskReaper({
      staleTtlMs: 60 * 60 * 1_000,
      tickIntervalMs: 60 * 1_000,
    });
    reaper.start();
    reaper.start(); // no-op
    reaper.stop();
    reaper.stop(); // no-op, must not throw
  });

  it("start() performs an immediate boot sweep", () => {
    const parent = createSession({ title: "reaper-boot-sweep" });
    makeStaleTask(parent.id, "t_boot_sweep", 2 * 60 * 60 * 1_000);

    const reaper = createTaskReaper({
      staleTtlMs: 60 * 60 * 1_000,
      tickIntervalMs: 60 * 60 * 1_000,
    });
    reaper.start();
    try {
      expect(getTask("t_boot_sweep")?.status).toBe("timeout");
    } finally {
      reaper.stop();
    }
  });
});
