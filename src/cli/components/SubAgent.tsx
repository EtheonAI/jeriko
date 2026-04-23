/**
 * SubAgent — live sub-agent orchestration display with tree structure.
 *
 * Renders sub-agents as a tree branching from the orchestrator, with
 * connector lines showing parent→child relationships:
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
 *
 * Every color routes through useTheme(); no direct PALETTE reads.
 * Agent-type badges resolve through semantic `Tone` values so themes
 * can restyle them instantly.
 */

import React, { useState, useEffect } from "react";
import { Text, Box } from "ink";
import { ICONS } from "../theme.js";
import { useTheme } from "../hooks/useTheme.js";
import { resolveTone } from "../ui/tokens.js";
import type { Tone } from "../ui/types.js";
import {
  capitalize,
  formatTokens,
  formatDuration,
  pluralize,
  safeParseJson,
} from "../format.js";
import { getAgentTypeTone } from "../hooks/useSubAgents.js";
import type { DisplayToolCall, SubAgentState } from "../types.js";

// ---------------------------------------------------------------------------
// Tree connector characters
// ---------------------------------------------------------------------------

const TREE = {
  branch:   "├── ",
  last:     "└── ",
  pipe:     "│   ",
  space:    "    ",
  preview:  "└ ",
} as const;

// ---------------------------------------------------------------------------
// Inline spinner (shared)
// ---------------------------------------------------------------------------

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

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
// Status-tone resolver (pure)
// ---------------------------------------------------------------------------

function getStatusTone(phase: SubAgentState["phase"]): Tone {
  switch (phase) {
    case "running":   return "info";
    case "completed": return "success";
    case "error":     return "error";
  }
}

const StatusIconByPhase: React.FC<{
  readonly phase: SubAgentState["phase"];
  readonly runningColor: string;
}> = ({ phase, runningColor }) => {
  const { colors } = useTheme();
  const tone = getStatusTone(phase);
  switch (phase) {
    case "running":
      return <SpinnerChar color={runningColor} />;
    case "completed":
      return <Text color={resolveTone(tone, colors)}>{ICONS.success}</Text>;
    case "error":
      return <Text color={resolveTone(tone, colors)}>{ICONS.error}</Text>;
  }
};

// ---------------------------------------------------------------------------
// Tool activity labels
// ---------------------------------------------------------------------------

const TOOL_ACTIVITY_LABELS: Record<string, string> = {
  read_file:        "reading",
  read:             "reading",
  write_file:       "writing",
  write:            "writing",
  edit_file:        "editing",
  edit:             "editing",
  search_files:     "searching",
  grep:             "searching",
  search:           "searching",
  glob:             "searching",
  list_files:       "browsing",
  list_directory:   "browsing",
  analyze:          "analyzing",
  lint:             "analyzing",
  type_check:       "analyzing",
  bash:             "executing",
  exec:             "executing",
  run_command:      "executing",
  shell:            "executing",
  web_search:       "searching web",
  web_fetch:        "fetching",
  browse:           "browsing",
  plan:             "planning",
  memory:           "remembering",
  use_skill:        "using skill",
  delegate:         "delegating",
  parallel_tasks:   "orchestrating",
};

function resolveToolActivity(toolName: string | null): string {
  if (!toolName) return "working";
  return TOOL_ACTIVITY_LABELS[toolName]
    ?? TOOL_ACTIVITY_LABELS[toolName.toLowerCase()]
    ?? toolName;
}

function resolveToolLabel(phase: SubAgentState["phase"], currentTool: string | null): string {
  switch (phase) {
    case "running":   return resolveToolActivity(currentTool);
    case "completed": return "done";
    case "error":     return "failed";
  }
}

// ---------------------------------------------------------------------------
// Live sub-agent node
// ---------------------------------------------------------------------------

interface AgentNodeProps {
  readonly agent: SubAgentState;
  readonly connector: string;
  readonly continuation: string;
  readonly showPreview?: boolean;
}

const AgentNode: React.FC<AgentNodeProps> = ({
  agent,
  connector,
  continuation,
  showPreview = true,
}) => {
  const { colors } = useTheme();
  const badgeTone = getAgentTypeTone(agent.agentType);
  const badgeColor = resolveTone(badgeTone, colors);
  const label = capitalize(agent.agentType);
  const elapsed = useElapsedTime(agent.startTime, agent.phase, agent.durationMs);
  const toolStr = resolveToolLabel(agent.phase, agent.currentTool);

  const previewText = showPreview && agent.phase === "running" && agent.streamPreview.length > 0
    ? truncatePreview(agent.streamPreview, 60)
    : null;
  const taskLabel = !previewText && agent.label && agent.label !== agent.agentType
    ? truncatePreview(agent.label, 60)
    : null;

  return (
    <Box flexDirection="column" overflowX="hidden">
      <Text wrap="truncate-end">
        <Text color={colors.dim}>{connector}</Text>
        <StatusIconByPhase phase={agent.phase} runningColor={badgeColor} />
        <Text color={badgeColor} bold> {label}</Text>
        <Text color={colors.muted}>{"  "}{toolStr}</Text>
        <Text color={colors.dim}>{"  "}{pluralize(agent.toolCallCount, "call")}</Text>
        <Text color={colors.dim}>{"  "}{formatDuration(elapsed)}</Text>
      </Text>

      {(previewText || taskLabel) && (
        <Text wrap="truncate-end">
          <Text color={colors.dim}>{continuation}{TREE.preview}</Text>
          <Text color={colors.faint}>{previewText ?? taskLabel}</Text>
        </Text>
      )}
    </Box>
  );
};

// ---------------------------------------------------------------------------
// Live sub-agent list (tree)
// ---------------------------------------------------------------------------

interface SubAgentListProps {
  readonly agents: SubAgentState[];
}

const SubAgentListImpl: React.FC<SubAgentListProps> = ({ agents }) => {
  const { colors } = useTheme();
  if (agents.length === 0) return null;

  const runningCount = agents.filter((a) => a.phase === "running").length;
  const totalCount = agents.length;
  const headerLabel = runningCount > 0
    ? `${runningCount}/${totalCount} agents`
    : `${totalCount} agent${totalCount !== 1 ? "s" : ""}`;

  return (
    <Box flexDirection="column" marginTop={0}>
      <Text>
        <Text color={colors.purple}>{ICONS.tool} </Text>
        <Text color={colors.muted}>Orchestrating</Text>
        <Text color={colors.dim}>{"  "}{headerLabel}</Text>
      </Text>

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

/** Memoized by agents array reference — internal per-agent animation is
 *  handled by each AgentNode's own interval, not by re-renders of the list. */
export const SubAgentList = React.memo(SubAgentListImpl);

// ---------------------------------------------------------------------------
// Legacy single-agent live view
// ---------------------------------------------------------------------------

interface LiveSubAgentProps {
  readonly agent: SubAgentState;
}

export const LiveSubAgent: React.FC<LiveSubAgentProps> = ({ agent }) => {
  const { colors } = useTheme();
  const badgeColor = resolveTone(getAgentTypeTone(agent.agentType), colors);
  const label = capitalize(agent.agentType);
  const elapsed = useElapsedTime(agent.startTime, agent.phase, agent.durationMs);
  const toolStr = resolveToolLabel(agent.phase, agent.currentTool);

  return (
    <Box marginLeft={2}>
      <Text>
        <StatusIconByPhase phase={agent.phase} runningColor={badgeColor} />
        <Text color={badgeColor} bold> {label}</Text>
        <Text color={colors.muted}>{"  "}{toolStr}</Text>
        <Text color={colors.dim}>{"  "}{pluralize(agent.toolCallCount, "call")}</Text>
        <Text color={colors.dim}>{"  "}{formatDuration(elapsed)}</Text>
      </Text>
    </Box>
  );
};

// ---------------------------------------------------------------------------
// Static sub-agent rendering (from DisplayToolCall — frozen in history)
// ---------------------------------------------------------------------------

interface SubAgentViewProps {
  readonly toolCall: DisplayToolCall;
}

const SubAgentViewImpl: React.FC<SubAgentViewProps> = ({ toolCall }) => {
  const isDone = toolCall.status === "completed";
  const isDelegateCall = toolCall.name === "delegate";
  if (isDelegateCall) return <DelegateView toolCall={toolCall} isDone={isDone} />;
  return <ParallelView toolCall={toolCall} isDone={isDone} />;
};

/** Memoized — frozen SubAgentViews in history shouldn't re-render. */
export const SubAgentView = React.memo(SubAgentViewImpl);

// ---------------------------------------------------------------------------
// Delegate (static)
// ---------------------------------------------------------------------------

const DelegateView: React.FC<{ readonly toolCall: DisplayToolCall; readonly isDone: boolean }> = ({
  toolCall,
  isDone,
}) => {
  const { colors } = useTheme();
  const args = toolCall.args;
  const agentType = (args.agent_type as string) ?? "general";
  const prompt = (args.prompt as string) ?? "";
  const label = capitalize(agentType);
  const summary = prompt.length > 60 ? prompt.slice(0, 60) + "…" : prompt;
  const badgeColor = resolveTone(getAgentTypeTone(agentType), colors);

  return (
    <Box flexDirection="column">
      <Text>
        <Text color={colors.purple}>{ICONS.tool} </Text>
        <Text bold color={badgeColor}>{label}</Text>
        <Text color={colors.muted}>  {summary}</Text>
      </Text>

      {isDone && toolCall.result !== undefined && (
        <Box marginLeft={2}>
          <Text color={colors.dim}>{ICONS.result}  </Text>
          <DelegateResultSummary result={toolCall.result} durationMs={toolCall.durationMs ?? 0} />
        </Box>
      )}
    </Box>
  );
};

const DelegateResultSummary: React.FC<{ readonly result: string; readonly durationMs: number }> = ({
  result,
  durationMs,
}) => {
  const { colors } = useTheme();
  const parsed = safeParseJson(result);
  if (parsed.ok === false) {
    return <Text color={colors.error}>{(parsed.error as string) ?? "Sub-agent failed"}</Text>;
  }

  const toolCount = (parsed.context as Record<string, unknown>)?.toolCalls
    ? ((parsed.context as Record<string, unknown>).toolCalls as unknown[]).length
    : 0;
  const totalTokens = ((parsed.tokensIn as number) ?? 0) + ((parsed.tokensOut as number) ?? 0);

  return (
    <Text color={colors.muted}>
      Done ({pluralize(toolCount, "tool call")} {ICONS.dot} {formatTokens(totalTokens)} tokens {ICONS.dot} {formatDuration(durationMs)})
    </Text>
  );
};

// ---------------------------------------------------------------------------
// Parallel (static)
// ---------------------------------------------------------------------------

const ParallelView: React.FC<{ readonly toolCall: DisplayToolCall; readonly isDone: boolean }> = ({
  toolCall,
  isDone,
}) => {
  const { colors } = useTheme();
  const args = toolCall.args;
  const tasks = Array.isArray(args.tasks) ? args.tasks : [];
  const taskCount = tasks.length;

  return (
    <Box flexDirection="column">
      <Text>
        <Text color={colors.purple}>{ICONS.tool} </Text>
        <Text bold color={colors.text}>Parallel</Text>
        <Text color={colors.muted}>  {taskCount} task{taskCount !== 1 ? "s" : ""}</Text>
      </Text>

      {isDone && toolCall.result !== undefined && (
        <ParallelResultSummary result={toolCall.result} />
      )}
    </Box>
  );
};

interface ParallelResultEntry {
  readonly label: string;
  readonly status: string;
  readonly agentType: string;
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly durationMs: number;
  readonly context?: { toolCalls?: unknown[] };
}

const ParallelResultSummary: React.FC<{ readonly result: string }> = ({ result }) => {
  const { colors } = useTheme();
  const parsed = safeParseJson(result);
  if (parsed.ok === false) {
    return (
      <Box marginLeft={2}>
        <Text color={colors.dim}>{ICONS.result}  </Text>
        <Text color={colors.error}>{(parsed.error as string) ?? "Parallel failed"}</Text>
      </Box>
    );
  }

  const results = (parsed.results as ParallelResultEntry[]) ?? [];
  if (results.length === 0) {
    return (
      <Box marginLeft={2}>
        <Text color={colors.dim}>{ICONS.result}  Done (no results)</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {results.map((r, i) => {
        const isLast = i === results.length - 1;
        const connector = isLast ? TREE.last : TREE.branch;
        const icon = r.status === "success" ? ICONS.success : ICONS.error;
        const iconColor = r.status === "success" ? colors.success : colors.error;
        const label = capitalize(r.agentType);
        const badgeColor = resolveTone(getAgentTypeTone(r.agentType), colors);
        const toolCount = r.context?.toolCalls?.length ?? 0;
        const totalTokens = (r.tokensIn ?? 0) + (r.tokensOut ?? 0);

        return (
          <Text key={i}>
            <Text color={colors.dim}>{connector}</Text>
            <Text color={iconColor}>{icon} </Text>
            <Text color={badgeColor} bold>{label}</Text>
            <Text color={colors.muted}>  {pluralize(toolCount, "tool call")} {ICONS.dot} {formatTokens(totalTokens)} tokens {ICONS.dot} {formatDuration(r.durationMs)}</Text>
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
  const cleaned = preview.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(-maxLen).trim() + "…";
}
