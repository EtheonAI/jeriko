// JSON-RPC codec tests — protocol helpers should be trivially correct
// and never accept malformed shapes as successes.

import { describe, it, expect } from "bun:test";
import {
  MCP_PROTOCOL_VERSION,
  buildNotification,
  buildRequest,
  isError,
  isSuccess,
  type JsonRpcResponse,
} from "../../../src/daemon/services/mcp/protocol.js";

describe("MCP protocol helpers", () => {
  it("builds a request with the correct envelope", () => {
    const req = buildRequest(1, "tools/list");
    expect(req).toEqual({ jsonrpc: "2.0", id: 1, method: "tools/list", params: undefined });
  });

  it("builds a notification without id", () => {
    const n = buildNotification("notifications/initialized");
    expect(n).toEqual({ jsonrpc: "2.0", method: "notifications/initialized", params: undefined });
    expect((n as Record<string, unknown>).id).toBeUndefined();
  });

  it("distinguishes success and error responses", () => {
    const success: JsonRpcResponse<{ ok: true }> = {
      jsonrpc: "2.0",
      id: 1,
      result: { ok: true },
    };
    const err: JsonRpcResponse = {
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32600, message: "bad" },
    };
    expect(isSuccess(success)).toBe(true);
    expect(isError(success)).toBe(false);
    expect(isSuccess(err)).toBe(false);
    expect(isError(err)).toBe(true);
  });

  it("pins a stable protocol version", () => {
    expect(MCP_PROTOCOL_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
