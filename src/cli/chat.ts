/**
 * Interactive REPL — launched when `jeriko` is run with no arguments.
 *
 * Connects to the daemon via Unix socket if it's running, otherwise
 * starts an in-process agent loop for direct AI interaction.
 *
 * Session persistence:
 *  - Resumes the last active session on startup (KV: "state:last_session_id")
 *  - All user + assistant messages saved to SQLite
 *  - /new      — start a fresh session
 *  - /sessions — list recent sessions
 *  - /resume   — resume a previous session by slug or ID
 */

import { createInterface } from "node:readline";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const SOCKET_PATH = join(homedir(), ".jeriko", "daemon.sock");

function isDaemonRunning(): boolean {
  return existsSync(SOCKET_PATH);
}

export async function startChat(): Promise<void> {
  const daemon = isDaemonRunning();

  if (daemon) {
    await runDaemonChat();
  } else {
    await runInProcessChat();
  }
}

async function runDaemonChat(): Promise<void> {
  const { sendRequest } = await import("../daemon/api/socket.js");

  // Get or create a session via the daemon — first ask creates/resumes,
  // subsequent asks reuse the same session_id for continuity.
  let sessionId: string | undefined;

  console.log("Connected to Jeriko daemon. Type /new for a fresh session, 'exit' to quit.\n");

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "jeriko> ",
  });

  rl.prompt();

  rl.on("line", async (line: string) => {
    const input = line.trim();
    if (!input || input === "exit" || input === "quit" || input === ".exit") {
      rl.close();
      return;
    }

    // Slash command: start new session
    if (input === "/new") {
      sessionId = undefined;
      console.log("\nNew session will start on next message.\n");
      rl.prompt();
      return;
    }

    if (input === "/help") {
      console.log(`
Commands:
  /new     Start a new session
  /help    Show this help
  exit     Quit
`);
      rl.prompt();
      return;
    }

    try {
      const params: Record<string, unknown> = { message: input };
      if (sessionId) params.session_id = sessionId;

      const response = await sendRequest("ask", params);
      if (response.ok) {
        const data = response.data as Record<string, unknown>;
        // Capture the session ID from the daemon so all subsequent
        // messages in this REPL go to the same session.
        if (data.sessionId) sessionId = data.sessionId as string;
        console.log(data.response ?? JSON.stringify(data));
      } else {
        console.error(`Error: ${response.error}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Connection error: ${msg}`);
    }

    console.log();
    rl.prompt();
  });

  rl.on("close", () => {
    console.log("Goodbye.");
    process.exit(0);
  });
}

async function runInProcessChat(): Promise<void> {
  // Initialize in-process agent
  const { getDatabase } = await import("../daemon/storage/db.js");
  getDatabase();

  // Register tools
  await Promise.all([
    import("../daemon/agent/tools/bash.js"),
    import("../daemon/agent/tools/read.js"),
    import("../daemon/agent/tools/write.js"),
    import("../daemon/agent/tools/edit.js"),
    import("../daemon/agent/tools/list.js"),
    import("../daemon/agent/tools/search.js"),
    import("../daemon/agent/tools/web.js"),
    import("../daemon/agent/tools/browse.js"),
    import("../daemon/agent/tools/parallel.js"),
    import("../daemon/agent/tools/delegate.js"),
  ]);

  const { loadConfig } = await import("../shared/config.js");
  const {
    createSession,
    getSession,
    getSessionBySlug,
    listSessions,
  } = await import("../daemon/agent/session/session.js");
  const { addMessage, getMessages } = await import(
    "../daemon/agent/session/message.js"
  );
  const { kvGet, kvSet } = await import("../daemon/storage/kv.js");
  const { runAgent } = await import("../daemon/agent/agent.js");
  type DriverMessage = import("../daemon/agent/drivers/index.js").DriverMessage;

  const config = loadConfig();

  // ---------------------------------------------------------------------------
  // Session resume — pick up where the user left off
  // ---------------------------------------------------------------------------

  let session: ReturnType<typeof createSession>;
  let history: DriverMessage[] = [];

  const lastSessionId = kvGet<string>("state:last_session_id");
  const existing = lastSessionId ? getSession(lastSessionId) : null;

  if (existing && existing.archived_at === null) {
    // Resume the last active session
    session = existing;
    const rows = getMessages(session.id);
    history = rows.map((m) => ({
      role: m.role as DriverMessage["role"],
      content: m.content,
    }));
    console.log(
      `Resuming session "${session.slug}" (${rows.length} messages). ` +
        `Type /new for a fresh session.\n`,
    );
  } else {
    // Create a new session
    session = createSession({ model: config.agent.model });
    kvSet("state:last_session_id", session.id);
    console.log(
      `New session "${session.slug}" (model: ${config.agent.model}). ` +
        `Type 'exit' to quit.\n`,
    );
  }

  // ---------------------------------------------------------------------------
  // REPL
  // ---------------------------------------------------------------------------

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "jeriko> ",
  });

  rl.prompt();

  rl.on("line", async (line: string) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }
    if (input === "exit" || input === "quit" || input === ".exit") {
      rl.close();
      return;
    }

    // ── Slash commands ──────────────────────────────────────────────
    if (input === "/new") {
      session = createSession({ model: config.agent.model });
      history = [];
      kvSet("state:last_session_id", session.id);
      console.log(`\nNew session "${session.slug}" started.\n`);
      rl.prompt();
      return;
    }

    if (input === "/sessions") {
      const sessions = listSessions(20);
      if (sessions.length === 0) {
        console.log("\nNo sessions found.\n");
      } else {
        console.log("\nRecent sessions:");
        for (const s of sessions) {
          const active = s.id === session.id ? " ← current" : "";
          const date = new Date(s.updated_at).toLocaleDateString();
          console.log(
            `  ${s.slug}  ${s.title}  (${s.model}, ${s.token_count} tokens, ${date})${active}`,
          );
        }
        console.log(`\nUse /resume <slug> to switch sessions.\n`);
      }
      rl.prompt();
      return;
    }

    if (input.startsWith("/resume ")) {
      const target = input.slice(8).trim();
      if (!target) {
        console.log("\nUsage: /resume <slug-or-id>\n");
        rl.prompt();
        return;
      }
      const found = getSessionBySlug(target) ?? getSession(target);
      if (!found) {
        console.log(`\nSession "${target}" not found. Use /sessions to list.\n`);
        rl.prompt();
        return;
      }
      session = found;
      const rows = getMessages(session.id);
      history = rows.map((m) => ({
        role: m.role as DriverMessage["role"],
        content: m.content,
      }));
      kvSet("state:last_session_id", session.id);
      console.log(
        `\nResumed session "${session.slug}" (${rows.length} messages).\n`,
      );
      rl.prompt();
      return;
    }

    if (input === "/help") {
      console.log(`
Commands:
  /new              Start a new session
  /sessions         List recent sessions
  /resume <slug>    Resume a previous session
  /help             Show this help
  exit              Quit
`);
      rl.prompt();
      return;
    }

    // ── Normal message — persist + run agent ────────────────────────

    // 1. Persist user message to DB
    addMessage(session.id, "user", input);

    // 2. Add to in-memory history for the agent loop
    history.push({ role: "user", content: input });

    const agentConfig = {
      sessionId: session.id,
      backend: config.agent.model,
      model: config.agent.model,
      maxTokens: config.agent.maxTokens,
      temperature: config.agent.temperature,
      extendedThinking: config.agent.extendedThinking,
      toolIds: null,
    };

    let fullResponse = "";
    try {
      for await (const event of runAgent(agentConfig, history)) {
        switch (event.type) {
          case "text_delta":
            process.stdout.write(event.content);
            fullResponse += event.content;
            break;
          case "tool_call_start":
            process.stderr.write(`\n[tool: ${event.toolCall.name}]\n`);
            break;
          case "tool_result":
            if (event.isError) {
              process.stderr.write(`[tool error: ${event.result}]\n`);
            }
            break;
          case "error":
            process.stderr.write(`\nError: ${event.message}\n`);
            break;
          case "compaction":
            process.stderr.write(
              `\n[context compacted: ${event.beforeTokens} → ${event.afterTokens} tokens]\n`,
            );
            break;
          case "turn_complete":
            break;
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`\nAgent error: ${msg}\n`);
    }

    // 3. Add assistant response to in-memory history
    //    (already persisted to DB by runAgent)
    if (fullResponse) {
      history.push({ role: "assistant", content: fullResponse });
    }

    console.log();
    rl.prompt();
  });

  rl.on("close", () => {
    console.log("Goodbye.");
    process.exit(0);
  });
}
