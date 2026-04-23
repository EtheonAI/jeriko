/**
 * Keybinding Subsystem — user config loader + merge.
 *
 * Pipeline:
 *   1. Read file (if present). Missing file → empty overrides, no error.
 *   2. Parse JSON. Malformed JSON → diagnostic, empty overrides.
 *   3. Validate with Zod. Shape errors → diagnostic, empty overrides.
 *   4. For each override, parse the chord. Per-entry parse failures are
 *      diagnosed but do NOT invalidate the whole config.
 *   5. Merge into defaults by id. Unknown ids → diagnostic, dropped.
 *
 * Every error path yields a non-fatal `ConfigDiagnostic` the caller can
 * surface in the UI or a log line. The subsystem never throws on user
 * error — bad config falls back to defaults.
 */

import { readFile } from "node:fs/promises";
import type { ZodError } from "zod";
import type { BindingSpec } from "./types.js";
import { parseChord, ChordParseError } from "./matcher.js";
import { DEFAULT_BINDINGS, DEFAULT_BINDINGS_BY_ID } from "./defaults.js";
import { userConfigSchema } from "./schema.js";

// ---------------------------------------------------------------------------
// Diagnostic — a structured, non-fatal user-config issue
// ---------------------------------------------------------------------------

export type ConfigDiagnostic =
  | { kind: "missing-file";      path: string }
  | { kind: "unreadable";        path: string; reason: string }
  | { kind: "malformed-json";    path: string; reason: string }
  | { kind: "shape-error";       path: string; zodError: ZodError }
  | { kind: "unknown-binding";   path: string; id: string }
  | { kind: "invalid-chord";     path: string; id: string; chord: string; reason: string };

export interface LoadResult {
  readonly bindings: readonly BindingSpec[];
  readonly diagnostics: readonly ConfigDiagnostic[];
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export interface LoaderOptions {
  /** Inject an alternate reader for tests. Default uses node:fs/promises. */
  readonly readFile?: (path: string) => Promise<string>;
}

/**
 * Load keybindings: defaults + user overrides from `path`. The resolved list
 * always contains every default id; any user overrides replace the chord
 * field only (description and scope are stable source-of-truth).
 */
export async function loadKeybindings(
  path: string,
  opts: LoaderOptions = {},
): Promise<LoadResult> {
  const reader = opts.readFile ?? ((p) => readFile(p, "utf8"));
  const diagnostics: ConfigDiagnostic[] = [];

  // 1. Read
  let raw: string;
  try {
    raw = await reader(path);
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr?.code === "ENOENT") {
      diagnostics.push({ kind: "missing-file", path });
    } else {
      diagnostics.push({ kind: "unreadable", path, reason: String(err) });
    }
    return { bindings: DEFAULT_BINDINGS, diagnostics };
  }

  // 2. Parse JSON
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    diagnostics.push({ kind: "malformed-json", path, reason: String(err) });
    return { bindings: DEFAULT_BINDINGS, diagnostics };
  }

  // 3. Validate shape
  const parsed = userConfigSchema.safeParse(json);
  if (!parsed.success) {
    diagnostics.push({ kind: "shape-error", path, zodError: parsed.error });
    return { bindings: DEFAULT_BINDINGS, diagnostics };
  }

  // 4. Apply overrides entry by entry.
  const out = new Map<string, BindingSpec>(
    DEFAULT_BINDINGS.map((b) => [b.id, b]),
  );

  for (const [id, chordString] of Object.entries(parsed.data.bindings)) {
    const base = DEFAULT_BINDINGS_BY_ID.get(id);
    if (base === undefined) {
      diagnostics.push({ kind: "unknown-binding", path, id });
      continue;
    }
    try {
      const chord = parseChord(chordString);
      out.set(id, { ...base, chord });
    } catch (err) {
      const reason = err instanceof ChordParseError ? err.message : String(err);
      diagnostics.push({ kind: "invalid-chord", path, id, chord: chordString, reason });
    }
  }

  return { bindings: [...out.values()], diagnostics };
}
