/**
 * Permission Subsystem — persistent config loader + saver.
 *
 * Reads and writes `~/.config/jeriko/permissions.json`. Pure diagnostic-
 * rich design: every error path yields a structured `ConfigDiagnostic`
 * alongside a best-effort rule list — the subsystem never throws on bad
 * user config.
 *
 * Save is atomic via a temporary-file rename. The `writeFile` /
 * `mkdir` / `rename` / `readFile` dependencies are injectable so tests
 * don't touch the real filesystem.
 */

import { readFile as fsReadFile, writeFile as fsWriteFile, rename as fsRename, mkdir as fsMkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { ZodError } from "zod";
import type { PermissionRule } from "./types.js";
import { permissionConfigSchema } from "./schema.js";

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

export type ConfigDiagnostic =
  | { kind: "missing-file";   path: string }
  | { kind: "unreadable";     path: string; reason: string }
  | { kind: "malformed-json"; path: string; reason: string }
  | { kind: "shape-error";    path: string; zodError: ZodError }
  | { kind: "write-failed";   path: string; reason: string };

export interface LoadResult {
  readonly rules: readonly PermissionRule[];
  readonly diagnostics: readonly ConfigDiagnostic[];
}

// ---------------------------------------------------------------------------
// Injection points for tests
// ---------------------------------------------------------------------------

export interface LoaderIO {
  readonly readFile: (path: string) => Promise<string>;
  readonly writeFile: (path: string, contents: string) => Promise<void>;
  readonly rename: (from: string, to: string) => Promise<void>;
  readonly mkdir: (path: string, opts: { recursive: true }) => Promise<void>;
}

const DEFAULT_IO: LoaderIO = {
  readFile: (p) => fsReadFile(p, "utf8"),
  writeFile: (p, c) => fsWriteFile(p, c, "utf8"),
  rename: (from, to) => fsRename(from, to),
  mkdir: (p, opts) => fsMkdir(p, opts).then(() => undefined),
};

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

/**
 * Load persistent permission rules from `path`. Missing file is not an
 * error — returns an empty rule list + a `missing-file` diagnostic so
 * callers can surface it if they want.
 */
export async function loadPermissions(
  path: string,
  io: Partial<LoaderIO> = {},
): Promise<LoadResult> {
  const read = io.readFile ?? DEFAULT_IO.readFile;
  const diagnostics: ConfigDiagnostic[] = [];

  let raw: string;
  try {
    raw = await read(path);
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr?.code === "ENOENT") {
      diagnostics.push({ kind: "missing-file", path });
    } else {
      diagnostics.push({ kind: "unreadable", path, reason: String(err) });
    }
    return { rules: [], diagnostics };
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    diagnostics.push({ kind: "malformed-json", path, reason: String(err) });
    return { rules: [], diagnostics };
  }

  const parsed = permissionConfigSchema.safeParse(json);
  if (!parsed.success) {
    diagnostics.push({ kind: "shape-error", path, zodError: parsed.error });
    return { rules: [], diagnostics };
  }

  const rules: PermissionRule[] = parsed.data.rules.map((rule) => ({
    kind: rule.kind,
    target: rule.target,
    decision: rule.decision,
    origin: "persistent",
  }));

  return { rules, diagnostics };
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

export interface SaveResult {
  readonly ok: boolean;
  readonly diagnostic?: ConfigDiagnostic;
}

/**
 * Persist rules atomically via temp-file rename. Returns a structured
 * result; never throws on IO errors.
 */
export async function savePermissions(
  path: string,
  rules: readonly PermissionRule[],
  io: Partial<LoaderIO> = {},
): Promise<SaveResult> {
  const { mkdir, writeFile, rename } = { ...DEFAULT_IO, ...io };

  const persistedRules = rules
    .filter((r) => r.origin === "persistent")
    .map((r) => ({ kind: r.kind, target: r.target, decision: r.decision }));

  const payload = JSON.stringify({ rules: persistedRules }, null, 2) + "\n";
  const tempPath = `${path}.tmp`;

  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(tempPath, payload);
    await rename(tempPath, path);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      diagnostic: { kind: "write-failed", path, reason: String(err) },
    };
  }
}
