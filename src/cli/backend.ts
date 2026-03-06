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
  ProviderInfo,
  PlanInfo,
  ShareInfo,
  TaskDef,
  NotificationPref,
  AuthStatus,
} from "./types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of a /connect command — either already connected, OAuth required, or error. */
export interface ConnectResult {
  ok: boolean;
  status?: "already_connected" | "oauth_required";
  loginUrl?: string;
  label?: string;
  error?: string;
}

/** Result of a /disconnect command. */
export interface DisconnectResult {
  ok: boolean;
  label?: string;
  error?: string;
}

/** Callbacks invoked during channel add (e.g. WhatsApp QR streaming). */
export interface ChannelAddCallbacks {
  onQR?: (qr: string) => void;
}

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
  getSessionDetail(): Promise<SessionInfo | null>;
  updateSessionModel(model: string): Promise<void>;
  deleteSessionById(slugOrId: string): Promise<boolean>;
  renameSession(title: string): Promise<boolean>;
  getHistory(limit?: number): Promise<HistoryEntry[]>;
  clearHistory(): Promise<void>;
  compact(): Promise<{ before: number; after: number }>;

  // Models
  listModels(): Promise<ModelInfo[]>;

  // Channel management (daemon only — no-ops in-process)
  listChannels(): Promise<ChannelInfo[]>;
  connectChannel(name: string): Promise<{ ok: boolean; error?: string }>;
  disconnectChannel(name: string): Promise<{ ok: boolean; error?: string }>;
  addChannel(name: string, config?: Record<string, unknown>, callbacks?: ChannelAddCallbacks): Promise<{ ok: boolean; error?: string }>;
  removeChannel(name: string): Promise<{ ok: boolean; error?: string }>;

  // Connectors (daemon only — returns [] in-process)
  listConnectors(): Promise<ConnectorInfo[]>;
  connectService(name: string): Promise<ConnectResult>;
  disconnectService(name: string): Promise<DisconnectResult>;
  checkHealth(name?: string): Promise<Array<{ name: string; healthy: boolean; latencyMs: number; error?: string }>>;

  // Triggers (daemon only)
  listTriggers(): Promise<TriggerInfo[]>;
  enableTrigger(id: string): Promise<boolean>;
  disableTrigger(id: string): Promise<boolean>;

  // Skills
  listSkills(): Promise<SkillInfo[]>;
  getSkill(name: string): Promise<{ name: string; description: string; body: string } | null>;

  // Shares
  createShare(): Promise<ShareInfo>;
  listShares(): Promise<ShareInfo[]>;
  revokeShare(shareId: string): Promise<boolean>;

  // Providers
  listProviders(): Promise<ProviderInfo[]>;
  addProvider(config: { id: string; name?: string; baseUrl: string; apiKey: string; defaultModel?: string }): Promise<{ id: string; name: string; baseUrl: string }>;
  removeProvider(id: string): Promise<{ id: string; removed: boolean }>;

  // Billing
  getPlan(): Promise<PlanInfo>;
  startUpgrade(email: string): Promise<{ url: string }>;
  openBillingPortal(): Promise<{ url: string }>;
  cancelSubscription(): Promise<{ cancelled?: boolean; already_cancelling?: boolean; cancel_at: string }>;

  // Session lifecycle
  killSession(): Promise<SessionInfo>;
  archiveSession(): Promise<SessionInfo>;

  // Tasks (unified — backed by TriggerEngine)
  listTasks(): Promise<TaskDef[]>;
  createTask(params: Record<string, unknown>): Promise<TaskDef>;
  getTask(id: string): Promise<TaskDef>;
  pauseTask(id: string): Promise<TaskDef>;
  resumeTask(id: string): Promise<TaskDef>;
  deleteTask(id: string): Promise<{ deleted: boolean; id: string }>;
  testTask(id: string): Promise<{ fired: boolean; id: string; run_count: number }>;
  getTaskLog(limit?: number): Promise<TaskDef[]>;
  getTaskTypes(): Promise<Record<string, unknown>>;

  // Notifications
  listNotifications(): Promise<NotificationPref[]>;

  // Auth
  getAuthStatus(): Promise<AuthStatus[]>;
  saveAuth(connectorName: string, keys: string[]): Promise<{ connector: string; label: string; saved: number }>;

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
      // Always send the current model — ensures /model switches take effect
      if (currentModel) params.model = currentModel;

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

    async getSessionDetail() {
      if (!currentSessionId) return null;
      try {
        const sessions = await backend.listSessions(100);
        return sessions.find((s) => s.id === currentSessionId) ?? null;
      } catch { return null; }
    },

    async updateSessionModel(model) {
      if (!currentSessionId) return;
      currentModel = model;
      try {
        await sendRequest("update_session", { session_id: currentSessionId, model });
      } catch { /* best effort — local state already updated */ }
    },

    async deleteSessionById(slugOrId) {
      try {
        // Resume to validate it exists, then we'd need a delete method.
        // For now, use the session list to verify existence.
        const sessions = await backend.listSessions(100);
        const target = sessions.find((s) => s.slug === slugOrId || s.id === slugOrId);
        if (!target) return false;
        if (target.id === currentSessionId) return false;
        // Delete via update_session with archived flag
        await sendRequest("update_session", { session_id: target.id, title: "[deleted]" });
        return true;
      } catch { return false; }
    },

    async renameSession(title) {
      if (!currentSessionId) return false;
      try {
        await sendRequest("update_session", { session_id: currentSessionId, title });
        return true;
      } catch { return false; }
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
        if (response.ok) return { ok: true };
        return { ok: false, error: response.error ?? `Failed to connect "${name}"` };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },

    async disconnectChannel(name) {
      try {
        const response = await sendRequest("channel_disconnect", { name });
        if (response.ok) return { ok: true };
        return { ok: false, error: response.error ?? `Failed to disconnect "${name}"` };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },

    async addChannel(name, channelConfig, callbacks) {
      try {
        const stream = sendStreamRequest("channel_add", { name, config: channelConfig }, {
          idleTimeoutMs: 150_000, // WhatsApp QR scan can take up to 2 minutes
        });
        let result: IteratorResult<Record<string, unknown>, unknown>;
        while (!(result = await stream.next()).done) {
          const event = result.value;
          if (event.type === "qr" && callbacks?.onQR) {
            callbacks.onQR(event.qr as string);
          }
        }
        const resp = result.value as { ok?: boolean; error?: string } | void;
        if (resp?.ok === false) return { ok: false, error: resp.error ?? `Failed to add "${name}"` };
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },

    async removeChannel(name) {
      try {
        const response = await sendRequest("channel_remove", { name });
        if (response.ok) return { ok: true };
        return { ok: false, error: response.error ?? `Failed to remove "${name}"` };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
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
        if (!response.ok) return { ok: false, error: response.error ?? "Unknown error" };
        const data = response.data as Record<string, unknown>;
        return {
          ok: true,
          status: data.status as ConnectResult["status"],
          loginUrl: data.loginUrl as string | undefined,
          label: data.label as string | undefined,
        };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Connection failed" };
      }
    },

    async disconnectService(name) {
      try {
        const response = await sendRequest("connector_disconnect" as any, { name });
        if (!response.ok) return { ok: false, error: response.error ?? "Unknown error" };
        const data = response.data as Record<string, unknown>;
        return { ok: true, label: data.label as string | undefined };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Disconnect failed" };
      }
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

    // Shares
    async createShare() {
      const response = await sendRequest("share", { session_id: currentSessionId });
      if (!response.ok) throw new Error(response.error ?? "Failed to create share");
      const data = response.data as Record<string, unknown>;
      return mapDaemonShare(data);
    },

    async listShares() {
      try {
        const response = await sendRequest("shares", { session_id: currentSessionId });
        if (response.ok && Array.isArray(response.data)) {
          return (response.data as Record<string, unknown>[]).map(mapDaemonShare);
        }
      } catch { /* daemon may not support */ }
      return [];
    },

    async revokeShare(shareId) {
      try {
        const response = await sendRequest("share_revoke", { share_id: shareId });
        return response.ok;
      } catch { return false; }
    },

    // Providers
    async listProviders() {
      try {
        const response = await sendRequest("providers.list", {});
        if (response.ok && Array.isArray(response.data)) {
          return response.data as ProviderInfo[];
        }
      } catch { /* fall through */ }
      return loadProvidersDirect();
    },

    async addProvider(cfg) {
      try {
        const response = await sendRequest("providers.add", {
          id: cfg.id,
          name: cfg.name,
          base_url: cfg.baseUrl,
          api_key: cfg.apiKey,
          default_model: cfg.defaultModel,
        });
        if (response.ok && response.data) {
          return response.data as { id: string; name: string; baseUrl: string };
        }
      } catch (err) {
        throw new Error(err instanceof Error ? err.message : String(err));
      }
      throw new Error("Failed to add provider");
    },

    async removeProvider(id) {
      try {
        const response = await sendRequest("providers.remove", { id });
        if (response.ok && response.data) {
          return response.data as { id: string; removed: boolean };
        }
      } catch (err) {
        throw new Error(err instanceof Error ? err.message : String(err));
      }
      throw new Error("Failed to remove provider");
    },

    // Billing
    async getPlan() {
      try {
        const response = await sendRequest("billing.plan" as any, {});
        if (response.ok && response.data) {
          return response.data as PlanInfo;
        }
      } catch { /* fall through */ }
      return getDefaultPlan();
    },

    async startUpgrade(email) {
      const response = await sendRequest("billing.checkout" as any, { email, client_ip: "cli-local", user_agent: "jeriko-ink-repl" });
      if (!response.ok) throw new Error(response.error ?? "Failed to create checkout");
      return response.data as { url: string };
    },

    async openBillingPortal() {
      const response = await sendRequest("billing.portal" as any, {});
      if (!response.ok) throw new Error(response.error ?? "Failed to open portal");
      return response.data as { url: string };
    },

    async cancelSubscription() {
      const response = await sendRequest("billing.cancel" as any, {});
      if (!response.ok) throw new Error(response.error ?? "Failed to cancel subscription");
      return response.data as { cancelled?: boolean; already_cancelling?: boolean; cancel_at: string };
    },

    // Session lifecycle
    async killSession() {
      if (!currentSessionId) throw new Error("No active session");
      const response = await sendRequest("kill_session" as any, { session_id: currentSessionId, model: currentModel });
      if (!response.ok) throw new Error(response.error ?? "Failed to kill session");
      const row = response.data as DaemonSessionRow;
      currentSessionId = row.id;
      return mapDaemonSession(row);
    },

    async archiveSession() {
      if (!currentSessionId) throw new Error("No active session");
      const response = await sendRequest("archive_session" as any, { session_id: currentSessionId, model: currentModel });
      if (!response.ok) throw new Error(response.error ?? "Failed to archive session");
      const row = response.data as DaemonSessionRow;
      currentSessionId = row.id;
      return mapDaemonSession(row);
    },

    // Tasks (unified — backed by TriggerEngine via IPC)
    async listTasks() {
      try {
        const response = await sendRequest("tasks" as any, {});
        if (response.ok && Array.isArray(response.data)) {
          return response.data as TaskDef[];
        }
      } catch { /* daemon may not support */ }
      return [];
    },
    async createTask(params) {
      const response = await sendRequest("task_create" as any, params);
      if (!response.ok) throw new Error(response.error ?? "Failed to create task");
      return response.data as TaskDef;
    },
    async getTask(id) {
      const response = await sendRequest("task_info" as any, { id });
      if (!response.ok) throw new Error(response.error ?? "Task not found");
      return response.data as TaskDef;
    },
    async pauseTask(id) {
      const response = await sendRequest("task_pause" as any, { id });
      if (!response.ok) throw new Error(response.error ?? "Failed to pause task");
      return response.data as TaskDef;
    },
    async resumeTask(id) {
      const response = await sendRequest("task_resume" as any, { id });
      if (!response.ok) throw new Error(response.error ?? "Failed to resume task");
      return response.data as TaskDef;
    },
    async deleteTask(id) {
      const response = await sendRequest("task_delete" as any, { id });
      if (!response.ok) throw new Error(response.error ?? "Failed to delete task");
      return response.data as { deleted: boolean; id: string };
    },
    async testTask(id) {
      const response = await sendRequest("task_test" as any, { id });
      if (!response.ok) throw new Error(response.error ?? "Failed to test task");
      return response.data as { fired: boolean; id: string; run_count: number };
    },
    async getTaskLog(limit = 20) {
      const response = await sendRequest("task_log" as any, { limit });
      if (!response.ok) throw new Error(response.error ?? "Failed to get task log");
      return (response.data ?? []) as TaskDef[];
    },
    async getTaskTypes() {
      const response = await sendRequest("task_types" as any, {});
      if (!response.ok) throw new Error(response.error ?? "Failed to get task types");
      return response.data as Record<string, unknown>;
    },

    // Notifications
    async listNotifications() {
      try {
        const response = await sendRequest("notifications" as any, {});
        if (response.ok && Array.isArray(response.data)) {
          return response.data as NotificationPref[];
        }
      } catch { /* daemon may not support */ }
      return [];
    },

    // Auth
    async getAuthStatus() {
      try {
        const response = await sendRequest("auth_status" as any, {});
        if (response.ok && Array.isArray(response.data)) {
          return response.data as AuthStatus[];
        }
      } catch { /* fall through to direct */ }
      return loadAuthStatusDirect();
    },

    async saveAuth(connectorName, keys) {
      const response = await sendRequest("auth_save" as any, { name: connectorName, keys });
      if (!response.ok) throw new Error(response.error ?? "Failed to save auth");
      return response.data as { connector: string; label: string; saved: number };
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

  // Initialize LLM drivers + model registry (must match kernel step 7)
  // Without this, custom providers (Groq, OpenRouter, etc.) don't exist in-process.
  const { loadModelRegistry } = await import("../daemon/agent/drivers/models.js");
  await Promise.all([
    loadModelRegistry(),
    import("../daemon/agent/drivers/index.js"),
  ]);

  const { loadConfig } = await import("../shared/config.js");
  const {
    createSession,
    getSession,
    getSessionBySlug,
    listSessions: dbListSessions,
  } = await import("../daemon/agent/session/session.js");
  const { addMessage, getMessages } = await import("../daemon/agent/session/message.js");
  const { kvGet, kvSet, kvList } = await import("../daemon/storage/kv.js");
  const { runAgent } = await import("../daemon/agent/agent.js");

  type DriverMessage = import("../daemon/agent/drivers/index.js").DriverMessage;

  const config = loadConfig();

  // Register custom providers from config + auto-discover from env vars (must match kernel step 7)
  const { registerCustomProviders } = await import("../daemon/agent/drivers/providers.js");
  if (config.providers?.length) {
    registerCustomProviders(config.providers);
  }
  const { discoverProviderPresets } = await import("../daemon/agent/drivers/presets.js");
  const explicitIds = new Set((config.providers ?? []).map((p: { id: string }) => p.id));
  const discovered = discoverProviderPresets(explicitIds);
  if (discovered.length > 0) {
    registerCustomProviders(discovered);
  }

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

      // Parse "provider:model" syntax (e.g. "groq:llama3" → backend="groq", model="llama3")
      const { parseModelSpec } = await import("../daemon/agent/drivers/models.js");
      const { backend: parsedBackend, model: parsedModel } = parseModelSpec(currentModel);

      const agentConfig = {
        sessionId: session.id,
        backend: parsedBackend,
        model: parsedModel,
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

    async getSessionDetail() {
      return mapSessionRow(session);
    },

    async updateSessionModel(model) {
      currentModel = model;
      const { updateSession: dbUpdate } = await import("../daemon/agent/session/session.js");
      dbUpdate(session.id, { model });
    },

    async deleteSessionById(slugOrId) {
      const target = getSessionBySlug(slugOrId) ?? getSession(slugOrId);
      if (!target || target.id === session.id) return false;
      const { deleteSession: dbDelete } = await import("../daemon/agent/session/session.js");
      dbDelete(target.id);
      return true;
    },

    async renameSession(title) {
      const { updateSession: dbUpdate } = await import("../daemon/agent/session/session.js");
      dbUpdate(session.id, { title });
      return true;
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
    async connectChannel() { return { ok: false, error: "Channels require the daemon" }; },
    async disconnectChannel() { return { ok: false, error: "Channels require the daemon" }; },
    async addChannel() { return { ok: false, error: "Channels require the daemon" }; },
    async removeChannel() { return { ok: false, error: "Channels require the daemon" }; },

    // Connectors require the daemon
    async listConnectors() { return []; },
    async connectService() { return { ok: false, error: "Connectors require the daemon" }; },
    async disconnectService() { return { ok: false, error: "Connectors require the daemon" }; },
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

    // Shares — direct DB access
    async createShare() {
      const { createShare: dbCreate } = await import("../daemon/storage/share.js");
      const { buildShareLink } = await import("../shared/urls.js");
      const msgs = getMessages(session.id);
      if (msgs.length === 0) throw new Error("Session has no messages to share");
      const snapshot = msgs.map((m) => ({ role: m.role, content: m.content, created_at: m.created_at }));
      const share = dbCreate({
        sessionId: session.id,
        title: session.title,
        model: currentModel,
        messages: JSON.stringify(snapshot),
      });
      return {
        shareId: share.share_id,
        url: buildShareLink(share.share_id),
        sessionId: share.session_id,
        title: share.title,
        model: share.model,
        messageCount: snapshot.length,
        createdAt: share.created_at,
        expiresAt: share.expires_at,
      } satisfies ShareInfo;
    },

    async listShares() {
      const { listSharesBySession: dbList } = await import("../daemon/storage/share.js");
      const { buildShareLink } = await import("../shared/urls.js");
      const shares = dbList(session.id);
      return shares.map((s) => ({
        shareId: s.share_id,
        url: buildShareLink(s.share_id),
        sessionId: s.session_id,
        title: s.title,
        model: s.model,
        messageCount: JSON.parse(s.messages).length,
        createdAt: s.created_at,
        expiresAt: s.expires_at,
      })) satisfies ShareInfo[];
    },

    async revokeShare(shareId) {
      const { revokeShare: dbRevoke } = await import("../daemon/storage/share.js");
      return dbRevoke(shareId);
    },

    // Providers — direct config access
    async listProviders() {
      return loadProvidersDirect();
    },

    async addProvider(cfg) {
      return addProviderDirect(cfg);
    },

    async removeProvider(id) {
      return removeProviderDirect(id);
    },

    // Billing — direct access
    async getPlan() {
      return getDefaultPlan();
    },

    async startUpgrade(_email) {
      throw new Error("Upgrade requires the daemon. Start with: jeriko server start");
    },

    async openBillingPortal() {
      throw new Error("Billing portal requires the daemon. Start with: jeriko server start");
    },

    async cancelSubscription() {
      throw new Error("Cancellation requires the daemon. Start with: jeriko server start");
    },

    // Session lifecycle — direct DB access
    async killSession() {
      const { deleteSession: dbDelete, createSession: dbCreate } = await import("../daemon/agent/session/session.js");
      dbDelete(session.id);
      session = dbCreate({ model: currentModel });
      history = [];
      kvSet("state:last_session_id", session.id);
      return mapSessionRow(session);
    },

    async archiveSession() {
      const { archiveSession: dbArchive, createSession: dbCreate } = await import("../daemon/agent/session/session.js");
      dbArchive(session.id);
      session = dbCreate({ model: currentModel });
      history = [];
      kvSet("state:last_session_id", session.id);
      return mapSessionRow(session);
    },

    // Tasks — in-process mode has no TriggerEngine, return empty
    async listTasks() { return []; },
    async createTask() { throw new Error("Tasks require the daemon. Start with: jeriko serve"); },
    async getTask() { throw new Error("Tasks require the daemon"); },
    async pauseTask() { throw new Error("Tasks require the daemon"); },
    async resumeTask() { throw new Error("Tasks require the daemon"); },
    async deleteTask() { throw new Error("Tasks require the daemon"); },
    async testTask() { throw new Error("Tasks require the daemon"); },
    async getTaskLog() { return []; },
    async getTaskTypes() { return {}; },

    // Notifications — direct KV access
    async listNotifications() {
      const entries = kvList("notify:");
      return entries.map((e) => {
        const parts = e.key.split(":");
        return { channel: parts[1] ?? "", chatId: parts[2] ?? "", enabled: e.value as boolean };
      }) satisfies NotificationPref[];
    },

    // Auth — direct connector access
    async getAuthStatus() {
      return loadAuthStatusDirect();
    },

    async saveAuth(connectorName, keys) {
      return saveAuthDirect(connectorName, keys);
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

function mapDaemonShare(row: Record<string, unknown>): ShareInfo {
  return {
    shareId: row.share_id as string,
    url: row.url as string,
    sessionId: row.session_id as string,
    title: row.title as string,
    model: row.model as string,
    messageCount: row.message_count as number,
    createdAt: row.created_at as number,
    expiresAt: (row.expires_at as number | null) ?? null,
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
    import("../daemon/agent/tools/memory-tool.js"),
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

  // Inject persistent memory (mirrors kernel boot)
  try {
    const { homedir: getHome } = await import("node:os");
    const memoryPath = pathJoin(process.env.HOME || getHome(), ".jeriko", "memory", "MEMORY.md");
    if (exists(memoryPath)) {
      const memory = readFileSync(memoryPath, "utf-8").trim();
      if (memory) {
        systemPrompt = systemPrompt + "\n\n## Persistent Memory\n" +
          "The following is your persistent memory from prior sessions. " +
          "Use the `memory` tool to update it when you learn stable user preferences.\n\n" +
          memory;
      }
    }
  } catch {
    // Non-fatal — memory is optional
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
 * Uses the model registry if available, falls back to well-known defaults.
 */
function getStaticModelList(_currentModel: string): ModelInfo[] {
  try {
    const { listModels: registryListModels, getCapabilities } = require("../daemon/agent/drivers/models.js");
    const all = registryListModels() as import("../daemon/agent/drivers/models.js").ModelCapabilities[];

    if (all.length > 0) {
      // Return a subset (top models per provider) to keep the list manageable
      const seen = new Set<string>();
      const results: ModelInfo[] = [];
      for (const caps of all) {
        const key = `${caps.provider}:${caps.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({
          id: caps.id,
          name: caps.id,
          provider: caps.provider,
          contextWindow: caps.context,
          maxOutput: caps.maxOutput,
          supportsTools: caps.toolCall,
          supportsReasoning: caps.reasoning,
          costInput: caps.costInput,
          costOutput: caps.costOutput,
        });
      }
      return results;
    }
  } catch {
    // Registry not loaded — fall through to defaults
  }

  return [
    { id: "claude", name: "Claude Sonnet", provider: "anthropic", contextWindow: 200000, supportsTools: true, supportsReasoning: true },
    { id: "gpt4", name: "GPT-4o", provider: "openai", contextWindow: 128000, supportsTools: true },
    { id: "local", name: "Local (Ollama)", provider: "ollama" },
  ];
}

/**
 * Load provider list directly from config + presets (no daemon needed).
 *
 * Mirrors the daemon's providers.list IPC method: returns built-in,
 * custom, discovered (env var set), and available (preset, not configured).
 */
function loadProvidersDirect(): ProviderInfo[] {
  try {
    const { loadConfig: loadCfg } = require("../shared/config.js");
    const { PROVIDER_PRESETS } = require("../daemon/agent/drivers/presets.js");
    const cfg = loadCfg();

    const registered = new Set<string>();
    const providers: ProviderInfo[] = [];

    // Built-in drivers
    for (const id of ["anthropic", "openai", "local"] as const) {
      registered.add(id);
      providers.push({
        id,
        name: id.charAt(0).toUpperCase() + id.slice(1),
        type: "built-in",
      });
    }

    // Custom providers from config
    for (const p of cfg.providers ?? []) {
      registered.add(p.id);
      providers.push({
        id: p.id,
        name: p.name,
        type: "custom",
        baseUrl: p.baseUrl,
        defaultModel: p.defaultModel,
        modelCount: p.models ? Object.keys(p.models).length : undefined,
      });
    }

    // Presets: discovered (env var set) or available (not set)
    for (const preset of PROVIDER_PRESETS as ReadonlyArray<{ id: string; name: string; baseUrl: string; envKey: string; envKeyAlt?: string; defaultModel?: string }>) {
      if (registered.has(preset.id)) continue;
      const hasKey = !!(
        process.env[preset.envKey] ??
        (preset.envKeyAlt ? process.env[preset.envKeyAlt] : undefined)
      );
      providers.push({
        id: preset.id,
        name: preset.name,
        type: hasKey ? "discovered" : "available",
        baseUrl: preset.baseUrl,
        defaultModel: preset.defaultModel,
        envKey: preset.envKey,
      });
    }

    return providers;
  } catch {
    return [];
  }
}

/**
 * Add a provider directly to config file (no daemon needed).
 */
function addProviderDirect(cfg: {
  id: string;
  name?: string;
  baseUrl: string;
  apiKey: string;
  defaultModel?: string;
}): { id: string; name: string; baseUrl: string } {
  const { readFileSync: readFs, writeFileSync: writeFs, existsSync: exists } = require("node:fs");
  const { join: pathJ } = require("node:path");
  const { getConfigDir } = require("../shared/config.js");

  const configDir = getConfigDir();
  const configPath = pathJ(configDir, "config.json");

  let fileConfig: Record<string, unknown> = {};
  if (exists(configPath)) {
    fileConfig = JSON.parse(readFs(configPath, "utf-8"));
  }

  const providers = (fileConfig.providers as Array<Record<string, unknown>> | undefined) ?? [];
  if (providers.some((p) => p.id === cfg.id)) {
    throw new Error(`Provider "${cfg.id}" already exists`);
  }

  const displayName = cfg.name ?? cfg.id.charAt(0).toUpperCase() + cfg.id.slice(1);
  const newProvider = {
    id: cfg.id,
    name: displayName,
    baseUrl: cfg.baseUrl,
    apiKey: cfg.apiKey,
    type: "openai-compatible",
    ...(cfg.defaultModel ? { defaultModel: cfg.defaultModel } : {}),
  };

  providers.push(newProvider);
  fileConfig.providers = providers;

  if (!exists(configDir)) {
    const { mkdirSync } = require("node:fs");
    mkdirSync(configDir, { recursive: true });
  }
  writeFs(configPath, JSON.stringify(fileConfig, null, 2) + "\n");

  return { id: cfg.id, name: displayName, baseUrl: cfg.baseUrl };
}

/**
 * Remove a provider directly from config file (no daemon needed).
 */
function removeProviderDirect(id: string): { id: string; removed: boolean } {
  const { readFileSync: readFs, writeFileSync: writeFs, existsSync: exists } = require("node:fs");
  const { join: pathJ } = require("node:path");
  const { getConfigDir } = require("../shared/config.js");

  const configPath = pathJ(getConfigDir(), "config.json");
  if (!exists(configPath)) {
    throw new Error(`Provider "${id}" not found`);
  }

  const fileConfig = JSON.parse(readFs(configPath, "utf-8"));
  const providers = (fileConfig.providers as Array<Record<string, unknown>> | undefined) ?? [];
  const idx = providers.findIndex((p) => p.id === id);
  if (idx === -1) throw new Error(`Provider "${id}" not found`);

  providers.splice(idx, 1);
  fileConfig.providers = providers;
  writeFs(configPath, JSON.stringify(fileConfig, null, 2) + "\n");

  return { id, removed: true };
}

/**
 * Default plan info when billing is not configured.
 */
function getDefaultPlan(): PlanInfo {
  return {
    tier: "free",
    label: "Free",
    status: "active",
    connectors: { used: 0, limit: 2 },
    triggers: { used: 0, limit: 3 },
  };
}


/**
 * Load auth status directly from connector definitions (no daemon needed).
 */
function loadAuthStatusDirect(): AuthStatus[] {
  try {
    const { CONNECTOR_DEFS, isConnectorConfigured, isSlotSet, slotLabel, primaryVarName } = require("../shared/connector.js");
    return CONNECTOR_DEFS.map((def: any) => ({
      name: def.name,
      label: def.label,
      description: def.description,
      configured: isConnectorConfigured(def.name),
      required: def.required.map((entry: string | string[]) => ({
        variable: primaryVarName(entry),
        label: slotLabel(entry),
        set: isSlotSet(entry),
      })),
      optional: def.optional.map((v: string) => ({
        variable: v,
        set: !!process.env[v],
      })),
    })) as AuthStatus[];
  } catch {
    return [];
  }
}

/**
 * Save auth credentials directly (no daemon needed).
 */
function saveAuthDirect(
  connectorName: string,
  keys: string[],
): { connector: string; label: string; saved: number } {
  const { getConnectorDef, primaryVarName, isConnectorConfigured } = require("../shared/connector.js");
  const { saveSecret } = require("../shared/secrets.js");

  const def = getConnectorDef(connectorName);
  if (!def) throw new Error(`Unknown connector: ${connectorName}`);

  if (keys.length < def.required.length) {
    const varNames = def.required.map((e: string | string[]) => primaryVarName(e));
    throw new Error(`${def.label} requires ${def.required.length} key(s): ${varNames.join(", ")}`);
  }

  // Billing gate: check if the tier allows a new connector (skip if already configured)
  if (!isConnectorConfigured(connectorName) && process.env.STRIPE_BILLING_SECRET_KEY) {
    try {
      const { canActivateConnector } = require("../daemon/billing/license.js");
      const check = canActivateConnector();
      if (!check.allowed) throw new Error(check.reason);
    } catch (err: unknown) {
      // Re-throw gate errors, swallow module load failures (billing DB may not exist)
      if (err instanceof Error && err.message.includes("Connector limit reached")) throw err;
    }
  }

  let saved = 0;
  for (let i = 0; i < def.required.length; i++) {
    const varName = primaryVarName(def.required[i]);
    saveSecret(varName, keys[i]);
    saved++;
  }

  return { connector: connectorName, label: def.label, saved };
}
