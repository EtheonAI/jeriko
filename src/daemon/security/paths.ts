// Layer 0 — Path sandbox.

import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

const IS_DARWIN = process.platform === "darwin";
const IS_LINUX  = process.platform === "linux";

// ---------------------------------------------------------------------------
// Allowed root directories
// ---------------------------------------------------------------------------

export const ALLOWED_ROOTS: string[] = [
  os.homedir(),
  "/tmp",
  "/private/tmp",   // macOS: /tmp is a symlink to /private/tmp
  "/var/tmp",
  "/private/var/tmp",
];

// ---------------------------------------------------------------------------
// Blocked absolute paths
// ---------------------------------------------------------------------------

const COMMON_BLOCKED: string[] = [
  "/etc",
  "/usr/bin",
  "/usr/sbin",
];

const DARWIN_BLOCKED: string[] = [
  "/System",
  "/Library",
];

const LINUX_BLOCKED: string[] = [
  "/boot",
  "/proc",
  "/sys",
];

export const BLOCKED_PATHS: string[] = [
  ...COMMON_BLOCKED,
  ...(IS_DARWIN ? DARWIN_BLOCKED : []),
  ...(IS_LINUX  ? LINUX_BLOCKED  : []),
];

// ---------------------------------------------------------------------------
// Blocked path segments (anywhere in the resolved path)
// ---------------------------------------------------------------------------

export const BLOCKED_SEGMENTS: string[] = [
  "node_modules/.cache",
  ".git/objects",
  ".git/hooks",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve and canonicalize a file path.
 * Uses realpath when the path exists, otherwise falls back to path.resolve.
 */
function canonicalize(filePath: string): string {
  try {
    return fs.realpathSync(filePath);
  } catch {
    // Path doesn't exist yet (e.g. a write target) — resolve without symlinks
    return path.resolve(filePath);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether a file path is within an allowed root directory.
 * Resolves symlinks to prevent escape via symlink.
 */
export function isPathAllowed(filePath: string): boolean {
  const resolved = canonicalize(filePath);

  // Must be under at least one allowed root
  const underAllowed = ALLOWED_ROOTS.some(
    (root) => resolved === root || resolved.startsWith(root + path.sep),
  );
  if (!underAllowed) return false;

  // Must not be under a blocked absolute path
  const underBlocked = BLOCKED_PATHS.some(
    (blocked) => resolved === blocked || resolved.startsWith(blocked + path.sep),
  );
  if (underBlocked) return false;

  // Must not contain a blocked segment
  const hasBlockedSegment = BLOCKED_SEGMENTS.some((seg) => resolved.includes(seg));
  if (hasBlockedSegment) return false;

  return true;
}

/**
 * Check whether a file path is blocked, with a reason string.
 */
export function isPathBlocked(filePath: string): { blocked: boolean; reason?: string } {
  const resolved = canonicalize(filePath);

  // Check blocked absolute paths
  for (const blocked of BLOCKED_PATHS) {
    if (resolved === blocked || resolved.startsWith(blocked + path.sep)) {
      return { blocked: true, reason: `Path is under blocked directory: ${blocked}` };
    }
  }

  // Check blocked segments
  for (const seg of BLOCKED_SEGMENTS) {
    if (resolved.includes(seg)) {
      return { blocked: true, reason: `Path contains blocked segment: ${seg}` };
    }
  }

  // Check if outside all allowed roots
  const underAllowed = ALLOWED_ROOTS.some(
    (root) => resolved === root || resolved.startsWith(root + path.sep),
  );
  if (!underAllowed) {
    return { blocked: true, reason: `Path is outside all allowed roots: ${ALLOWED_ROOTS.join(", ")}` };
  }

  return { blocked: false };
}
