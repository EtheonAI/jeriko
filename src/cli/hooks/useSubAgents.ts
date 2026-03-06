/**
 * useSubAgents — Derived state hook for sub-agent live monitoring.
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Phase ordering for sort: running first, then completed, then error. */
const PHASE_ORDER: Record<SubAgentState["phase"], number> = {
  running: 0,
  completed: 1,
  error: 2,
};

/** Agent type badge metadata — color name from PALETTE. */
export const AGENT_TYPE_COLORS: Record<string, string> = {
  general: "text",
  research: "cyan",
  task: "green",
  explore: "blue",
  plan: "purple",
};

/** Derived sub-agent state for rendering. */
export interface SubAgentDerived {
  /** All agents sorted: running → completed → error, then by start time. */
  sorted: SubAgentState[];
  /** Count of agents in "running" phase. */
  runningCount: number;
  /** Count of agents in "completed" phase. */
  completedCount: number;
  /** Count of agents in "error" phase. */
  errorCount: number;
  /** Total number of agents tracked. */
  total: number;
  /** Whether any agent is currently running. */
  hasRunning: boolean;
}

// ---------------------------------------------------------------------------
// Pure derivation function (testable without React)
// ---------------------------------------------------------------------------

/**
 * Derive sorted list and counts from the raw sub-agent map.
 * Pure function — no React dependency, fully testable.
 */
export function deriveSubAgentState(
  agents: Map<string, SubAgentState>,
): SubAgentDerived {
  const sorted = Array.from(agents.values()).sort((a, b) => {
    // Primary: phase order (running → completed → error)
    const phaseSort = PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase];
    if (phaseSort !== 0) return phaseSort;
    // Secondary: start time (oldest first)
    return a.startTime - b.startTime;
  });

  let runningCount = 0;
  let completedCount = 0;
  let errorCount = 0;

  for (const agent of sorted) {
    switch (agent.phase) {
      case "running":
        runningCount++;
        break;
      case "completed":
        completedCount++;
        break;
      case "error":
        errorCount++;
        break;
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

/**
 * Get the PALETTE color key for an agent type.
 * Returns the string key into PALETTE, not the color hex itself.
 */
export function getAgentTypeColor(agentType: string): string {
  return AGENT_TYPE_COLORS[agentType] ?? AGENT_TYPE_COLORS.general ?? "purple";
}
