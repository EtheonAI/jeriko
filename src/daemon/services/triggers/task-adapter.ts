// Task adapter — translates user-facing task parameters into TriggerConfig.
//
// The CLI and channel commands use a simplified "task" vocabulary:
//   --trigger stripe:charge.failed   → type="webhook", config.service="stripe"
//   --trigger file:change            → type="file", config.paths=[...]
//   --trigger http:down              → type="http", config.url=...
//   --trigger gmail:new_email        → type="email", config.connector="gmail"
//   --schedule "0 9 * * *"           → type="cron", config.expression=...
//   --once "2026-06-01T09:00"        → type="once", config.at=...
//
// This adapter normalizes them into TriggerConfig for TriggerEngine.add().

import type {
  TriggerConfig,
  TriggerAction,
  CronConfig,
  WebhookConfig,
  FileConfig,
  HttpConfig,
  OnceConfig,
} from "./engine.js";
import type { EmailConfig } from "./email.js";

// Webhook event type patterns per service (for CLI hint display)
export const TRIGGER_EVENT_TYPES: Record<string, string[]> = {
  stripe: [
    "charge.succeeded", "charge.failed", "charge.refunded",
    "invoice.paid", "invoice.payment_failed",
    "customer.subscription.created", "customer.subscription.deleted",
    "checkout.session.completed", "payment_intent.succeeded",
  ],
  paypal: [
    "PAYMENT.CAPTURE.COMPLETED", "PAYMENT.CAPTURE.DENIED",
    "BILLING.SUBSCRIPTION.CREATED", "BILLING.SUBSCRIPTION.CANCELLED",
    "CHECKOUT.ORDER.APPROVED",
  ],
  github: [
    "push", "pull_request", "issues", "release",
    "workflow_run", "star", "fork", "create", "delete",
  ],
  twilio: [
    "call.completed", "call.initiated", "sms.received", "sms.sent",
  ],
};

/**
 * Build a TriggerConfig from user-facing task parameters.
 *
 * Expected params shape (from IPC):
 *   { name, trigger?, schedule?, once?, action, shell?,
 *     from?, subject?, url?, path?, interval?, max_runs?, no_notify? }
 */
export function buildTriggerConfig(
  params: Record<string, unknown>,
): Omit<TriggerConfig, "id"> & { id?: string } {
  const name = params.name as string | undefined;
  const triggerSpec = params.trigger as string | undefined;
  const schedule = params.schedule as string | undefined;
  const once = params.once as string | undefined;
  const actionStr = params.action as string | undefined;
  const shellCmd = params.shell as string | undefined;
  const noNotify = params.no_notify as boolean | undefined;
  const maxRuns = params.max_runs as number | undefined;

  // Build action
  const action: TriggerAction = shellCmd
    ? { type: "shell", command: shellCmd, notify: !noNotify }
    : { type: "agent", prompt: actionStr ?? "process this event", notify: !noNotify };

  // Determine type + config from the three mutually exclusive flags
  if (triggerSpec) {
    return buildTriggerFromSpec(triggerSpec, params, action, name, maxRuns);
  }

  if (schedule) {
    const config: CronConfig = { expression: schedule };
    const tz = params.timezone as string | undefined;
    if (tz) config.timezone = tz;
    return {
      type: "cron",
      enabled: true,
      config,
      action,
      label: name,
      max_runs: maxRuns,
    };
  }

  if (once) {
    const parsed = new Date(once);
    if (isNaN(parsed.getTime())) {
      throw new Error(`Invalid datetime: "${once}". Use ISO format (e.g. 2026-06-01T09:00)`);
    }
    const config: OnceConfig = { at: parsed.toISOString() };
    return {
      type: "once",
      enabled: true,
      config,
      action,
      label: name,
      max_runs: maxRuns ?? 1,
    };
  }

  throw new Error(
    "Missing task type. Use --trigger <source:event>, --schedule <cron>, or --once <datetime>",
  );
}

/**
 * Parse a trigger spec like "stripe:charge.failed", "file:change", "http:down",
 * "gmail:new_email" into the appropriate TriggerConfig type + config.
 */
function buildTriggerFromSpec(
  spec: string,
  params: Record<string, unknown>,
  action: TriggerAction,
  name: string | undefined,
  maxRuns: number | undefined,
): Omit<TriggerConfig, "id"> & { id?: string } {
  const [source, event] = spec.includes(":") ? spec.split(":", 2) : [spec, undefined];

  // Webhook services: stripe, paypal, github, twilio
  if (["stripe", "paypal", "github", "twilio"].includes(source)) {
    const config: WebhookConfig = { service: source as WebhookConfig["service"] };
    const secret = params.secret as string | undefined;
    if (secret) config.secret = secret;
    return {
      type: "webhook",
      enabled: true,
      config,
      action,
      label: name ?? `${source}:${event ?? "*"}`,
      max_runs: maxRuns,
    };
  }

  // File triggers: file:change, file:create, file:delete
  if (source === "file") {
    const pathStr = params.path as string | undefined;
    if (!pathStr) throw new Error("File triggers require --path <directory>");
    const events = event ? [event as "create" | "modify" | "delete"] : undefined;
    const config: FileConfig = { paths: [pathStr], events };
    return {
      type: "file",
      enabled: true,
      config,
      action,
      label: name ?? `file:${event ?? "any"} ${pathStr}`,
      max_runs: maxRuns,
    };
  }

  // HTTP triggers: http:down, http:up, http:slow, http:any
  if (source === "http") {
    const url = params.url as string | undefined;
    if (!url) throw new Error("HTTP triggers require --url <URL>");
    const interval = params.interval as number | undefined;
    const config: HttpConfig = { url, intervalMs: interval ? interval * 1000 : 60_000 };
    return {
      type: "http",
      enabled: true,
      config,
      action,
      label: name ?? `http:${event ?? "any"} ${url}`,
      max_runs: maxRuns,
    };
  }

  // Email triggers: gmail:new_email, outlook:new_email, email:new_email
  if (["gmail", "outlook", "email"].includes(source)) {
    const config: EmailConfig = {};
    if (source === "gmail" || source === "outlook") {
      config.connector = source;
    }
    const from = params.from as string | undefined;
    const subject = params.subject as string | undefined;
    if (from) config.from = from;
    if (subject) config.subject = subject;
    return {
      type: "email",
      enabled: true,
      config,
      action,
      label: name ?? `${source}:new_email${from ? ` from ${from}` : ""}`,
      max_runs: maxRuns,
    };
  }

  throw new Error(
    `Unknown trigger source: "${source}". ` +
    `Supported: stripe, paypal, github, twilio, gmail, outlook, email, file, http`,
  );
}

/**
 * Parse recurring shorthand into cron expression.
 *
 *   "daily"   + at:"09:00"              → "0 9 * * *"
 *   "weekly"  + day:"MON" + at:"09:00"  → "0 9 * * MON"
 *   "monthly" + dayOfMonth:"1"          → "0 0 1 * *"
 *   "5m" / "1h" / "30s"                 → "* /5 * * * *" etc.
 */
export function parseRecurring(
  recurring: string,
  params: Record<string, unknown>,
): string {
  const at = params.at as string | undefined;
  const [hour, minute] = at ? at.split(":").map(Number) : [0, 0];

  switch (recurring.toLowerCase()) {
    case "daily":
      return `${minute ?? 0} ${hour ?? 9} * * *`;
    case "weekly": {
      const day = (params.day as string) ?? "MON";
      return `${minute ?? 0} ${hour ?? 9} * * ${day.toUpperCase()}`;
    }
    case "monthly": {
      const dom = (params.day_of_month as string) ?? "1";
      return `${minute ?? 0} ${hour ?? 0} ${dom} * *`;
    }
    default: {
      // Interval shorthand: "5m", "1h", "30s"
      const match = recurring.match(/^(\d+)([smh])$/);
      if (match) {
        const n = parseInt(match[1]!, 10);
        const unit = match[2]!;
        if (unit === "m") return `*/${n} * * * *`;
        if (unit === "h") return `0 */${n} * * *`;
        // Seconds not supported in cron — minimum is 1 minute
        if (unit === "s" && n >= 60) return `*/${Math.ceil(n / 60)} * * * *`;
        if (unit === "s") return `*/1 * * * *`;
      }
      // Assume it's a raw cron expression
      return recurring;
    }
  }
}
