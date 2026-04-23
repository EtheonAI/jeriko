// MCP tool wrapper tests — id namespacing, result rendering, and the
// client delegation path (using a minimal fake client).

import { describe, it, expect } from "bun:test";
import {
  mcpToolId,
  renderCallToolResult,
  wrapMcpTool,
} from "../../../src/daemon/services/mcp/wrap.js";
import type { McpClient } from "../../../src/daemon/services/mcp/client.js";

describe("mcpToolId", () => {
  it("namespaces with mcp_<server>_<tool>", () => {
    expect(mcpToolId("fs", "read_file")).toBe("mcp_fs_read_file");
  });

  it("sanitizes special characters", () => {
    expect(mcpToolId("web-tools", "search/pages")).toBe("mcp_web_tools_search_pages");
  });
});

describe("renderCallToolResult", () => {
  it("joins text parts with newlines", () => {
    expect(renderCallToolResult({
      content: [{ type: "text", text: "hello" }, { type: "text", text: "world" }],
    })).toBe("hello\nworld");
  });

  it("renders image parts as a placeholder", () => {
    expect(renderCallToolResult({
      content: [{ type: "image", mimeType: "image/png" }],
    })).toContain("[image:image/png]");
  });

  it("indicates empty body on isError", () => {
    const out = renderCallToolResult({ content: [], isError: true });
    expect(out).toContain("error");
  });
});

describe("wrapMcpTool", () => {
  it("forwards execute() to the MCP client with namespaced name", async () => {
    let calledWith: unknown;
    const fakeClient = {
      callTool: async (p: unknown) => {
        calledWith = p;
        return { content: [{ type: "text", text: "ok" }] };
      },
    } as unknown as McpClient;

    const tool = wrapMcpTool({
      serverName: "fs",
      toolName: "read_file",
      description: "read a file",
      inputSchema: { type: "object", properties: { path: { type: "string" } } },
      client: fakeClient,
    });

    expect(tool.id).toBe("mcp_fs_read_file");
    expect(tool.description.startsWith("(MCP:fs)")).toBe(true);

    const result = await tool.execute({ path: "/tmp/x" });
    expect(result).toBe("ok");
    // The client sees the *raw* MCP tool name, not the namespaced id.
    expect(calledWith).toEqual({ name: "read_file", arguments: { path: "/tmp/x" } });
  });
});
