// STDIO transport — spawns a child process and exchanges newline-delimited
// JSON-RPC messages over its stdio streams.
//
// This is the canonical MCP transport for local tools (filesystem, git,
// sqlite, etc.). The server is any executable that reads JSON-RPC from
// stdin and writes responses to stdout. We attach stderr to the daemon
// logger so server diagnostics aren't silently lost.

import { spawn, type ChildProcess } from "node:child_process";
import {
  McpTransportError,
  type Transport,
} from "./transport.js";
import type { JsonRpcMessage } from "./protocol.js";
import { getLogger } from "../../../shared/logger.js";
import { terminateChild } from "../../../shared/spawn-safe.js";

const log = getLogger();

/**
 * Grace period between SIGTERM and SIGKILL on shutdown. MCP servers are
 * usually well-behaved JSON-RPC loops that flush on SIGTERM, but a
 * wedged server shouldn't be able to stall daemon shutdown indefinitely.
 */
const MCP_CLOSE_GRACE_MS = 1_000;

export interface StdioTransportOptions {
  command: string;
  args?: readonly string[];
  env?: Readonly<Record<string, string>>;
  cwd?: string;
}

export class StdioTransport implements Transport {
  readonly descriptor: string;

  private child: ChildProcess | undefined;
  private stdoutBuffer = "";
  private messageHandler: ((m: JsonRpcMessage) => void) | undefined;
  private errorHandler: ((e: McpTransportError) => void) | undefined;
  private closed = false;

  constructor(private readonly opts: StdioTransportOptions) {
    const args = opts.args ? ` ${opts.args.join(" ")}` : "";
    this.descriptor = `stdio:${opts.command}${args}`;
  }

  onMessage(handler: (m: JsonRpcMessage) => void): void {
    this.messageHandler = handler;
  }

  onError(handler: (e: McpTransportError) => void): void {
    this.errorHandler = handler;
  }

  async start(): Promise<void> {
    if (this.child) return;

    this.child = spawn(this.opts.command, this.opts.args ? [...this.opts.args] : [], {
      env: { ...process.env, ...(this.opts.env ?? {}) } as NodeJS.ProcessEnv,
      cwd: this.opts.cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.child.on("error", (err) => {
      this.errorHandler?.(
        new McpTransportError(`MCP stdio process error (${this.descriptor})`, err),
      );
    });

    this.child.on("exit", (code, signal) => {
      if (!this.closed) {
        this.errorHandler?.(
          new McpTransportError(
            `MCP stdio process exited (${this.descriptor}) code=${code} signal=${signal}`,
          ),
        );
      }
    });

    this.child.stderr?.setEncoding("utf-8");
    this.child.stderr?.on("data", (chunk: string) => {
      log.debug(`MCP ${this.descriptor} stderr: ${chunk.trimEnd()}`);
    });

    this.child.stdout?.setEncoding("utf-8");
    this.child.stdout?.on("data", (chunk: string) => this.feedStdout(chunk));
  }

  async send(message: JsonRpcMessage): Promise<void> {
    if (!this.child || !this.child.stdin) {
      throw new McpTransportError(`stdio transport not started (${this.descriptor})`);
    }
    const line = `${JSON.stringify(message)}\n`;
    return new Promise((resolve, reject) => {
      this.child!.stdin!.write(line, (err) => {
        if (err) reject(new McpTransportError(`stdio write failed (${this.descriptor})`, err));
        else resolve();
      });
    });
  }

  async close(): Promise<void> {
    this.closed = true;
    const child = this.child;
    if (!child) return;
    this.child = undefined;

    // Closing stdin lets well-behaved servers drain and exit cleanly.
    try { child.stdin?.end(); } catch { /* ignore */ }

    if (child.killed || child.exitCode !== null) return;

    await new Promise<void>((resolve) => {
      const onExit = () => { clearTimeout(killTimer); resolve(); };
      child.once("exit", onExit);

      terminateChild(child, "SIGTERM");

      const killTimer = setTimeout(() => {
        child.off("exit", onExit);
        if (!child.killed && child.exitCode === null) {
          terminateChild(child, "SIGKILL");
        }
        resolve();
      }, MCP_CLOSE_GRACE_MS);
    });
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private feedStdout(chunk: string): void {
    this.stdoutBuffer += chunk;
    let newlineIdx = this.stdoutBuffer.indexOf("\n");
    while (newlineIdx !== -1) {
      const line = this.stdoutBuffer.slice(0, newlineIdx).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIdx + 1);
      if (line.length > 0) this.dispatchLine(line);
      newlineIdx = this.stdoutBuffer.indexOf("\n");
    }
  }

  private dispatchLine(line: string): void {
    let msg: JsonRpcMessage;
    try {
      msg = JSON.parse(line);
    } catch (err) {
      log.warn(`MCP ${this.descriptor}: malformed line discarded: ${line.slice(0, 120)}`);
      this.errorHandler?.(new McpTransportError("malformed JSON-RPC line", err));
      return;
    }
    this.messageHandler?.(msg);
  }
}
