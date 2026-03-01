/**
 * Twilio connector — SMS, voice calls, lookups, and webhook handling.
 *
 * Extends ConnectorBase for unified lifecycle, dispatch, and HTTP helpers.
 * Twilio uses Basic auth (base64 SID:TOKEN) and form-encoded POST bodies.
 */

import { createHmac, timingSafeEqual } from "crypto";
import type { ConnectorResult, WebhookEvent } from "../interface.js";
import { ConnectorBase } from "../base.js";

export class TwilioConnector extends ConnectorBase {
  readonly name = "twilio";
  readonly version = "1.0.0";

  protected readonly healthPath = ".json";
  protected readonly label = "Twilio";

  private accountSid = "";
  private authToken = "";
  private fromNumber = "";

  /** Dynamic baseUrl — includes accountSid. */
  protected get baseUrl(): string {
    return `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}`;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  override async init(): Promise<void> {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) {
      throw new Error(
        "TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN env vars are required",
      );
    }
    this.accountSid = sid;
    this.authToken = token;
    this.fromNumber = process.env.TWILIO_FROM_NUMBER ?? "";
  }

  // ---------------------------------------------------------------------------
  // Auth — Basic auth (base64 SID:TOKEN)
  // ---------------------------------------------------------------------------

  protected async buildAuthHeader(): Promise<string> {
    const credentials = Buffer.from(
      `${this.accountSid}:${this.authToken}`,
    ).toString("base64");
    return `Basic ${credentials}`;
  }

  // ---------------------------------------------------------------------------
  // Aliases
  // ---------------------------------------------------------------------------

  protected override aliases(): Record<string, string> {
    return {
      sms: "messages.send",
      call: "calls.create",
      "sms.send": "messages.send",
      "sms.list": "messages.list",
      "call.make": "calls.create",
      "call.list": "calls.list",
      "whatsapp.send": "messages.send",
    };
  }

  // ---------------------------------------------------------------------------
  // API method dispatch
  // ---------------------------------------------------------------------------

  protected handlers() {
    return {
      "messages.send": (p: Record<string, unknown>) =>
        this.postForm("/Messages.json", {
          To: String(p.to),
          From: String(p.from ?? this.fromNumber),
          Body: String(p.body),
          ...(p.media_url ? { MediaUrl: String(p.media_url) } : {}),
          ...(p.status_callback
            ? { StatusCallback: String(p.status_callback) }
            : {}),
        }),
      "messages.get": (p: Record<string, unknown>) =>
        this.get(`/Messages/${p.sid ?? p.id}.json`),
      "messages.list": () => this.get("/Messages.json"),
      "calls.create": (p: Record<string, unknown>) =>
        this.postForm("/Calls.json", {
          To: String(p.to),
          From: String(p.from ?? this.fromNumber),
          Url: String(p.url),
          ...(p.status_callback
            ? { StatusCallback: String(p.status_callback) }
            : {}),
        }),
      "calls.get": (p: Record<string, unknown>) =>
        this.get(`/Calls/${p.sid ?? p.id}.json`),
      "calls.list": () => this.get("/Calls.json"),
      "calls.update": (p: Record<string, unknown>) =>
        this.postForm(`/Calls/${p.sid ?? p.id}.json`, {
          Status: String(p.status ?? "completed"),
        }),
      "lookups.phone": (p: Record<string, unknown>) =>
        this.getLookup(
          `/v1/PhoneNumbers/${encodeURIComponent(String(p.phone_number ?? p.id))}`,
        ),

      // Recordings
      "recordings.list": () => this.get("/Recordings.json"),
      "recordings.get": (p: Record<string, unknown>) =>
        this.get(`/Recordings/${p.sid ?? p.id}.json`),

      // Account
      "account.get": () => this.get(".json"),

      // Phone numbers
      "numbers.list": () => this.get("/IncomingPhoneNumbers.json"),
    };
  }

  // ---------------------------------------------------------------------------
  // Lookups — different base URL (lookups.twilio.com)
  // ---------------------------------------------------------------------------

  private async getLookup(path: string): Promise<ConnectorResult> {
    const authHeader = await this.buildAuthHeader();
    const res = await fetch(`https://lookups.twilio.com${path}`, {
      headers: { Authorization: authHeader },
    });
    return this.toResult(res);
  }

  // ---------------------------------------------------------------------------
  // Webhooks — Twilio request validation (HMAC-SHA1 over URL + sorted params)
  // ---------------------------------------------------------------------------

  override async webhook(
    headers: Record<string, string>,
    body: string,
  ): Promise<WebhookEvent> {
    const params = Object.fromEntries(new URLSearchParams(body));
    const signature = headers["x-twilio-signature"] ?? "";

    const requestUrl =
      params._request_url ?? headers["x-original-url"] ?? "";
    const verified = this.verifySignature(requestUrl, params, signature);

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

    const sorted = Object.keys(params)
      .filter((k) => k !== "_request_url")
      .sort();
    let data = url;
    for (const key of sorted) {
      data += key + params[key];
    }

    const expected = createHmac("sha1", this.authToken)
      .update(data)
      .digest("base64");

    if (expected.length !== signature.length) return false;
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  }
}
