// Tests for task-notification rendering and injection into the agent loop's
// live message history.

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync, unlinkSync } from "node:fs";
import { initDatabase, closeDatabase } from "../../../src/daemon/storage/db.js";

const TEST_DB = join(tmpdir(), `jeriko-subagent-notification-${Date.now()}.db`);

beforeAll(() => { initDatabase(TEST_DB); });
afterAll(() => {
  closeDatabase();
  for (const suffix of ["", "-wal", "-shm"]) {
    try { if (existsSync(TEST_DB + suffix)) unlinkSync(TEST_DB + suffix); } catch { /* best effort */ }
  }
});

import {
  renderTaskNotification,
  renderNotificationBatch,
  injectPendingNotifications,
  drainNotificationsToSession,
} from "../../../src/daemon/agent/subagent/notification.js";
import {
  completeTask,
  createTask,
} from "../../../src/daemon/agent/subagent/store.js";
import { createSession } from "../../../src/daemon/agent/session/session.js";
import { getMessages } from "../../../src/daemon/agent/session/message.js";
import type { SubagentTask } from "../../../src/daemon/storage/schema.js";
import type { DriverMessage } from "../../../src/daemon/agent/drivers/index.js";

const baseTask: SubagentTask = {
  id: "task_render",
  parent_session_id: "parent",
  child_session_id: "child",
  mode: "async",
  agent_type: "research",
  label: "test label",
  prompt: "do a thing",
  status: "completed",
  worktree_path: null,
  started_at: 100,
  completed_at: 250,
  tokens_in: 10,
  tokens_out: 20,
  error: null,
  result_text: "the answer is 42",
  notified: 0,
};

describe("renderTaskNotification", () => {
  it("includes id, label, mode, status, tokens, duration, and result", () => {
    const xml = renderTaskNotification(baseTask);
    expect(xml).toContain("<task-notification>");
    expect(xml).toContain("<id>task_render</id>");
    expect(xml).toContain("<label>test label</label>");
    expect(xml).toContain("<mode>async</mode>");
    expect(xml).toContain("<agent-type>research</agent-type>");
    expect(xml).toContain("<status>completed</status>");
    expect(xml).toContain("<duration-ms>150</duration-ms>");
    expect(xml).toContain("<tokens-in>10</tokens-in>");
    expect(xml).toContain("<tokens-out>20</tokens-out>");
    expect(xml).toContain("the answer is 42");
  });

  it("escapes XML-sensitive characters in label and result", () => {
    const hostile: SubagentTask = {
      ...baseTask,
      label: "<script>alert(1)</script>",
      result_text: "&<>\"",
    };
    const xml = renderTaskNotification(hostile);
    expect(xml).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(xml).toContain("&amp;&lt;&gt;&quot;");
    expect(xml).not.toContain("<script>");
  });

  it("includes <error> on failure", () => {
    const failed: SubagentTask = { ...baseTask, status: "failed", result_text: null, error: "kaboom" };
    const xml = renderTaskNotification(failed);
    expect(xml).toContain("<status>failed</status>");
    expect(xml).toContain("<error>");
    expect(xml).toContain("kaboom");
  });

  it("truncates oversized result bodies", () => {
    const huge = "x".repeat(5000);
    const big: SubagentTask = { ...baseTask, result_text: huge };
    const xml = renderTaskNotification(big);
    expect(xml).toContain("(truncated)");
    expect(xml.length).toBeLessThan(huge.length + 1000);
  });
});

describe("renderNotificationBatch", () => {
  it("uses singular header for one task", () => {
    const body = renderNotificationBatch([baseTask]);
    expect(body).toContain("A background subagent task has completed");
  });

  it("uses plural header for multiple tasks", () => {
    const body = renderNotificationBatch([baseTask, { ...baseTask, id: "task_b" }]);
    expect(body).toContain("2 background subagent tasks have completed");
    expect(body).toContain("task_render");
    expect(body).toContain("task_b");
  });

  it("returns empty string for empty input", () => {
    expect(renderNotificationBatch([])).toBe("");
  });
});

describe("injectPendingNotifications", () => {
  it("appends a user message and persists it to the session", () => {
    const parent = createSession({ title: "notify-parent" });
    const child = createSession({ title: "notify-child", parentSessionId: parent.id });

    createTask({
      id: "task_notify",
      parentSessionId: parent.id,
      childSessionId: child.id,
      mode: "async",
      agentType: "general",
      label: "the notify task",
      prompt: "do it",
    });
    completeTask("task_notify", {
      status: "completed",
      tokensIn: 1,
      tokensOut: 2,
      resultText: "the answer",
    });

    const history: DriverMessage[] = [];
    const drained = injectPendingNotifications(parent.id, history);
    expect(drained).toHaveLength(1);
    expect(history).toHaveLength(1);
    expect(history[0]!.role).toBe("user");
    expect(String(history[0]!.content)).toContain("task_notify");

    // Persisted
    const stored = getMessages(parent.id);
    expect(stored.some((m) => m.role === "user" && m.content.includes("task_notify"))).toBe(true);
  });

  it("is idempotent — second call yields nothing", () => {
    const parent = createSession({ title: "notify-parent-2" });
    const child = createSession({ title: "notify-child-2", parentSessionId: parent.id });

    createTask({
      id: "task_notify_once",
      parentSessionId: parent.id,
      childSessionId: child.id,
      mode: "async",
      agentType: "general",
      label: "once",
      prompt: "once",
    });
    completeTask("task_notify_once", { status: "completed", tokensIn: 0, tokensOut: 0 });

    const first = drainNotificationsToSession(parent.id);
    expect(first.tasks).toHaveLength(1);

    const second = drainNotificationsToSession(parent.id);
    expect(second.tasks).toHaveLength(0);
  });
});
