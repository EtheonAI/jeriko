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
import { orchestratorBus } from "../../agent/orchestrator.js";
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
import type { DriverMessage, ContentBlock } from "../../agent/drivers/index.js";
import { listDrivers, getDriver } from "../../agent/drivers/index.js";
import { resolveModel, getCapabilities, parseModelSpec, listModels } from "../../agent/drivers/models.js";
import {
  bindSession,
  getBinding,
  updateBindingModel,
  unbindSession,
  restoreBindings,
} from "./binding.js";
import { kvGet, kvSet } from "../../storage/kv.js";
import type { STTConfig, TTSConfig } from "../../../shared/config.js";
import {
  EVENT_TRIGGER_TYPES,
  WEBHOOK_SERVICES,
  isEventTrigger,
} from "../triggers/task-adapter.js";
import { existsSync, readdirSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";

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
  /** Lazy accessor for connector manager (created after router in kernel boot). */
  getConnectors?: () => import("../connectors/manager.js").ConnectorManager | null;
  /** Speech-to-text config — auto-transcribe incoming voice messages. */
  sttConfig?: STTConfig;
  /** Text-to-speech config — optionally send voice responses. */
  ttsConfig?: TTSConfig;
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

    const unsubs: Array<() => void> = [];
    let statusTimer: ReturnType<typeof setInterval> | null = null;

    try {
      // Download attachments, transcribe voice, and build vision content blocks.
      let augmentedText = text;
      let visionBlocks: ContentBlock[] | null = null;
      let hadVoiceInput = false;

      if (metadata.attachments?.length) {
        const fileParts: string[] = [];
        const imageBlocks: ContentBlock[] = [];

        for (const att of metadata.attachments) {
          try {
            const localPath = await opts.channels.downloadFile(
              metadata.channel,
              att.fileId,
              att.filename,
            );

            // Voice messages: auto-transcribe via STT if configured and not disabled
            if ((att.type === "voice" || att.type === "audio") && opts.sttConfig && opts.sttConfig.provider !== "disabled") {
              const transcription = await transcribeAttachment(localPath, opts.sttConfig);
              if (transcription) {
                hadVoiceInput = true;
                fileParts.push(`[Transcribed ${att.type}]: ${transcription}`);
                continue;
              }
            }

            // Photos: collect for vision (base64 + content blocks)
            if (att.type === "photo") {
              try {
                const imageData = readFileSync(localPath);
                const base64 = imageData.toString("base64");
                const ext = localPath.split(".").pop()?.toLowerCase() ?? "jpg";
                const mediaType = ext === "png" ? "image/png"
                  : ext === "webp" ? "image/webp"
                  : ext === "gif" ? "image/gif"
                  : "image/jpeg";

                imageBlocks.push({
                  type: "image",
                  data: base64,
                  mediaType,
                });
              } catch (err) {
                log.debug(`Vision: failed to read image ${localPath}: ${err}`);
              }
            }

            const desc = att.caption
              ? `User sent a ${att.type} (saved to ${localPath}). Caption: ${att.caption}`
              : `User sent a ${att.type} (saved to ${localPath}).`;
            fileParts.push(desc);
          } catch (err) {
            log.warn(`Failed to download attachment: ${err}`);
            fileParts.push(`User sent a ${att.type} (download failed).`);
          }
        }

        augmentedText = fileParts.length > 0
          ? fileParts.join("\n") + "\n\n" + text
          : text;

        // Build vision content blocks if we have images
        if (imageBlocks.length > 0) {
          visionBlocks = [
            ...imageBlocks,
            { type: "text" as const, text: augmentedText },
          ];
        }
      }

      const state = getOrCreateState(chatId, metadata.channel);
      // Persist the text representation in DB (images are transient — too large for SQLite)
      addMessage(state.sessionId, "user", augmentedText);

      // Build driver message history from DB
      const history = getMessages(state.sessionId).map<DriverMessage>((m) => ({
        role: m.role as DriverMessage["role"],
        content: m.content,
      }));

      // Resolve model capabilities once — used for vision gating and agent config
      const { backend: modelBackend, model: modelId } = parseModelSpec(state.model);
      const provider = getProviderName(modelBackend);
      const resolvedId = resolveModel(provider, modelId);
      const caps = getCapabilities(provider, resolvedId);

      // Replace the last user message's content with vision blocks if available
      // AND the model supports vision. Otherwise keep text-only (graceful fallback).
      if (visionBlocks && caps.vision && history.length > 0) {
        history[history.length - 1]!.content = visionBlocks;
        log.debug(`Vision: passing ${visionBlocks.filter((b) => b.type === "image").length} image(s) to ${resolvedId}`);
      }

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

      // Subscribe to orchestratorBus for live sub-agent events.
      // Without this, sub-agent activity (delegate, parallel_tasks) is invisible
      // and the channel shows "Thinking..." indefinitely until timeout.
      let lastStatusLabel = "";
      unsubs.push(orchestratorBus.on("sub:started", (d) => {
        statusLabel = `Sub-agent: ${d.label}`;
      }));
      unsubs.push(orchestratorBus.on("sub:tool_call", (d) => {
        statusLabel = `Sub-agent → ${d.toolName}`;
      }));
      unsubs.push(orchestratorBus.on("sub:tool_result", () => {
        // Keep sub-agent label active — next event will update
      }));
      unsubs.push(orchestratorBus.on("sub:complete", (d) => {
        statusLabel = d.status === "error"
          ? `Sub-agent failed: ${d.label}`
          : "";
      }));

      // Periodic status update — pushes live edits even when runAgent is blocked
      // waiting for sub-agent/tool completion (generator yields nothing during delegation).
      statusTimer = setInterval(async () => {
        if (!sent?.messageId || controller.signal.aborted) return;
        if (statusLabel === lastStatusLabel) return; // no change — skip edit
        lastStatusLabel = statusLabel;
        const preview = buildPreview(response, statusLabel);
        await editSafe(metadata, sent.messageId, preview);
        lastEditAt = Date.now();
      }, EDIT_INTERVAL_MS);

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

        // Debounced live edit — for events from the generator
        const now = Date.now();
        if (sent?.messageId && now - lastEditAt >= EDIT_INTERVAL_MS) {
          lastStatusLabel = statusLabel;
          const preview = buildPreview(response, statusLabel);
          await editSafe(metadata, sent.messageId, preview);
          lastEditAt = now;
        }
      }

      clearInterval(statusTimer);

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

      // TTS: optionally convert response to voice message.
      // Auto-enable when user sent voice (conversational mode) OR when TTS is configured.
      if (response) {
        await sendVoiceResponse(metadata, response, hadVoiceInput);
      }
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
      unsubs.forEach((u) => u());
      if (statusTimer) clearInterval(statusTimer);
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

  // ── Voice transcription (STT) ───────────────────────────────────────

  async function transcribeAttachment(
    localPath: string,
    sttConfig?: STTConfig,
  ): Promise<string | null> {
    if (!sttConfig || sttConfig.provider === "disabled") return null;
    try {
      const { transcribe } = await import("../media/stt.js");
      return await transcribe(localPath, sttConfig);
    } catch (err) {
      log.debug(`STT import/call failed: ${err}`);
      return null;
    }
  }

  // ── Voice response (TTS) ──────────────────────────────────────────

  async function sendVoiceResponse(
    metadata: MessageMetadata,
    response: string,
    hadVoiceInput: boolean,
  ): Promise<void> {
    const ttsConfig = opts.ttsConfig;
    if (!ttsConfig || ttsConfig.provider === "disabled") {
      // If no TTS configured but user sent voice, skip silently.
      // The text response was already sent above.
      return;
    }

    // TTS is enabled — synthesize and send voice
    try {
      const { synthesize } = await import("../media/tts.js");
      const audioPath = await synthesize(response, ttsConfig);
      if (audioPath) {
        await opts.channels.sendVoice(metadata.channel, metadata.chat_id, audioPath);
        // Clean up temp file
        try { unlinkSync(audioPath); } catch { /* non-fatal */ }
      }
    } catch (err) {
      log.debug(`TTS failed: ${err}`);
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
          "Jeriko — your AI agent. Tap to navigate:",
          [
            [
              { label: "Sessions", data: "/sessions" },
              { label: "Model", data: "/model" },
              { label: "Stop", data: "/stop" },
            ],
            [
              { label: "Connectors", data: "/connectors" },
              { label: "Skills", data: "/skills" },
              { label: "Tasks", data: "/tasks" },
            ],
            [
              { label: "Channels", data: "/channels" },
              { label: "Share", data: "/share" },
              { label: "Notifications", data: "/notifications" },
            ],
            [
              { label: "Billing", data: "/billing" },
              { label: "Config", data: "/config" },
              { label: "Status", data: "/status" },
            ],
            [
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
      case "sessions": {
        const subCmd = rest[0]?.toLowerCase();

        // /session list — list sessions
        if (subCmd === "list" || subCmd === "ls" || (!subCmd && command === "sessions")) {
          const currentSession = getSession(state.sessionId);
          const sessionCount = listSessions(100).length;
          const sessionTitle = currentSession?.title ?? "Untitled";
          const sessionAge = currentSession?.updated_at
            ? formatAge(currentSession.updated_at)
            : "just now";

          await safeKeyboard(
            metadata,
            [
              `Current: ${currentSession?.slug ?? state.sessionId}`,
              `Title: ${sessionTitle}`,
              `Model: ${state.model}`,
              `Updated: ${sessionAge}`,
              `Total: ${sessionCount} session(s)`,
            ].join("\n"),
            [
              [
                { label: "New Session", data: "/new" },
                { label: "Switch", data: "/sessions switch" },
              ],
              [
                { label: "Delete", data: "/sessions delete" },
                { label: "Archive", data: "/archive" },
              ],
              [
                { label: "Rename", data: "/sessions rename" },
                { label: "History", data: "/history" },
              ],
            ],
          );
          return;
        }

        // /session switch [slug] — switch to another session
        if (subCmd === "switch") {
          const switchTarget = rest[1];
          if (switchTarget) {
            const target = getSessionBySlug(switchTarget) ?? getSession(switchTarget);
            if (!target) {
              await safeSend(metadata, `Session not found: ${switchTarget}`);
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
          // No target — show picker
          const recent = listSessions(10);
          if (recent.length === 0) {
            await safeSend(metadata, "No sessions available.");
            return;
          }
          const buttons: KeyboardLayout = [];
          const lines: string[] = [];
          for (const s of recent) {
            const active = s.id === state.sessionId;
            const age = formatAge(s.updated_at);
            lines.push(`${active ? "●" : "○"} ${s.slug} — ${s.model ?? "?"} — ${age}`);
            if (!active) {
              buttons.push([{ label: s.slug, data: `/sessions switch ${s.slug}` }]);
            }
          }
          if (buttons.length > 0) {
            buttons.push([{ label: "« Back", data: "/sessions" }]);
            await safeKeyboard(
              metadata,
              ["Sessions:", ...lines].join("\n") + "\n\nTap to switch:",
              buttons,
            );
          } else {
            await safeSend(metadata, ["Sessions:", ...lines].join("\n") + "\n\nOnly the current session exists.");
          }
          return;
        }

        // /session delete [slug] — delete a session
        if (subCmd === "delete" || subCmd === "del") {
          const targetSlug = rest[1];
          if (targetSlug) {
            const target = getSessionBySlug(targetSlug) ?? getSession(targetSlug);
            if (!target) {
              await safeSend(metadata, `Session not found: ${targetSlug}`);
              return;
            }
            if (target.id === state.sessionId) {
              await safeSend(metadata, "Cannot delete the active session. Use /kill to destroy and start fresh.");
              return;
            }
            deleteSession(target.id);
            await safeKeyboard(
              metadata,
              `Session deleted: ${target.slug}`,
              [[{ label: "« Session", data: "/sessions" }]],
            );
            return;
          }
          // No slug — show picker
          const recent = listSessions(10);
          if (recent.length === 0) {
            await safeSend(metadata, "No sessions to delete.");
            return;
          }
          const buttons: KeyboardLayout = [];
          const lines: string[] = [];
          for (const s of recent) {
            const active = s.id === state.sessionId;
            const age = formatAge(s.updated_at);
            lines.push(`${active ? "● current" : "○"} ${s.slug} — ${s.model ?? "?"} — ${age}`);
            if (!active) {
              buttons.push([{ label: `Delete ${s.slug}`, data: `/sessions delete ${s.slug}` }]);
            }
          }
          if (buttons.length > 0) {
            buttons.push([{ label: "« Back", data: "/sessions" }]);
            await safeKeyboard(
              metadata,
              ["Sessions:", ...lines].join("\n") + "\n\nTap to delete (cannot delete current):",
              buttons,
            );
          } else {
            await safeSend(metadata, "Only the current session exists — nothing to delete.");
          }
          return;
        }

        // /session rm <slug> — alias for delete
        if (subCmd === "rm" || subCmd === "remove") {
          const targetSlug = rest[1];
          if (!targetSlug) {
            await safeSend(metadata, "Usage: /sessions delete <session-slug>");
            return;
          }
          const target = getSessionBySlug(targetSlug) ?? getSession(targetSlug);
          if (!target) {
            await safeSend(metadata, `Session not found: ${targetSlug}`);
            return;
          }
          if (target.id === state.sessionId) {
            await safeSend(metadata, "Cannot delete the active session. Use /kill to destroy and start fresh.");
            return;
          }
          deleteSession(target.id);
          await safeKeyboard(
            metadata,
            `Session deleted: ${target.slug}`,
            [[{ label: "« Session", data: "/sessions" }]],
          );
          return;
        }

        // /session rename <title>
        if (subCmd === "rename") {
          const newTitle = rest.slice(1).join(" ").trim();
          if (!newTitle) {
            await safeSend(metadata, "Usage: /sessions rename <new title>");
            return;
          }
          updateSession(state.sessionId, { title: newTitle });
          await safeKeyboard(
            metadata,
            `Session renamed: ${newTitle}`,
            [[{ label: "« Session", data: "/sessions" }]],
          );
          return;
        }

        // /session (no subcommand) — show current session detail
        await safeSend(
          metadata,
          [`session: ${state.sessionId}`, describeModel(state.model)].join("\n"),
        );
        return;
      }

      // Legacy aliases — route to unified /session
      case "delete":
      case "del": {
        if (!arg) {
          await safeSend(metadata, "Usage: /sessions delete <session-slug>");
          return;
        }
        const delTarget = getSessionBySlug(arg) ?? getSession(arg);
        if (!delTarget) {
          await safeSend(metadata, `Session not found: ${arg}`);
          return;
        }
        if (delTarget.id === state.sessionId) {
          await safeSend(metadata, "Cannot delete the active session. Use /kill to destroy and start fresh.");
          return;
        }
        deleteSession(delTarget.id);
        await safeSend(metadata, `Session deleted: ${delTarget.slug}`);
        return;
      }

      case "switch": {
        if (!arg) {
          await safeSend(metadata, "Usage: /sessions switch <session-slug-or-id>");
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
        const modelSubCmd = rest[0]?.toLowerCase();

        // /model list <provider> — show models for a specific provider
        if (modelSubCmd === "list") {
          const providerArg = rest[1]?.toLowerCase();
          if (!providerArg) {
            // List all providers
            const drivers = listDrivers();
            const buttons: KeyboardLayout = [];
            let row: Array<{ label: string; data?: string }> = [];
            for (const driver of drivers) {
              row.push({ label: driver, data: `/model list ${driver}` });
              if (row.length === 3) {
                buttons.push(row);
                row = [];
              }
            }
            if (row.length > 0) buttons.push(row);
            buttons.push([{ label: "« Model", data: "/model" }]);

            await safeKeyboard(
              metadata,
              "Select a provider to see available models:",
              buttons,
            );
            return;
          }

          // Show models for a specific provider
          try {
            getDriver(providerArg);
          } catch {
            await safeSend(metadata, `Unknown provider: ${providerArg}\nAvailable: ${listDrivers().join(", ")}`);
            return;
          }

          const models = listModels(providerArg);
          if (models.length === 0) {
            await safeKeyboard(
              metadata,
              `No models found for ${providerArg}.\n\nSwitch directly: /model ${providerArg}:model-name`,
              [[{ label: "« Providers", data: "/model list" }]],
            );
            return;
          }

          // Show up to 10 models to stay within Telegram limits
          const displayModels = models.slice(0, 10);
          const buttons: KeyboardLayout = [];
          const { backend: currentBackend, model: currentModelId } = parseModelSpec(state.model);
          for (const m of displayModels) {
            const spec = `${providerArg}:${m.id}`;
            const isCurrent =
              state.model === spec ||
              (currentBackend === providerArg && resolveModel(currentBackend, currentModelId) === m.id);
            const cost = m.costInput === 0
              ? "free"
              : `$${m.costInput}/$${m.costOutput}`;
            const label = isCurrent
              ? `${m.id} ●`
              : m.id.length > 28 ? m.id.slice(0, 28) + "…" : m.id;
            buttons.push([{ label, data: `/model ${spec}` }]);
          }

          const lines = displayModels.map((m) => {
            const cost = m.costInput === 0 ? "free" : `$${m.costInput}/$${m.costOutput}`;
            const ctx = `${(m.context / 1000).toFixed(0)}k`;
            return `${m.id} — ctx=${ctx} tools=${m.toolCall} ${cost}`;
          });

          if (models.length > 10) {
            lines.push(`\n... and ${models.length - 10} more. Use /model ${providerArg}:name`);
          }

          buttons.push([{ label: "« Providers", data: "/model list" }]);

          await safeKeyboard(
            metadata,
            [`${providerArg} models:`, "", ...lines].join("\n"),
            buttons,
          );
          return;
        }

        // /model add — custom provider setup guide
        if (modelSubCmd === "add" || modelSubCmd === "setup") {
          await safeKeyboard(
            metadata,
            [
              "*Add a custom AI provider:*",
              "",
              "*Option 1* — Environment variable (auto-discovery):",
              "Set `OPENROUTER_API_KEY`, `GROQ_API_KEY`, etc.",
              "Restart daemon. Provider appears automatically.",
              "",
              "*Option 2* — Config file:",
              "`~/.config/jeriko/config.json`",
              '```',
              '{ "providers": [{',
              '  "id": "my-ai",',
              '  "baseUrl": "https://api.example.com/v1",',
              '  "apiKey": "{env:MY_API_KEY}",',
              '  "type": "openai-compatible",',
              '  "defaultModel": "model-name"',
              '}]}',
              '```',
              "",
              "Then use: `/model my-ai:model-name`",
            ].join("\n"),
            [[{ label: "« Model", data: "/model" }]],
          );
          return;
        }

        // /model — hub menu (no args)
        // Show active providers with their default models + add provider option.
        // Like OpenCode: pick provider → see models → switch.
        if (!arg) {
          const { backend: activeBackend } = parseModelSpec(state.model);
          const drivers = listDrivers();

          // Load custom provider config (dynamic import — not available at top level)
          let providerConfigs: Array<{ id: string; defaultModel?: string }> = [];
          try {
            const { loadConfig: loadCfg } = await import("../../../shared/config.js");
            const cfg = loadCfg();
            providerConfigs = cfg.providers ?? [];
          } catch { /* config not available — show drivers only */ }

          const buttons: KeyboardLayout = [];
          const builtInSet = new Set(["anthropic", "openai", "local", "claude-code"]);

          // Built-in providers as a row
          const builtInRow: Array<{ label: string; data?: string }> = [];
          for (const driver of ["anthropic", "openai", "local"]) {
            if (!drivers.includes(driver)) continue;
            const isCurrent = activeBackend === driver;
            const label = isCurrent ? `${driver} ●` : driver;
            builtInRow.push({ label, data: `/model list ${driver}` });
          }
          if (builtInRow.length > 0) buttons.push(builtInRow);

          // Custom/discovered providers — each gets a button
          for (const driver of drivers) {
            if (builtInSet.has(driver)) continue;
            const isCurrent = activeBackend === driver;
            const label = isCurrent ? `${driver} ●` : driver;
            buttons.push([
              { label, data: `/model list ${driver}` },
            ]);
          }

          // Action row
          buttons.push([
            { label: "Browse All", data: "/model list" },
            { label: "+ Add Provider", data: "/provider add" },
          ]);

          await safeKeyboard(
            metadata,
            `Current: ${describeModel(state.model)}\n\nTap a provider to see its models:`,
            buttons,
          );
          return;
        }

        // /model <spec> — validate and switch
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
        await safeKeyboard(
          metadata,
          `Switched to:\n${describeModel(arg)}`,
          [[{ label: "« Model", data: "/model" }]],
        );
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

      // ── Unified connectors block ──────────────────────────────────
      // All connector operations: connect, disconnect, auth, health, detail, list.
      // Legacy top-level commands (connect, disconnect, auth, health) route here.
      case "connect":
      case "disconnect":
      case "auth":
      case "health":
      case "connector":
      case "connectors": {
        // Normalize: legacy top-level commands become subcommands under /connectors
        const connSub = ["connect", "disconnect", "auth", "health"].includes(command)
          ? command
          : rest[0]?.toLowerCase() ?? "";
        const connRest = ["connect", "disconnect", "auth", "health"].includes(command)
          ? rest
          : rest.slice(1);
        const connName = connRest[0]?.toLowerCase();

        const {
          CONNECTOR_DEFS, getConnectorDef, isConnectorConfigured,
          primaryVarName, isSlotSet, slotLabel,
        } = await import("../../../shared/connector.js");
        const { getOAuthProvider, isOAuthCapable, resolveOAuthContext, OAUTH_PROVIDERS } = await import("../oauth/providers.js");


        // ── connect — OAuth connect flow ──────────────────────────────
        if (connSub === "connect") {
          if (!connName) {
            const buttons: KeyboardLayout = [];
            let row: Array<{ label: string; data: string }> = [];

            for (const p of OAUTH_PROVIDERS) {
              const ready = isConnectorConfigured(p.name);
              const label = ready ? `${p.label} ✓` : p.label;
              const data = ready ? `/connectors disconnect ${p.name}` : `/connectors connect ${p.name}`;
              row.push({ label, data });
              if (row.length === 3) { buttons.push(row); row = []; }
            }
            if (row.length > 0) buttons.push(row);

            const apiKeyRow: Array<{ label: string; data: string }> = [];
            for (const def of CONNECTOR_DEFS) {
              if (!isOAuthCapable(def.name)) {
                const ready = isConnectorConfigured(def.name);
                const label = ready ? `${def.label} ✓` : def.label;
                apiKeyRow.push({ label, data: `/connectors auth ${def.name}` });
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

          const provider = getOAuthProvider(connName);
          if (!provider) {
            const oauthNames = OAUTH_PROVIDERS.map((p) => p.name).join(", ");
            await safeSend(
              metadata,
              `${connName} doesn't support OAuth.\nUse /connectors auth ${connName} <key> instead.\n\nOAuth connectors: ${oauthNames}`,
            );
            return;
          }

          if (isConnectorConfigured(connName)) {
            // Check health — if the token is stale/broken, auto-disconnect and reconnect
            const connectorMgr = opts.getConnectors?.();
            if (connectorMgr) {
              const health = await connectorMgr.health(connName);
              if (health.healthy) {
                await safeSend(
                  metadata,
                  `${provider.label} is already connected.\nUse /connectors disconnect ${connName} to remove it first.`,
                );
                return;
              }
              // Unhealthy — clear stale credentials and fall through to OAuth
              const { deleteSecret } = await import("../../../shared/secrets.js");
              deleteSecret(provider.tokenEnvVar);
              if (provider.refreshTokenEnvVar) deleteSecret(provider.refreshTokenEnvVar);
              await connectorMgr.evict(connName);
            } else {
              await safeSend(
                metadata,
                `${provider.label} is already connected.\nUse /connectors disconnect ${connName} to remove it first.`,
              );
              return;
            }
          }

          if (process.env.STRIPE_BILLING_SECRET_KEY) {
            try {
              const { canActivateConnector } = await import("../../billing/license.js");
              const check = canActivateConnector();
              if (!check.allowed) { await safeSend(metadata, check.reason!); return; }
            } catch { /* billing module not available — allow */ }
          }

          const { generateState } = await import("../oauth/state.js");
          const { getUserId } = await import("../../../shared/config.js");
          const stateToken = generateState(provider.name, chatId, metadata.channel, getUserId());
          const { buildOAuthStartUrl } = await import("../../../shared/urls.js");

          // Extract required context from auth URL placeholders (e.g. {shop} for Shopify).
          // Placeholders are resolved from env vars or connect args.
          const oauthContext = resolveOAuthContext(provider, connRest.slice(1));
          if (oauthContext instanceof Error) {
            await safeSend(metadata, oauthContext.message);
            return;
          }

          const loginUrl = buildOAuthStartUrl(provider.name, stateToken, oauthContext);

          await safeSend(
            metadata,
            `Connect ${provider.label}:\n${loginUrl}\n\nLink expires in 10 minutes.`,
          );

          if (metadata.message_id) {
            await opts.channels.deleteMessage(metadata.channel, metadata.chat_id, metadata.message_id);
          }
          return;
        }

        // ── disconnect — remove credentials ───────────────────────────
        if (connSub === "disconnect") {
          if (!connName) {
            const connected = CONNECTOR_DEFS.filter((d) => isConnectorConfigured(d.name));
            if (connected.length === 0) {
              await safeSend(metadata, "No connectors are connected.");
              return;
            }

            const buttons: KeyboardLayout = [];
            let row: Array<{ label: string; data: string }> = [];
            for (const d of connected) {
              row.push({ label: d.label, data: `/connectors disconnect ${d.name}` });
              if (row.length === 3) { buttons.push(row); row = []; }
            }
            if (row.length > 0) buttons.push(row);

            await safeKeyboard(metadata, "Tap a connector to disconnect:", buttons);
            return;
          }

          const def = getConnectorDef(connName);
          if (!def) { await safeSend(metadata, `Unknown connector: ${connName}`); return; }
          if (!isConnectorConfigured(connName)) { await safeSend(metadata, `${def.label} is not connected.`); return; }

          const { deleteSecret } = await import("../../../shared/secrets.js");
          const provider = getOAuthProvider(connName);
          if (provider) {
            deleteSecret(provider.tokenEnvVar);
            if (provider.refreshTokenEnvVar) deleteSecret(provider.refreshTokenEnvVar);
          } else {
            for (const entry of def.required) deleteSecret(primaryVarName(entry));
          }

          const connectorMgr = opts.getConnectors?.();
          if (connectorMgr) await connectorMgr.evict(connName);

          await safeKeyboard(
            metadata,
            `${def.label} disconnected.`,
            [[
              { label: "Reconnect", data: isOAuthCapable(connName) ? `/connectors connect ${connName}` : `/connectors auth ${connName}` },
              { label: "Connectors", data: "/connectors" },
            ]],
          );
          return;
        }

        // ── auth — API key management ─────────────────────────────────
        if (connSub === "auth") {
          if (!connName) {
            const buttons: KeyboardLayout = [];
            let row: Array<{ label: string; data: string }> = [];
            for (const def of CONNECTOR_DEFS) {
              const ready = isConnectorConfigured(def.name);
              const label = ready ? `${def.label} ✓` : def.label;
              row.push({ label, data: `/connectors auth ${def.name}` });
              if (row.length === 3) { buttons.push(row); row = []; }
            }
            if (row.length > 0) buttons.push(row);

            await safeKeyboard(metadata, "Configure a connector — tap for details:", buttons);
            return;
          }

          const def = getConnectorDef(connName);
          if (!def) {
            const names = CONNECTOR_DEFS.map((d) => d.name).join(", ");
            await safeSend(metadata, `Unknown connector: ${connName}\nAvailable: ${names}`);
            return;
          }

          const keys = connRest.slice(1);
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
              lines.push(`Set: /connectors auth ${def.name} <key>`);
            } else {
              lines.push(`Set: /connectors auth ${def.name} ${def.required.map((e) => `<${primaryVarName(e)}>`).join(" ")}`);
            }
            await safeSend(metadata, lines.join("\n"));
            return;
          }

          if (keys.length < def.required.length) {
            const varNames = def.required.map((e) => primaryVarName(e));
            await safeSend(
              metadata,
              `${def.label} requires ${def.required.length} key(s):\n${varNames.join("\n")}\n\nUsage: /connectors auth ${def.name} ${varNames.map((v) => `<${v}>`).join(" ")}`,
            );
            return;
          }

          if (!isConnectorConfigured(def.name) && process.env.STRIPE_BILLING_SECRET_KEY) {
            try {
              const { canActivateConnector } = await import("../../billing/license.js");
              const check = canActivateConnector();
              if (!check.allowed) { await safeSend(metadata, check.reason!); return; }
            } catch { /* billing module not available — allow */ }
          }

          const { saveSecret } = await import("../../../shared/secrets.js");
          for (let i = 0; i < def.required.length; i++) {
            const varName = primaryVarName(def.required[i]!);
            saveSecret(varName, keys[i]!);
          }

          if (metadata.message_id) {
            await opts.channels.deleteMessage(metadata.channel, metadata.chat_id, metadata.message_id);
          }

          await safeSend(
            metadata,
            `${def.label} configured. Keys saved securely.\nUse /connectors health ${def.name} to verify connectivity.`,
          );
          return;
        }

        // ── health — connectivity check ───────────────────────────────
        if (connSub === "health") {
          if (!connName) {
            const configured = CONNECTOR_DEFS.filter((d) => isConnectorConfigured(d.name));
            if (configured.length === 0) {
              await safeKeyboard(
                metadata,
                "No connectors configured.",
                [[{ label: "Connect", data: "/connectors connect" }, { label: "Auth", data: "/connectors auth" }]],
              );
              return;
            }

            const buttons: KeyboardLayout = [];
            let row: Array<{ label: string; data: string }> = [];
            for (const def of configured) {
              row.push({ label: def.label, data: `/connectors health ${def.name}` });
              if (row.length === 3) { buttons.push(row); row = []; }
            }
            if (row.length > 0) buttons.push(row);

            await safeKeyboard(metadata, `${configured.length} connector(s) ready — tap to health check:`, buttons);
            return;
          }

          const def = getConnectorDef(connName);
          if (!def) { await safeSend(metadata, `Unknown connector: ${connName}`); return; }
          if (!isConnectorConfigured(def.name)) {
            await safeSend(metadata, `${def.label} is not configured.\nUse /connectors auth ${def.name} to set it up.`);
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

        // ── Detail view: /connectors <name> ───────────────────────────
        if (connSub && !["list"].includes(connSub)) {
          const def = getConnectorDef(connSub);
          if (!def) { await safeSend(metadata, `Unknown connector: ${connSub}`); return; }

          const ready = isConnectorConfigured(connSub);
          const oauth = isOAuthCapable(connSub);
          const provider = getOAuthProvider(connSub);

          if (ready) {
            await safeKeyboard(
              metadata,
              `${def.label} — Connected ✓\n${def.description}`,
              [
                [
                  { label: "Health Check", data: `/connectors health ${def.name}` },
                  { label: "Disconnect", data: `/connectors disconnect ${def.name}` },
                ],
                [{ label: "← Connectors", data: "/connectors" }],
              ],
            );
          } else if (oauth && provider) {
            await safeKeyboard(
              metadata,
              `${def.label} — Not connected\n${def.description}\n\nTap to start OAuth:`,
              [
                [{ label: `Connect ${def.label}`, data: `/connectors connect ${def.name}` }],
                [{ label: "← Connectors", data: "/connectors" }],
              ],
            );
          } else {
            await safeKeyboard(
              metadata,
              `${def.label} — Not connected\n${def.description}\n\nRequires API key:`,
              [
                [{ label: "Set API Key", data: `/connectors auth ${def.name}` }],
                [{ label: "← Connectors", data: "/connectors" }],
              ],
            );
          }
          return;
        }

        // ── Grid view: /connectors (no sub) ───────────────────────────
        let configuredCount = 0;
        const buttons: KeyboardLayout = [];
        let row: Array<{ label: string; data: string }> = [];

        for (const def of CONNECTOR_DEFS) {
          const ready = isConnectorConfigured(def.name);
          if (ready) configuredCount++;
          const label = ready ? `${def.label} ✓` : def.label;
          row.push({ label, data: `/connectors ${def.name}` });
          if (row.length === 3) { buttons.push(row); row = []; }
        }
        if (row.length > 0) buttons.push(row);

        await safeKeyboard(
          metadata,
          `Connectors: ${configuredCount}/${CONNECTOR_DEFS.length} connected\nTap for details:`,
          buttons,
        );
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

        // /skills or /skills list — show installed skills
        if (!subCommand || subCommand === "list") {
          const skills = await listSkills();
          if (skills.length === 0) {
            await safeSend(
              metadata,
              "No skills installed.\nCreate one: /skills create <name> <description>",
            );
            return;
          }

          const buttons: KeyboardLayout = [];
          let row: Array<{ label: string; data: string }> = [];
          for (const skill of skills) {
            const indicator = skill.userInvocable ? "\u25CF" : "";
            const label = indicator ? `${skill.name} ${indicator}` : skill.name;
            row.push({ label, data: `/skills ${skill.name}` });
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

        // /skills create <name> <description>
        if (subCommand === "create") {
          const skillName = rest[1];
          const skillDescription = rest.slice(2).join(" ").trim();

          if (!skillName || !skillDescription) {
            await safeSend(
              metadata,
              "Usage: /skills create <name> <description>\n\nName: lowercase alphanumeric + hyphens, 2-50 chars\nDescription: minimum 10 characters",
            );
            return;
          }

          try {
            const skillDir = await scaffoldSkill(skillName, skillDescription);
            await safeSend(
              metadata,
              `Skill created: ${skillName}\nPath: ${skillDir}\n\nEdit SKILL.md to add instructions, then validate:\n/skills ${skillName}`,
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            await safeSend(metadata, `Failed to create skill: ${msg}`);
          }
          return;
        }

        // /skills remove <name>
        if (subCommand === "remove" || subCommand === "delete") {
          const skillName = rest[1];
          if (!skillName) {
            await safeSend(metadata, "Usage: /skills remove <name>");
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

        // /skills <name> — show skill details
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

      case "notify":
      case "notifications": {
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

      case "channel":
      case "channels": {
        const {
          CHANNEL_DEFS,
          getChannelDef,
          addChannel: addCh,
          removeChannel: removeCh,
          renderQRText,
          renderQRImage,
        } = await import("./lifecycle.js");

        const channelList = opts.channels.status();
        const subCommand = rest[0]?.toLowerCase();
        const channelArg = rest[1]?.toLowerCase();
        const tokens = rest.slice(2);

        // ── /channel add <type> [token(s)] — live add ──────────────

        if (subCommand === "add" || subCommand === "setup") {
          // /channel add — show available channel types
          if (!channelArg) {
            const registered = new Set(opts.channels.list());
            const buttons: KeyboardLayout = [];
            for (const def of CHANNEL_DEFS) {
              if (registered.has(def.name)) continue;
              buttons.push([{ label: def.label, data: `/channels add ${def.name}` }]);
            }
            if (buttons.length === 0) {
              await safeKeyboard(
                metadata,
                "All supported channels are already registered.",
                [[{ label: "← Channels", data: "/channels" }]],
              );
              return;
            }
            buttons.push([{ label: "← Channels", data: "/channels" }]);
            await safeKeyboard(metadata, "Add a channel — tap to set up:", buttons);
            return;
          }

          // /channel add <type> — validate type
          const def = getChannelDef(channelArg);
          if (!def) {
            const available = CHANNEL_DEFS.map((d) => d.name).join(", ");
            await safeSend(metadata, `Unknown channel: ${channelArg}\nAvailable: ${available}`);
            return;
          }

          // Already registered?
          if (opts.channels.get(channelArg)) {
            await safeKeyboard(
              metadata,
              `${def.label} is already registered.`,
              [
                [
                  { label: "Reconnect", data: `/channels reconnect ${def.name}` },
                  { label: "Remove", data: `/channels remove ${def.name}` },
                ],
                [{ label: "← Channels", data: "/channels" }],
              ],
            );
            return;
          }

          // Token required but not provided — show setup guide
          if (def.requiresToken && tokens.length < def.tokenCount) {
            await safeKeyboard(
              metadata,
              `${def.label} Setup:\n${def.setupGuide.join("\n")}`,
              [[{ label: "← Channels", data: "/channels" }]],
            );
            return;
          }

          // Build config from tokens
          let channelConfig: Record<string, unknown> | undefined;
          if (channelArg === "telegram") {
            channelConfig = { token: tokens[0] };
          } else if (channelArg === "whatsapp") {
            channelConfig = { enabled: true };
          }

          // Delete the user's message — it contains sensitive tokens
          if (def.requiresToken && metadata.message_id) {
            await opts.channels.deleteMessage(
              metadata.channel,
              metadata.chat_id,
              metadata.message_id,
            );
          }

          // Add the channel live — WhatsApp gets a QR callback so the
          // requesting channel receives the QR code directly in chat.
          try {
            // Baileys emits QR codes on each socket creation and rotates them
            // every ~20s. We send exactly ONE QR to the user — subsequent QR
            // events just update the stored data silently. The QR stays valid
            // until the connection timeout (120s). If it expires, the connect
            // call fails and the user can retry with /channel add whatsapp.
            let qrSent = false;
            let latestQrData = "";

            const onQR = channelArg === "whatsapp"
              ? async (qr: string) => {
                  latestQrData = qr;
                  if (qrSent) return;
                  qrSent = true;

                  const imgBuf = await renderQRImage(latestQrData);
                  if (imgBuf) {
                    const tmpPath = join(tmpdir(), `jeriko-whatsapp-qr-${Date.now()}.png`);
                    writeFileSync(tmpPath, imgBuf);
                    try {
                      await opts.channels.sendPhoto(
                        metadata.channel,
                        metadata.chat_id,
                        tmpPath,
                        "Use a second phone/SIM for the bot.\nOpen WhatsApp on that phone → Linked Devices → Scan this QR.\nThen message that number from your main WhatsApp.",
                      );
                    } finally {
                      try { unlinkSync(tmpPath); } catch { /* cleanup */ }
                    }
                  } else {
                    const text = await renderQRText(latestQrData);
                    if (text) {
                      await safeSend(metadata, `Use a second phone/SIM for the bot.\nScan this QR from that phone's WhatsApp → Linked Devices.\n\n${text}`);
                    }
                  }
                }
              : undefined;

            if (channelArg === "whatsapp") {
              await safeSend(metadata, "Connecting WhatsApp — QR code will appear shortly...");
            }

            await addCh(opts.channels, channelArg, channelConfig, onQR ? { onQR } : undefined);

            await safeKeyboard(
              metadata,
              `${def.label} added and connected.`,
              [[{ label: "← Channels", data: "/channels" }]],
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            await safeKeyboard(
              metadata,
              `Failed to add ${def.label}: ${msg}`,
              [[{ label: "← Channels", data: "/channels" }]],
            );
          }
          return;
        }

        // ── /channel remove <name> — live remove ─────────────────

        if (subCommand === "remove" || subCommand === "rm") {
          if (!channelArg) {
            // Show removable channels as buttons
            const removable = channelList.filter((ch) => ch.name !== metadata.channel);
            if (removable.length === 0) {
              await safeKeyboard(
                metadata,
                "No channels to remove (can't remove the one you're using).",
                [[{ label: "← Channels", data: "/channels" }]],
              );
              return;
            }
            const buttons: KeyboardLayout = removable.map((ch) => [
              { label: ch.name, data: `/channels remove ${ch.name}` },
            ]);
            buttons.push([{ label: "← Channels", data: "/channels" }]);
            await safeKeyboard(metadata, "Remove a channel:", buttons);
            return;
          }

          if (channelArg === metadata.channel) {
            await safeSend(metadata, `Cannot remove ${channelArg} — you're using it right now.`);
            return;
          }

          try {
            await removeCh(opts.channels, channelArg);
            await safeKeyboard(
              metadata,
              `${channelArg} removed.`,
              [
                [
                  { label: "Re-add", data: `/channels add ${channelArg}` },
                  { label: "← Channels", data: "/channels" },
                ],
              ],
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            await safeSend(metadata, `Failed to remove ${channelArg}: ${msg}`);
          }
          return;
        }

        // ── /channel connect <name> — reconnect existing ─────────

        if (subCommand === "connect" || subCommand === "reconnect") {
          if (!channelArg) {
            await safeSend(metadata, "Usage: /channels connect <name>");
            return;
          }
          try {
            await opts.channels.connect(channelArg);
            await safeKeyboard(
              metadata,
              `${channelArg} connected.`,
              [[{ label: "← Channels", data: "/channels" }]],
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            await safeSend(metadata, `Failed to connect ${channelArg}: ${msg}`);
          }
          return;
        }

        // ── /channel disconnect <name> — pause without removing ──

        if (subCommand === "disconnect") {
          if (!channelArg) {
            await safeSend(metadata, "Usage: /channels disconnect <name>");
            return;
          }
          if (channelArg === metadata.channel) {
            await safeSend(metadata, `Cannot disconnect ${channelArg} — you're using it right now.`);
            return;
          }
          try {
            await opts.channels.disconnect(channelArg);
            await safeKeyboard(
              metadata,
              `${channelArg} disconnected.`,
              [
                [
                  { label: "Reconnect", data: `/channels connect ${channelArg}` },
                  { label: "Remove", data: `/channels remove ${channelArg}` },
                ],
                [{ label: "← Channels", data: "/channels" }],
              ],
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            await safeSend(metadata, `Failed to disconnect ${channelArg}: ${msg}`);
          }
          return;
        }

        // ── /channel <name> — detail view for a specific channel ──

        if (subCommand && !["list", "add", "setup", "remove", "rm", "connect", "reconnect", "disconnect"].includes(subCommand)) {
          const chName = subCommand;
          const def = getChannelDef(chName);
          const registered = opts.channels.get(chName);
          const status = opts.channels.statusOf(chName);

          if (!def && !registered) {
            await safeSend(metadata, `Unknown channel: ${chName}`);
            return;
          }

          if (registered && status) {
            // Registered — show status + actions
            const icon = status.status === "connected" ? "●" : status.status === "failed" ? "✗" : "○";
            const buttons: KeyboardLayout = [];

            if (status.status === "connected" && chName !== metadata.channel) {
              buttons.push([
                { label: "Disconnect", data: `/channels disconnect ${chName}` },
                { label: "Remove", data: `/channels remove ${chName}` },
              ]);
            } else if (status.status !== "connected") {
              buttons.push([
                { label: "Connect", data: `/channels connect ${chName}` },
                { label: "Remove", data: `/channels remove ${chName}` },
              ]);
            }
            buttons.push([{ label: "← Channels", data: "/channels" }]);

            const extra = status.connected_at
              ? `\nConnected since ${formatAge(new Date(status.connected_at).getTime())}`
              : "";
            const errMsg = status.error ? `\nError: ${status.error}` : "";

            await safeKeyboard(
              metadata,
              `${icon} ${def?.label ?? chName} — ${status.status}${extra}${errMsg}`,
              buttons,
            );
          } else if (def) {
            // Not registered — offer to add
            await safeKeyboard(
              metadata,
              `${def.label} — Not registered\n\n${def.setupGuide.join("\n")}`,
              [
                def.requiresToken
                  ? [{ label: "← Channels", data: "/channels" }]
                  : [
                      { label: `Add ${def.label}`, data: `/channels add ${chName}` },
                      { label: "← Channels", data: "/channels" },
                    ],
              ],
            );
          }
          return;
        }

        // ── /channels or /channels list — hub menu ───────────────
        // Shows ALL supported channel types with their current status.
        // Registered channels show connected/disconnected/failed.
        // Unregistered channels show "Not added" with a button to add.

        const registered = new Map(channelList.map((ch) => [ch.name, ch]));
        const buttons: KeyboardLayout = [];
        const lines: string[] = [];
        let connectedCount = 0;

        for (const def of CHANNEL_DEFS) {
          const ch = registered.get(def.name);
          if (ch) {
            const icon = ch.status === "connected" ? "●" : ch.status === "failed" ? "✗" : "○";
            const current = ch.name === metadata.channel ? " (you)" : "";
            if (ch.status === "connected") connectedCount++;
            lines.push(`${icon} ${def.label} — ${ch.status}${current}`);
            buttons.push([{ label: `${def.label}${current}`, data: `/channels ${def.name}` }]);
          } else {
            lines.push(`  ${def.label} — not added`);
            buttons.push([{ label: `+ ${def.label}`, data: `/channels add ${def.name}` }]);
          }
        }

        await safeKeyboard(
          metadata,
          [
            `Channels: ${connectedCount}/${CHANNEL_DEFS.length} active`,
            "",
            ...lines,
          ].join("\n"),
          buttons,
        );
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

      case "trigger":
      case "triggers": {
        // Simple trigger management — flat list with enable/disable/detail.
        // The user's primary need: see all triggers, toggle them on/off.
        const triggerEngine = opts.getTriggerEngine?.();
        if (!triggerEngine) {
          await safeSend(metadata, "Trigger engine not available.");
          return;
        }

        const triggerSub = rest[0]?.toLowerCase();
        const triggerId = rest[1];

        // /triggers enable <id>
        if (triggerSub === "enable" && triggerId) {
          const ok = triggerEngine.enable(triggerId);
          await safeSend(metadata, ok ? `Trigger enabled: ${triggerId}` : `Trigger not found: ${triggerId}`);
          return;
        }

        // /triggers disable <id>
        if ((triggerSub === "disable" || triggerSub === "pause") && triggerId) {
          const ok = triggerEngine.disable(triggerId);
          await safeSend(metadata, ok ? `Trigger disabled: ${triggerId}` : `Trigger not found: ${triggerId}`);
          return;
        }

        // /triggers delete <id>
        if ((triggerSub === "delete" || triggerSub === "remove") && triggerId) {
          const ok = triggerEngine.remove(triggerId);
          await safeSend(metadata, ok ? `Trigger deleted: ${triggerId}` : `Trigger not found: ${triggerId}`);
          return;
        }

        // /triggers test <id>
        if ((triggerSub === "test" || triggerSub === "run") && triggerId) {
          const t = triggerEngine.get(triggerId);
          if (!t) { await safeSend(metadata, `Trigger not found: ${triggerId}`); return; }
          await safeSend(metadata, `Firing: ${t.label ?? triggerId}...`);
          try {
            await triggerEngine.fire(triggerId, { test: true, timestamp: new Date().toISOString() });
            await safeSend(metadata, `Trigger fired: ${t.label ?? triggerId} (run #${(t.run_count ?? 0) + 1})`);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            await safeSend(metadata, `Trigger failed: ${msg.slice(0, 500)}`);
          }
          return;
        }

        // /triggers <id> — detail view
        if (triggerSub && !["list", "all"].includes(triggerSub)) {
          const t = triggerEngine.get(triggerSub);
          if (t) {
            const configSummary = t.type === "cron"
              ? `schedule: ${(t.config as { expression: string }).expression}`
              : t.type === "once"
              ? `at: ${(t.config as { at: string }).at}`
              : t.type === "webhook"
              ? `source: ${(t.config as { service?: string }).service ?? "generic"}`
              : `type: ${t.type}`;

            const lines = [
              `${t.label ?? t.id}`,
              `ID: ${t.id}`,
              `type: ${t.type}`,
              `enabled: ${t.enabled}`,
              configSummary,
              `action: ${t.action.type}${t.action.prompt ? ` — ${t.action.prompt.slice(0, 80)}` : ""}${t.action.command ? ` — ${t.action.command.slice(0, 80)}` : ""}`,
              `runs: ${t.run_count ?? 0}${t.max_runs ? ` / ${t.max_runs}` : ""}`,
              t.last_fired ? `last fired: ${formatAge(new Date(t.last_fired).getTime())}` : "last fired: never",
            ];
            await safeKeyboard(
              metadata,
              lines.join("\n"),
              [
                [
                  t.enabled
                    ? { label: "Disable", data: `/triggers disable ${t.id}` }
                    : { label: "Enable", data: `/triggers enable ${t.id}` },
                  { label: "Test", data: `/triggers test ${t.id}` },
                  { label: "Delete", data: `/triggers delete ${t.id}` },
                ],
                [{ label: "« All Triggers", data: "/triggers" }],
              ],
            );
            return;
          }
        }

        // /triggers — list all triggers (flat, simple)
        const allTriggers = triggerEngine.listAll();
        if (allTriggers.length === 0) {
          await safeSend(metadata, "No triggers configured.\n\nUse /tasks to create triggers, schedules, and cron jobs.");
          return;
        }

        const triggerLines: string[] = [];
        const triggerButtons: KeyboardLayout = [];
        for (const t of allTriggers) {
          const icon = t.enabled ? "●" : "○";
          const runs = t.run_count ?? 0;
          triggerLines.push(`${icon} ${t.label ?? t.id} — ${t.type} — ${runs} runs`);
          triggerButtons.push([
            { label: `${icon} ${t.label ?? t.id}`, data: `/triggers ${t.id}` },
          ]);
        }

        await safeKeyboard(
          metadata,
          [`Triggers (${allTriggers.length}):`, ...triggerLines].join("\n"),
          triggerButtons,
        );
        return;
      }

      case "task":
      case "tasks": {
        // Unified task hub — three categories backed by TriggerEngine.
        //   /task trigger  — event-driven (webhook, file, http, email)
        //   /task schedule — recurring (daily, weekly, monthly, custom, cron)
        //   /task cron     — raw cron expressions + one-time
        const engine = opts.getTriggerEngine?.();
        if (!engine) {
          await safeSend(metadata, "Task engine not available.");
          return;
        }

        const category = rest[0]?.toLowerCase();
        const subCommand = rest[1]?.toLowerCase();

        // ── Category: trigger ──────────────────────────────────────
        if (category === "trigger" || category === "triggers") {
          // /tasks trigger new <type> ...
          if (subCommand === "new" || subCommand === "create") {
            const triggerType = rest[2]?.toLowerCase();
            if (!triggerType) {
              await safeKeyboard(
                metadata,
                "Create an event trigger — select type:",
                [
                  [
                    { label: "Webhook", data: "/tasks trigger new webhook" },
                    { label: "File Watch", data: "/tasks trigger new file" },
                  ],
                  [
                    { label: "HTTP Monitor", data: "/tasks trigger new http" },
                    { label: "Email", data: "/tasks trigger new email" },
                  ],
                  [{ label: "« Tasks", data: "/tasks" }],
                ],
              );
              return;
            }

            try {
              const { buildTriggerConfig } = await import("../triggers/task-adapter.js");
              let params: Record<string, unknown>;

              if (triggerType === "webhook") {
                const service = rest[3]?.toLowerCase();
                if (!service || !(WEBHOOK_SERVICES as readonly string[]).includes(service)) {
                  await safeKeyboard(
                    metadata,
                    "Select a webhook service:",
                    [
                      [
                        { label: "Stripe", data: "/tasks trigger new webhook stripe" },
                        { label: "GitHub", data: "/tasks trigger new webhook github" },
                      ],
                      [
                        { label: "PayPal", data: "/tasks trigger new webhook paypal" },
                        { label: "Twilio", data: "/tasks trigger new webhook twilio" },
                      ],
                      [{ label: "« Triggers", data: "/tasks trigger" }],
                    ],
                  );
                  return;
                }
                const action = rest.slice(4).join(" ") || "process webhook event";
                params = { name: `${service} webhook`, trigger: `${service}:*`, action };
              } else if (triggerType === "file") {
                const path = rest[3];
                if (!path) {
                  await safeSend(metadata, "Usage: /tasks trigger new file <path> [action]\n\nExample: /tasks trigger new file /var/log/app.log alert on changes");
                  return;
                }
                const action = rest.slice(4).join(" ") || "process file change";
                params = { name: `file watch: ${path}`, trigger: "file:change", path, action };
              } else if (triggerType === "http") {
                const url = rest[3] ?? "";
                if (!url.startsWith("http")) {
                  await safeSend(metadata, "Usage: /tasks trigger new http <url> [action]\n\nExample: /tasks trigger new http https://api.example.com alert if down");
                  return;
                }
                params = { name: `http: ${url}`, trigger: "http:any", url, action: rest.slice(4).join(" ") || "check endpoint status" };
              } else if (triggerType === "email") {
                const connector = rest[3]?.toLowerCase() ?? "gmail";
                params = { name: `${connector} email`, trigger: `${connector}:new_email`, action: rest.slice(4).join(" ") || "process new email" };
              } else {
                await safeSend(metadata, `Unknown trigger type: ${triggerType}\nAvailable: ${EVENT_TRIGGER_TYPES.join(", ")}`);
                return;
              }

              const config = buildTriggerConfig(params);
              const trigger = engine.add(config);
              await safeKeyboard(
                metadata,
                `Trigger created: ${trigger.label ?? trigger.id}\nType: ${trigger.type}\nStatus: enabled`,
                [
                  [
                    { label: "Pause", data: `/tasks disable ${trigger.id}` },
                    { label: "Test", data: `/tasks test ${trigger.id}` },
                  ],
                  [{ label: "« Triggers", data: "/tasks trigger" }],
                ],
              );
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              await safeSend(metadata, `Failed to create trigger: ${msg}`);
            }
            return;
          }

          // /tasks trigger delete <id>
          if (subCommand === "delete" || subCommand === "remove") {
            const id = rest[2];
            if (!id) { await safeSend(metadata, "Usage: /tasks trigger delete <id>"); return; }
            const result = engine.remove(id);
            await safeSend(metadata, result ? `Trigger deleted: ${id}` : `Trigger not found: ${id}`);
            return;
          }

          // /tasks trigger enable <id>
          if (subCommand === "enable") {
            const id = rest[2];
            if (!id) { await safeSend(metadata, "Usage: /tasks trigger enable <id>"); return; }
            const result = engine.enable(id);
            await safeSend(metadata, result ? `Trigger enabled: ${id}` : `Trigger not found: ${id}`);
            return;
          }

          // /tasks trigger disable <id>
          if (subCommand === "disable") {
            const id = rest[2];
            if (!id) { await safeSend(metadata, "Usage: /tasks trigger disable <id>"); return; }
            const result = engine.disable(id);
            await safeSend(metadata, result ? `Trigger disabled: ${id}` : `Trigger not found: ${id}`);
            return;
          }

          // /tasks trigger — list event triggers
          const triggers = engine.listAll().filter((t) => isEventTrigger(t.type));
          if (triggers.length === 0) {
            await safeKeyboard(
              metadata,
              "No event triggers configured.",
              [
                [{ label: "New Trigger", data: "/tasks trigger new" }],
                [{ label: "« Tasks", data: "/tasks" }],
              ],
            );
            return;
          }

          const tButtons: KeyboardLayout = [];
          const tLines: string[] = [];
          for (const t of triggers) {
            const icon = t.enabled ? "●" : "○";
            const runs = t.run_count ?? 0;
            tLines.push(`${icon} ${t.label ?? t.id} — ${t.type} — ${runs} runs`);
            tButtons.push([{ label: t.label ?? t.id, data: `/tasks ${t.id}` }]);
          }
          tButtons.push([
            { label: "New Trigger", data: "/tasks trigger new" },
            { label: "« Tasks", data: "/tasks" },
          ]);

          await safeKeyboard(
            metadata,
            [`Event Triggers (${triggers.length}):`, ...tLines].join("\n"),
            tButtons,
          );
          return;
        }

        // ── Category: schedule ─────────────────────────────────────
        if (category === "schedule" || category === "schedules") {

          // /tasks schedule new [daily|weekly|monthly|custom] [time] [action...]
          if (subCommand === "new" || subCommand === "create") {
            const preset = rest[2]?.toLowerCase();
            if (!preset) {
              await safeKeyboard(
                metadata,
                "Create a schedule — select frequency:",
                [
                  [
                    { label: "Daily", data: "/tasks schedule new daily" },
                    { label: "Weekly", data: "/tasks schedule new weekly" },
                  ],
                  [
                    { label: "Monthly", data: "/tasks schedule new monthly" },
                    { label: "Custom", data: "/tasks schedule new custom" },
                  ],
                  [{ label: "« Tasks", data: "/tasks" }],
                ],
              );
              return;
            }

            const { parseRecurring } = await import("../triggers/task-adapter.js");
            const timeArg = rest[3] ?? "";
            const actionText = rest.slice(4).join(" ").trim();

            if (!timeArg) {
              const hints: Record<string, string> = {
                daily: "Usage: /tasks schedule new daily <HH:MM> <action>\nExample: /tasks schedule new daily 09:00 morning briefing",
                weekly: "Usage: /tasks schedule new weekly <DAY> <HH:MM> <action>\nExample: /tasks schedule new weekly MON 09:00 weekly report",
                monthly: "Usage: /tasks schedule new monthly <DAY> <action>\nExample: /tasks schedule new monthly 1 run monthly audit",
                custom: "Usage: /tasks schedule new custom <interval> <action>\nIntervals: 5m, 1h, 30m\nExample: /tasks schedule new custom 30m check for updates",
              };
              await safeSend(metadata, hints[preset] ?? `Usage: /tasks schedule new ${preset} <time> <action>`);
              return;
            }

            try {
              let expression: string;
              let label: string;

              if (preset === "daily") {
                expression = parseRecurring("daily", { at: timeArg });
                label = `Daily at ${timeArg}`;
              } else if (preset === "weekly") {
                const dayOfWeek = timeArg.toUpperCase();
                const weekTime = rest[4] ?? "09:00";
                expression = parseRecurring("weekly", { day: dayOfWeek, at: weekTime });
                label = `Weekly ${dayOfWeek} at ${weekTime}`;
              } else if (preset === "monthly") {
                expression = parseRecurring("monthly", { day_of_month: timeArg });
                label = `Monthly on day ${timeArg}`;
              } else {
                expression = parseRecurring(timeArg, {});
                label = `Every ${timeArg}`;
              }

              const prompt = actionText || (preset === "weekly" ? rest.slice(5).join(" ") : "scheduled task");
              const trigger = engine.add({
                type: "cron",
                enabled: true,
                config: { expression } as import("../triggers/engine.js").CronConfig,
                action: { type: "agent", prompt, notify: true },
                label,
              });

              await safeKeyboard(
                metadata,
                `Schedule created: ${label}\nCron: ${expression}\nAction: ${prompt}\nStatus: enabled`,
                [
                  [
                    { label: "Pause", data: `/tasks disable ${trigger.id}` },
                    { label: "Test", data: `/tasks test ${trigger.id}` },
                  ],
                  [{ label: "« Schedules", data: "/tasks schedule" }],
                ],
              );
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              await safeSend(metadata, `Failed to create schedule: ${msg}`);
            }
            return;
          }

          // /tasks schedule delete <id>
          if (subCommand === "delete" || subCommand === "remove") {
            const id = rest[2];
            if (!id) { await safeSend(metadata, "Usage: /tasks schedule delete <id>"); return; }
            const result = engine.remove(id);
            await safeSend(metadata, result ? `Schedule deleted: ${id}` : `Schedule not found: ${id}`);
            return;
          }

          // /tasks schedule enable/disable <id>
          if (subCommand === "enable") {
            const id = rest[2];
            if (!id) { await safeSend(metadata, "Usage: /tasks schedule enable <id>"); return; }
            engine.enable(id);
            await safeSend(metadata, `Schedule enabled: ${id}`);
            return;
          }
          if (subCommand === "disable") {
            const id = rest[2];
            if (!id) { await safeSend(metadata, "Usage: /tasks schedule disable <id>"); return; }
            engine.disable(id);
            await safeSend(metadata, `Schedule disabled: ${id}`);
            return;
          }

          // /tasks schedule — list scheduled tasks (type=cron, not once)
          const schedules = engine.listAll().filter((t) => t.type === "cron");
          if (schedules.length === 0) {
            await safeKeyboard(
              metadata,
              "No schedules configured.",
              [
                [{ label: "New Schedule", data: "/tasks schedule new" }],
                [{ label: "« Tasks", data: "/tasks" }],
              ],
            );
            return;
          }

          const sButtons: KeyboardLayout = [];
          const sLines: string[] = [];
          for (const s of schedules) {
            const icon = s.enabled ? "●" : "○";
            const expr = (s.config as { expression: string }).expression;
            sLines.push(`${icon} ${s.label ?? s.id} — ${expr} — ${s.run_count ?? 0} runs`);
            sButtons.push([{ label: s.label ?? s.id, data: `/tasks ${s.id}` }]);
          }
          sButtons.push([
            { label: "New Schedule", data: "/tasks schedule new" },
            { label: "« Tasks", data: "/tasks" },
          ]);

          await safeKeyboard(
            metadata,
            [`Schedules (${schedules.length}):`, ...sLines].join("\n"),
            sButtons,
          );
          return;
        }

        // ── Category: cron ─────────────────────────────────────────
        if (category === "cron" || category === "crons") {

          // /tasks cron new <expression> <action...>
          if (subCommand === "new" || subCommand === "create") {
            const expr = rest[2];
            if (!expr) {
              await safeSend(metadata, "Usage: /tasks cron new <cron-expression> <action>\n\nExamples:\n/tasks cron new \"0 */6 * * *\" check disk space\n/tasks cron new \"*/15 * * * *\" poll API\n/tasks cron new once 2026-06-01T09:00 one-time report");
              return;
            }

            try {
              if (expr === "once") {
                // /tasks cron new once <datetime> <action>
                const datetime = rest[3];
                if (!datetime) {
                  await safeSend(metadata, "Usage: /tasks cron new once <ISO-datetime> <action>\nExample: /tasks cron new once 2026-06-01T09:00 run migration");
                  return;
                }
                const parsed = new Date(datetime);
                if (isNaN(parsed.getTime())) {
                  await safeSend(metadata, `Invalid datetime: ${datetime}. Use ISO format (e.g. 2026-06-01T09:00)`);
                  return;
                }
                const prompt = rest.slice(4).join(" ") || "one-time task";
                const trigger = engine.add({
                  type: "once",
                  enabled: true,
                  config: { at: parsed.toISOString() } as import("../triggers/engine.js").OnceConfig,
                  action: { type: "agent", prompt, notify: true },
                  label: `Once: ${datetime}`,
                  max_runs: 1,
                });
                await safeKeyboard(
                  metadata,
                  `One-time task created: ${datetime}\nAction: ${prompt}`,
                  [
                    [
                      { label: "Cancel", data: `/tasks delete ${trigger.id}` },
                      { label: "« Cron", data: "/tasks cron" },
                    ],
                  ],
                );
                return;
              }

              // Raw cron expression
              const prompt = rest.slice(3).join(" ") || "cron task";
              const trigger = engine.add({
                type: "cron",
                enabled: true,
                config: { expression: expr } as import("../triggers/engine.js").CronConfig,
                action: { type: "agent", prompt, notify: true },
                label: `Cron: ${expr}`,
              });
              await safeKeyboard(
                metadata,
                `Cron created: ${expr}\nAction: ${prompt}\nStatus: enabled`,
                [
                  [
                    { label: "Pause", data: `/tasks disable ${trigger.id}` },
                    { label: "Test", data: `/tasks test ${trigger.id}` },
                  ],
                  [{ label: "« Cron", data: "/tasks cron" }],
                ],
              );
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              await safeSend(metadata, `Failed to create cron: ${msg}`);
            }
            return;
          }

          // /tasks cron delete <id>
          if (subCommand === "delete" || subCommand === "remove") {
            const id = rest[2];
            if (!id) { await safeSend(metadata, "Usage: /tasks cron delete <id>"); return; }
            const result = engine.remove(id);
            await safeSend(metadata, result ? `Cron deleted: ${id}` : `Cron not found: ${id}`);
            return;
          }

          // /tasks cron enable/disable <id>
          if (subCommand === "enable") {
            const id = rest[2];
            if (!id) { await safeSend(metadata, "Usage: /tasks cron enable <id>"); return; }
            engine.enable(id);
            await safeSend(metadata, `Cron enabled: ${id}`);
            return;
          }
          if (subCommand === "disable") {
            const id = rest[2];
            if (!id) { await safeSend(metadata, "Usage: /tasks cron disable <id>"); return; }
            engine.disable(id);
            await safeSend(metadata, `Cron disabled: ${id}`);
            return;
          }

          // /tasks cron — list cron + once tasks
          const crons = engine.listAll().filter((t) => t.type === "cron" || t.type === "once");
          if (crons.length === 0) {
            await safeKeyboard(
              metadata,
              "No cron jobs configured.",
              [
                [{ label: "New Cron", data: "/tasks cron new" }],
                [{ label: "« Tasks", data: "/tasks" }],
              ],
            );
            return;
          }

          const cButtons: KeyboardLayout = [];
          const cLines: string[] = [];
          for (const c of crons) {
            const icon = c.enabled ? "●" : "○";
            const detail = c.type === "once"
              ? (c.config as { at: string }).at
              : (c.config as { expression: string }).expression;
            cLines.push(`${icon} ${c.label ?? c.id} — ${detail} — ${c.run_count ?? 0} runs`);
            cButtons.push([{ label: c.label ?? c.id, data: `/tasks ${c.id}` }]);
          }
          cButtons.push([
            { label: "New Cron", data: "/tasks cron new" },
            { label: "« Tasks", data: "/tasks" },
          ]);

          await safeKeyboard(
            metadata,
            [`Cron Jobs (${crons.length}):`, ...cLines].join("\n"),
            cButtons,
          );
          return;
        }

        // ── Shared operations: /task enable|disable|delete|test <id> ──
        if (category === "enable") {
          const id = rest[1];
          if (!id) { await safeSend(metadata, "Usage: /tasks enable <id>"); return; }
          const result = engine.enable(id);
          await safeSend(metadata, result ? `Task enabled: ${id}` : `Task not found: ${id}`);
          return;
        }
        if (category === "disable" || category === "pause") {
          const id = rest[1];
          if (!id) { await safeSend(metadata, "Usage: /tasks disable <id>"); return; }
          const result = engine.disable(id);
          await safeSend(metadata, result ? `Task disabled: ${id}` : `Task not found: ${id}`);
          return;
        }
        if (category === "delete" || category === "remove") {
          const id = rest[1];
          if (!id) { await safeSend(metadata, "Usage: /tasks delete <id>"); return; }
          const result = engine.remove(id);
          await safeSend(metadata, result ? `Task deleted: ${id}` : `Task not found: ${id}`);
          return;
        }
        if (category === "test" || category === "run") {
          const id = rest[1];
          if (!id) { await safeSend(metadata, "Usage: /tasks test <id>"); return; }
          const task = engine.get(id);
          if (!task) { await safeSend(metadata, `Task not found: ${id}`); return; }
          await safeSend(metadata, `Firing: ${task.label ?? id}...`);
          try {
            await engine.fire(id, { test: true, timestamp: new Date().toISOString() });
            await safeSend(metadata, `Task fired: ${task.label ?? id} (run #${(task.run_count ?? 0) + 1})`);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            await safeSend(metadata, `Task failed: ${msg.slice(0, 500)}`);
          }
          return;
        }

        // ── /task <id> — detail view for any task ───────────────────
        if (category && !["list", "trigger", "triggers", "schedule", "schedules", "cron", "crons"].includes(category)) {
          const task = engine.get(category);
          if (task) {
            const taskCategory = isEventTrigger(task.type) ? "trigger" : task.type === "once" ? "cron" : "schedule";
            const configSummary = task.type === "cron"
              ? `schedule: ${(task.config as { expression: string }).expression}`
              : task.type === "once"
              ? `at: ${(task.config as { at: string }).at}`
              : task.type === "webhook"
              ? `source: ${(task.config as { service?: string }).service ?? "generic"}`
              : `type: ${task.type}`;

            const detailLines = [
              `${task.label ?? task.id} (${task.id})`,
              `category: ${taskCategory}`,
              `type: ${task.type}`,
              `enabled: ${task.enabled}`,
              configSummary,
              `action: ${task.action.type}${task.action.prompt ? ` — ${task.action.prompt.slice(0, 60)}` : ""}${task.action.command ? ` — ${task.action.command.slice(0, 60)}` : ""}`,
              `runs: ${task.run_count ?? 0}${task.max_runs ? ` / ${task.max_runs}` : ""}`,
              task.last_fired ? `last fired: ${formatAge(new Date(task.last_fired).getTime())}` : "last fired: never",
            ];
            await safeKeyboard(
              metadata,
              detailLines.join("\n"),
              [
                [
                  task.enabled
                    ? { label: "Disable", data: `/tasks disable ${task.id}` }
                    : { label: "Enable", data: `/tasks enable ${task.id}` },
                  { label: "Test", data: `/tasks test ${task.id}` },
                  { label: "Delete", data: `/tasks delete ${task.id}` },
                ],
                [{ label: `« ${taskCategory === "trigger" ? "Triggers" : taskCategory === "schedule" ? "Schedules" : "Cron"}`, data: `/tasks ${taskCategory}` }],
              ],
            );
            return;
          }
        }

        // ── /task — hub menu ────────────────────────────────────────
        const allTasks = engine.listAll();
        const triggerCount = allTasks.filter((t) => isEventTrigger(t.type)).length;
        const scheduleCount = allTasks.filter((t) => t.type === "cron").length;
        const cronCount = allTasks.filter((t) => t.type === "cron" || t.type === "once").length;

        await safeKeyboard(
          metadata,
          [
            `Tasks (${allTasks.length} total)`,
            "",
            `Triggers: ${triggerCount} (${EVENT_TRIGGER_TYPES.join(", ")})`,
            `Schedules: ${scheduleCount} (daily, weekly, monthly, custom)`,
            `Cron: ${cronCount} (cron expressions, one-time)`,
          ].join("\n"),
          [
            [
              { label: `Triggers (${triggerCount})`, data: "/tasks trigger" },
              { label: `Schedules (${scheduleCount})`, data: "/tasks schedule" },
            ],
            [
              { label: `Cron (${cronCount})`, data: "/tasks cron" },
            ],
          ],
        );
        return;
      }

      // ── Billing commands ───────────────────────────────────────────

      case "plan": {
        const { isBillingConfigured } = await import("../../billing/stripe.js");
        if (!isBillingConfigured()) {
          await safeSend(metadata, "Billing is not configured on this instance.");
          return;
        }

        const { getLicenseState } = await import("../../billing/license.js");
        const { getConfiguredConnectorCount } = await import("../../../shared/connector.js");

        const licState = getLicenseState();
        const connectorCount = getConfiguredConnectorCount();
        const triggerEngine = opts.getTriggerEngine?.();
        const triggerCount = triggerEngine?.listAll().filter((t) => t.enabled).length ?? 0;

        const triggerLimitDisplay = licState.triggerLimit === Infinity ? "∞" : String(licState.triggerLimit);

        const lines: string[] = [
          `Plan: ${licState.label}`,
          `Status: ${licState.status}`,
          "",
          `Connectors: ${connectorCount}/${licState.connectorLimit}`,
          `Triggers: ${triggerCount}/${triggerLimitDisplay}`,
        ];

        if (connectorCount > licState.connectorLimit) {
          lines.push("", `⚠ Over connector limit — disconnect ${connectorCount - licState.connectorLimit} connector(s) or upgrade.`);
        }
        if (licState.pastDue) {
          lines.push("", "⚠ Payment past due — update your payment method to avoid downgrade.");
        }
        if (licState.gracePeriod && !licState.pastDue) {
          lines.push("", "Offline grace period active.");
        }

        const buttons: KeyboardLayout = [];
        if (licState.tier === "free") {
          buttons.push([
            { label: "Upgrade to Pro", data: "/upgrade" },
          ]);
        } else {
          buttons.push([
            { label: "Manage Portal", data: "/billing portal" },
            { label: "Cancel", data: "/cancel" },
          ]);
        }
        buttons.push([{ label: "« Billing", data: "/billing" }]);

        await safeKeyboard(metadata, lines.join("\n"), buttons);
        return;
      }

      case "upgrade": {
        const { getLicenseState } = await import("../../billing/license.js");
        const { TIER_LIMITS, PRO_PRICE_DISPLAY } = await import("../../billing/config.js");
        const licState = getLicenseState();

        if (licState.tier !== "free") {
          await safeKeyboard(
            metadata,
            `You're already on the ${licState.label} plan.`,
            [[{ label: "« Billing", data: "/billing" }]],
          );
          return;
        }

        const email = arg?.trim();
        if (!email) {
          const freeLimits = TIER_LIMITS.free;
          const proLimits = TIER_LIMITS.pro;
          const proTriggers = proLimits.triggers === Infinity ? "unlimited" : String(proLimits.triggers);

          await safeKeyboard(
            metadata,
            [
              `${freeLimits.label} (current): ${freeLimits.connectors} connectors, ${freeLimits.triggers} triggers`,
              `${proLimits.label}: ${proLimits.connectors} connectors, ${proTriggers} triggers — ${PRO_PRICE_DISPLAY}`,
              "",
              "Usage: /upgrade your@email.com",
            ].join("\n"),
            [
              [{ label: "View Plan", data: "/plan" }],
              [{ label: "« Billing", data: "/billing" }],
            ],
          );
          return;
        }

        // Basic email validation
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          await safeSend(metadata, "Invalid email address. Usage: /upgrade your@email.com");
          return;
        }

        try {
          const { createCheckoutViaRelay } = await import("../../billing/relay-proxy.js");
          const result = await createCheckoutViaRelay(email);
          if (!result) {
            await safeSend(metadata, "Unable to create checkout. Please check your connection and try again.");
            return;
          }
          await safeKeyboard(
            metadata,
            `Checkout ready for ${email}.\nComplete your upgrade:`,
            [[{ label: "Open Checkout", url: result.url }]],
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await safeSend(metadata, `Checkout failed: ${msg}`);
        }
        return;
      }

      case "billing": {
        const subCommand = rest[0]?.toLowerCase();

        // /billing events — show recent billing event log
        if (subCommand === "events") {
          const { getRecentEvents } = await import("../../billing/store.js");
          const events = getRecentEvents(10);

          if (events.length === 0) {
            await safeKeyboard(
              metadata,
              "No billing events recorded.",
              [[{ label: "« Billing", data: "/billing" }]],
            );
            return;
          }

          const lines = events.map((e) => {
            const when = formatAge(toMs(e.processed_at));
            return `${e.type} — ${when}`;
          });

          await safeKeyboard(
            metadata,
            [`Recent billing events:`, "", ...lines].join("\n"),
            [
              [{ label: "View Plan", data: "/plan" }],
              [{ label: "« Billing", data: "/billing" }],
            ],
          );
          return;
        }

        // /billing portal — open Stripe Customer Portal via relay
        if (subCommand === "portal") {
          const { getSubscription } = await import("../../billing/store.js");
          const subscription = getSubscription();

          if (!subscription?.customer_id) {
            await safeKeyboard(
              metadata,
              "No active subscription.\nUpgrade to Pro to access the billing portal.",
              [
                [{ label: "Upgrade", data: "/upgrade" }],
                [{ label: "« Billing", data: "/billing" }],
              ],
            );
            return;
          }

          try {
            const { createPortalViaRelay } = await import("../../billing/relay-proxy.js");
            const result = await createPortalViaRelay(subscription.customer_id);
            if (!result) {
              await safeSend(metadata, "Unable to open billing portal. Please check your connection and try again.");
              return;
            }
            await safeKeyboard(
              metadata,
              "Manage your subscription, payment method, and invoices:",
              [
                [{ label: "Open Billing Portal", url: result.url }],
                [{ label: "« Billing", data: "/billing" }],
              ],
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            await safeSend(metadata, `Failed to open billing portal: ${msg}`);
          }
          return;
        }

        // /billing — hub menu
        const { getLicenseState } = await import("../../billing/license.js");
        const { getConfiguredConnectorCount } = await import("../../../shared/connector.js");

        const licState = getLicenseState();
        const connectorCount = getConfiguredConnectorCount();
        const triggerEngine = opts.getTriggerEngine?.();
        const triggerCount = triggerEngine?.listAll().filter((t) => t.enabled).length ?? 0;
        const triggerLimitDisplay = licState.triggerLimit === Infinity ? "∞" : String(licState.triggerLimit);

        const planLines = [
          `Plan: ${licState.label}`,
          `Status: ${licState.status}`,
          `Connectors: ${connectorCount}/${licState.connectorLimit}`,
          `Triggers: ${triggerCount}/${triggerLimitDisplay}`,
        ];

        if (connectorCount > licState.connectorLimit) {
          planLines.push("", `⚠ Over connector limit — disconnect ${connectorCount - licState.connectorLimit} connector(s) or upgrade.`);
        }
        if (licState.pastDue) {
          planLines.push("", "⚠ Payment past due.");
        }

        const buttons: KeyboardLayout = [
          [{ label: "View Plan", data: "/plan" }],
        ];

        if (licState.tier === "free") {
          buttons.push([{ label: "Upgrade to Pro", data: "/upgrade" }]);
        } else {
          buttons.push([
            { label: "Manage Portal", data: "/billing portal" },
            { label: "Events", data: "/billing events" },
          ]);
          buttons.push([{ label: "Cancel", data: "/cancel" }]);
        }

        await safeKeyboard(metadata, planLines.join("\n"), buttons);
        return;
      }

      case "cancel": {
        // Redirect to billing portal — handles cancellation, downgrades,
        // and payment method changes via Stripe's hosted UI.
        const { getSubscription } = await import("../../billing/store.js");
        const subscription = getSubscription();

        if (!subscription?.customer_id) {
          await safeSend(metadata, "No active subscription. Use /upgrade to subscribe.");
          return;
        }

        try {
          const { createPortalViaRelay } = await import("../../billing/relay-proxy.js");
          const result = await createPortalViaRelay(subscription.customer_id);
          if (!result) {
            await safeSend(metadata, "Unable to open billing portal. Please check your connection and try again.");
            return;
          }
          await safeKeyboard(
            metadata,
            "Manage or cancel your subscription in the billing portal:",
            [[{ label: "Open Billing Portal", url: result.url }]],
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await safeSend(metadata, `Portal failed: ${msg}`);
        }
        return;
      }

      // ── Provider management ─────────────────────────────────────────

      case "provider":
      case "providers": {
        const { loadConfig, getConfigDir } = await import("../../../shared/config.js");
        const { readFileSync: readFs, writeFileSync: writeFs, existsSync: fileExists } = await import("node:fs");
        const { join: pathJoin } = await import("node:path");

        const subCommand = rest[0]?.toLowerCase();

        // /provider add — preset-aware provider addition
        //
        // Supports three flows:
        //   1. /provider add              → show preset picker (buttons)
        //   2. /provider add <preset-id>  → auto-add if env set, else ask for key
        //   3. /provider add <id> <key>   → add preset with API key
        //   4. /provider add <id> <url> <key> → manual add (original flow)
        if (subCommand === "add") {
          const { PROVIDER_PRESETS, getPreset } = await import("../../agent/drivers/presets.js");
          const providerId = rest[1]?.toLowerCase();

          // Flow 1: No args → show available presets as buttons
          if (!providerId) {
            const config = loadConfig();
            const configuredIds = new Set([
              ...listDrivers(),
              ...(config.providers ?? []).map((p) => p.id),
            ]);

            const presetLines: string[] = [];
            const presetButtons: KeyboardLayout = [];

            for (const preset of PROVIDER_PRESETS) {
              if (configuredIds.has(preset.id)) continue;
              const hasKey = !!(
                process.env[preset.envKey] ??
                (preset.envKeyAlt ? process.env[preset.envKeyAlt] : undefined)
              );
              const status = hasKey ? "●" : "○";
              const envHint = hasKey ? ` ✓ ${preset.envKey}` : "";
              const modelHint = preset.defaultModel ? ` — ${preset.defaultModel}` : "";
              presetLines.push(`  ${status} ${preset.name}${modelHint}${envHint}`);
              presetButtons.push([
                { label: preset.name, data: `/provider add ${preset.id}` },
              ]);
            }

            if (presetLines.length === 0) {
              await safeSend(metadata, "All known providers are already configured.");
              return;
            }

            presetButtons.push([{ label: "« Providers", data: "/providers" }]);

            await safeKeyboard(
              metadata,
              ["Add a Provider:", "", ...presetLines, "", "Tap to add:"].join("\n"),
              presetButtons,
            );
            return;
          }

          const providerUrl = rest[2];
          const providerKey = rest[3];

          // Check if this is a known preset
          const preset = getPreset(providerId);

          // Flow 2: /provider add <preset-id> — preset with no key
          if (preset && !providerUrl && !providerKey) {
            const hasKey = !!(
              process.env[preset.envKey] ??
              (preset.envKeyAlt ? process.env[preset.envKeyAlt] : undefined)
            );

            if (hasKey) {
              // Env var set → auto-configure from preset
              try {
                const configDir = getConfigDir();
                const configPath = pathJoin(configDir, "config.json");
                let fileConfig: Record<string, unknown> = {};
                if (fileExists(configPath)) {
                  fileConfig = JSON.parse(readFs(configPath, "utf-8"));
                }

                const providers = (fileConfig.providers as Array<Record<string, unknown>>) ?? [];
                if (providers.some((p) => p.id === preset.id)) {
                  await safeSend(metadata, `Provider "${preset.name}" already exists.`);
                  return;
                }

                providers.push({
                  id: preset.id,
                  name: preset.name,
                  baseUrl: preset.baseUrl,
                  apiKey: `{env:${preset.envKey}}`,
                  type: "openai-compatible",
                  ...(preset.defaultModel ? { defaultModel: preset.defaultModel } : {}),
                });
                fileConfig.providers = providers;
                writeFs(configPath, JSON.stringify(fileConfig, null, 2) + "\n");

                const modelHint = preset.defaultModel
                  ? `\n\nUse: /model ${preset.id}:${preset.defaultModel}`
                  : "";

                await safeKeyboard(
                  metadata,
                  `✓ ${preset.name} added (${preset.envKey} detected)${modelHint}`,
                  [[{ label: "« Providers", data: "/providers" }]],
                );
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                await safeSend(metadata, `Failed to add provider: ${msg}`);
              }
              return;
            }

            // Env var not set → ask for API key
            await safeSend(
              metadata,
              `${preset.name} — API key required.\n\nSend:\n/provider add ${preset.id} <your-api-key>\n\nOr set ${preset.envKey} in your environment.`,
            );
            return;
          }

          // Flow 3: /provider add <preset-id> <key> — preset with API key (no URL)
          if (preset && providerUrl && !providerKey) {
            // providerUrl is actually the API key here (2nd arg after preset ID)
            const apiKey = providerUrl;
            try {
              const configDir = getConfigDir();
              const configPath = pathJoin(configDir, "config.json");
              let fileConfig: Record<string, unknown> = {};
              if (fileExists(configPath)) {
                fileConfig = JSON.parse(readFs(configPath, "utf-8"));
              }

              const providers = (fileConfig.providers as Array<Record<string, unknown>>) ?? [];
              if (providers.some((p) => p.id === preset.id)) {
                await safeSend(metadata, `Provider "${preset.name}" already exists.`);
                return;
              }

              providers.push({
                id: preset.id,
                name: preset.name,
                baseUrl: preset.baseUrl,
                apiKey: `{env:${preset.envKey}}`,
                type: "openai-compatible",
                ...(preset.defaultModel ? { defaultModel: preset.defaultModel } : {}),
              });
              fileConfig.providers = providers;
              writeFs(configPath, JSON.stringify(fileConfig, null, 2) + "\n");

              // Save the actual API key to secrets
              const { saveSecret } = await import("../../../shared/secrets.js");
              saveSecret(preset.envKey, apiKey);

              // Delete the user message containing the API key (security)
              if (metadata.message_id) {
                await opts.channels.deleteMessage(metadata.channel, metadata.chat_id, metadata.message_id);
              }

              const modelHint = preset.defaultModel
                ? `\n\nUse: /model ${preset.id}:${preset.defaultModel}`
                : "";

              await safeKeyboard(
                metadata,
                `✓ ${preset.name} added${modelHint}`,
                [[{ label: "« Providers", data: "/providers" }]],
              );
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              await safeSend(metadata, `Failed to add provider: ${msg}`);
            }
            return;
          }

          // Flow 4: /provider add <id> <base-url> <api-key> — manual add
          if (!providerUrl || !providerKey) {
            await safeSend(
              metadata,
              `Usage: /provider add <id> <base-url> <api-key>\n\nOr tap a preset: /provider add`,
            );
            return;
          }

          try {
            const configDir = getConfigDir();
            const configPath = pathJoin(configDir, "config.json");
            let fileConfig: Record<string, unknown> = {};
            if (fileExists(configPath)) {
              fileConfig = JSON.parse(readFs(configPath, "utf-8"));
            }

            const providers = (fileConfig.providers as Array<Record<string, unknown>>) ?? [];
            if (providers.some((p) => p.id === providerId)) {
              await safeSend(metadata, `Provider "${providerId}" already exists.`);
              return;
            }

            const displayName = providerId.charAt(0).toUpperCase() + providerId.slice(1);
            providers.push({
              id: providerId,
              name: displayName,
              baseUrl: providerUrl,
              apiKey: `{env:${providerId.toUpperCase()}_API_KEY}`,
              type: "openai-compatible",
            });
            fileConfig.providers = providers;
            writeFs(configPath, JSON.stringify(fileConfig, null, 2) + "\n");

            // Save the actual API key to secrets
            const { saveSecret } = await import("../../../shared/secrets.js");
            saveSecret(`${providerId.toUpperCase()}_API_KEY`, providerKey);

            // Delete the user message containing the API key (security)
            if (metadata.message_id) {
              await opts.channels.deleteMessage(metadata.channel, metadata.chat_id, metadata.message_id);
            }

            await safeKeyboard(
              metadata,
              `Provider added: ${displayName}\nURL: ${providerUrl}\n\nUse: /model ${providerId}:model-name`,
              [[{ label: "« Providers", data: "/providers" }]],
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            await safeSend(metadata, `Failed to add provider: ${msg}`);
          }
          return;
        }

        // /provider remove <id>
        if (subCommand === "remove" || subCommand === "rm") {
          const removeId = rest[1]?.toLowerCase();
          if (!removeId) {
            await safeSend(metadata, "Usage: /provider remove <id>");
            return;
          }

          try {
            const configDir = getConfigDir();
            const configPath = pathJoin(configDir, "config.json");
            if (!fileExists(configPath)) {
              await safeSend(metadata, `Provider "${removeId}" not found.`);
              return;
            }

            const fileConfig = JSON.parse(readFs(configPath, "utf-8"));
            const providers = (fileConfig.providers as Array<Record<string, unknown>>) ?? [];
            const idx = providers.findIndex((p) => p.id === removeId);
            if (idx === -1) {
              await safeSend(metadata, `Provider "${removeId}" not found.`);
              return;
            }

            providers.splice(idx, 1);
            fileConfig.providers = providers;
            writeFs(configPath, JSON.stringify(fileConfig, null, 2) + "\n");

            await safeKeyboard(
              metadata,
              `Provider removed: ${removeId}`,
              [[{ label: "« Providers", data: "/providers" }]],
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            await safeSend(metadata, `Failed to remove provider: ${msg}`);
          }
          return;
        }

        // /providers or /provider list — show all providers + presets
        const config = loadConfig();
        const drivers = listDrivers();
        const { PROVIDER_PRESETS: allPresets } = await import("../../agent/drivers/presets.js");

        const lines: string[] = [];
        const buttons: KeyboardLayout = [];
        const configuredIds = new Set([
          ...drivers,
          ...(config.providers ?? []).map((p) => p.id),
        ]);

        // Built-in drivers
        lines.push("Built-in:");
        for (const driver of drivers) {
          const isCurrent = state.model.startsWith(driver);
          lines.push(`  ${isCurrent ? "●" : "○"} ${driver}`);
        }

        // Custom providers from config
        const customProviders = config.providers ?? [];
        if (customProviders.length > 0) {
          lines.push("");
          lines.push("Custom:");
          for (const p of customProviders) {
            lines.push(`  ○ ${p.name ?? p.id} — ${p.baseUrl}`);
            buttons.push([
              { label: `Use ${p.id}`, data: `/model ${p.id}` },
              { label: `Remove ${p.id}`, data: `/provider remove ${p.id}` },
            ]);
          }
        }

        // Discovered presets (env var set, not yet configured)
        const discoveredPresets = allPresets.filter((preset) => {
          if (configuredIds.has(preset.id)) return false;
          return !!(
            process.env[preset.envKey] ??
            (preset.envKeyAlt ? process.env[preset.envKeyAlt] : undefined)
          );
        });

        if (discoveredPresets.length > 0) {
          lines.push("");
          lines.push("Discovered (API key detected):");
          for (const preset of discoveredPresets) {
            const modelHint = preset.defaultModel ? ` — ${preset.defaultModel}` : "";
            lines.push(`  ✓ ${preset.name}${modelHint}`);
            buttons.push([
              { label: `Add ${preset.name}`, data: `/provider add ${preset.id}` },
            ]);
          }
        }

        buttons.push([
          { label: "Add Provider", data: "/provider add" },
          { label: "Browse Models", data: "/model list" },
        ]);

        const totalCount = drivers.length + customProviders.length + discoveredPresets.length;
        await safeKeyboard(
          metadata,
          [`Providers (${totalCount} active, ${allPresets.length} presets available):`, "", ...lines].join("\n"),
          buttons,
        );
        return;
      }

      // ── Configuration display ─────────────────────────────────────────

      case "config": {
        const { loadConfig } = await import("../../../shared/config.js");
        const config = loadConfig();

        const lines: string[] = [];
        lines.push("Configuration:");
        lines.push("");

        // Agent
        lines.push(`Model: ${config.agent.model}`);
        lines.push(`Max Tokens: ${config.agent.maxTokens}`);
        lines.push(`Temperature: ${config.agent.temperature}`);
        lines.push(`Extended Thinking: ${config.agent.extendedThinking}`);

        // Channels
        const channelNames = Object.keys(config.channels ?? {});
        if (channelNames.length > 0) {
          lines.push("");
          lines.push(`Channels: ${channelNames.join(", ")}`);
        }

        // Connectors
        const connectorNames = Object.keys(config.connectors ?? {});
        if (connectorNames.length > 0) {
          lines.push(`Connectors: ${connectorNames.join(", ")}`);
        }

        // Providers
        const providerCount = config.providers?.length ?? 0;
        if (providerCount > 0) {
          lines.push(`Custom Providers: ${providerCount}`);
        }

        await safeKeyboard(
          metadata,
          lines.join("\n"),
          [
            [
              { label: "Model", data: "/model" },
              { label: "Providers", data: "/providers" },
            ],
            [
              { label: "Connectors", data: "/connectors" },
              { label: "Channels", data: "/channels" },
            ],
          ],
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
// (Old JSON-file-based task helpers removed — tasks now use TriggerEngine)

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

/** Normalize a timestamp that may be in seconds or milliseconds to ms. */
function toMs(ts: number): number {
  return ts < 1e12 ? ts * 1000 : ts;
}

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
