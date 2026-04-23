/**
 * App — Root orchestrator component for the interactive CLI.
 *
 * Holds all state via a centralized reducer, connects backend to
 * components via callbacks, and manages phase transitions. This is
 * the single source of truth for the CLI's UI state.
 *
 * Integration-layer responsibilities (ADR-013):
 *   - Owns the imperative controller refs (theme, help) that slash-command
 *     handlers write through. Bridge components populate them from inside
 *     the provider tree.
 *   - Renders <PermissionOverlay> so daemon-originated lease approvals can
 *     reach the user.
 *   - Conditionally renders <KeybindingHelp> when the help controller is
 *     visible.
 *
 * Provider wrappers (<ThemeProvider>, <KeybindingProvider>,
 * <PermissionProvider>) live in chat.tsx — boot-time concerns stay in
 * boot-time code, App stays renderable under any test wrapper.
 */

import React, { useRef, useCallback, useState, useMemo } from "react";
import { Box, useApp } from "ink";
import { randomUUID } from "node:crypto";

import type { Backend, BackendCallbacks } from "./backend.js";
import { isExitCommand, parseSlashCommand, SUB_AGENT_TOOLS } from "./commands.js";
import { capitalize, formatError, safeParseJson } from "./format.js";
import { t } from "./theme.js";
import type { Phase, DisplayToolCall } from "./types.js";
import { useAppState } from "./hooks/useAppReducer.js";
import { useSlashCommands } from "./hooks/useSlashCommands.js";

import { Messages, StreamingText } from "./components/Messages.js";
import { Input } from "./components/Input.js";
import { StatusBar } from "./components/StatusBar.js";

import { ToolCallView } from "./components/ToolCall.js";
import { SubAgentView, SubAgentList } from "./components/SubAgent.js";
import { Wizard } from "./components/Wizard.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { useSubAgents } from "./hooks/useSubAgents.js";

import {
  NULL_HELP_CONTROLLER,
  NULL_THEME_CONTROLLER,
  HelpControllerBridge,
  ThemeControllerBridge,
  type HelpController,
  type ThemeController,
} from "./boot/index.js";
import { PermissionOverlay, usePermissionSnapshot } from "./permission/index.js";
import {
  KeybindingHelp,
  useKeybindingSnapshot,
} from "./keybindings/index.js";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AppProps {
  readonly backend: Backend;
  readonly initialModel: string;
  readonly initialPhase?: Phase;
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

  // ----- Integration controllers -----
  // Refs populated by the bridge components below. NULL defaults ensure
  // handlers never crash if they fire before the first effect commits.
  const themeControllerRef = useRef<ThemeController>(NULL_THEME_CONTROLLER);
  const helpControllerRef = useRef<HelpController>(NULL_HELP_CONTROLLER);
  const [helpVisible, setHelpVisible] = useState(false);

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
    themeControllerRef,
    helpControllerRef,
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
          if (abortedRef.current) return;

          const durationMs = Date.now() - turnStartRef.current;

          dispatch({
            type: "FREEZE_ASSISTANT_MESSAGE",
            id: randomUUID(),
            text: accumulatedText,
            toolCalls: accumulatedToolCalls,
          });

          dispatch({ type: "UPDATE_STATS", tokensIn, tokensOut, durationMs });
          dispatch({ type: "UPDATE_CONTEXT", totalTokens: tokensIn + tokensOut });
          dispatch({ type: "RESET_TURN" });
        },

        onCompaction(before, after) {
          if (abortedRef.current) return;
          dispatch({ type: "CONTEXT_COMPACTED", before, after });
          addSystemMessage(`✻ Context compacted (${before} → ${after} tokens)`);
        },

        onError(message) {
          if (abortedRef.current) return;
          addSystemMessage(formatError(message));
        },

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
        const errMsg = err instanceof Error ? err.message : String(err);
        addSystemMessage(formatError(errMsg));
        dispatch({ type: "RESET_TURN" });
      }
    },
    [backend, handleSlashCommand, exit, addSystemMessage, dispatch],
  );

  // ----- Interrupt handler -----

  const handleInterrupt = useCallback(() => {
    // If the help overlay is up, interrupt dismisses it first.
    if (helpControllerRef.current.visible) {
      helpControllerRef.current.hide();
      return;
    }

    const { phase, streamText } = state;
    if (
      phase === "thinking" ||
      phase === "streaming" ||
      phase === "tool-executing" ||
      phase === "sub-executing"
    ) {
      abortedRef.current = true;
      backend.abort();

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

  // ----- Wizard cancel handler -----

  const handleWizardCancel = useCallback(() => {
    dispatch({ type: "SET_PHASE", phase: "idle" });
  }, [dispatch]);

  // ----- Derived sub-agent state -----
  const subAgentDerived = useSubAgents(state.subAgents);

  // ----- Help overlay — snapshot of every live binding, shown when visible -----
  const kbSnapshot = useKeybindingSnapshot();
  const permissionSnapshot = usePermissionSnapshot();
  const hasPendingPermission = permissionSnapshot.queue.length > 0;
  const wizardActive = state.phase === "wizard" && wizardConfigRef.current !== null;

  // Help overlay hides while a modal-ish workflow is active so the user
  // doesn't face two stacked dialogs with ambiguous key focus.
  const showHelpOverlay = useMemo(
    () => helpVisible && !hasPendingPermission && !wizardActive,
    [helpVisible, hasPendingPermission, wizardActive],
  );

  // ----- Render -----

  return (
    <ErrorBoundary>
      {/* Bridges populate imperative controller refs from inside the
          provider tree. They render null — zero visual cost. */}
      <ThemeControllerBridge controllerRef={themeControllerRef} />
      <HelpControllerBridge controllerRef={helpControllerRef} onVisibilityChange={setHelpVisible} />

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

        {/* Wizard — single engine for onboarding + every slash-command flow */}
        {wizardActive && wizardConfigRef.current !== null && (
          <Wizard
            config={wizardConfigRef.current}
            onCancel={handleWizardCancel}
          />
        )}

        {/* Permission overlay — renders the head of the permission queue
            when one is pending; null otherwise. */}
        <PermissionOverlay />

        {/* Keybinding help overlay — toggled by /keybindings. */}
        {showHelpOverlay && (
          <KeybindingHelp bindings={kbSnapshot.bindings} />
        )}
      </Box>
    </ErrorBoundary>
  );
};
