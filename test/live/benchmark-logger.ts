/**
 * Benchmark logger — writes structured test results to JSONL.
 *
 * Used by live-all-models.ts and live-multimodel-subagent.ts
 * to capture per-model, per-test benchmark data for comparison.
 *
 * Results: ~/.jeriko/data/benchmarks/<timestamp>.jsonl
 * Report:  bun run test/live/benchmark-report.ts
 */

import { mkdirSync, appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const BENCHMARK_DIR = join(process.env.HOME || homedir(), ".jeriko", "data", "benchmarks");

export interface BenchmarkEntry {
  // Identity
  timestamp: string;
  runId: string;
  testId: string;
  model: string;
  provider: string;
  family: string;

  // Capabilities (as detected)
  caps: {
    context: number;
    maxOutput: number;
    toolCall: boolean;
    reasoning: boolean;
    vision: boolean;
    structuredOutput: boolean;
  };

  // Task
  prompt: string;
  category: "basic_chat" | "tool_call" | "file_op" | "search" | "trigger" | "connector" | "orchestrator" | "webdev" | "text_only" | "vision";

  // Execution
  status: "pass" | "fail" | "skip" | "timeout";
  toolCallsAttempted: number;
  toolCallsSucceeded: number;
  toolCallsFailed: number;
  jsonRepairs: number;
  aliasResolutions: number;

  // Quality
  taskCompleted: boolean;
  usedCorrectTool: boolean;

  // Performance
  timeToFirstTokenMs: number;
  totalDurationMs: number;
  tokensIn: number;
  tokensOut: number;
  rounds: number;

  // Orchestrator
  subAgentsSpawned: number;
  maxDepth: number;

  // Errors
  errors: string[];
  guardTripped: boolean;

  // Raw response (truncated)
  response: string;
}

let currentRunId = "";
let currentFile = "";

/**
 * Start a new benchmark run. Call once before running tests.
 */
export function startBenchmarkRun(): string {
  mkdirSync(BENCHMARK_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  currentRunId = `bench-${ts}`;
  currentFile = join(BENCHMARK_DIR, `${currentRunId}.jsonl`);
  return currentRunId;
}

/**
 * Log a single benchmark entry.
 */
export function logBenchmark(entry: Partial<BenchmarkEntry> & { testId: string; model: string }): void {
  if (!currentFile) startBenchmarkRun();

  const full: BenchmarkEntry = {
    timestamp: new Date().toISOString(),
    runId: currentRunId,
    testId: entry.testId,
    model: entry.model,
    provider: entry.provider ?? "unknown",
    family: entry.family ?? "unknown",
    caps: entry.caps ?? { context: 0, maxOutput: 0, toolCall: false, reasoning: false, vision: false, structuredOutput: false },
    prompt: (entry.prompt ?? "").slice(0, 500),
    category: entry.category ?? "basic_chat",
    status: entry.status ?? "fail",
    toolCallsAttempted: entry.toolCallsAttempted ?? 0,
    toolCallsSucceeded: entry.toolCallsSucceeded ?? 0,
    toolCallsFailed: entry.toolCallsFailed ?? 0,
    jsonRepairs: entry.jsonRepairs ?? 0,
    aliasResolutions: entry.aliasResolutions ?? 0,
    taskCompleted: entry.taskCompleted ?? false,
    usedCorrectTool: entry.usedCorrectTool ?? false,
    timeToFirstTokenMs: entry.timeToFirstTokenMs ?? 0,
    totalDurationMs: entry.totalDurationMs ?? 0,
    tokensIn: entry.tokensIn ?? 0,
    tokensOut: entry.tokensOut ?? 0,
    rounds: entry.rounds ?? 0,
    subAgentsSpawned: entry.subAgentsSpawned ?? 0,
    maxDepth: entry.maxDepth ?? 0,
    errors: entry.errors ?? [],
    guardTripped: entry.guardTripped ?? false,
    response: (entry.response ?? "").slice(0, 2000),
  };

  appendFileSync(currentFile, JSON.stringify(full) + "\n");
}

/**
 * Generate a comparison report from the latest benchmark run.
 */
export function generateReport(runId?: string): string {
  if (!existsSync(BENCHMARK_DIR)) return "No benchmarks found.";

  const files = readdirSync(BENCHMARK_DIR)
    .filter(f => f.endsWith(".jsonl"))
    .sort()
    .reverse();

  if (files.length === 0) return "No benchmark files found.";

  const targetFile = runId
    ? files.find(f => f.includes(runId))
    : files[0];

  if (!targetFile) return `No benchmark file found for run ${runId}`;

  const entries: BenchmarkEntry[] = readFileSync(join(BENCHMARK_DIR, targetFile), "utf-8")
    .trim()
    .split("\n")
    .map(line => JSON.parse(line));

  // Group by model
  const byModel = new Map<string, BenchmarkEntry[]>();
  for (const e of entries) {
    const list = byModel.get(e.model) ?? [];
    list.push(e);
    byModel.set(e.model, list);
  }

  const lines: string[] = [];
  lines.push(`# Benchmark Report: ${targetFile}`);
  lines.push(`Total entries: ${entries.length} | Models: ${byModel.size}`);
  lines.push("");

  // Summary table
  lines.push("| Model | Pass | Fail | Skip | Tools | Reasoning | Vision | Avg Duration | Total Tokens |");
  lines.push("|-------|------|------|------|-------|-----------|--------|-------------|-------------|");

  for (const [model, modelEntries] of byModel) {
    const pass = modelEntries.filter(e => e.status === "pass").length;
    const fail = modelEntries.filter(e => e.status === "fail").length;
    const skip = modelEntries.filter(e => e.status === "skip" || e.status === "timeout").length;
    const caps = modelEntries[0]?.caps;
    const avgDuration = Math.round(modelEntries.reduce((s, e) => s + e.totalDurationMs, 0) / modelEntries.length);
    const totalTokens = modelEntries.reduce((s, e) => s + e.tokensIn + e.tokensOut, 0);

    lines.push(
      `| ${model} | ${pass} | ${fail} | ${skip} | ${caps?.toolCall ? "Yes" : "No"} | ${caps?.reasoning ? "Yes" : "No"} | ${caps?.vision ? "Yes" : "No"} | ${avgDuration}ms | ${totalTokens} |`
    );
  }

  lines.push("");

  // Per-test breakdown
  lines.push("## Per-Test Results");
  lines.push("");

  const testIds = [...new Set(entries.map(e => e.testId))];
  for (const testId of testIds) {
    const testEntries = entries.filter(e => e.testId === testId);
    lines.push(`### ${testId}`);
    lines.push(`| Model | Status | Duration | Tokens | Tool Calls | Errors |`);
    lines.push(`|-------|--------|----------|--------|------------|--------|`);

    for (const e of testEntries) {
      const status = e.status === "pass" ? "PASS" : e.status === "fail" ? "FAIL" : e.status.toUpperCase();
      lines.push(
        `| ${e.model} | ${status} | ${e.totalDurationMs}ms | ${e.tokensIn + e.tokensOut} | ${e.toolCallsSucceeded}/${e.toolCallsAttempted} | ${e.errors.length > 0 ? e.errors[0]?.slice(0, 60) : "-"} |`
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Get the path to the current benchmark file.
 */
export function getBenchmarkFile(): string {
  return currentFile;
}
