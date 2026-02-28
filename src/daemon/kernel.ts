// Daemon kernel — 15-step boot sequence and graceful shutdown.
// This is the entry point for `jeriko serve`.

import { getLogger, Logger } from "../shared/logger.js";
import { loadConfig, type JerikoConfig } from "../shared/config.js";
import { initDatabase, closeDatabase } from "./storage/db.js";
import { ChannelRegistry } from "./services/channels/index.js";
import { startChannelRouter } from "./services/channels/router.js";
import { TriggerEngine } from "./services/triggers/engine.js";
import { createApp, startServer, stopServer, type AppContext } from "./api/app.js";
import { startSocketServer, stopSocketServer, registerMethod } from "./api/socket.js";
import { WorkerPool } from "./workers/pool.js";
import { PluginLoader } from "./plugin/loader.js";
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
    import("./agent/tools/parallel.js"),
    import("./agent/tools/browse.js"),
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

  // Bind channel message bus to the agent loop + slash-command controls.
  startChannelRouter({
    channels,
    defaultModel: config.agent.model,
    maxTokens: config.agent.maxTokens,
    temperature: config.agent.temperature,
    extendedThinking: config.agent.extendedThinking,
    systemPrompt,
  });
  log.info("Kernel boot: step 9 — channel registry created");

  // Step 10: Create trigger engine
  const triggers = new TriggerEngine();
  state.triggers = triggers;
  log.info("Kernel boot: step 10 — trigger engine created");

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

  registerMethod("ask", async (params) => {
    const { runAgent } = await import("./agent/agent.js");
    const { createSession, getSession } = await import("./agent/session/session.js");
    const { addMessage, addPart, getMessages } = await import("./agent/session/message.js");
    const { kvGet, kvSet } = await import("./storage/kv.js");

    const message = params.message as string;
    if (!message) throw new Error("message is required");

    const model = (params.model as string) || state.config!.agent.model;

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
      backend: model,
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

    for await (const event of runAgent(agentConfig, history)) {
      if (event.type === "text_delta") response += event.content;
      if (event.type === "error") lastError = event.message;
      if (event.type === "turn_complete") {
        tokensIn = event.tokensIn;
        tokensOut = event.tokensOut;
      }
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

  registerMethod("stop", async () => {
    // Initiate shutdown in background
    setTimeout(() => shutdown(), 100);
    return { message: "Shutdown initiated" };
  });

  log.info("Kernel boot: step 14 — socket IPC server started");

  // Step 15: Start HTTP server
  const appCtx: AppContext = { channels, triggers };
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
