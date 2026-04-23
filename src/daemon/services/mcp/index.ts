// MCP subsystem — public API.
//
// The kernel boot (new step 6.5) calls `startMcpServers()`. Each configured
// server gets a client + transport, runs `initialize`, discovers tools, and
// registers each tool with the agent's tool registry under an `mcp_<server>_<tool>`
// namespace.
//
// Failures are isolated per-server: one broken server never prevents others
// from starting. Servers that fail are logged and left out of the registry.

import { registerTool, unregisterTool } from "../../agent/tools/registry.js";
import { getLogger } from "../../../shared/logger.js";
import { McpClient } from "./client.js";
import {
  loadMcpConfig,
  type McpConfig,
  type McpServerConfig,
} from "./config.js";
import { HttpTransport } from "./http-transport.js";
import { StdioTransport } from "./stdio-transport.js";
import type { Transport } from "./transport.js";
import { wrapMcpTool } from "./wrap.js";

export { McpClient } from "./client.js";
export { loadMcpConfig, type McpConfig, type McpServerConfig } from "./config.js";
export { mcpToolId } from "./wrap.js";

const log = getLogger();

interface ActiveServer {
  name: string;
  client: McpClient;
  toolIds: string[];
}

const active = new Map<string, ActiveServer>();

export interface StartMcpServersOptions {
  config?: McpConfig;
  /** When provided, only start the named servers (intersected with config). */
  only?: readonly string[];
}

export interface StartMcpServersResult {
  started: string[];
  failed: Array<{ name: string; error: string }>;
  toolsRegistered: number;
}

/**
 * Boot every enabled MCP server in the config. Idempotent — restarts are
 * handled by `stopMcpServers()` + `startMcpServers()`.
 */
export async function startMcpServers(
  opts: StartMcpServersOptions = {},
): Promise<StartMcpServersResult> {
  const config = opts.config ?? loadMcpConfig();
  const names = Object.keys(config.servers).filter(
    (n) => !opts.only || opts.only.includes(n),
  );

  const started: string[] = [];
  const failed: Array<{ name: string; error: string }> = [];
  let toolsRegistered = 0;

  for (const name of names) {
    const serverCfg = config.servers[name]!;
    if (serverCfg.disabled) continue;

    try {
      const activeServer = await startOne(name, serverCfg);
      active.set(name, activeServer);
      started.push(name);
      toolsRegistered += activeServer.toolIds.length;
      log.info(
        `MCP: started server "${name}" — ${activeServer.toolIds.length} tool(s)`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn(`MCP: server "${name}" failed to start: ${msg}`);
      failed.push({ name, error: msg });
    }
  }

  return { started, failed, toolsRegistered };
}

/** Stop every active server and unregister their tools. */
export async function stopMcpServers(): Promise<void> {
  const servers = Array.from(active.values());
  active.clear();
  await Promise.all(
    servers.map(async (s) => {
      for (const toolId of s.toolIds) unregisterTool(toolId);
      try { await s.client.close(); } catch { /* best effort */ }
    }),
  );
}

/** Diagnostic view for `/status` / CLI. */
export function listActiveMcpServers(): Array<{ name: string; tools: number }> {
  return Array.from(active.values()).map((s) => ({ name: s.name, tools: s.toolIds.length }));
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

async function startOne(
  name: string,
  cfg: McpServerConfig,
): Promise<ActiveServer> {
  const transport = buildTransport(cfg);
  const client = new McpClient(cfg.label ?? name, transport);

  await client.start();

  const { tools } = await client.listTools();
  const registeredIds: string[] = [];

  for (const tool of tools) {
    const tooldef = wrapMcpTool({
      serverName: name,
      toolName: tool.name,
      description: tool.description ?? "",
      inputSchema: tool.inputSchema,
      client,
    });
    try {
      registerTool(tooldef);
      registeredIds.push(tooldef.id);
    } catch (err) {
      // Another server or native tool already claimed this id — log and skip.
      log.warn(
        `MCP ${name}: tool "${tooldef.id}" not registered (${err instanceof Error ? err.message : err})`,
      );
    }
  }

  return { name, client, toolIds: registeredIds };
}

function buildTransport(cfg: McpServerConfig): Transport {
  if (cfg.transport === "http") {
    return new HttpTransport({ endpoint: cfg.url, headers: cfg.headers });
  }
  // stdio is the default when transport is unspecified.
  return new StdioTransport({
    command: (cfg as Extract<McpServerConfig, { command: string }>).command,
    args: (cfg as Extract<McpServerConfig, { command: string }>).args,
    env: cfg.env,
    cwd: cfg.cwd,
  });
}
