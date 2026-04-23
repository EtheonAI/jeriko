// Per-agent tool assembly — independent of the parent's tool restrictions.
//
// Claude Code assembles a subagent's tool pool from the full registry
// *minus* internal-only tools, applies the agent-type's allowlist, then
// subtracts any per-agent `disallowedTools`. The parent's filtered list
// is never inherited — subagents get exactly the tools their role needs.
//
// This matches Feature 4 of the port plan: "per-agent tool assembly
// (invert current filtering model)".

import type { ToolDefinition } from "../tools/registry.js";
import { listTools } from "../tools/registry.js";
import {
  AGENT_TYPES,
  MAX_DEPTH,
  filterOrchestratorTools,
  type AgentType,
} from "../orchestrator.js";

/**
 * Tool ids that are only meaningful inside the parent's own loop and must
 * never be exposed to subagents (internal / coordinator-only).
 */
export const INTERNAL_ONLY_TOOL_IDS: readonly string[] = [
  // Currently Jeriko has no tools that are coordinator-only. The list is
  // kept as an explicit extension point so adding one (e.g. a future
  // "task_cancel" tool that only the top-level REPL should call) does
  // not accidentally leak into a subagent's pool.
];

export interface AssembleOptions {
  /** Agent type preset — drives the default allowlist. */
  agentType: AgentType;
  /** Depth of the child being assembled. `>= MAX_DEPTH` strips orchestrator tools. */
  childDepth: number;
  /** Optional explicit allowlist. Overrides the agent-type preset. */
  explicitToolIds?: string[];
  /** Optional blacklist subtracted after the allowlist is applied. */
  disallowedToolIds?: string[];
}

/**
 * Build the concrete tool list that the subagent's `runAgent()` should see.
 *
 * Resolution order (mirrors Claude Code's `assembleToolPool`):
 *   1. Start with the full registry.
 *   2. Drop `INTERNAL_ONLY_TOOL_IDS` unconditionally.
 *   3. Intersect with the allowlist (`explicitToolIds` or `AGENT_TYPES[agentType]`).
 *      A `null` preset means "all tools".
 *   4. Subtract `disallowedToolIds`.
 *   5. At `childDepth >= MAX_DEPTH`, strip orchestrator tools (`delegate`,
 *      `parallel_tasks`) to prevent infinite recursion.
 */
export function assembleToolPoolForAgent(
  opts: AssembleOptions,
): { toolIds: string[]; tools: ToolDefinition[] } {
  const registry = listTools();
  const internal = new Set(INTERNAL_ONLY_TOOL_IDS);

  // Step 1+2: drop internal-only tools.
  let pool: ToolDefinition[] = registry.filter((t) => !internal.has(t.id));

  // Step 3: apply allowlist.
  const allowList = opts.explicitToolIds ?? getAllowListFromPreset(opts.agentType);
  if (allowList !== null) {
    const allowSet = new Set(allowList);
    pool = pool.filter((t) => allowSet.has(t.id));
  }

  // Step 4: apply blacklist.
  if (opts.disallowedToolIds && opts.disallowedToolIds.length > 0) {
    const deny = new Set(opts.disallowedToolIds);
    pool = pool.filter((t) => !deny.has(t.id));
  }

  // Step 5: recursion guard.
  if (opts.childDepth >= MAX_DEPTH) {
    const toolIds = filterOrchestratorTools(pool.map((t) => t.id));
    const toolIdSet = new Set(toolIds);
    pool = pool.filter((t) => toolIdSet.has(t.id));
  }

  return {
    toolIds: pool.map((t) => t.id),
    tools: pool,
  };
}

/** Resolve the agent-type preset to a concrete allowlist (null = all tools). */
function getAllowListFromPreset(agentType: AgentType): readonly string[] | null {
  const preset = AGENT_TYPES[agentType];
  return preset === null ? null : preset;
}
