import { describe, expect, it, beforeEach } from "bun:test";
import { okResult, failResult, setOutputFormat, getOutputFormat } from "../../src/shared/output.js";

describe("output", () => {
  it("okResult() returns envelope with ok: true", () => {
    const result = okResult({ status: "running" });
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ status: "running" });
  });

  it("okResult() handles string data", () => {
    const result = okResult("hello");
    expect(result.ok).toBe(true);
    expect(result.data).toBe("hello");
  });

  it("failResult() returns envelope with ok: false", () => {
    const result = failResult("something broke");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("something broke");
  });

  it("failResult() accepts custom exit code", () => {
    const result = failResult("not found", 5);
    expect(result.ok).toBe(false);
    expect(result.code).toBe(5);
  });

  describe("setOutputFormat / getOutputFormat", () => {
    beforeEach(() => {
      setOutputFormat("json"); // reset
    });

    it("defaults to json", () => {
      expect(getOutputFormat()).toBe("json");
    });

    it("can be set to text", () => {
      setOutputFormat("text");
      expect(getOutputFormat()).toBe("text");
    });

    it("can be set to logfmt", () => {
      setOutputFormat("logfmt");
      expect(getOutputFormat()).toBe("logfmt");
    });
  });
});
