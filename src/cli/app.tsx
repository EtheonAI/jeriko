/**
 * App — Root orchestrator component for the interactive CLI.
 *
 * Holds all state via a centralized reducer, connects backend to
 * components via callbacks, and manages phase transitions. This is
 * the single source of truth for the CLI's UI state.
 *
 * Event flow:
 *   1. User types message → handleSubmit(text)
 *   2. Check for exit → exit the app
 *   3. Check for slash command → dispatch, add system message
 *   4. Normal message → dispatch SET_PHASE("thinking"), call backend.send()
 *   5. Callbacks dispatch actions: text deltas, tool calls, etc.
 *   6. onTurnComplete → freeze into DisplayMessage, reset to "idle"
 */

import React, { useRef, useCallback } from "react";
import { Box, useApp } from "ink";
import { randomUUID } from "node:crypto";

import type { Backend, BackendCallbacks } from "./backend.js";
import { persistSetup } from "./backend.js";
import { isExitCommand, parseSlashCommand, SUB_AGENT_TOOLS } from "./commands.js";
import { capitalize, formatError, safeParseJson } from "./format.js";
import { t } from "./theme.js";
import type { Phase, DisplayToolCall } from "./types.js";
import type { ProviderOption } from "./lib/setup.js";
import { useAppState } from "./hooks/useAppReducer.js";
import { useSlashCommands } from "./hooks/useSlashCommands.js";

import { Messages, StreamingText } from "./components/Messages.js";
import { Input } from "./components/Input.js";
import { StatusBar } from "./components/StatusBar.js";
import { Setup } from "./components/Setup.js";

import { ToolCallView } from "./components/ToolCall.js";
import { SubAgentView, SubAgentList } from "./components/SubAgent.js";
import { Wizard } from "./components/Wizard.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { useSubAgents } from "./hooks/useSubAgents.js";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AppProps {
  backend: Backend;
  initialModel: string;
  initialPhase?: Phase;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const App: React.FC<AppProps> = ({
  backend,
  initialModel,
  initialPhase = "idle",
}) => {
  const { exit } = useApp();
  const [state, dispatch] = useAppState({
    phase: initialPhase,
    model: initialModel,
  });

  // Refs for mutable state used in callbacks
  const turnStartRef = useRef(0);
  const hasThinkingRef = useRef(false);
  const abortedRef = useRef(false);

  // ----- Helpers -----

  /** Add a system message to the history. */
  const addSystemMessage = useCallback((content: string) => {
    dispatch({
      type: "ADD_MESSAGE",
      message: {
        id: randomUUID(),
        role: "system",
        content,
        timestamp: Date.now(),
      },
    });
  }, [dispatch]);

  // ----- Slash command dispatch (extracted to handlers/) -----

  const { handleSlashCommand, wizardConfigRef } = useSlashCommands({
    backend,
    state,
    dispatch,
    addSystemMessage,
  });

  // ----- Submit handler -----

  const handleSubmit = useCallback(
    async (text: string) => {
      // Exit commands
      if (isExitCommand(text)) {
        exit();
        return;
      }

      // Add user message to history
      dispatch({
        type: "ADD_MESSAGE",
        message: {
          id: randomUUID(),
          role: "user",
          content: text,
          timestamp: Date.now(),
        },
      });

      // Slash commands
      const parsed = parseSlashCommand(text);
      if (parsed) {
        const handled = await handleSlashCommand(parsed.name, parsed.args);
        if (handled) return;
        // Unknown command — show error instead of sending to AI
        addSystemMessage(t.yellow(`Unknown command: ${parsed.name}. Type /help for available commands.`));
        return;
      }

      // Normal message → send to backend
      dispatch({ type: "SET_PHASE", phase: "thinking" });
      dispatch({ type: "CLEAR_STREAM" });
      dispatch({ type: "CLEAR_TOOL_CALLS" });
      dispatch({ type: "SET_CURRENT_TOOL", name: undefined });
      dispatch({ type: "CLEAR_SUB_AGENTS" });
      turnStartRef.current = Date.now();
      hasThinkingRef.current = false;
      abortedRef.current = false;

      // Mutable accumulator for stream text (used to freeze into message)
      let accumulatedText = "";
      let accumulatedToolCalls: DisplayToolCall[] = [];

      const callbacks: BackendCallbacks = {
        onThinking() {
          if (abortedRef.current) return;
          hasThinkingRef.current = true;
        },

        onTextDelta(content) {
          if (abortedRef.current) return;
          dispatch({ type: "SET_PHASE", phase: "streaming" });
          accumulatedText += content;
          dispatch({ type: "APPEND_STREAM_TEXT", content });
        },

        onToolCallStart(tc) {
          if (abortedRef.current) return;
          dispatch({ type: "SET_PHASE", phase: "tool-executing" });
          const toolName = capitalize(tc.name);
          dispatch({ type: "SET_CURRENT_TOOL", name: toolName });

          const parsedArgs = safeParseJson(tc.arguments);
          const newTc: DisplayToolCall = {
            id: tc.id,
            name: tc.name,
            args: parsedArgs,
            status: "running",
            startTime: Date.now(),
          };
          accumulatedToolCalls = [...accumulatedToolCalls, newTc];
          dispatch({ type: "TOOL_CALL_START", toolCall: newTc });
        },

        onToolResult(id, result, isError) {
          if (abortedRef.current) return;
          accumulatedToolCalls = accumulatedToolCalls.map((tc) =>
            tc.id === id
              ? {
                  ...tc,
                  result,
                  isError,
                  status: "completed" as const,
                  durationMs: Date.now() - tc.startTime,
                }
              : tc,
          );
          dispatch({ type: "TOOL_CALL_RESULT", id, result, isError });
        },

        onTurnComplete(tokensIn, tokensOut) {
          // If the turn was aborted, don't freeze partial state into history
          if (abortedRef.current) return;

          const durationMs = Date.now() - turnStartRef.current;

          // Freeze the assistant response into a static message
          dispatch({
            type: "FREEZE_ASSISTANT_MESSAGE",
            id: randomUUID(),
            text: accumulatedText,
            toolCalls: accumulatedToolCalls,
          });

          // Update cumulative stats
          dispatch({ type: "UPDATE_STATS", tokensIn, tokensOut, durationMs });

          // Update context token count
          dispatch({
            type: "UPDATE_CONTEXT",
            totalTokens: tokensIn + tokensOut,
          });

          // Reset live state
          dispatch({ type: "RESET_TURN" });
        },

        onCompaction(before, after) {
          if (abortedRef.current) return;
          dispatch({ type: "CONTEXT_COMPACTED", before, after });
          addSystemMessage(
            `✻ Context compacted (${before} → ${after} tokens)`,
          );
        },

        onError(message) {
          if (abortedRef.current) return;
          addSystemMessage(formatError(message));
        },

        // Sub-agent callbacks — all guarded against post-abort dispatch
        onSubAgentStarted(data) {
          if (abortedRef.current) return;
          dispatch({ type: "SET_PHASE", phase: "sub-executing" });
          dispatch({
            type: "SUB_AGENT_STARTED",
            childSessionId: data.childSessionId,
            parentSessionId: data.parentSessionId,
            label: data.label,
            agentType: data.agentType,
          });
        },

        onSubAgentTextDelta(childSessionId, content) {
          if (abortedRef.current) return;
          dispatch({ type: "SUB_AGENT_TEXT_DELTA", childSessionId, content });
        },

        onSubAgentToolCall(childSessionId, toolName) {
          if (abortedRef.current) return;
          dispatch({ type: "SUB_AGENT_TOOL_CALL", childSessionId, toolName });
        },

        onSubAgentToolResult(childSessionId, toolCallId, isError) {
          if (abortedRef.current) return;
          dispatch({ type: "SUB_AGENT_TOOL_RESULT", childSessionId, toolCallId, isError });
        },

        onSubAgentComplete(childSessionId, _label, status, durationMs) {
          if (abortedRef.current) return;
          dispatch({
            type: "SUB_AGENT_COMPLETE",
            childSessionId,
            status: status as "success" | "error",
            durationMs,
          });
        },
      };

      try {
        await backend.send(text, callbacks);
      } catch (err: unknown) {
        // Ensure the UI always recovers — never leave phase stuck on "thinking"
        const errMsg = err instanceof Error ? err.message : String(err);
        addSystemMessage(formatError(errMsg));
        dispatch({ type: "RESET_TURN" });
      }
    },
    [backend, handleSlashCommand, exit, addSystemMessage, dispatch],
  );

  // ----- Interrupt handler -----

  const handleInterrupt = useCallback(() => {
    const { phase, streamText } = state;
    if (
      phase === "thinking" ||
      phase === "streaming" ||
      phase === "tool-executing" ||
      phase === "sub-executing"
    ) {
      abortedRef.current = true;
      backend.abort();

      // Preserve partial response so the user doesn't lose what was streamed
      if (streamText.length > 0) {
        dispatch({
          type: "FREEZE_ASSISTANT_MESSAGE",
          id: randomUUID(),
          text: streamText + "\n\n_(interrupted)_",
          toolCalls: [],
        });
      }

      dispatch({ type: "RESET_TURN" });
      addSystemMessage("⏎ Interrupted.");
    } else if (phase === "idle") {
      exit();
    }
  }, [state, backend, exit, addSystemMessage, dispatch]);

  // ----- Setup complete handler -----

  const handleSetupComplete = useCallback(
    async (provider: ProviderOption, apiKey: string) => {
      try {
        await persistSetup(provider, apiKey);
        dispatch({ type: "SET_MODEL", model: provider.model });
        backend.setModel(provider.model);
        dispatch({ type: "SET_PHASE", phase: "idle" });
        addSystemMessage(t.green("✓ Setup complete!"));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        addSystemMessage(formatError(`Setup failed: ${msg}`));
        dispatch({ type: "SET_PHASE", phase: "idle" });
      }
    },
    [backend, addSystemMessage, dispatch],
  );

  const handleSetupCancel = useCallback(() => {
    dispatch({ type: "SET_PHASE", phase: "idle" });
    addSystemMessage("Setup cancelled. Run /config to configure later.");
  }, [dispatch, addSystemMessage]);

  const handleWizardCancel = useCallback(() => {
    dispatch({ type: "SET_PHASE", phase: "idle" });
  }, [dispatch]);

  // ----- Derived sub-agent state -----
  const subAgentDerived = useSubAgents(state.subAgents);

  // ----- Render -----

  return (
    <ErrorBoundary>
      <Box flexDirection="column" gap={0}>
        {/* Static message history */}
        <Messages messages={state.messages} />

        {/* Live tool calls (during tool execution) */}
        {state.liveToolCalls.map((tc) =>
          SUB_AGENT_TOOLS.has(tc.name) ? (
            <SubAgentView key={tc.id} toolCall={tc} />
          ) : (
            <ToolCallView key={tc.id} toolCall={tc} />
          ),
        )}

        {/* Live sub-agent monitoring (during sub-executing phase) */}
        {subAgentDerived.total > 0 && (
          <SubAgentList agents={subAgentDerived.sorted} />
        )}

        {/* Streaming text (during streaming) */}
        <StreamingText text={state.streamText} phase={state.phase} />

        {/* Status bar */}
        <StatusBar
          phase={state.phase}
          model={state.model}
          stats={state.stats}
          currentTool={state.currentTool}
          context={state.context}
          sessionSlug={state.sessionSlug}
          subAgents={state.subAgents}
          streamLength={state.streamText.length}
        />

        {/* Input prompt (idle only) */}
        <Input
          phase={state.phase}
          onSubmit={handleSubmit}
          onInterrupt={handleInterrupt}
        />

        {/* Setup wizard (first launch) */}
        {state.phase === "setup" && <Setup onComplete={handleSetupComplete} onCancel={handleSetupCancel} />}

        {/* Generic interactive wizard */}
        {state.phase === "wizard" && wizardConfigRef.current && (
          <Wizard
            config={wizardConfigRef.current}
            onCancel={handleWizardCancel}
          />
        )}
      </Box>
    </ErrorBoundary>
  );
};
