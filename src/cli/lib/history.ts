/**
 * InputHistory — Ring buffer for input history with deduplication.
 *
 * Pure class — no React, no state, no side effects.
 * Used by the Input component for up/down arrow history navigation.
 *
 * Behavior:
 *   - push() appends a new entry, skipping consecutive duplicates
 *   - prev()/next() navigate the history by returning an index
 *   - get() retrieves an entry by index
 *   - When navigating, the "draft" position is length (past the last entry)
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_SIZE = 200;

// ---------------------------------------------------------------------------
// Class
// ---------------------------------------------------------------------------

export class InputHistory {
  private entries: string[];
  private maxSize: number;

  constructor(maxSize: number = DEFAULT_MAX_SIZE) {
    this.entries = [];
    this.maxSize = maxSize;
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
  }
}
