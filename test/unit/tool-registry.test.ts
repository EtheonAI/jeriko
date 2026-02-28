import { describe, expect, it, afterEach } from "bun:test";
import {
  registerTool,
  getTool,
  listTools,
  clearTools,
  unregisterTool,
  toAnthropicFormat,
  toOpenAIFormat,
  toDriverFormat,
  type ToolDefinition,
} from "../../src/daemon/agent/tools/registry.js";

const mockTool: ToolDefinition = {
  id: "test_tool",
  name: "test_tool",
  description: "A test tool",
  parameters: {
    type: "object",
    properties: {
      input: { type: "string", description: "Test input" },
    },
    required: ["input"],
  },
  execute: async (args) => `Result: ${args.input}`,
};

describe("tool registry", () => {
  afterEach(() => {
    clearTools();
  });

  it("registers and retrieves a tool", () => {
    registerTool(mockTool);
    const tool = getTool("test_tool");
    expect(tool).toBeDefined();
    expect(tool!.name).toBe("test_tool");
  });

  it("throws on duplicate registration", () => {
    registerTool(mockTool);
    expect(() => registerTool(mockTool)).toThrow("already registered");
  });

  it("returns undefined for unknown tool", () => {
    expect(getTool("nonexistent")).toBeUndefined();
  });

  it("lists all registered tools", () => {
    registerTool(mockTool);
    registerTool({ ...mockTool, id: "tool2", name: "tool2" });
    expect(listTools().length).toBe(2);
  });

  it("executes a tool", async () => {
    registerTool(mockTool);
    const tool = getTool("test_tool")!;
    const result = await tool.execute({ input: "hello" });
    expect(result).toBe("Result: hello");
  });

  it("converts to Anthropic format", () => {
    registerTool(mockTool);
    const formatted = toAnthropicFormat(listTools());
    expect(formatted[0]!.name).toBe("test_tool");
    expect(formatted[0]!.input_schema).toBeDefined();
    expect(formatted[0]).not.toHaveProperty("id");
  });

  it("converts to OpenAI format", () => {
    registerTool(mockTool);
    const formatted = toOpenAIFormat(listTools());
    expect(formatted[0]!.type).toBe("function");
    expect(formatted[0]!.function.name).toBe("test_tool");
    expect(formatted[0]!.function.parameters).toBeDefined();
  });

  it("converts to driver format", () => {
    registerTool(mockTool);
    const formatted = toDriverFormat(listTools());
    expect(formatted[0]!.name).toBe("test_tool");
    expect(formatted[0]!.parameters).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Alias resolution tests
// ---------------------------------------------------------------------------

describe("tool alias resolution", () => {
  afterEach(() => {
    clearTools();
  });

  const toolWithAliases: ToolDefinition = {
    id: "bash",
    name: "bash",
    description: "Execute a shell command",
    parameters: { type: "object", properties: {} },
    execute: async () => "executed",
    aliases: ["exec", "shell", "run"],
  };

  it("resolves aliases to the canonical tool", () => {
    registerTool(toolWithAliases);
    expect(getTool("exec")).toBeDefined();
    expect(getTool("exec")!.id).toBe("bash");
    expect(getTool("shell")!.id).toBe("bash");
    expect(getTool("run")!.id).toBe("bash");
  });

  it("still resolves the canonical ID directly", () => {
    registerTool(toolWithAliases);
    expect(getTool("bash")).toBeDefined();
    expect(getTool("bash")!.id).toBe("bash");
  });

  it("resolves aliases case-insensitively", () => {
    registerTool(toolWithAliases);
    expect(getTool("EXEC")!.id).toBe("bash");
    expect(getTool("Shell")!.id).toBe("bash");
    expect(getTool("RUN")!.id).toBe("bash");
  });

  it("returns undefined for unknown names (not aliases)", () => {
    registerTool(toolWithAliases);
    expect(getTool("nonexistent")).toBeUndefined();
    expect(getTool("execute_command")).toBeUndefined();
  });

  it("does not shadow a real tool ID with an alias", () => {
    // Register two tools where tool2 has an alias matching tool1's ID
    const tool1: ToolDefinition = {
      id: "read",
      name: "read",
      description: "Conflicting tool",
      parameters: { type: "object", properties: {} },
      execute: async () => "tool1",
    };
    const tool2: ToolDefinition = {
      id: "read_file",
      name: "read_file",
      description: "File reader",
      parameters: { type: "object", properties: {} },
      execute: async () => "tool2",
      aliases: ["read"],
    };
    registerTool(tool1);
    registerTool(tool2);
    // "read" should resolve to tool1 (the real ID), not to read_file via alias
    expect(getTool("read")!.id).toBe("read");
  });

  it("clears aliases when clearTools is called", () => {
    registerTool(toolWithAliases);
    expect(getTool("exec")).toBeDefined();
    clearTools();
    expect(getTool("exec")).toBeUndefined();
    expect(getTool("bash")).toBeUndefined();
  });

  it("removes aliases when unregisterTool is called", () => {
    registerTool(toolWithAliases);
    expect(getTool("exec")).toBeDefined();
    unregisterTool("bash");
    expect(getTool("exec")).toBeUndefined();
    expect(getTool("bash")).toBeUndefined();
  });

  it("tools without aliases still work normally", () => {
    registerTool(mockTool);
    expect(getTool("test_tool")).toBeDefined();
    expect(getTool("test_tool")!.id).toBe("test_tool");
  });

  it("aliases don't appear in listTools", () => {
    registerTool(toolWithAliases);
    const all = listTools();
    expect(all.length).toBe(1);
    expect(all[0]!.id).toBe("bash");
  });

  it("multiple tools can have aliases without conflict", () => {
    registerTool(toolWithAliases);
    const fileTool: ToolDefinition = {
      id: "read_file",
      name: "read_file",
      description: "Read a file",
      parameters: { type: "object", properties: {} },
      execute: async () => "file content",
      aliases: ["read", "cat"],
    };
    registerTool(fileTool);
    expect(getTool("exec")!.id).toBe("bash");
    expect(getTool("read")!.id).toBe("read_file");
    expect(getTool("cat")!.id).toBe("read_file");
  });
});
