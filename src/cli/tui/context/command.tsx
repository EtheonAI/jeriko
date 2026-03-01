/**
 * TUI CommandProvider — Slash command parsing and dispatch.
 *
 * Intercepts messages starting with "/" and dispatches to the appropriate
 * handler. Unrecognized commands are passed through to the agent.
 */

import {
  createContext,
  useContext,
  type ParentProps,
} from "solid-js";
import { useSession } from "./session.js";
import { useRoute } from "./route.js";
import { useToast } from "./toast.js";
import { useAgent } from "./agent.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CommandHandler {
  description: string;
  execute: (args: string) => void;
}

interface CommandContextValue {
  /**
   * Try to handle a user input as a slash command.
   * Returns true if the input was a recognized command, false otherwise.
   */
  tryCommand: (input: string) => boolean;
  /** Get all available commands for help display */
  getCommands: () => ReadonlyMap<string, { description: string }>;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const CommandContext = createContext<CommandContextValue>();

export function useCommand(): CommandContextValue {
  const ctx = useContext(CommandContext);
  if (!ctx) throw new Error("useCommand() must be used within a <CommandProvider>");
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function CommandProvider(props: ParentProps) {
  const session = useSession();
  const route = useRoute();
  const toast = useToast();
  const agent = useAgent();

  // -----------------------------------------------------------------------
  // Command registry
  // -----------------------------------------------------------------------

  const commands = new Map<string, CommandHandler>();

  commands.set("/new", {
    description: "Start a new session",
    execute: () => {
      session.newSession(agent.modelName());
      route.navigate("home");
      toast.push("New session started", { variant: "success" });
    },
  });

  commands.set("/sessions", {
    description: "List recent sessions",
    execute: () => {
      session.refreshSessionList();
      const list = session.sessionList();
      if (list.length === 0) {
        toast.push("No sessions found", { variant: "info" });
        return;
      }
      const summary = list
        .slice(0, 10)
        .map((s) => {
          const current = s.id === session.currentSession()?.id ? " ←" : "";
          return `  ${s.slug}  ${s.title}${current}`;
        })
        .join("\n");
      toast.push(`Recent sessions:\n${summary}`, {
        variant: "info",
        durationMs: 8000,
      });
    },
  });

  commands.set("/resume", {
    description: "Resume a session by slug or ID",
    execute: (args: string) => {
      const target = args.trim();
      if (!target) {
        toast.push("Usage: /resume <slug-or-id>", { variant: "warning" });
        return;
      }
      const found = session.resumeSession(target);
      if (!found) {
        toast.push(`Session "${target}" not found`, { variant: "error" });
        return;
      }
      route.navigate("session");
      toast.push(`Resumed session "${target}"`, { variant: "success" });
    },
  });

  commands.set("/model", {
    description: "Switch the active model",
    execute: (args: string) => {
      const model = args.trim();
      if (!model) {
        toast.push(`Current model: ${agent.modelName()}`, { variant: "info" });
        return;
      }
      // Model switching requires config update — show feedback for now
      toast.push(`Model switching: ${model} (restart to apply)`, {
        variant: "info",
      });
    },
  });

  commands.set("/help", {
    description: "Show available commands",
    execute: () => {
      const lines = ["Commands:"];
      for (const [name, handler] of commands) {
        lines.push(`  ${name.padEnd(14)} ${handler.description}`);
      }
      lines.push("  exit           Quit");
      toast.push(lines.join("\n"), { variant: "info", durationMs: 8000 });
    },
  });

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  const tryCommand = (input: string): boolean => {
    const trimmed = input.trim();

    // Exit commands
    if (trimmed === "exit" || trimmed === "quit" || trimmed === ".exit") {
      process.exit(0);
    }

    // Must start with /
    if (!trimmed.startsWith("/")) return false;

    // Extract command name and args
    const spaceIdx = trimmed.indexOf(" ");
    const commandName = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
    const args = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1);

    const handler = commands.get(commandName);
    if (!handler) return false;

    handler.execute(args);
    return true;
  };

  const getCommands = (): ReadonlyMap<string, { description: string }> => {
    const result = new Map<string, { description: string }>();
    for (const [name, handler] of commands) {
      result.set(name, { description: handler.description });
    }
    return result;
  };

  return (
    <CommandContext.Provider value={{ tryCommand, getCommands }}>
      {props.children}
    </CommandContext.Provider>
  );
}
