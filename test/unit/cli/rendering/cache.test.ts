/**
 * Tests for the markdown LRU cache.
 *
 * Uses a standalone MarkdownCache instance so the module-scoped shared
 * singleton is never polluted by tests.
 */

import { describe, test, expect } from "bun:test";
import {
  MarkdownCache,
  makeCacheKey,
  DEFAULT_CAPACITY,
} from "../../../../src/cli/rendering/index.js";

describe("MarkdownCache — basic operations", () => {
  test("miss on empty cache", () => {
    const cache = new MarkdownCache();
    expect(cache.get("k")).toBeUndefined();
    expect(cache.size).toBe(0);
    expect(cache.has("k")).toBe(false);
  });

  test("set + get round-trip", () => {
    const cache = new MarkdownCache();
    cache.set("k", "rendered");
    expect(cache.get("k")).toBe("rendered");
    expect(cache.size).toBe(1);
    expect(cache.has("k")).toBe(true);
  });

  test("re-setting the same key does not grow the cache", () => {
    const cache = new MarkdownCache();
    cache.set("k", "v1");
    cache.set("k", "v2");
    expect(cache.size).toBe(1);
    expect(cache.get("k")).toBe("v2");
  });

  test("clear drops every entry", () => {
    const cache = new MarkdownCache(10);
    cache.set("a", "1");
    cache.set("b", "2");
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get("a")).toBeUndefined();
  });
});

describe("MarkdownCache — LRU eviction", () => {
  test("evicts the oldest entry when capacity is exceeded", () => {
    const cache = new MarkdownCache(2);
    cache.set("a", "A");
    cache.set("b", "B");
    cache.set("c", "C"); // should evict "a"
    expect(cache.has("a")).toBe(false);
    expect(cache.has("b")).toBe(true);
    expect(cache.has("c")).toBe(true);
    expect(cache.size).toBe(2);
  });

  test("get() bumps an entry to most-recent", () => {
    const cache = new MarkdownCache(2);
    cache.set("a", "A");
    cache.set("b", "B");
    // Touch "a" — now "b" is oldest.
    cache.get("a");
    cache.set("c", "C"); // should evict "b" (not "a")
    expect(cache.has("a")).toBe(true);
    expect(cache.has("b")).toBe(false);
    expect(cache.has("c")).toBe(true);
  });

  test("has() does NOT update recency", () => {
    const cache = new MarkdownCache(2);
    cache.set("a", "A");
    cache.set("b", "B");
    cache.has("a"); // peek, must not bump.
    cache.set("c", "C"); // should still evict "a"
    expect(cache.has("a")).toBe(false);
    expect(cache.has("b")).toBe(true);
  });

  test("default capacity is the published constant", () => {
    const cache = new MarkdownCache();
    expect(cache.capacity).toBe(DEFAULT_CAPACITY);
  });
});

describe("makeCacheKey", () => {
  test("different theme ids produce different keys for the same text", () => {
    expect(makeCacheKey("jeriko", "hello")).not.toBe(makeCacheKey("jeriko-light", "hello"));
  });

  test("different texts produce different keys for the same theme", () => {
    expect(makeCacheKey("jeriko", "a")).not.toBe(makeCacheKey("jeriko", "b"));
  });

  test("same theme + same text produce the same key", () => {
    expect(makeCacheKey("jeriko", "hello")).toBe(makeCacheKey("jeriko", "hello"));
  });

  test("theme id is a visible prefix", () => {
    expect(makeCacheKey("nocturne", "x").startsWith("nocturne:")).toBe(true);
  });
});
