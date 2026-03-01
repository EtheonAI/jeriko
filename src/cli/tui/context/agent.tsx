/**
 * TUI AgentProvider — Abstracts daemon vs. in-process agent interaction.
 *
 * Processes AgentEvents from either path into unified reactive signals
 * that drive the streaming display. Both modes produce identical event
 * streams — the provider normalizes them for the UI layer.
 */

import {
  createContext,
  useContext,
  createSignal,
  onMount,
  type ParentProps,
  type Accessor,
} from "solid-js";
import { randomUUID } from "node:crypto";
import { useSession, type DisplayMessage } from "./session.js";
import { useToast } from "./toast.js";
import type { AgentEvent } from "../../../daemon/agent/agent.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ToolCallStatus = "running" | "done" | "error";

export interface ToolCallState {
  id: string;
  name: string;
  arguments: string;
  status: ToolCallStatus;
  result?: string;
}

interface AgentContextValue {
  /** Whether a response is currently streaming */
  isStreaming: Accessor<boolean>;
  /** Accumulated text from the current response */
  streamingText: Accessor<string>;
  /** Accumulated thinking text from the current response */
  thinkingText: Accessor<string>;
  /** Active tool calls in the current turn */
  activeToolCalls: Accessor<ToolCallState[]>;
  /** Token usage from the last completed turn */
  lastTurnTokens: Accessor<{ in: number; out: number }>;
  /** Current model name */
  modelName: Accessor<string>;
  /** Send a user message to the agent */
  sendMessage: (text: string) => Promise<void>;
  /** Cancel the current streaming response */
  cancelStream: () => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AgentContext = createContext<AgentContextValue>();

export function useAgent(): AgentContextValue {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error("useAgent() must be used within an <AgentProvider>");
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AgentProvider(props: ParentProps) {
  const session = useSession();
  const toast = useToast();

  const [isStreaming, setIsStreaming] = createSignal(false);
  const [streamingText, setStreamingText] = createSignal("");
  const [thinkingText, setThinkingText] = createSignal("");
  const [activeToolCalls, setActiveToolCalls] = createSignal<ToolCallState[]>([]);
  const [lastTurnTokens, setLastTurnTokens] = createSignal({ in: 0, out: 0 });
  const [modelName, setModelName] = createSignal("claude");
  const [useDaemon, setUseDaemon] = createSignal(false);

  let abortController: AbortController | null = null;
  let configRef: Awaited<ReturnType<typeof import("../../../shared/config.js").loadConfig>> | null = null;
  let toolsRegistered = false;

  // Detect daemon availability on mount
  onMount(async () => {
    const config = (await import("../../../shared/config.js")).loadConfig();
    configRef = config;
    setModelName(config.agent.model);

    try {
      const { isDaemonRunning } = await import("../../../daemon/api/socket.js");
      const running = await isDaemonRunning();
      setUseDaemon(running);
    } catch {
      setUseDaemon(false);
    }
  });

  // -----------------------------------------------------------------------
  // Event processing — shared between daemon and in-process modes
  // -----------------------------------------------------------------------

  const processEvent = (event: Record<string, unknown>): void => {
    const type = event.type as string;

    switch (type) {
      case "text_delta":
        setStreamingText((prev) => prev + (event.content as string));
        break;

      case "thinking":
        setThinkingText((prev) => prev + (event.content as string));
        break;

      case "tool_call_start": {
        const tc = event.toolCall as { id: string; name: string; arguments: string };
        setActiveToolCalls((prev) => [
          ...prev,
          {
            id: tc.id,
            name: tc.name,
            arguments: tc.arguments ?? "",
            status: "running",
          },
        ]);
        break;
      }

      case "tool_result": {
        const toolCallId = event.toolCallId as string;
        const result = event.result as string;
        const isError = event.isError as boolean;
        setActiveToolCalls((prev) =>
          prev.map((tc) =>
            tc.id === toolCallId
              ? { ...tc, status: isError ? "error" : "done", result }
              : tc,
          ),
        );
        break;
      }

      case "turn_complete":
        setLastTurnTokens({
          in: (event.tokensIn as number) ?? 0,
          out: (event.tokensOut as number) ?? 0,
        });
        break;

      case "compaction":
        toast.push(
          `Context compacted: ${event.beforeTokens} → ${event.afterTokens} tokens`,
          { variant: "info" },
        );
        break;

      case "error":
        toast.push(event.message as string, { variant: "error", durationMs: 5000 });
        break;
    }
  };

  // -----------------------------------------------------------------------
  // Finalize a completed turn — persist the assistant message
  // -----------------------------------------------------------------------

  const finalizeTurn = (startTime: number): void => {
    const text = streamingText();
    const thinking = thinkingText();
    const toolCalls = activeToolCalls();
    const tokens = lastTurnTokens();

    if (text || toolCalls.length > 0) {
      const assistantMsg: DisplayMessage = {
        id: randomUUID(),
        role: "assistant",
        content: text,
        thinking: thinking || undefined,
        toolCalls: toolCalls.length > 0 ? [...toolCalls] : undefined,
        meta: {
          model: modelName(),
          tokensIn: tokens.in,
          tokensOut: tokens.out,
          durationMs: Date.now() - startTime,
        },
        createdAt: Date.now(),
      };
      session.addDisplayMessage(assistantMsg);
    }

    // Reset streaming state
    setIsStreaming(false);
    setStreamingText("");
    setThinkingText("");
    setActiveToolCalls([]);
  };

  // -----------------------------------------------------------------------
  // In-process agent loop
  // -----------------------------------------------------------------------

  const ensureToolsRegistered = async (): Promise<void> => {
    if (toolsRegistered) return;
    await Promise.all([
      import("../../../daemon/agent/tools/bash.js"),
      import("../../../daemon/agent/tools/read.js"),
      import("../../../daemon/agent/tools/write.js"),
      import("../../../daemon/agent/tools/edit.js"),
      import("../../../daemon/agent/tools/list.js"),
      import("../../../daemon/agent/tools/search.js"),
      import("../../../daemon/agent/tools/web.js"),
      import("../../../daemon/agent/tools/browse.js"),
      import("../../../daemon/agent/tools/parallel.js"),
      import("../../../daemon/agent/tools/delegate.js"),
    ]);
    toolsRegistered = true;
  };

  const runInProcess = async (text: string): Promise<void> => {
    await ensureToolsRegistered();

    const { runAgent } = await import("../../../daemon/agent/agent.js");
    const { addMessage } = await import("../../../daemon/agent/session/message.js");

    const currentSession = session.currentSession();
    if (!currentSession || !configRef) return;

    // Persist user message
    addMessage(currentSession.id, "user", text);

    // Build conversation history
    const history = session.getConversationHistory().map((m) => ({
      role: m.role as "user" | "assistant" | "system" | "tool",
      content: m.content,
    }));

    const agentConfig = {
      sessionId: currentSession.id,
      backend: configRef.agent.model,
      model: configRef.agent.model,
      maxTokens: configRef.agent.maxTokens,
      temperature: configRef.agent.temperature,
      extendedThinking: configRef.agent.extendedThinking,
      toolIds: null,
      signal: abortController?.signal,
    };

    try {
      for await (const event of runAgent(agentConfig, history)) {
        processEvent(event as unknown as Record<string, unknown>);
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        toast.push(
          `Agent error: ${err instanceof Error ? err.message : String(err)}`,
          { variant: "error", durationMs: 5000 },
        );
      }
    }
  };

  // -----------------------------------------------------------------------
  // Daemon mode
  // -----------------------------------------------------------------------

  const runViaDaemon = async (text: string): Promise<void> => {
    const { sendStreamRequest } = await import("../../../daemon/api/socket.js");

    const currentSession = session.currentSession();
    const params: Record<string, unknown> = { message: text };
    if (currentSession) params.session_id = currentSession.id;

    try {
      for await (const event of sendStreamRequest("ask", params, {
        signal: abortController?.signal,
      })) {
        processEvent(event);
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        toast.push(
          `Connection error: ${err instanceof Error ? err.message : String(err)}`,
          { variant: "error", durationMs: 5000 },
        );
      }
    }
  };

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  const sendMessage = async (text: string): Promise<void> => {
    if (isStreaming()) return;

    // Ensure we have a session
    if (!session.currentSession()) {
      session.newSession(modelName());
    }

    // Add user message to display
    const userMsg: DisplayMessage = {
      id: randomUUID(),
      role: "user",
      content: text,
      createdAt: Date.now(),
    };
    session.addDisplayMessage(userMsg);

    // Reset and start streaming
    setIsStreaming(true);
    setStreamingText("");
    setThinkingText("");
    setActiveToolCalls([]);
    abortController = new AbortController();

    const startTime = Date.now();

    if (useDaemon()) {
      await runViaDaemon(text);
    } else {
      await runInProcess(text);
    }

    finalizeTurn(startTime);
  };

  const cancelStream = (): void => {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
  };

  return (
    <AgentContext.Provider
      value={{
        isStreaming,
        streamingText,
        thinkingText,
        activeToolCalls,
        lastTurnTokens,
        modelName,
        sendMessage,
        cancelStream,
      }}
    >
      {props.children}
    </AgentContext.Provider>
  );
}
