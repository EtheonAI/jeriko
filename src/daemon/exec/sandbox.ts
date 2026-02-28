// Sandbox enforcement — command blocklist + path validation.
//
// Path checking is delegated to security/paths.ts (single source of truth).
// This module adds command-level blocking on top.

import { isPathAllowed, isPathBlocked } from "../security/paths.js";

// Re-export path functions so the exec gateway doesn't need to import security directly
export { isPathAllowed, isPathBlocked };

// ═══════════════════════════════════════════════════════════════
// COMMAND ENFORCEMENT
// ═══════════════════════════════════════════════════════════════

/** Command patterns that are always blocked. Regex + human-readable reason. */
export const BLOCKED_COMMANDS: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  // System destruction
  { pattern: /rm\s+(-[a-zA-Z]*)?r[a-zA-Z]*f\s+\//, reason: "recursive force delete from root" },
  { pattern: /sudo\s+/, reason: "privilege escalation via sudo" },
  { pattern: /mkfs\b/, reason: "filesystem format" },
  { pattern: /dd\s+.*of=\/dev/, reason: "raw write to block device" },
  { pattern: /:\(\)\s*\{\s*:\|\s*:\s*&\s*\}/, reason: "fork bomb" },
  { pattern: /shutdown\b/, reason: "system shutdown" },
  { pattern: /reboot\b/, reason: "system reboot" },
  { pattern: /halt\b/, reason: "system halt" },
  { pattern: /init\s+0/, reason: "init runlevel 0 (shutdown)" },

  // Remote code execution
  { pattern: /curl\s.*\|\s*(?:ba)?sh/, reason: "piped remote code execution (curl|sh)" },
  { pattern: /wget\s.*\|\s*(?:ba)?sh/, reason: "piped remote code execution (wget|sh)" },

  // File/disk destruction
  { pattern: /chmod\s+777\s/, reason: "world-writable permissions" },
  { pattern: /killall\s+-9\s+/, reason: "force kill all matching processes" },
  { pattern: /rm\s+(-[a-zA-Z]*)?r[a-zA-Z]*\s+~\/?$/, reason: "recursive delete of home directory" },
  { pattern: />\s*\/dev\/sd[a-z]/, reason: "overwrite block device" },

  // macOS-specific
  { pattern: /launchctl\s+unload/, reason: "unload system service" },
];

/** Result of checking a command against the blocklist. */
export interface CommandCheckResult {
  blocked: boolean;
  reason?: string;
}

/**
 * Check whether a command is blocked by the security policy.
 */
export function isCommandBlocked(command: string): CommandCheckResult {
  if (!command || typeof command !== "string") {
    return { blocked: true, reason: "empty or invalid command" };
  }

  for (const { pattern, reason } of BLOCKED_COMMANDS) {
    if (pattern.test(command)) {
      return { blocked: true, reason };
    }
  }

  return { blocked: false };
}

/**
 * Validate a command for both path references and command patterns.
 * Extracts file path arguments and checks them against the path allowlist.
 */
export function validateCommand(command: string): CommandCheckResult {
  const cmdCheck = isCommandBlocked(command);
  if (cmdCheck.blocked) return cmdCheck;

  // Extract and validate path arguments for file-manipulating commands
  const pathPatterns = [
    /(?:cat|less|head|tail|wc|sort|uniq)\s+([\/][^\s;|&]+)/,
    /(?:cp|mv)\s+(?:-[a-zA-Z]*\s+)?([\/][^\s;|&]+)/,
    /(?:rm)\s+(?:-[a-zA-Z]*\s+)?([\/][^\s;|&]+)/,
    /(?:chmod|chown)\s+[^\s]+\s+([\/][^\s;|&]+)/,
  ];

  for (const pattern of pathPatterns) {
    const match = command.match(pattern);
    if (match?.[1]) {
      const pathCheck = isPathBlocked(match[1]);
      if (pathCheck.blocked) {
        return { blocked: true, reason: pathCheck.reason };
      }
    }
  }

  return { blocked: false };
}
