// MCP client — owns the JSON-RPC id counter, correlates responses to
// callers, and exposes `initialize` / `listTools` / `callTool`.
//
// One client instance corresponds to exactly one MCP server. The enclosing
// manager (index.ts) spins up one client per configured server.

import { randomUUID } from "node:crypto";
import {
  MCP_PROTOCOL_VERSION,
  buildNotification,
  buildRequest,
  isError,
  isSuccess,
  type CallToolParams,
  type CallToolResult,
  type InitializeParams,
  type InitializeResult,
  type JsonRpcId,
  type JsonRpcMessage,
  type JsonRpcResponse,
  type ListToolsResult,
} from "./protocol.js";
import {
  McpTransportError,
  type Transport,
} from "./transport.js";

export interface ClientInfo {
  name: string;
  version: string;
}

const DEFAULT_CLIENT_INFO: ClientInfo = {
  name: "jeriko",
  version: "2.0.0",
};

export class McpRpcError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly data?: unknown,
  ) {
    super(message);
    this.name = "McpRpcError";
  }
}

export class McpClient {
  private nextId = 1;
  private readonly pending = new Map<
    JsonRpcId,
    { resolve: (value: JsonRpcResponse) => void; reject: (err: Error) => void }
  >();
  private initialized = false;

  constructor(
    readonly serverName: string,
    private readonly transport: Transport,
    private readonly clientInfo: ClientInfo = DEFAULT_CLIENT_INFO,
  ) {
    transport.onMessage((msg) => this.handleMessage(msg));
    transport.onError((err) => this.failAllPending(err));
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async start(): Promise<InitializeResult> {
    await this.transport.start();

    const result = await this.call<InitializeParams, InitializeResult>(
      "initialize",
      {
        protocolVersion: MCP_PROTOCOL_VERSION,
        clientInfo: this.clientInfo,
        capabilities: { tools: {} },
      },
    );

    await this.transport.send(buildNotification("notifications/initialized"));
    this.initialized = true;
    return result;
  }

  async close(): Promise<void> {
    await this.transport.close();
    this.failAllPending(new McpTransportError(`client closed: ${this.serverName}`));
  }

  // ---------------------------------------------------------------------------
  // MCP RPC wrappers
  // ---------------------------------------------------------------------------

  async listTools(): Promise<ListToolsResult> {
    this.assertInitialized();
    return this.call<undefined, ListToolsResult>("tools/list", undefined);
  }

  async callTool(params: CallToolParams): Promise<CallToolResult> {
    this.assertInitialized();
    return this.call<CallToolParams, CallToolResult>("tools/call", params);
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new Error(
        `MCP client ${this.serverName}: call start() before other methods`,
      );
    }
  }

  private async call<P, R>(method: string, params: P): Promise<R> {
    const id: JsonRpcId = `${this.nextId++}-${randomUUID().slice(0, 8)}`;
    const request = buildRequest<P>(id, method, params);

    const response = await new Promise<JsonRpcResponse<R>>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (msg) => resolve(msg as JsonRpcResponse<R>),
        reject,
      });
      this.transport.send(request).catch((err) => {
        this.pending.delete(id);
        reject(err);
      });
    });

    if (isError(response)) {
      throw new McpRpcError(
        `MCP ${method} failed: ${response.error.message}`,
        response.error.code,
        response.error.data,
      );
    }
    if (!isSuccess<R>(response)) {
      throw new McpRpcError(`MCP ${method} returned malformed response`);
    }
    return response.result;
  }

  private handleMessage(msg: JsonRpcMessage): void {
    const id = (msg as JsonRpcResponse).id;
    if (id !== undefined && id !== null) {
      const pending = this.pending.get(id);
      if (pending) {
        this.pending.delete(id);
        pending.resolve(msg as JsonRpcResponse);
        return;
      }
    }
    // Unsolicited notifications (progress, logging) — ignored today;
    // hook into here when we wire progress streaming.
  }

  private failAllPending(err: Error): void {
    for (const [id, { reject }] of this.pending) {
      reject(err);
      this.pending.delete(id);
    }
  }
}
