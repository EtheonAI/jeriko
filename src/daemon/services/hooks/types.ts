// Hook subsystem types.
//
// Hooks are user-defined commands that run at well-known agent-lifecycle
// points. Each hook shell-outs to an external process, feeds it a JSON
// payload on stdin, and reads a JSON response on stdout. The response is
// a discriminated union — `allow`, `block`, `modify`, or `prompt` — that
// the agent loop acts on deterministically.
//
// This module owns ONLY the vocabulary. Execution lives in `runner.ts`,
// config loading in `config.ts`, matching in `matcher.ts`.

export type HookEventName =
  | "pre_tool_use"
  | "post_tool_use"
  | "session_start"
  | "session_end"
  | "pre_compact"
  | "post_compact";

export interface PreToolUsePayload {
  event: "pre_tool_use";
  sessionId: string;
  toolName: string;
  toolCallId: string;
  arguments: Record<string, unknown>;
}

export interface PostToolUsePayload {
  event: "post_tool_use";
  sessionId: string;
  toolName: string;
  toolCallId: string;
  arguments: Record<string, unknown>;
  result: string;
  isError: boolean;
  durationMs: number;
}

export interface SessionLifecyclePayload {
  event: "session_start" | "session_end";
  sessionId: string;
  model: string;
  backend: string;
}

export interface CompactionLifecyclePayload {
  event: "pre_compact" | "post_compact";
  sessionId: string;
  messageCount: number;
  tokenEstimate: number;
}

export type HookPayload =
  | PreToolUsePayload
  | PostToolUsePayload
  | SessionLifecyclePayload
  | CompactionLifecyclePayload;

/** The hook chose to let execution continue unchanged. */
export interface HookAllow {
  decision: "allow";
}

/** The hook wants to replace the tool arguments (pre_tool_use only). */
export interface HookModify {
  decision: "modify";
  /** New tool arguments — must satisfy the tool's schema; the agent re-runs validation. */
  arguments: Record<string, unknown>;
  /** Optional human-readable reason surfaced in logs. */
  reason?: string;
}

/** The hook wants the tool call (or session step) blocked. */
export interface HookBlock {
  decision: "block";
  /** Returned to the model as if the tool itself had rejected. */
  message: string;
}

/** The hook wants the user to be asked a yes/no question before proceeding. */
export interface HookPrompt {
  decision: "prompt";
  question: string;
  /** `approve` text substituted for the tool result on yes. */
  approveMessage?: string;
  /** `deny` text substituted for the tool result on no. */
  denyMessage?: string;
}

export type HookDecision = HookAllow | HookModify | HookBlock | HookPrompt;

/** A matcher specification — runs a hook when ALL criteria match. */
export interface HookMatcher {
  /** Exact tool-name match. Omitted → any tool. */
  tool?: string;
  /**
   * Regex against the serialized arguments string. Useful to gate on
   * content (e.g. block `bash` calls that contain `rm -rf`).
   */
  argumentsPattern?: string;
}

/** One hook entry as it appears on disk. */
export interface HookConfigEntry {
  event: HookEventName;
  /** Shell command to execute. Payload is written to stdin as JSON. */
  command: string;
  /** Optional matcher narrowing when the hook fires. */
  matcher?: HookMatcher;
  /** Maximum milliseconds the hook may run before being killed. Default 5000. */
  timeoutMs?: number;
  /** Forwarded env vars for the child. */
  env?: Record<string, string>;
}

/** The full on-disk config. */
export interface HookConfigFile {
  hooks?: HookConfigEntry[];
}
