// Daemon — Tool registry.
// Central store for all tool definitions. Tools self-register on import.
// Provides format conversion for Anthropic and OpenAI tool schemas.
//
// Name resolution: LLMs (especially OSS models) often call tools by wrong
// names — e.g. "exec" instead of "bash" because the system prompt mentions
// `exec: <command>` as a CLI reference. The registry supports aliases so
// tools can declare alternative names. getTool() resolves aliases transparently,
// following the same pattern as resolveModel() in drivers/models.ts.

import type { DriverTool } from "../drivers/index.js";
import { getLogger } from "../../../shared/logger.js";

const log = getLogger();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** JSON Schema type used for tool parameter definitions. */
export interface JSONSchema {
  type: string;
  description?: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  enum?: string[];
  default?: unknown;
  [key: string]: unknown;
}

/**
 * A fully-specified tool definition.
 *
 * The `execute` function is called by the agent loop when the LLM
 * invokes this tool. It receives parsed arguments and must return a
 * string result (success or error).
 */
export interface ToolDefinition {
  /** Machine-readable identifier (e.g. "bash", "read_file"). */
  id: string;
  /** Human-readable name shown to the LLM. */
  name: string;
  /** Description of what the tool does, shown to the LLM. */
  description: string;
  /** JSON Schema for the tool's input parameters. */
  parameters: JSONSchema;
  /** Execute the tool with the given arguments. */
  execute: (args: Record<string, unknown>) => Promise<string>;
  /**
   * Alternative names the LLM might use to invoke this tool.
   * Common when the system prompt references CLI commands (e.g. "exec")
   * that differ from the tool's canonical name (e.g. "bash").
   */
  aliases?: string[];
}

// ---------------------------------------------------------------------------
// Registry storage
// ---------------------------------------------------------------------------

/** Primary index: tool ID → definition. */
const tools = new Map<string, ToolDefinition>();

/** Alias index: alternative name → canonical tool ID. */
const aliases = new Map<string, string>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register a tool definition. Throws if a tool with the same ID is
 * already registered. Also indexes any declared aliases.
 */
export function registerTool(tool: ToolDefinition): void {
  if (tools.has(tool.id)) {
    throw new Error(`Tool "${tool.id}" is already registered`);
  }
  tools.set(tool.id, tool);

  // Index aliases → canonical ID
  if (tool.aliases) {
    for (const alias of tool.aliases) {
      const lower = alias.toLowerCase();
      if (tools.has(lower)) {
        // Don't shadow a real tool ID with an alias
        log.debug(`Tool alias "${alias}" skipped — conflicts with tool ID "${lower}"`);
        continue;
      }
      if (aliases.has(lower)) {
        log.debug(`Tool alias "${alias}" already mapped to "${aliases.get(lower)}" — overwriting with "${tool.id}"`);
      }
      aliases.set(lower, tool.id);
    }
  }
}

/**
 * Look up a tool by ID or alias.
 *
 * Resolution order:
 *   1. Exact ID match (primary registry)
 *   2. Alias match (case-insensitive)
 *
 * When an alias resolves, it's logged at debug level for diagnostics.
 */
export function getTool(id: string): ToolDefinition | undefined {
  // Fast path — exact ID match
  const direct = tools.get(id);
  if (direct) return direct;

  // Alias resolution (case-insensitive)
  const canonicalId = aliases.get(id.toLowerCase());
  if (canonicalId) {
    log.debug(`Tool alias resolved: "${id}" → "${canonicalId}"`);
    return tools.get(canonicalId);
  }

  return undefined;
}

/** Result of dotted-name resolution for multi-action tools. */
export interface DottedToolResolution {
  /** The resolved tool definition, or undefined if not found. */
  tool: ToolDefinition | undefined;
  /** The inferred action from the dotted suffix (e.g. "click" from "browser.click"). */
  inferredAction: string | undefined;
}

/**
 * Resolve a potentially dotted tool name to a multi-action tool + action.
 *
 * OSS models (Ollama, Qwen, etc.) often call "browser.click" or "Browser.click"
 * instead of `browser(action: "click")`. This function handles that by:
 *   1. Trying getTool() as-is (exact match or alias)
 *   2. Splitting on "." and checking if the prefix is a multi-action tool
 *      (i.e. has an "action" property in its parameter schema)
 *   3. Trying the prefix in lowercase for capitalized names (e.g. "Browser")
 *
 * The caller is responsible for injecting `inferredAction` into the tool args
 * (only when args.action is not already set).
 */
export function resolveDottedTool(name: string): DottedToolResolution {
  // Fast path — direct resolution (exact ID or alias)
  const direct = getTool(name);
  if (direct) return { tool: direct, inferredAction: undefined };

  // Dotted-name resolution: split on first "."
  const dotIdx = name.indexOf(".");
  if (dotIdx <= 0) return { tool: undefined, inferredAction: undefined };

  const prefix = name.slice(0, dotIdx);
  const suffix = name.slice(dotIdx + 1);

  // Try prefix as-is, then lowercase (handles "Browser.click")
  const candidate = getTool(prefix) ?? getTool(prefix.toLowerCase());
  if (candidate?.parameters?.properties?.action) {
    log.debug(`Dotted tool name resolved: "${name}" → ${candidate.name}(action:"${suffix}")`);
    return { tool: candidate, inferredAction: suffix };
  }

  return { tool: undefined, inferredAction: undefined };
}

/**
 * Return all registered tool definitions.
 */
export function listTools(): ToolDefinition[] {
  return Array.from(tools.values());
}

/**
 * Return a subset of tools by their IDs.
 * Unknown IDs are silently skipped.
 */
export function getToolsByIds(ids: string[]): ToolDefinition[] {
  const result: ToolDefinition[] = [];
  for (const id of ids) {
    const tool = tools.get(id);
    if (tool) result.push(tool);
  }
  return result;
}

/**
 * Remove a tool from the registry (e.g. when a plugin is unloaded).
 * Also removes any aliases that pointed to this tool.
 */
export function unregisterTool(id: string): boolean {
  const deleted = tools.delete(id);
  if (deleted) {
    // Clean up aliases that pointed to this tool
    for (const [alias, targetId] of aliases) {
      if (targetId === id) aliases.delete(alias);
    }
  }
  return deleted;
}

/**
 * Clear all registered tools and aliases. Primarily for testing.
 */
export function clearTools(): void {
  tools.clear();
  aliases.clear();
}

// ---------------------------------------------------------------------------
// Format conversion — Anthropic
// ---------------------------------------------------------------------------

/**
 * Convert tool definitions to Anthropic's tool format.
 *
 * Anthropic format:
 * ```json
 * {
 *   "name": "bash",
 *   "description": "Execute a shell command",
 *   "input_schema": { "type": "object", "properties": { ... } }
 * }
 * ```
 */
export function toAnthropicFormat(
  defs: ToolDefinition[],
): Array<{ name: string; description: string; input_schema: JSONSchema }> {
  return defs.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

// ---------------------------------------------------------------------------
// Format conversion — OpenAI
// ---------------------------------------------------------------------------

/**
 * Convert tool definitions to OpenAI's function-calling format.
 *
 * OpenAI format:
 * ```json
 * {
 *   "type": "function",
 *   "function": {
 *     "name": "bash",
 *     "description": "Execute a shell command",
 *     "parameters": { "type": "object", "properties": { ... } }
 *   }
 * }
 * ```
 */
export function toOpenAIFormat(
  defs: ToolDefinition[],
): Array<{ type: "function"; function: { name: string; description: string; parameters: JSONSchema } }> {
  return defs.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

// ---------------------------------------------------------------------------
// Format conversion — Driver-agnostic (used by agent loop)
// ---------------------------------------------------------------------------

/**
 * Convert tool definitions to the driver-agnostic DriverTool format
 * used by the LLM drivers.
 */
export function toDriverFormat(defs: ToolDefinition[]): DriverTool[] {
  return defs.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters as Record<string, unknown>,
  }));
}
