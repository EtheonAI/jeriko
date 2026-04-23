/**
 * MCP health snapshot — the typed view `/status` and boot diagnostics
 * rely on. The boot path is mocked here so we can exercise the
 * snapshot without spinning up real MCP transports.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import {
  getMcpHealth,
  startMcpServers,
  stopMcpServers,
} from "../../../src/daemon/services/mcp/index.js";

beforeEach(async () => {
  // Each test starts from a clean slate so module-scope state doesn't
  // leak between cases.
  await stopMcpServers();
});

describe("getMcpHealth — idle", () => {
  it("returns summary='idle' before any boot attempt", () => {
    const h = getMcpHealth();
    expect(h.summary).toBe("idle");
    expect(h.lastBootAt).toBeNull();
    expect(h.servers).toEqual([]);
  });
});

describe("getMcpHealth — after boot", () => {
  it("summary='ok' when no servers configured (empty boot succeeds)", async () => {
    await startMcpServers({ config: { servers: {} } });
    const h = getMcpHealth();
    expect(h.summary).toBe("ok");
    expect(h.lastBootAt).not.toBeNull();
    expect(h.servers).toEqual([]);
  });

  it("summary='degraded' when a configured server fails to start", async () => {
    // An unreachable HTTP endpoint guarantees a failure from the MCP
    // client's initialize call without needing a subprocess.
    await startMcpServers({
      config: {
        servers: {
          broken: {
            transport: "http",
            url: "http://127.0.0.1:1/does-not-exist",
          },
        },
      },
    });
    const h = getMcpHealth();
    expect(h.summary).toBe("degraded");
    expect(h.servers).toHaveLength(1);
    expect(h.servers[0]!.name).toBe("broken");
    expect(h.servers[0]!.status).toBe("failed");
    expect(h.servers[0]!.tools).toBe(0);
    expect(h.servers[0]!.error).toBeTruthy();
  });

  it("servers are sorted alphabetically for stable /status rendering", async () => {
    await startMcpServers({
      config: {
        servers: {
          zebra: { transport: "http", url: "http://127.0.0.1:1/z" },
          alpha: { transport: "http", url: "http://127.0.0.1:1/a" },
          mango: { transport: "http", url: "http://127.0.0.1:1/m" },
        },
      },
    });
    const h = getMcpHealth();
    expect(h.servers.map((s) => s.name)).toEqual(["alpha", "mango", "zebra"]);
  });
});
