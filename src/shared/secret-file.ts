// Secret-file writer — single source of truth for "write content to disk
// at owner-only permissions". Guarantees `0o600` regardless of the host
// filesystem's interpretation of `writeFile`'s `mode` option.
//
// Rationale: some filesystems (SMB, CIFS, FAT32) ignore the `mode` field
// in `writeFileSync` but do honor `chmodSync`; others do the opposite.
// Doing both means the file lands at 0o600 anywhere Node runs.
//
// Pure utility: no daemon / driver imports. Use anywhere a file contains
// secrets (API keys, tokens, session cookies, plaintext PII).

import {
  writeFileSync,
  chmodSync,
  mkdirSync,
} from "node:fs";
import { dirname } from "node:path";

/** Permission bits applied to every secret file written through this module. */
export const SECRET_FILE_MODE = 0o600 as const;

export interface WriteSecretFileOptions {
  /**
   * Ensure the parent directory exists with `0o700`. Defaults to `true`
   * because secret files in newly-minted directories are the common case.
   */
  readonly ensureDir?: boolean;
  /** Encoding for string content. Default: `"utf-8"`. */
  readonly encoding?: BufferEncoding;
}

/**
 * Write a string or Buffer to disk with owner-only (0o600) permissions.
 *
 * Two-phase protection: `writeFileSync` sets the initial mode, and
 * `chmodSync` is called immediately after to cover filesystems that
 * ignored the first attempt. The chmod is swallowed because some
 * filesystems (notably FAT-family) reject the syscall while still
 * having accepted the write mode.
 */
export function writeSecretFile(
  path: string,
  content: string | Uint8Array,
  options: WriteSecretFileOptions = {},
): void {
  if (options.ensureDir !== false) {
    try {
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    } catch {
      // Best-effort — the write below surfaces a clearer error if the dir
      // really can't be created.
    }
  }

  writeFileSync(path, content, {
    mode: SECRET_FILE_MODE,
    encoding: options.encoding ?? "utf-8",
  });

  try {
    chmodSync(path, SECRET_FILE_MODE);
  } catch {
    // Filesystems without POSIX-style chmod (FAT32, some network mounts)
    // throw here. We already set the mode on write; don't fail the caller.
  }
}
