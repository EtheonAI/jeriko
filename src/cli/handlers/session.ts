/**
 * Session command handler — unified handler for session management.
 *
 * Handles: /session, /sessions, /new, /resume, /switch, /history,
 *          /clear, /compact, /share, /cost, /kill, /archive
 */

import type { Backend } from "../backend.js";
import type { AppAction, SessionStats } from "../types.js";
import type { CommandDefinition, CommandContext, CommandResult } from "../../shared/command-handler.js";
import { ALL_SURFACES, surfaces } from "../../shared/command-handler.js";
import {
  formatSessionList,
  formatNewSession,
  formatSessionResume,
  formatHistory,
  formatSessionCost,
  formatSessionDetail,
  formatShareList,
  formatShareCreated,
  formatError,
} from "../format.js";
import { t } from "../theme.js";

// ---------------------------------------------------------------------------
// Types for handler context
// ---------------------------------------------------------------------------

export interface SlashCommandContext {
  backend: Backend;
  dispatch: (action: AppAction) => void;
  addSystemMessage: (content: string) => void;
  state: { model: string; stats: SessionStats };
}

// ---------------------------------------------------------------------------
// Slash command handlers
// ---------------------------------------------------------------------------

export function createSessionHandlers(ctx: SlashCommandContext) {
  const { backend, dispatch, addSystemMessage, state } = ctx;

  return {
    async help(): Promise<void> {
      // Delegated to /help handler in app
    },

    async new(): Promise<void> {
      const info = await backend.newSession();
      dispatch({ type: "RESET_STATS" });
      dispatch({ type: "SET_SESSION_SLUG", slug: info.slug });
      addSystemMessage(formatNewSession(info.slug, state.model));
    },

    async session(): Promise<void> {
      const detail = await backend.getSessionDetail();
      if (detail) {
        addSystemMessage(formatSessionDetail(detail, state.model, state.stats));
      } else {
        addSystemMessage(t.muted("No active session."));
      }
    },

    async sessions(): Promise<void> {
      const sessions = await backend.listSessions();
      const rows = sessions.map((s) => ({
        id: s.id,
        slug: s.slug,
        title: s.title,
        model: s.model,
        token_count: s.tokenCount,
        updated_at: s.updatedAt,
      }));
      addSystemMessage(formatSessionList(rows, backend.sessionId));
    },

    async resume(args: string): Promise<void> {
      const target = args.trim();
      if (!target) {
        addSystemMessage(t.yellow("Usage: /resume <slug-or-id>"));
        return;
      }
      const resumed = await backend.resumeSession(target);
      if (!resumed) {
        addSystemMessage(formatError(`Session "${target}" not found. Use /sessions to list.`));
      } else {
        dispatch({ type: "SET_SESSION_SLUG", slug: resumed.slug });
        addSystemMessage(formatSessionResume(resumed.slug));
      }
    },

    async history(): Promise<void> {
      const entries = await backend.getHistory();
      addSystemMessage(formatHistory(entries));
    },

    async clear(): Promise<void> {
      await backend.clearHistory();
      dispatch({ type: "CLEAR_MESSAGES" });
      addSystemMessage(t.muted("Session history cleared."));
    },

    async compact(): Promise<void> {
      const result = await backend.compact();
      dispatch({ type: "CONTEXT_COMPACTED", before: result.before, after: result.after });
      addSystemMessage(t.cyan(`✻ Context compacted (${result.before} → ${result.after} tokens)`));
    },

    async share(args: string): Promise<void> {
      const shareArg = args.trim();
      const subCmd = shareArg.split(/\s+/)[0]?.toLowerCase();

      if (subCmd === "list") {
        try {
          const shares = await backend.listShares();
          addSystemMessage(formatShareList(shares));
        } catch (err) {
          addSystemMessage(formatError(err instanceof Error ? err.message : String(err)));
        }
        return;
      }

      if (subCmd === "revoke") {
        const shareId = shareArg.split(/\s+/)[1];
        if (!shareId) {
          addSystemMessage(t.yellow("Usage: /share revoke <share-id>"));
          return;
        }
        try {
          const revoked = await backend.revokeShare(shareId);
          addSystemMessage(
            revoked
              ? t.green(`✓ Share revoked: ${shareId}`)
              : formatError(`Share not found or already revoked: ${shareId}`),
          );
        } catch (err) {
          addSystemMessage(formatError(err instanceof Error ? err.message : String(err)));
        }
        return;
      }

      // Default: create a share
      try {
        const share = await backend.createShare();
        addSystemMessage(formatShareCreated(share));
      } catch (err) {
        addSystemMessage(formatError(err instanceof Error ? err.message : String(err)));
      }
    },

    async cost(): Promise<void> {
      addSystemMessage(formatSessionCost(state.stats, state.model));
    },

    async kill(): Promise<void> {
      try {
        const newSession = await backend.killSession();
        dispatch({ type: "RESET_STATS" });
        dispatch({ type: "CLEAR_MESSAGES" });
        dispatch({ type: "SET_SESSION_SLUG", slug: newSession.slug });
        addSystemMessage(t.green(`Session destroyed. New session: ${newSession.slug}`));
      } catch (err) {
        addSystemMessage(formatError(err instanceof Error ? err.message : String(err)));
      }
    },

    async archive(): Promise<void> {
      try {
        const newSession = await backend.archiveSession();
        dispatch({ type: "RESET_STATS" });
        dispatch({ type: "CLEAR_MESSAGES" });
        dispatch({ type: "SET_SESSION_SLUG", slug: newSession.slug });
        addSystemMessage(t.green(`Session archived. New session: ${newSession.slug}`));
      } catch (err) {
        addSystemMessage(formatError(err instanceof Error ? err.message : String(err)));
      }
    },
  };
}
