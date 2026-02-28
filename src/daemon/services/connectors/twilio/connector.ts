/**
 * Twilio connector — SMS, voice calls, lookups, and webhook handling.
 *
 * Twilio webhooks are validated using HMAC-SHA1 of the full URL + sorted POST params.
 */

import { createHmac, timingSafeEqual } from "crypto";
import type {
  ConnectorInterface,
  ConnectorResult,
  HealthResult,
  WebhookEvent,
} from "../interface.js";
import { withRetry, withTimeout } from "../middleware.js";

/** Shorthand aliases resolved before handler lookup. */
const ALIASES: Record<string, string> = {
  "sms": "messages.send",
  "call": "calls.create",
  "sms.send": "messages.send",
  "sms.list": "messages.list",
  "call.make": "calls.create",
  "call.list": "calls.list",
  "whatsapp.send": "messages.send",
};

export class TwilioConnector implements ConnectorInterface {
  readonly name = "twilio";
  readonly version = "1.0.0";

  private accountSid = "";
  private authToken = "";
  private fromNumber = "";

  private get baseUrl(): string {
    return `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}`;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async init(): Promise<void> {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) {
      throw new Error("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN env vars are required");
    }
    this.accountSid = sid;
    this.authToken = token;
    this.fromNumber = process.env.TWILIO_FROM_NUMBER ?? "";
  }

  async health(): Promise<HealthResult> {
    const start = Date.now();
    try {
      const res = await withTimeout(
        () =>
          fetch(`${this.baseUrl}.json`, {
            headers: this.headers(),
          }),
        5000,
      );
      const latency = Date.now() - start;
      if (!res.ok) {
        return { healthy: false, latency_ms: latency, error: `HTTP ${res.status}` };
      }
      return { healthy: true, latency_ms: latency };
    } catch (err) {
      return {
        healthy: false,
        latency_ms: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // ---------------------------------------------------------------------------
  // API calls
  // ---------------------------------------------------------------------------

  async call(method: string, params: Record<string, unknown>): Promise<ConnectorResult> {
    // Resolve aliases before handler lookup.
    const resolved = ALIASES[method] ?? method;

    const handlers: Record<string, (p: Record<string, unknown>) => Promise<ConnectorResult>> = {
      "messages.send": (p) =>
        this.post("/Messages.json", {
          To: String(p.to),
          From: String(p.from ?? this.fromNumber),
          Body: String(p.body),
          ...(p.media_url ? { MediaUrl: String(p.media_url) } : {}),
          ...(p.status_callback ? { StatusCallback: String(p.status_callback) } : {}),
        }),
      "messages.get": (p) => this.get(`/Messages/${p.sid}.json`),
      "messages.list": () => this.get("/Messages.json"),
      "calls.create": (p) =>
        this.post("/Calls.json", {
          To: String(p.to),
          From: String(p.from ?? this.fromNumber),
          Url: String(p.url),
          ...(p.status_callback ? { StatusCallback: String(p.status_callback) } : {}),
        }),
      "calls.get": (p) => this.get(`/Calls/${p.sid}.json`),
      "calls.list": () => this.get("/Calls.json"),
      "calls.update": (p) =>
        this.post(`/Calls/${p.sid}.json`, {
          Status: String(p.status ?? "completed"),
        }),
      "lookups.phone": (p) =>
        this.getLookup(`/v1/PhoneNumbers/${encodeURIComponent(String(p.phone_number))}`),

      // Recordings
      "recordings.list": () => this.get("/Recordings.json"),
      "recordings.get": (p) => this.get(`/Recordings/${p.sid ?? p.id}.json`),

      // Account
      "account.get": () => this.get(".json"),

      // Phone numbers
      "numbers.list": () => this.get("/IncomingPhoneNumbers.json"),
    };

    const handler = handlers[resolved];
    if (!handler) {
      return { ok: false, error: `Unknown Twilio method: ${method}` };
    }

    return withRetry(() => handler(params), 2, 500);
  }

  // ---------------------------------------------------------------------------
  // Webhooks — Twilio request validation (HMAC-SHA1 over URL + sorted params)
  // ---------------------------------------------------------------------------

  async webhook(headers: Record<string, string>, body: string): Promise<WebhookEvent> {
    // Twilio sends form-urlencoded POST bodies. Parse them.
    const params = Object.fromEntries(new URLSearchParams(body));
    const signature = headers["x-twilio-signature"] ?? "";

    // We need the full URL to verify; pass it in params or headers.
    const requestUrl = params._request_url ?? headers["x-original-url"] ?? "";
    const verified = this.verifySignature(requestUrl, params, signature);

    // Determine event type from Twilio params.
    const eventType = params.CallStatus
      ? `call.${params.CallStatus}`
      : params.SmsStatus
        ? `sms.${params.SmsStatus}`
        : params.MessageSid
          ? "sms.received"
          : "unknown";

    return {
      id: params.MessageSid ?? params.CallSid ?? crypto.randomUUID(),
      source: this.name,
      type: eventType,
      data: params,
      verified,
      received_at: new Date().toISOString(),
    };
  }

  /**
   * Twilio request validation:
   * 1. Start with the full URL of the request.
   * 2. Sort POST params alphabetically by key, concatenate key+value.
   * 3. HMAC-SHA1 the resulting string with AuthToken.
   * 4. Base64-encode the hash and compare with X-Twilio-Signature.
   */
  private verifySignature(
    url: string,
    params: Record<string, string>,
    signature: string,
  ): boolean {
    if (!url || !signature || !this.authToken) return false;

    // Build the data string: URL + sorted params.
    const sorted = Object.keys(params)
      .filter((k) => k !== "_request_url")
      .sort();
    let data = url;
    for (const key of sorted) {
      data += key + params[key];
    }

    const expected = createHmac("sha1", this.authToken).update(data).digest("base64");

    if (expected.length !== signature.length) return false;
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  }

  // ---------------------------------------------------------------------------
  // Shutdown
  // ---------------------------------------------------------------------------

  async shutdown(): Promise<void> {
    // Stateless HTTP — nothing to tear down.
  }

  // ---------------------------------------------------------------------------
  // HTTP helpers
  // ---------------------------------------------------------------------------

  private headers(): Record<string, string> {
    const credentials = Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64");
    return { Authorization: `Basic ${credentials}` };
  }

  private async get(path: string): Promise<ConnectorResult> {
    const res = await fetch(`${this.baseUrl}${path}`, { headers: this.headers() });
    return this.toResult(res);
  }

  private async getLookup(path: string): Promise<ConnectorResult> {
    const credentials = Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64");
    const res = await fetch(`https://lookups.twilio.com${path}`, {
      headers: { Authorization: `Basic ${credentials}` },
    });
    return this.toResult(res);
  }

  private async post(path: string, params: Record<string, string>): Promise<ConnectorResult> {
    const body = new URLSearchParams(params);
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        ...this.headers(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
    return this.toResult(res);
  }

  private async toResult(res: Response): Promise<ConnectorResult> {
    const data = await res.json();
    if (!res.ok) {
      const msg = (data as any)?.message ?? `HTTP ${res.status}`;
      return { ok: false, error: msg };
    }
    return { ok: true, data };
  }
}
