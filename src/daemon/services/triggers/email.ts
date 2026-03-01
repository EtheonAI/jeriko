// Email trigger — polls for new messages via connector API or IMAP.
//
// Two modes:
//   1. Connector mode (preferred): Uses the Gmail/Outlook connector's REST API
//      to poll for unread messages. Leverages existing OAuth tokens — no separate
//      IMAP credentials needed.
//
//   2. IMAP mode (fallback): Connects directly to an IMAP server using TLS
//      sockets. Requires IMAP_USER + IMAP_PASSWORD (or app password for Gmail).
//
// Mode selection:
//   - If config.connector is set (e.g. "gmail"), use connector mode.
//   - Otherwise, fall back to IMAP mode.

import { createConnection, type Socket } from "node:net";
import { connect as tlsConnect, type TLSSocket } from "node:tls";
import { getLogger } from "../../../shared/logger.js";
import type { ConnectorManager } from "../connectors/manager.js";

const log = getLogger();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EmailConfig {
  /** Connector name to use for API-based polling (e.g. "gmail", "outlook"). */
  connector?: string;
  /** IMAP host — only used in IMAP mode (default: imap.gmail.com) */
  host?: string;
  /** IMAP port — only used in IMAP mode (default: 993 for TLS) */
  port?: number;
  /** IMAP username — only used in IMAP mode */
  user?: string;
  /** IMAP password — only used in IMAP mode (app password for Gmail) */
  password?: string;
  /** Polling interval in milliseconds (default: 120_000 = 2 minutes) */
  intervalMs?: number;
  /** Filter: only fire for emails from this address */
  from?: string;
  /** Filter: only fire for emails with subjects matching this string */
  subject?: string;
}

export interface EmailMessage {
  uid: number;
  from: string;
  subject: string;
  date: string;
  snippet: string;
}

export type EmailCallback = (message: EmailMessage) => void;

// ---------------------------------------------------------------------------
// Gmail header helpers — extract header value from Gmail message payload
// ---------------------------------------------------------------------------

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailPayload {
  headers?: GmailHeader[];
}

interface GmailMessage {
  id: string;
  threadId?: string;
  internalDate?: string;
  snippet?: string;
  payload?: GmailPayload;
}

function getHeader(payload: GmailPayload | undefined, name: string): string {
  if (!payload?.headers) return "";
  const header = payload.headers.find(
    (h) => h.name.toLowerCase() === name.toLowerCase(),
  );
  return header?.value ?? "";
}

// ---------------------------------------------------------------------------
// IMAP client — minimal implementation for INBOX polling (fallback mode)
// ---------------------------------------------------------------------------

class IMAPClient {
  private socket: Socket | TLSSocket | null = null;
  private buffer = "";
  private tagCounter = 0;
  private responseResolve: ((lines: string[]) => void) | null = null;
  private pendingLines: string[] = [];
  private pendingTag = "";

  constructor(
    private host: string,
    private port: number,
    private user: string,
    private password: string,
  ) {}

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`IMAP connection to ${this.host}:${this.port} timed out`));
      }, 15_000);

      this.socket = tlsConnect(
        { host: this.host, port: this.port, rejectUnauthorized: true },
        () => {
          clearTimeout(timeout);
          this.waitForGreeting().then(resolve).catch(reject);
        },
      );

      this.socket.setEncoding("utf-8");
      this.socket.on("data", (data: string) => this.onData(data));
      this.socket.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  async login(): Promise<void> {
    const resp = await this.command(`LOGIN ${this.user} ${this.password}`);
    if (!this.isOk(resp)) {
      throw new Error(`IMAP LOGIN failed: ${resp.join(" ")}`);
    }
  }

  async selectInbox(): Promise<{ exists: number }> {
    const resp = await this.command("SELECT INBOX");
    if (!this.isOk(resp)) {
      throw new Error(`IMAP SELECT INBOX failed: ${resp.join(" ")}`);
    }
    let exists = 0;
    for (const line of resp) {
      const match = line.match(/\*\s+(\d+)\s+EXISTS/i);
      if (match) exists = parseInt(match[1]!, 10);
    }
    return { exists };
  }

  async uidSearch(criteria: string): Promise<number[]> {
    const resp = await this.command(`UID SEARCH ${criteria}`);
    if (!this.isOk(resp)) return [];

    const uids: number[] = [];
    for (const line of resp) {
      const match = line.match(/^\*\s+SEARCH\s+([\d\s]+)/i);
      if (match) {
        for (const uid of match[1]!.trim().split(/\s+/)) {
          const n = parseInt(uid, 10);
          if (!isNaN(n)) uids.push(n);
        }
      }
    }
    return uids;
  }

  async uidFetch(uid: number): Promise<EmailMessage | null> {
    const resp = await this.command(`UID FETCH ${uid} (ENVELOPE BODY.PEEK[TEXT]<0.200>)`);
    if (!this.isOk(resp)) return null;

    const joined = resp.join("\n");
    return {
      uid,
      from: this.parseFrom(joined),
      subject: this.parseSubject(joined),
      date: this.parseDate(joined),
      snippet: this.parseSnippet(joined),
    };
  }

  async logout(): Promise<void> {
    try {
      await this.command("LOGOUT");
    } catch {
      // Best effort
    }
    this.close();
  }

  close(): void {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
  }

  // ── Parsing helpers ───────────────────────────────────────────────────

  private parseFrom(text: string): string {
    const match = text.match(/ENVELOPE\s*\([^)]*"[^"]*"\s*\(\("([^"]*)"(?:\s+NIL\s+"([^"]*)"\s+"([^"]*)")?/i);
    if (match) {
      const name = match[1] ?? "";
      const mailbox = match[2] ?? "";
      const host = match[3] ?? "";
      return name || (mailbox && host ? `${mailbox}@${host}` : "unknown");
    }
    const emailMatch = text.match(/"([\w.+-]+@[\w.-]+)"/);
    return emailMatch?.[1] ?? "unknown";
  }

  private parseSubject(text: string): string {
    const match = text.match(/ENVELOPE\s*\("[^"]*"\s+"([^"]*)"/i);
    return match?.[1] ?? "(no subject)";
  }

  private parseDate(text: string): string {
    const match = text.match(/ENVELOPE\s*\("([^"]*)"/i);
    return match?.[1] ?? new Date().toISOString();
  }

  private parseSnippet(text: string): string {
    const match = text.match(/BODY\[TEXT\]<0>\s*\{(\d+)\}\r?\n([\s\S]*?)(?:\r?\n\)|\r?\n[A-Z])/i);
    if (match) {
      return match[2]!.trim().slice(0, 200).replace(/\r?\n/g, " ");
    }
    return "";
  }

  // ── IMAP protocol plumbing ────────────────────────────────────────────

  private async waitForGreeting(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (this.buffer.includes("* OK")) {
          this.buffer = "";
          resolve();
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });
  }

  private async command(cmd: string): Promise<string[]> {
    const tag = `A${++this.tagCounter}`;
    this.pendingTag = tag;
    this.pendingLines = [];

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.responseResolve = null;
        reject(new Error(`IMAP command timed out: ${tag} ${cmd.split(" ")[0]}`));
      }, 30_000);

      this.responseResolve = (lines) => {
        clearTimeout(timeout);
        resolve(lines);
      };

      this.socket!.write(`${tag} ${cmd}\r\n`);
    });
  }

  private onData(data: string): void {
    this.buffer += data;

    while (true) {
      const nlIdx = this.buffer.indexOf("\r\n");
      if (nlIdx === -1) break;

      const line = this.buffer.slice(0, nlIdx);
      this.buffer = this.buffer.slice(nlIdx + 2);

      this.pendingLines.push(line);

      if (this.pendingTag && line.startsWith(this.pendingTag)) {
        const resolve = this.responseResolve;
        const lines = [...this.pendingLines];
        this.responseResolve = null;
        this.pendingLines = [];
        this.pendingTag = "";
        resolve?.(lines);
      }
    }
  }

  private isOk(lines: string[]): boolean {
    const last = lines[lines.length - 1] ?? "";
    return /\bOK\b/i.test(last);
  }
}

// ---------------------------------------------------------------------------
// EmailTrigger — connector-first polling with IMAP fallback
// ---------------------------------------------------------------------------

export class EmailTrigger {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private lastSeenIds = new Set<string>();
  private lastSeenUid = 0;
  private firstPoll = true;

  private connectorName: string | undefined;
  private connectorManager: ConnectorManager | null = null;

  private host: string;
  private port: number;
  private user: string;
  private password: string;
  private intervalMs: number;
  private filterFrom: string | undefined;
  private filterSubject: string | undefined;

  constructor(config: EmailConfig, connectorManager?: ConnectorManager) {
    this.connectorName = config.connector;
    this.connectorManager = connectorManager ?? null;

    // IMAP fallback settings
    this.host = config.host ?? process.env.IMAP_HOST ?? "imap.gmail.com";
    this.port = config.port ?? parseInt(process.env.IMAP_PORT ?? "993", 10);
    this.user = config.user ?? process.env.IMAP_USER ?? "";
    this.password = config.password ?? process.env.IMAP_PASSWORD ?? "";
    this.intervalMs = config.intervalMs ?? 120_000;
    this.filterFrom = config.from;
    this.filterSubject = config.subject;
  }

  /** Check if the trigger can be activated. */
  validate(): string | null {
    // Connector mode — just need the connector name
    if (this.connectorName) {
      return null;
    }
    // IMAP mode — need credentials
    if (!this.user) return "IMAP_USER is required for email triggers (or set config.connector)";
    if (!this.password) return "IMAP_PASSWORD is required for email triggers (or set config.connector)";
    return null;
  }

  /** Start polling for new emails. Calls `onMessage` for each new message. */
  start(onMessage: EmailCallback): void {
    if (this.running) return;

    const validationError = this.validate();
    if (validationError) {
      log.error(`Email trigger: ${validationError}`);
      return;
    }

    this.running = true;
    const mode = this.connectorName
      ? `connector:${this.connectorName}`
      : `IMAP:${this.user}@${this.host}`;
    log.info(`Email trigger started: ${mode} (poll every ${this.intervalMs / 1000}s)`);

    // Run first poll immediately, then on interval
    this.poll(onMessage);
    this.timer = setInterval(() => this.poll(onMessage), this.intervalMs);
  }

  /** Stop polling. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
    log.debug("Email trigger stopped");
  }

  isRunning(): boolean {
    return this.running;
  }

  // ── Poll dispatch ───────────────────────────────────────────────────

  private async poll(onMessage: EmailCallback): Promise<void> {
    if (this.connectorName) {
      await this.pollViaConnector(onMessage);
    } else {
      await this.pollViaImap(onMessage);
    }
  }

  // ── Connector-based polling (Gmail / Outlook API) ──────────────────

  private async pollViaConnector(onMessage: EmailCallback): Promise<void> {
    if (!this.connectorManager || !this.connectorName) return;

    try {
      const connector = await this.connectorManager.get(this.connectorName);
      if (!connector) {
        log.warn(`Email trigger: connector "${this.connectorName}" is not available — is it configured?`);
        return;
      }

      // Build query for unread messages
      const queryParts: string[] = ["is:unread"];
      if (this.filterFrom) queryParts.push(`from:${this.filterFrom}`);
      if (this.filterSubject) queryParts.push(`subject:${this.filterSubject}`);
      const query = queryParts.join(" ");

      const listResult = await connector.call("messages.list", {
        q: query,
        max_results: 20,
      });

      if (!listResult.ok) {
        log.warn(`Email trigger: ${this.connectorName} messages.list failed: ${listResult.error}`);
        return;
      }

      const data = listResult.data as { messages?: Array<{ id: string; threadId?: string }> };
      const messageIds = data?.messages ?? [];

      if (messageIds.length === 0) {
        if (this.firstPoll) {
          log.debug("Email trigger: no unread messages (initial poll)");
          this.firstPoll = false;
        }
        return;
      }

      // On first poll, seed the seen set without firing (avoid re-triggering old emails)
      if (this.firstPoll) {
        for (const msg of messageIds) {
          this.lastSeenIds.add(msg.id);
        }
        this.firstPoll = false;
        log.info(`Email trigger: seeded ${messageIds.length} existing unread message(s)`);
        return;
      }

      // Find new messages we haven't seen before
      const newMessageIds = messageIds.filter((msg) => !this.lastSeenIds.has(msg.id));

      if (newMessageIds.length === 0) return;

      log.info(`Email trigger: ${newMessageIds.length} new message(s) found via ${this.connectorName}`);

      // Fetch details for each new message
      for (const msg of newMessageIds) {
        this.lastSeenIds.add(msg.id);

        try {
          const detailResult = await connector.call("messages.get", {
            message_id: msg.id,
            format: "full",
          });

          if (!detailResult.ok) {
            log.warn(`Email trigger: failed to fetch message ${msg.id}: ${detailResult.error}`);
            continue;
          }

          const gmailMsg = detailResult.data as GmailMessage;
          const from = getHeader(gmailMsg.payload, "From");
          const subject = getHeader(gmailMsg.payload, "Subject");
          const date = getHeader(gmailMsg.payload, "Date") ||
            (gmailMsg.internalDate ? new Date(parseInt(gmailMsg.internalDate, 10)).toISOString() : new Date().toISOString());
          const snippet = gmailMsg.snippet ?? "";

          const emailMessage: EmailMessage = {
            uid: parseInt(gmailMsg.id, 16) || 0,
            from,
            subject,
            date,
            snippet: snippet.slice(0, 200),
          };

          try {
            onMessage(emailMessage);
          } catch (err) {
            log.error(`Email trigger callback error: ${err}`);
          }
        } catch (err) {
          log.warn(`Email trigger: error fetching message ${msg.id}: ${err instanceof Error ? err.message : err}`);
        }
      }

      // Cap the seen set to prevent unbounded growth
      if (this.lastSeenIds.size > 1000) {
        const entries = Array.from(this.lastSeenIds);
        this.lastSeenIds = new Set(entries.slice(entries.length - 500));
      }
    } catch (err) {
      log.warn(`Email trigger: connector poll failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  // ── IMAP-based polling (fallback) ─────────────────────────────────

  private async pollViaImap(onMessage: EmailCallback): Promise<void> {
    const client = new IMAPClient(this.host, this.port, this.user, this.password);

    try {
      await client.connect();
      await client.login();
      const { exists } = await client.selectInbox();

      if (exists === 0) {
        await client.logout();
        return;
      }

      const criteria = this.buildImapSearchCriteria();
      const uids = await client.uidSearch(criteria);

      const newUids = uids.filter((uid) => uid > this.lastSeenUid);

      if (newUids.length > 0) {
        log.info(`Email trigger: ${newUids.length} new message(s) found via IMAP`);
      }

      for (const uid of newUids) {
        const message = await client.uidFetch(uid);
        if (!message) continue;

        if (this.filterSubject && !message.subject.toLowerCase().includes(this.filterSubject.toLowerCase())) {
          continue;
        }

        this.lastSeenUid = Math.max(this.lastSeenUid, uid);

        try {
          onMessage(message);
        } catch (err) {
          log.error(`Email trigger callback error: ${err}`);
        }
      }

      if (newUids.length > 0) {
        this.lastSeenUid = Math.max(this.lastSeenUid, ...newUids);
      }

      await client.logout();
    } catch (err) {
      log.warn(`Email trigger poll failed: ${err instanceof Error ? err.message : err}`);
      client.close();
    }
  }

  private buildImapSearchCriteria(): string {
    const parts: string[] = ["UNSEEN"];

    if (this.filterFrom) {
      parts.push(`FROM "${this.filterFrom}"`);
    }

    const since = new Date();
    since.setDate(since.getDate() - 1);
    const dateStr = since.toLocaleDateString("en-US", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    parts.push(`SINCE ${dateStr}`);

    return parts.join(" ");
  }
}
