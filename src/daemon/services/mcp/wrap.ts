// Wrap an MCP tool description into a Jeriko `ToolDefinition` so the agent
// registry can treat MCP tools identically to native ones.
//
// The wrapper:
//   • Namespaces the tool id as `mcp_<server>_<tool>` to avoid collisions.
//   • Routes `execute()` through the MCP client.
//   • Translates the MCP `CallToolResult` (content parts + isError) into
//     the string return contract the agent loop expects.

import type { ToolDefinition, JSONSchema } from "../../agent/tools/registry.js";
import type { McpClient } from "./client.js";
import type { CallToolResult, ContentPart } from "./protocol.js";

export interface WrapInput {
  serverName: string;
  toolName: string;
  description: string;
  inputSchema: Record<string, unknown>;
  client: McpClient;
}

/** Namespace prefix — `_` keeps it a valid identifier for most tokenizers. */
export function mcpToolId(serverName: string, toolName: string): string {
  return `mcp_${sanitize(serverName)}_${sanitize(toolName)}`;
}

function sanitize(input: string): string {
  return input.replace(/[^a-zA-Z0-9_]/g, "_");
}

/**
 * Transform a `CallToolResult` into the plain-string contract used by the
 * agent loop. Text parts are joined; non-text parts are rendered as a short
 * placeholder so the model knows content was elided rather than discarded.
 */
export function renderCallToolResult(result: CallToolResult): string {
  const parts = result.content.map((c) => renderPart(c));
  const body = parts.join("\n").trim();
  if (result.isError) return body || "[MCP tool returned error with no body]";
  return body || "[MCP tool returned empty result]";
}

function renderPart(part: ContentPart): string {
  if (part.type === "text") return part.text ?? "";
  if (part.type === "image") return `[image:${part.mimeType ?? "unknown"}]`;
  if (part.type === "resource") return `[resource:${part.mimeType ?? "unknown"}]`;
  return "";
}

/**
 * Build a Jeriko `ToolDefinition` that delegates to the MCP client.
 *
 * `description` is prefixed with a `(MCP:server)` tag so operators
 * reading the model's tool list know which tools come from which source.
 */
export function wrapMcpTool(input: WrapInput): ToolDefinition {
  const id = mcpToolId(input.serverName, input.toolName);
  return {
    id,
    name: id,
    description: `(MCP:${input.serverName}) ${input.description}`.trim(),
    parameters: input.inputSchema as JSONSchema,
    async execute(args) {
      const result = await input.client.callTool({
        name: input.toolName,
        arguments: args,
      });
      return renderCallToolResult(result);
    },
  };
}
