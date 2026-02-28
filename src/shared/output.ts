// Layer 0 — JSON/text/logfmt output helpers. Zero internal imports (types are compile-only).

import type { JerikoResult, OutputFormat } from "./types.js";
import { ExitCode } from "./types.js";

/**
 * Numeric exit code constants — runtime equivalent of ExitCode enum.
 * Prefer these over bare numbers so every exit is self-documenting.
 */
export const EXIT = {
  OK:        0 as const,
  GENERAL:   1 as const,
  NETWORK:   2 as const,
  AUTH:      3 as const,
  NOT_FOUND: 5 as const,
  TIMEOUT:   7 as const,
} satisfies Record<string, number>;

// ---------------------------------------------------------------------------
// Output format state — set by the dispatcher before any command runs.
// ---------------------------------------------------------------------------

let _format: OutputFormat = "json";

/**
 * Set the global output format. Called once by the dispatcher after
 * parsing --format. Commands never need to call this.
 */
export function setOutputFormat(format: OutputFormat): void {
  _format = format;
}

/** Read the current output format (for commands that need conditional logic). */
export function getOutputFormat(): OutputFormat {
  return _format;
}

// ---------------------------------------------------------------------------
// Serialization — JSON / text / logfmt
// ---------------------------------------------------------------------------

/**
 * Flatten a nested object into dot-separated key paths.
 *
 * @example
 *   flatten({ cpu: { model: "M1", cores: 8 } })
 *   // → [["cpu.model", "M1"], ["cpu.cores", 8]]
 */
function flatten(
  obj: unknown,
  prefix = "",
  out: Array<[string, string | number | boolean]> = [],
): Array<[string, string | number | boolean]> {
  if (obj === null || obj === undefined) return out;

  if (Array.isArray(obj)) {
    if (obj.length === 0) {
      out.push([prefix, "[]"]);
    } else {
      for (let i = 0; i < obj.length; i++) {
        flatten(obj[i], prefix ? `${prefix}.${i}` : String(i), out);
      }
    }
    return out;
  }

  if (typeof obj === "object") {
    for (const [key, value] of Object.entries(obj)) {
      flatten(value, prefix ? `${prefix}.${key}` : key, out);
    }
    return out;
  }

  // Primitive
  out.push([prefix, obj as string | number | boolean]);
  return out;
}

/** Format a value for logfmt: quote strings that contain spaces. */
function logfmtValue(v: string | number | boolean): string {
  const s = String(v);
  if (typeof v === "string" && (s.includes(" ") || s.includes('"') || s.includes("="))) {
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return s;
}

/**
 * Serialize a result envelope in the currently active output format.
 */
function serialize<T>(result: JerikoResult<T>): string {
  switch (_format) {
    case "json":
      return JSON.stringify(result);

    case "text": {
      if (!result.ok) return `Error: ${result.error}`;
      const pairs = flatten(result.data);
      if (pairs.length === 0) return "OK";
      return pairs.map(([k, v]) => `${k}: ${v}`).join("\n");
    }

    case "logfmt": {
      const parts: string[] = [`ok=${result.ok}`];
      if (!result.ok) {
        parts.push(`error=${logfmtValue(result.error)}`);
        parts.push(`code=${result.code}`);
      } else {
        for (const [k, v] of flatten(result.data)) {
          parts.push(`${k}=${logfmtValue(v)}`);
        }
      }
      return parts.join(" ");
    }
  }
}

// ---------------------------------------------------------------------------
// Public API — ok / fail / envelope builders
// ---------------------------------------------------------------------------

/**
 * Print a success result to stdout and exit 0.
 *
 * @example
 *   ok({ files: ["a.txt", "b.txt"] });
 *   // --format json:   {"ok":true,"data":{"files":["a.txt","b.txt"]}}
 *   // --format text:   files.0: a.txt\nfiles.1: b.txt
 *   // --format logfmt: ok=true files.0=a.txt files.1=b.txt
 */
export function ok<T>(data: T): never {
  const result: JerikoResult<T> = { ok: true, data };
  process.stdout.write(serialize(result) + "\n");
  return process.exit(ExitCode.OK) as never;
}

/**
 * Print a failure result to stdout and exit with the given code.
 *
 * @param error  Human-readable error description
 * @param code   Semantic exit code (default: GENERAL=1)
 */
export function fail(error: string, code: ExitCode | number = ExitCode.GENERAL): never {
  const result: JerikoResult<never> = { ok: false, error, code };
  process.stdout.write(serialize(result) + "\n");
  return process.exit(code) as never;
}

/**
 * Build a success envelope without printing or exiting.
 * Useful when you need the object but don't want side effects.
 */
export function okResult<T>(data: T): JerikoResult<T> {
  return { ok: true, data };
}

/**
 * Build a failure envelope without printing or exiting.
 */
export function failResult(error: string, code: number = ExitCode.GENERAL): JerikoResult<never> {
  return { ok: false, error, code };
}
