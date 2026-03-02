// Daemon — Sub-agent orchestrator.
// Delegates tasks to typed sub-agents, fans out parallel work,
// and returns structured context (not just text) to the parent.
//
// Solves the "text-only return" problem (Claude Code #5812):
// Sub-agents stream structured context (tool calls, files touched,
// artifacts, errors) into SQLite via the agent_context table.
// The parent reads it back — no context lost across the boundary.

import { runAgent, type AgentRunConfig, type AgentEvent } from "./agent.js";
import { createSession, type SessionCreateOpts } from "./session/session.js";
import { addMessage } from "./session/message.js";
import { listTools } from "./tools/registry.js";
import { getDatabase } from "../storage/db.js";
import { getLogger } from "../../shared/logger.js";
import { Bus } from "../../shared/bus.js";
import { getActiveDepth, getActiveContext, setActiveContext } from "./orchestrator-context.js";
import type { DriverMessage } from "./drivers/index.js";
import type { AgentContext } from "../storage/schema.js";
import { randomUUID } from "node:crypto";

const log = getLogger();

// ---------------------------------------------------------------------------
// Agent type presets — scoped tool sets per agent role
// ---------------------------------------------------------------------------

/**
 * Agent type presets define which tools each type of sub-agent can access.
 * This prevents a "research" agent from editing files, and a "task" agent
 * from running web searches when it shouldn't.
 *
 * null = all tools (no restriction).
 */
export const AGENT_TYPES = {
  /** Full access — can do anything. */
  general: null,

  /** Research only — web search, browser, read files, list files, skills. No mutations. */
  research: ["web_search", "browser", "read_file", "list_files", "search_files", "use_skill"],

  /** Task agent — can read, write, edit, run bash, browse, capture, connectors, skills. No web search. */
  task: ["bash", "browser", "read_file", "write_file", "edit_file", "list_files", "search_files", "camera", "screenshot", "connector", "use_skill"],

  /** Explorer — fast codebase navigation. Read-only, no bash. */
  explore: ["read_file", "list_files", "search_files"],

  /** Planner — can read, search, browse, and load skill knowledge. No mutations. */
  plan: ["read_file", "list_files", "search_files", "web_search", "browser", "use_skill"],
} as const;

export type AgentType = keyof typeof AGENT_TYPES;

/**
 * Maximum nesting depth for sub-agent orchestration.
 * At this depth, orchestrator tools (delegate, parallel_tasks) are filtered
 * from the child's tool set to prevent infinite recursion.
 */
export const MAX_DEPTH = 2;

/** Tool IDs that enable sub-agent spawning — filtered at MAX_DEPTH. */
const ORCHESTRATOR_TOOL_IDS = new Set(["delegate", "parallel_tasks"]);

/** Validate and return tool IDs for an agent type. */
export function getToolsForType(agentType: AgentType): string[] | null {
  const tools = AGENT_TYPES[agentType];
  if (tools === null) return null; // all tools
  return [...tools];
}

/**
 * Filter orchestrator tools from a tool list when at max depth.
 * If toolIds is null (all tools), enumerates the full registry and excludes
 * the orchestrator tools. If toolIds is an explicit list, filters them out.
 */
export function filterOrchestratorTools(toolIds: string[] | null): string[] {
  if (toolIds === null) {
    // Enumerate all registered tools, excluding orchestrator tools
    return listTools()
      .map((t) => t.id)
      .filter((id) => !ORCHESTRATOR_TOOL_IDS.has(id));
  }
  return toolIds.filter((id) => !ORCHESTRATOR_TOOL_IDS.has(id));
}

// ---------------------------------------------------------------------------
// Orchestrator event bus — real-time streaming from sub-agents to parent
// ---------------------------------------------------------------------------

export interface OrchestratorEvents extends Record<string, unknown> {
  "sub:started":    { parentSessionId: string; childSessionId: string; label: string; agentType: AgentType };
  "sub:text_delta": { childSessionId: string; content: string };
  "sub:tool_call":  { childSessionId: string; toolName: string; toolCallId: string };
  "sub:tool_result":{ childSessionId: string; toolCallId: string; isError: boolean };
  "sub:complete":   { childSessionId: string; label: string; status: "success" | "error"; durationMs: number };
  "sub:context":    { childSessionId: string; kind: AgentContext["kind"]; key: string };
}

/** Orchestrator-scoped event bus. Parent can subscribe to observe sub-agent progress. */
export const orchestratorBus = new Bus<OrchestratorEvents>();

// ---------------------------------------------------------------------------
// Context capture — write structured artifacts to SQLite
// ---------------------------------------------------------------------------

function writeContext(
  sessionId: string,
  kind: AgentContext["kind"],
  key: string,
  value: string,
): void {
  const db = getDatabase();
  const id = randomUUID().slice(0, 12);
  db.prepare(
    "INSERT INTO agent_context (id, session_id, kind, key, value, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, sessionId, kind, key, value, Date.now());

  orchestratorBus.emit("sub:context", { childSessionId: sessionId, kind, key });
}

/**
 * Read all structured context artifacts for a session.
 * This is how the parent gets tool calls, files, and artifacts
 * back from a sub-agent — from SQLite, not from parsing text.
 */
export function readContext(sessionId: string): AgentContext[] {
  const db = getDatabase();
  return db
    .query<AgentContext, [string]>(
      "SELECT * FROM agent_context WHERE session_id = ? ORDER BY created_at ASC",
    )
    .all(sessionId);
}

/** Read context filtered by kind. */
export function readContextByKind(
  sessionId: string,
  kind: AgentContext["kind"],
): AgentContext[] {
  const db = getDatabase();
  return db
    .query<AgentContext, [string, string]>(
      "SELECT * FROM agent_context WHERE session_id = ? AND kind = ? ORDER BY created_at ASC",
    )
    .all(sessionId, kind);
}

/** Get all child sessions for a parent. */
export function getChildSessions(parentSessionId: string) {
  const db = getDatabase();
  return db
    .query<{ id: string; slug: string; title: string; agent_type: string; token_count: number }, [string]>(
      "SELECT id, slug, title, agent_type, token_count FROM session WHERE parent_session_id = ? ORDER BY created_at ASC",
    )
    .all(parentSessionId);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single sub-task to delegate to a sub-agent. */
export interface SubTask {
  /** Human-readable label for this sub-task. */
  label: string;
  /** The prompt to send to the sub-agent. */
  prompt: string;
  /** Agent type preset — scopes which tools are available. Default: "general". */
  agentType?: AgentType;
  /** Optional model override for this sub-task. */
  model?: string;
  /** Optional backend override for this sub-task. */
  backend?: string;
  /** Optional explicit tool whitelist (overrides agentType if set). */
  toolIds?: string[];
}

/**
 * Structured context returned from a sub-agent.
 * This is the fix for Claude Code #5812 — instead of returning
 * just a text string, we return everything the sub-agent did.
 */
export interface SubTaskContext {
  /** Tool calls the sub-agent made, in order. */
  toolCalls: Array<{ name: string; arguments: string; result: string; isError: boolean }>;
  /** Files the sub-agent created or modified. */
  filesWritten: string[];
  filesEdited: string[];
  /** Named artifacts (e.g. search results, generated code, summaries). */
  artifacts: Array<{ key: string; value: string }>;
  /** Errors encountered during execution. */
  errors: string[];
  /** Token usage metrics. */
  metrics: { tokensIn: number; tokensOut: number; rounds: number };
}

/** Result of a single sub-task execution — text + structured context. */
export interface SubTaskResult {
  label: string;
  status: "success" | "error";
  /** The full text response from the sub-agent. */
  response: string;
  /** Structured context — everything the sub-agent did. */
  context: SubTaskContext;
  /** The sub-session ID created for this task. */
  sessionId: string;
  /** Agent type used. */
  agentType: AgentType;
  /** Token counts. */
  tokensIn: number;
  tokensOut: number;
  /** Execution time in milliseconds. */
  durationMs: number;
}

/** Options for the fanOut operation. */
export interface FanOutOptions {
  /** Maximum number of concurrent sub-agents. Default: 4. */
  maxConcurrency?: number;
  /** Parent session ID for traceability. */
  parentSessionId?: string;
  /** Default backend if not specified per-task. */
  defaultBackend?: string;
  /** Default model if not specified per-task. */
  defaultModel?: string;
  /** Default agent type for all sub-agents. */
  defaultAgentType?: AgentType;
  /** System prompt for all sub-agents. */
  systemPrompt?: string;
  /** Parent messages to forward as context to sub-agents. */
  parentMessages?: DriverMessage[];
  /** Optional AbortSignal — checked before each wave and forwarded to sub-agents. */
  signal?: AbortSignal;
}

/** Result from a delegate call. */
export interface DelegateResult {
  sessionId: string;
  response: string;
  context: SubTaskContext;
  agentType: AgentType;
  tokensIn: number;
  tokensOut: number;
  events: AgentEvent[];
}

// ---------------------------------------------------------------------------
// Delegate — single sub-agent with structured context
// ---------------------------------------------------------------------------

/**
 * Delegate a prompt to a typed sub-agent in a new session.
 *
 * Creates a fresh session linked to the parent, runs the agent loop
 * with scoped tools, captures structured context into SQLite, and
 * returns both the text response and the full context.
 */
export async function delegate(
  prompt: string,
  opts: {
    backend?: string;
    model?: string;
    systemPrompt?: string;
    toolIds?: string[];
    parentSessionId?: string;
    agentType?: AgentType;
    /** Parent conversation messages to forward as context to the sub-agent. */
    parentMessages?: DriverMessage[];
    /** Optional AbortSignal — forwarded to the agent loop and LLM driver. */
    signal?: AbortSignal;
  } = {},
): Promise<DelegateResult> {
  const agentType = opts.agentType ?? "general";

  // ── Depth control ──────────────────────────────────────────────────
  // Read the parent's depth from orchestrator-context (set by runAgent).
  // Increment for the child. At MAX_DEPTH, filter out orchestrator tools
  // to prevent infinite recursion.
  const parentDepth = getActiveDepth();
  const childDepth = parentDepth + 1;

  // Resolve tool set: explicit toolIds > agentType preset > all tools
  let resolvedToolIds = opts.toolIds ?? getToolsForType(agentType);

  // At max depth, strip orchestrator tools so the child can't spawn further
  if (childDepth >= MAX_DEPTH) {
    resolvedToolIds = filterOrchestratorTools(resolvedToolIds);
    log.debug(`Delegate: depth ${childDepth} >= MAX_DEPTH ${MAX_DEPTH} — orchestrator tools filtered`);
  }

  const sessionOpts: SessionCreateOpts = {
    title: prompt.slice(0, 80),
    model: opts.model ?? "claude",
    parentSessionId: opts.parentSessionId,
    agentType,
  };

  const session = createSession(sessionOpts);
  addMessage(session.id, "user", prompt);

  const history: DriverMessage[] = [];
  if (opts.systemPrompt) {
    history.push({ role: "system", content: opts.systemPrompt });
  }

  // ── Context forwarding ─────────────────────────────────────────────
  // If parentMessages are provided, serialize them into a single system
  // message prepended to the child's history. This gives the sub-agent
  // awareness of what the parent was doing without raw conversation turns
  // (which confuse OSS models with non-alternating roles).
  if (opts.parentMessages && opts.parentMessages.length > 0) {
    const contextSummary = serializeParentContext(opts.parentMessages);
    history.push({ role: "system", content: contextSummary });
  }

  history.push({ role: "user", content: prompt });

  const config: AgentRunConfig = {
    sessionId: session.id,
    backend: opts.backend ?? "claude",
    model: opts.model ?? "claude",
    systemPrompt: opts.systemPrompt,
    toolIds: resolvedToolIds,
    signal: opts.signal,
    depth: childDepth,
  };

  // Emit start event
  orchestratorBus.emit("sub:started", {
    parentSessionId: opts.parentSessionId ?? "",
    childSessionId: session.id,
    label: prompt.slice(0, 80),
    agentType,
  });

  let fullResponse = "";
  let tokensIn = 0;
  let tokensOut = 0;
  let rounds = 0;
  const events: AgentEvent[] = [];

  // ── Re-entrancy: save parent's context ──────────────────────────────
  // The child's runAgent() will overwrite the module-level active context.
  // We save the parent's context here and restore it after the child completes.
  // This ensures that if the parent calls multiple delegate tools in sequence,
  // each one inherits the correct backend/model/depth from the parent.
  const parentContext = getActiveContext();

  // Run the agent loop and capture structured context in real-time
  for await (const event of runAgent(config, history)) {
    events.push(event);

    switch (event.type) {
      case "text_delta":
        fullResponse += event.content;
        orchestratorBus.emit("sub:text_delta", {
          childSessionId: session.id,
          content: event.content,
        });
        break;

      case "tool_call_start":
        // Capture every tool call into agent_context
        writeContext(session.id, "tool_call", event.toolCall.name, JSON.stringify({
          id: event.toolCall.id,
          name: event.toolCall.name,
          arguments: event.toolCall.arguments,
        }));
        orchestratorBus.emit("sub:tool_call", {
          childSessionId: session.id,
          toolName: event.toolCall.name,
          toolCallId: event.toolCall.id,
        });

        // Track file operations
        if (event.toolCall.name === "write_file") {
          try {
            const args = JSON.parse(event.toolCall.arguments);
            if (args.path) writeContext(session.id, "file_write", args.path, "");
          } catch { /* ignore parse errors */ }
        } else if (event.toolCall.name === "edit_file") {
          try {
            const args = JSON.parse(event.toolCall.arguments);
            if (args.path) writeContext(session.id, "file_edit", args.path, "");
          } catch { /* ignore parse errors */ }
        }
        break;

      case "tool_result":
        // Update the tool_call context entry with the result
        writeContext(session.id, "tool_call", `result:${event.toolCallId}`, JSON.stringify({
          tool_call_id: event.toolCallId,
          result: event.result.slice(0, 4096), // cap at 4KB per result
          is_error: event.isError,
        }));

        if (event.isError) {
          writeContext(session.id, "error", event.toolCallId, event.result);
        }

        orchestratorBus.emit("sub:tool_result", {
          childSessionId: session.id,
          toolCallId: event.toolCallId,
          isError: event.isError,
        });
        break;

      case "turn_complete":
        tokensIn = event.tokensIn;
        tokensOut = event.tokensOut;
        rounds++;
        break;

      case "error":
        writeContext(session.id, "error", "agent_error", event.message);
        break;
    }
  }

  // ── Re-entrancy: restore parent's context ────────────────────────────
  // The child's runAgent() cleared the active context on exit.
  // Restore the parent's context so subsequent tool calls in the same
  // parent round still have access to the correct backend/model/depth.
  if (parentContext) {
    setActiveContext(parentContext);
  }

  // Write final metrics
  writeContext(session.id, "metric", "tokens", JSON.stringify({ tokensIn, tokensOut, rounds }));

  // Store the final response as an artifact
  if (fullResponse) {
    writeContext(session.id, "artifact", "response", fullResponse);
  }

  // Build the structured context from SQLite
  const context = buildContext(session.id, tokensIn, tokensOut, rounds);

  log.info(
    `Delegate complete: session=${session.id} type=${agentType} ` +
    `tools=${context.toolCalls.length} files=${context.filesWritten.length + context.filesEdited.length} ` +
    `tokens=${tokensIn + tokensOut}`,
  );

  orchestratorBus.emit("sub:complete", {
    childSessionId: session.id,
    label: prompt.slice(0, 80),
    status: "success",
    durationMs: Date.now() - session.created_at,
  });

  return {
    sessionId: session.id,
    response: fullResponse,
    context,
    agentType,
    tokensIn,
    tokensOut,
    events,
  };
}

// ---------------------------------------------------------------------------
// Fan-out — parallel typed sub-agents
// ---------------------------------------------------------------------------

/**
 * Fan out multiple sub-tasks to concurrent typed sub-agents.
 *
 * Each sub-task can specify its own agent type (research, task, explore, plan)
 * which scopes which tools are available. Results include structured context.
 *
 * Executes in waves of `maxConcurrency` using Promise.allSettled.
 */
export async function fanOut(
  tasks: SubTask[],
  opts: FanOutOptions = {},
): Promise<SubTaskResult[]> {
  const maxConcurrency = opts.maxConcurrency ?? 4;
  const results: SubTaskResult[] = [];

  log.info(`FanOut: ${tasks.length} tasks, max concurrency=${maxConcurrency}`);

  for (let i = 0; i < tasks.length; i += maxConcurrency) {
    // Check abort signal before starting each wave
    if (opts.signal?.aborted) {
      log.info("FanOut: abort signal received, stopping before next wave");
      break;
    }

    const wave = tasks.slice(i, i + maxConcurrency);
    const waveNumber = Math.floor(i / maxConcurrency) + 1;
    log.debug(`FanOut wave ${waveNumber}: ${wave.length} task(s)`);

    const waveResults = await Promise.allSettled(
      wave.map((task) => executeSubTask(task, opts)),
    );

    for (let j = 0; j < waveResults.length; j++) {
      const settled = waveResults[j];
      if (!settled) continue;
      if (settled.status === "fulfilled") {
        results.push(settled.value);
      } else {
        const task = wave[j];
        const agentType = task?.agentType ?? opts.defaultAgentType ?? "general";
        results.push({
          label: task?.label ?? `task-${i + j}`,
          status: "error",
          response: settled.reason instanceof Error
            ? settled.reason.message
            : String(settled.reason),
          context: emptyContext(),
          sessionId: "",
          agentType,
          tokensIn: 0,
          tokensOut: 0,
          durationMs: 0,
        });
      }
    }
  }

  const succeeded = results.filter((r) => r.status === "success").length;
  const failed = results.filter((r) => r.status === "error").length;
  log.info(`FanOut complete: ${succeeded} succeeded, ${failed} failed`);

  return results;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function executeSubTask(
  task: SubTask,
  opts: FanOutOptions,
): Promise<SubTaskResult> {
  const start = Date.now();
  const agentType = task.agentType ?? opts.defaultAgentType ?? "general";

  try {
    const result = await delegate(task.prompt, {
      backend: task.backend ?? opts.defaultBackend,
      model: task.model ?? opts.defaultModel,
      systemPrompt: opts.systemPrompt,
      toolIds: task.toolIds,
      parentSessionId: opts.parentSessionId,
      agentType,
      parentMessages: opts.parentMessages,
      signal: opts.signal,
    });

    return {
      label: task.label,
      status: "success",
      response: result.response,
      context: result.context,
      sessionId: result.sessionId,
      agentType,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      label: task.label,
      status: "error",
      response: err instanceof Error ? err.message : String(err),
      context: emptyContext(),
      sessionId: "",
      agentType,
      tokensIn: 0,
      tokensOut: 0,
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Build a SubTaskContext by reading agent_context rows from SQLite.
 * This is the key innovation — the context is persisted, not ephemeral.
 * Any process (parent, CLI, API) can read it at any time.
 */
function buildContext(
  sessionId: string,
  tokensIn: number,
  tokensOut: number,
  rounds: number,
): SubTaskContext {
  const rows = readContext(sessionId);
  const ctx: SubTaskContext = {
    toolCalls: [],
    filesWritten: [],
    filesEdited: [],
    artifacts: [],
    errors: [],
    metrics: { tokensIn, tokensOut, rounds },
  };

  for (const row of rows) {
    switch (row.kind) {
      case "tool_call":
        // Only capture the initial call entries (not result: entries)
        if (!row.key.startsWith("result:")) {
          try {
            const parsed = JSON.parse(row.value);
            // Find the matching result
            const resultRow = rows.find(
              (r) => r.kind === "tool_call" && r.key === `result:${parsed.id}`,
            );
            let result = "";
            let isError = false;
            if (resultRow) {
              try {
                const resultParsed = JSON.parse(resultRow.value);
                result = resultParsed.result ?? "";
                isError = resultParsed.is_error ?? false;
              } catch { /* ignore */ }
            }
            ctx.toolCalls.push({
              name: parsed.name,
              arguments: parsed.arguments ?? "",
              result,
              isError,
            });
          } catch { /* ignore malformed context */ }
        }
        break;
      case "file_write":
        ctx.filesWritten.push(row.key);
        break;
      case "file_edit":
        ctx.filesEdited.push(row.key);
        break;
      case "artifact":
        if (row.key !== "response") {
          ctx.artifacts.push({ key: row.key, value: row.value });
        }
        break;
      case "error":
        ctx.errors.push(row.value);
        break;
      // metrics handled via function args
    }
  }

  return ctx;
}

/** Empty context for error fallback. */
function emptyContext(): SubTaskContext {
  return {
    toolCalls: [],
    filesWritten: [],
    filesEdited: [],
    artifacts: [],
    errors: [],
    metrics: { tokensIn: 0, tokensOut: 0, rounds: 0 },
  };
}

// ---------------------------------------------------------------------------
// Context serialization — structured text for OSS model compatibility
// ---------------------------------------------------------------------------

/** Maximum characters per message when serializing parent context. */
const MAX_MESSAGE_CHARS = 2000;

/**
 * Serialize parent conversation messages into a single structured text block.
 * Uses a simple format that OSS models won't confuse with conversation turns.
 *
 * The output is a system-level context block, not raw user/assistant messages,
 * to avoid confusing models that expect strict role alternation.
 */
function serializeParentContext(messages: DriverMessage[]): string {
  const lines = ["[PARENT CONTEXT — The following is context from the parent agent's conversation:]"];

  for (const msg of messages) {
    const role = msg.role.toUpperCase();
    const content = msg.content.length > MAX_MESSAGE_CHARS
      ? msg.content.slice(0, MAX_MESSAGE_CHARS) + "... (truncated)"
      : msg.content;
    lines.push(`[${role}]: ${content}`);
  }

  lines.push("[END PARENT CONTEXT]");
  return lines.join("\n");
}
