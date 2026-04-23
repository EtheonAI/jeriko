/**
 * useSubAgents — derived state hook for sub-agent live monitoring.
 *
 * Takes the raw Map<string, SubAgentState> from the reducer and provides:
 *   - sorted list of agents (running first, then completed, then error)
 *   - counts by phase (running, completed, error)
 *   - lookup helpers
 *
 * Pure derivation — no side effects, no subscriptions.
 * The bus subscription lives in the backend; this hook just reshapes state.
 */

import { useMemo } from "react";
import type { SubAgentState } from "../types.js";
import type { Tone } from "../ui/types.js";

// ---------------------------------------------------------------------------
// Phase ordering
// ---------------------------------------------------------------------------

/** Phase ordering for sort: running first, then completed, then error. */
const PHASE_ORDER: Record<SubAgentState["phase"], number> = {
  running: 0,
  completed: 1,
  error: 2,
};

// ---------------------------------------------------------------------------
// Agent-type color mapping
// ---------------------------------------------------------------------------

/**
 * Agent type badge metadata — maps agent type to a semantic `Tone`.
 *
 * Every tone resolves to a live theme color via `resolveTone()` at render
 * time, so swapping themes restyles badges without any data changes here.
 *
 * Covers all agent types used by the delegate tool:
 *   - Core types: general, research, task, explore, plan
 *   - Code types: code, review, debug, write, edit
 *   - Search types: search, browse, analyze
 *   - Infra types: execute, deploy, test
 */
export const AGENT_TYPE_COLORS: Record<string, Tone> = {
  // Core
  general:  "text",
  research: "info",
  task:     "success",
  explore:  "tool",
  plan:     "purple",

  // Code
  code:     "teal",
  review:   "orange",
  debug:    "error",
  write:    "success",
  edit:     "teal",

  // Search & analysis
  search:   "info",
  browse:   "tool",
  analyze:  "purple",

  // Infra
  execute:  "orange",
  deploy:   "pink",
  test:     "success",
};

// ---------------------------------------------------------------------------
// Derived state shape
// ---------------------------------------------------------------------------

export interface SubAgentDerived {
  /** All agents sorted: running → completed → error, then by start time. */
  readonly sorted: SubAgentState[];
  /** Count of agents in "running" phase. */
  readonly runningCount: number;
  /** Count of agents in "completed" phase. */
  readonly completedCount: number;
  /** Count of agents in "error" phase. */
  readonly errorCount: number;
  /** Total number of agents tracked. */
  readonly total: number;
  /** Whether any agent is currently running. */
  readonly hasRunning: boolean;
}

// ---------------------------------------------------------------------------
// Pure derivation function (testable without React)
// ---------------------------------------------------------------------------

export function deriveSubAgentState(
  agents: Map<string, SubAgentState>,
): SubAgentDerived {
  const sorted = Array.from(agents.values()).sort((a, b) => {
    const phaseSort = PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase];
    if (phaseSort !== 0) return phaseSort;
    return a.startTime - b.startTime;
  });

  let runningCount = 0;
  let completedCount = 0;
  let errorCount = 0;

  for (const agent of sorted) {
    switch (agent.phase) {
      case "running":   runningCount++;   break;
      case "completed": completedCount++; break;
      case "error":     errorCount++;     break;
    }
  }

  return {
    sorted,
    runningCount,
    completedCount,
    errorCount,
    total: sorted.length,
    hasRunning: runningCount > 0,
  };
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

/**
 * Hook that derives sorted sub-agent data from the raw Map.
 * Memoized — only recomputes when the map reference changes.
 */
export function useSubAgents(
  agents: Map<string, SubAgentState>,
): SubAgentDerived {
  return useMemo(() => deriveSubAgentState(agents), [agents]);
}

// ---------------------------------------------------------------------------
// Tone resolution for agent types
// ---------------------------------------------------------------------------

/**
 * Resolve an agent type to a semantic Tone. Returns "purple" for unknown
 * types as a distinctive fallback (matches the default used by the
 * orchestrator for sub-delegations).
 */
export function getAgentTypeTone(agentType: string): Tone {
  return AGENT_TYPE_COLORS[agentType] ?? AGENT_TYPE_COLORS.general ?? "purple";
}

/**
 * Back-compat export — kept so callers that used `getAgentTypeColor`
 * (returning a string that was an implicit Tone) continue to compile.
 * New code should import `getAgentTypeTone` directly.
 */
export const getAgentTypeColor = getAgentTypeTone;
