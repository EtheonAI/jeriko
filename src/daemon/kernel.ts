// Daemon kernel — 15-step boot sequence and graceful shutdown.
// This is the entry point for `jeriko serve`.

import { getLogger, Logger } from "../shared/logger.js";
import { loadConfig, type JerikoConfig, type ProviderConfig } from "../shared/config.js";
import { initDatabase, closeDatabase } from "./storage/db.js";
import { ChannelRegistry } from "./services/channels/index.js";
import { startChannelRouter } from "./services/channels/router.js";
import { TriggerEngine } from "./services/triggers/engine.js";
import type { TriggerConfig } from "./services/triggers/engine.js";

/** Present a TriggerConfig as a user-facing task view. */
function taskView(t: TriggerConfig) {
  // Map internal trigger types to user-facing task types
  let taskType: "trigger" | "schedule" | "once";
  if (t.type === "cron") taskType = "schedule";
  else if (t.type === "once") taskType = "once";
  else taskType = "trigger";

  return {
    id: t.id,
    name: t.label ?? t.id,
    type: taskType,
    internal_type: t.type,
    enabled: t.enabled,
    config: t.config,
    action: t.action,
    run_count: t.run_count ?? 0,
    error_count: t.error_count ?? 0,
    max_runs: t.max_runs ?? 0,
    last_fired: t.last_fired,
    created_at: t.created_at,
  };
}
import { createApp, startServer, stopServer, type AppContext } from "./api/app.js";
import { startSocketServer, stopSocketServer, registerMethod, registerStreamMethod } from "./api/socket.js";
import { WorkerPool } from "./workers/pool.js";
import { PluginLoader } from "./plugin/loader.js";
import { ConnectorManager } from "./services/connectors/manager.js";
import { pruneExpiredShares } from "./storage/share.js";
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
  relay: import("./services/relay/client.js").RelayClient | null;
  server: ReturnType<typeof Bun.serve> | null;
  startedAt: number | null;
  /** Pending provider auth codes received from relay (keyed by provider name). */
  pendingProviderAuth: Map<string, { code: string; receivedAt: number }>;
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
  relay: null,
  server: null,
  startedAt: null,
  pendingProviderAuth: new Map(),
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
  try {
    const { loadSecrets } = await import("../shared/secrets.js");
    loadSecrets();
  } catch (err) {
    console.error(`Failed to load secrets: ${err}`);
    // Continue — secrets may not exist yet (first boot before init)
  }

  // Step 1: Load configuration (loadConfig always returns valid defaults even if files are missing)
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
    import("./agent/tools/memory-tool.js"),
    import("./agent/tools/generate-image.js"),
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
  const { registerCustomProviders } = await import("./agent/drivers/providers.js");
  if (config.providers?.length) {
    registerCustomProviders(config.providers);
  }

  // Auto-discover providers from environment variables (preset registry).
  // Presets only activate when the env var is set AND no explicit config exists.
  const { discoverProviderPresets } = await import("./agent/drivers/presets.js");
  const explicitIds = new Set((config.providers ?? []).map((p) => p.id));
  const discovered = discoverProviderPresets(explicitIds);
  if (discovered.length > 0) {
    registerCustomProviders(discovered);
    log.info(`Auto-discovered ${discovered.length} provider(s): ${discovered.map((p) => p.id).join(", ")}`);
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
  // Load system prompt from ~/.config/jeriko/agent.md (copied from AGENT.md at install).
  // Falls back to AGENT.md in the repo root for dev mode.
  let systemPrompt = "";
  try {
    const { readFileSync, existsSync } = await import("node:fs");
    const { join, dirname } = await import("node:path");
    const { getConfigDir } = await import("../shared/config.js");
    const promptPath = join(getConfigDir(), "agent.md");
    if (existsSync(promptPath)) {
      systemPrompt = readFileSync(promptPath, "utf-8");
      log.info(`Kernel boot: loaded system prompt from ${promptPath} (${systemPrompt.length} chars)`);
    } else {
      // Dev fallback: walk up from cwd looking for AGENT.md in the repo root
      let dir = process.cwd();
      for (let i = 0; i < 5; i++) {
        const candidate = join(dir, "AGENT.md");
        if (existsSync(candidate)) {
          systemPrompt = readFileSync(candidate, "utf-8");
          log.info(`Kernel boot: loaded system prompt from ${candidate} (dev fallback, ${systemPrompt.length} chars)`);
          break;
        }
        const parent = dirname(dir);
        if (parent === dir) break;
        dir = parent;
      }
      if (!systemPrompt) {
        log.warn(`Kernel boot: no agent.md found at ${promptPath} — agent will have no system prompt`);
      }
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

  // Inject persistent memory into system prompt.
  // The agent reads this at session start to recall user preferences,
  // project conventions, and learned patterns from prior sessions.
  try {
    const { readFileSync: readFs, existsSync: existsFs } = await import("node:fs");
    const { join: joinPath } = await import("node:path");
    const { homedir: getHome } = await import("node:os");
    const memoryPath = joinPath(process.env.HOME || getHome(), ".jeriko", "memory", "MEMORY.md");
    if (existsFs(memoryPath)) {
      const memory = readFs(memoryPath, "utf-8").trim();
      if (memory) {
        systemPrompt = systemPrompt + "\n\n## Persistent Memory\n" +
          "The following is your persistent memory from prior sessions. " +
          "Use the `memory` tool to update it when you learn stable user preferences.\n\n" +
          memory;
        log.info(`Kernel boot: injected persistent memory (${memory.length} chars)`);
      }
    }
  } catch (err) {
    log.warn(`Kernel boot: failed to load persistent memory: ${err}`);
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
    getConnectors: () => connectors,
    sttConfig: config.media?.stt,
    ttsConfig: config.media?.tts,
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

  // Step 10.6: Connect to jeriko.ai relay (non-fatal — works offline too)
  //
  // The relay client allows external services to reach this daemon when it
  // runs behind NAT/firewall. Only needed for webhook triggers and OAuth
  // callbacks. All local triggers (cron, file, HTTP poll) work without relay.
  //
  // Skipped when: no user ID, no auth secret, or JERIKO_PUBLIC_URL is set
  // (self-hosted tunnel — webhooks go directly to daemon).
  try {
    const { getUserId } = await import("../shared/config.js");
    const userId = getUserId();
    // Auth token resolution: env override → baked-in binary secret → unavailable.
    // The baked secret is compiled into the binary for distributed users (like Firebase API keys).
    let relayToken = process.env.RELAY_AUTH_SECRET;
    if (!relayToken) {
      const { BAKED_RELAY_AUTH_SECRET } = await import("../shared/baked-oauth-ids.js");
      relayToken = BAKED_RELAY_AUTH_SECRET;
    }
    const selfHosted = !!process.env.JERIKO_PUBLIC_URL;

    if (userId && relayToken && !selfHosted) {
      const { RelayClient } = await import("./services/relay/client.js");
      const relay = new RelayClient({
        userId,
        token: relayToken,
        version: process.env.JERIKO_VERSION ?? "dev",
      });
      state.relay = relay;

      // Wire webhook forwarding: relay → billing processor or TriggerEngine
      relay.onWebhook(async (triggerId, headers, body, _requestId) => {
        // Billing webhooks use a reserved trigger ID — route directly to
        // the billing webhook processor instead of the trigger engine.
        // The relay already verified the Stripe signature; the daemon
        // re-verifies independently (defense-in-depth).
        if (triggerId === "__billing__") {
          const signatureHeader = headers["stripe-signature"];
          if (!signatureHeader) {
            log.warn("Relay billing webhook: missing stripe-signature header");
            return;
          }
          try {
            const { processWebhookEvent } = await import("./billing/webhook.js");
            const result = processWebhookEvent(body, signatureHeader, { trusted: true });
            if (!result.handled) {
              log.warn(`Relay billing webhook rejected: ${result.error}`);
            }
          } catch (err) {
            log.error(`Relay billing webhook processing failed: ${err}`);
          }
          return;
        }

        // Connector-level webhooks: "connector:<name>" — route to ConnectorManager.
        // These come from app-level webhook URLs (e.g. PayPal, Stripe Connect)
        // that the relay broadcasts to all connected daemons.
        if (triggerId.startsWith("connector:") && state.connectors) {
          const connectorName = triggerId.slice("connector:".length);
          try {
            const event = await state.connectors.dispatchWebhook(connectorName, headers, body);
            if (event) {
              log.info(`Connector webhook processed: ${connectorName} → ${event.type}`);
            }
          } catch (err) {
            log.error(`Connector webhook failed (${connectorName}): ${err}`);
          }
          return;
        }

        if (!state.triggers) return;

        let payload: unknown;
        try {
          payload = JSON.parse(body);
        } catch {
          payload = body;
        }

        await state.triggers.handleWebhook(triggerId, payload, headers, body);
      });

      // Wire trigger registration: TriggerEngine → relay
      triggers.bus.on("trigger:added", (trigger) => {
        if (trigger.type === "webhook") {
          relay.registerTrigger(trigger.id);
        }
      });
      triggers.bus.on("trigger:removed", ({ id }) => {
        relay.unregisterTrigger(id);
      });

      // Wire OAuth callback forwarding: relay → daemon token exchange
      relay.onOAuthCallback(async (provider, params, _requestId) => {
        try {
          const { handleOAuthCallback } = await import("./api/routes/oauth.js");
          return handleOAuthCallback(provider, params, state.channels);
        } catch (err) {
          log.error(`Relay OAuth callback error: ${err}`);
          return { statusCode: 500, html: "Internal error processing OAuth callback" };
        }
      });

      // Wire OAuth start forwarding: relay → daemon authorization URL builder
      // Returns redirectUrl + codeVerifier (for PKCE relay-side exchange)
      relay.onOAuthStart(async (provider, params, _requestId) => {
        try {
          const { handleOAuthStart } = await import("./api/routes/oauth.js");
          const result = handleOAuthStart(provider, params);
          return {
            statusCode: result.statusCode,
            html: result.html,
            redirectUrl: result.redirectUrl,
            codeVerifier: result.codeVerifier,
          };
        } catch (err) {
          log.error(`Relay OAuth start error: ${err}`);
          return { statusCode: 500, html: "Internal error processing OAuth start" };
        }
      });

      // Wire relay-exchanged OAuth tokens: relay → daemon token storage
      // When the relay exchanges the code for tokens (user has no local secret),
      // it sends the tokens here for the daemon to save to ~/.config/jeriko/.env.
      relay.onOAuthTokens(async (provider, tokens, _requestId) => {
        try {
          const { getOAuthProvider } = await import("./services/oauth/providers.js");
          const { saveSecret } = await import("../shared/secrets.js");

          const providerDef = getOAuthProvider(provider);
          if (!providerDef) {
            log.warn(`Relay OAuth tokens: unknown provider "${provider}"`);
            return;
          }

          // Save access token
          saveSecret(providerDef.tokenEnvVar, tokens.accessToken);
          log.info(`Relay OAuth tokens: saved ${providerDef.tokenEnvVar} for ${providerDef.label}`);

          // Save refresh token if provided
          if (tokens.refreshToken && providerDef.refreshTokenEnvVar) {
            saveSecret(providerDef.refreshTokenEnvVar, tokens.refreshToken);
            log.info(`Relay OAuth tokens: saved ${providerDef.refreshTokenEnvVar} for ${providerDef.label}`);
          }
        } catch (err) {
          log.error(`Relay OAuth tokens error: ${err}`);
        }
      });

      // Wire provider auth callback: relay → daemon pending auth store.
      // The CLI polls for the auth code via IPC after opening the browser.
      relay.onProviderAuthCallback((provider, params) => {
        const code = params.code;
        if (!code) {
          log.warn(`Provider auth callback: missing code (provider: ${provider})`);
          return;
        }
        state.pendingProviderAuth.set(provider, { code, receivedAt: Date.now() });
        log.info(`Provider auth callback: received code for ${provider}`);
      });

      // Wire share page forwarding: relay → daemon share renderer
      relay.onShareRequest(async (shareId, _requestId) => {
        try {
          const { renderShareById } = await import("./api/routes/share.js");
          return renderShareById(shareId);
        } catch (err) {
          log.error(`Relay share request error: ${err}`);
          return { statusCode: 500, html: "Internal error rendering share page" };
        }
      });

      // Connect (non-blocking, reconnects automatically)
      relay.connect();

      // NOTE: Existing webhook triggers are registered with the relay AFTER
      // step 12 (triggers.start()), which loads persisted triggers from SQLite.
      // At this point the trigger engine's in-memory map is still empty.
      // See step 12 below for the registration loop.

      log.info("Kernel boot: step 10.6 — relay client connected");
    } else {
      if (selfHosted) {
        log.info("Kernel boot: step 10.6 — relay skipped (self-hosted: JERIKO_PUBLIC_URL set)");
      } else if (!userId) {
        log.info("Kernel boot: step 10.6 — relay skipped (no user ID — run `jeriko install`)");
      } else {
        log.info("Kernel boot: step 10.6 — relay skipped (no RELAY_AUTH_SECRET or NODE_AUTH_SECRET)");
      }
    }
  } catch (err) {
    log.warn(`Kernel boot: step 10.6 — relay client failed (non-fatal): ${err}`);
  }

  // Step 11: Load plugins (non-fatal — broken plugins shouldn't prevent boot)
  const plugins = new PluginLoader();
  try {
    await plugins.loadAll();
  } catch (err) {
    log.warn(`Kernel boot: step 11 — plugin loading failed (non-fatal): ${err}`);
  }
  state.plugins = plugins;
  log.info("Kernel boot: step 11 — plugins loaded");

  // Step 12: Start trigger engine (loads persisted triggers from SQLite)
  await triggers.start();

  // Register persisted webhook triggers with the relay.
  // Must happen AFTER start() — the in-memory trigger map is empty until
  // start() loads from SQLite. The bus events (trigger:added/removed) handle
  // triggers created after boot; this loop handles pre-existing ones.
  if (state.relay) {
    let registeredCount = 0;
    for (const t of triggers.listAll()) {
      if (t.type === "webhook" && t.enabled) {
        state.relay.registerTrigger(t.id);
        registeredCount++;
      }
    }
    if (registeredCount > 0) {
      log.info(`Kernel boot: step 12 — registered ${registeredCount} webhook trigger(s) with relay`);
    }
  }

  log.info("Kernel boot: step 12 — trigger engine started");

  // Step 12.5: Prune expired shares (housekeeping)
  try {
    const pruned = pruneExpiredShares();
    if (pruned > 0) log.info(`Pruned ${pruned} expired/revoked shares`);
  } catch (err) {
    log.warn(`Share pruning failed (non-fatal): ${err}`);
  }

  // Step 13: Connect channels (non-fatal — network issues shouldn't prevent boot)
  try {
    await channels.connectAll();
  } catch (err) {
    log.warn(`Kernel boot: step 13 — channel connection failed (non-fatal): ${err}`);
  }

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

    // IPC keepalive — prevents idle timeout when agent is blocked on long operations
    // (extended thinking, tool execution, sub-agent delegation). Resets the client's
    // idle timer so the connection stays alive during legitimate long-running work.
    const keepaliveTimer = setInterval(() => {
      emit({ type: "keepalive", ts: Date.now() });
    }, 30_000);

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
      // Unsubscribe from orchestratorBus events + stop keepalive
      unsubs.forEach(u => u());
      clearInterval(keepaliveTimer);
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

  registerMethod("update_session", async (params) => {
    const { getSession, updateSession } = await import("./agent/session/session.js");
    const sessionId = params.session_id as string;
    if (!sessionId) throw new Error("session_id is required");

    const session = getSession(sessionId);
    if (!session) throw new Error(`Session "${sessionId}" not found`);

    const updates: Record<string, unknown> = {};
    if (params.model !== undefined) updates.model = params.model;
    if (params.title !== undefined) updates.title = params.title;

    updateSession(sessionId, updates as { model?: string; title?: string });

    const updated = getSession(sessionId)!;
    return {
      id: updated.id,
      slug: updated.slug,
      title: updated.title,
      model: updated.model,
      token_count: updated.token_count,
      updated_at: updated.updated_at,
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

  registerStreamMethod("channel_connect", async (params, emit) => {
    const name = (params.name as string)?.toLowerCase();
    if (!name) throw new Error("name is required");

    const adapter = channels.get(name);
    if (adapter) {
      // Already registered — just reconnect
      await channels.connect(name);
      return channels.statusOf(name);
    }

    // Not registered — auto-add (create adapter, register, connect, persist config)
    const { addChannel } = await import("./services/channels/lifecycle.js");
    const onQR = (qr: string) => { emit({ type: "qr", qr }); };
    const channelConfig = params.config as Record<string, unknown> | undefined;
    return addChannel(channels, name, channelConfig, { onQR });
  });

  registerMethod("channel_disconnect", async (params) => {
    const name = params.name as string;
    if (!name) throw new Error("name is required");

    const adapter = channels.get(name);
    if (!adapter) throw new Error(`Channel "${name}" is not registered`);

    await channels.disconnect(name);
    return channels.statusOf(name);
  });

  registerStreamMethod("channel_add", async (params, emit) => {
    const name = (params.name as string)?.toLowerCase();
    if (!name) throw new Error("name is required");
    const channelConfig = params.config as Record<string, unknown> | undefined;
    const { addChannel } = await import("./services/channels/lifecycle.js");

    // Wire onQR callback to stream QR events to the CLI
    const onQR = (qr: string) => { emit({ type: "qr", qr }); };
    return addChannel(channels, name, channelConfig, { onQR });
  });

  registerMethod("channel_remove", async (params) => {
    const name = (params.name as string)?.toLowerCase();
    if (!name) throw new Error("name is required");
    const { removeChannel } = await import("./services/channels/lifecycle.js");
    return removeChannel(channels, name);
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
    const { listModels } = await import("./agent/drivers/models.js");
    const { listDrivers } = await import("./agent/drivers/index.js");

    // Get all models from the capability index (populated from models.dev)
    const allModels = listModels();

    // Filter to models from configured providers only.
    // Built-in providers require their API key to be set; custom providers
    // are always included (they're explicitly configured in config.json).
    const registeredDrivers = new Set(listDrivers());
    const providerIds = new Set(config.providers?.map((p) => p.id) ?? []);

    const builtInDriverProviders: Record<string, { provider: string; envKey?: string }> = {
      anthropic: { provider: "anthropic", envKey: "ANTHROPIC_API_KEY" },
      openai:    { provider: "openai",    envKey: "OPENAI_API_KEY" },
      local:     { provider: "local" }, // no key needed
    };

    const relevantProviders = new Set<string>();
    for (const driver of registeredDrivers) {
      const mapping = builtInDriverProviders[driver];
      if (mapping) {
        // Only include built-in provider if its API key is set (or no key needed)
        if (!mapping.envKey || process.env[mapping.envKey]) {
          relevantProviders.add(mapping.provider);
        }
      }
    }
    for (const id of providerIds) {
      relevantProviders.add(id);
    }

    // Collect models for relevant providers, deduplicated by id
    const seen = new Set<string>();
    const models: Array<{
      id: string;
      name: string;
      provider: string;
      contextWindow: number;
      maxOutput: number;
      supportsTools: boolean;
      supportsReasoning: boolean;
      costInput: number;
      costOutput: number;
    }> = [];

    for (const caps of allModels) {
      if (!relevantProviders.has(caps.provider)) continue;
      if (seen.has(`${caps.provider}:${caps.id}`)) continue;
      seen.add(`${caps.provider}:${caps.id}`);

      models.push({
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

    // Add custom provider models from config (may not be in models.dev)
    for (const provider of config.providers ?? []) {
      if (!seen.has(`${provider.id}:default`) && provider.defaultModel) {
        const { getCapabilities } = await import("./agent/drivers/models.js");
        const caps = getCapabilities(provider.id, provider.defaultModel);
        seen.add(`${provider.id}:${provider.defaultModel}`);
        models.push({
          id: provider.defaultModel,
          name: provider.name,
          provider: provider.id,
          contextWindow: caps.context,
          maxOutput: caps.maxOutput,
          supportsTools: caps.toolCall,
          supportsReasoning: caps.reasoning,
          costInput: caps.costInput,
          costOutput: caps.costOutput,
        });
      }

      // Add aliased models from provider config
      if (provider.models) {
        for (const [alias, modelId] of Object.entries(provider.models)) {
          const key = `${provider.id}:${modelId}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const { getCapabilities } = await import("./agent/drivers/models.js");
          const caps = getCapabilities(provider.id, modelId);
          models.push({
            id: modelId,
            name: alias,
            provider: provider.id,
            contextWindow: caps.context,
            maxOutput: caps.maxOutput,
            supportsTools: caps.toolCall,
            supportsReasoning: caps.reasoning,
            costInput: caps.costInput,
            costOutput: caps.costOutput,
          });
        }
      }
    }

    return models;
  });

  // ── Provider management IPC methods ──────────────────────────
  registerMethod("providers.list", async () => {
    const { listDrivers } = await import("./agent/drivers/index.js");
    const { listPresets } = await import("./agent/drivers/presets.js");
    const builtInDrivers = listDrivers();

    const providers: Array<{
      id: string;
      name: string;
      type: "built-in" | "custom" | "discovered" | "available";
      baseUrl?: string;
      defaultModel?: string;
      modelCount?: number;
      envKey?: string;
    }> = [];

    // Track all registered IDs to avoid duplication
    const registered = new Set<string>();

    // Built-in drivers (anthropic, openai, local)
    // Only mark as "built-in" if the provider's API key is actually set.
    // Without the key, the provider is "available" (user can add it via /model add).
    const builtInIds = new Set(["anthropic", "openai", "local", "claude-code"]);
    const builtInMeta: Record<string, { name: string; envKey?: string; defaultModel?: string }> = {
      anthropic: { name: "Anthropic", envKey: "ANTHROPIC_API_KEY", defaultModel: "claude" },
      openai:    { name: "OpenAI",    envKey: "OPENAI_API_KEY",    defaultModel: "gpt4" },
      local:     { name: "Local (Ollama)", defaultModel: "local" },
    };
    for (const driverName of builtInDrivers) {
      if (driverName === "claude-code") continue;
      if (!builtInIds.has(driverName)) continue;
      registered.add(driverName);
      const meta = builtInMeta[driverName];
      const isConfigured = !meta?.envKey || !!process.env[meta.envKey];
      providers.push({
        id: driverName,
        name: meta?.name ?? driverName.charAt(0).toUpperCase() + driverName.slice(1),
        type: isConfigured ? "built-in" : "available",
        envKey: meta?.envKey,
        defaultModel: meta?.defaultModel,
      });
    }

    // Custom providers from config
    for (const p of config.providers ?? []) {
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

    // Auto-discovered providers (env var set, not in config)
    for (const driverName of builtInDrivers) {
      if (registered.has(driverName)) continue;
      if (builtInIds.has(driverName)) continue;
      // This is a driver registered from presets or runtime
      const preset = listPresets().find((p) => p.id === driverName);
      registered.add(driverName);
      providers.push({
        id: driverName,
        name: preset?.name ?? driverName.charAt(0).toUpperCase() + driverName.slice(1),
        type: "discovered",
        baseUrl: preset?.baseUrl,
        defaultModel: preset?.defaultModel,
        envKey: preset?.envKey,
      });
    }

    // Available presets (env var not set, not configured)
    for (const preset of listPresets()) {
      if (registered.has(preset.id)) continue;
      providers.push({
        id: preset.id,
        name: preset.name,
        type: "available",
        baseUrl: preset.baseUrl,
        defaultModel: preset.defaultModel,
        envKey: preset.envKey,
      });
    }

    return providers;
  });

  registerMethod("providers.add", async (params) => {
    const id = params.id as string;
    const name = params.name as string | undefined;
    const baseUrl = params.base_url as string;
    const apiKey = params.api_key as string;
    const defaultModel = params.default_model as string | undefined;
    const providerType = (params.type as string | undefined) ?? "openai-compatible";

    if (!id || !baseUrl || !apiKey) {
      throw new Error("id, base_url, and api_key are required");
    }

    // Validate provider type
    if (providerType !== "openai-compatible" && providerType !== "anthropic") {
      throw new Error(`Invalid type "${providerType}". Supported: openai-compatible, anthropic`);
    }

    // Load and update config file
    const { readFileSync, writeFileSync, existsSync: fileExists, mkdirSync } = await import("node:fs");
    const { join: pathJoin } = await import("node:path");
    const { getConfigDir } = await import("../shared/config.js");

    const configDir = getConfigDir();
    const configPath = pathJoin(configDir, "config.json");

    let fileConfig: Record<string, unknown> = {};
    if (fileExists(configPath)) {
      fileConfig = JSON.parse(readFileSync(configPath, "utf-8"));
    }

    const providers = (fileConfig.providers as ProviderConfig[] | undefined) ?? [];

    // Check for duplicate
    if (providers.some((p) => p.id === id)) {
      throw new Error(`Provider "${id}" already exists. Remove it first.`);
    }

    const newProvider: ProviderConfig = {
      id,
      name: name ?? id.charAt(0).toUpperCase() + id.slice(1),
      baseUrl,
      apiKey,
      type: providerType as "openai-compatible" | "anthropic",
      ...(defaultModel ? { defaultModel } : {}),
    };

    providers.push(newProvider);
    fileConfig.providers = providers;

    if (!fileExists(configDir)) mkdirSync(configDir, { recursive: true });
    writeFileSync(configPath, JSON.stringify(fileConfig, null, 2) + "\n");

    // Register the driver at runtime
    const { registerCustomProviders } = await import("./agent/drivers/providers.js");
    registerCustomProviders([newProvider]);

    // Update in-memory config
    if (!config.providers) config.providers = [];
    config.providers.push(newProvider);

    return { id, name: newProvider.name, baseUrl };
  });

  registerMethod("providers.remove", async (params) => {
    const id = params.id as string;
    if (!id) throw new Error("id is required");

    const { readFileSync, writeFileSync, existsSync: fileExists } = await import("node:fs");
    const { join: pathJoin } = await import("node:path");
    const { getConfigDir } = await import("../shared/config.js");

    const configPath = pathJoin(getConfigDir(), "config.json");
    if (!fileExists(configPath)) {
      throw new Error(`Provider "${id}" not found`);
    }

    const fileConfig = JSON.parse(readFileSync(configPath, "utf-8"));
    const providers = (fileConfig.providers as ProviderConfig[] | undefined) ?? [];

    const idx = providers.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error(`Provider "${id}" not found`);

    providers.splice(idx, 1);
    fileConfig.providers = providers;
    writeFileSync(configPath, JSON.stringify(fileConfig, null, 2) + "\n");

    // Update in-memory config
    if (config.providers) {
      config.providers = config.providers.filter((p) => p.id !== id);
    }

    return { id, removed: true };
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

    const { getConnectorDef, isConnectorConfigured } = await import("../shared/connector.js");
    const { getOAuthProvider, isOAuthCapable, resolveOAuthContext } = await import("./services/oauth/providers.js");

    const def = getConnectorDef(name);
    if (!def) throw new Error(`Unknown connector: ${name}`);

    // OAuth connector — always return the OAuth URL.
    // The user explicitly asked to connect; new tokens overwrite old ones on success.
    // API-key connectors (Stripe's STRIPE_SECRET_KEY, Twilio, PayPal) remain untouched —
    // OAuth adds/refreshes the access token alongside the permanent API key.
    const provider = getOAuthProvider(name);
    if (provider) {
      const { generateState } = await import("./services/oauth/state.js");
      const { buildOAuthStartUrl } = await import("../shared/urls.js");
      const { getUserId, reloadSecrets } = await import("../shared/config.js");

      let userId = getUserId();
      if (!userId) {
        reloadSecrets();
        userId = getUserId();
      }
      if (!userId) {
        throw new Error("No user ID found. Run `jeriko init` or restart the daemon after onboarding.");
      }

      const stateToken = generateState(provider.name, "cli", "cli", userId);

      const args = (params.args as string[]) ?? [];
      const oauthContext = resolveOAuthContext(provider, args);
      if (oauthContext instanceof Error) throw oauthContext;

      const loginUrl = buildOAuthStartUrl(provider.name, stateToken, oauthContext);
      return { ok: true, name, status: "oauth_required", loginUrl, label: provider.label };
    }

    // API-key-only connector — block if already configured, otherwise guide to /auth
    if (isConnectorConfigured(name)) {
      return { ok: true, name, status: "already_connected", label: def.label };
    }
    throw new Error(`${def.label} requires an API key — use /connectors auth ${name}`);
  });

  registerMethod("connector_disconnect", async (params) => {
    if (!connectors) throw new Error("Connector manager not available");
    const name = params.name as string;
    if (!name) throw new Error("name is required");

    const { getConnectorDef, isConnectorConfigured, primaryVarName } = await import("../shared/connector.js");
    const { getOAuthProvider } = await import("./services/oauth/providers.js");
    const { deleteSecret } = await import("../shared/secrets.js");

    const def = getConnectorDef(name);
    if (!def) throw new Error(`Unknown connector: ${name}`);

    if (!isConnectorConfigured(name)) {
      throw new Error(`${def.label} is not connected`);
    }

    // OAuth connector — delete token(s)
    const provider = getOAuthProvider(name);
    if (provider) {
      deleteSecret(provider.tokenEnvVar);
      if (provider.refreshTokenEnvVar) {
        deleteSecret(provider.refreshTokenEnvVar);
      }
    } else {
      // API-key connector — delete all required vars
      for (const entry of def.required) {
        deleteSecret(primaryVarName(entry));
      }
    }

    // Evict from connector cache so next get() re-initializes
    connectors.evict(name);

    return { ok: true, name, label: def.label };
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

  // ── Task IPC methods (backed by TriggerEngine) ────────────────
  // "tasks" is the unified surface for all automation — trigger, schedule, once.
  // Internally delegates to TriggerEngine. The old JSON-file-based task system is removed.

  registerMethod("tasks", async () => {
    if (!triggers) return [];
    return triggers.listAll().map(taskView);
  });

  registerMethod("task_create", async (params) => {
    if (!triggers) throw new Error("Task engine not available");
    const { buildTriggerConfig } = await import("./services/triggers/task-adapter.js");
    const config = buildTriggerConfig(params);
    const trigger = triggers.add(config);
    return taskView(trigger);
  });

  registerMethod("task_info", async (params) => {
    if (!triggers) throw new Error("Task engine not available");
    const id = params.id as string;
    if (!id) throw new Error("id is required");
    const trigger = triggers.get(id);
    if (!trigger) throw new Error(`Task not found: ${id}`);
    return taskView(trigger);
  });

  registerMethod("task_pause", async (params) => {
    if (!triggers) throw new Error("Task engine not available");
    const id = params.id as string;
    if (!id) throw new Error("id is required");
    if (!triggers.get(id)) throw new Error(`Task not found: ${id}`);
    triggers.disable(id);
    return taskView(triggers.get(id)!);
  });

  registerMethod("task_resume", async (params) => {
    if (!triggers) throw new Error("Task engine not available");
    const id = params.id as string;
    if (!id) throw new Error("id is required");
    if (!triggers.get(id)) throw new Error(`Task not found: ${id}`);
    triggers.enable(id);
    return taskView(triggers.get(id)!);
  });

  registerMethod("task_delete", async (params) => {
    if (!triggers) throw new Error("Task engine not available");
    const id = params.id as string;
    if (!id) throw new Error("id is required");
    const existed = triggers.remove(id);
    if (!existed) throw new Error(`Task not found: ${id}`);
    return { deleted: true, id };
  });

  registerMethod("task_test", async (params) => {
    if (!triggers) throw new Error("Task engine not available");
    const id = params.id as string;
    if (!id) throw new Error("id is required");
    const trigger = triggers.get(id);
    if (!trigger) throw new Error(`Task not found: ${id}`);
    await triggers.fire(id, { test: true, timestamp: new Date().toISOString() });
    return { fired: true, id, run_count: triggers.get(id)?.run_count ?? 0 };
  });

  registerMethod("task_log", async (params) => {
    if (!triggers) return [];
    const limit = (params.limit as number) || 20;
    const all = triggers.listAll();
    // Return tasks sorted by last_fired (most recent first), limited
    return all
      .filter((t) => t.last_fired)
      .sort((a, b) => (b.last_fired ?? "").localeCompare(a.last_fired ?? ""))
      .slice(0, limit)
      .map(taskView);
  });

  registerMethod("task_types", async () => {
    return {
      trigger_sources: [
        "stripe:<event>", "paypal:<event>", "github:<event>", "twilio:<event>",
        "gmail:new_email", "email:new_email",
        "http:down", "http:up", "http:slow", "http:any",
        "file:change", "file:create", "file:delete",
      ],
      schedule: "cron expression (e.g. '0 9 * * *', '*/5 * * * *')",
      once: "ISO datetime (e.g. '2026-06-01T09:00')",
    };
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
    // Re-read from disk to reflect current state (not stale boot-time config)
    const { loadConfig } = await import("../shared/config.js");
    return loadConfig();
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
    const { getConfiguredConnectorCount } = await import("../shared/connector.js");
    const state = getLicenseState();

    // Use configured connector count — single source of truth across all surfaces
    const connectorCount = getConfiguredConnectorCount();
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

    const clientMeta = {
      clientIp: (params.client_ip as string) ?? "unknown",
      userAgent: (params.user_agent as string) ?? "unknown",
    };

    const { createCheckoutViaRelay } = await import("./billing/relay-proxy.js");
    const result = await createCheckoutViaRelay(email, clientMeta);
    if (!result) {
      throw new Error("Unable to create checkout session. Relay server may be unreachable or auth token is missing (check RELAY_AUTH_SECRET).");
    }
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
      throw new Error("No active subscription found. Use /upgrade to subscribe first.");
    }

    const { createPortalViaRelay } = await import("./billing/relay-proxy.js");
    const result = await createPortalViaRelay(customerId);
    if (!result) {
      throw new Error("Unable to open billing portal. Relay server may be unreachable or auth token is missing (check RELAY_AUTH_SECRET).");
    }
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

  // billing.cancel is intentionally not implemented as a separate IPC method.
  // Cancellation is handled through the Stripe Customer Portal (billing.portal),
  // which provides a complete billing management UI including cancel, downgrade,
  // payment method updates, and invoice history.

  // ── OAuth callback bridge (CLI → daemon HTTP → CLI) ──────────
  registerMethod("oauth.await_callback", async (params) => {
    const timeoutMs = (params.timeout_ms as number) ?? 120_000;
    const { awaitOAuthCallback } = await import("./api/oauth-bridge.js");
    const code = await awaitOAuthCallback(timeoutMs);
    return { code };
  });

  // ── Provider auth via relay (CLI polls for auth code) ────────
  registerMethod("provider_auth.poll", async (params) => {
    const provider = params.provider as string;
    const timeoutMs = (params.timeout_ms as number) ?? 120_000;
    if (!provider) throw new Error("provider is required");

    // Poll for the auth code — the relay client stores it when received.
    const startTime = Date.now();
    const pollInterval = 500;

    while (Date.now() - startTime < timeoutMs) {
      const pending = state.pendingProviderAuth.get(provider);
      if (pending) {
        state.pendingProviderAuth.delete(provider);
        return { code: pending.code };
      }
      await new Promise((r) => setTimeout(r, pollInterval));
    }

    throw new Error("Provider auth timed out — no callback received");
  });

  // ── Session lifecycle IPC methods ─────────────────────────────
  registerMethod("kill_session", async (params) => {
    const { deleteSession, createSession } = await import("./agent/session/session.js");
    const { kvSet } = await import("./storage/kv.js");
    const sessionId = params.session_id as string;
    const model = (params.model as string) || state.config!.agent.model;
    if (!sessionId) throw new Error("session_id is required");
    deleteSession(sessionId);
    const newSession = createSession({ model });
    kvSet("state:last_session_id", newSession.id);
    return {
      id: newSession.id,
      slug: newSession.slug,
      title: newSession.title,
      model: newSession.model,
      token_count: newSession.token_count,
      updated_at: newSession.updated_at,
    };
  });

  registerMethod("archive_session", async (params) => {
    const { archiveSession, createSession } = await import("./agent/session/session.js");
    const { kvSet } = await import("./storage/kv.js");
    const sessionId = params.session_id as string;
    const model = (params.model as string) || state.config!.agent.model;
    if (!sessionId) throw new Error("session_id is required");
    archiveSession(sessionId);
    const newSession = createSession({ model });
    kvSet("state:last_session_id", newSession.id);
    return {
      id: newSession.id,
      slug: newSession.slug,
      title: newSession.title,
      model: newSession.model,
      token_count: newSession.token_count,
      updated_at: newSession.updated_at,
    };
  });

  registerMethod("delete_session", async (params) => {
    const { deleteSession, getSession, getSessionBySlug } = await import("./agent/session/session.js");
    const slugOrId = params.slug_or_id as string;
    if (!slugOrId) throw new Error("slug_or_id is required");
    const target = getSessionBySlug(slugOrId) ?? getSession(slugOrId);
    if (!target) throw new Error(`Session "${slugOrId}" not found`);
    deleteSession(target.id);
    return { id: target.id, slug: target.slug, deleted: true };
  });

  // ── Auth IPC methods ──────────────────────────────────────────
  registerMethod("auth_status", async () => {
    const { CONNECTOR_DEFS, isConnectorConfigured, isSlotSet, slotLabel, primaryVarName } = await import("../shared/connector.js");
    return CONNECTOR_DEFS.map((def) => ({
      name: def.name,
      label: def.label,
      description: def.description,
      configured: isConnectorConfigured(def.name),
      required: def.required.map((entry) => ({
        variable: primaryVarName(entry),
        label: slotLabel(entry),
        set: isSlotSet(entry),
      })),
      optional: def.optional.map((v) => ({
        variable: v,
        set: !!process.env[v],
      })),
    }));
  });

  registerMethod("auth_save", async (params) => {
    const { getConnectorDef, primaryVarName, isConnectorConfigured } = await import("../shared/connector.js");
    const { saveSecret } = await import("../shared/secrets.js");
    const connectorName = params.name as string;
    const keys = params.keys as string[];

    if (!connectorName) throw new Error("name is required");
    if (!keys || keys.length === 0) throw new Error("keys are required");

    const def = getConnectorDef(connectorName);
    if (!def) throw new Error(`Unknown connector: ${connectorName}`);

    if (keys.length < def.required.length) {
      const varNames = def.required.map((e) => primaryVarName(e));
      throw new Error(`${def.label} requires ${def.required.length} key(s): ${varNames.join(", ")}`);
    }

    // Billing gate: check if the tier allows a new connector (skip if already configured)
    if (!isConnectorConfigured(connectorName) && process.env.STRIPE_BILLING_SECRET_KEY) {
      const { canActivateConnector } = await import("./billing/license.js");
      const check = canActivateConnector();
      if (!check.allowed) throw new Error(check.reason!);
    }

    let saved = 0;
    for (let i = 0; i < def.required.length; i++) {
      const varName = primaryVarName(def.required[i]!);
      saveSecret(varName, keys[i]!);
      saved++;
    }

    return { connector: connectorName, label: def.label, saved };
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
 *  1.   Stop accepting new HTTP connections
 *  1.5. Stop socket IPC server
 *  2.   Disconnect all channels
 *  2.5. Disconnect relay client
 *  2.6. Shut down connectors
 *  3.   Stop trigger engine
 *  4.   Unload plugins
 *  5.   Drain and stop worker pool
 *  6.   Close database
 *  7.   Close logger
 */
export async function shutdown(): Promise<void> {
  if (state.phase !== "running" && state.phase !== "booting") {
    return;
  }

  state.phase = "shutting_down";
  log.info("Kernel shutdown initiated");

  // Each shutdown step is wrapped in try/catch so one failure
  // doesn't prevent subsequent resources from being cleaned up.

  // 1. Stop HTTP server
  try { stopServer(); } catch (e) { log.error(`Shutdown: HTTP server error: ${e}`); }
  state.server = null;

  // 1.5. Stop socket IPC server
  try { stopSocketServer(); } catch (e) { log.error(`Shutdown: socket IPC error: ${e}`); }

  // 2. Disconnect channels
  if (state.channels) {
    try { await state.channels.disconnectAll(); } catch (e) { log.error(`Shutdown: channels error: ${e}`); }
    state.channels = null;
  }

  // 2.5. Disconnect relay client
  if (state.relay) {
    try { state.relay.disconnect(); } catch (e) { log.error(`Shutdown: relay error: ${e}`); }
    state.relay = null;
  }

  // 2.6. Shut down connectors
  if (state.connectors) {
    try { await state.connectors.shutdownAll(); } catch (e) { log.error(`Shutdown: connectors error: ${e}`); }
    state.connectors = null;
  }

  // 3. Stop trigger engine
  if (state.triggers) {
    try { await state.triggers.stop(); } catch (e) { log.error(`Shutdown: trigger engine error: ${e}`); }
    state.triggers = null;
  }

  // 4. Unload plugins
  if (state.plugins) {
    try { await state.plugins.unloadAll(); } catch (e) { log.error(`Shutdown: plugins error: ${e}`); }
    state.plugins = null;
  }

  // 5. Drain worker pool
  if (state.workers) {
    try { await state.workers.drain(); } catch (e) { log.error(`Shutdown: worker pool error: ${e}`); }
    state.workers = null;
  }

  // 6. Close database
  try { closeDatabase(); } catch (e) { log.error(`Shutdown: database error: ${e}`); }
  state.db = null;

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

  // Catch unhandled errors — log, cleanup, exit non-zero
  process.on("uncaughtException", async (err) => {
    log.error(`Uncaught exception: ${err.message}`, { stack: err.stack });
    await shutdown();
    for (const hook of shutdownHooks) {
      try { await hook(); } catch { /* best-effort */ }
    }
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    log.error(`Unhandled rejection: ${msg}`, { stack });
    // Don't crash on unhandled rejections — log and continue
  });
}
