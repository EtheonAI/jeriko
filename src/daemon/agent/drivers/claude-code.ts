// Daemon — Claude Code CLI driver.
//
// Thin driver: spawns `claude -p` as a subprocess and streams JSON output.
// Claude Code runs its own agentic loop with its own tools (Bash, Read, Edit).
// Jeriko does NOT pass tools — toolCall: false in capabilities.
//
// Key design decisions:
//   - System prompt via --system-prompt flag (not baked into prompt text)
//   - --dangerously-skip-permissions: required for non-interactive use.
//     Auth is already handled by the Telegram admin filter.
//   - cwd = $HOME: so Claude Code can access the full filesystem, not
//     just the project directory the daemon was launched from.
//   - ANTHROPIC_API_KEY stripped: forces subscription auth, not API credits.
//   - CLAUDECODE stripped: allows spawning from within another Claude Code session.

import { spawn, type Subprocess } from "bun";
import type {
  LLMDriver,
  StreamChunk,
  DriverConfig,
  DriverMessage,
} from "./index.js";
import { getLogger } from "../../../shared/logger.js";

const log = getLogger();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getClaudeBinary(): string {
  return process.env.CLAUDE_CODE_PATH ?? "claude";
}

/** Clean env for the subprocess — strip vars that interfere with Claude Code. */
function cleanEnv(): Record<string, string | undefined> {
  const env = { ...process.env };
  delete env.CLAUDECODE;              // Blocks nested sessions
  delete env.CLAUDE_CODE_ENTRYPOINT;  // Can interfere with subprocess
  delete env.ANTHROPIC_API_KEY;       // Force subscription auth, not API credits
  return env;
}

/**
 * Build the user prompt from conversation history.
 * System messages are NOT included here — they go via --system-prompt flag.
 * Only the latest user message is sent as the prompt (Claude Code doesn't
 * support multi-turn conversation via -p, it's single-turn with context).
 */
function buildPrompt(messages: DriverMessage[]): string {
  const parts: string[] = [];

  // Include conversation context for multi-turn awareness
  for (const msg of messages) {
    if (msg.role === "system") continue; // Handled via --system-prompt
    if (msg.role === "assistant") {
      const text = typeof msg.content === "string" ? msg.content : "";
      parts.push(`[Previous response]: ${text}`);
    } else if (msg.role === "user") {
      const text = typeof msg.content === "string"
        ? msg.content
        : msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n");
      parts.push(text);
    }
  }

  return parts.join("\n\n");
}

// ---------------------------------------------------------------------------
// Stream-JSON event types from Claude Code
// ---------------------------------------------------------------------------

interface ClaudeCodeEvent {
  type: string;
  message?: {
    content?: Array<{
      type: string;
      text?: string;
      thinking?: string;
    }>;
  };
  result?: string;
  subtype?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

export class ClaudeCodeDriver implements LLMDriver {
  readonly name = "claude-code";

  async *chat(
    messages: DriverMessage[],
    config: DriverConfig,
  ): AsyncGenerator<StreamChunk> {
    const binary = getClaudeBinary();
    const prompt = buildPrompt(messages);

    const args = [
      "-p", prompt,
      "--output-format", "stream-json",
      "--verbose",
      "--dangerously-skip-permissions",
    ];

    // System prompt via flag — keeps it separate from user prompt
    if (config.system_prompt) {
      args.push("--system-prompt", config.system_prompt);
    }

    log.debug(`Claude Code: spawning "${binary}" with ${prompt.length} char prompt`);

    let proc: Subprocess;
    try {
      proc = spawn([binary, ...args], {
        stdout: "pipe",
        stderr: "pipe",
        cwd: process.env.HOME ?? "/",
        env: cleanEnv(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      yield { type: "error", content: `Failed to spawn claude: ${msg}` };
      yield { type: "done", content: "" };
      return;
    }

    // Wire abort signal to kill the subprocess
    if (config.signal) {
      const onAbort = () => { try { proc.kill(); } catch {} };
      if (config.signal.aborted) {
        onAbort();
        yield { type: "done", content: "" };
        return;
      }
      config.signal.addEventListener("abort", onAbort, { once: true });
    }

    const stdout = proc.stdout as ReadableStream<Uint8Array> | null;
    if (!stdout || typeof stdout === "number") {
      yield { type: "error", content: "Claude Code process has no stdout" };
      yield { type: "done", content: "" };
      return;
    }

    const reader = stdout.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let yieldedText = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          let event: ClaudeCodeEvent;
          try {
            event = JSON.parse(trimmed);
          } catch {
            continue;
          }

          switch (event.type) {
            case "assistant": {
              const blocks = event.message?.content;
              if (!blocks) break;
              for (const block of blocks) {
                if (block.type === "text" && block.text) {
                  yield { type: "text", content: block.text };
                  yieldedText = true;
                } else if (block.type === "thinking" && block.thinking) {
                  yield { type: "thinking", content: block.thinking };
                }
              }
              break;
            }

            case "result": {
              if (event.result && !yieldedText) {
                yield { type: "text", content: event.result };
              }
              yield { type: "done", content: "" };
              return;
            }

            case "error": {
              yield {
                type: "error",
                content: event.error ?? "Unknown Claude Code error",
              };
              break;
            }

            // tool_use, tool_result, system — handled internally by Claude Code
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      yield { type: "error", content: `Claude Code stream error: ${msg}` };
    } finally {
      reader.releaseLock();
    }

    // Check exit code for diagnostics
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      let stderrText = "";
      try {
        const stderrStream = proc.stderr as ReadableStream<Uint8Array> | null;
        if (stderrStream && typeof stderrStream !== "number") {
          const errReader = stderrStream.getReader();
          const errDecoder = new TextDecoder();
          while (true) {
            const { done, value } = await errReader.read();
            if (done) break;
            stderrText += errDecoder.decode(value, { stream: true });
          }
          errReader.releaseLock();
        }
      } catch {
        // Best-effort stderr read
      }

      if (stderrText.trim()) {
        log.warn(`Claude Code exited ${exitCode}: ${stderrText.trim()}`);
      }

      if (!yieldedText) {
        yield {
          type: "error",
          content: `Claude Code exited with code ${exitCode}${stderrText.trim() ? `: ${stderrText.trim()}` : ""}`,
        };
      }
    }

    yield { type: "done", content: "" };
  }
}
