// Unit tests — generate_image agent tool.

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { clearTools, getTool, listTools, registerTool } from "../../../src/daemon/agent/tools/registry.js";
import { generateImageTool } from "../../../src/daemon/agent/tools/generate-image.js";

describe("generate_image tool", () => {
  beforeEach(() => {
    clearTools();
    registerTool(generateImageTool);
  });

  afterEach(() => {
    clearTools();
  });

  it("is registered with correct ID", () => {
    const tool = getTool("generate_image");
    expect(tool).toBeDefined();
    expect(tool!.id).toBe("generate_image");
  });

  it("has descriptive name and description", () => {
    const tool = getTool("generate_image")!;
    expect(tool.name).toBe("generate_image");
    expect(tool.description).toContain("image");
    expect(tool.description).toContain("DALL-E");
  });

  it("requires prompt parameter", () => {
    const tool = getTool("generate_image")!;
    const params = tool.parameters;
    expect(params.required).toContain("prompt");
  });

  it("has size parameter with valid enum values", () => {
    const tool = getTool("generate_image")!;
    const sizeParam = (tool.parameters.properties as Record<string, Record<string, unknown>>)?.size;
    expect(sizeParam).toBeDefined();
    expect(sizeParam!.enum).toContain("1024x1024");
    expect(sizeParam!.enum).toContain("1024x1792");
    expect(sizeParam!.enum).toContain("1792x1024");
  });

  it("has style parameter with vivid and natural options", () => {
    const tool = getTool("generate_image")!;
    const styleParam = (tool.parameters.properties as Record<string, Record<string, unknown>>)?.style;
    expect(styleParam).toBeDefined();
    expect(styleParam!.enum).toContain("vivid");
    expect(styleParam!.enum).toContain("natural");
  });

  it("resolves aliases correctly", () => {
    expect(getTool("create_image")).toBeDefined();
    expect(getTool("image_gen")).toBeDefined();
    expect(getTool("dall_e")).toBeDefined();
    expect(getTool("image_generation")).toBeDefined();
    expect(getTool("make_image")).toBeDefined();
  });

  it("returns error JSON when prompt is missing", async () => {
    const tool = getTool("generate_image")!;
    const result = JSON.parse(await tool.execute({}));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("prompt is required");
  });

  it("returns error JSON when prompt is empty", async () => {
    const tool = getTool("generate_image")!;
    const result = JSON.parse(await tool.execute({ prompt: "" }));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("prompt is required");
  });

  it("returns error JSON when no API key is set", async () => {
    const originalKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      const tool = getTool("generate_image")!;
      const result = JSON.parse(await tool.execute({ prompt: "a sunset" }));
      expect(result.ok).toBe(false);
      expect(result.error).toContain("provider");
    } finally {
      if (originalKey) process.env.OPENAI_API_KEY = originalKey;
    }
  });

  it("appears in listTools()", () => {
    const allTools = listTools();
    const imageToolIds = allTools.map((t) => t.id);
    expect(imageToolIds).toContain("generate_image");
  });
});
