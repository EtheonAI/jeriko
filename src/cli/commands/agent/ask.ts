import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool, flagStr } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import { loadSystemPrompt } from "../../../shared/prompt.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export const command: CommandHandler = {
  name: "ask",
  description: "Direct AI query via daemon",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko ask <question>");
      console.log("       echo 'question' | jeriko ask");
      console.log("\nSend a one-shot query to the AI agent via the daemon.");
      console.log("If the daemon is not running, starts an in-process agent.");
      console.log("\nFlags:");
      console.log("  --model <name>    Model to use (default: from config)");
      console.log("  --system <text>   Override system prompt");
      console.log("  --max-tokens <n>  Max response tokens");
      console.log("  --no-tools        Disable tool use for this query");
      process.exit(0);
    }

    const question = parsed.positional.join(" ");
    if (!question) {
      // Check if stdin has data (piped input)
      if (process.stdin.isTTY) {
        fail("Missing question. Usage: jeriko ask <question>");
      }
      // TODO: read from stdin
      fail("Pipe input not yet implemented. Usage: jeriko ask <question>");
    }

    const model = flagStr(parsed, "model", "");
    const systemOverride = flagStr(parsed, "system", "");
    const maxTokens = flagStr(parsed, "max-tokens", "");
    const noTools = flagBool(parsed, "no-tools");

    // Load system prompt: explicit --system flag takes priority, then AGENT.md
    const system = systemOverride || loadSystemPrompt();

    // Check if daemon is running
    const socketPath = join(homedir(), ".jeriko", "daemon.sock");
    const daemonRunning = existsSync(socketPath);

    if (daemonRunning) {
      // Route through daemon Unix socket
      try {
        const { sendRequest } = await import("../../../daemon/api/socket.js");
        const params: Record<string, unknown> = { message: question };
        if (model) params.model = model;
        if (system) params.system = system;
        if (maxTokens) params.max_tokens = parseInt(maxTokens, 10);
        if (noTools) params.tools = false;

        const response = await sendRequest("ask", params);
        if (response.ok) {
          const data = response.data as Record<string, unknown>;
          console.log(data.response ?? JSON.stringify(data));
        } else {
          fail(response.error ?? "Daemon request failed");
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        fail(`Daemon query failed: ${msg}`);
      }
    } else {
      // In-process agent — initialize directly
      try {
        // Init database (lazy singleton)
        const { getDatabase } = await import("../../../daemon/storage/db.js");
        getDatabase();

        // Register tools by importing them (they self-register)
        await Promise.all([
          import("../../../daemon/agent/tools/bash.js"),
          import("../../../daemon/agent/tools/read.js"),
          import("../../../daemon/agent/tools/write.js"),
          import("../../../daemon/agent/tools/edit.js"),
          import("../../../daemon/agent/tools/list.js"),
          import("../../../daemon/agent/tools/search.js"),
          import("../../../daemon/agent/tools/web.js"),
          import("../../../daemon/agent/tools/browse.js"),
        ]);

        const { loadConfig } = await import("../../../shared/config.js");
        const { createSession } = await import("../../../daemon/agent/session/session.js");
        const { addMessage, addPart } = await import("../../../daemon/agent/session/message.js");
        const { kvSet } = await import("../../../daemon/storage/kv.js");
        const { runAgent } = await import("../../../daemon/agent/agent.js");

        const config = loadConfig();
        const resolvedModel = model || config.agent.model;
        const session = createSession({ model: resolvedModel, title: question.slice(0, 80) });
        kvSet("state:last_session_id", session.id);

        // Persist user message to DB
        const userMsg = addMessage(session.id, "user", question);
        addPart(userMsg.id, "text", question);

        const agentConfig = {
          sessionId: session.id,
          backend: resolvedModel,
          model: resolvedModel,
          systemPrompt: system || undefined,
          maxTokens: maxTokens ? parseInt(maxTokens, 10) : config.agent.maxTokens,
          temperature: config.agent.temperature,
          extendedThinking: config.agent.extendedThinking,
          toolIds: noTools ? [] : null,
        };

        const history = [{ role: "user" as const, content: question }];

        let fullResponse = "";
        for await (const event of runAgent(agentConfig, history)) {
          switch (event.type) {
            case "text_delta":
              process.stdout.write(event.content);
              fullResponse += event.content;
              break;
            case "tool_call_start":
              if (!process.stdout.isTTY) break;
              process.stderr.write(`\n[tool: ${event.toolCall.name}]\n`);
              break;
            case "tool_result":
              if (!process.stdout.isTTY) break;
              if (event.isError) process.stderr.write(`[tool error: ${event.result}]\n`);
              break;
            case "error":
              process.stderr.write(`\nError: ${event.message}\n`);
              break;
            case "turn_complete":
              break;
          }
        }

        // Newline after streaming
        if (fullResponse) console.log();

      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        fail(`Agent error: ${msg}`);
      }
    }
  },
};
