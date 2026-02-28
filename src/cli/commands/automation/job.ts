import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool, flagStr } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";

const JOBS_DIR = join(homedir(), ".jeriko", "data", "jobs");

interface JobDef {
  id: string;
  name: string;
  schedule: string;
  command: string;
  enabled: boolean;
  created_at: string;
  last_run?: string;
  last_status?: "success" | "error";
  last_output?: string;
  run_count: number;
}

export const command: CommandHandler = {
  name: "job",
  description: "Background job scheduler",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko job <action> [options]");
      console.log("\nActions:");
      console.log("  list              List scheduled jobs");
      console.log("  add <name>        Add a new scheduled job");
      console.log("  remove <id>       Remove a job");
      console.log("  enable <id>       Enable a job");
      console.log("  disable <id>      Disable a job");
      console.log("  history <id>      Show job run history");
      console.log("  run <id>          Run a job immediately");
      console.log("\nFlags:");
      console.log("  --schedule <cron> Cron expression (e.g., '0 */6 * * *')");
      console.log("  --command <cmd>   Shell command to execute");
      console.log("  --limit <n>       Max history entries (default: 20)");
      process.exit(0);
    }

    if (!existsSync(JOBS_DIR)) {
      mkdirSync(JOBS_DIR, { recursive: true });
    }

    const action = parsed.positional[0] ?? "list";

    switch (action) {
      case "list": {
        const jobs = loadAllJobs();
        ok({
          jobs: jobs.map((j) => ({
            id: j.id,
            name: j.name,
            schedule: j.schedule,
            enabled: j.enabled,
            last_run: j.last_run,
            last_status: j.last_status,
            run_count: j.run_count,
          })),
          count: jobs.length,
        });
        break;
      }
      case "add": {
        const name = parsed.positional[1];
        if (!name) fail("Missing job name. Usage: jeriko job add <name> --schedule <cron> --command <cmd>");
        const schedule = flagStr(parsed, "schedule", "");
        const cmd = flagStr(parsed, "command", "");
        if (!schedule) fail("Missing --schedule flag. Example: --schedule '0 9 * * *'");
        if (!cmd) fail("Missing --command flag");

        const job: JobDef = {
          id: randomUUID().slice(0, 8),
          name,
          schedule,
          command: cmd,
          enabled: true,
          created_at: new Date().toISOString(),
          run_count: 0,
        };

        saveJob(job);
        ok({ added: true, job });
        break;
      }
      case "remove": {
        const id = parsed.positional[1];
        if (!id) fail("Missing job ID");
        const path = join(JOBS_DIR, `${id}.json`);
        if (!existsSync(path)) fail(`Job not found: "${id}"`, 5);
        unlinkSync(path);
        ok({ removed: true, id });
        break;
      }
      case "enable": {
        const id = parsed.positional[1];
        if (!id) fail("Missing job ID");
        const job = loadJob(id);
        if (!job) fail(`Job not found: "${id}"`, 5);
        job.enabled = true;
        saveJob(job);
        ok({ enabled: true, id });
        break;
      }
      case "disable": {
        const id = parsed.positional[1];
        if (!id) fail("Missing job ID");
        const job = loadJob(id);
        if (!job) fail(`Job not found: "${id}"`, 5);
        job.enabled = false;
        saveJob(job);
        ok({ disabled: true, id });
        break;
      }
      case "history": {
        const id = parsed.positional[1];
        if (!id) fail("Missing job ID");
        const job = loadJob(id);
        if (!job) fail(`Job not found: "${id}"`, 5);
        ok({
          id,
          name: job.name,
          run_count: job.run_count,
          last_run: job.last_run,
          last_status: job.last_status,
          last_output: job.last_output,
        });
        break;
      }
      case "run": {
        const id = parsed.positional[1];
        if (!id) fail("Missing job ID");
        const job = loadJob(id);
        if (!job) fail(`Job not found: "${id}"`, 5);

        const { execSync } = await import("node:child_process");
        try {
          const output = execSync(job.command, { encoding: "utf-8", timeout: 120000 });
          job.last_run = new Date().toISOString();
          job.last_status = "success";
          job.last_output = output.trim().slice(0, 1000);
          job.run_count++;
          saveJob(job);
          ok({ ran: true, id, status: "success", output: output.trim() });
        } catch (err: unknown) {
          const e = err as { stderr?: string; message?: string };
          job.last_run = new Date().toISOString();
          job.last_status = "error";
          job.last_output = (e.stderr || e.message || "unknown").slice(0, 1000);
          job.run_count++;
          saveJob(job);
          fail(`Job execution failed: ${e.stderr || e.message || "unknown"}`);
        }
        break;
      }
      default:
        fail(`Unknown action: "${action}". Use list, add, remove, enable, disable, history, or run.`);
    }
  },
};

function loadAllJobs(): JobDef[] {
  if (!existsSync(JOBS_DIR)) return [];
  const files = readdirSync(JOBS_DIR).filter((f) => f.endsWith(".json"));
  return files.map((f) => JSON.parse(readFileSync(join(JOBS_DIR, f), "utf-8")) as JobDef);
}

function loadJob(id: string): JobDef | null {
  const path = join(JOBS_DIR, `${id}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8")) as JobDef;
}

function saveJob(job: JobDef): void {
  writeFileSync(join(JOBS_DIR, `${job.id}.json`), JSON.stringify(job, null, 2) + "\n");
}
