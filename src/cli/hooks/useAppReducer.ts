/**
 * useAppReducer — Centralized state management for the CLI app.
 *
 * Pure reducer function that handles all state transitions through
 * a discriminated union of actions. No side effects, fully testable.
 *
 * Components dispatch actions; the reducer produces the next state.
 * This replaces 7+ scattered useState calls with a single source of truth.
 */

import { useReducer } from "react";
import type {
  AppState,
  AppAction,
  DisplayToolCall,
  SubAgentState,
} from "../types.js";
import { createInitialState, type Phase } from "../types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum length for sub-agent stream preview. */
const MAX_STREAM_PREVIEW = 120;

// ---------------------------------------------------------------------------
// Pure reducer
// ---------------------------------------------------------------------------

/**
 * Central state reducer for the CLI.
 * Every state transition is a pure function: (state, action) → state.
 * No side effects, no async, no external dependencies.
 */
export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    // ── Phase transitions ──────────────────────────────────────────
    case "SET_PHASE":
      return { ...state, phase: action.phase };

    // ── Messages ───────────────────────────────────────────────────
    case "ADD_MESSAGE":
      return { ...state, messages: [...state.messages, action.message] };

    case "CLEAR_MESSAGES":
      return { ...state, messages: [] };

    // ── Streaming text ─────────────────────────────────────────────
    case "APPEND_STREAM_TEXT":
      return { ...state, streamText: state.streamText + action.content };

    case "CLEAR_STREAM":
      return { ...state, streamText: "" };

    // ── Tool calls ─────────────────────────────────────────────────
    case "TOOL_CALL_START":
      return {
        ...state,
        liveToolCalls: [...state.liveToolCalls, action.toolCall],
      };

    case "TOOL_CALL_RESULT":
      return {
        ...state,
        liveToolCalls: state.liveToolCalls.map((tc) =>
          tc.id === action.id
            ? {
                ...tc,
                result: action.result,
                isError: action.isError,
                status: "completed" as const,
                durationMs: Date.now() - tc.startTime,
              }
            : tc,
        ),
      };

    case "CLEAR_TOOL_CALLS":
      return { ...state, liveToolCalls: [] };

    case "SET_CURRENT_TOOL":
      return { ...state, currentTool: action.name };

    // ── Freeze assistant message ───────────────────────────────────
    case "FREEZE_ASSISTANT_MESSAGE": {
      if (!action.text && action.toolCalls.length === 0) return state;
      return {
        ...state,
        messages: [
          ...state.messages,
          {
            id: action.id,
            role: "assistant" as const,
            content: action.text,
            toolCalls: action.toolCalls.length > 0 ? action.toolCalls : undefined,
            timestamp: Date.now(),
          },
        ],
      };
    }

    // ── Stats ──────────────────────────────────────────────────────
    case "UPDATE_STATS":
      return {
        ...state,
        stats: {
          tokensIn: state.stats.tokensIn + action.tokensIn,
          tokensOut: state.stats.tokensOut + action.tokensOut,
          turns: state.stats.turns + 1,
          durationMs: state.stats.durationMs + action.durationMs,
        },
      };

    case "RESET_STATS":
      return {
        ...state,
        stats: { tokensIn: 0, tokensOut: 0, turns: 0, durationMs: 0 },
      };

    // ── Model / Session ────────────────────────────────────────────
    case "SET_MODEL":
      return { ...state, model: action.model };

    case "SET_SESSION_SLUG":
      return { ...state, sessionSlug: action.slug };

    // ── Context window ─────────────────────────────────────────────
    case "UPDATE_CONTEXT":
      return {
        ...state,
        context: { ...state.context, totalTokens: action.totalTokens },
      };

    case "CONTEXT_COMPACTED":
      return {
        ...state,
        context: {
          ...state.context,
          totalTokens: action.after,
          compactionCount: state.context.compactionCount + 1,
          lastCompactedAt: Date.now(),
        },
      };

    // ── Sub-agent live monitoring ──────────────────────────────────
    case "SUB_AGENT_STARTED": {
      const newAgent: SubAgentState = {
        childSessionId: action.childSessionId,
        parentSessionId: action.parentSessionId,
        label: action.label,
        agentType: action.agentType,
        phase: "running",
        currentTool: null,
        streamPreview: "",
        toolCallCount: 0,
        startTime: Date.now(),
      };
      const agents = new Map(state.subAgents);
      agents.set(action.childSessionId, newAgent);
      return { ...state, subAgents: agents };
    }

    case "SUB_AGENT_TEXT_DELTA": {
      const existing = state.subAgents.get(action.childSessionId);
      if (!existing) return state;

      const preview = (existing.streamPreview + action.content).slice(-MAX_STREAM_PREVIEW);
      const agents = new Map(state.subAgents);
      agents.set(action.childSessionId, { ...existing, streamPreview: preview });
      return { ...state, subAgents: agents };
    }

    case "SUB_AGENT_TOOL_CALL": {
      const existing = state.subAgents.get(action.childSessionId);
      if (!existing) return state;

      const agents = new Map(state.subAgents);
      agents.set(action.childSessionId, {
        ...existing,
        currentTool: action.toolName,
        toolCallCount: existing.toolCallCount + 1,
      });
      return { ...state, subAgents: agents };
    }

    case "SUB_AGENT_TOOL_RESULT": {
      const existing = state.subAgents.get(action.childSessionId);
      if (!existing) return state;

      const agents = new Map(state.subAgents);
      agents.set(action.childSessionId, { ...existing, currentTool: null });
      return { ...state, subAgents: agents };
    }

    case "SUB_AGENT_COMPLETE": {
      const existing = state.subAgents.get(action.childSessionId);
      if (!existing) return state;

      const agents = new Map(state.subAgents);
      agents.set(action.childSessionId, {
        ...existing,
        phase: action.status === "error" ? "error" : "completed",
        status: action.status,
        durationMs: action.durationMs,
        currentTool: null,
      });
      return { ...state, subAgents: agents };
    }

    case "CLEAR_SUB_AGENTS":
      return { ...state, subAgents: new Map() };

    // ── Compound: reset turn state ─────────────────────────────────
    case "RESET_TURN":
      return {
        ...state,
        phase: "idle" as Phase,
        streamText: "",
        liveToolCalls: [],
        currentTool: undefined,
        subAgents: new Map(),
      };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

/**
 * React hook wrapping useReducer with the app reducer.
 *
 * @param opts - Initial state configuration
 * @returns [state, dispatch] tuple
 */
export function useAppState(opts: {
  phase?: Phase;
  model?: string;
  sessionSlug?: string;
}) {
  return useReducer(appReducer, opts, createInitialState);
}
