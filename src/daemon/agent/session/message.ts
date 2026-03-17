// Daemon — Message management within sessions.
// All operations backed by SQLite.

import { getDatabase } from "../../storage/db.js";
import type {
  Message as MessageRow,
  Part as PartRow,
} from "../../storage/schema.js";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Re-export schema types
// ---------------------------------------------------------------------------

export type { MessageRow as Message, PartRow as Part };

// ---------------------------------------------------------------------------
// Message operations
// ---------------------------------------------------------------------------

/**
 * Add a message to a session.
 *
 * @param sessionId    The owning session's ID.
 * @param role         Message role: user, assistant, system, or tool.
 * @param content      Text content of the message.
 * @param tokens       Optional token counts for input/output tracking.
 * @returns            The inserted message row.
 */
export function addMessage(
  sessionId: string,
  role: MessageRow["role"],
  content: string,
  tokens?: { input?: number; output?: number },
): MessageRow {
  const db = getDatabase();
  const id = randomUUID();
  const now = Date.now();
  const tokensInput = tokens?.input ?? 0;
  const tokensOutput = tokens?.output ?? 0;

  db.prepare(
    `INSERT INTO message (id, session_id, role, content, tokens_input, tokens_output, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, sessionId, role, content, tokensInput, tokensOutput, now);

  // Touch the session's updated_at.
  db.prepare("UPDATE session SET updated_at = ? WHERE id = ?").run(now, sessionId);

  // Increment the session's token count.
  const totalTokens = tokensInput + tokensOutput;
  if (totalTokens > 0) {
    db.prepare(
      "UPDATE session SET token_count = token_count + ? WHERE id = ?",
    ).run(totalTokens, sessionId);
  }

  return {
    id,
    session_id: sessionId,
    role,
    content,
    tokens_input: tokensInput,
    tokens_output: tokensOutput,
    created_at: now,
  };
}

/**
 * Retrieve all messages for a session, oldest first.
 *
 * @param sessionId  The session ID.
 * @param limit      Max messages to return (default: all).
 */
export function getMessages(sessionId: string, limit?: number): MessageRow[] {
  const db = getDatabase();

  if (limit !== undefined) {
    return db
      .query<MessageRow, [string, number]>(
        "SELECT * FROM message WHERE session_id = ? ORDER BY created_at ASC LIMIT ?",
      )
      .all(sessionId, limit);
  }

  return db
    .query<MessageRow, [string]>(
      "SELECT * FROM message WHERE session_id = ? ORDER BY created_at ASC",
    )
    .all(sessionId);
}

/**
 * Get the N most recent messages for a session, ordered oldest first.
 */
export function getRecentMessages(sessionId: string, count: number): MessageRow[] {
  const db = getDatabase();

  // Sub-query to get the last N by created_at desc, then re-order asc.
  return db
    .query<MessageRow, [string, number]>(
      `SELECT * FROM (
         SELECT * FROM message WHERE session_id = ? ORDER BY created_at DESC LIMIT ?
       ) sub ORDER BY created_at ASC`,
    )
    .all(sessionId, count);
}

/**
 * Get the total token count for all messages in a session.
 */
export function getSessionTokenCount(sessionId: string): number {
  const db = getDatabase();
  const row = db
    .query<{ total: number }, [string]>(
      "SELECT COALESCE(SUM(tokens_input + tokens_output), 0) AS total FROM message WHERE session_id = ?",
    )
    .get(sessionId);
  return row?.total ?? 0;
}

/**
 * Delete a specific message and its parts, updating the session token count.
 */
export function deleteMessage(id: string): void {
  const db = getDatabase();
  // Get the message's session and token counts before deleting
  const msg = db
    .query<{ session_id: string; tokens_input: number; tokens_output: number }, [string]>(
      "SELECT session_id, tokens_input, tokens_output FROM message WHERE id = ?",
    )
    .get(id);
  db.prepare("DELETE FROM message WHERE id = ?").run(id);
  // Decrement session token count to stay in sync
  if (msg) {
    const delta = (msg.tokens_input ?? 0) + (msg.tokens_output ?? 0);
    if (delta > 0) {
      db.prepare(
        "UPDATE session SET token_count = MAX(0, token_count - ?), updated_at = ? WHERE id = ?",
      ).run(delta, Date.now(), msg.session_id);
    }
  }
}

/**
 * Delete all messages in a session (but keep the session itself).
 */
export function clearMessages(sessionId: string): void {
  const db = getDatabase();
  db.prepare("DELETE FROM message WHERE session_id = ?").run(sessionId);
  db.prepare("UPDATE session SET token_count = 0, updated_at = ? WHERE id = ?")
    .run(Date.now(), sessionId);
}

// ---------------------------------------------------------------------------
// Part operations
// ---------------------------------------------------------------------------

/**
 * Add a structured part to a message (text, tool_call, tool_result, error).
 *
 * @param messageId   The parent message ID.
 * @param type        Part type.
 * @param content     Part content (text, JSON, etc.).
 * @param toolName    Tool name (only for tool_call / tool_result parts).
 * @param toolCallId  Tool call ID for linking calls to results.
 * @returns           The inserted part row.
 */
export function addPart(
  messageId: string,
  type: PartRow["type"],
  content: string,
  toolName?: string,
  toolCallId?: string,
): PartRow {
  const db = getDatabase();
  const id = randomUUID();
  const now = Date.now();

  db.prepare(
    `INSERT INTO part (id, message_id, type, content, tool_name, tool_call_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, messageId, type, content, toolName ?? null, toolCallId ?? null, now);

  return {
    id,
    message_id: messageId,
    type,
    content,
    tool_name: toolName ?? null,
    tool_call_id: toolCallId ?? null,
    created_at: now,
  };
}

/**
 * Get all parts for a message, ordered by creation time.
 */
export function getParts(messageId: string): PartRow[] {
  const db = getDatabase();
  return db
    .query<PartRow, [string]>(
      "SELECT * FROM part WHERE message_id = ? ORDER BY created_at ASC",
    )
    .all(messageId);
}

/**
 * Get all parts of a specific type for a message.
 */
export function getPartsByType(messageId: string, type: PartRow["type"]): PartRow[] {
  const db = getDatabase();
  return db
    .query<PartRow, [string, string]>(
      "SELECT * FROM part WHERE message_id = ? AND type = ? ORDER BY created_at ASC",
    )
    .all(messageId, type);
}

// ---------------------------------------------------------------------------
// History reconstruction — DriverMessage[] from DB
// ---------------------------------------------------------------------------

import type { DriverMessage } from "../drivers/index.js";

/**
 * Reconstruct a full DriverMessage history from DB for a session.
 *
 * Rebuilds `tool_calls` on assistant messages and `tool_call_id` on tool
 * messages using the parts table. Without this, session resumption sends
 * malformed history to providers that require tool message/call pairing
 * (OpenAI, OpenAI-compat endpoints).
 *
 * This is the single authoritative function for building conversation
 * history from DB — used by kernel.ts (daemon IPC), backend.ts (in-process),
 * and routes/agent.ts (HTTP API).
 */
export function buildDriverMessages(sessionId: string): DriverMessage[] {
  const db = getDatabase();
  const msgs = getMessages(sessionId);

  // Batch-load all parts for this session's messages in one query.
  // Using a single query avoids N+1 for sessions with many messages.
  const msgIds = msgs.map((m) => m.id);
  const partsByMessage = new Map<string, PartRow[]>();

  if (msgIds.length > 0) {
    // SQLite doesn't support array binds — use a parameterized IN clause.
    const placeholders = msgIds.map(() => "?").join(",");
    const allParts = db
      .query<PartRow, string[]>(
        `SELECT * FROM part WHERE message_id IN (${placeholders}) ORDER BY created_at ASC`,
      )
      .all(...msgIds);

    for (const part of allParts) {
      const list = partsByMessage.get(part.message_id) ?? [];
      list.push(part);
      partsByMessage.set(part.message_id, list);
    }
  }

  return msgs
    .filter((m) => m.role === "user" || m.role === "assistant" || m.role === "system" || m.role === "tool")
    .map((m) => {
      const driverMsg: DriverMessage = {
        role: m.role as DriverMessage["role"],
        content: m.content,
      };

      const parts = partsByMessage.get(m.id) ?? [];

      if (m.role === "assistant") {
        // Reconstruct tool_calls from "tool_call" parts stored on this message.
        const toolCallParts = parts.filter((p) => p.type === "tool_call");
        if (toolCallParts.length > 0) {
          driverMsg.tool_calls = toolCallParts.map((p) => ({
            id: p.tool_call_id ?? "",
            name: p.tool_name ?? "",
            arguments: p.content,
          }));
        }
      }

      if (m.role === "tool") {
        // Reconstruct tool_call_id from the "tool_result" or "error" part.
        const resultPart = parts.find(
          (p) => p.type === "tool_result" || p.type === "error",
        );
        if (resultPart?.tool_call_id) {
          driverMsg.tool_call_id = resultPart.tool_call_id;
        }
      }

      return driverMsg;
    });
}
