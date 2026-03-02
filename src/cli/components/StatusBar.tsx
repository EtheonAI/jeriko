/**
 * StatusBar — Phase indicator with model, token stats, cost, context, and session.
 *
 * Always rendered at the bottom of the live area.
 * Shows different content per phase, using phase-specific spinner presets:
 *
 *   thinking:        ◐ Thinking…
 *   streaming:       ⠋ Streaming…
 *   tool-executing:  ⣾ Running Read…
 *   sub-executing:   ◰ Delegating… / ◰ Running 3 sub-agents…
 *   idle (has stats): claude-sonnet · 1.2k↑ · 340↓ · $0.07 · 58% ctx · 5 turns · 23.4s · bold-nexus
 *   idle (no stats):  (nothing)
 *
 * Also renders a ContextBar when context utilization exceeds 50%.
 * Uses model-aware cost estimation from lib/cost.ts.
 */

import React from "react";
import { Text, Box } from "ink";
import { PALETTE } from "../theme.js";
import { formatTokens, formatDuration } from "../format.js";
import { estimateModelCost, formatModelCost } from "../lib/cost.js";
import { Spinner } from "./Spinner.js";
import { ContextBar } from "./ContextBar.js";
import type { Phase, SessionStats, ContextInfo, SubAgentState } from "../types.js";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface StatusBarProps {
  phase: Phase;
  model: string;
  stats: SessionStats;
  currentTool?: string;
  context?: ContextInfo;
  sessionSlug?: string;
  subAgents?: Map<string, SubAgentState>;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  phase,
  model,
  stats,
  currentTool,
  context,
  sessionSlug,
  subAgents,
}) => {
  switch (phase) {
    case "thinking":
      return (
        <Box marginTop={1}>
          <Spinner label="Thinking" preset="thinking" />
        </Box>
      );

    case "streaming":
      return (
        <Box marginTop={1}>
          <Spinner label="Streaming" preset="streaming" />
        </Box>
      );

    case "tool-executing":
      return (
        <Box marginTop={1}>
          <Spinner label={`Running ${currentTool ?? "tool"}`} preset="tool-executing" />
        </Box>
      );

    case "sub-executing": {
      const activeCount = subAgents ? countRunningAgents(subAgents) : 0;
      const label = activeCount > 1
        ? `Running ${activeCount} sub-agents`
        : "Delegating";
      return (
        <Box marginTop={1}>
          <Spinner label={label} preset="sub-executing" />
        </Box>
      );
    }

    case "setup":
      return null;

    case "idle": {
      if (stats.turns === 0) return null;

      const cost = estimateModelCost(stats.tokensIn, stats.tokensOut, model);
      const totalUsed = stats.tokensIn + stats.tokensOut;

      const parts: string[] = [
        model,
        `${formatTokens(stats.tokensIn)}↑`,
        `${formatTokens(stats.tokensOut)}↓`,
      ];

      if (cost > 0) parts.push(formatModelCost(cost));

      // Context percentage (inline summary)
      if (context && context.maxTokens > 0) {
        const pct = Math.round((totalUsed / context.maxTokens) * 100);
        if (pct > 0) parts.push(`${pct}% ctx`);
      }

      parts.push(`${stats.turns} turn${stats.turns !== 1 ? "s" : ""}`);

      if (stats.durationMs > 0) parts.push(formatDuration(stats.durationMs));

      if (sessionSlug && sessionSlug !== "new") {
        parts.push(sessionSlug);
      }

      return (
        <Box flexDirection="column" marginTop={1}>
          <Text color={PALETTE.dim}>{parts.join(" · ")}</Text>
          {context && (
            <ContextBar totalUsed={totalUsed} context={context} />
          )}
        </Box>
      );
    }
  }
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countRunningAgents(agents: Map<string, SubAgentState>): number {
  let count = 0;
  for (const agent of agents.values()) {
    if (agent.phase === "running") count++;
  }
  return count;
}
