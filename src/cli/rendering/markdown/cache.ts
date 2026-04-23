/**
 * Markdown LRU cache.
 *
 * Caches rendered ANSI output keyed by `(themeId, fnv1a(text))`. Scoped
 * to a single theme per entry, so a `setTheme()` call doesn't stale-bind —
 * the next render under the new theme is a cache miss and freshly colored.
 *
 * Implementation: a Map-based LRU. `Map` preserves insertion order; we
 * bump an entry to "most recent" by deleting and re-setting it. Capacity
 * is small enough (500 entries) that the extra delete+set is negligible.
 *
 * The cache is a module-level singleton — one per process is correct since
 * theme state + markdown inputs are both global. Instance-per-consumer is
 * not useful here.
 */

import { fnv1a } from "./hash.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default maximum entries retained. Tuned empirically for Claude Code-scale sessions. */
export const DEFAULT_CAPACITY = 500;

// ---------------------------------------------------------------------------
// Key
// ---------------------------------------------------------------------------

/**
 * Build a cache key from theme id + text. Theme id prefixes the key so
 * every entry is implicitly scoped — no manual invalidation needed on
 * theme change.
 */
export function makeCacheKey(themeId: string, text: string): string {
  return `${themeId}:${fnv1a(text)}`;
}

// ---------------------------------------------------------------------------
// LRU
// ---------------------------------------------------------------------------

export class MarkdownCache {
  private readonly store = new Map<string, string>();
  constructor(public readonly capacity: number = DEFAULT_CAPACITY) {}

  /** Retrieve + mark as recently used. */
  get(key: string): string | undefined {
    const value = this.store.get(key);
    if (value === undefined) return undefined;
    this.store.delete(key);
    this.store.set(key, value);
    return value;
  }

  /** Insert; evict the oldest entry if we're over capacity. */
  set(key: string, value: string): void {
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.capacity) {
      // Evict oldest — Map's first entry is insertion-oldest.
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, value);
  }

  /** Drop every entry. Used by tests and by manual invalidation paths. */
  clear(): void {
    this.store.clear();
  }

  /** Current number of entries. */
  get size(): number {
    return this.store.size;
  }

  /** Membership test that does NOT update recency. */
  has(key: string): boolean {
    return this.store.has(key);
  }
}

// ---------------------------------------------------------------------------
// Shared singleton
// ---------------------------------------------------------------------------

/**
 * The process-wide markdown cache. Tests can instantiate their own
 * `MarkdownCache` against `makeCacheKey` to verify LRU behaviour without
 * polluting this singleton.
 */
export const sharedMarkdownCache = new MarkdownCache();
