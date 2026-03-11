// Build-time version — injected via `define` in scripts/build.ts.
//
// At compile time, Bun's `define` replaces __BAKED_VERSION__ with the
// version string from package.json. At dev time (no bundler), the global
// is undefined and we fall back to reading package.json from disk.
//
// This is the single source of truth for the app version. All code that
// needs the version should import from this module.

declare const __BAKED_VERSION__: string | undefined;

/** App version — baked at build time, read from package.json in dev. */
export const VERSION: string = (() => {
  // Compiled binary: define replaced __BAKED_VERSION__ with a string literal
  if (typeof __BAKED_VERSION__ !== "undefined") return __BAKED_VERSION__;

  // Dev mode: read from package.json
  try {
    const { join } = require("node:path");
    const { readFileSync } = require("node:fs");
    const pkgPath = join(import.meta.dirname, "../../package.json");
    return JSON.parse(readFileSync(pkgPath, "utf-8")).version as string;
  } catch {
    return "0.0.0-dev";
  }
})();
