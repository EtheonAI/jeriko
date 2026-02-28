// Layer 0 — Argument parser. Zero internal imports (types are compile-only).

import type { ParsedArgs } from "./types.js";

/**
 * Parse argv into flags and positional arguments.
 *
 * Supported forms:
 *   --flag value      → flags["flag"] = "value"
 *   --flag=value      → flags["flag"] = "value"
 *   --bool-flag       → flags["bool-flag"] = true
 *   --no-bool-flag    → flags["bool-flag"] = false
 *   -f value          → flags["f"] = "value"
 *   -f                → flags["f"] = true
 *   --                → everything after is positional
 *   anything else     → positional
 *
 * @param argv  Raw argument array — typically process.argv.slice(2)
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  let i = 0;
  let restPositional = false;

  while (i < argv.length) {
    const arg = argv[i]!; // Safe: i < argv.length

    // After `--`, everything is positional
    if (restPositional) {
      positional.push(arg);
      i++;
      continue;
    }

    if (arg === "--") {
      restPositional = true;
      i++;
      continue;
    }

    // --flag=value
    if (arg.startsWith("--") && arg.includes("=")) {
      const eqIdx = arg.indexOf("=");
      const key = arg.slice(2, eqIdx);
      const val = arg.slice(eqIdx + 1);
      flags[key] = val;
      i++;
      continue;
    }

    // --no-<flag> → false
    if (arg.startsWith("--no-") && arg.length > 5) {
      flags[arg.slice(5)] = false;
      i++;
      continue;
    }

    // --flag [value]
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("-")) {
        flags[key] = next;
        i += 2;
      } else {
        flags[key] = true;
        i++;
      }
      continue;
    }

    // -f [value]
    if (arg.startsWith("-") && arg.length === 2) {
      const key = arg.slice(1);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("-")) {
        flags[key] = next;
        i += 2;
      } else {
        flags[key] = true;
        i++;
      }
      continue;
    }

    // Anything else is positional
    positional.push(arg);
    i++;
  }

  return { flags, positional };
}

/**
 * Extract a required string flag, or throw.
 */
export function requireFlag(args: ParsedArgs, name: string): string {
  const val = args.flags[name];
  if (val === undefined || val === true || val === false) {
    throw new Error(`Missing required flag: --${name}`);
  }
  return val;
}

/**
 * Extract an optional string flag with a default.
 */
export function flagStr(args: ParsedArgs, name: string, defaultValue = ""): string {
  const val = args.flags[name];
  if (typeof val === "string") return val;
  return defaultValue;
}

/**
 * Check if a boolean flag is set.
 */
export function flagBool(args: ParsedArgs, name: string): boolean {
  const val = args.flags[name];
  if (val === false) return false;
  return val !== undefined;
}
