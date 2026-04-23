/**
 * Syntax registry — language lookup + extension point.
 *
 * Built-in languages self-register at module load; callers add custom ones
 * with `registerLanguage()`. Aliases share rule sets via lookup — adding
 * a new alias is a trivial edit to the language file, not a registry change.
 *
 * Keep this module free of React / Ink / chalk imports — it's pure data
 * plus string keys. Rendering (ANSI coloring) happens in render.ts; the
 * registry only resolves id → Language.
 */

import type { Language } from "./types.js";

import { javascript }  from "./languages/javascript.js";
import { python }      from "./languages/python.js";
import { bash }        from "./languages/bash.js";
import { json }        from "./languages/json.js";
import { sql }         from "./languages/sql.js";
import { go }          from "./languages/go.js";
import { rust }        from "./languages/rust.js";
import { ruby }        from "./languages/ruby.js";
import { yaml }        from "./languages/yaml.js";
import { toml }        from "./languages/toml.js";
import { html }        from "./languages/html.js";
import { css }         from "./languages/css.js";

// ---------------------------------------------------------------------------
// Built-in languages
// ---------------------------------------------------------------------------

/**
 * Canonical list of built-in languages. New preset files are added here as
 * imports + one entry — that's the entire extension surface.
 */
const BUILTINS: readonly Language[] = [
  javascript, python, bash, json, sql, go,
  rust, ruby, yaml, toml, html, css,
];

// ---------------------------------------------------------------------------
// Registry (id-or-alias → Language)
// ---------------------------------------------------------------------------

const registry: Map<string, Language> = new Map();

function indexLanguage(lang: Language): void {
  registry.set(lang.id.toLowerCase(), lang);
  for (const alias of lang.aliases) {
    registry.set(alias.toLowerCase(), lang);
  }
}

for (const lang of BUILTINS) indexLanguage(lang);

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class DuplicateLanguageError extends Error {
  public readonly key: string;
  constructor(key: string) {
    super(`Language or alias "${key}" is already registered`);
    this.name = "DuplicateLanguageError";
    this.key = key;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve a language by id or alias. Lookup is case-insensitive.
 * Returns undefined for unknown identifiers — callers decide whether to
 * fall back to a plain renderer.
 */
export function getLanguage(idOrAlias: string): Language | undefined {
  return registry.get(idOrAlias.toLowerCase());
}

/**
 * Every id + alias currently resolvable. Stable-ordered (insertion order)
 * so callers get deterministic output for listing UIs.
 */
export function supportedLanguages(): string[] {
  return [...registry.keys()];
}

/**
 * Every registered Language (deduplicated — an alias doesn't produce a
 * duplicate entry). Preserves registration order.
 */
export function listLanguages(): Language[] {
  const seen = new Set<Language>();
  const out: Language[] = [];
  for (const lang of registry.values()) {
    if (seen.has(lang)) continue;
    seen.add(lang);
    out.push(lang);
  }
  return out;
}

/**
 * Register a runtime language. Throws DuplicateLanguageError on id/alias
 * collision. Returns an unregister handle for test cleanup and plugin
 * unload paths.
 */
export function registerLanguage(lang: Language): () => void {
  const keys = [lang.id.toLowerCase(), ...lang.aliases.map((a) => a.toLowerCase())];
  for (const key of keys) {
    if (registry.has(key)) throw new DuplicateLanguageError(key);
  }
  indexLanguage(lang);
  return () => {
    for (const key of keys) {
      if (registry.get(key) === lang) registry.delete(key);
    }
  };
}
