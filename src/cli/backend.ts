/**
 * CLI Backend — Unified interface for daemon IPC and in-process agent.
 *
 * Abstracts the two execution modes (daemon socket / direct agent loop)
 * behind a single callback-based interface. React components interact
 * with the backend through `send()` and `abort()` without knowing
 * which mode is active.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

import type {
  SessionInfo,
  ChannelInfo,
  ConnectorInfo,
  TriggerInfo,
  SkillInfo,
  ModelInfo,
  HistoryEntry,
} from "./types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Callbacks invoked during a streaming agent response. */
export interface BackendCallbacks {
  onThinking: (content: string) => void;
  onTextDelta: (content: string) => void;
  onToolCallStart: (toolCall: { id: string; name: string; arguments: string }) => void;
  onToolResult: (id: string, result: string, isError: boolean) => void;
  onTurnComplete: (tokensIn: number, tokensOut: number) => void;
  onCompaction: (before: number, after: number) => void;
  onError: (message: string) => void;

  // Sub-agent live monitoring callbacks
  onSubAgentStarted: (data: {
    parentSessionId: string;
    childSessionId: string;
    label: string;
    agentType: string;
  }) => void;
  onSubAgentTextDelta: (childSessionId: string, content: string) => void;
  onSubAgentToolCall: (childSessionId: string, toolName: string) => void;
  onSubAgentToolResult: (childSessionId: string, toolCallId: string, isError: boolean) => void;
  onSubAgentComplete: (childSessionId: string, label: string, status: string, durationMs: number) => void;
}

/** Unified backend interface for both daemon and in-process modes. */
export interface Backend {
  /** Send a user message and stream the response via callbacks. */
  send(message: string, callbacks: BackendCallbacks): Promise<void>;
  /** Abort the current streaming response. */
  abort(): void;

  // Session management
  newSession(): Promise<SessionInfo>;
  listSessions(limit?: number): Promise<SessionInfo[]>;
  resumeSession(slugOrId: string): Promise<SessionInfo | null>;
  getHistory(limit?: number): Promise<HistoryEntry[]>;
  clearHistory(): Promise<void>;
  compact(): Promise<{ before: number; after: number }>;

  // Models
  listModels(): Promise<ModelInfo[]>;

  // Channel management (daemon only — no-ops in-process)
  listChannels(): Promise<ChannelInfo[]>;
  connectChannel(name: string): Promise<boolean>;
  disconnectChannel(name: string): Promise<boolean>;

  // Connectors (daemon only — returns [] in-process)
  listConnectors(): Promise<ConnectorInfo[]>;
  connectService(name: string): Promise<boolean>;
  disconnectService(name: string): Promise<boolean>;
  checkHealth(name?: string): Promise<Array<{ name: string; healthy: boolean; latencyMs: number; error?: string }>>;

  // Triggers (daemon only)
  listTriggers(): Promise<TriggerInfo[]>;
  enableTrigger(id: string): Promise<boolean>;
  disableTrigger(id: string): Promise<boolean>;

  // Skills
  listSkills(): Promise<SkillInfo[]>;
  getSkill(name: string): Promise<{ name: string; description: string; body: string } | null>;

  // System
  getStatus(): Promise<{ phase: string; uptime: number; memoryMb?: number; sessionCount?: number; activeChannels?: number }>;
  getConfig(): Promise<Record<string, unknown>>;

  // State
  readonly mode: "daemon" | "in-process";
  readonly model: string;
  setModel(name: string): void;
  readonly sessionId: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SOCKET_PATH = join(homedir(), ".jeriko", "daemon.sock");

// ---------------------------------------------------------------------------
// Daemon backend — streams via Unix socket IPC
// ---------------------------------------------------------------------------

export async function createDaemonBackend(): Promise<Backend> {
  const { sendRequest, sendStreamRequest } = await import("../daemon/api/socket.js");
  const { loadConfig } = await import("../shared/config.js");

  const config = loadConfig();
  let currentModel = config.agent.model;
  let currentSessionId: string | null = null;
  let abortController: AbortController | null = null;

  const backend: Backend = {
    mode: "daemon",

    get model() { return currentModel; },
    setModel(name: string) { currentModel = name; },
    get sessionId() { return currentSessionId; },

    async send(message, callbacks) {
      abortController = new AbortController();
      const params: Record<string, unknown> = { message };
      if (currentSessionId) params.session_id = currentSessionId;

      try {
        const stream = sendStreamRequest("ask", params, {
          signal: abortController.signal,
        });
        let result: IteratorResult<Record<string, unknown>, unknown>;
        while (!(result = await stream.next()).done) {
          dispatchAgentEvent(result.value, callbacks);
        }
        // Capture session ID from the daemon's final IpcResponse
        const resp = result.value as { ok?: boolean; data?: Record<string, unknown> } | void;
        if (resp?.ok && resp.data) {
          const sid = resp.data.sessionId as string | undefined;
          if (sid) currentSessionId = sid;
        }
      } catch (err: unknown) {
        if ((err as Error).name !== "AbortError") {
          callbacks.onError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        abortController = null;
      }
    },

    abort() {
      abortController?.abort();
      abortController = null;
    },

    async newSession() {
      try {
        const response = await sendRequest("new_session", { model: currentModel });
        if (response.ok && response.data) {
          const row = response.data as DaemonSessionRow;
          currentSessionId = row.id;
          return mapDaemonSession(row);
        }
      } catch { /* fall through to reset */ }
      currentSessionId = null as unknown as string;
      return fallbackSession(currentModel);
    },

    async listSessions(limit = 20) {
      try {
        const response = await sendRequest("sessions", { limit });
        if (response.ok && Array.isArray(response.data)) {
          return (response.data as DaemonSessionRow[]).map(mapDaemonSession);
        }
      } catch { /* daemon may not support */ }
      return [];
    },

    async resumeSession(slugOrId) {
      try {
        const response = await sendRequest("resume_session", { slug_or_id: slugOrId });
        if (response.ok && response.data) {
          const row = response.data as DaemonSessionRow;
          currentSessionId = row.id;
          return mapDaemonSession(row);
        }
      } catch { /* daemon error = not found */ }
      return null;
    },

    async getHistory(limit = 50) {
      try {
        const response = await sendRequest("history" as any, { limit, session_id: currentSessionId });
        if (response.ok && Array.isArray(response.data)) {
          return response.data as HistoryEntry[];
        }
      } catch { /* daemon may not support */ }
      return [];
    },

    async clearHistory() {
      try {
        await sendRequest("clear_history" as any, { session_id: currentSessionId });
      } catch { /* best effort */ }
    },

    async compact() {
      try {
        const response = await sendRequest("compact" as any, { session_id: currentSessionId });
        if (response.ok && response.data) {
          const data = response.data as { before: number; after: number };
          return data;
        }
      } catch { /* best effort */ }
      return { before: 0, after: 0 };
    },

    async listModels() {
      try {
        const response = await sendRequest("models" as any, {});
        if (response.ok && Array.isArray(response.data)) {
          return response.data as ModelInfo[];
        }
      } catch { /* daemon may not support */ }
      return getStaticModelList(currentModel);
    },

    async listChannels() {
      try {
        const response = await sendRequest("channels", {});
        if (response.ok && Array.isArray(response.data)) {
          return (response.data as DaemonChannelRow[]).map(mapDaemonChannel);
        }
      } catch { /* daemon may not support */ }
      return [];
    },

    async connectChannel(name) {
      try {
        const response = await sendRequest("channel_connect", { name });
        return response.ok;
      } catch { return false; }
    },

    async disconnectChannel(name) {
      try {
        const response = await sendRequest("channel_disconnect", { name });
        return response.ok;
      } catch { return false; }
    },

    async listConnectors() {
      try {
        const response = await sendRequest("connectors" as any, {});
        if (response.ok && Array.isArray(response.data)) {
          return response.data as ConnectorInfo[];
        }
      } catch { /* daemon may not support */ }
      return [];
    },

    async connectService(name) {
      try {
        const response = await sendRequest("connector_connect" as any, { name });
        return response.ok;
      } catch { return false; }
    },

    async disconnectService(name) {
      try {
        const response = await sendRequest("connector_disconnect" as any, { name });
        return response.ok;
      } catch { return false; }
    },

    async checkHealth(name?) {
      try {
        const response = await sendRequest("connector_health" as any, { name });
        if (response.ok && Array.isArray(response.data)) {
          return response.data as Array<{ name: string; healthy: boolean; latencyMs: number; error?: string }>;
        }
      } catch { /* daemon may not support */ }
      return [];
    },

    async listTriggers() {
      try {
        const response = await sendRequest("triggers" as any, {});
        if (response.ok && Array.isArray(response.data)) {
          return response.data as TriggerInfo[];
        }
      } catch { /* daemon may not support */ }
      return [];
    },

    async enableTrigger(id) {
      try {
        const response = await sendRequest("trigger_enable" as any, { id });
        return response.ok;
      } catch { return false; }
    },

    async disableTrigger(id) {
      try {
        const response = await sendRequest("trigger_disable" as any, { id });
        return response.ok;
      } catch { return false; }
    },

    async listSkills() {
      try {
        const response = await sendRequest("skills" as any, {});
        if (response.ok && Array.isArray(response.data)) {
          return response.data as SkillInfo[];
        }
      } catch { /* daemon may not support — fall through to direct load */ }
      return loadSkillsDirect();
    },

    async getSkill(name) {
      try {
        const response = await sendRequest("skill_detail" as any, { name });
        if (response.ok && response.data) {
          return response.data as { name: string; description: string; body: string };
        }
      } catch { /* fall through to direct load */ }
      return loadSkillDirect(name);
    },

    async getStatus() {
      try {
        const response = await sendRequest("status", {});
        if (response.ok && response.data) {
          return response.data as { phase: string; uptime: number; memoryMb?: number; sessionCount?: number; activeChannels?: number };
        }
      } catch { /* daemon unreachable */ }
      return { phase: "unknown", uptime: 0 };
    },

    async getConfig() {
      try {
        const response = await sendRequest("config" as any, {});
        if (response.ok && response.data) {
          return response.data as Record<string, unknown>;
        }
      } catch { /* fall through to direct load */ }
      return loadConfigDirect();
    },
  };

  return backend;
}

// ---------------------------------------------------------------------------
// In-process backend — direct agent loop
// ---------------------------------------------------------------------------

export async function createInProcessBackend(): Promise<Backend> {
  // Initialize database
  const { getDatabase } = await import("../daemon/storage/db.js");
  getDatabase();

  // Register all agent tools (must match kernel step 6)
  await registerTools();

  // Load system prompt + skill summaries (must match kernel steps 9-10)
  const systemPrompt = await loadSystemPrompt();

  const { loadConfig } = await import("../shared/config.js");
  const {
    createSession,
    getSession,
    getSessionBySlug,
    listSessions: dbListSessions,
  } = await import("../daemon/agent/session/session.js");
  const { addMessage, getMessages } = await import("../daemon/agent/session/message.js");
  const { kvGet, kvSet } = await import("../daemon/storage/kv.js");
  const { runAgent } = await import("../daemon/agent/agent.js");

  type DriverMessage = import("../daemon/agent/drivers/index.js").DriverMessage;

  const config = loadConfig();
  let currentModel = config.agent.model;

  // Session setup — resume last or create new
  let session: ReturnType<typeof createSession>;
  let history: DriverMessage[] = [];

  const lastSessionId = kvGet<string>("state:last_session_id");
  const existing = lastSessionId ? getSession(lastSessionId) : null;

  if (existing && existing.archived_at === null) {
    session = existing;
    const rows = getMessages(session.id);
    history = rows.map((m) => ({
      role: m.role as DriverMessage["role"],
      content: m.content,
    }));
  } else {
    session = createSession({ model: currentModel });
    kvSet("state:last_session_id", session.id);
  }

  let abortController: AbortController | null = null;

  const backend: Backend = {
    mode: "in-process",

    get model() { return currentModel; },
    setModel(name: string) { currentModel = name; },
    get sessionId() { return session.id; },

    async send(message, callbacks) {
      addMessage(session.id, "user", message);
      history.push({ role: "user", content: message });

      abortController = new AbortController();

      const agentConfig = {
        sessionId: session.id,
        backend: currentModel,
        model: currentModel,
        systemPrompt,
        maxTokens: config.agent.maxTokens,
        temperature: config.agent.temperature,
        extendedThinking: config.agent.extendedThinking,
        toolIds: null as string[] | null,
        signal: abortController.signal,
      };

      let fullResponse = "";

      // Subscribe to orchestratorBus for live sub-agent events
      // (mirrors kernel.ts ask handler wiring — same events, same lifecycle)
      const { orchestratorBus } = await import("../daemon/agent/orchestrator.js");
      const unsubs: Array<() => void> = [];
      unsubs.push(orchestratorBus.on("sub:started", (d) => {
        callbacks.onSubAgentStarted({
          parentSessionId: d.parentSessionId,
          childSessionId: d.childSessionId,
          label: d.label,
          agentType: d.agentType,
        });
      }));
      unsubs.push(orchestratorBus.on("sub:text_delta", (d) => {
        callbacks.onSubAgentTextDelta(d.childSessionId, d.content);
      }));
      unsubs.push(orchestratorBus.on("sub:tool_call", (d) => {
        callbacks.onSubAgentToolCall(d.childSessionId, d.toolName);
      }));
      unsubs.push(orchestratorBus.on("sub:tool_result", (d) => {
        callbacks.onSubAgentToolResult(d.childSessionId, d.toolCallId, d.isError);
      }));
      unsubs.push(orchestratorBus.on("sub:complete", (d) => {
        callbacks.onSubAgentComplete(d.childSessionId, d.label, d.status, d.durationMs);
      }));

      try {
        for await (const event of runAgent(agentConfig, history)) {
          switch (event.type) {
            case "text_delta":
              fullResponse += event.content;
              callbacks.onTextDelta(event.content);
              break;
            case "thinking":
              callbacks.onThinking(event.content);
              break;
            case "tool_call_start":
              callbacks.onToolCallStart({
                id: event.toolCall.id,
                name: event.toolCall.name,
                arguments: event.toolCall.arguments,
              });
              break;
            case "tool_result":
              callbacks.onToolResult(event.toolCallId, event.result, event.isError);
              break;
            case "turn_complete":
              callbacks.onTurnComplete(event.tokensIn, event.tokensOut);
              break;
            case "compaction":
              callbacks.onCompaction(event.beforeTokens, event.afterTokens);
              break;
            case "error":
              callbacks.onError(event.message);
              break;
          }
        }
      } catch (err: unknown) {
        if ((err as Error).name !== "AbortError") {
          callbacks.onError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        // Unsubscribe from orchestratorBus events
        unsubs.forEach((u) => u());
      }

      if (fullResponse) {
        history.push({ role: "assistant", content: fullResponse });
      }

      abortController = null;
    },

    abort() {
      abortController?.abort();
      abortController = null;
    },

    async newSession() {
      session = createSession({ model: currentModel });
      history = [];
      kvSet("state:last_session_id", session.id);
      return mapSessionRow(session);
    },

    async listSessions(limit = 20) {
      return dbListSessions(limit).map(mapSessionRow);
    },

    async resumeSession(slugOrId) {
      const found = getSessionBySlug(slugOrId) ?? getSession(slugOrId);
      if (!found) return null;
      session = found;
      const rows = getMessages(session.id);
      history = rows.map((m) => ({
        role: m.role as DriverMessage["role"],
        content: m.content,
      }));
      kvSet("state:last_session_id", session.id);
      return mapSessionRow(session);
    },

    async getHistory(limit = 50) {
      const rows = getMessages(session.id);
      const entries: HistoryEntry[] = rows.slice(-limit).map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: m.created_at,
      }));
      return entries;
    },

    async clearHistory() {
      // Create a fresh session to "clear" history
      session = createSession({ model: currentModel });
      history = [];
      kvSet("state:last_session_id", session.id);
    },

    async compact() {
      // In-process: return current token estimates
      const totalTokens = history.reduce((sum, m) => sum + m.content.length / 4, 0);
      return { before: Math.round(totalTokens), after: Math.round(totalTokens * 0.6) };
    },

    async listModels() {
      return getStaticModelList(currentModel);
    },

    // Channels require the daemon
    async listChannels() { return []; },
    async connectChannel() { return false; },
    async disconnectChannel() { return false; },

    // Connectors require the daemon
    async listConnectors() { return []; },
    async connectService() { return false; },
    async disconnectService() { return false; },
    async checkHealth() { return []; },

    // Triggers require the daemon
    async listTriggers() { return []; },
    async enableTrigger() { return false; },
    async disableTrigger() { return false; },

    // Skills — direct file access (no daemon needed)
    async listSkills() {
      return loadSkillsDirect();
    },

    async getSkill(name) {
      return loadSkillDirect(name);
    },

    async getStatus() {
      return { phase: "in-process", uptime: 0 };
    },

    async getConfig() {
      return loadConfigDirect();
    },
  };

  return backend;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Create the appropriate backend based on daemon availability. */
export async function createBackend(): Promise<Backend> {
  if (existsSync(SOCKET_PATH)) {
    return createDaemonBackend();
  }
  return createInProcessBackend();
}

// ---------------------------------------------------------------------------
// Setup persistence (used by Setup component)
// ---------------------------------------------------------------------------

export async function persistSetup(
  provider: { envKey: string; model: string },
  apiKey: string,
): Promise<void> {
  const { saveSecret } = await import("../shared/secrets.js");
  const { getConfigDir } = await import("../shared/config.js");

  if (apiKey && provider.envKey) {
    saveSecret(provider.envKey, apiKey);
  }

  const configDir = getConfigDir();
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  const configPath = join(configDir, "config.json");
  const config = { agent: { model: provider.model } };
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Shape of session rows from the daemon IPC response. */
interface DaemonSessionRow {
  id: string;
  slug: string;
  title: string;
  model: string;
  token_count: number;
  updated_at: number;
}

/** Shape of channel rows from the daemon IPC response. */
interface DaemonChannelRow {
  name: string;
  status: string;
  error?: string;
  connected_at?: string;
}

function mapDaemonSession(row: DaemonSessionRow): SessionInfo {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    model: row.model,
    tokenCount: row.token_count,
    updatedAt: row.updated_at,
  };
}

function mapDaemonChannel(row: DaemonChannelRow): ChannelInfo {
  return {
    name: row.name,
    status: row.status,
    error: row.error,
    connectedAt: row.connected_at,
  };
}

function mapSessionRow(row: {
  id: string;
  slug: string;
  title: string;
  model: string;
  token_count: number;
  updated_at: number;
}): SessionInfo {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    model: row.model,
    tokenCount: row.token_count,
    updatedAt: row.updated_at,
  };
}

function fallbackSession(model: string): SessionInfo {
  return {
    id: "",
    slug: "new",
    title: "New session",
    model,
    tokenCount: 0,
    updatedAt: Date.now(),
  };
}

/**
 * Dispatch a raw agent event object (from daemon IPC) to typed callbacks.
 */
function dispatchAgentEvent(
  event: Record<string, unknown>,
  callbacks: BackendCallbacks,
): void {
  switch (event.type) {
    case "text_delta":
      callbacks.onTextDelta(event.content as string);
      break;
    case "thinking":
      callbacks.onThinking(event.content as string);
      break;
    case "tool_call_start": {
      const tc = event.toolCall as { id: string; name: string; arguments: string };
      callbacks.onToolCallStart(tc);
      break;
    }
    case "tool_result":
      callbacks.onToolResult(
        event.toolCallId as string,
        event.result as string,
        event.isError as boolean,
      );
      break;
    case "turn_complete":
      callbacks.onTurnComplete(
        event.tokensIn as number,
        event.tokensOut as number,
      );
      break;
    case "compaction":
      callbacks.onCompaction(
        event.beforeTokens as number,
        event.afterTokens as number,
      );
      break;
    case "error":
      callbacks.onError(event.message as string);
      break;

    // Sub-agent events from orchestratorBus forwarded through the daemon
    case "sub:started":
      callbacks.onSubAgentStarted({
        parentSessionId: event.parentSessionId as string,
        childSessionId: event.childSessionId as string,
        label: event.label as string,
        agentType: event.agentType as string,
      });
      break;
    case "sub:text_delta":
      callbacks.onSubAgentTextDelta(event.childSessionId as string, event.content as string);
      break;
    case "sub:tool_call":
      callbacks.onSubAgentToolCall(event.childSessionId as string, event.toolName as string);
      break;
    case "sub:tool_result":
      callbacks.onSubAgentToolResult(
        event.childSessionId as string,
        event.toolCallId as string,
        event.isError as boolean,
      );
      break;
    case "sub:complete":
      callbacks.onSubAgentComplete(
        event.childSessionId as string,
        event.label as string,
        event.status as string,
        event.durationMs as number,
      );
      break;
  }
}

/**
 * Register all agent tools by importing their modules.
 * Must match the kernel's tool set (kernel.ts step 6).
 */
async function registerTools(): Promise<void> {
  await Promise.all([
    import("../daemon/agent/tools/bash.js"),
    import("../daemon/agent/tools/read.js"),
    import("../daemon/agent/tools/write.js"),
    import("../daemon/agent/tools/edit.js"),
    import("../daemon/agent/tools/list.js"),
    import("../daemon/agent/tools/search.js"),
    import("../daemon/agent/tools/web.js"),
    import("../daemon/agent/tools/screenshot.js"),
    import("../daemon/agent/tools/camera.js"),
    import("../daemon/agent/tools/browse.js"),
    import("../daemon/agent/tools/parallel.js"),
    import("../daemon/agent/tools/delegate.js"),
    import("../daemon/agent/tools/connector.js"),
    import("../daemon/agent/tools/skill.js"),
    import("../daemon/agent/tools/webdev.js"),
  ]);
}

/**
 * Load the system prompt from ~/.config/jeriko/agent.md and inject
 * skill summaries. Mirrors the kernel's boot sequence (steps 9-10).
 */
async function loadSystemPrompt(): Promise<string> {
  const { readFileSync, existsSync: exists } = await import("node:fs");
  const { join: pathJoin } = await import("node:path");
  const { getConfigDir } = await import("../shared/config.js");

  let systemPrompt = "";

  const promptPath = pathJoin(getConfigDir(), "agent.md");
  if (exists(promptPath)) {
    systemPrompt = readFileSync(promptPath, "utf-8");
  }

  try {
    const { listSkills, formatSkillSummaries } = await import("../shared/skill-loader.js");
    const skills = await listSkills();
    if (skills.length > 0) {
      systemPrompt = systemPrompt + "\n\n" + formatSkillSummaries(skills);
    }
  } catch {
    // Non-fatal — skills are optional
  }

  return systemPrompt;
}

/**
 * Load skills directly from the filesystem (no daemon needed).
 */
async function loadSkillsDirect(): Promise<SkillInfo[]> {
  try {
    const { listSkills } = await import("../shared/skill-loader.js");
    const summaries = await listSkills();
    return summaries.map((s) => ({
      name: s.name,
      description: s.description,
      userInvocable: s.userInvocable ?? false,
    }));
  } catch {
    return [];
  }
}

/**
 * Load a single skill directly from the filesystem.
 */
async function loadSkillDirect(name: string): Promise<{ name: string; description: string; body: string } | null> {
  try {
    const { loadSkill } = await import("../shared/skill-loader.js");
    const skill = await loadSkill(name);
    if (!skill) return null;
    return {
      name: skill.meta.name,
      description: skill.meta.description,
      body: skill.body,
    };
  } catch {
    return null;
  }
}

/**
 * Load config directly from the filesystem.
 */
async function loadConfigDirect(): Promise<Record<string, unknown>> {
  try {
    const { loadConfig } = await import("../shared/config.js");
    return loadConfig() as unknown as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Static model list for in-process mode (no daemon to query).
 */
function getStaticModelList(currentModel: string): ModelInfo[] {
  return [
    { id: "claude", name: "Claude Sonnet", provider: "anthropic", contextWindow: 200000, supportsTools: true, supportsVision: true },
    { id: "gpt4", name: "GPT-4o", provider: "openai", contextWindow: 128000, supportsTools: true, supportsVision: true },
    { id: "local", name: "Local (Ollama)", provider: "ollama", supportsTools: false, supportsVision: false },
  ];
}
