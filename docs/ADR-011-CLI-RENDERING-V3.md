# ADR-011 — CLI Rendering v3: Syntax Registry + Markdown Cache

Status: **Accepted — shipped**
Date: 2026-04-23
Author: Jeriko core
Depends on: ADR-006..010 (UI v2, Theme v2, Keybindings, Wizard Unification, Rendering v2)

## Context

Before this subsystem the CLI's markdown + syntax renderer lived in two
pure-function modules under `src/cli/lib/`:

- `lib/syntax.ts` — 273 lines, 6 languages (JS/TS, Python, Bash, JSON,
  SQL, Go). All rules inline as a single `LANGUAGE_MAP` record; no
  extension point.
- `lib/markdown.ts` — 385 lines, re-parsed on every call (no cache),
  hardcoded `PALETTE.*` reads.

Three structural problems:

1. **Non-extensible.** Adding a new language meant editing the giant
   map, touching the central file. No unit of work was a new file.
2. **Re-parse per render.** Every `<Markdown>` render re-tokenized. For
   long assistant messages during streaming, the same block is parsed
   dozens of times.
3. **Stale colors possible on theme switch.** The renderer reads
   `PALETTE` at call time, but if a memoized consumer doesn't re-render
   on theme change, its captured output still contains the old hex codes.
   With Subsystem 5's memoization boundaries, this was an inevitable bug.

## Decision

Introduce `src/cli/rendering/` as the canonical home for syntax +
markdown rendering. Retire `src/cli/lib/syntax.ts` and `src/cli/lib/
markdown.ts` in one atomic commit — no shim.

### Directory layout

```
src/cli/rendering/
  index.ts                     Public barrel
  syntax/
    index.ts
    types.ts                   Language, LanguageRule, TokenKind, MatchedSpan
    registry.ts                registerLanguage, getLanguage, supportedLanguages, listLanguages
    render.ts                  extractSpans, highlightCode (TokenKind → theme color)
    languages/
      javascript.ts            JS + TS + JSX + TSX
      python.ts
      bash.ts
      json.ts
      sql.ts
      go.ts
      rust.ts                  (new) Rust + rs alias
      ruby.ts                  (new) Ruby + rb alias
      yaml.ts                  (new) YAML + yml alias
      toml.ts                  (new)
      html.ts                  (new) HTML + xml alias
      css.ts                   (new) CSS + scss/less aliases
  markdown/
    index.ts
    types.ts                   MarkdownBlock, TableAlignment
    hash.ts                    FNV-1a 32-bit hash for cache keys
    cache.ts                   MarkdownCache (LRU) + makeCacheKey + sharedMarkdownCache
    render.ts                  renderMarkdown — theme-cache-aware
```

### Syntax registry

- **One file per language.** Each preset is a typed `Language` value
  with `id`, `displayName`, `aliases`, and an ordered rule list.
- **Compile-time completeness.** `TokenKind` is a closed literal union
  of 10 kinds; `render.ts` has an exhaustive switch mapping kinds to
  palette slots — adding a kind is a compile-time error elsewhere until
  wired up.
- **Extension point.** `registerLanguage(lang)` returns an unregister
  handle; duplicate id or alias throws `DuplicateLanguageError`. Plugins
  can register custom languages at runtime.
- **12 languages shipped** (6 existing + 6 new). Adding language #13 is
  a two-line change: one preset file + one registration import.

### Markdown cache

- **FNV-1a 32-bit hash** as the fast identity function for input text.
  Not cryptographic — just an inexpensive, deterministic stand-in so
  cache keys stay short. Collision space for the inputs we care about
  (one markdown turn) is astronomically wide.
- **Key format**: `${themeId}:${fnv1a(text)}`. Theme id prefixes the key,
  so `setTheme()` is transparent cache invalidation — the next render
  under the new theme is a cache miss, refetches fresh colors.
- **LRU with 500-entry default capacity.** `Map`-based, O(1) get/set via
  delete-and-reinsert to bump recency. Evicts the oldest entry when
  over capacity.
- **Module-level `sharedMarkdownCache` singleton.** Tests use their own
  `MarkdownCache` instances against `makeCacheKey` to verify LRU
  behaviour without polluting the shared state.

### `renderMarkdown` theme reactivity

```ts
export function renderMarkdown(text: string): string {
  if (text.length === 0) return "";
  const themeId = getActiveTheme();              // pulled live from theme.ts
  const key = makeCacheKey(themeId, text);
  const cached = sharedMarkdownCache.get(key);
  if (cached !== undefined) return cached;
  // …parse, render, cache…
}
```

The cache key rides on the active theme id, so:
- Same text, same theme → cache hit.
- Same text, different theme → cache miss → fresh render with the new
  palette → new entry stored alongside the old one.
- No manual invalidation required when `setTheme` fires.

### Public surface preserved

`rendering/index.ts` re-exports `renderMarkdown`, `highlightCode`, and
`supportedLanguages` — every public function callers used from
`lib/markdown` and `lib/syntax` is still available, just at a cleaner
import path. The one consuming file (`components/Markdown.tsx`) was
updated to import from the new barrel; the two old lib files were
deleted.

## Tests

`test/unit/cli/rendering/` — seven files, 157 tests, 305 assertions:

- `markdown.test.ts` (migrated, import path updated) — full existing
  markdown coverage against the new path.
- `syntax.test.ts` (migrated, import path updated) — full existing
  syntax coverage.
- `hash.test.ts` — `fnv1a` determinism, collision-sanity,
  case-sensitivity, empty-input offset basis.
- `cache.test.ts` — LRU basic ops, eviction, `get` bumps recency,
  `has` does not, `makeCacheKey` scoping by theme id.
- `registry.test.ts` — every built-in id + alias resolves, uppercase
  lookup, unique language count (12), `registerLanguage` success +
  duplicate errors, unregister cleanup.
- `languages.test.ts` — for each of the 6 new languages: stripped ANSI
  equals input, highlighting emits ANSI, at least one canonical token
  lands in the expected `TokenKind`. Plus a direct theme-reactivity
  check on `highlightCode` across two themes.
- `render-integration.test.ts` — second render of same text hits cache
  (`size` doesn't grow); theme switch produces distinct cache entries
  AND different rendered frames (uses inline code ` ` ` ... ` ` ` as the
  color-bearing token so the assertion is meaningful).

Plus `test/audit/ink-chat-audit.test.ts` updated for Subsystem 4/5
covenant (phase union without `"setup"`, `computeContextBar` returning
`tone` not `color`, `getAgentTypeColor` returning semantic tones).

## Tests green

`bun test test/unit/` — **3,029 tests across 140 files, 0 fail.**
Typecheck clean. Zero regressions.

The `test/audit/` tier has 14 pre-existing failures in non-UX areas
(compaction threshold for the parallel runtime agent's work, newly-added
migration counts, OAuth provider flows, billing webhook, connector
metadata, install script). Those are owned by other in-flight work,
not by this subsystem — I fixed every audit assertion that was
Subsystem 6's (or retroactively Subsystem 4/5's) responsibility.

## Out of scope (deferred to a later pass)

- **Streaming markdown tokenizer.** Render partial bold/italic/code
  while the text is still arriving. Needs a stateful parser the cache
  can't memoize against — out of scope for a coherent atomic subsystem.
- **`<CodeBlock>` composite on Subsystem 1 primitives.** A theme-aware
  Ink component built on `Pane` + `CodeBadge` that wraps a highlighted
  code block with a language label and optional line numbers. Small but
  a different review surface.
- **Width-aware cache key.** For responsive layouts (line-wrapping at
  the terminal width), the rendered output depends on width too. Today
  we assume width is constant within a render cycle, which is correct
  for our current components but would bite once we start wrapping.
- **Non-React chalk consumers.** `format.ts` and channel renderers still
  read `PALETTE` via the mutable singleton in `theme.ts`. A follow-on
  pass will migrate them to the theme context, retiring the singleton
  entirely.

## Consequences

Positive

- **Adding a language is a one-file change.** Write `languages/foo.ts`,
  add one import + one array entry in `syntax/registry.ts`, done.
- **Typed `TokenKind` + exhaustive switch** catches new-kind additions
  at compile time — no silent fallbacks.
- **Repeat renders are O(1).** Long assistant messages re-rendered
  during streaming hit the cache instead of re-parsing.
- **Theme reactivity is automatic.** Cache entries are implicitly
  scoped by theme id; no manual invalidation path to maintain.
- **12 languages (up from 6).** Adds Rust, Ruby, YAML, TOML, HTML, CSS.
- **LRU eviction bounds memory.** 500 entries × ~2KB average = ~1MB
  worst case. Negligible.

Negative / costs

- FNV-1a is not cryptographic; adversarial collisions are trivial to
  construct. We're not defending against adversarial inputs — this is
  a render cache, not a signing mechanism — but the choice is
  documented here for anyone auditing.
- The `sharedMarkdownCache` is a module-level singleton. A future
  multi-tenant (multi-theme-per-process) use case would need an
  instance-per-context pattern, not a singleton. Not a concern for a
  single-user CLI today.

## References

- `src/cli/rendering/` — subsystem source.
- `test/unit/cli/rendering/` — subsystem tests.
- `src/cli/components/Markdown.tsx` — updated import path.
- ADR-007 — theme context whose id drives the cache key.
- ADR-010 — component-migration rendering pass.
- https://en.wikipedia.org/wiki/Fowler%E2%80%93Noll%E2%80%93Vo_hash_function
