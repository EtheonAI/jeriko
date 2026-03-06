/**
 * Slack connector — messages, channels, users, files, and reactions.
 *
 * Extends BearerConnector for OAuth2 Bearer token auth.
 * Slack bot tokens are permanent (no refresh). Uses Web API methods via POST.
 */

import { createHmac, timingSafeEqual } from "crypto";
import { BearerConnector } from "../base.js";
import type { ConnectorResult, WebhookEvent } from "../interface.js";

export class SlackConnector extends BearerConnector {
  readonly name = "slack";
  readonly version = "1.0.0";

  private signingSecret = "";

  protected readonly auth = {
    baseUrl: "https://slack.com/api",
    tokenVar: "SLACK_BOT_TOKEN",
    // Slack bot tokens are permanent — no refresh
    healthPath: "/auth.test",
    label: "Slack",
  };

  override async init(): Promise<void> {
    await super.init();
    this.signingSecret = process.env.SLACK_SIGNING_SECRET ?? "";
  }

  // ---------------------------------------------------------------------------
  // Health — Slack auth.test is POST, not GET
  // ---------------------------------------------------------------------------

  override async health(): Promise<import("../interface.js").HealthResult> {
    const start = Date.now();
    try {
      const result = await this.slackPost("auth.test", {});
      const latency = Date.now() - start;
      return result.ok
        ? { healthy: true, latency_ms: latency }
        : { healthy: false, latency_ms: latency, error: result.error };
    } catch (err) {
      return { healthy: false, latency_ms: Date.now() - start, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // ---------------------------------------------------------------------------
  // Slack API helper — most Slack methods are POST with JSON body
  // ---------------------------------------------------------------------------

  private async slackPost(method: string, params: Record<string, unknown>): Promise<ConnectorResult> {
    return this.post(`/${method}`, params);
  }

  // ---------------------------------------------------------------------------
  // Aliases
  // ---------------------------------------------------------------------------

  protected override aliases(): Record<string, string> {
    return {
      channels: "channels.list",
      messages: "messages.list",
      users: "users.list",
      files: "files.list",
    };
  }

  // ---------------------------------------------------------------------------
  // API method dispatch — Slack Web API
  // ---------------------------------------------------------------------------

  protected handlers() {
    return {
      // Messages
      "messages.send": (p: Record<string, unknown>) =>
        this.slackPost("chat.postMessage", { channel: p.channel, text: p.text, blocks: p.blocks, thread_ts: p.thread_ts }),
      "messages.update": (p: Record<string, unknown>) =>
        this.slackPost("chat.update", { channel: p.channel, ts: p.ts, text: p.text, blocks: p.blocks }),
      "messages.delete": (p: Record<string, unknown>) =>
        this.slackPost("chat.delete", { channel: p.channel, ts: p.ts }),
      "messages.list": (p: Record<string, unknown>) =>
        this.slackPost("conversations.history", { channel: p.channel, limit: p.limit ?? 25, cursor: p.cursor }),
      "messages.replies": (p: Record<string, unknown>) =>
        this.slackPost("conversations.replies", { channel: p.channel, ts: p.ts, limit: p.limit ?? 25 }),

      // Channels
      "channels.list": (p: Record<string, unknown>) =>
        this.slackPost("conversations.list", { types: p.types ?? "public_channel,private_channel", limit: p.limit ?? 100, cursor: p.cursor }),
      "channels.info": (p: Record<string, unknown>) =>
        this.slackPost("conversations.info", { channel: p.channel }),
      "channels.create": (p: Record<string, unknown>) =>
        this.slackPost("conversations.create", { name: p.name, is_private: p.is_private }),
      "channels.join": (p: Record<string, unknown>) =>
        this.slackPost("conversations.join", { channel: p.channel }),
      "channels.invite": (p: Record<string, unknown>) =>
        this.slackPost("conversations.invite", { channel: p.channel, users: p.users }),
      "channels.archive": (p: Record<string, unknown>) =>
        this.slackPost("conversations.archive", { channel: p.channel }),
      "channels.topic": (p: Record<string, unknown>) =>
        this.slackPost("conversations.setTopic", { channel: p.channel, topic: p.topic }),

      // Users
      "users.list": (p: Record<string, unknown>) =>
        this.slackPost("users.list", { limit: p.limit ?? 100, cursor: p.cursor }),
      "users.info": (p: Record<string, unknown>) =>
        this.slackPost("users.info", { user: p.user ?? p.id }),
      "users.me": () => this.slackPost("auth.test", {}),

      // Reactions
      "reactions.add": (p: Record<string, unknown>) =>
        this.slackPost("reactions.add", { channel: p.channel, timestamp: p.ts, name: p.name }),
      "reactions.remove": (p: Record<string, unknown>) =>
        this.slackPost("reactions.remove", { channel: p.channel, timestamp: p.ts, name: p.name }),

      // Files
      "files.list": (p: Record<string, unknown>) =>
        this.slackPost("files.list", { channel: p.channel, count: p.limit ?? 20 }),
      "files.info": (p: Record<string, unknown>) =>
        this.slackPost("files.info", { file: p.file ?? p.id }),

      // Search
      "search": (p: Record<string, unknown>) =>
        this.slackPost("search.messages", { query: p.query, count: p.limit ?? 20 }),

      // Pins
      "pins.add": (p: Record<string, unknown>) =>
        this.slackPost("pins.add", { channel: p.channel, timestamp: p.ts }),
      "pins.list": (p: Record<string, unknown>) =>
        this.slackPost("pins.list", { channel: p.channel }),
    };
  }

  // ---------------------------------------------------------------------------
  // Webhooks — Slack request signing (HMAC-SHA256)
  // ---------------------------------------------------------------------------

  override async webhook(headers: Record<string, string>, body: string): Promise<WebhookEvent> {
    const signature = headers["x-slack-signature"] ?? "";
    const timestamp = headers["x-slack-request-timestamp"] ?? "";
    const verified = this.verifySignature(body, signature, timestamp);

    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(body); } catch { parsed = Object.fromEntries(new URLSearchParams(body)); }

    const event = parsed.event as Record<string, unknown> | undefined;
    return {
      id: (event?.event_ts as string) ?? crypto.randomUUID(),
      source: this.name,
      type: (event?.type as string) ?? (parsed.type as string) ?? "slack.event",
      data: parsed,
      verified,
      received_at: new Date().toISOString(),
    };
  }

  private verifySignature(body: string, signature: string, timestamp: string): boolean {
    if (!this.signingSecret || !signature || !timestamp) return false;
    const sigBasestring = `v0:${timestamp}:${body}`;
    const expected = "v0=" + createHmac("sha256", this.signingSecret).update(sigBasestring).digest("hex");
    if (expected.length !== signature.length) return false;
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  }
}
