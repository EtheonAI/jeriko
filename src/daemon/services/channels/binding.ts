/**
 * Channel binding — Persistent mapping between channel chats and agent sessions.
 *
 * Uses the KV store (SQLite-backed) so bindings survive daemon restarts.
 * Replaces the fragile title-regex approach to session restoration.
 *
 * Key format: `channel:<channel>:<chatId>`
 * Value:      `{ sessionId, model, boundAt }`
 *
 * Every mutation to the in-memory sessionsByChat Map must go through
 * these functions to keep the KV store in sync.
 */

import { kvSet, kvGet, kvDelete, kvList } from "../../storage/kv.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Persisted binding between a channel chat and an agent session. */
export interface ChannelBinding {
  sessionId: string;
  model: string;
  boundAt: number;
}

/** Restored binding with the extracted chatId. */
export interface RestoredBinding {
  chatId: string;
  sessionId: string;
  model: string;
  boundAt: number;
}

// ---------------------------------------------------------------------------
// Key construction
// ---------------------------------------------------------------------------

function bindingKey(channel: string, chatId: string): string {
  return `channel:${channel}:${chatId}`;
}

function parseChatId(key: string, prefix: string): string {
  return key.slice(prefix.length);
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/**
 * Bind a channel chat to a session. Persists to KV store.
 */
export function bindSession(
  channel: string,
  chatId: string,
  sessionId: string,
  model: string,
): void {
  const binding: ChannelBinding = {
    sessionId,
    model,
    boundAt: Date.now(),
  };
  kvSet(bindingKey(channel, chatId), binding);
}

/**
 * Update the model for an existing binding without changing the session.
 */
export function updateBindingModel(
  channel: string,
  chatId: string,
  model: string,
): void {
  const existing = getBinding(channel, chatId);
  if (!existing) return;
  kvSet(bindingKey(channel, chatId), { ...existing, model });
}

/**
 * Get the binding for a channel chat, or null if none exists.
 */
export function getBinding(
  channel: string,
  chatId: string,
): ChannelBinding | null {
  return kvGet<ChannelBinding>(bindingKey(channel, chatId));
}

/**
 * Remove the binding for a channel chat.
 */
export function unbindSession(channel: string, chatId: string): void {
  kvDelete(bindingKey(channel, chatId));
}

/**
 * Restore all bindings for a channel. Used on daemon boot to rebuild
 * the in-memory sessionsByChat Map from persistent storage.
 *
 * Optionally validates each binding against a predicate (e.g., session existence).
 * Invalid bindings are cleaned up automatically.
 */
export function restoreBindings(
  channel: string,
  isValid?: (binding: ChannelBinding) => boolean,
): RestoredBinding[] {
  const prefix = `channel:${channel}:`;
  const entries = kvList(prefix);
  const restored: RestoredBinding[] = [];

  for (const { key, value } of entries) {
    const binding = value as ChannelBinding;
    if (!binding?.sessionId) {
      kvDelete(key);
      continue;
    }

    if (isValid && !isValid(binding)) {
      kvDelete(key);
      continue;
    }

    restored.push({
      chatId: parseChatId(key, prefix),
      sessionId: binding.sessionId,
      model: binding.model,
      boundAt: binding.boundAt,
    });
  }

  return restored;
}
