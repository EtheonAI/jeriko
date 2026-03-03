// Channel message router — binds channel inbound messages to the agent loop.
//
// Architecture:
//   - Concurrent per-message processing with AbortController per chat
//   - Live streaming: agent responses are edited in-place with debounced updates
//   - /stop command aborts the active run for a chat
//   - File receive: downloads attachments, prepends paths to prompt
//   - File send: scans responses for file paths, sends as photo/document
//   - Extended slash commands: /stop, /clear, /kill, /sessions, /connectors, /sys
//   - System prompt injection from AGENT.md (Jeriko identity)
//   - Model-aware behavior from capability registry
//   - Session persistence across daemon restarts (restored from DB)

import type { ChannelRegistry, MessageMetadata, KeyboardLayout } from "./index.js";
import { getLogger } from "../../../shared/logger.js";
import { runAgent, type AgentRunConfig } from "../../agent/agent.js";
import {
  createSession,
  updateSession,
  deleteSession,
  archiveSession,
  listSessions,
  getSession,
  getSessionBySlug,
} from "../../agent/session/session.js";
import { addMessage, getMessages, clearMessages } from "../../agent/session/message.js";
import type { DriverMessage } from "../../agent/drivers/index.js";
import { listDrivers, getDriver } from "../../agent/drivers/index.js";
import { resolveModel, getCapabilities, parseModelSpec } from "../../agent/drivers/models.js";
import {
  bindSession,
  getBinding,
  updateBindingModel,
  unbindSession,
  restoreBindings,
} from "./binding.js";
import { kvGet, kvSet } from "../../storage/kv.js";
import { existsSync, readdirSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const log = getLogger();

const TYPING_INTERVAL_MS = 4_000;
const EDIT_INTERVAL_MS = 1_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatState {
  sessionId: string;
  model: string;
}

interface ActiveRun {
  controller: AbortController;
  messageId?: string | number;
  startedAt: number;
}

/** Maximum time a single message processing can take before auto-abort (5 minutes). */
const PROCESS_TIMEOUT_MS = 5 * 60_000;

export interface ChannelRouterOptions {
  channels: ChannelRegistry;
  defaultModel: string;
  maxTokens: number;
  temperature: number;
  extendedThinking: boolean;
  /** System prompt from AGENT.md — Jeriko identity and commands. */
  systemPrompt?: string;
  /** Lazy accessor for trigger engine (created after router in kernel boot). */
  getTriggerEngine?: () => import("../triggers/engine.js").TriggerEngine | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getProviderName(alias: string): string {
  const { backend } = parseModelSpec(alias);
  try {
    return getDriver(backend).name;
  } catch {
    return backend;
  }
}

function describeModel(alias: string): string {
  const { backend, model } = parseModelSpec(alias);
  const provider = getProviderName(backend);
  const resolvedId = resolveModel(provider, model);
  const caps = getCapabilities(provider, resolvedId);
  const cost =
    caps.costInput === 0
      ? "subscription"
      : `$${caps.costInput}/$${caps.costOutput} per 1M tokens`;
  return [
    `${alias} (${resolvedId})`,
    `tools=${caps.toolCall} reasoning=${caps.reasoning} ctx=${(caps.context / 1000).toFixed(0)}k cost=${cost}`,
  ].join("\n");
}

/** Build a live preview from partial response + status indicator. */
function buildPreview(text: string, status: string): string {
  const truncated = text.length > 3800 ? "..." + text.slice(-3800) : text;
  return status ? `${truncated}\n\n_${status}_` : truncated || "Processing...";
}

/** Match file paths in a response for auto-sending. */
const FILE_PATH_REGEX = /(?:\/[\w.-]+)+\.(?:png|jpg|jpeg|gif|webp|pdf|csv|txt|json|html|zip|tar\.gz|mp3|mp4|mkv|avi|mov|wav|ogg|flac|aac|m4a|webm|doc|docx|xls|xlsx|ppt|pptx)/gi;
const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp"]);
const VIDEO_EXTS = new Set(["mp4", "mkv", "avi", "mov", "webm"]);
const AUDIO_EXTS = new Set(["mp3", "wav", "ogg", "flac", "aac", "m4a"]);

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export function startChannelRouter(opts: ChannelRouterOptions): void {
  const sessionsByChat = new Map<string, ChatState>();
  const activeRuns = new Map<string, ActiveRun>();
  /** Per-chat message queue — ensures sequential processing within each chat. */
  const chatQueues = new Map<string, Promise<void>>();

  // ── Restore sessions from KV-persisted bindings on boot ─────────────
  try {
    const channelNames = opts.channels.list();
    for (const channel of channelNames) {
      const bindings = restoreBindings(channel, (b) => !!getSession(b.sessionId));
      for (const b of bindings) {
        sessionsByChat.set(b.chatId, {
          sessionId: b.sessionId,
          model: b.model,
        });
      }
    }
    if (sessionsByChat.size > 0) {
      log.info(`Router: restored ${sessionsByChat.size} chat bindings from KV store`);
    }
  } catch (err) {
    log.warn(`Router: failed to restore bindings: ${err}`);
  }

  // ── Message handler ─────────────────────────────────────────────────
  opts.channels.bus.on("channel:message", async ({ message, metadata }) => {
    const chatId = metadata.chat_id;
    const text = message.trim();
    if (!text) return;

    // Slash commands execute immediately
    if (text.startsWith("/")) {
      await handleCommand(text, metadata);
      return;
    }

    // Queue messages per chat — each chat processes one at a time to prevent
    // response mixing, session corruption, and activeRun overwrites.
    // Each processMessage is wrapped with a timeout so a stuck LLM call
    // auto-aborts and doesn't block subsequent messages.
    const prev = chatQueues.get(chatId) ?? Promise.resolve();
    const next = prev.then(async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          processMessage(chatId, text, metadata),
          new Promise<void>((_, reject) => {
            timer = setTimeout(() => reject(new Error("Process timeout")), PROCESS_TIMEOUT_MS);
          }),
        ]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error(`Router: message processing failed for chat ${chatId}: ${msg}`);
        // Auto-abort the stuck run so subsequent messages can proceed
        const stuckRun = activeRuns.get(chatId);
        if (stuckRun) {
          stuckRun.controller.abort();
          activeRuns.delete(chatId);
        }
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    });
    chatQueues.set(chatId, next);
    // Clean up queue entry when done to avoid unbounded memory growth
    next.then(() => {
      if (chatQueues.get(chatId) === next) chatQueues.delete(chatId);
    });
  });

  // ── Process a single message ────────────────────────────────────────

  async function processMessage(
    chatId: string,
    text: string,
    metadata: MessageMetadata,
  ): Promise<void> {
    const controller = new AbortController();
    const typingTimer = startTyping(metadata);

    // Send initial status message and track it for live edits
    let sent: { messageId: string | number } | null = null;
    try {
      sent = await opts.channels.sendTracked(metadata.channel, chatId, "Processing...");
    } catch {
      // Fallback: no tracked message, responses will be sent as new messages
    }

    const run: ActiveRun = {
      controller,
      messageId: sent?.messageId,
      startedAt: Date.now(),
    };
    activeRuns.set(chatId, run);

    try {
      // Download any file attachments and prepend to prompt
      let augmentedText = text;
      if (metadata.attachments?.length) {
        const fileParts: string[] = [];
        for (const att of metadata.attachments) {
          try {
            const localPath = await opts.channels.downloadFile(
              metadata.channel,
              att.fileId,
              att.filename,
            );
            const desc = att.caption
              ? `User sent a ${att.type} (saved to ${localPath}). Caption: ${att.caption}`
              : `User sent a ${att.type} (saved to ${localPath}).`;
            fileParts.push(desc);
          } catch (err) {
            log.warn(`Failed to download attachment: ${err}`);
            fileParts.push(`User sent a ${att.type} (download failed).`);
          }
        }
        augmentedText = fileParts.join("\n") + "\n\n" + text;
      }

      const state = getOrCreateState(chatId, metadata.channel);
      addMessage(state.sessionId, "user", augmentedText);

      const history = getMessages(state.sessionId).map<DriverMessage>((m) => ({
        role: m.role as DriverMessage["role"],
        content: m.content,
      }));

      const { backend: modelBackend, model: modelId } = parseModelSpec(state.model);
      const provider = getProviderName(modelBackend);
      const resolvedId = resolveModel(provider, modelId);
      const caps = getCapabilities(provider, resolvedId);

      const runConfig: AgentRunConfig = {
        sessionId: state.sessionId,
        backend: modelBackend,
        model: modelId,
        systemPrompt: opts.systemPrompt,
        maxTokens: opts.maxTokens,
        temperature: opts.temperature,
        extendedThinking: caps.reasoning ? opts.extendedThinking : false,
        toolIds: null,
        signal: controller.signal,
      };

      let response = "";
      let statusLabel = "";
      let lastError = "";
      let lastEditAt = 0;
      const toolResults: string[] = [];

      for await (const event of runAgent(runConfig, history)) {
        if (controller.signal.aborted) break;

        switch (event.type) {
          case "text_delta":
            response += event.content;
            break;
          case "thinking":
            statusLabel = "Thinking...";
            break;
          case "tool_call_start":
            statusLabel = `Running: ${event.toolCall.name}`;
            break;
          case "tool_result":
            statusLabel = "";
            // Capture tool results — they may contain file paths (screenshots, downloads, etc.)
            if (event.result && !event.isError) {
              toolResults.push(event.result);
            }
            break;
          case "error":
            lastError = event.message;
            break;
        }

        // Debounced live edit
        const now = Date.now();
        if (sent?.messageId && now - lastEditAt >= EDIT_INTERVAL_MS) {
          const preview = buildPreview(response, statusLabel);
          await editSafe(metadata, sent.messageId, preview);
          lastEditAt = now;
        }
      }

      if (controller.signal.aborted) {
        // Aborted — message already handled by /stop
        return;
      }

      // Final edit with complete response
      if (sent?.messageId && response) {
        await editSafe(metadata, sent.messageId, response);
      } else if (sent?.messageId && lastError) {
        await editSafe(metadata, sent.messageId, `Error: ${lastError}`);
      } else if (sent?.messageId && !response) {
        await editSafe(metadata, sent.messageId, "(no response)");
      } else if (!sent && response) {
        // No tracked message — send as new message
        await safeSend(metadata, response);
      } else if (!sent && lastError) {
        await safeSend(metadata, `Error: ${lastError}`);
      } else if (!sent) {
        await safeSend(metadata, "(no response)");
      }

      // Send any files referenced in the response text or tool results
      await sendResponseFiles(metadata, response, toolResults);
    } catch (err) {
      if (controller.signal.aborted) return;
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`Router error: ${msg}`);
      if (sent?.messageId) {
        await editSafe(metadata, sent.messageId, `Error: ${msg}`);
      } else {
        await safeSend(metadata, `Error: ${msg}`);
      }
    } finally {
      clearInterval(typingTimer);
      activeRuns.delete(chatId);
    }
  }

  // ── File sending — detect file paths in response ────────────────────

  async function sendResponseFiles(
    metadata: MessageMetadata,
    response: string,
    toolResults: string[] = [],
  ): Promise<void> {
    // Scan both the agent's text response AND tool result outputs for file paths.
    // Tool results contain the actual paths (e.g. screenshot tool returns {"path":"/tmp/screenshot.png"})
    // while the text response may only describe the result in natural language.
    const searchable = [response, ...toolResults].join("\n");
    const paths = [...new Set(searchable.match(FILE_PATH_REGEX) ?? [])];

    for (const filePath of paths) {
      if (!existsSync(filePath)) continue;
      try {
        const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
        if (IMAGE_EXTS.has(ext)) {
          await opts.channels.sendPhoto(metadata.channel, metadata.chat_id, filePath);
        } else if (VIDEO_EXTS.has(ext)) {
          await opts.channels.sendVideo(metadata.channel, metadata.chat_id, filePath);
        } else if (AUDIO_EXTS.has(ext)) {
          await opts.channels.sendAudio(metadata.channel, metadata.chat_id, filePath);
        } else {
          await opts.channels.sendDocument(metadata.channel, metadata.chat_id, filePath);
        }
      } catch (err) {
        log.warn(`Failed to send file ${filePath}: ${err}`);
      }
    }
  }

  // ── Typing indicator ────────────────────────────────────────────────

  function startTyping(
    metadata: MessageMetadata,
  ): ReturnType<typeof setInterval> {
    opts.channels.sendTyping(metadata.channel, metadata.chat_id).catch(() => {});
    return setInterval(() => {
      opts.channels.sendTyping(metadata.channel, metadata.chat_id).catch(() => {});
    }, TYPING_INTERVAL_MS);
  }

  // ── Session state ───────────────────────────────────────────────────

  function getOrCreateState(chatId: string, channel: string): ChatState {
    const existing = sessionsByChat.get(chatId);
    if (existing) return existing;

    // Check KV store for a persisted binding (e.g. from a prior daemon run
    // with a channel that wasn't registered at boot time)
    const persisted = getBinding(channel, chatId);
    if (persisted && getSession(persisted.sessionId)) {
      const state: ChatState = {
        sessionId: persisted.sessionId,
        model: persisted.model,
      };
      sessionsByChat.set(chatId, state);
      return state;
    }

    const session = createSession({
      title: `Channel ${chatId}`,
      model: opts.defaultModel,
    });
    const state: ChatState = {
      sessionId: session.id,
      model: opts.defaultModel,
    };
    sessionsByChat.set(chatId, state);
    bindSession(channel, chatId, session.id, opts.defaultModel);
    return state;
  }

  // ── Slash commands ──────────────────────────────────────────────────

  async function handleCommand(
    text: string,
    metadata: MessageMetadata,
  ): Promise<void> {
    const chatId = metadata.chat_id;
    const [raw, ...rest] = text.slice(1).split(" ");
    const command = (raw || "").toLowerCase();
    const arg = rest.join(" ").trim();
    const state = getOrCreateState(chatId, metadata.channel);

    switch (command) {
      case "start":
      case "help":
      case "commands":
        await safeKeyboard(
          metadata,
          "Jeriko — tap a button or type a command:",
          [
            [
              { label: "New Session", data: "/new" },
              { label: "Sessions", data: "/sessions" },
              { label: "Model", data: "/model" },
            ],
            [
              { label: "Connect", data: "/connect" },
              { label: "Connectors", data: "/connectors" },
              { label: "Health", data: "/health" },
            ],
            [
              { label: "Skills", data: "/skill" },
              { label: "Triggers", data: "/triggers" },
              { label: "Tasks", data: "/tasks" },
            ],
            [
              { label: "Channels", data: "/channels" },
              { label: "Notifications", data: "/notifications" },
              { label: "Share", data: "/share" },
            ],
            [
              { label: "History", data: "/history" },
              { label: "Status", data: "/status" },
              { label: "System", data: "/sys" },
            ],
          ],
        );
        return;

      case "new": {
        const session = createSession({
          title: `Channel ${chatId}`,
          model: state.model,
        });
        sessionsByChat.set(chatId, {
          sessionId: session.id,
          model: state.model,
        });
        bindSession(metadata.channel, chatId, session.id, state.model);
        await safeSend(metadata, `New session: ${session.id}`);
        return;
      }

      case "stop": {
        const run = activeRuns.get(chatId);
        if (!run) {
          await safeSend(metadata, "Nothing running.");
          return;
        }
        run.controller.abort();
        activeRuns.delete(chatId);
        if (run.messageId) {
          await editSafe(metadata, run.messageId, "Stopped.");
        }
        await safeSend(metadata, "Stopped.");
        return;
      }

      case "clear": {
        clearMessages(state.sessionId);
        await safeSend(metadata, "Session history cleared.");
        return;
      }

      case "kill": {
        // Abort any active run first
        const run = activeRuns.get(chatId);
        if (run) {
          run.controller.abort();
          activeRuns.delete(chatId);
        }
        unbindSession(metadata.channel, chatId);
        deleteSession(state.sessionId);
        const session = createSession({
          title: `Channel ${chatId}`,
          model: state.model,
        });
        sessionsByChat.set(chatId, {
          sessionId: session.id,
          model: state.model,
        });
        bindSession(metadata.channel, chatId, session.id, state.model);
        await safeSend(metadata, `Session destroyed. New session: ${session.id}`);
        return;
      }

      case "session":
        await safeSend(
          metadata,
          [`session: ${state.sessionId}`, describeModel(state.model)].join("\n"),
        );
        return;

      case "sessions": {
        const recent = listSessions(10);
        if (recent.length === 0) {
          await safeSend(metadata, "No sessions.");
          return;
        }

        const buttons: KeyboardLayout = [];
        const lines: string[] = [];
        for (const s of recent) {
          const active = s.id === state.sessionId;
          const age = formatAge(s.updated_at);
          const label = active ? `${s.slug} ●` : s.slug;
          lines.push(`${active ? "●" : "○"} ${s.slug} — ${s.model ?? "?"} — ${age}`);
          if (!active) {
            buttons.push([{ label, data: `/switch ${s.slug}` }]);
          }
        }

        if (buttons.length > 0) {
          await safeKeyboard(
            metadata,
            ["Recent sessions:", ...lines].join("\n") + "\n\nTap to switch:",
            buttons,
          );
        } else {
          await safeSend(metadata, ["Recent sessions:", ...lines].join("\n"));
        }
        return;
      }

      case "switch": {
        if (!arg) {
          await safeSend(metadata, "Usage: /switch <session-slug-or-id>");
          return;
        }
        const target = getSessionBySlug(arg) ?? getSession(arg);
        if (!target) {
          await safeSend(metadata, `Session not found: ${arg}`);
          return;
        }
        const switchModel = target.model ?? opts.defaultModel;
        sessionsByChat.set(chatId, {
          sessionId: target.id,
          model: switchModel,
        });
        bindSession(metadata.channel, chatId, target.id, switchModel);
        await safeSend(metadata, `Switched to session: ${target.slug} (${target.id})`);
        return;
      }

      case "archive": {
        unbindSession(metadata.channel, chatId);
        archiveSession(state.sessionId);
        const session = createSession({
          title: `Channel ${chatId}`,
          model: state.model,
        });
        sessionsByChat.set(chatId, {
          sessionId: session.id,
          model: state.model,
        });
        bindSession(metadata.channel, chatId, session.id, state.model);
        await safeSend(metadata, `Archived. New session: ${session.id}`);
        return;
      }

      case "model":
      case "models": {
        if (!arg) {
          const drivers = listDrivers();
          const buttons: KeyboardLayout = [];
          let row: Array<{ label: string; data: string }> = [];
          for (const driver of drivers) {
            const isCurrent = state.model === driver;
            const label = isCurrent ? `${driver} ●` : driver;
            row.push({ label, data: `/model ${driver}` });
            if (row.length === 3) {
              buttons.push(row);
              row = [];
            }
          }
          if (row.length > 0) buttons.push(row);

          await safeKeyboard(
            metadata,
            `Current: ${describeModel(state.model)}\n\nTap to switch:`,
            buttons,
          );
          return;
        }

        // Validate that the driver/provider exists
        const { backend: argBackend } = parseModelSpec(arg);
        try {
          getDriver(argBackend);
        } catch {
          await safeSend(
            metadata,
            `Unknown model: ${arg}\nAvailable: ${listDrivers().join(", ")}`,
          );
          return;
        }

        state.model = arg;
        sessionsByChat.set(chatId, state);
        updateBindingModel(metadata.channel, chatId, arg);
        updateSession(state.sessionId, { model: arg });
        await safeSend(metadata, `Switched to:\n${describeModel(arg)}`);
        return;
      }

      case "status": {
        const mem = Math.round(process.memoryUsage().rss / 1024 / 1024);
        const active = activeRuns.size;
        await safeSend(
          metadata,
          [
            `uptime: ${Math.floor(process.uptime())}s`,
            `memory: ${mem}MB`,
            `model: ${state.model}`,
            `session: ${state.sessionId}`,
            `active: ${active} chat(s) processing`,
          ].join("\n"),
        );
        return;
      }

      case "connect": {
        const { CONNECTOR_DEFS, isConnectorConfigured } = await import("../../../shared/connector.js");
        const { getOAuthProvider, isOAuthCapable, OAUTH_PROVIDERS } = await import("../oauth/providers.js");
        const { generateState } = await import("../oauth/state.js");

        const connectorName = rest[0]?.toLowerCase();

        // No args — show all OAuth providers as buttons
        if (!connectorName) {
          const buttons: KeyboardLayout = [];
          let row: Array<{ label: string; data: string }> = [];

          for (const p of OAUTH_PROVIDERS) {
            const ready = isConnectorConfigured(p.name);
            const hasCredentials = !!process.env[p.clientIdVar];
            const label = ready ? `${p.label} ✓` : p.label;
            const data = ready ? `/disconnect ${p.name}` : `/connect ${p.name}`;

            if (hasCredentials || ready) {
              row.push({ label, data });
              if (row.length === 3) {
                buttons.push(row);
                row = [];
              }
            }
          }
          if (row.length > 0) buttons.push(row);

          // Add API-key connectors that aren't OAuth-capable
          const apiKeyRow: Array<{ label: string; data: string }> = [];
          for (const def of CONNECTOR_DEFS) {
            if (!isOAuthCapable(def.name)) {
              const ready = isConnectorConfigured(def.name);
              const label = ready ? `${def.label} ✓` : def.label;
              apiKeyRow.push({ label, data: `/auth ${def.name}` });
            }
          }
          if (apiKeyRow.length > 0) buttons.push(apiKeyRow);

          const connectedCount = CONNECTOR_DEFS.filter((d) => isConnectorConfigured(d.name)).length;
          await safeKeyboard(
            metadata,
            `Connectors (${connectedCount}/${CONNECTOR_DEFS.length} connected)\nTap to connect or disconnect:`,
            buttons,
          );
          return;
        }

        // Specific connector
        const provider = getOAuthProvider(connectorName);
        if (!provider) {
          const oauthNames = OAUTH_PROVIDERS.map((p) => p.name).join(", ");
          await safeSend(
            metadata,
            `${connectorName} doesn't support OAuth.\nUse /auth ${connectorName} <key> instead.\n\nOAuth connectors: ${oauthNames}`,
          );
          return;
        }

        // Check OAuth client credentials are configured on the server
        if (!process.env[provider.clientIdVar]) {
          await safeSend(
            metadata,
            `${provider.label} OAuth is not configured.\nSet ${provider.clientIdVar} and ${provider.clientSecretVar} in the daemon .env.`,
          );
          return;
        }

        // Already connected?
        if (isConnectorConfigured(connectorName)) {
          await safeSend(
            metadata,
            `${provider.label} is already connected.\nUse /disconnect ${connectorName} to remove it first.`,
          );
          return;
        }

        // Generate state token and send the login link
        const stateToken = generateState(provider.name, chatId, metadata.channel);
        const baseUrl = process.env.JERIKO_PUBLIC_URL ?? "https://bot.jeriko.ai";
        const loginUrl = `${baseUrl}/oauth/${provider.name}/start?state=${stateToken}`;

        await safeSend(
          metadata,
          `Connect ${provider.label}:\n${loginUrl}\n\nLink expires in 10 minutes.`,
        );

        // Delete the user's /connect message — it's now processed and keeping it
        // in chat history is unnecessary. The bot's reply contains the login link.
        if (metadata.message_id) {
          await opts.channels.deleteMessage(
            metadata.channel,
            metadata.chat_id,
            metadata.message_id,
          );
        }
        return;
      }

      case "disconnect": {
        const { getConnectorDef, isConnectorConfigured } = await import("../../../shared/connector.js");
        const { getOAuthProvider } = await import("../oauth/providers.js");
        const { deleteSecret } = await import("../../../shared/secrets.js");

        const connectorName = rest[0]?.toLowerCase();

        if (!connectorName) {
          // Show connected connectors as buttons
          const { CONNECTOR_DEFS } = await import("../../../shared/connector.js");
          const connected = CONNECTOR_DEFS.filter((d) => isConnectorConfigured(d.name));

          if (connected.length === 0) {
            await safeSend(metadata, "No connectors are connected.");
            return;
          }

          const buttons: KeyboardLayout = [];
          let row: Array<{ label: string; data: string }> = [];
          for (const d of connected) {
            row.push({ label: d.label, data: `/disconnect ${d.name}` });
            if (row.length === 3) {
              buttons.push(row);
              row = [];
            }
          }
          if (row.length > 0) buttons.push(row);

          await safeKeyboard(metadata, "Tap a connector to disconnect:", buttons);
          return;
        }

        const def = getConnectorDef(connectorName);
        if (!def) {
          await safeSend(metadata, `Unknown connector: ${connectorName}`);
          return;
        }

        if (!isConnectorConfigured(connectorName)) {
          await safeSend(metadata, `${def.label} is not connected.`);
          return;
        }

        // Delete the OAuth token(s)
        const provider = getOAuthProvider(connectorName);
        if (provider) {
          deleteSecret(provider.tokenEnvVar);
          if (provider.refreshTokenEnvVar) {
            deleteSecret(provider.refreshTokenEnvVar);
          }
          await safeSend(metadata, `${def.label} disconnected.`);
        } else {
          // API-key connector — delete all required vars
          const { primaryVarName } = await import("../../../shared/connector.js");
          for (const entry of def.required) {
            deleteSecret(primaryVarName(entry));
          }
          await safeSend(metadata, `${def.label} disconnected. API key(s) removed.`);
        }
        return;
      }

      case "connectors": {
        const { CONNECTOR_DEFS, isConnectorConfigured } = await import("../../../shared/connector.js");
        const { isOAuthCapable } = await import("../oauth/providers.js");

        let configuredCount = 0;
        const buttons: KeyboardLayout = [];
        let row: Array<{ label: string; data: string }> = [];

        for (const def of CONNECTOR_DEFS) {
          const ready = isConnectorConfigured(def.name);
          if (ready) configuredCount++;
          const oauth = isOAuthCapable(def.name);
          const label = ready ? `${def.label} ✓` : `${def.label}`;
          const action = ready
            ? `/health ${def.name}`
            : oauth
              ? `/connect ${def.name}`
              : `/auth ${def.name}`;

          row.push({ label, data: action });
          if (row.length === 3) {
            buttons.push(row);
            row = [];
          }
        }
        if (row.length > 0) buttons.push(row);

        await safeKeyboard(
          metadata,
          `Connectors: ${configuredCount}/${CONNECTOR_DEFS.length} connected\n✓ = connected (tap for health check)\nOthers: tap to connect`,
          buttons,
        );
        return;
      }

      case "auth": {
        const {
          CONNECTOR_DEFS, getConnectorDef, isConnectorConfigured,
          primaryVarName, isSlotSet, slotLabel,
        } = await import("../../../shared/connector.js");
        const { saveSecret } = await import("../../../shared/secrets.js");

        const connectorName = rest[0]?.toLowerCase();

        // No args — show all connectors as buttons
        if (!connectorName) {
          const buttons: KeyboardLayout = [];
          let row: Array<{ label: string; data: string }> = [];
          for (const def of CONNECTOR_DEFS) {
            const ready = isConnectorConfigured(def.name);
            const label = ready ? `${def.label} ✓` : def.label;
            row.push({ label, data: `/auth ${def.name}` });
            if (row.length === 3) {
              buttons.push(row);
              row = [];
            }
          }
          if (row.length > 0) buttons.push(row);

          await safeKeyboard(
            metadata,
            "Configure a connector — tap for details:",
            buttons,
          );
          return;
        }

        const def = getConnectorDef(connectorName);
        if (!def) {
          const names = CONNECTOR_DEFS.map((d) => d.name).join(", ");
          await safeSend(metadata, `Unknown connector: ${connectorName}\nAvailable: ${names}`);
          return;
        }

        // No keys provided — show what's needed for this connector
        const keys = rest.slice(1);
        if (keys.length === 0) {
          const ready = isConnectorConfigured(def.name);
          const lines = [`${def.label} \u2014 ${def.description}`];
          lines.push(`Status: ${ready ? "configured \u25CF" : "not configured \u25CB"}`);
          lines.push("");
          lines.push("Required:");
          for (const entry of def.required) {
            lines.push(`  ${isSlotSet(entry) ? "\u25CF" : "\u25CB"} ${slotLabel(entry)}`);
          }
          if (def.optional.length > 0) {
            lines.push("Optional:");
            for (const v of def.optional) {
              lines.push(`  ${process.env[v] ? "\u25CF" : "\u25CB"} ${v}`);
            }
          }
          lines.push("");
          if (def.required.length === 1) {
            lines.push(`Set: /auth ${def.name} <key>`);
          } else {
            lines.push(`Set: /auth ${def.name} ${def.required.map((e) => `<${primaryVarName(e)}>`).join(" ")}`);
          }
          await safeSend(metadata, lines.join("\n"));
          return;
        }

        // Validate key count
        if (keys.length < def.required.length) {
          const varNames = def.required.map((e) => primaryVarName(e));
          await safeSend(
            metadata,
            `${def.label} requires ${def.required.length} key(s):\n${varNames.join("\n")}\n\nUsage: /auth ${def.name} ${varNames.map((v) => `<${v}>`).join(" ")}`,
          );
          return;
        }

        // Save each required key using the primary env var name
        for (let i = 0; i < def.required.length; i++) {
          const varName = primaryVarName(def.required[i]!);
          saveSecret(varName, keys[i]!);
        }

        // Delete the user's message containing the API keys (security)
        if (metadata.message_id) {
          await opts.channels.deleteMessage(
            metadata.channel,
            metadata.chat_id,
            metadata.message_id,
          );
        }

        await safeSend(
          metadata,
          `${def.label} configured. Keys saved securely.\nUse /health ${def.name} to verify connectivity.`,
        );
        return;
      }

      case "health": {
        const { CONNECTOR_DEFS, getConnectorDef, isConnectorConfigured } = await import("../../../shared/connector.js");

        const connectorName = rest[0]?.toLowerCase();

        // No args — show configured connectors as buttons for individual health checks
        if (!connectorName) {
          const configured = CONNECTOR_DEFS.filter((d) => isConnectorConfigured(d.name));
          if (configured.length === 0) {
            await safeKeyboard(
              metadata,
              "No connectors configured.",
              [[{ label: "Connect", data: "/connect" }, { label: "Auth", data: "/auth" }]],
            );
            return;
          }

          const buttons: KeyboardLayout = [];
          let row: Array<{ label: string; data: string }> = [];
          for (const def of configured) {
            row.push({ label: def.label, data: `/health ${def.name}` });
            if (row.length === 3) {
              buttons.push(row);
              row = [];
            }
          }
          if (row.length > 0) buttons.push(row);

          await safeKeyboard(
            metadata,
            `${configured.length} connector(s) ready — tap to health check:`,
            buttons,
          );
          return;
        }

        const def = getConnectorDef(connectorName);
        if (!def) {
          await safeSend(metadata, `Unknown connector: ${connectorName}`);
          return;
        }

        if (!isConnectorConfigured(def.name)) {
          await safeSend(metadata, `${def.label} is not configured.\nUse /auth ${def.name} to set it up.`);
          return;
        }

        await safeSend(metadata, `Checking ${def.label}...`);
        const result = await checkConnectorHealth(def.name);
        if (result.healthy) {
          await safeSend(metadata, `${def.label}: healthy (${result.latency}ms)`);
        } else {
          await safeSend(metadata, `${def.label}: failed \u2014 ${result.error}`);
        }
        return;
      }

      case "sys": {
        const mem = Math.round(process.memoryUsage().rss / 1024 / 1024);
        const heap = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
        const uptime = formatDuration(process.uptime());
        await safeSend(
          metadata,
          [
            `platform: ${process.platform} ${process.arch}`,
            `runtime: Bun ${Bun.version}`,
            `uptime: ${uptime}`,
            `memory: ${mem}MB (heap: ${heap}MB)`,
            `pid: ${process.pid}`,
          ].join("\n"),
        );
        return;
      }

      case "skill":
      case "skills": {
        const {
          listSkills,
          loadSkill,
          scaffoldSkill,
          removeSkill,
        } = await import("../../../shared/skill-loader.js");

        const subCommand = rest[0]?.toLowerCase();

        // /skill or /skill list — show installed skills
        if (!subCommand || subCommand === "list") {
          const skills = await listSkills();
          if (skills.length === 0) {
            await safeSend(
              metadata,
              "No skills installed.\nCreate one: /skill create <name> <description>",
            );
            return;
          }

          const buttons: KeyboardLayout = [];
          let row: Array<{ label: string; data: string }> = [];
          for (const skill of skills) {
            const indicator = skill.userInvocable ? "\u25CF" : "";
            const label = indicator ? `${skill.name} ${indicator}` : skill.name;
            row.push({ label, data: `/skill ${skill.name}` });
            if (row.length === 3) {
              buttons.push(row);
              row = [];
            }
          }
          if (row.length > 0) buttons.push(row);

          const header = `Skills (${skills.length} installed)\n\u25CF = user-invocable\nTap for details:`;
          await safeKeyboard(metadata, header, buttons);
          return;
        }

        // /skill create <name> <description>
        if (subCommand === "create") {
          const skillName = rest[1];
          const skillDescription = rest.slice(2).join(" ").trim();

          if (!skillName || !skillDescription) {
            await safeSend(
              metadata,
              "Usage: /skill create <name> <description>\n\nName: lowercase alphanumeric + hyphens, 2-50 chars\nDescription: minimum 10 characters",
            );
            return;
          }

          try {
            const skillDir = await scaffoldSkill(skillName, skillDescription);
            await safeSend(
              metadata,
              `Skill created: ${skillName}\nPath: ${skillDir}\n\nEdit SKILL.md to add instructions, then validate:\n/skill ${skillName}`,
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            await safeSend(metadata, `Failed to create skill: ${msg}`);
          }
          return;
        }

        // /skill remove <name>
        if (subCommand === "remove" || subCommand === "delete") {
          const skillName = rest[1];
          if (!skillName) {
            await safeSend(metadata, "Usage: /skill remove <name>");
            return;
          }

          try {
            await removeSkill(skillName);
            await safeSend(metadata, `Skill removed: ${skillName}`);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            await safeSend(metadata, `Failed to remove skill: ${msg}`);
          }
          return;
        }

        // /skill <name> — show skill details
        try {
          const manifest = await loadSkill(subCommand);
          const lines = [
            `${manifest.meta.name}`,
            manifest.meta.description,
            "",
            `user-invocable: ${manifest.meta.userInvocable ?? false}`,
          ];
          if (manifest.meta.allowedTools?.length) {
            lines.push(`allowed-tools: ${manifest.meta.allowedTools.join(", ")}`);
          }
          if (manifest.meta.license) {
            lines.push(`license: ${manifest.meta.license}`);
          }
          lines.push(`scripts: ${manifest.hasScripts ? "yes" : "no"}`);
          lines.push(`references: ${manifest.hasReferences ? "yes" : "no"}`);
          lines.push(`templates: ${manifest.hasTemplates ? "yes" : "no"}`);

          if (manifest.body) {
            lines.push("");
            // Truncate body for Telegram's 4096 char limit (leave room for header)
            const maxBodyLen = 2000;
            const body = manifest.body.length > maxBodyLen
              ? manifest.body.slice(0, maxBodyLen) + "\n\n... (truncated)"
              : manifest.body;
            lines.push(body);
          }

          await safeSend(metadata, lines.join("\n"));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await safeSend(metadata, `Skill not found: ${subCommand}\n${msg}`);
        }
        return;
      }

      case "share": {
        const {
          createShare,
          listSharesBySession,
          revokeShare,
        } = await import("../../storage/share.js");
        const { buildShareLink } = await import("../../../shared/urls.js");

        const subCommand = rest[0]?.toLowerCase();

        // /share revoke <share-id>
        if (subCommand === "revoke") {
          const shareId = rest[1];
          if (!shareId) {
            await safeSend(metadata, "Usage: /share revoke <share-id>");
            return;
          }
          const revoked = revokeShare(shareId);
          if (!revoked) {
            await safeSend(metadata, "Share not found or already revoked.");
            return;
          }
          await safeSend(metadata, `Share revoked: ${shareId}`);
          return;
        }

        // /share list — show active shares for the current session
        if (subCommand === "list") {
          const shares = listSharesBySession(state.sessionId);
          if (shares.length === 0) {
            await safeSend(metadata, "No active shares for this session.");
            return;
          }

          const buttons: KeyboardLayout = [];
          const lines: string[] = [];
          for (const s of shares) {
            const url = buildShareLink(s.share_id);
            const age = formatAge(s.created_at);
            lines.push(`${s.share_id} — ${age}`);
            lines.push(url);
            buttons.push([
              { label: `Revoke ${s.share_id}`, data: `/share revoke ${s.share_id}` },
            ]);
          }

          await safeKeyboard(
            metadata,
            [`Active shares (${shares.length}):`, ...lines].join("\n"),
            buttons,
          );
          return;
        }

        // /share — create a share of the current session.
        // Session binding is persisted in KV store, so the correct session
        // is always resolved — even across daemon restarts.
        const messages = getMessages(state.sessionId);
        if (messages.length === 0) {
          await safeSend(metadata, "No messages in this session. Have a conversation first, then use /share.");
          return;
        }

        const currentSession = getSession(state.sessionId);
        const snapshot = messages.map((m) => ({
          role: m.role,
          content: m.content,
          created_at: m.created_at,
        }));

        const share = createShare({
          sessionId: state.sessionId,
          title: currentSession?.title ?? `Channel ${chatId}`,
          model: state.model,
          messages: JSON.stringify(snapshot),
        });

        const shareUrl = buildShareLink(share.share_id);

        await safeKeyboard(
          metadata,
          `Shared (${snapshot.length} messages):\n${shareUrl}\n\nExpires in 30 days.`,
          [
            [
              { label: "Revoke", data: `/share revoke ${share.share_id}` },
              { label: "List Shares", data: "/share list" },
            ],
          ],
        );
        return;
      }

      case "notifications":
      case "notify": {
        const notifyKey = `notify:${metadata.channel}:${chatId}`;
        const subCommand = rest[0]?.toLowerCase();

        if (subCommand === "on" || subCommand === "enable") {
          kvSet(notifyKey, true);
          await safeSend(metadata, "Notifications enabled for this chat.");
          return;
        }
        if (subCommand === "off" || subCommand === "disable") {
          kvSet(notifyKey, false);
          await safeSend(metadata, "Notifications disabled for this chat.");
          return;
        }

        // Show current state + toggle button
        const current = kvGet<boolean>(notifyKey) ?? true; // default: on
        const toggleAction = current ? "off" : "on";
        const toggleLabel = current ? "Disable" : "Enable";

        await safeKeyboard(
          metadata,
          `Notifications: ${current ? "ON ●" : "OFF ○"}\n\nTrigger and system notifications for this chat.`,
          [
            [{ label: `${toggleLabel} Notifications`, data: `/notifications ${toggleAction}` }],
          ],
        );
        return;
      }

      case "channels": {
        const channelList = opts.channels.status();
        const subCommand = rest[0]?.toLowerCase();
        const channelArg = rest[1]?.toLowerCase();

        // /channels connect <name>
        if (subCommand === "connect") {
          if (!channelArg) {
            await safeSend(metadata, "Usage: /channels connect <channel-name>");
            return;
          }
          try {
            await opts.channels.connect(channelArg);
            await safeSend(metadata, `Channel connected: ${channelArg}`);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            await safeSend(metadata, `Failed to connect ${channelArg}: ${msg}`);
          }
          return;
        }

        // /channels disconnect <name>
        if (subCommand === "disconnect") {
          if (!channelArg) {
            await safeSend(metadata, "Usage: /channels disconnect <channel-name>");
            return;
          }
          // Prevent disconnecting the channel you're currently on
          if (channelArg === metadata.channel) {
            await safeSend(metadata, `Cannot disconnect ${channelArg} — you're using it right now.`);
            return;
          }
          try {
            await opts.channels.disconnect(channelArg);
            await safeSend(metadata, `Channel disconnected: ${channelArg}`);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            await safeSend(metadata, `Failed to disconnect ${channelArg}: ${msg}`);
          }
          return;
        }

        // /channels or /channels list — show all with action buttons
        if (channelList.length === 0) {
          await safeSend(metadata, "No messaging channels registered.\nConfigure channels in ~/.config/jeriko/config.json and restart the daemon.");
          return;
        }

        const channelButtons: KeyboardLayout = [];
        const channelLines: string[] = [];
        for (const ch of channelList) {
          const icon = ch.status === "connected" ? "●" : ch.status === "failed" ? "✗" : "○";
          const extra = ch.connected_at ? ` — since ${formatAge(new Date(ch.connected_at).getTime())}` : "";
          const errMsg = ch.error ? ` (${ch.error})` : "";
          channelLines.push(`${icon} ${ch.name} — ${ch.status}${extra}${errMsg}`);

          // Don't show disconnect button for the channel the user is on
          if (ch.status === "connected" && ch.name !== metadata.channel) {
            channelButtons.push([{ label: `Disconnect ${ch.name}`, data: `/channels disconnect ${ch.name}` }]);
          } else if (ch.status !== "connected") {
            channelButtons.push([{ label: `Connect ${ch.name}`, data: `/channels connect ${ch.name}` }]);
          }
        }

        const connected = channelList.filter((c) => c.status === "connected").length;
        const header = `Channels: ${connected}/${channelList.length} connected\n● = connected, ○ = disconnected, ✗ = failed\n\n${channelLines.join("\n")}`;

        if (channelButtons.length > 0) {
          await safeKeyboard(metadata, header, channelButtons);
        } else {
          await safeSend(metadata, header);
        }
        return;
      }

      case "history": {
        // Clamp to 1-50 to stay within Telegram message limits.
        // 50 messages × ~120 chars each ≈ 6000 chars → sendLong splits at 3900.
        const MAX_HISTORY = 50;
        const requestedLimit = arg ? parseInt(arg, 10) : 10;
        const historyLimit = Math.max(1, Math.min(requestedLimit || 10, MAX_HISTORY));

        const msgs = getMessages(state.sessionId);
        const recentMsgs = msgs.slice(-historyLimit);
        if (recentMsgs.length === 0) {
          await safeSend(metadata, "No messages in this session.");
          return;
        }

        // Truncate per-message preview to keep total size manageable.
        // At 50 messages × 120 chars = ~6k, sendLong handles the split.
        const MAX_PREVIEW = 120;
        const historyLines: string[] = [`Last ${recentMsgs.length} of ${msgs.length} messages:`];
        for (const m of recentMsgs) {
          const role = m.role === "user" ? "You" : "AI";
          const preview = m.content.length > MAX_PREVIEW
            ? m.content.slice(0, MAX_PREVIEW) + "…"
            : m.content;
          // Replace newlines in preview to keep it compact
          historyLines.push(`\n${role}: ${preview.replace(/\n/g, " ")}`);
        }
        await safeSend(metadata, historyLines.join("\n"));
        return;
      }

      case "compact": {
        // /compact [n] — keep the last n messages, default 10.
        const DEFAULT_KEEP = 10;
        const MAX_KEEP = 100;
        const requestedKeep = arg ? parseInt(arg, 10) : DEFAULT_KEEP;
        const keepCount = Math.max(1, Math.min(requestedKeep || DEFAULT_KEEP, MAX_KEEP));

        const msgs = getMessages(state.sessionId);
        if (msgs.length <= keepCount) {
          await safeSend(metadata, `Session has ${msgs.length} message(s), keeping ${keepCount} — nothing to compact.`);
          return;
        }

        const oldCount = msgs.length - keepCount;
        clearMessages(state.sessionId);
        const recentToKeep = msgs.slice(-keepCount);
        for (const m of recentToKeep) {
          addMessage(state.sessionId, m.role as "user" | "assistant" | "system" | "tool", m.content);
        }
        await safeSend(
          metadata,
          `Compacted: removed ${oldCount} old messages, kept ${keepCount} recent.`,
        );
        return;
      }

      case "tasks":
      case "task": {
        const tasksDir = join(homedir(), ".jeriko", "data", "tasks");
        const subCommand = rest[0]?.toLowerCase();

        // /tasks enable <id>
        if (subCommand === "enable") {
          const taskId = rest[1];
          if (!taskId) { await safeSend(metadata, "Usage: /tasks enable <task-id>"); return; }
          const updated = updateTaskField(tasksDir, taskId, "enabled", true);
          if (!updated) { await safeSend(metadata, `Task not found: ${taskId}`); return; }
          await safeSend(metadata, `Task enabled: ${updated.name ?? taskId}`);
          return;
        }

        // /tasks disable <id>
        if (subCommand === "disable") {
          const taskId = rest[1];
          if (!taskId) { await safeSend(metadata, "Usage: /tasks disable <task-id>"); return; }
          const updated = updateTaskField(tasksDir, taskId, "enabled", false);
          if (!updated) { await safeSend(metadata, `Task not found: ${taskId}`); return; }
          await safeSend(metadata, `Task disabled: ${updated.name ?? taskId}`);
          return;
        }

        // /tasks create <name> <command>
        if (subCommand === "create") {
          const taskName = rest[1];
          const taskCommand = rest.slice(2).join(" ").trim();
          if (!taskName || !taskCommand) {
            await safeSend(metadata, "Usage: /tasks create <name> <command>\n\nExample: /tasks create backup tar -czf ~/backup.tar.gz ~/data");
            return;
          }
          const { randomUUID } = await import("node:crypto");
          mkdirSync(tasksDir, { recursive: true });
          const taskDef = {
            id: randomUUID().slice(0, 8),
            name: taskName,
            type: "once",
            command: taskCommand,
            enabled: true,
            created_at: new Date().toISOString(),
          };
          writeFileSync(join(tasksDir, `${taskDef.id}.json`), JSON.stringify(taskDef, null, 2) + "\n");
          await safeSend(metadata, `Task created: ${taskDef.name} (${taskDef.id})\nCommand: ${taskCommand}\n\nUse /tasks to manage.`);
          return;
        }

        // /tasks delete <id>
        if (subCommand === "delete" || subCommand === "remove") {
          const taskId = rest[1];
          if (!taskId) { await safeSend(metadata, "Usage: /tasks delete <task-id>"); return; }
          const taskPath = join(tasksDir, `${taskId}.json`);
          if (!existsSync(taskPath)) { await safeSend(metadata, `Task not found: ${taskId}`); return; }
          unlinkSync(taskPath);
          await safeSend(metadata, `Task deleted: ${taskId}`);
          return;
        }

        // /tasks run <id>
        if (subCommand === "run") {
          const taskId = rest[1];
          if (!taskId) { await safeSend(metadata, "Usage: /tasks run <task-id>"); return; }
          const task = loadTaskSafe(tasksDir, taskId);
          if (!task) { await safeSend(metadata, `Task not found: ${taskId}`); return; }
          await safeSend(metadata, `Running: ${task.name}...`);
          try {
            const { execSync } = await import("node:child_process");
            const output = execSync(task.command, { encoding: "utf-8", timeout: 60_000 });
            // Update last_run timestamp
            updateTaskField(tasksDir, taskId, "last_run", new Date().toISOString());
            const preview = output.trim().slice(0, 500) || "(no output)";
            await safeSend(metadata, `Task completed: ${task.name}\n\n${preview}`);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            await safeSend(metadata, `Task failed: ${task.name}\n\n${msg.slice(0, 500)}`);
          }
          return;
        }

        // /tasks <id> — show single task detail
        if (subCommand && subCommand !== "list") {
          const task = loadTaskSafe(tasksDir, subCommand);
          if (task) {
            const taskDetailLines = [
              `${task.name} (${task.id})`,
              `type: ${task.type}`,
              `enabled: ${task.enabled}`,
              `command: ${task.command}`,
              `created: ${task.created_at}`,
              task.last_run ? `last run: ${formatAge(new Date(task.last_run).getTime())}` : "last run: never",
              task.schedule ? `schedule: ${task.schedule}` : "",
            ].filter(Boolean);
            await safeKeyboard(
              metadata,
              taskDetailLines.join("\n"),
              [
                [
                  task.enabled
                    ? { label: "Disable", data: `/tasks disable ${task.id}` }
                    : { label: "Enable", data: `/tasks enable ${task.id}` },
                  { label: "Run Now", data: `/tasks run ${task.id}` },
                  { label: "Delete", data: `/tasks delete ${task.id}` },
                ],
              ],
            );
            return;
          }
          // Fall through to list if not a valid task ID
        }

        // /tasks or /tasks list — show all tasks
        const tasks = loadAllTasksSafe(tasksDir);
        if (tasks.length === 0) {
          await safeSend(metadata, "No tasks configured.\nCreate one: /tasks create <name> <command>");
          return;
        }

        const taskButtons: KeyboardLayout = [];
        const taskLines: string[] = [];
        for (const t of tasks) {
          const enabled = t.enabled ? "●" : "○";
          const lastRun = t.last_run ? formatAge(new Date(t.last_run).getTime()) : "never";
          taskLines.push(`${enabled} ${t.name} (${t.id}) — ${t.type} — last: ${lastRun}`);
          taskButtons.push([{ label: t.name, data: `/tasks ${t.id}` }]);
        }

        await safeKeyboard(
          metadata,
          [`Tasks (${tasks.length}):`, ...taskLines].join("\n") + "\n\n● = enabled, ○ = disabled\nTap for details:",
          taskButtons,
        );
        return;
      }

      case "triggers":
      case "trigger": {
        const engine = opts.getTriggerEngine?.();
        if (!engine) {
          await safeSend(metadata, "Trigger engine not available.");
          return;
        }

        const subCommand = rest[0]?.toLowerCase();

        // /triggers enable <id>
        if (subCommand === "enable") {
          const triggerId = rest[1];
          if (!triggerId) {
            await safeSend(metadata, "Usage: /triggers enable <trigger-id>");
            return;
          }
          const ok = engine.enable(triggerId);
          await safeSend(metadata, ok ? `Trigger enabled: ${triggerId}` : `Trigger not found: ${triggerId}`);
          return;
        }

        // /triggers disable <id>
        if (subCommand === "disable") {
          const triggerId = rest[1];
          if (!triggerId) {
            await safeSend(metadata, "Usage: /triggers disable <trigger-id>");
            return;
          }
          const ok = engine.disable(triggerId);
          await safeSend(metadata, ok ? `Trigger disabled: ${triggerId}` : `Trigger not found: ${triggerId}`);
          return;
        }

        // /triggers or /triggers list — show all triggers
        const triggers = engine.listAll();
        if (triggers.length === 0) {
          await safeSend(metadata, "No triggers configured.");
          return;
        }

        const buttons: KeyboardLayout = [];
        const lines: string[] = [];
        for (const t of triggers) {
          const enabled = t.enabled ? "●" : "○";
          const runs = t.run_count ?? 0;
          const lastFired = t.last_fired ? formatAge(new Date(t.last_fired).getTime()) : "never";
          lines.push(`${enabled} ${t.label ?? t.id} — ${t.type} — ${runs} runs — ${lastFired}`);

          const action = t.enabled
            ? { label: `Disable ${t.label ?? t.id}`, data: `/triggers disable ${t.id}` }
            : { label: `Enable ${t.label ?? t.id}`, data: `/triggers enable ${t.id}` };
          buttons.push([action]);
        }

        await safeKeyboard(
          metadata,
          [`Triggers (${triggers.length}):`, ...lines].join("\n") + "\n\n● = enabled, ○ = disabled",
          buttons,
        );
        return;
      }

      default:
        await safeSend(metadata, `Unknown: /${command}\nUse /help`);
    }
  }

  // ── Send/edit helpers ─────────────────────────────────────────────

  async function safeSend(
    metadata: MessageMetadata,
    text: string,
  ): Promise<void> {
    try {
      await opts.channels.send(metadata.channel, metadata.chat_id, text);
    } catch (err) {
      log.error(
        `Send failed (${metadata.channel}:${metadata.chat_id}): ${String(err)}`,
      );
    }
  }

  async function safeKeyboard(
    metadata: MessageMetadata,
    text: string,
    keyboard: KeyboardLayout,
  ): Promise<void> {
    try {
      await opts.channels.sendKeyboard(metadata.channel, metadata.chat_id, text, keyboard);
    } catch (err) {
      // Fallback to plain text if keyboard fails
      log.debug(`Keyboard send failed, falling back to text: ${String(err)}`);
      await safeSend(metadata, text);
    }
  }

  async function editSafe(
    metadata: MessageMetadata,
    messageId: string | number,
    text: string,
  ): Promise<void> {
    try {
      await opts.channels.editMessage(
        metadata.channel,
        metadata.chat_id,
        messageId,
        text,
      );
    } catch (err) {
      log.debug(`Edit failed (${metadata.channel}:${metadata.chat_id}): ${String(err)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Task file helpers — safe JSON reads with error handling
// ---------------------------------------------------------------------------

interface TaskDef {
  id: string;
  name: string;
  type: string;
  schedule?: string;
  command: string;
  enabled: boolean;
  created_at: string;
  last_run?: string;
}

/** Load a single task by ID, returning null on missing or malformed files. */
function loadTaskSafe(tasksDir: string, taskId: string): TaskDef | null {
  const taskPath = join(tasksDir, `${taskId}.json`);
  if (!existsSync(taskPath)) return null;
  try {
    return JSON.parse(readFileSync(taskPath, "utf-8")) as TaskDef;
  } catch {
    log.warn(`Malformed task file: ${taskId}.json`);
    return null;
  }
}

/** Load all tasks from the file store, skipping malformed files. */
function loadAllTasksSafe(tasksDir: string): TaskDef[] {
  if (!existsSync(tasksDir)) return [];
  try {
    const files = readdirSync(tasksDir).filter((f) => f.endsWith(".json"));
    return files
      .map((f) => {
        try {
          return JSON.parse(readFileSync(join(tasksDir, f), "utf-8")) as TaskDef;
        } catch {
          log.warn(`Malformed task file: ${f}`);
          return null;
        }
      })
      .filter((t): t is TaskDef => t !== null);
  } catch (err) {
    log.error(`Failed to read tasks directory: ${err}`);
    return [];
  }
}

/** Update a single field on a task file. Returns the updated task or null. */
function updateTaskField(
  tasksDir: string,
  taskId: string,
  field: string,
  value: unknown,
): TaskDef | null {
  const task = loadTaskSafe(tasksDir, taskId);
  if (!task) return null;
  (task as Record<string, unknown>)[field] = value;
  try {
    writeFileSync(join(tasksDir, `${taskId}.json`), JSON.stringify(task, null, 2) + "\n");
    return task;
  } catch (err) {
    log.error(`Failed to update task ${taskId}: ${err}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Connector health check — uses shared registry (single source of truth)
// ---------------------------------------------------------------------------

async function checkConnectorHealth(name: string): Promise<{ healthy: boolean; latency: number; error: string }> {
  try {
    const { loadConnector } = await import("../connectors/registry.js");
    const connector = await loadConnector(name);
    const result = await connector.health();
    return {
      healthy: result.healthy,
      latency: result.latency_ms,
      error: result.error ?? "",
    };
  } catch (err) {
    return {
      healthy: false,
      latency: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function formatAge(timestampMs: number): string {
  const diffMs = Date.now() - timestampMs;
  if (diffMs < 0) return "just now"; // future timestamps (clock skew)
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDuration(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
}
