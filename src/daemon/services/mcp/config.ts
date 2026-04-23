// MCP configuration loader.
//
// The shape mirrors Claude Desktop / Cursor's `mcp.json` so any tool
// already authored for those clients works unchanged against Jeriko.
//
// Config lives at:
//   1. `$JERIKO_MCP_CONFIG` (explicit override)
//   2. `~/.config/jeriko/mcp.json`

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { getLogger } from "../../../shared/logger.js";

const log = getLogger();

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const ServerCommonSchema = z.object({
  /** Disable this server without deleting its config block. */
  disabled: z.boolean().optional().default(false),
  /** Optional label used in logs / tool descriptions. */
  label: z.string().optional(),
  /** Static env vars to forward to the server process (stdio only). */
  env: z.record(z.string(), z.string()).optional(),
  /** Initial working directory (stdio only). */
  cwd: z.string().optional(),
  /** Static HTTP headers (http only). */
  headers: z.record(z.string(), z.string()).optional(),
});

const StdioServerSchema = ServerCommonSchema.extend({
  transport: z.literal("stdio").optional(), // stdio is the default
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
});

const HttpServerSchema = ServerCommonSchema.extend({
  transport: z.literal("http"),
  url: z.string().url(),
});

const ServerSchema = z.union([StdioServerSchema, HttpServerSchema]);

const McpConfigSchema = z.object({
  servers: z.record(z.string(), ServerSchema).default({}),
});

export type McpServerConfig = z.infer<typeof ServerSchema>;
export type McpConfig = z.infer<typeof McpConfigSchema>;

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

export function defaultMcpConfigPath(): string {
  return process.env.JERIKO_MCP_CONFIG ?? join(homedir(), ".config", "jeriko", "mcp.json");
}

/** Load + validate the config. Missing file → empty config (no servers). */
export function loadMcpConfig(path: string = defaultMcpConfigPath()): McpConfig {
  if (!existsSync(path)) {
    return { servers: {} };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf-8"));
  } catch (err) {
    log.warn(`MCP config parse failed (${path}): ${err}. Ignoring servers.`);
    return { servers: {} };
  }

  const result = McpConfigSchema.safeParse(raw);
  if (!result.success) {
    log.warn(
      `MCP config validation failed (${path}): ${result.error.message}. Ignoring servers.`,
    );
    return { servers: {} };
  }

  return result.data;
}
