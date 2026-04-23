/**
 * OSC 11 — query terminal background color.
 *
 * Sends `ESC ] 11 ; ? ESC \` on the output stream and parses the terminal's
 * reply (`ESC ] 11 ; rgb:RRRR/GGGG/BBBB ESC \`) from the input stream within
 * a timeout. Returns normalized RGB in [0,1] or null if anything went wrong.
 *
 * This is intentionally best-effort:
 *   - Any terminal that ignores the query (SSH without a real TTY, some
 *     TUIs that rebind stdin, Windows Terminal older than certain builds)
 *     yields null. Callers fall through to $COLORFGBG and then defaults.
 *   - The stdin/stdout streams are touched minimally: raw mode is saved
 *     and restored regardless of outcome so the REPL input path is never
 *     left in a corrupted state.
 */

export interface OSC11Result {
  readonly r: number; // [0, 1]
  readonly g: number; // [0, 1]
  readonly b: number; // [0, 1]
}

// ---------------------------------------------------------------------------
// Wire format
// ---------------------------------------------------------------------------

const OSC11_QUERY = "\x1b]11;?\x1b\\";

/**
 * Parse an OSC 11 reply payload. The full wire reply is:
 *   ESC ] 11 ; rgb:RRRR/GGGG/BBBB ESC \
 *
 * Some terminals terminate with BEL (\x07) instead of ESC \. Some return
 * 2-digit or 4-digit hex per channel. This parser accepts all combinations.
 */
export function parseOSC11(buffer: string): OSC11Result | null {
  // Match `rgb:<hex>/<hex>/<hex>` anywhere in the payload.
  const match = buffer.match(/rgb:([0-9a-fA-F]+)\/([0-9a-fA-F]+)\/([0-9a-fA-F]+)/);
  if (!match) return null;
  const [, rHex, gHex, bHex] = match;
  if (rHex === undefined || gHex === undefined || bHex === undefined) return null;

  const r = normalizeHexChannel(rHex);
  const g = normalizeHexChannel(gHex);
  const b = normalizeHexChannel(bHex);
  if (r === null || g === null || b === null) return null;
  return { r, g, b };
}

function normalizeHexChannel(hex: string): number | null {
  if (hex.length === 0 || hex.length > 8) return null;
  const max = (1 << (hex.length * 4)) - 1;
  const value = parseInt(hex, 16);
  if (!Number.isFinite(value)) return null;
  return value / max;
}

// ---------------------------------------------------------------------------
// Streams abstraction (testable)
// ---------------------------------------------------------------------------

/**
 * Minimal stream surface we depend on. Node's process.stdin / process.stdout
 * satisfy this shape at runtime; tests supply a fake.
 */
export interface TerminalIO {
  write(data: string): void;
  on(event: "data", listener: (chunk: Buffer | string) => void): void;
  off(event: "data", listener: (chunk: Buffer | string) => void): void;
  setRawMode?(raw: boolean): unknown;
  isTTY?: boolean;
}

/** Result envelope — success or a classified failure reason. */
export type QueryOutcome =
  | { ok: true; value: OSC11Result }
  | { ok: false; reason: "no-tty" | "timeout" | "unparseable" };

export interface QueryOptions {
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 150;

/**
 * Send the OSC 11 query and resolve with the parsed background, or a
 * classified failure. Never throws.
 */
export function queryBackgroundColor(
  input: TerminalIO,
  output: TerminalIO,
  opts: QueryOptions = {},
): Promise<QueryOutcome> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise<QueryOutcome>((resolve) => {
    // No TTY — the query would never get a response.
    if (input.isTTY === false || output.isTTY === false) {
      resolve({ ok: false, reason: "no-tty" });
      return;
    }

    let buffer = "";
    let settled = false;
    const prevRaw = tryGetRaw(input);

    const cleanup = (): void => {
      input.off("data", onData);
      if (timer !== null) clearTimeout(timer);
      tryRestoreRaw(input, prevRaw);
    };

    const finish = (outcome: QueryOutcome): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(outcome);
    };

    const onData = (chunk: Buffer | string): void => {
      buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
      const parsed = parseOSC11(buffer);
      if (parsed !== null) finish({ ok: true, value: parsed });
    };

    tryEnableRaw(input);
    input.on("data", onData);
    const timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      finish({ ok: false, reason: buffer.length === 0 ? "timeout" : "unparseable" });
    }, timeoutMs);
    // Do not keep the process alive just for this query.
    const unrefable = timer as unknown as { unref?: () => void };
    if (typeof unrefable.unref === "function") unrefable.unref();

    try {
      output.write(OSC11_QUERY);
    } catch {
      finish({ ok: false, reason: "no-tty" });
    }
  });
}

// ---------------------------------------------------------------------------
// Raw-mode safety helpers
// ---------------------------------------------------------------------------

function tryGetRaw(io: TerminalIO): boolean | null {
  const anyio = io as unknown as { isRaw?: boolean };
  return typeof anyio.isRaw === "boolean" ? anyio.isRaw : null;
}

function tryEnableRaw(io: TerminalIO): void {
  if (typeof io.setRawMode === "function") {
    try { io.setRawMode(true); } catch { /* ignore */ }
  }
}

function tryRestoreRaw(io: TerminalIO, prev: boolean | null): void {
  if (typeof io.setRawMode === "function" && prev !== null) {
    try { io.setRawMode(prev); } catch { /* ignore */ }
  }
}
