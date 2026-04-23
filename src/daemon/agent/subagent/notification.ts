// Task-notification layer — formats and delivers async-subagent completions
// back to the parent agent by injecting a synthetic user message at the
// start of the parent's next loop iteration.
//
// Claude Code uses the same pattern: a <task-notification> XML blob is
// enqueued as a user turn; the model reads it on its next round and can
// decide how to react (summarize, chain another task, etc.).

import type { SubagentTask } from "../../storage/schema.js";
import { addMessage } from "../session/message.js";
import { takePendingNotifications } from "./store.js";
import type { DriverMessage } from "../drivers/index.js";

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * Render a single completed task as a `<task-notification>` XML element.
 * The XML shape is deliberately small and machine-parseable so even
 * smaller OSS models can pick the fields out reliably.
 */
export function renderTaskNotification(task: SubagentTask): string {
  const duration = task.completed_at
    ? Math.max(0, task.completed_at - task.started_at)
    : 0;
  const status = task.status;
  const result = (task.result_text ?? "").trim();
  const error = (task.error ?? "").trim();

  const lines: string[] = [];
  lines.push("<task-notification>");
  lines.push(`  <id>${escapeXml(task.id)}</id>`);
  lines.push(`  <label>${escapeXml(task.label)}</label>`);
  lines.push(`  <mode>${escapeXml(task.mode)}</mode>`);
  lines.push(`  <agent-type>${escapeXml(task.agent_type)}</agent-type>`);
  lines.push(`  <status>${escapeXml(status)}</status>`);
  lines.push(`  <duration-ms>${duration}</duration-ms>`);
  lines.push(`  <tokens-in>${task.tokens_in}</tokens-in>`);
  lines.push(`  <tokens-out>${task.tokens_out}</tokens-out>`);
  if (result) {
    lines.push("  <result>");
    lines.push(indent(escapeXml(truncate(result, MAX_NOTIFICATION_BODY)), "    "));
    lines.push("  </result>");
  }
  if (error) {
    lines.push("  <error>");
    lines.push(indent(escapeXml(truncate(error, MAX_NOTIFICATION_BODY)), "    "));
    lines.push("  </error>");
  }
  lines.push("</task-notification>");
  return lines.join("\n");
}

/** Render a batch of task notifications as a single user-message body. */
export function renderNotificationBatch(tasks: SubagentTask[]): string {
  if (tasks.length === 0) return "";
  const header =
    tasks.length === 1
      ? "A background subagent task has completed while you were working:"
      : `${tasks.length} background subagent tasks have completed while you were working:`;
  return [header, "", ...tasks.map(renderTaskNotification)].join("\n");
}

// ---------------------------------------------------------------------------
// Delivery — DB-backed (for persistence) and in-memory (for the live loop)
// ---------------------------------------------------------------------------

/**
 * Drain pending notifications for a parent session and persist them as a
 * user message in the parent's conversation. Returns the drained task rows
 * so the caller can also inject them into the running loop's in-memory
 * history (see {@link injectPendingNotifications}).
 */
export function drainNotificationsToSession(
  parentSessionId: string,
): { tasks: SubagentTask[]; body: string } {
  const tasks = takePendingNotifications(parentSessionId);
  if (tasks.length === 0) return { tasks: [], body: "" };

  const body = renderNotificationBatch(tasks);
  addMessage(parentSessionId, "user", body);
  return { tasks, body };
}

/**
 * Combined helper for use at the start of an agent loop iteration:
 * drain DB notifications AND append the synthetic user message to the
 * in-memory history that's about to be sent to the LLM.
 *
 * Returns the drained tasks (mainly for logging/testing).
 */
export function injectPendingNotifications(
  parentSessionId: string,
  liveHistory: DriverMessage[],
): SubagentTask[] {
  const { tasks, body } = drainNotificationsToSession(parentSessionId);
  if (body) {
    liveHistory.push({ role: "user", content: body });
  }
  return tasks;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/** Max characters embedded inside a single <result> or <error> element. */
const MAX_NOTIFICATION_BODY = 4096;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function indent(s: string, pad: string): string {
  return s.split("\n").map((line) => pad + line).join("\n");
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}\n... (truncated)`;
}
