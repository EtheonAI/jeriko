/**
 * SubAgent — Live sub-agent monitoring display.
 *
 * Two rendering modes:
 *
 * 1. **Live mode** — renders from SubAgentState (real-time streaming):
 *    ⏺ Research  "Find authentication patterns in the codebase"
 *      ⠙ Running search_files…  3 tool calls
 *      Preview: Found 12 files with auth patterns including…
 *
 *    When completed:
 *    ⏺ Research  Find authentication patterns…
 *      ⎿  Done (8 tool calls · 4.6s)
 *
 * 2. **Static mode** — renders from DisplayToolCall (frozen in message history):
 *    ⏺ Explore  Search for auth patterns…
 *      ⎿  Done (5 tool calls · 4.6k tokens · 8.2s)
 *
 * Live mode takes priority when SubAgentState is provided.
 */

import React from "react";
import { Text, Box } from "ink";
import { PALETTE } from "../theme.js";
import {
  capitalize,
  formatTokens,
  formatDuration,
  pluralize,
  safeParseJson,
} from "../format.js";
import { Spinner } from "./Spinner.js";
import { getAgentTypeColor } from "../hooks/useSubAgents.js";
import type { DisplayToolCall, SubAgentState } from "../types.js";

// ---------------------------------------------------------------------------
// Live sub-agent rendering (from SubAgentState)
// ---------------------------------------------------------------------------

interface LiveSubAgentProps {
  agent: SubAgentState;
}

/**
 * Live sub-agent view — shows real-time status with spinner,
 * tool indicator, stream preview, and completion summary.
 */
export const LiveSubAgent: React.FC<LiveSubAgentProps> = ({ agent }) => {
  const colorKey = getAgentTypeColor(agent.agentType);
  const badgeColor = (PALETTE as Record<string, string>)[colorKey] ?? PALETTE.text;
  const label = capitalize(agent.agentType);
  const summary = agent.label.length > 60
    ? agent.label.slice(0, 60) + "…"
    : agent.label;

  return (
    <Box flexDirection="column">
      {/* Header line: badge + type + prompt summary */}
      <Text>
        <Text color={PALETTE.purple}>⏺ </Text>
        <Text bold color={badgeColor}>{label}</Text>
        <Text color={PALETTE.muted}>  {summary}</Text>
      </Text>

      {/* Running state: spinner + tool + tool count */}
      {agent.phase === "running" && (
        <Box marginLeft={4}>
          <Spinner
            label={agent.currentTool ? `Running ${agent.currentTool}` : "Working"}
            color={badgeColor}
          />
          {agent.toolCallCount > 0 && (
            <Text color={PALETTE.dim}>  {pluralize(agent.toolCallCount, "tool call")}</Text>
          )}
        </Box>
      )}

      {/* Running state: stream preview (if available) */}
      {agent.phase === "running" && agent.streamPreview.length > 0 && (
        <Box marginLeft={4}>
          <Text color={PALETTE.dim}>Preview: </Text>
          <Text color={PALETTE.muted}>{agent.streamPreview}</Text>
        </Box>
      )}

      {/* Completed state */}
      {agent.phase === "completed" && (
        <Box marginLeft={2}>
          <Text color={PALETTE.dim}>⎿  </Text>
          <Text color={PALETTE.muted}>
            Done ({pluralize(agent.toolCallCount, "tool call")}
            {agent.durationMs != null && agent.durationMs > 0
              ? ` · ${formatDuration(agent.durationMs)}`
              : ""}
            )
          </Text>
        </Box>
      )}

      {/* Error state */}
      {agent.phase === "error" && (
        <Box marginLeft={2}>
          <Text color={PALETTE.dim}>⎿  </Text>
          <Text color={PALETTE.red}>
            Failed ({pluralize(agent.toolCallCount, "tool call")}
            {agent.durationMs != null && agent.durationMs > 0
              ? ` · ${formatDuration(agent.durationMs)}`
              : ""}
            )
          </Text>
        </Box>
      )}
    </Box>
  );
};

// ---------------------------------------------------------------------------
// Live sub-agent list (renders all tracked agents)
// ---------------------------------------------------------------------------

interface SubAgentListProps {
  agents: SubAgentState[];
}

/**
 * Renders a list of live sub-agents.
 * Expects a sorted array (from useSubAgents hook).
 */
export const SubAgentList: React.FC<SubAgentListProps> = ({ agents }) => {
  if (agents.length === 0) return null;

  return (
    <Box flexDirection="column">
      {agents.map((agent) => (
        <LiveSubAgent key={agent.childSessionId} agent={agent} />
      ))}
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
// Delegate (static)
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
        <Text color={PALETTE.purple}>⏺ </Text>
        <Text bold color={badgeColor}>{label}</Text>
        <Text color={PALETTE.muted}>  {summary}</Text>
      </Text>

      {isDone && toolCall.result !== undefined && (
        <Box marginLeft={2}>
          <Text color={PALETTE.dim}>⎿  </Text>
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
      Done ({pluralize(toolCount, "tool call")} · {formatTokens(totalTokens)} tokens · {formatDuration(durationMs)})
    </Text>
  );
};

// ---------------------------------------------------------------------------
// Parallel (static)
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
        <Text color={PALETTE.purple}>⏺ </Text>
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
        <Text color={PALETTE.dim}>⎿  </Text>
        <Text color={PALETTE.red}>{(parsed.error as string) ?? "Parallel failed"}</Text>
      </Box>
    );
  }

  const results = (parsed.results as ParallelResultEntry[]) ?? [];
  if (results.length === 0) {
    return (
      <Box marginLeft={2}>
        <Text color={PALETTE.dim}>⎿  Done (no results)</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {results.map((r, i) => {
        const icon = r.status === "success" ? "✓" : "✗";
        const iconColor = r.status === "success" ? PALETTE.green : PALETTE.red;
        const label = capitalize(r.agentType);
        const colorKey = getAgentTypeColor(r.agentType);
        const badgeColor = (PALETTE as Record<string, string>)[colorKey] ?? PALETTE.blue;
        const toolCount = r.context?.toolCalls?.length ?? 0;
        const totalTokens = (r.tokensIn ?? 0) + (r.tokensOut ?? 0);

        return (
          <Box key={i} marginLeft={2}>
            <Text color={PALETTE.dim}>⎿  </Text>
            <Text color={iconColor}>{icon} </Text>
            <Text color={badgeColor}>{label}</Text>
            <Text color={PALETTE.muted}>  {pluralize(toolCount, "tool call")} · {formatTokens(totalTokens)} tokens · {formatDuration(r.durationMs)}</Text>
          </Box>
        );
      })}
    </Box>
  );
};
