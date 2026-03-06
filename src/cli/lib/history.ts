/**
 * InputHistory — Ring buffer for input history with deduplication and persistence.
 *
 * Used by the Input component for up/down arrow history navigation.
 * History is persisted to disk so it survives across CLI sessions.
 *
 * Behavior:
 *   - push() appends a new entry, skipping consecutive duplicates
 *   - prev()/next() navigate the history by returning an index
 *   - get() retrieves an entry by index
 *   - save()/load() persist to/from a JSON file
 *   - When navigating, the "draft" position is length (past the last entry)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_SIZE = 500;

/** Default persistence path — co-located with other CLI data. */
const DEFAULT_HISTORY_PATH = join(homedir(), ".jeriko", "data", "cli_history.json");

// ---------------------------------------------------------------------------
// Class
// ---------------------------------------------------------------------------

export class InputHistory {
  private entries: string[];
  private maxSize: number;
  private filePath: string | null;
  private dirty = false;

  constructor(opts?: { maxSize?: number; filePath?: string | null }) {
    this.entries = [];
    this.maxSize = opts?.maxSize ?? DEFAULT_MAX_SIZE;
    this.filePath = opts?.filePath !== undefined ? opts.filePath : DEFAULT_HISTORY_PATH;
  }

  /**
   * Append a new entry to the history.
   * Skips if the entry is empty or matches the most recent entry (dedup).
   * Trims the oldest entries when the buffer exceeds maxSize.
   */
  push(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;

    // Skip consecutive duplicate
    if (this.entries.length > 0 && this.entries[this.entries.length - 1] === trimmed) {
      return;
    }

    this.entries.push(trimmed);

    // Ring buffer: discard oldest if over capacity
    if (this.entries.length > this.maxSize) {
      this.entries = this.entries.slice(this.entries.length - this.maxSize);
    }

    this.dirty = true;
  }

  /**
   * Navigate to the previous (older) entry.
   * Returns the new index. At the beginning (0), stays at 0.
   *
   * @param currentIdx - Current position in history (length = draft position)
   */
  prev(currentIdx: number): number {
    if (this.entries.length === 0) return currentIdx;
    if (currentIdx <= 0) return 0;
    return currentIdx - 1;
  }

  /**
   * Navigate to the next (newer) entry.
   * Returns the new index. Past the last entry = draft position (length).
   *
   * @param currentIdx - Current position in history
   */
  next(currentIdx: number): number {
    if (currentIdx >= this.entries.length) return this.entries.length;
    return currentIdx + 1;
  }

  /**
   * Retrieve an entry by index.
   * Returns empty string for the draft position (index === length)
   * or for out-of-bounds indices.
   */
  get(index: number): string {
    if (index < 0 || index >= this.entries.length) return "";
    return this.entries[index]!;
  }

  /** Number of entries in the history. */
  get length(): number {
    return this.entries.length;
  }

  /** Check if the history is empty. */
  get isEmpty(): boolean {
    return this.entries.length === 0;
  }

  /** Get all entries (oldest first). */
  toArray(): string[] {
    return [...this.entries];
  }

  /** Clear all history entries. */
  clear(): void {
    this.entries = [];
    this.dirty = true;
  }

  // ── Persistence ──────────────────────────────────────────────────────

  /**
   * Load history from disk. Silently no-ops if file doesn't exist or is
   * malformed — the user just starts with an empty history.
   */
  load(): void {
    if (!this.filePath) return;
    try {
      if (!existsSync(this.filePath)) return;
      const raw = readFileSync(this.filePath, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // Only keep strings, trim, and enforce maxSize
        this.entries = parsed
          .filter((e): e is string => typeof e === "string")
          .map((e) => e.trim())
          .filter((e) => e.length > 0)
          .slice(-this.maxSize);
      }
    } catch {
      // Corrupt or unreadable file — start fresh
    }
    this.dirty = false;
  }

  /**
   * Save history to disk. Only writes if entries have changed since last
   * save/load. Creates parent directories if needed.
   */
  save(): void {
    if (!this.filePath || !this.dirty) return;
    try {
      const dir = dirname(this.filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(this.filePath, JSON.stringify(this.entries), "utf-8");
      this.dirty = false;
    } catch {
      // Best effort — don't crash on write failure
    }
  }
}
