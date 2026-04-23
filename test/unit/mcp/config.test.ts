// MCP config loader tests — verifies the schema accepts both stdio and
// http shapes and that bad configs degrade gracefully.

import { describe, it, expect } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadMcpConfig } from "../../../src/daemon/services/mcp/config.js";

function tmpFile(contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), "jeriko-mcp-"));
  const path = join(dir, "mcp.json");
  writeFileSync(path, contents, "utf-8");
  return path;
}

describe("loadMcpConfig", () => {
  it("returns empty config when file doesn't exist", () => {
    const cfg = loadMcpConfig("/tmp/definitely-not-a-real-path.json");
    expect(cfg.servers).toEqual({});
  });

  it("parses a stdio server", () => {
    const path = tmpFile(JSON.stringify({
      servers: {
        "fs": { command: "mcp-fs", args: ["--root", "/tmp"] },
      },
    }));
    const cfg = loadMcpConfig(path);
    expect(cfg.servers.fs).toBeDefined();
    expect((cfg.servers.fs as { command: string }).command).toBe("mcp-fs");
  });

  it("parses an http server", () => {
    const path = tmpFile(JSON.stringify({
      servers: {
        "remote": {
          transport: "http",
          url: "https://example.com/mcp",
          headers: { "X-Api-Key": "secret" },
        },
      },
    }));
    const cfg = loadMcpConfig(path);
    expect(cfg.servers.remote).toBeDefined();
    expect((cfg.servers.remote as { url: string }).url).toBe("https://example.com/mcp");
  });

  it("degrades gracefully on invalid JSON", () => {
    const path = tmpFile("{{not json");
    const cfg = loadMcpConfig(path);
    expect(cfg.servers).toEqual({});
  });

  it("degrades gracefully on schema violations", () => {
    const path = tmpFile(JSON.stringify({ servers: { bad: { nothing: true } } }));
    const cfg = loadMcpConfig(path);
    expect(cfg.servers).toEqual({});
  });
});
