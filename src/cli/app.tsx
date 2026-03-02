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
import {
  capitalize,
  formatSessionList,
  formatHelp,
  formatNewSession,
  formatSessionResume,
  formatChannelList,
  formatModelList,
  formatConnectorList,
  formatTriggerList,
  formatSkillList,
  formatSkillDetail,
  formatStatus,
  formatSysInfo,
  formatConfig,
  formatHistory,
  formatHealth,
  formatError,
  safeParseJson,
} from "./format.js";
import { t } from "./theme.js";
import type { Phase, DisplayToolCall } from "./types.js";
import type { ProviderOption } from "./lib/setup.js";
import { useAppState } from "./hooks/useAppReducer.js";

import { Messages, StreamingText } from "./components/Messages.js";
import { Input } from "./components/Input.js";
import { StatusBar } from "./components/StatusBar.js";
import { Setup } from "./components/Setup.js";
import { ToolCallView } from "./components/ToolCall.js";
import { SubAgentView, SubAgentList } from "./components/SubAgent.js";
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

  // ----- Slash command dispatch -----

  const handleSlashCommand = useCallback(
    async (name: string, args: string): Promise<boolean> => {
      switch (name) {
        case "/help":
          addSystemMessage(formatHelp());
          return true;

        case "/new": {
          const info = await backend.newSession();
          dispatch({ type: "RESET_STATS" });
          dispatch({ type: "SET_SESSION_SLUG", slug: info.slug });
          addSystemMessage(formatNewSession(info.slug, state.model));
          return true;
        }

        case "/sessions": {
          const sessions = await backend.listSessions();
          const rows = sessions.map((s) => ({
            id: s.id,
            slug: s.slug,
            title: s.title,
            model: s.model,
            token_count: s.tokenCount,
            updated_at: s.updatedAt,
          }));
          addSystemMessage(formatSessionList(rows, backend.sessionId));
          return true;
        }

        case "/resume": {
          const target = args.trim();
          if (!target) {
            addSystemMessage(t.yellow("Usage: /resume <slug-or-id>"));
            return true;
          }
          const resumed = await backend.resumeSession(target);
          if (!resumed) {
            addSystemMessage(formatError(`Session "${target}" not found. Use /sessions to list.`));
          } else {
            dispatch({ type: "SET_SESSION_SLUG", slug: resumed.slug });
            addSystemMessage(formatSessionResume(resumed.slug));
          }
          return true;
        }

        case "/history": {
          const entries = await backend.getHistory();
          addSystemMessage(formatHistory(entries));
          return true;
        }

        case "/clear":
          await backend.clearHistory();
          dispatch({ type: "CLEAR_MESSAGES" });
          addSystemMessage(t.muted("Session history cleared."));
          return true;

        case "/compact": {
          const result = await backend.compact();
          dispatch({ type: "CONTEXT_COMPACTED", before: result.before, after: result.after });
          addSystemMessage(t.cyan(`✻ Context compacted (${result.before} → ${result.after} tokens)`));
          return true;
        }

        case "/model": {
          const modelArg = args.trim();
          if (!modelArg) {
            addSystemMessage(t.muted(`Current model: ${t.blue(state.model)}`));
          } else {
            backend.setModel(modelArg);
            dispatch({ type: "SET_MODEL", model: modelArg });
            addSystemMessage(t.green(`Model switched to ${modelArg}`));
          }
          return true;
        }

        case "/models": {
          const models = await backend.listModels();
          addSystemMessage(formatModelList(models, state.model));
          return true;
        }

        case "/channels": {
          if (backend.mode !== "daemon") {
            addSystemMessage(t.muted("Channels require the daemon. Start with: jeriko server start"));
            return true;
          }
          const channels = await backend.listChannels();
          const rows = channels.map((ch) => ({
            name: ch.name,
            status: ch.status,
            error: ch.error,
            connected_at: ch.connectedAt,
          }));
          addSystemMessage(formatChannelList(rows));
          return true;
        }

        case "/channel": {
          if (backend.mode !== "daemon") {
            addSystemMessage(t.muted("Channels require the daemon. Start with: jeriko server start"));
            return true;
          }
          const spaceIdx = args.indexOf(" ");
          if (spaceIdx === -1) {
            addSystemMessage(t.yellow("Usage: /channel connect <name> | /channel disconnect <name>"));
            return true;
          }
          const action = args.slice(0, spaceIdx).trim();
          const channelName = args.slice(spaceIdx + 1).trim();
          if (action === "connect") {
            const ok = await backend.connectChannel(channelName);
            addSystemMessage(
              ok
                ? t.green(`✓ Channel "${channelName}" connected`)
                : formatError(`Failed to connect "${channelName}"`),
            );
          } else if (action === "disconnect") {
            const ok = await backend.disconnectChannel(channelName);
            addSystemMessage(
              ok
                ? t.green(`✓ Channel "${channelName}" disconnected`)
                : formatError(`Failed to disconnect "${channelName}"`),
            );
          } else {
            addSystemMessage(t.yellow("Usage: /channel connect <name> | /channel disconnect <name>"));
          }
          return true;
        }

        case "/connectors": {
          if (backend.mode !== "daemon") {
            addSystemMessage(t.muted("Connectors require the daemon. Start with: jeriko server start"));
            return true;
          }
          const connectors = await backend.listConnectors();
          addSystemMessage(formatConnectorList(connectors));
          return true;
        }

        case "/connect": {
          if (backend.mode !== "daemon") {
            addSystemMessage(t.muted("Connectors require the daemon. Start with: jeriko server start"));
            return true;
          }
          const svcName = args.trim();
          if (!svcName) {
            addSystemMessage(t.yellow("Usage: /connect <service-name>"));
            return true;
          }
          const ok = await backend.connectService(svcName);
          addSystemMessage(
            ok
              ? t.green(`✓ Service "${svcName}" connected`)
              : formatError(`Failed to connect "${svcName}"`),
          );
          return true;
        }

        case "/disconnect": {
          if (backend.mode !== "daemon") {
            addSystemMessage(t.muted("Connectors require the daemon. Start with: jeriko server start"));
            return true;
          }
          const dSvcName = args.trim();
          if (!dSvcName) {
            addSystemMessage(t.yellow("Usage: /disconnect <service-name>"));
            return true;
          }
          const dOk = await backend.disconnectService(dSvcName);
          addSystemMessage(
            dOk
              ? t.green(`✓ Service "${dSvcName}" disconnected`)
              : formatError(`Failed to disconnect "${dSvcName}"`),
          );
          return true;
        }

        case "/triggers": {
          if (backend.mode !== "daemon") {
            addSystemMessage(t.muted("Triggers require the daemon. Start with: jeriko server start"));
            return true;
          }
          const triggers = await backend.listTriggers();
          addSystemMessage(formatTriggerList(triggers));
          return true;
        }

        case "/skills": {
          const skills = await backend.listSkills();
          addSystemMessage(formatSkillList(skills));
          return true;
        }

        case "/skill": {
          const skillName = args.trim();
          if (!skillName) {
            addSystemMessage(t.yellow("Usage: /skill <name>"));
            return true;
          }
          const skill = await backend.getSkill(skillName);
          if (!skill) {
            addSystemMessage(formatError(`Skill "${skillName}" not found.`));
          } else {
            addSystemMessage(formatSkillDetail(skill.name, skill.description, skill.body));
          }
          return true;
        }

        case "/status": {
          if (backend.mode !== "daemon") {
            addSystemMessage(t.muted("Status requires the daemon. Start with: jeriko server start"));
            return true;
          }
          const statusData = await backend.getStatus();
          addSystemMessage(formatStatus(statusData));
          return true;
        }

        case "/health": {
          if (backend.mode !== "daemon") {
            addSystemMessage(t.muted("Health checks require the daemon. Start with: jeriko server start"));
            return true;
          }
          const results = await backend.checkHealth();
          addSystemMessage(formatHealth(results));
          return true;
        }

        case "/sys":
          addSystemMessage(formatSysInfo());
          return true;

        case "/config": {
          const cfg = await backend.getConfig();
          addSystemMessage(formatConfig(cfg));
          return true;
        }

        default:
          return false;
      }
    },
    [backend, state.model, addSystemMessage, dispatch],
  );

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
      }

      // Normal message → send to backend
      dispatch({ type: "SET_PHASE", phase: "thinking" });
      dispatch({ type: "CLEAR_STREAM" });
      dispatch({ type: "CLEAR_TOOL_CALLS" });
      dispatch({ type: "SET_CURRENT_TOOL", name: undefined });
      dispatch({ type: "CLEAR_SUB_AGENTS" });
      turnStartRef.current = Date.now();
      hasThinkingRef.current = false;

      // Mutable accumulator for stream text (used to freeze into message)
      let accumulatedText = "";
      let accumulatedToolCalls: DisplayToolCall[] = [];

      const callbacks: BackendCallbacks = {
        onThinking() {
          hasThinkingRef.current = true;
        },

        onTextDelta(content) {
          dispatch({ type: "SET_PHASE", phase: "streaming" });
          accumulatedText += content;
          dispatch({ type: "APPEND_STREAM_TEXT", content });
        },

        onToolCallStart(tc) {
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
          dispatch({ type: "CONTEXT_COMPACTED", before, after });
          addSystemMessage(
            `✻ Context compacted (${before} → ${after} tokens)`,
          );
        },

        onError(message) {
          addSystemMessage(formatError(message));
        },

        // Sub-agent callbacks
        onSubAgentStarted(data) {
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
          dispatch({ type: "SUB_AGENT_TEXT_DELTA", childSessionId, content });
        },

        onSubAgentToolCall(childSessionId, toolName) {
          dispatch({ type: "SUB_AGENT_TOOL_CALL", childSessionId, toolName });
        },

        onSubAgentToolResult(childSessionId, toolCallId, isError) {
          dispatch({ type: "SUB_AGENT_TOOL_RESULT", childSessionId, toolCallId, isError });
        },

        onSubAgentComplete(childSessionId, _label, status, durationMs) {
          dispatch({
            type: "SUB_AGENT_COMPLETE",
            childSessionId,
            status: status as "success" | "error",
            durationMs,
          });
        },
      };

      await backend.send(text, callbacks);
    },
    [backend, handleSlashCommand, exit, addSystemMessage, dispatch],
  );

  // ----- Interrupt handler -----

  const handleInterrupt = useCallback(() => {
    const { phase } = state;
    if (
      phase === "thinking" ||
      phase === "streaming" ||
      phase === "tool-executing" ||
      phase === "sub-executing"
    ) {
      backend.abort();
      dispatch({ type: "RESET_TURN" });
      addSystemMessage("⏎ Interrupted.");
    } else if (phase === "idle") {
      exit();
    }
  }, [state, backend, exit, addSystemMessage, dispatch]);

  // ----- Setup complete handler -----

  const handleSetupComplete = useCallback(
    async (provider: ProviderOption, apiKey: string) => {
      await persistSetup(provider, apiKey);
      dispatch({ type: "SET_MODEL", model: provider.model });
      backend.setModel(provider.model);
      dispatch({ type: "SET_PHASE", phase: "idle" });
      addSystemMessage(t.green("✓ Setup complete!"));
    },
    [backend, addSystemMessage, dispatch],
  );

  // ----- Derived sub-agent state -----
  const subAgentDerived = useSubAgents(state.subAgents);

  // ----- Render -----

  return (
    <Box flexDirection="column">
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
      />

      {/* Input prompt (idle only) */}
      <Input
        phase={state.phase}
        onSubmit={handleSubmit}
        onInterrupt={handleInterrupt}
      />

      {/* Setup wizard (first launch) */}
      {state.phase === "setup" && <Setup onComplete={handleSetupComplete} />}
    </Box>
  );
};
