/**
 * StatusBar — Phase indicator with model, token stats, cost, context, and session.
 *
 * Always rendered at the bottom of the live area.
 * Shows different content per phase, using phase-specific spinner presets:
 *
 *   thinking:        ◐ Thinking… 3.2s
 *   streaming:       ⠋ Responding… 142 tokens
 *   tool-executing:  ⣾ Running Read… 1.2s
 *   sub-executing:   ◰ Orchestrating  2/3 agents
 *   idle (has stats): claude-sonnet · 1.2k↑ · 340↓ · $0.07 · 58% ctx · 5 turns · 23.4s · bold-nexus
 *   idle (no stats):  (nothing)
 *
 * Also renders a ContextBar when context utilization exceeds 50%.
 * Uses model-aware cost estimation from lib/cost.ts.
 */

import React from "react";
import { Text, Box } from "ink";
import { PALETTE, ICONS } from "../theme.js";
import { formatTokens, formatDuration, capitalize } from "../format.js";
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
  /** Current stream text length for token estimation. */
  streamLength?: number;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  phase,
  model,
  stats,
  currentTool,
  context,
  sessionSlug,
  subAgents,
  streamLength,
}) => {
  switch (phase) {
    case "thinking":
      return (
        <Box marginTop={1}>
          <Spinner label="Thinking" preset="thinking" />
        </Box>
      );

    case "streaming":
      return <StreamingStatus streamLength={streamLength} />;

    case "tool-executing":
      return <ToolExecutingStatus currentTool={currentTool} />;

    case "sub-executing":
      return <SubExecutingStatus subAgents={subAgents} />;

    case "setup":
      return null;

    case "idle":
      return (
        <IdleStatus
          stats={stats}
          model={model}
          context={context}
          sessionSlug={sessionSlug}
        />
      );
  }
};

// ---------------------------------------------------------------------------
// Phase-specific status components
// ---------------------------------------------------------------------------

const StreamingStatus: React.FC<{ streamLength?: number }> = ({ streamLength }) => {
  const estimatedTokens = streamLength ? Math.round(streamLength / 4) : 0;
  const label = estimatedTokens > 0
    ? `Responding (${formatTokens(estimatedTokens)} tokens)`
    : "Responding";

  return (
    <Box marginTop={1}>
      <Spinner label={label} preset="streaming" />
    </Box>
  );
};

const ToolExecutingStatus: React.FC<{ currentTool?: string }> = ({ currentTool }) => {
  const toolLabel = currentTool ? `Running ${currentTool}` : "Running tool";

  return (
    <Box marginTop={1}>
      <Spinner label={toolLabel} preset="tool-executing" />
    </Box>
  );
};

const SubExecutingStatus: React.FC<{ subAgents?: Map<string, SubAgentState> }> = ({
  subAgents,
}) => {
  const running = subAgents ? collectRunningAgents(subAgents) : [];
  const totalCount = subAgents ? subAgents.size : 0;
  const runningCount = running.length;

  if (runningCount === 0) {
    return (
      <Box marginTop={1}>
        <Spinner label="Delegating" preset="sub-executing" />
      </Box>
    );
  }

  const agentSummaries = running.map((agent) => {
    const label = capitalize(agent.agentType);
    const tool = agent.currentTool ?? "working";
    return `${label}: ${tool}`;
  });

  const summaryStr = agentSummaries.join(" · ");
  const counterPrefix = totalCount > 1 ? `${runningCount}/${totalCount} agents` : "";
  const label = counterPrefix
    ? `${counterPrefix} · ${summaryStr}`
    : summaryStr;

  return (
    <Box marginTop={1}>
      <Spinner label={label} preset="sub-executing" />
    </Box>
  );
};

// ---------------------------------------------------------------------------
// Idle status — structured info line
// ---------------------------------------------------------------------------

interface IdleStatusProps {
  stats: SessionStats;
  model: string;
  context?: ContextInfo;
  sessionSlug?: string;
}

const IdleStatus: React.FC<IdleStatusProps> = ({
  stats,
  model,
  context,
  sessionSlug,
}) => {
  if (stats.turns === 0) return null;

  const cost = estimateModelCost(stats.tokensIn, stats.tokensOut, model);
  const totalUsed = stats.tokensIn + stats.tokensOut;
  const sep = ` ${ICONS.dot} `;

  // Build status segments with visual separators
  const parts: string[] = [model];

  // Token counts with directional arrows
  parts.push(`${formatTokens(stats.tokensIn)}↑`);
  parts.push(`${formatTokens(stats.tokensOut)}↓`);

  // Cost (only if non-zero)
  if (cost > 0) parts.push(formatModelCost(cost));

  // Context percentage
  if (context && context.maxTokens > 0) {
    const pct = Math.round((totalUsed / context.maxTokens) * 100);
    if (pct > 0) parts.push(`${pct}% ctx`);
  }

  // Turn count
  parts.push(`${stats.turns} turn${stats.turns !== 1 ? "s" : ""}`);

  // Total duration
  if (stats.durationMs > 0) parts.push(formatDuration(stats.durationMs));

  // Session slug
  if (sessionSlug && sessionSlug !== "new") {
    parts.push(sessionSlug);
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={PALETTE.dim}>{parts.join(sep)}</Text>
      {context && (
        <ContextBar totalUsed={totalUsed} context={context} />
      )}
    </Box>
  );
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collectRunningAgents(agents: Map<string, SubAgentState>): SubAgentState[] {
  const running: SubAgentState[] = [];
  for (const agent of agents.values()) {
    if (agent.phase === "running") running.push(agent);
  }
  return running;
}
