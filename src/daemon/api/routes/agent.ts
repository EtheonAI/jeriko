// Agent API routes — chat, stream, list sessions, spawn new agent.

import { Hono } from "hono";
import { getLogger } from "../../../shared/logger.js";
import { loadConfig } from "../../../shared/config.js";
import { createSession } from "../../agent/session/session.js";
import { addMessage, addPart, buildDriverMessages } from "../../agent/session/message.js";
import { runAgent, type AgentRunConfig } from "../../agent/agent.js";
import { parseModelSpec } from "../../agent/drivers/models.js";

const log = getLogger();

// ---------------------------------------------------------------------------
// In-memory agent session tracker
// ---------------------------------------------------------------------------

interface AgentSession {
  id: string;
  model: string;
  status: "active" | "idle" | "error";
  created_at: string;
  last_activity: string;
  message_count: number;
}

const activeSessions = new Map<string, AgentSession>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function agentRoutes(): Hono {
  const router = new Hono();

  /**
   * POST /agent/chat — Send a message to the agent and get a full response.
   *
   * Body: { message: string, model?: string, system?: string,
   *         max_tokens?: number, tools?: string[], session_id?: string }
   *
   * Response: { ok: true, data: { response, tokensIn, tokensOut, sessionId } }
   */
  router.post("/chat", async (c) => {
    const body = await c.req.json<{
      message: string;
      model?: string;
      system?: string;
      max_tokens?: number;
      tools?: string[];
      session_id?: string;
    }>();

    if (!body.message?.trim()) {
      return c.json({ ok: false, error: "message is required" }, 400);
    }

    const config = loadConfig();
    const rawModel = body.model ?? config.agent.model;
    const { backend, model: modelId } = parseModelSpec(rawModel);

    // Create or reuse session
    let sessionId = body.session_id;
    if (!sessionId) {
      const sess = createSession({
        title: body.message.slice(0, 80),
        model: modelId,
      });
      sessionId = sess.id;
    }

    // Track session in memory
    let tracker = activeSessions.get(sessionId);
    if (!tracker) {
      tracker = {
        id: sessionId,
        model: modelId,
        status: "active",
        created_at: new Date().toISOString(),
        last_activity: new Date().toISOString(),
        message_count: 0,
      };
      activeSessions.set(sessionId, tracker);
    }
    tracker.status = "active";
    tracker.last_activity = new Date().toISOString();
    tracker.message_count++;

    // Persist the user message
    const userMsg = addMessage(sessionId, "user", body.message);
    addPart(userMsg.id, "text", body.message);

    // Build conversation history from DB — includes tool_calls and tool_call_id
    const conversationHistory = buildDriverMessages(sessionId);

    // Configure the agent run
    const agentConfig: AgentRunConfig = {
      sessionId,
      backend,
      model: modelId,
      systemPrompt: body.system ?? undefined,
      maxTokens: body.max_tokens ?? config.agent.maxTokens,
      toolIds: body.tools ?? null,
    };

    log.info(`Agent chat: session=${sessionId}, model=${modelId}, backend=${backend}`);

    // Run the agent loop and collect the full response
    let response = "";
    let tokensIn = 0;
    let tokensOut = 0;

    try {
      for await (const event of runAgent(agentConfig, conversationHistory)) {
        switch (event.type) {
          case "text_delta":
            response += event.content;
            break;
          case "turn_complete":
            tokensIn = event.tokensIn;
            tokensOut = event.tokensOut;
            break;
          case "error":
            log.error(`Agent error: ${event.message}`);
            break;
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log.error(`Agent chat failed: ${errMsg}`);
      tracker.status = "error";
      return c.json({ ok: false, error: errMsg }, 500);
    }

    tracker.status = "idle";
    tracker.last_activity = new Date().toISOString();

    return c.json({
      ok: true,
      data: {
        response,
        tokensIn,
        tokensOut,
        sessionId,
      },
    });
  });

  /**
   * POST /agent/stream — Send a message and stream agent events via SSE.
   *
   * Body: same as /agent/chat
   *
   * Response: text/event-stream with events:
   *   - event: text_delta     data: { content }
   *   - event: tool_call      data: { id, name, arguments }
   *   - event: tool_result    data: { toolCallId, result, isError }
   *   - event: thinking       data: { content }
   *   - event: turn_complete  data: { tokensIn, tokensOut }
   *   - event: error          data: { message }
   *   - event: done           data: { sessionId }
   */
  router.post("/stream", async (c) => {
    const body = await c.req.json<{
      message: string;
      model?: string;
      system?: string;
      max_tokens?: number;
      tools?: string[];
      session_id?: string;
    }>();

    if (!body.message?.trim()) {
      return c.json({ ok: false, error: "message is required" }, 400);
    }

    const config = loadConfig();
    const rawModel = body.model ?? config.agent.model;
    const { backend, model: modelId } = parseModelSpec(rawModel);

    // Create or reuse session
    let sessionId = body.session_id;
    if (!sessionId) {
      const sess = createSession({
        title: body.message.slice(0, 80),
        model: modelId,
      });
      sessionId = sess.id;
    }

    // Track session
    let tracker = activeSessions.get(sessionId);
    if (!tracker) {
      tracker = {
        id: sessionId,
        model: modelId,
        status: "active",
        created_at: new Date().toISOString(),
        last_activity: new Date().toISOString(),
        message_count: 0,
      };
      activeSessions.set(sessionId, tracker);
    }
    tracker.status = "active";
    tracker.last_activity = new Date().toISOString();
    tracker.message_count++;

    // Persist user message
    const userMsg = addMessage(sessionId, "user", body.message);
    addPart(userMsg.id, "text", body.message);

    // Build conversation history — includes tool metadata
    const conversationHistory = buildDriverMessages(sessionId);

    const agentConfig: AgentRunConfig = {
      sessionId,
      backend,
      model: modelId,
      systemPrompt: body.system ?? undefined,
      maxTokens: body.max_tokens ?? config.agent.maxTokens,
      toolIds: body.tools ?? null,
    };

    log.info(`Agent stream: session=${sessionId}, model=${modelId}, backend=${backend}`);

    // Capture sessionId for the closure
    const sid = sessionId;
    const trk = tracker;

    // Return SSE stream
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        function sendEvent(event: string, data: unknown): void {
          const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        }

        try {
          for await (const event of runAgent(agentConfig, conversationHistory)) {
            switch (event.type) {
              case "text_delta":
                sendEvent("text_delta", { content: event.content });
                break;
              case "thinking":
                sendEvent("thinking", { content: event.content });
                break;
              case "tool_call_start":
                sendEvent("tool_call", {
                  id: event.toolCall.id,
                  name: event.toolCall.name,
                  arguments: event.toolCall.arguments,
                });
                break;
              case "tool_result":
                sendEvent("tool_result", {
                  toolCallId: event.toolCallId,
                  result: event.result,
                  isError: event.isError,
                });
                break;
              case "compaction":
                sendEvent("compaction", {
                  beforeTokens: event.beforeTokens,
                  afterTokens: event.afterTokens,
                });
                break;
              case "turn_complete":
                sendEvent("turn_complete", {
                  tokensIn: event.tokensIn,
                  tokensOut: event.tokensOut,
                });
                break;
              case "error":
                sendEvent("error", { message: event.message });
                break;
            }
          }

          sendEvent("done", { sessionId: sid });
          trk.status = "idle";
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          sendEvent("error", { message: errMsg });
          trk.status = "error";
          log.error(`Agent stream failed: ${errMsg}`);
        } finally {
          trk.last_activity = new Date().toISOString();
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  });

  /**
   * GET /agent/list — List all active agent sessions.
   *
   * Response: { ok: true, data: AgentSession[] }
   */
  router.get("/list", (c) => {
    const sessions = [...activeSessions.values()].sort(
      (a, b) => b.last_activity.localeCompare(a.last_activity),
    );

    return c.json({ ok: true, data: sessions });
  });

  /**
   * POST /agent/spawn — Spawn a new agent session with an initial prompt.
   *
   * Body: { prompt: string, model?: string, tools?: string[] }
   * Response: { ok: true, data: { session_id } }
   */
  router.post("/spawn", async (c) => {
    const body = await c.req.json<{
      prompt: string;
      model?: string;
      tools?: string[];
    }>();

    if (!body.prompt?.trim()) {
      return c.json({ ok: false, error: "prompt is required" }, 400);
    }

    const config = loadConfig();
    const model = body.model ?? config.agent.model;

    const sess = createSession({
      title: body.prompt.slice(0, 80),
      model,
    });

    const session: AgentSession = {
      id: sess.id,
      model,
      status: "active",
      created_at: new Date().toISOString(),
      last_activity: new Date().toISOString(),
      message_count: 0,
    };

    activeSessions.set(sess.id, session);

    log.info(`Agent spawned: session=${sess.id}, model=${model}`);

    return c.json({
      ok: true,
      data: { session_id: sess.id },
    });
  });

  return router;
}
