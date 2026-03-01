/**
 * TUI SessionProvider — Manages session lifecycle and message history.
 *
 * Wraps the same session/message/kv modules used by chat.ts, exposed
 * as reactive SolidJS signals for the TUI components.
 */

import {
  createContext,
  useContext,
  createSignal,
  onMount,
  type ParentProps,
  type Accessor,
} from "solid-js";
import type { ToolCallState } from "./agent.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A message with display metadata, tool calls, and thinking blocks. */
export interface DisplayMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  thinking?: string;
  toolCalls?: ToolCallState[];
  meta?: {
    model?: string;
    tokensIn?: number;
    tokensOut?: number;
    durationMs?: number;
  };
  createdAt: number;
}

export interface SessionInfo {
  id: string;
  slug: string;
  title: string;
  model: string;
  tokenCount: number;
  updatedAt: number;
}

interface SessionContextValue {
  /** Current session info */
  currentSession: Accessor<SessionInfo | null>;
  /** Messages in the current session */
  messages: Accessor<DisplayMessage[]>;
  /** Recent sessions for /sessions listing */
  sessionList: Accessor<SessionInfo[]>;
  /** Create a new session */
  newSession: (model: string) => void;
  /** Resume an existing session by slug or ID */
  resumeSession: (slugOrId: string) => boolean;
  /** Add a message to the display and persist it */
  addDisplayMessage: (msg: DisplayMessage) => void;
  /** Refresh the session list */
  refreshSessionList: () => void;
  /** Get the conversation history for the agent in DriverMessage format */
  getConversationHistory: () => Array<{ role: string; content: string }>;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const SessionContext = createContext<SessionContextValue>();

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession() must be used within a <SessionProvider>");
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function SessionProvider(props: ParentProps) {
  const [currentSession, setCurrentSession] = createSignal<SessionInfo | null>(null);
  const [messages, setMessages] = createSignal<DisplayMessage[]>([]);
  const [sessionList, setSessionList] = createSignal<SessionInfo[]>([]);

  // Lazy-loaded modules — initialized on mount to avoid top-level side effects
  let sessionModule: typeof import("../../../daemon/agent/session/session.js") | null = null;
  let messageModule: typeof import("../../../daemon/agent/session/message.js") | null = null;
  let kvModule: typeof import("../../../daemon/storage/kv.js") | null = null;

  const ensureModules = async () => {
    if (!sessionModule) {
      const [sm, mm, kv] = await Promise.all([
        import("../../../daemon/agent/session/session.js"),
        import("../../../daemon/agent/session/message.js"),
        import("../../../daemon/storage/kv.js"),
      ]);
      sessionModule = sm;
      messageModule = mm;
      kvModule = kv;
    }
  };

  const toSessionInfo = (row: any): SessionInfo => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    model: row.model,
    tokenCount: row.token_count ?? 0,
    updatedAt: row.updated_at,
  });

  const toDisplayMessage = (row: any): DisplayMessage => ({
    id: row.id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
  });

  // Initialize: resume last session or create new
  onMount(async () => {
    const { getDatabase } = await import("../../../daemon/storage/db.js");
    getDatabase();
    await ensureModules();

    const lastSessionId = kvModule!.kvGet<string>("state:last_session_id");
    const existing = lastSessionId
      ? sessionModule!.getSession(lastSessionId)
      : null;

    if (existing && existing.archived_at === null) {
      setCurrentSession(toSessionInfo(existing));
      const rows = messageModule!.getMessages(existing.id);
      setMessages(rows.map(toDisplayMessage));
    }

    refreshSessionList();
  });

  const newSession = (model: string): void => {
    if (!sessionModule || !kvModule) return;
    const session = sessionModule.createSession({ model });
    kvModule.kvSet("state:last_session_id", session.id);
    setCurrentSession(toSessionInfo(session));
    setMessages([]);
    refreshSessionList();
  };

  const resumeSession = (slugOrId: string): boolean => {
    if (!sessionModule || !messageModule || !kvModule) return false;
    const found =
      sessionModule.getSessionBySlug(slugOrId) ??
      sessionModule.getSession(slugOrId);
    if (!found) return false;

    kvModule.kvSet("state:last_session_id", found.id);
    setCurrentSession(toSessionInfo(found));
    const rows = messageModule.getMessages(found.id);
    setMessages(rows.map(toDisplayMessage));
    return true;
  };

  const addDisplayMessage = (msg: DisplayMessage): void => {
    setMessages((prev) => [...prev, msg]);
  };

  const refreshSessionList = (): void => {
    if (!sessionModule) return;
    const rows = sessionModule.listSessions(20);
    setSessionList(rows.map(toSessionInfo));
  };

  const getConversationHistory = (): Array<{ role: string; content: string }> => {
    return messages()
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content }));
  };

  return (
    <SessionContext.Provider
      value={{
        currentSession,
        messages,
        sessionList,
        newSession,
        resumeSession,
        addDisplayMessage,
        refreshSessionList,
        getConversationHistory,
      }}
    >
      {props.children}
    </SessionContext.Provider>
  );
}
