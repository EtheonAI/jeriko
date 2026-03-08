/**
 * Tests for task-adapter shared constants and classification helpers.
 */

import { describe, test, expect } from "bun:test";
import {
  TRIGGER_TYPES,
  EVENT_TRIGGER_TYPES,
  SCHEDULE_TRIGGER_TYPES,
  WEBHOOK_SERVICES,
  EMAIL_SERVICES,
  FILE_EVENTS,
  isEventTrigger,
  isScheduleTrigger,
  isTimeTrigger,
  TRIGGER_EVENT_TYPES,
  buildTriggerConfig,
  parseRecurring,
} from "../../src/daemon/services/triggers/task-adapter.js";

describe("Task adapter constants", () => {
  test("TRIGGER_TYPES covers all 6 engine types", () => {
    expect(TRIGGER_TYPES).toEqual(["cron", "webhook", "file", "http", "email", "once"]);
  });

  test("EVENT_TRIGGER_TYPES is subset of TRIGGER_TYPES", () => {
    for (const t of EVENT_TRIGGER_TYPES) {
      expect(TRIGGER_TYPES).toContain(t);
    }
  });

  test("WEBHOOK_SERVICES matches engine WebhookConfig.service union", () => {
    expect(WEBHOOK_SERVICES.length).toBeGreaterThanOrEqual(4);
    expect(WEBHOOK_SERVICES).toContain("stripe");
    expect(WEBHOOK_SERVICES).toContain("github");
    expect(WEBHOOK_SERVICES).toContain("paypal");
    expect(WEBHOOK_SERVICES).toContain("twilio");
  });

  test("EMAIL_SERVICES has gmail", () => {
    expect(EMAIL_SERVICES).toContain("gmail");
  });

  test("FILE_EVENTS matches engine FileConfig.events union", () => {
    expect(FILE_EVENTS).toContain("create");
    expect(FILE_EVENTS).toContain("modify");
    expect(FILE_EVENTS).toContain("delete");
  });

  test("TRIGGER_EVENT_TYPES has entries for all webhook services", () => {
    for (const svc of WEBHOOK_SERVICES) {
      expect(TRIGGER_EVENT_TYPES[svc]).toBeDefined();
      expect(TRIGGER_EVENT_TYPES[svc]!.length).toBeGreaterThan(0);
    }
  });
});

describe("Classification helpers", () => {
  test("isEventTrigger identifies event-driven types", () => {
    expect(isEventTrigger("webhook")).toBe(true);
    expect(isEventTrigger("file")).toBe(true);
    expect(isEventTrigger("http")).toBe(true);
    expect(isEventTrigger("email")).toBe(true);
    expect(isEventTrigger("cron")).toBe(false);
    expect(isEventTrigger("once")).toBe(false);
  });

  test("isScheduleTrigger identifies schedule types", () => {
    expect(isScheduleTrigger("cron")).toBe(true);
    expect(isScheduleTrigger("schedule")).toBe(true);
    expect(isScheduleTrigger("webhook")).toBe(false);
    expect(isScheduleTrigger("once")).toBe(false);
  });

  test("isTimeTrigger identifies schedule + once types", () => {
    expect(isTimeTrigger("cron")).toBe(true);
    expect(isTimeTrigger("schedule")).toBe(true);
    expect(isTimeTrigger("once")).toBe(true);
    expect(isTimeTrigger("webhook")).toBe(false);
    expect(isTimeTrigger("file")).toBe(false);
  });
});

describe("buildTriggerConfig", () => {
  test("builds cron trigger from schedule param", () => {
    const config = buildTriggerConfig({
      schedule: "0 9 * * *",
      action: "check health",
      name: "daily-check",
    });
    expect(config.type).toBe("cron");
    expect(config.enabled).toBe(true);
    expect(config.label).toBe("daily-check");
  });

  test("builds once trigger from once param", () => {
    const config = buildTriggerConfig({
      once: "2026-06-01T09:00:00.000Z",
      action: "send report",
    });
    expect(config.type).toBe("once");
    expect(config.max_runs).toBe(1);
  });

  test("builds webhook trigger from trigger spec", () => {
    const config = buildTriggerConfig({
      trigger: "stripe:charge.failed",
      action: "notify",
    });
    expect(config.type).toBe("webhook");
  });

  test("builds file trigger from trigger spec", () => {
    const config = buildTriggerConfig({
      trigger: "file:change",
      path: "/tmp/test",
      action: "process",
    });
    expect(config.type).toBe("file");
  });

  test("throws on missing task type", () => {
    expect(() => buildTriggerConfig({ action: "do something" })).toThrow("Missing task type");
  });

  test("throws on invalid once datetime", () => {
    expect(() => buildTriggerConfig({ once: "not-a-date", action: "x" })).toThrow("Invalid datetime");
  });
});

describe("parseRecurring", () => {
  test("daily shorthand", () => {
    expect(parseRecurring("daily", { at: "09:30" })).toBe("30 9 * * *");
  });

  test("weekly shorthand", () => {
    expect(parseRecurring("weekly", { day: "FRI", at: "10:00" })).toBe("0 10 * * FRI");
  });

  test("interval shorthand", () => {
    expect(parseRecurring("5m", {})).toBe("*/5 * * * *");
    expect(parseRecurring("2h", {})).toBe("0 */2 * * *");
  });

  test("raw cron passthrough", () => {
    expect(parseRecurring("0 */6 * * *", {})).toBe("0 */6 * * *");
  });
});
