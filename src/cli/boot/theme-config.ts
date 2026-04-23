/**
 * Theme preference persistence.
 *
 * The theme file is trivial — a single {"theme": "<id>"} object — but goes
 * through the same discipline the other config loaders use: zod-validated,
 * atomic write via temp-file rename, IO injectable for tests, never throws.
 */

import { readFile as fsReadFile, writeFile as fsWriteFile, rename as fsRename, mkdir as fsMkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import type { ThemeId } from "../themes/index.js";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const themeConfigSchema = z.object({
  theme: z.string().min(1).max(64),
}).strict();

export type ThemeConfig = z.infer<typeof themeConfigSchema>;

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

export type ThemeDiagnostic =
  | { kind: "missing-file";   path: string }
  | { kind: "unreadable";     path: string; reason: string }
  | { kind: "malformed-json"; path: string; reason: string }
  | { kind: "shape-error";    path: string; reason: string }
  | { kind: "write-failed";   path: string; reason: string };

export interface LoadThemeResult {
  readonly themeId: ThemeId | null;
  readonly diagnostics: readonly ThemeDiagnostic[];
}

// ---------------------------------------------------------------------------
// IO
// ---------------------------------------------------------------------------

export interface ThemeConfigIO {
  readonly readFile:  (path: string) => Promise<string>;
  readonly writeFile: (path: string, contents: string) => Promise<void>;
  readonly rename:    (from: string, to: string) => Promise<void>;
  readonly mkdir:     (path: string, opts: { recursive: true }) => Promise<void>;
}

const DEFAULT_IO: ThemeConfigIO = {
  readFile:  (p) => fsReadFile(p, "utf8"),
  writeFile: (p, c) => fsWriteFile(p, c, "utf8"),
  rename:    (from, to) => fsRename(from, to),
  mkdir:     (p, opts) => fsMkdir(p, opts).then(() => undefined),
};

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

export async function loadThemeConfig(
  path: string,
  io: Partial<ThemeConfigIO> = {},
): Promise<LoadThemeResult> {
  const read = io.readFile ?? DEFAULT_IO.readFile;
  const diagnostics: ThemeDiagnostic[] = [];

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
    return { themeId: null, diagnostics };
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    diagnostics.push({ kind: "malformed-json", path, reason: String(err) });
    return { themeId: null, diagnostics };
  }

  const parsed = themeConfigSchema.safeParse(json);
  if (!parsed.success) {
    diagnostics.push({ kind: "shape-error", path, reason: parsed.error.message });
    return { themeId: null, diagnostics };
  }

  return { themeId: parsed.data.theme, diagnostics };
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

export interface SaveThemeResult {
  readonly ok: boolean;
  readonly diagnostic?: ThemeDiagnostic;
}

export async function saveThemeConfig(
  path: string,
  themeId: ThemeId,
  io: Partial<ThemeConfigIO> = {},
): Promise<SaveThemeResult> {
  const { mkdir, writeFile, rename } = { ...DEFAULT_IO, ...io };

  const payload = JSON.stringify({ theme: themeId }, null, 2) + "\n";
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
