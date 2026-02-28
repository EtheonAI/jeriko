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

import type { ChannelRegistry, MessageMetadata } from "./index.js";
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
import { resolveModel, getCapabilities } from "../../agent/drivers/models.js";
import { existsSync } from "node:fs";

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

export interface ChannelRouterOptions {
  channels: ChannelRegistry;
  defaultModel: string;
  maxTokens: number;
  temperature: number;
  extendedThinking: boolean;
  /** System prompt from AGENT.md — Jeriko identity and commands. */
  systemPrompt?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getProviderName(alias: string): string {
  try {
    return getDriver(alias).name;
  } catch {
    return alias;
  }
}

function describeModel(alias: string): string {
  const provider = getProviderName(alias);
  const resolvedId = resolveModel(provider, alias);
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

  // ── Restore sessions from DB on boot ────────────────────────────────
  try {
    const sessions = listSessions(200);
    for (const s of sessions) {
      const match = s.title.match(/^Channel (.+)$/);
      if (match) {
        const chatId = match[1]!;
        if (!sessionsByChat.has(chatId)) {
          sessionsByChat.set(chatId, {
            sessionId: s.id,
            model: s.model ?? opts.defaultModel,
          });
        }
      }
    }
    if (sessionsByChat.size > 0) {
      log.info(`Router: restored ${sessionsByChat.size} chat sessions from DB`);
    }
  } catch (err) {
    log.warn(`Router: failed to restore sessions: ${err}`);
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
    const prev = chatQueues.get(chatId) ?? Promise.resolve();
    const next = prev.then(() =>
      processMessage(chatId, text, metadata).catch((err) => {
        log.error(`Router unhandled error for chat ${chatId}: ${err}`);
      }),
    );
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

      const state = getOrCreateState(chatId);
      addMessage(state.sessionId, "user", augmentedText);

      const history = getMessages(state.sessionId).map<DriverMessage>((m) => ({
        role: m.role as DriverMessage["role"],
        content: m.content,
      }));

      const provider = getProviderName(state.model);
      const resolvedId = resolveModel(provider, state.model);
      const caps = getCapabilities(provider, resolvedId);

      const runConfig: AgentRunConfig = {
        sessionId: state.sessionId,
        backend: state.model,
        model: state.model,
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

  function getOrCreateState(chatId: string): ChatState {
    const existing = sessionsByChat.get(chatId);
    if (existing) return existing;

    const session = createSession({
      title: `Channel ${chatId}`,
      model: opts.defaultModel,
    });
    const state: ChatState = {
      sessionId: session.id,
      model: opts.defaultModel,
    };
    sessionsByChat.set(chatId, state);
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
    const state = getOrCreateState(chatId);

    switch (command) {
      case "start":
      case "help":
      case "commands":
        await safeSend(
          metadata,
          [
            "Jeriko commands:",
            "",
            "Session:",
            "  /new — Start fresh session",
            "  /stop — Stop current processing",
            "  /clear — Clear session history",
            "  /kill — Delete session and start fresh",
            "  /session — Session info",
            "  /sessions — List recent sessions",
            "  /switch <id> — Resume a session",
            "  /archive — Archive current session",
            "",
            "Model:",
            "  /model — Show current model",
            "  /model <name> — Switch model",
            "",
            "Integrations:",
            "  /connectors — Show all connectors",
            "  /connect <name> — OAuth login (GitHub, X, etc.)",
            "  /disconnect <name> — Remove OAuth token",
            "  /auth <name> — Configure API keys",
            "  /health <name> — Test connectivity",
            "",
            "System:",
            "  /status — Daemon status",
            "  /sys — System info",
            "",
            `Models: ${listDrivers().join(", ")}`,
          ].join("\n"),
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
        deleteSession(state.sessionId);
        const session = createSession({
          title: `Channel ${chatId}`,
          model: state.model,
        });
        sessionsByChat.set(chatId, {
          sessionId: session.id,
          model: state.model,
        });
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
        const lines = recent.map((s) => {
          const active = s.id === state.sessionId ? " (active)" : "";
          const age = formatAge(s.updated_at);
          return `${s.slug}${active} — ${s.model ?? "?"} — ${age}`;
        });
        await safeSend(metadata, ["Recent sessions:", ...lines].join("\n"));
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
        sessionsByChat.set(chatId, {
          sessionId: target.id,
          model: target.model ?? opts.defaultModel,
        });
        await safeSend(metadata, `Switched to session: ${target.slug} (${target.id})`);
        return;
      }

      case "archive": {
        archiveSession(state.sessionId);
        const session = createSession({
          title: `Channel ${chatId}`,
          model: state.model,
        });
        sessionsByChat.set(chatId, {
          sessionId: session.id,
          model: state.model,
        });
        await safeSend(metadata, `Archived. New session: ${session.id}`);
        return;
      }

      case "model":
      case "models": {
        if (!arg) {
          await safeSend(
            metadata,
            [
              describeModel(state.model),
              "",
              "Switch: /model <name>",
              `Available: ${listDrivers().join(", ")}`,
            ].join("\n"),
          );
          return;
        }

        try {
          getDriver(arg);
        } catch {
          await safeSend(
            metadata,
            `Unknown model: ${arg}\nAvailable: ${listDrivers().join(", ")}`,
          );
          return;
        }

        state.model = arg;
        sessionsByChat.set(chatId, state);
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

        // No args — show all connectors with connect/auth guidance
        if (!connectorName) {
          const lines = ["Connectors:"];
          for (const def of CONNECTOR_DEFS) {
            const ready = isConnectorConfigured(def.name);
            const oauth = isOAuthCapable(def.name);
            if (ready) {
              lines.push(`  \u25CF ${def.label} \u2014 connected`);
            } else if (oauth) {
              lines.push(`  \u25CB ${def.label} \u2014 /connect ${def.name}`);
            } else {
              lines.push(`  \u25CB ${def.label} \u2014 /auth ${def.name}`);
            }
          }
          lines.push("");
          lines.push(`OAuth: ${OAUTH_PROVIDERS.map((p) => p.name).join(", ")}`);
          lines.push(`API key: /auth <name> <key>`);
          await safeSend(metadata, lines.join("\n"));
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
          await safeSend(metadata, "Usage: /disconnect <name>\nExample: /disconnect github");
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
        const lines = ["Connectors:"];
        let configuredCount = 0;
        for (const def of CONNECTOR_DEFS) {
          const ready = isConnectorConfigured(def.name);
          if (ready) configuredCount++;
          const oauth = isOAuthCapable(def.name);
          const hint = ready ? "ready" : oauth ? `/connect ${def.name}` : `/auth ${def.name}`;
          lines.push(`  ${ready ? "\u25CF" : "\u25CB"} ${def.label} \u2014 ${hint}`);
        }
        lines.push("");
        lines.push(`${configuredCount}/${CONNECTOR_DEFS.length} configured`);
        if (configuredCount < CONNECTOR_DEFS.length) {
          lines.push("Use /connect or /auth to set up a connector.");
        }
        await safeSend(metadata, lines.join("\n"));
        return;
      }

      case "auth": {
        const {
          CONNECTOR_DEFS, getConnectorDef, isConnectorConfigured,
          primaryVarName, isSlotSet, slotLabel,
        } = await import("../../../shared/connector.js");
        const { saveSecret } = await import("../../../shared/secrets.js");

        const connectorName = rest[0]?.toLowerCase();

        // No args — show all connectors with auth instructions
        if (!connectorName) {
          const lines = ["Configure a connector:"];
          for (const def of CONNECTOR_DEFS) {
            const ready = isConnectorConfigured(def.name);
            lines.push(`  ${ready ? "\u25CF" : "\u25CB"} /auth ${def.name} \u2014 ${def.description}`);
          }
          await safeSend(metadata, lines.join("\n"));
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

        // No args — health check all configured connectors
        if (!connectorName) {
          const configured = CONNECTOR_DEFS.filter((d) => isConnectorConfigured(d.name));
          if (configured.length === 0) {
            await safeSend(metadata, "No connectors configured. Use /auth <name> to set one up.");
            return;
          }

          const lines = ["Health check:"];
          for (const def of configured) {
            const result = await checkConnectorHealth(def.name);
            lines.push(`  ${result.healthy ? "\u2705" : "\u274C"} ${def.label} \u2014 ${result.healthy ? `${result.latency}ms` : result.error}`);
          }
          await safeSend(metadata, lines.join("\n"));
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
// Connector health check — on-demand initialization + health call
// ---------------------------------------------------------------------------

type ConnectorFactory = () => Promise<{
  new(): { init(): Promise<void>; health(): Promise<{ healthy: boolean; latency_ms: number; error?: string }> };
}>;

const CONNECTOR_FACTORIES: Record<string, ConnectorFactory> = {
  stripe:   async () => (await import("../connectors/stripe/connector.js")).StripeConnector,
  paypal:   async () => (await import("../connectors/paypal/connector.js")).PayPalConnector,
  github:   async () => (await import("../connectors/github/connector.js")).GitHubConnector,
  twilio:   async () => (await import("../connectors/twilio/connector.js")).TwilioConnector,
  vercel:   async () => (await import("../connectors/vercel/connector.js")).VercelConnector,
  x:        async () => (await import("../connectors/x/connector.js")).XConnector,
  gdrive:   async () => (await import("../connectors/gdrive/connector.js")).GDriveConnector,
  onedrive: async () => (await import("../connectors/onedrive/connector.js")).OneDriveConnector,
};

async function checkConnectorHealth(name: string): Promise<{ healthy: boolean; latency: number; error: string }> {
  const loader = CONNECTOR_FACTORIES[name];
  if (!loader) return { healthy: false, latency: 0, error: "Unknown connector" };

  try {
    const ConnectorClass = await loader();
    const connector = new ConnectorClass();
    await connector.init();
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
