// Daemon kernel — 15-step boot sequence and graceful shutdown.
// This is the entry point for `jeriko serve`.

import { getLogger, Logger } from "../shared/logger.js";
import { loadConfig, type JerikoConfig } from "../shared/config.js";
import { initDatabase, closeDatabase } from "./storage/db.js";
import { ChannelRegistry } from "./services/channels/index.js";
import { startChannelRouter } from "./services/channels/router.js";
import { TriggerEngine } from "./services/triggers/engine.js";
import { createApp, startServer, stopServer, type AppContext } from "./api/app.js";
import { startSocketServer, stopSocketServer, registerMethod, registerStreamMethod } from "./api/socket.js";
import { WorkerPool } from "./workers/pool.js";
import { PluginLoader } from "./plugin/loader.js";
import { ConnectorManager } from "./services/connectors/manager.js";
import type { Database } from "bun:sqlite";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KernelState {
  phase: "idle" | "booting" | "running" | "shutting_down" | "stopped";
  config: JerikoConfig | null;
  db: Database | null;
  channels: ChannelRegistry | null;
  triggers: TriggerEngine | null;
  connectors: ConnectorManager | null;
  workers: WorkerPool | null;
  plugins: PluginLoader | null;
  server: ReturnType<typeof Bun.serve> | null;
  startedAt: number | null;
}

// ---------------------------------------------------------------------------
// Kernel singleton state
// ---------------------------------------------------------------------------

const state: KernelState = {
  phase: "idle",
  config: null,
  db: null,
  channels: null,
  triggers: null,
  connectors: null,
  workers: null,
  plugins: null,
  server: null,
  startedAt: null,
};

let log: Logger;

// ---------------------------------------------------------------------------
// Boot sequence — 15 steps
// ---------------------------------------------------------------------------

/**
 * Boot the Jeriko daemon. Runs the full 15-step initialization sequence.
 *
 * Steps:
 *  1. Load configuration
 *  2. Initialize logger
 *  3. Open database
 *  4. Run migrations
 *  5. Initialize security policies
 *  6. Register built-in tools
 *  7. Initialize LLM drivers
 *  8. Create worker pool
 *  9. Create channel registry
 * 10. Create trigger engine
 * 11. Load plugins
 * 12. Start trigger engine
 * 13. Connect channels
 * 14. Start socket IPC server
 * 15. Start HTTP server
 */
export async function boot(opts?: { port?: number }): Promise<KernelState> {
  if (state.phase === "running") {
    throw new Error("Kernel is already running");
  }

  state.phase = "booting";

  // Step 0: Load secrets from ~/.config/jeriko/.env into process.env.
  // Must run before config load — some config values read process.env.
  const { loadSecrets } = await import("../shared/secrets.js");
  loadSecrets();

  // Step 1: Load configuration
  const config = loadConfig();
  state.config = config;

  // Step 2: Initialize logger
  log = getLogger({
    level: config.logging.level,
    maxFileSize: config.logging.maxFileSize,
    maxFiles: config.logging.maxFiles,
  });
  log.info("Kernel boot: step 1-2 — config loaded, logger initialized");

  // Step 3-4: Open database (initDatabase handles migrations)
  const db = initDatabase(config.storage.dbPath);
  state.db = db;
  log.info("Kernel boot: step 3-4 — database opened, migrations applied");

  // Step 5: Initialize security policies
  // Security is configured via the security section of JerikoConfig.
  // Path allowlisting and command blocklisting are applied at the exec layer.
  log.info("Kernel boot: step 5 — security policies loaded", {
    allowedPaths: config.security.allowedPaths.length,
    blockedCommands: config.security.blockedCommands.length,
  });

  // Step 5.5: Initialize billing subsystem
  // Load license from SQLite, verify against Stripe if stale (>7 days).
  // Non-fatal — billing is optional (free tier works without any Stripe config).
  try {
    const { isBillingConfigured } = await import("./billing/stripe.js");
    const { isLicenseStale, refreshFromStripe } = await import("./billing/license.js");

    if (isBillingConfigured() && isLicenseStale()) {
      await refreshFromStripe();
      log.info("Kernel boot: step 5.5 — billing license refreshed from Stripe");
    } else {
      log.info("Kernel boot: step 5.5 — billing initialized (using cached license)");
    }
  } catch (err) {
    log.warn(`Kernel boot: step 5.5 — billing init failed (non-fatal): ${err}`);
  }

  // Step 6: Register built-in tools
  // Tools self-register on import. We must import each tool file.
  await Promise.all([
    import("./agent/tools/bash.js"),
    import("./agent/tools/read.js"),
    import("./agent/tools/write.js"),
    import("./agent/tools/edit.js"),
    import("./agent/tools/list.js"),
    import("./agent/tools/search.js"),
    import("./agent/tools/web.js"),
    import("./agent/tools/screenshot.js"),
    import("./agent/tools/camera.js"),
    import("./agent/tools/parallel.js"),
    import("./agent/tools/browse.js"),
    import("./agent/tools/delegate.js"),
    import("./agent/tools/connector.js"),
    import("./agent/tools/skill.js"),
    import("./agent/tools/webdev.js"),
  ]);
  log.info("Kernel boot: step 6 — built-in tools registered");

  // Step 7: Initialize LLM drivers + model registry
  // Load model registry from models.dev (non-fatal — falls back to static defaults).
  // Drivers self-register on import via the driver index.
  const { loadModelRegistry } = await import("./agent/drivers/models.js");
  await Promise.all([
    loadModelRegistry(),
    import("./agent/drivers/index.js"),
  ]);

  // Register custom providers from config (OpenRouter, DeepInfra, Together, Groq, etc.)
  if (config.providers?.length) {
    const { registerCustomProviders } = await import("./agent/drivers/providers.js");
    registerCustomProviders(config.providers);
  }

  log.info("Kernel boot: step 7 — LLM drivers initialized, model registry loaded");

  // Step 8: Create worker pool
  const workers = new WorkerPool({ maxWorkers: 4 });
  state.workers = workers;
  log.info("Kernel boot: step 8 — worker pool created");

  // Step 9: Create channel registry
  const channels = new ChannelRegistry();
  state.channels = channels;

  // Register available channels based on config
  if (config.channels.telegram.token) {
    const { TelegramChannel } = await import("./services/channels/telegram.js");
    channels.register(new TelegramChannel({
      token: config.channels.telegram.token,
      adminIds: config.channels.telegram.adminIds,
    }));
  }
  if (config.channels.whatsapp.enabled) {
    const { WhatsAppChannel } = await import("./services/channels/whatsapp.js");
    channels.register(new WhatsAppChannel());
  }
  if (config.channels.slack.botToken && config.channels.slack.appToken) {
    const { SlackChannel } = await import("./services/channels/slack.js");
    channels.register(new SlackChannel({
      botToken: config.channels.slack.botToken,
      appToken: config.channels.slack.appToken,
      channelIds: config.channels.slack.channelIds.length > 0 ? config.channels.slack.channelIds : undefined,
      adminIds: config.channels.slack.adminIds.length > 0 ? config.channels.slack.adminIds : undefined,
    }));
  }
  if (config.channels.discord.token) {
    const { DiscordChannel } = await import("./services/channels/discord.js");
    channels.register(new DiscordChannel({
      token: config.channels.discord.token,
      guildIds: config.channels.discord.guildIds.length > 0 ? config.channels.discord.guildIds : undefined,
      channelIds: config.channels.discord.channelIds.length > 0 ? config.channels.discord.channelIds : undefined,
      adminIds: config.channels.discord.adminIds.length > 0 ? config.channels.discord.adminIds : undefined,
    }));
  }
  // Load system prompt from ~/.config/jeriko/agent.md (copied from AGENT.md at install).
  // This gives the AI its "Jeriko" identity and command knowledge.
  let systemPrompt = "";
  try {
    const { readFileSync, existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { getConfigDir } = await import("../shared/config.js");
    const promptPath = join(getConfigDir(), "agent.md");
    if (existsSync(promptPath)) {
      systemPrompt = readFileSync(promptPath, "utf-8");
      log.info(`Kernel boot: loaded system prompt from ${promptPath} (${systemPrompt.length} chars)`);
    } else {
      log.warn(`Kernel boot: no agent.md found at ${promptPath} — agent will have no system prompt`);
    }
  } catch (err) {
    log.warn(`Kernel boot: failed to load system prompt: ${err}`);
  }

  // Inject available skill summaries into the system prompt.
  // Only names + descriptions — full instructions loaded on demand via use_skill tool.
  try {
    const { listSkills, formatSkillSummaries } = await import("../shared/skill-loader.js");
    const skills = await listSkills();
    if (skills.length > 0) {
      const skillSection = formatSkillSummaries(skills);
      systemPrompt = systemPrompt + "\n\n" + skillSection;
      log.info(`Kernel boot: injected ${skills.length} skill summaries into system prompt`);
    }
  } catch (err) {
    log.warn(`Kernel boot: failed to load skill summaries: ${err}`);
  }

  // Bind channel message bus to the agent loop + slash-command controls.
  // TriggerEngine is created after the router (step 10), so we pass a lazy
  // accessor that reads from kernel state at call time.
  startChannelRouter({
    channels,
    defaultModel: config.agent.model,
    maxTokens: config.agent.maxTokens,
    temperature: config.agent.temperature,
    extendedThinking: config.agent.extendedThinking,
    systemPrompt,
    getTriggerEngine: () => state.triggers,
  });
  log.info("Kernel boot: step 9 — channel registry created");

  // Step 10: Create trigger engine
  const triggers = new TriggerEngine();
  state.triggers = triggers;
  log.info("Kernel boot: step 10 — trigger engine created");

  // Step 10.5: Create connector manager (lazy init — connectors load on first use)
  const connectors = new ConnectorManager();
  state.connectors = connectors;

  // Wire connector manager into trigger engine and agent connector tool
  triggers.setConnectorManager(connectors);
  const { setConnectorManager: setToolConnectorManager } = await import("./agent/tools/connector.js");
  setToolConnectorManager(connectors);

  // Wire channel registry into trigger engine for notifications.
  // Admin targets come from Telegram admin IDs (primary notification channel).
  const notifyTargets: Array<{ channel: string; chatId: string }> = [];
  if (config.channels.telegram.token && config.channels.telegram.adminIds.length > 0) {
    for (const id of config.channels.telegram.adminIds) {
      notifyTargets.push({ channel: "telegram", chatId: id });
    }
  }
  triggers.setChannelRegistry(channels, notifyTargets);

  // Wire system prompt so agent actions have full Jeriko command knowledge
  if (systemPrompt) {
    triggers.setSystemPrompt(systemPrompt);
  }

  log.info("Kernel boot: step 10.5 — connector manager + channel notifications wired to trigger engine");

  // Step 11: Load plugins
  const plugins = new PluginLoader();
  await plugins.loadAll();
  state.plugins = plugins;
  log.info("Kernel boot: step 11 — plugins loaded");

  // Step 12: Start trigger engine
  await triggers.start();
  log.info("Kernel boot: step 12 — trigger engine started");

  // Step 13: Connect channels
  await channels.connectAll();
  log.info("Kernel boot: step 13 — channels connected");

  // Step 14: Start socket IPC server
  startSocketServer();

  registerStreamMethod("ask", async (params, emit) => {
    const { runAgent } = await import("./agent/agent.js");
    const { createSession, getSession } = await import("./agent/session/session.js");
    const { addMessage, addPart, getMessages } = await import("./agent/session/message.js");
    const { kvGet, kvSet } = await import("./storage/kv.js");

    const message = params.message as string;
    if (!message) throw new Error("message is required");

    // Parse "provider:model" syntax (e.g. "openrouter:deepseek")
    const rawModel = (params.model as string) || state.config!.agent.model;
    const { parseModelSpec } = await import("./agent/drivers/models.js");
    const { backend: modelBackend, model: modelId } = parseModelSpec(rawModel);
    const model = modelId;

    // Reuse existing session or create a new one.
    // The CLI can pass session_id explicitly, otherwise we resume the last
    // active session (same logic the in-process REPL and HTTP routes use).
    let sessionId = params.session_id as string | undefined;
    if (!sessionId) {
      const lastId = kvGet<string>("state:last_session_id");
      const existing = lastId ? getSession(lastId) : null;
      if (existing && existing.archived_at === null) {
        sessionId = existing.id;
      } else {
        const sess = createSession({ model, title: message.slice(0, 80) });
        sessionId = sess.id;
      }
      kvSet("state:last_session_id", sessionId);
    }

    // Persist user message to DB
    const userMsg = addMessage(sessionId, "user", message);
    addPart(userMsg.id, "text", message);

    // Build conversation history from DB (includes all prior messages)
    const dbMessages = getMessages(sessionId);
    const history = dbMessages.map((m: { role: string; content: string }) => ({
      role: m.role as "user" | "assistant" | "system" | "tool",
      content: m.content,
    }));

    const agentConfig = {
      sessionId,
      backend: modelBackend,
      model,
      systemPrompt: (params.system as string) || systemPrompt || undefined,
      maxTokens: (params.max_tokens as number) || state.config!.agent.maxTokens,
      temperature: state.config!.agent.temperature,
      extendedThinking: state.config!.agent.extendedThinking,
      toolIds: params.tools === false ? [] : null,
    };

    let response = "";
    let lastError = "";
    let tokensIn = 0;
    let tokensOut = 0;

    // Subscribe to orchestratorBus for live sub-agent events
    const { orchestratorBus } = await import("./agent/orchestrator.js");
    const unsubs: Array<() => void> = [];
    unsubs.push(orchestratorBus.on("sub:started", (d) => emit({ type: "sub:started", ...d })));
    unsubs.push(orchestratorBus.on("sub:text_delta", (d) => emit({ type: "sub:text_delta", ...d })));
    unsubs.push(orchestratorBus.on("sub:tool_call", (d) => emit({ type: "sub:tool_call", ...d })));
    unsubs.push(orchestratorBus.on("sub:tool_result", (d) => emit({ type: "sub:tool_result", ...d })));
    unsubs.push(orchestratorBus.on("sub:complete", (d) => emit({ type: "sub:complete", ...d })));

    try {
    for await (const event of runAgent(agentConfig, history)) {
      // Stream each event to the CLI in real-time
      emit(event as unknown as Record<string, unknown>);

      // Also collect for the final summary response
      if (event.type === "text_delta") response += event.content;
      if (event.type === "error") lastError = event.message;
      if (event.type === "turn_complete") {
        tokensIn = event.tokensIn;
        tokensOut = event.tokensOut;
      }
    }

    } finally {
      // Unsubscribe from orchestratorBus events
      unsubs.forEach(u => u());
    }

    if (!response && lastError) {
      throw new Error(lastError);
    }

    return { response, tokensIn, tokensOut, sessionId };
  });

  registerMethod("status", async () => ({
    phase: state.phase,
    uptime: state.startedAt ? Date.now() - state.startedAt : 0,
    workers: state.workers?.status() ?? null,
  }));

  registerMethod("sessions", async (params) => {
    const { listSessions } = await import("./agent/session/session.js");
    const limit = (params.limit as number) || 20;
    const sessions = listSessions(limit);
    return sessions.map((s) => ({
      id: s.id,
      slug: s.slug,
      title: s.title,
      model: s.model,
      token_count: s.token_count,
      updated_at: s.updated_at,
    }));
  });

  registerMethod("new_session", async (params) => {
    const { createSession } = await import("./agent/session/session.js");
    const { kvSet } = await import("./storage/kv.js");
    const model = (params.model as string) || state.config!.agent.model;
    const session = createSession({ model });
    kvSet("state:last_session_id", session.id);
    return {
      id: session.id,
      slug: session.slug,
      title: session.title,
      model: session.model,
      token_count: session.token_count,
      updated_at: session.updated_at,
    };
  });

  registerMethod("resume_session", async (params) => {
    const { getSession, getSessionBySlug } = await import("./agent/session/session.js");
    const { kvSet } = await import("./storage/kv.js");
    const slugOrId = params.slug_or_id as string;
    if (!slugOrId) throw new Error("slug_or_id is required");
    const session = getSessionBySlug(slugOrId) ?? getSession(slugOrId);
    if (!session) throw new Error(`Session "${slugOrId}" not found`);
    kvSet("state:last_session_id", session.id);
    return {
      id: session.id,
      slug: session.slug,
      title: session.title,
      model: session.model,
      token_count: session.token_count,
      updated_at: session.updated_at,
    };
  });

  registerMethod("stop", async () => {
    // Initiate shutdown in background
    setTimeout(() => shutdown(), 100);
    return { message: "Shutdown initiated" };
  });

  // ── Channel management IPC methods ─────────────────────────────────
  registerMethod("channels", async () => {
    return channels.status();
  });

  registerMethod("channel_connect", async (params) => {
    const name = params.name as string;
    if (!name) throw new Error("name is required");

    const adapter = channels.get(name);
    if (!adapter) throw new Error(`Channel "${name}" is not registered`);

    await channels.connect(name);
    return channels.statusOf(name);
  });

  registerMethod("channel_disconnect", async (params) => {
    const name = params.name as string;
    if (!name) throw new Error("name is required");

    const adapter = channels.get(name);
    if (!adapter) throw new Error(`Channel "${name}" is not registered`);

    await channels.disconnect(name);
    return channels.statusOf(name);
  });

  // ── History / compact IPC methods ──────────────────────────────
  registerMethod("history", async (params) => {
    const { getMessages } = await import("./agent/session/message.js");
    const sessionId = params.session_id as string | undefined;
    const limit = (params.limit as number) || 50;
    if (!sessionId) return [];
    const rows = getMessages(sessionId);
    return rows.slice(-limit).map((m: { role: string; content: string; created_at: number }) => ({
      role: m.role,
      content: m.content,
      timestamp: m.created_at,
    }));
  });

  registerMethod("clear_history", async (params) => {
    const { createSession } = await import("./agent/session/session.js");
    const { kvSet } = await import("./storage/kv.js");
    const sess = createSession({ model: state.config!.agent.model });
    kvSet("state:last_session_id", sess.id);
    return { sessionId: sess.id };
  });

  registerMethod("compact", async (params) => {
    // Return approximate token counts for the session
    const { getMessages } = await import("./agent/session/message.js");
    const sessionId = params.session_id as string | undefined;
    if (!sessionId) return { before: 0, after: 0 };
    const rows = getMessages(sessionId);
    const totalChars = rows.reduce((sum: number, m: { content: string }) => sum + m.content.length, 0);
    const before = Math.round(totalChars / 4);
    const after = Math.round(before * 0.6);
    return { before, after };
  });

  // ── Model listing IPC method ──────────────────────────────────
  registerMethod("models", async () => {
    const { getModelRegistry } = await import("./agent/drivers/models.js");
    try {
      const registry = getModelRegistry();
      const models = Object.entries(registry).map(([id, info]: [string, any]) => ({
        id,
        name: info.name ?? id,
        provider: info.provider ?? "unknown",
        contextWindow: info.contextWindow,
        supportsTools: info.supportsTools ?? false,
        supportsVision: info.supportsVision ?? false,
      }));
      return models;
    } catch {
      return [
        { id: "claude", name: "Claude Sonnet", provider: "anthropic", contextWindow: 200000, supportsTools: true, supportsVision: true },
        { id: "gpt4", name: "GPT-4o", provider: "openai", contextWindow: 128000, supportsTools: true, supportsVision: true },
        { id: "local", name: "Local (Ollama)", provider: "ollama", supportsTools: false, supportsVision: false },
      ];
    }
  });

  // ── Connector IPC methods ─────────────────────────────────────
  registerMethod("connectors", async () => {
    if (!connectors) return [];
    return connectors.healthAll();
  });

  registerMethod("connector_connect", async (params) => {
    if (!connectors) throw new Error("Connector manager not available");
    const name = params.name as string;
    if (!name) throw new Error("name is required");
    // ConnectorManager.get() handles lazy initialization
    const instance = await connectors.get(name);
    if (!instance) throw new Error(`Connector "${name}" is not available — check configuration`);
    return { ok: true, name };
  });

  registerMethod("connector_disconnect", async (params) => {
    if (!connectors) throw new Error("Connector manager not available");
    const name = params.name as string;
    if (!name) throw new Error("name is required");
    // No disconnect method on ConnectorManager — shutdown the specific connector
    // The manager doesn't support individual disconnect; this is a no-op
    return { ok: true, name };
  });

  registerMethod("connector_health", async (params) => {
    if (!connectors) return [];
    const name = params.name as string | undefined;
    if (name) {
      return await connectors.health(name);
    }
    return await connectors.healthAll();
  });

  // ── Trigger IPC methods ───────────────────────────────────────
  registerMethod("triggers", async () => {
    if (!triggers) return [];
    return triggers.listAll();
  });

  registerMethod("trigger_enable", async (params) => {
    if (!triggers) throw new Error("Trigger engine not available");
    const id = params.id as string;
    if (!id) throw new Error("id is required");
    triggers.enable(id);
    return { ok: true };
  });

  registerMethod("trigger_disable", async (params) => {
    if (!triggers) throw new Error("Trigger engine not available");
    const id = params.id as string;
    if (!id) throw new Error("id is required");
    triggers.disable(id);
    return { ok: true };
  });

  // ── Skill IPC methods ─────────────────────────────────────────
  registerMethod("skills", async () => {
    const { listSkills } = await import("../shared/skill-loader.js");
    const skills = await listSkills();
    return skills.map((s) => ({
      name: s.name,
      description: s.description,
      userInvocable: s.userInvocable ?? false,
    }));
  });

  registerMethod("skill_detail", async (params) => {
    const name = params.name as string;
    if (!name) throw new Error("name is required");
    const { loadSkill } = await import("../shared/skill-loader.js");
    const skill = await loadSkill(name);
    if (!skill) throw new Error(`Skill "${name}" not found`);
    return {
      name: skill.meta.name,
      description: skill.meta.description,
      body: skill.body,
    };
  });

  // ── Task IPC methods ─────────────────────────────────────────
  registerMethod("tasks", async () => {
    const { existsSync, readdirSync, readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { homedir } = await import("node:os");
    const tasksDir = join(homedir(), ".jeriko", "data", "tasks");
    if (!existsSync(tasksDir)) return [];
    const files = readdirSync(tasksDir).filter((f: string) => f.endsWith(".json"));
    return files.map((f: string) => JSON.parse(readFileSync(join(tasksDir, f), "utf-8")));
  });

  // ── Notifications IPC method ────────────────────────────────
  registerMethod("notifications", async (params) => {
    const { kvGet, kvSet, kvList } = await import("./storage/kv.js");
    const channel = params.channel as string | undefined;
    const chatId = params.chat_id as string | undefined;

    // Get or set notification preference
    if (channel && chatId) {
      const key = `notify:${channel}:${chatId}`;
      if (params.enabled !== undefined) {
        kvSet(key, !!params.enabled);
        return { channel, chatId, enabled: !!params.enabled };
      }
      const enabled = kvGet<boolean>(key) ?? true;
      return { channel, chatId, enabled };
    }

    // List all notification preferences
    const entries = kvList("notify:");
    return entries.map((e) => {
      const parts = e.key.split(":");
      return { channel: parts[1], chatId: parts[2], enabled: e.value };
    });
  });

  // ── Config IPC method ─────────────────────────────────────────
  registerMethod("config", async () => {
    return state.config ?? {};
  });

  // ── Share IPC methods ───────────────────────────────────────
  registerMethod("share", async (params) => {
    const { createShare } = await import("./storage/share.js");
    const { getSession } = await import("./agent/session/session.js");
    const { getMessages } = await import("./agent/session/message.js");
    const { kvGet } = await import("./storage/kv.js");
    const { buildShareLink } = await import("../shared/urls.js");

    // Resolve session: explicit ID, explicit slug, or current active session
    let sessionId = params.session_id as string | undefined;
    if (!sessionId) {
      sessionId = kvGet<string>("state:last_session_id") ?? undefined;
    }
    if (!sessionId) throw new Error("No active session to share");

    const session = getSession(sessionId);
    if (!session) throw new Error("Session not found");

    const messages = getMessages(sessionId);
    if (messages.length === 0) throw new Error("Session has no messages to share");

    const snapshot = messages.map((m) => ({
      role: m.role,
      content: m.content,
      created_at: m.created_at,
    }));

    const expiresInMs = params.expires_in_ms as number | null | undefined;

    const share = createShare({
      sessionId,
      title: session.title,
      model: session.model,
      messages: JSON.stringify(snapshot),
      expiresInMs: expiresInMs ?? undefined,
    });

    return {
      share_id: share.share_id,
      url: buildShareLink(share.share_id),
      title: share.title,
      model: share.model,
      message_count: snapshot.length,
      created_at: share.created_at,
      expires_at: share.expires_at,
    };
  });

  registerMethod("share_revoke", async (params) => {
    const { revokeShare } = await import("./storage/share.js");
    const shareId = params.share_id as string;
    if (!shareId) throw new Error("share_id is required");
    const revoked = revokeShare(shareId);
    if (!revoked) throw new Error("Share not found or already revoked");
    return { share_id: shareId, status: "revoked" };
  });

  registerMethod("shares", async (params) => {
    const { listShares, listSharesBySession } = await import("./storage/share.js");
    const { buildShareLink } = await import("../shared/urls.js");
    const sessionId = params.session_id as string | undefined;
    const limit = (params.limit as number) || 50;

    const shares = sessionId ? listSharesBySession(sessionId) : listShares(limit);
    return shares.map((s) => ({
      share_id: s.share_id,
      url: buildShareLink(s.share_id),
      session_id: s.session_id,
      title: s.title,
      model: s.model,
      message_count: JSON.parse(s.messages).length,
      created_at: s.created_at,
      expires_at: s.expires_at,
      revoked_at: s.revoked_at,
    }));
  });

  // ── Billing IPC methods ──────────────────────────────────────
  registerMethod("billing.plan", async () => {
    const { getLicenseState } = await import("./billing/license.js");
    const state = getLicenseState();

    // Get active connector/trigger counts
    const connectorCount = connectors ? connectors.names.filter((n) => connectors!.has(n)).length : 0;
    const triggerCount = triggers ? triggers.listActive().length : 0;

    return {
      tier: state.tier,
      label: state.label,
      status: state.status,
      email: state.email,
      connectors: {
        used: connectorCount,
        limit: state.connectorLimit,
      },
      triggers: {
        used: triggerCount,
        limit: state.triggerLimit === Infinity ? "unlimited" : state.triggerLimit,
      },
      pastDue: state.pastDue,
      gracePeriod: state.gracePeriod,
      validUntil: state.validUntil,
    };
  });

  registerMethod("billing.checkout", async (params) => {
    const email = params.email as string;
    if (!email) throw new Error("email is required");
    const termsAccepted = (params.terms_accepted as boolean) ?? false;

    const { createCheckoutSession } = await import("./billing/stripe.js");
    const result = await createCheckoutSession(email, termsAccepted);
    return { url: result.url, session_id: result.sessionId };
  });

  registerMethod("billing.portal", async (params) => {
    let customerId = params.customer_id as string | undefined;

    if (!customerId) {
      const { getSubscription } = await import("./billing/store.js");
      const sub = getSubscription();
      customerId = sub?.customer_id;
    }

    if (!customerId) {
      throw new Error("No active subscription found. Use `jeriko upgrade` to subscribe first.");
    }

    const { createPortalSession } = await import("./billing/stripe.js");
    const result = await createPortalSession(customerId);
    return { url: result.url };
  });

  registerMethod("billing.events", async (params) => {
    const { getRecentEvents, getEventsByType } = await import("./billing/store.js");
    const limit = (params.limit as number) || 50;
    const type = params.type as string | undefined;

    const events = type ? getEventsByType(type, limit) : getRecentEvents(limit);
    return events.map((e) => ({
      id: e.id,
      type: e.type,
      subscription_id: e.subscription_id,
      processed_at: e.processed_at,
    }));
  });

  // ── Forward orchestratorBus events through IPC stream ─────────
  // This is wired into the "ask" stream handler above. The orchestratorBus
  // subscriptions are managed per-request inside the ask handler's stream
  // lifecycle. See Phase 3 for the full wiring.

  log.info("Kernel boot: step 14 — socket IPC server started");

  // Step 15: Start HTTP server
  const appCtx: AppContext = { channels, triggers, connectors };
  const app = createApp(appCtx);
  const server = startServer(app, { port: opts?.port });
  state.server = server;

  state.phase = "running";
  state.startedAt = Date.now();
  log.info("Kernel boot: step 15 — HTTP server started. Daemon is RUNNING.");

  // Install signal handlers for graceful shutdown
  installSignalHandlers();

  return state;
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

/**
 * Gracefully shut down the daemon. Reverses the boot sequence.
 *
 * Order:
 *  1. Stop accepting new HTTP connections
 *  1.5. Stop socket IPC server
 *  2. Disconnect all channels
 *  3. Stop trigger engine
 *  4. Unload plugins
 *  5. Drain and stop worker pool
 *  6. Close database
 *  7. Close logger
 */
export async function shutdown(): Promise<void> {
  if (state.phase !== "running" && state.phase !== "booting") {
    return;
  }

  state.phase = "shutting_down";
  log.info("Kernel shutdown initiated");

  // 1. Stop HTTP server
  stopServer();
  state.server = null;
  log.info("Shutdown: HTTP server stopped");

  // 1.5. Stop socket IPC server
  stopSocketServer();
  log.info("Shutdown: socket IPC server stopped");

  // 2. Disconnect channels
  if (state.channels) {
    await state.channels.disconnectAll();
    state.channels = null;
    log.info("Shutdown: channels disconnected");
  }

  // 2.5. Shut down connectors
  if (state.connectors) {
    await state.connectors.shutdownAll();
    state.connectors = null;
    log.info("Shutdown: connectors shut down");
  }

  // 3. Stop trigger engine
  if (state.triggers) {
    await state.triggers.stop();
    state.triggers = null;
    log.info("Shutdown: trigger engine stopped");
  }

  // 4. Unload plugins
  if (state.plugins) {
    await state.plugins.unloadAll();
    state.plugins = null;
    log.info("Shutdown: plugins unloaded");
  }

  // 5. Drain worker pool
  if (state.workers) {
    await state.workers.drain();
    state.workers = null;
    log.info("Shutdown: worker pool drained");
  }

  // 6. Close database
  closeDatabase();
  state.db = null;
  log.info("Shutdown: database closed");

  // 7. Close logger
  log.info("Shutdown: complete");
  log.close();

  state.phase = "stopped";
  state.startedAt = null;
}

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

/** Get the current kernel state (read-only snapshot). */
export function getState(): Readonly<KernelState> {
  return state;
}

/** Check if the daemon is running. */
export function isRunning(): boolean {
  return state.phase === "running";
}

// ---------------------------------------------------------------------------
// Signal handlers
// ---------------------------------------------------------------------------

let signalsInstalled = false;
const shutdownHooks: Array<() => void | Promise<void>> = [];

/**
 * Register a function that runs during graceful shutdown, before the process exits.
 * Used by server.ts to clean up PID files without signal handler race conditions.
 */
export function onShutdown(fn: () => void | Promise<void>): void {
  shutdownHooks.push(fn);
}

function installSignalHandlers(): void {
  if (signalsInstalled) return;
  signalsInstalled = true;

  const handler = async (signal: string) => {
    log.info(`Received ${signal}, initiating graceful shutdown`);
    await shutdown();
    // Run registered shutdown hooks (PID cleanup, etc.)
    for (const hook of shutdownHooks) {
      try { await hook(); } catch { /* best-effort */ }
    }
    process.exit(0);
  };

  process.on("SIGINT", () => handler("SIGINT"));
  process.on("SIGTERM", () => handler("SIGTERM"));
}
