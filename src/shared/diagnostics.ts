// Diagnostics facade — single vocabulary for "what version am I running?"
// consumed by `/health`, `/status`, `--version`, telemetry, crash handlers.
//
// Rationale: today `VERSION` is imported from `version.ts` directly and
// `BUILD_REF` is an orphan export. One module centralises them alongside
// platform/runtime fingerprints so every consumer sees the same shape.
//
// Pure utility: no daemon imports. Safe to call from the CLI, the kernel,
// a worker thread, a telemetry module, anywhere.

import { BUILD_REF, VERSION } from "./version.js";
import { arch, platform, release } from "node:os";

export interface Diagnostics {
  /** App version (e.g. "2.0.0-alpha.17"). */
  readonly version: string;
  /** Short git SHA or "unknown" when unavailable (e.g. compiled without git). */
  readonly buildRef: string;
  /** Platform tuple — "darwin/arm64", "linux/x64", etc. */
  readonly platform: string;
  /** OS release string (from `os.release()`). */
  readonly osRelease: string;
  /** Node / Bun runtime string. */
  readonly runtime: string;
  /** Process uptime in milliseconds at call time. */
  readonly uptimeMs: number;
  /** Unix epoch (ms) when this value was produced. */
  readonly now: number;
}

/** Snapshot the current diagnostics — cheap; called per-request on `/health`. */
export function diagnosticsSnapshot(): Diagnostics {
  return {
    version: VERSION,
    buildRef: BUILD_REF,
    platform: `${platform()}/${arch()}`,
    osRelease: release(),
    runtime: resolveRuntimeString(),
    uptimeMs: Math.round(process.uptime() * 1000),
    now: Date.now(),
  };
}

/**
 * Render a short one-line string for humans — used by `--version` and
 * log breadcrumbs. Keeps formatting in one place so changes propagate.
 *
 *   jeriko 2.0.0-alpha.17 (build 8d4a3b2) darwin/arm64
 */
export function renderDiagnosticsLine(d: Diagnostics = diagnosticsSnapshot()): string {
  return `jeriko ${d.version} (build ${d.buildRef}) ${d.platform}`;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function resolveRuntimeString(): string {
  const bunVersion = (globalThis as { Bun?: { version?: string } }).Bun?.version;
  if (bunVersion) return `bun/${bunVersion}`;
  return `node/${process.version.replace(/^v/, "")}`;
}
