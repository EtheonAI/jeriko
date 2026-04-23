// Tests for the subagent task store — lifecycle transitions and the
// takePendingNotifications() drain semantics.

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync, unlinkSync } from "node:fs";
import { initDatabase, closeDatabase } from "../../../src/daemon/storage/db.js";

const TEST_DB = join(tmpdir(), `jeriko-subagent-store-${Date.now()}.db`);

beforeAll(() => { initDatabase(TEST_DB); });
afterAll(() => {
  closeDatabase();
  for (const suffix of ["", "-wal", "-shm"]) {
    try { if (existsSync(TEST_DB + suffix)) unlinkSync(TEST_DB + suffix); } catch { /* best effort */ }
  }
});

import {
  createTask,
  updateTaskStatus,
  completeTask,
  getTask,
  listTasksForParent,
  takePendingNotifications,
} from "../../../src/daemon/agent/subagent/store.js";
import { createSession } from "../../../src/daemon/agent/session/session.js";

function makeTask(parentId: string, suffix: string) {
  const child = createSession({ title: `child-${suffix}`, parentSessionId: parentId });
  return createTask({
    id: `task_${suffix}`,
    parentSessionId: parentId,
    childSessionId: child.id,
    mode: "async",
    agentType: "general",
    label: `label-${suffix}`,
    prompt: `prompt-${suffix}`,
  });
}

describe("subagent store", () => {
  it("creates tasks with status=pending", () => {
    const parent = createSession({ title: "parent-1" });
    const task = makeTask(parent.id, "pending-create");
    expect(task.status).toBe("pending");
    expect(task.notified).toBe(0);
    expect(getTask(task.id)?.status).toBe("pending");
  });

  it("transitions through running → completed", () => {
    const parent = createSession({ title: "parent-2" });
    const task = makeTask(parent.id, "lifecycle");
    updateTaskStatus(task.id, "running");
    expect(getTask(task.id)?.status).toBe("running");

    completeTask(task.id, {
      status: "completed",
      tokensIn: 100,
      tokensOut: 200,
      resultText: "done",
    });
    const finished = getTask(task.id)!;
    expect(finished.status).toBe("completed");
    expect(finished.tokens_in).toBe(100);
    expect(finished.tokens_out).toBe(200);
    expect(finished.result_text).toBe("done");
    expect(finished.completed_at).not.toBeNull();
  });

  it("lists tasks for a parent session, newest first", () => {
    const parent = createSession({ title: "parent-3" });
    makeTask(parent.id, "older");
    makeTask(parent.id, "newer");
    const tasks = listTasksForParent(parent.id);
    expect(tasks.length).toBe(2);
    expect(tasks[0]!.started_at).toBeGreaterThanOrEqual(tasks[1]!.started_at);
  });

  it("takePendingNotifications drains once, then returns empty", () => {
    const parent = createSession({ title: "parent-4" });
    const t1 = makeTask(parent.id, "drain-1");
    const t2 = makeTask(parent.id, "drain-2");

    completeTask(t1.id, { status: "completed", tokensIn: 1, tokensOut: 1 });
    completeTask(t2.id, { status: "failed", tokensIn: 2, tokensOut: 2, error: "boom" });

    const first = takePendingNotifications(parent.id);
    expect(first.map((t) => t.id).sort()).toEqual([t1.id, t2.id].sort());

    const second = takePendingNotifications(parent.id);
    expect(second).toHaveLength(0);
  });

  it("takePendingNotifications ignores still-pending/running tasks", () => {
    const parent = createSession({ title: "parent-5" });
    makeTask(parent.id, "still-pending");
    const running = makeTask(parent.id, "still-running");
    updateTaskStatus(running.id, "running");

    const drained = takePendingNotifications(parent.id);
    expect(drained).toHaveLength(0);
  });
});
