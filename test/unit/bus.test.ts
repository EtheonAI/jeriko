import { describe, expect, it } from "bun:test";
import { Bus } from "../../src/shared/bus.js";

interface TestEvents extends Record<string, unknown> {
  "test:ping": { message: string };
  "test:count": { n: number };
}

describe("Bus", () => {
  it("emits and receives events", () => {
    const bus = new Bus<TestEvents>();
    const received: string[] = [];

    bus.on("test:ping", (data) => {
      received.push(data.message);
    });

    bus.emit("test:ping", { message: "hello" });
    bus.emit("test:ping", { message: "world" });

    expect(received).toEqual(["hello", "world"]);
  });

  it("supports multiple listeners", () => {
    const bus = new Bus<TestEvents>();
    let count = 0;

    bus.on("test:count", () => { count++; });
    bus.on("test:count", () => { count++; });

    bus.emit("test:count", { n: 1 });
    expect(count).toBe(2);
  });

  it("off removes a listener", () => {
    const bus = new Bus<TestEvents>();
    let count = 0;

    const handler = () => { count++; };
    bus.on("test:ping", handler);
    bus.emit("test:ping", { message: "a" });
    expect(count).toBe(1);

    bus.off("test:ping", handler);
    bus.emit("test:ping", { message: "b" });
    expect(count).toBe(1);
  });
});
