// SQLite-backed store for subagent task records (subagent_task table).
//
// The store is the single source of truth for lifecycle state — the in-memory
// task promises never outlive the process, but the SQLite rows survive and
// can be queried by the CLI, HTTP API, or a subsequent agent session.

import { getDatabase } from "../../storage/db.js";
import type { SubagentTask } from "../../storage/schema.js";
import type {
  SubagentMode,
  SubagentStatus,
  SubagentSpawnInput,
} from "./types.js";

export interface CreateTaskInput {
  id: string;
  parentSessionId: string;
  childSessionId: string;
  mode: SubagentMode;
  agentType: string;
  label: string;
  prompt: string;
  worktreePath?: string | null;
}

/** Insert a new task row with status="pending". */
export function createTask(input: CreateTaskInput): SubagentTask {
  const db = getDatabase();
  const now = Date.now();
  const row: SubagentTask = {
    id: input.id,
    parent_session_id: input.parentSessionId,
    child_session_id: input.childSessionId,
    mode: input.mode,
    agent_type: input.agentType,
    label: input.label,
    prompt: input.prompt,
    status: "pending",
    worktree_path: input.worktreePath ?? null,
    started_at: now,
    completed_at: null,
    tokens_in: 0,
    tokens_out: 0,
    error: null,
    result_text: null,
    notified: 0,
  };

  db.prepare(
    `INSERT INTO subagent_task (
      id, parent_session_id, child_session_id, mode, agent_type, label, prompt,
      status, worktree_path, started_at, completed_at, tokens_in, tokens_out,
      error, result_text, notified
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    row.id, row.parent_session_id, row.child_session_id, row.mode,
    row.agent_type, row.label, row.prompt, row.status, row.worktree_path,
    row.started_at, row.completed_at, row.tokens_in, row.tokens_out,
    row.error, row.result_text, row.notified,
  );

  return row;
}

/** Transition a task to a new status and persist atomically. */
export function updateTaskStatus(id: string, status: SubagentStatus): void {
  const db = getDatabase();
  db.prepare("UPDATE subagent_task SET status = ? WHERE id = ?").run(status, id);
}

/** Record the terminal outcome — status, tokens, duration, optional error or result. */
export function completeTask(
  id: string,
  update: {
    status: SubagentStatus;
    tokensIn: number;
    tokensOut: number;
    resultText?: string | null;
    error?: string | null;
  },
): void {
  const db = getDatabase();
  db.prepare(
    `UPDATE subagent_task
       SET status = ?, completed_at = ?, tokens_in = ?, tokens_out = ?,
           result_text = ?, error = ?
     WHERE id = ?`,
  ).run(
    update.status,
    Date.now(),
    update.tokensIn,
    update.tokensOut,
    update.resultText ?? null,
    update.error ?? null,
    id,
  );
}

/** Fetch a single task row by id. */
export function getTask(id: string): SubagentTask | undefined {
  const db = getDatabase();
  return db
    .query<SubagentTask, [string]>("SELECT * FROM subagent_task WHERE id = ?")
    .get(id) ?? undefined;
}

/** All tasks for a parent session, newest first. */
export function listTasksForParent(parentSessionId: string): SubagentTask[] {
  const db = getDatabase();
  return db
    .query<SubagentTask, [string]>(
      "SELECT * FROM subagent_task WHERE parent_session_id = ? ORDER BY started_at DESC",
    )
    .all(parentSessionId);
}

/**
 * Terminal tasks for a parent that haven't yet been announced.
 *
 * Used by the notification layer at the start of each parent loop: any
 * completed async tasks are serialized into a task-notification message and
 * injected before the model is called again.
 */
export function takePendingNotifications(parentSessionId: string): SubagentTask[] {
  const db = getDatabase();
  const rows = db
    .query<SubagentTask, [string]>(
      `SELECT * FROM subagent_task
         WHERE parent_session_id = ?
           AND notified = 0
           AND status IN ('completed', 'failed', 'cancelled')
         ORDER BY completed_at ASC`,
    )
    .all(parentSessionId);

  if (rows.length === 0) return [];

  // Mark as notified in a single statement to minimize the race window.
  const ids = rows.map((r) => r.id);
  const placeholders = ids.map(() => "?").join(", ");
  db.prepare(
    `UPDATE subagent_task SET notified = 1 WHERE id IN (${placeholders})`,
  ).run(...ids);

  return rows;
}

/** Used for spawn logs — short text describing the task for operators. */
export function describeInput(input: SubagentSpawnInput): string {
  const label = input.label ?? input.prompt.slice(0, 80);
  const mode = input.mode ?? "sync";
  const agentType = input.agentType ?? "general";
  return `[${mode}/${agentType}] ${label}`;
}
