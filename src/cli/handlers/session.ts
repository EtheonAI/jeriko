/**
 * Session command handler — unified handler for session management.
 *
 * Handles: /sessions (detail | list | delete), /new, /resume, /history,
 *          /clear, /compact, /share, /cost, /kill, /archive, /stop
 */

import type { Backend } from "../backend.js";
import type { AppAction, SessionStats, WizardConfig } from "../types.js";
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
import { openInBrowser } from "../lib/open-browser.js";

// ---------------------------------------------------------------------------
// Types for handler context
// ---------------------------------------------------------------------------

export interface SlashCommandContext {
  backend: Backend;
  dispatch: (action: AppAction) => void;
  addSystemMessage: (content: string) => void;
  state: { model: string; stats: SessionStats };
  wizardConfigRef: React.MutableRefObject<WizardConfig | null>;
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

    /**
     * /sessions — unified session management.
     *
     *   /sessions              → show current session details
     *   /sessions list         → list recent sessions
     *   /sessions delete <slug> → delete a specific session
     */
    async sessions(args: string): Promise<void> {
      const trimmed = args.trim();
      const parts = trimmed.split(/\s+/);
      const subCmd = parts[0]?.toLowerCase();

      // /session list
      if (subCmd === "list" || subCmd === "ls") {
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
        return;
      }

      // /session delete <slug>
      if (subCmd === "delete" || subCmd === "del" || subCmd === "rm") {
        const target = parts[1];
        if (!target) {
          addSystemMessage(t.yellow("Usage: /sessions delete <slug>"));
          return;
        }
        try {
          const deleted = await backend.deleteSessionById(target);
          if (deleted) {
            addSystemMessage(t.green(`Session "${target}" deleted.`));
          } else {
            addSystemMessage(formatError(
              `Cannot delete "${target}". Session not found or is the current session.`,
            ));
          }
        } catch (err) {
          addSystemMessage(formatError(err instanceof Error ? err.message : String(err)));
        }
        return;
      }

      // /sessions (no args) → interactive action picker
      if (!subCmd) {
        try {
          const sessions = await backend.listSessions();
          const detail = await backend.getSessionDetail();
          const currentSlug = detail?.slug ?? "active session";

          ctx.wizardConfigRef.current = {
            title: "Sessions",
            steps: [
              {
                type: "select",
                message: `Current: ${currentSlug} — ${sessions.length} session(s) total`,
                options: [
                  { value: "detail", label: "View current session", hint: currentSlug },
                  { value: "list", label: "List all sessions", hint: `${sessions.length} sessions` },
                  ...(sessions.length > 1
                    ? [{ value: "switch", label: "Switch session", hint: "resume a different session" }]
                    : []),
                  ...(sessions.length > 1
                    ? [{ value: "delete", label: "Delete a session", hint: "remove old sessions" }]
                    : []),
                ],
              },
            ],
            onComplete: async ([action]) => {
              dispatch({ type: "SET_PHASE", phase: "idle" });
              if (action === "list") {
                const rows = sessions.map((s) => ({
                  id: s.id,
                  slug: s.slug,
                  title: s.title,
                  model: s.model,
                  token_count: s.tokenCount,
                  updated_at: s.updatedAt,
                }));
                addSystemMessage(formatSessionList(rows, backend.sessionId));
              } else if (action === "switch") {
                const others = sessions.filter((s) => s.id !== backend.sessionId);
                if (others.length === 0) {
                  addSystemMessage(t.muted("No other sessions to switch to."));
                  return;
                }
                ctx.wizardConfigRef.current = {
                  title: "Switch Session",
                  steps: [
                    {
                      type: "select",
                      message: "Choose a session to switch to:",
                      options: others.map((s) => ({
                        value: s.slug,
                        label: s.slug,
                        hint: s.title !== s.slug ? s.title : s.model,
                      })),
                    },
                  ],
                  onComplete: async ([slug]) => {
                    dispatch({ type: "SET_PHASE", phase: "idle" });
                    try {
                      const resumed = await backend.resumeSession(slug!);
                      if (!resumed) {
                        addSystemMessage(formatError(`Session "${slug}" not found.`));
                      } else {
                        dispatch({ type: "SET_SESSION_SLUG", slug: resumed.slug });
                        addSystemMessage(formatSessionResume(resumed.slug));
                      }
                    } catch (err) {
                      addSystemMessage(formatError(err instanceof Error ? err.message : String(err)));
                    }
                  },
                };
                dispatch({ type: "SET_PHASE", phase: "wizard" });
              } else if (action === "delete") {
                const others = sessions.filter((s) => s.id !== backend.sessionId);
                if (others.length === 0) {
                  addSystemMessage(t.muted("No sessions to delete (can't delete current session)."));
                  return;
                }
                ctx.wizardConfigRef.current = {
                  title: "Delete Session",
                  steps: [
                    {
                      type: "select",
                      message: "Choose a session to delete:",
                      options: others.map((s) => ({
                        value: s.slug,
                        label: s.slug,
                        hint: s.title !== s.slug ? s.title : s.model,
                      })),
                    },
                  ],
                  onComplete: async ([slug]) => {
                    dispatch({ type: "SET_PHASE", phase: "idle" });
                    try {
                      const deleted = await backend.deleteSessionById(slug!);
                      if (deleted) {
                        addSystemMessage(t.green(`Session "${slug}" deleted.`));
                      } else {
                        addSystemMessage(formatError(`Cannot delete "${slug}". Session not found or is the current session.`));
                      }
                    } catch (err) {
                      addSystemMessage(formatError(err instanceof Error ? err.message : String(err)));
                    }
                  },
                };
                dispatch({ type: "SET_PHASE", phase: "wizard" });
              } else {
                // "detail" or default
                if (detail) {
                  addSystemMessage(formatSessionDetail(detail, state.model, state.stats));
                } else {
                  addSystemMessage(t.muted("No active session."));
                }
              }
            },
          };
          dispatch({ type: "SET_PHASE", phase: "wizard" });
        } catch (err) {
          addSystemMessage(formatError(err instanceof Error ? err.message : String(err)));
        }
        return;
      }

      // /sessions <unrecognized> → show current session detail
      const detail = await backend.getSessionDetail();
      if (detail) {
        addSystemMessage(formatSessionDetail(detail, state.model, state.stats));
      } else {
        addSystemMessage(t.muted("No active session."));
      }
    },

    async resume(args: string): Promise<void> {
      const target = args.trim();
      if (!target) {
        // Interactive session picker
        try {
          const sessions = await backend.listSessions();
          if (sessions.length === 0) {
            addSystemMessage(t.muted("No sessions to resume."));
            return;
          }
          ctx.wizardConfigRef.current = {
            title: "Resume Session",
            steps: [
              {
                type: "select",
                message: "Choose a session to resume:",
                options: sessions.map((s) => ({
                  value: s.slug,
                  label: s.slug,
                  hint: s.title !== s.slug ? s.title : s.model,
                })),
              },
            ],
            onComplete: async ([slug]) => {
              dispatch({ type: "SET_PHASE", phase: "idle" });
              try {
                const resumed = await backend.resumeSession(slug!);
                if (!resumed) {
                  addSystemMessage(formatError(`Session "${slug}" not found.`));
                } else {
                  dispatch({ type: "SET_SESSION_SLUG", slug: resumed.slug });
                  addSystemMessage(formatSessionResume(resumed.slug));
                }
              } catch (err: unknown) {
                addSystemMessage(formatError(err instanceof Error ? err.message : String(err)));
              }
            },
          };
          dispatch({ type: "SET_PHASE", phase: "wizard" });
        } catch (err) {
          addSystemMessage(formatError(err instanceof Error ? err.message : String(err)));
        }
        return;
      }
      const resumed = await backend.resumeSession(target);
      if (!resumed) {
        addSystemMessage(formatError(`Session "${target}" not found. Use /sessions list to see all.`));
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
      ctx.wizardConfigRef.current = {
        title: "Clear History",
        steps: [
          {
            type: "select",
            message: "Clear all message history? This cannot be undone.",
            options: [
              { value: "yes", label: "Yes, clear history" },
              { value: "no", label: "Cancel" },
            ],
          },
        ],
        onComplete: async ([answer]) => {
          dispatch({ type: "SET_PHASE", phase: "idle" });
          if (answer !== "yes") {
            addSystemMessage(t.muted("Clear cancelled."));
            return;
          }
          try {
            await backend.clearHistory();
            dispatch({ type: "CLEAR_MESSAGES" });
            addSystemMessage(t.muted("Session history cleared."));
          } catch (err) {
            addSystemMessage(formatError(err instanceof Error ? err.message : String(err)));
          }
        },
      };
      dispatch({ type: "SET_PHASE", phase: "wizard" });
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
        openInBrowser(share.url);
        addSystemMessage(formatShareCreated(share));
      } catch (err) {
        addSystemMessage(formatError(err instanceof Error ? err.message : String(err)));
      }
    },

    async cost(): Promise<void> {
      addSystemMessage(formatSessionCost(state.stats, state.model));
    },

    /** /stop — abort the active AI response. */
    async stop(): Promise<void> {
      backend.abort();
      dispatch({ type: "RESET_TURN" });
      addSystemMessage(t.muted("Stopped."));
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
