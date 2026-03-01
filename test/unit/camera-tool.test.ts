// Camera tool tests — registration, definition, execute output format.

import { describe, expect, it, beforeAll } from "bun:test";
import { cameraTool } from "../../src/daemon/agent/tools/camera.js";
import { getTool, listTools } from "../../src/daemon/agent/tools/registry.js";

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

describe("cameraTool definition", () => {
  it("has correct id", () => {
    expect(cameraTool.id).toBe("camera");
  });

  it("has correct name", () => {
    expect(cameraTool.name).toBe("camera");
  });

  it("has a description", () => {
    expect(cameraTool.description).toBeTruthy();
    expect(cameraTool.description.toLowerCase()).toContain("photo");
  });

  it("has aliases for common LLM invocations", () => {
    expect(cameraTool.aliases).toBeDefined();
    expect(cameraTool.aliases).toContain("webcam");
    expect(cameraTool.aliases).toContain("take_photo");
    expect(cameraTool.aliases).toContain("capture_photo");
  });

  it("has object parameters schema", () => {
    expect(cameraTool.parameters.type).toBe("object");
  });

  it("has an execute function", () => {
    expect(typeof cameraTool.execute).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// Registry integration
// ---------------------------------------------------------------------------

describe("camera tool registry", () => {
  it("is registered in the tool registry", () => {
    const tool = getTool("camera");
    expect(tool).toBeDefined();
    expect(tool!.id).toBe("camera");
  });

  it("is findable by alias 'webcam'", () => {
    const tool = getTool("webcam");
    expect(tool).toBeDefined();
    expect(tool!.id).toBe("camera");
  });

  it("is findable by alias 'take_photo'", () => {
    const tool = getTool("take_photo");
    expect(tool).toBeDefined();
    expect(tool!.id).toBe("camera");
  });

  it("appears in listTools()", () => {
    const all = listTools();
    const camera = all.find((t) => t.id === "camera");
    expect(camera).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Execute — output format (no actual camera needed)
// ---------------------------------------------------------------------------

describe("camera tool execute", () => {
  it("returns valid JSON on failure", async () => {
    // On CI/test environments there's no camera — execute should return
    // a JSON error response, not throw.
    const result = await cameraTool.execute({});
    const parsed = JSON.parse(result);

    // Either { ok: true, path: "..." } or { ok: false, error: "..." }
    expect(typeof parsed.ok).toBe("boolean");
    if (!parsed.ok) {
      expect(typeof parsed.error).toBe("string");
    }
  });

  it("returns JSON with ok field", async () => {
    const result = await cameraTool.execute({});
    const parsed = JSON.parse(result);
    expect("ok" in parsed).toBe(true);
  });
});
