import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool, flagStr } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import { escapeShellArg } from "../../../shared/escape.js";
import { execSync } from "node:child_process";

export const command: CommandHandler = {
  name: "parallel",
  description: "Run multiple AI tasks concurrently",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko parallel --tasks <json_array>");
      console.log("       jeriko parallel <task1> -- <task2> -- <task3>");
      console.log("\nRun multiple tasks concurrently using the daemon's parallel execution engine.");
      console.log("\nFlags:");
      console.log("  --tasks <json>       JSON array of task descriptions");
      console.log("  --max-workers <n>    Max concurrent workers (default: 4)");
      console.log("  --timeout <ms>       Per-task timeout (default: 60000)");
      console.log("  --tool-access        Give sub-agents tool access (slower, more capable)");
      process.exit(0);
    }

    const tasksJson = flagStr(parsed, "tasks", "");
    const maxWorkers = parseInt(flagStr(parsed, "max-workers", "4"), 10);
    const timeout = parseInt(flagStr(parsed, "timeout", "60000"), 10);

    let tasks: string[];

    if (tasksJson) {
      try {
        tasks = JSON.parse(tasksJson);
        if (!Array.isArray(tasks)) fail("--tasks must be a JSON array of strings");
      } catch {
        fail("Invalid JSON in --tasks flag");
      }
    } else if (parsed.positional.length > 0) {
      // Split positional args by "--" separator
      tasks = [];
      let current: string[] = [];
      for (const arg of parsed.positional) {
        if (arg === "--") {
          if (current.length > 0) tasks.push(current.join(" "));
          current = [];
        } else {
          current.push(arg);
        }
      }
      if (current.length > 0) tasks.push(current.join(" "));
    } else {
      fail("No tasks specified. Use --tasks <json> or provide tasks separated by --");
    }

    if (tasks.length === 0) fail("No tasks to execute");

    // Execute tasks concurrently in waves
    const results: Array<{ task: string; status: string; output?: string; error?: string }> = [];
    const waves = [];
    for (let i = 0; i < tasks.length; i += maxWorkers) {
      waves.push(tasks.slice(i, i + maxWorkers));
    }

    for (const wave of waves) {
      const waveResults = await Promise.allSettled(
        wave.map(async (task) => {
          try {
            const output = execSync(`jeriko ask ${escapeShellArg(task)}`, {
              encoding: "utf-8",
              timeout,
            });
            return { task, status: "success", output: output.trim() };
          } catch (err: unknown) {
            const e = err as { stderr?: string; message?: string };
            return { task, status: "error", error: e.stderr || e.message || "unknown error" };
          }
        }),
      );

      for (const result of waveResults) {
        if (result.status === "fulfilled") {
          results.push(result.value);
        } else {
          results.push({ task: "unknown", status: "error", error: String(result.reason) });
        }
      }
    }

    const succeeded = results.filter((r) => r.status === "success").length;
    ok({ total: tasks.length, succeeded, failed: tasks.length - succeeded, results });
  },
};
