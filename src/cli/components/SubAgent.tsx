/**
 * SubAgent — Live sub-agent orchestration display with tree structure.
 *
 * Renders sub-agents as a tree branching from the orchestrator,
 * with connector lines showing parent→child relationships:
 *
 * Live mode (during execution):
 *   ⏺ Orchestrating
 *   ├── ⠋ Research      search_files    3 calls  4.2s
 *   │   └ Searching for auth patterns…
 *   ├── ✓ Explore       done            2 calls  1.8s
 *   └── ⠋ CodeReview    read_file       7 calls  6.1s
 *       └ Reviewing changes…
 *
 * Static mode (frozen in history):
 *   ⏺ Delegate  Search for auth patterns…
 *   ⎿  Done (5 tool calls · 4.6k tokens · 8.2s)
 */

import React, { useState, useEffect } from "react";
import { Text, Box } from "ink";
import { PALETTE, ICONS } from "../theme.js";
import {
  capitalize,
  formatTokens,
  formatDuration,
  pluralize,
  safeParseJson,
} from "../format.js";
import { getAgentTypeColor } from "../hooks/useSubAgents.js";
import type { DisplayToolCall, SubAgentState } from "../types.js";

// ---------------------------------------------------------------------------
// Tree connector characters
// ---------------------------------------------------------------------------

const TREE = {
  branch:   "├── ",   // middle child
  last:     "└── ",   // last child
  pipe:     "│   ",   // continuation line under branch
  space:    "    ",   // continuation line under last
  preview:  "└ ",     // stream preview connector
} as const;

// ---------------------------------------------------------------------------
// Inline spinner (shared)
// ---------------------------------------------------------------------------

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

const SpinnerChar: React.FC<{ color: string }> = ({ color }) => {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((f) => (f + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(timer);
  }, []);

  return <Text color={color}>{SPINNER_FRAMES[frame % SPINNER_FRAMES.length]}</Text>;
};

// ---------------------------------------------------------------------------
// Elapsed time hook (shared)
// ---------------------------------------------------------------------------

function useElapsedTime(startTime: number, phase: SubAgentState["phase"], durationMs?: number): number {
  const [elapsed, setElapsed] = useState(() => durationMs ?? Date.now() - startTime);

  useEffect(() => {
    if (phase !== "running") {
      setElapsed(durationMs ?? Date.now() - startTime);
      return;
    }
    const timer = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 200);
    return () => clearInterval(timer);
  }, [phase, startTime, durationMs]);

  return elapsed;
}

// ---------------------------------------------------------------------------
// Status icon resolver
// ---------------------------------------------------------------------------

function resolveStatusIcon(
  phase: SubAgentState["phase"],
  color: string,
): React.ReactNode {
  switch (phase) {
    case "running":
      return <SpinnerChar color={color} />;
    case "completed":
      return <Text color={PALETTE.green}>{ICONS.success}</Text>;
    case "error":
      return <Text color={PALETTE.red}>{ICONS.error}</Text>;
  }
}

function resolveToolLabel(phase: SubAgentState["phase"], currentTool: string | null): string {
  switch (phase) {
    case "running":
      return currentTool ?? "working";
    case "completed":
      return "done";
    case "error":
      return "failed";
  }
}

// ---------------------------------------------------------------------------
// Live sub-agent node (single agent in the tree)
// ---------------------------------------------------------------------------

interface AgentNodeProps {
  agent: SubAgentState;
  /** Tree connector prefix (e.g., "├── " or "└── "). */
  connector: string;
  /** Continuation prefix for sub-lines (e.g., "│   " or "    "). */
  continuation: string;
  /** Whether to show the stream preview line. */
  showPreview?: boolean;
}

const AgentNode: React.FC<AgentNodeProps> = ({
  agent,
  connector,
  continuation,
  showPreview = true,
}) => {
  const colorKey = getAgentTypeColor(agent.agentType);
  const badgeColor = (PALETTE as Record<string, string>)[colorKey] ?? PALETTE.text;
  const label = capitalize(agent.agentType);
  const elapsed = useElapsedTime(agent.startTime, agent.phase, agent.durationMs);
  const statusIcon = resolveStatusIcon(agent.phase, badgeColor);
  const toolStr = resolveToolLabel(agent.phase, agent.currentTool);

  // Only show preview for running agents with content
  const previewText = showPreview && agent.phase === "running" && agent.streamPreview.length > 0
    ? truncatePreview(agent.streamPreview, 60)
    : null;

  return (
    <Box flexDirection="column">
      {/* Main agent line */}
      <Text>
        <Text color={PALETTE.dim}>{connector}</Text>
        {statusIcon}
        <Text color={badgeColor} bold> {label}</Text>
        <Text color={PALETTE.muted}>{"  "}{toolStr}</Text>
        <Text color={PALETTE.dim}>{"  "}{pluralize(agent.toolCallCount, "call")}</Text>
        <Text color={PALETTE.dim}>{"  "}{formatDuration(elapsed)}</Text>
      </Text>

      {/* Stream preview sub-line */}
      {previewText && (
        <Text>
          <Text color={PALETTE.dim}>{continuation}{TREE.preview}</Text>
          <Text color={PALETTE.faint}>{previewText}</Text>
        </Text>
      )}
    </Box>
  );
};

// ---------------------------------------------------------------------------
// Live sub-agent list with tree structure
// ---------------------------------------------------------------------------

interface SubAgentListProps {
  agents: SubAgentState[];
}

/**
 * Renders live sub-agents as a tree branching from the orchestrator.
 * Uses box-drawing characters for the parent→child visual.
 */
export const SubAgentList: React.FC<SubAgentListProps> = ({ agents }) => {
  if (agents.length === 0) return null;

  const runningCount = agents.filter((a) => a.phase === "running").length;
  const totalCount = agents.length;
  const headerLabel = runningCount > 0
    ? `${runningCount}/${totalCount} agents`
    : `${totalCount} agent${totalCount !== 1 ? "s" : ""}`;

  return (
    <Box flexDirection="column" marginTop={0}>
      {/* Tree header */}
      <Text>
        <Text color={PALETTE.purple}>{ICONS.tool} </Text>
        <Text color={PALETTE.muted}>Orchestrating</Text>
        <Text color={PALETTE.dim}>{"  "}{headerLabel}</Text>
      </Text>

      {/* Agent nodes with tree connectors */}
      {agents.map((agent, idx) => {
        const isLast = idx === agents.length - 1;
        const connector = isLast ? TREE.last : TREE.branch;
        const continuation = isLast ? TREE.space : TREE.pipe;

        return (
          <AgentNode
            key={agent.childSessionId}
            agent={agent}
            connector={connector}
            continuation={continuation}
          />
        );
      })}
    </Box>
  );
};

// ---------------------------------------------------------------------------
// Legacy single-agent live view (backward compat, used by app.tsx liveToolCalls)
// ---------------------------------------------------------------------------

interface LiveSubAgentProps {
  agent: SubAgentState;
}

/**
 * Single live agent view — used when only one sub-agent is tracked
 * (e.g., direct delegate without orchestration context).
 */
export const LiveSubAgent: React.FC<LiveSubAgentProps> = ({ agent }) => {
  const colorKey = getAgentTypeColor(agent.agentType);
  const badgeColor = (PALETTE as Record<string, string>)[colorKey] ?? PALETTE.text;
  const label = capitalize(agent.agentType);
  const elapsed = useElapsedTime(agent.startTime, agent.phase, agent.durationMs);
  const statusIcon = resolveStatusIcon(agent.phase, badgeColor);
  const toolStr = resolveToolLabel(agent.phase, agent.currentTool);

  return (
    <Box marginLeft={2}>
      <Text>
        {statusIcon}
        <Text color={badgeColor} bold> {label}</Text>
        <Text color={PALETTE.muted}>{"  "}{toolStr}</Text>
        <Text color={PALETTE.dim}>{"  "}{pluralize(agent.toolCallCount, "call")}</Text>
        <Text color={PALETTE.dim}>{"  "}{formatDuration(elapsed)}</Text>
      </Text>
    </Box>
  );
};

// ---------------------------------------------------------------------------
// Static sub-agent rendering (from DisplayToolCall — frozen in history)
// ---------------------------------------------------------------------------

interface SubAgentViewProps {
  toolCall: DisplayToolCall;
}

/**
 * Static sub-agent view — renders from a frozen DisplayToolCall.
 * Used when displaying completed messages in the message history.
 */
export const SubAgentView: React.FC<SubAgentViewProps> = ({ toolCall }) => {
  const isDone = toolCall.status === "completed";
  const isDelegateCall = toolCall.name === "delegate";

  if (isDelegateCall) {
    return <DelegateView toolCall={toolCall} isDone={isDone} />;
  }
  return <ParallelView toolCall={toolCall} isDone={isDone} />;
};

// ---------------------------------------------------------------------------
// Delegate (static) — tree view for completed delegate calls
// ---------------------------------------------------------------------------

const DelegateView: React.FC<{ toolCall: DisplayToolCall; isDone: boolean }> = ({
  toolCall,
  isDone,
}) => {
  const args = toolCall.args;
  const agentType = (args.agent_type as string) ?? "general";
  const prompt = (args.prompt as string) ?? "";
  const label = capitalize(agentType);
  const summary = prompt.length > 60 ? prompt.slice(0, 60) + "…" : prompt;

  const colorKey = getAgentTypeColor(agentType);
  const badgeColor = (PALETTE as Record<string, string>)[colorKey] ?? PALETTE.text;

  return (
    <Box flexDirection="column">
      <Text>
        <Text color={PALETTE.purple}>{ICONS.tool} </Text>
        <Text bold color={badgeColor}>{label}</Text>
        <Text color={PALETTE.muted}>  {summary}</Text>
      </Text>

      {isDone && toolCall.result !== undefined && (
        <Box marginLeft={2}>
          <Text color={PALETTE.dim}>{ICONS.result}  </Text>
          <DelegateResultSummary result={toolCall.result} durationMs={toolCall.durationMs ?? 0} />
        </Box>
      )}
    </Box>
  );
};

const DelegateResultSummary: React.FC<{ result: string; durationMs: number }> = ({
  result,
  durationMs,
}) => {
  const parsed = safeParseJson(result);
  if (parsed.ok === false) {
    return <Text color={PALETTE.red}>{(parsed.error as string) ?? "Sub-agent failed"}</Text>;
  }

  const toolCount = (parsed.context as Record<string, unknown>)?.toolCalls
    ? ((parsed.context as Record<string, unknown>).toolCalls as unknown[]).length
    : 0;
  const totalTokens = ((parsed.tokensIn as number) ?? 0) + ((parsed.tokensOut as number) ?? 0);

  return (
    <Text color={PALETTE.muted}>
      Done ({pluralize(toolCount, "tool call")} {ICONS.dot} {formatTokens(totalTokens)} tokens {ICONS.dot} {formatDuration(durationMs)})
    </Text>
  );
};

// ---------------------------------------------------------------------------
// Parallel (static) — tree view for completed parallel calls
// ---------------------------------------------------------------------------

const ParallelView: React.FC<{ toolCall: DisplayToolCall; isDone: boolean }> = ({
  toolCall,
  isDone,
}) => {
  const args = toolCall.args;
  const tasks = Array.isArray(args.tasks) ? args.tasks : [];
  const taskCount = tasks.length;

  return (
    <Box flexDirection="column">
      <Text>
        <Text color={PALETTE.purple}>{ICONS.tool} </Text>
        <Text bold color={PALETTE.text}>Parallel</Text>
        <Text color={PALETTE.muted}>  {taskCount} task{taskCount !== 1 ? "s" : ""}</Text>
      </Text>

      {isDone && toolCall.result !== undefined && (
        <ParallelResultSummary result={toolCall.result} />
      )}
    </Box>
  );
};

interface ParallelResultEntry {
  label: string;
  status: string;
  agentType: string;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
  context?: { toolCalls?: unknown[] };
}

const ParallelResultSummary: React.FC<{ result: string }> = ({ result }) => {
  const parsed = safeParseJson(result);
  if (parsed.ok === false) {
    return (
      <Box marginLeft={2}>
        <Text color={PALETTE.dim}>{ICONS.result}  </Text>
        <Text color={PALETTE.red}>{(parsed.error as string) ?? "Parallel failed"}</Text>
      </Box>
    );
  }

  const results = (parsed.results as ParallelResultEntry[]) ?? [];
  if (results.length === 0) {
    return (
      <Box marginLeft={2}>
        <Text color={PALETTE.dim}>{ICONS.result}  Done (no results)</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {results.map((r, i) => {
        const isLast = i === results.length - 1;
        const connector = isLast ? TREE.last : TREE.branch;
        const icon = r.status === "success" ? ICONS.success : ICONS.error;
        const iconColor = r.status === "success" ? PALETTE.green : PALETTE.red;
        const label = capitalize(r.agentType);
        const colorKey = getAgentTypeColor(r.agentType);
        const badgeColor = (PALETTE as Record<string, string>)[colorKey] ?? PALETTE.blue;
        const toolCount = r.context?.toolCalls?.length ?? 0;
        const totalTokens = (r.tokensIn ?? 0) + (r.tokensOut ?? 0);

        return (
          <Text key={i}>
            <Text color={PALETTE.dim}>{connector}</Text>
            <Text color={iconColor}>{icon} </Text>
            <Text color={badgeColor} bold>{label}</Text>
            <Text color={PALETTE.muted}>  {pluralize(toolCount, "tool call")} {ICONS.dot} {formatTokens(totalTokens)} tokens {ICONS.dot} {formatDuration(r.durationMs)}</Text>
          </Text>
        );
      })}
    </Box>
  );
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Truncate a stream preview string to a max length, trimming trailing whitespace. */
function truncatePreview(preview: string, maxLen: number): string {
  // Take the last meaningful portion of the preview
  const cleaned = preview.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(-maxLen).trim() + "…";
}
