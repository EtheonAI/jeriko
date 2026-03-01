/**
 * Build script — compiles Jeriko into a standalone binary using Bun.build().
 *
 * Uses the solidPlugin from @opentui/solid to transform JSX/TSX files
 * at build time (the CLI `bun build --compile` doesn't support plugins).
 *
 * Usage:
 *   bun run scripts/build.ts                      # default: current platform
 *   bun run scripts/build.ts --target darwin-arm64 # cross-compile
 *   bun run scripts/build.ts --all                 # all platforms
 *
 * Flags:
 *   --target <platform>   One of: darwin-arm64, darwin-x64, linux-arm64, linux-x64,
 *                         linux-arm64-musl, linux-x64-musl, windows-x64, windows-arm64
 *   --all                 Build for all platforms (outputs to dist/)
 *   --no-minify           Disable minification (for debugging)
 *   --sourcemap           Include external sourcemaps
 */

import solidPlugin from "@opentui/solid/bun-plugin";
import { parseArgs } from "node:util";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// CLI flag parsing
// ---------------------------------------------------------------------------

const { values: flags } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    target:    { type: "string" },
    all:       { type: "boolean", default: false },
    "no-minify": { type: "boolean", default: false },
    sourcemap: { type: "boolean", default: false },
  },
  strict: false,
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROOT = path.resolve(import.meta.dirname, "..");
const ENTRY = path.join(ROOT, "src/index.ts");
const DIST = path.join(ROOT, "dist");

/** Packages that are always external (optional deps, never bundled). */
const STATIC_EXTERNALS = [
  "qrcode-terminal",
  "link-preview-js",
  "jimp",
  "sharp",
  "playwright-core",
  "electron",
];

/**
 * @opentui/core loads a platform-specific native dylib at runtime via:
 *   `await import(\`@opentui/core-${process.platform}-${process.arch}/index.ts\`)`
 *
 * The platform module does: `import("./libopentui.dylib", { with: { type: "file" } })`
 * which Bun compile embeds as a file asset, extracted to disk at runtime.
 * @opentui/core already handles bunfs paths (isBunfsPath + normalizeBunfsPath).
 *
 * Strategy: for each build target, bundle the MATCHING native module (so the
 * dylib is embedded in the binary) and externalize all OTHER platform modules
 * (they'd never load on the wrong platform anyway).
 *
 * Map: Bun target → @opentui native package name.
 * Note: Bun uses "windows", Node/opentui uses "win32". Musl variants share
 * the same native module as their non-musl counterpart.
 */
const OPENTUI_NATIVE_MODULES: ReadonlyMap<string, string> = new Map([
  ["darwin-x64",      "@opentui/core-darwin-x64"],
  ["darwin-arm64",    "@opentui/core-darwin-arm64"],
  ["linux-x64",       "@opentui/core-linux-x64"],
  ["linux-x64-musl",  "@opentui/core-linux-x64"],
  ["linux-arm64",     "@opentui/core-linux-arm64"],
  ["linux-arm64-musl","@opentui/core-linux-arm64"],
  ["windows-x64",     "@opentui/core-win32-x64"],
  ["windows-arm64",   "@opentui/core-win32-arm64"],
]);

/** All distinct @opentui native package names (for the externals list). */
const ALL_OPENTUI_NATIVES = [...new Set(OPENTUI_NATIVE_MODULES.values())];

/**
 * Compute externals for a specific build target.
 *
 * The target platform's native module is bundled (embedded) if it's installed
 * locally — this allows the compiled binary to run standalone. All other
 * platform modules are externalized so the bundler doesn't choke on them.
 */
function getExternalsForTarget(target: BunTarget): string[] {
  const platform = target.replace("bun-", "");
  const matchingModule = OPENTUI_NATIVE_MODULES.get(platform);
  const moduleInstalled = matchingModule
    && existsSync(path.join(ROOT, "node_modules", matchingModule));

  const externals = [...STATIC_EXTERNALS];

  for (const nativeModule of ALL_OPENTUI_NATIVES) {
    // Bundle the matching module if it's installed; externalize everything else
    if (nativeModule === matchingModule && moduleInstalled) continue;
    externals.push(nativeModule);
  }

  return externals;
}

/** All supported cross-compilation targets. */
const ALL_TARGETS = [
  "bun-darwin-arm64",
  "bun-darwin-x64",
  "bun-linux-arm64",
  "bun-linux-x64",
  "bun-linux-arm64-musl",
  "bun-linux-x64-musl",
  "bun-windows-x64",
  "bun-windows-arm64",
] as const;

type BunTarget = (typeof ALL_TARGETS)[number];

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

interface BuildTarget {
  target: BunTarget;
  outfile: string;
}

function resolveTargets(): BuildTarget[] {
  if (flags.all) {
    return ALL_TARGETS.map((target) => ({
      target,
      outfile: path.join(
        DIST,
        `jeriko-${target.replace("bun-", "")}${target.includes("windows") ? ".exe" : ""}`,
      ),
    }));
  }

  if (flags.target) {
    const prefixed = flags.target.startsWith("bun-")
      ? flags.target
      : `bun-${flags.target}`;

    if (!ALL_TARGETS.includes(prefixed as BunTarget)) {
      console.error(
        `Unknown target: ${flags.target}\nValid targets: ${ALL_TARGETS.map((t) => t.replace("bun-", "")).join(", ")}`,
      );
      process.exit(1);
    }

    return [
      {
        target: prefixed as BunTarget,
        outfile: path.join(
          DIST,
          `jeriko-${prefixed.replace("bun-", "")}${prefixed.includes("windows") ? ".exe" : ""}`,
        ),
      },
    ];
  }

  // Default: current platform, output to project root
  return [
    {
      target: `bun-${process.platform === "win32" ? "windows" : process.platform}-${process.arch}` as BunTarget,
      outfile: path.join(ROOT, "jeriko"),
    },
  ];
}

async function buildOne(bt: BuildTarget): Promise<void> {
  const start = performance.now();
  const externals = getExternalsForTarget(bt.target);

  const result = await Bun.build({
    entrypoints: [ENTRY],
    target: "bun",
    conditions: ["browser"],
    plugins: [solidPlugin],
    minify: !flags["no-minify"],
    sourcemap: flags.sourcemap ? "external" : "none",
    external: externals,
    compile: {
      target: bt.target,
      outfile: bt.outfile,
      autoloadBunfig: false,
      autoloadDotenv: false,
      autoloadTsconfig: true,
      autoloadPackageJson: true,
    },
  });

  if (!result.success) {
    console.error(`Build failed for ${bt.target}:`);
    for (const log of result.logs) {
      console.error(`  ${log}`);
    }
    process.exit(1);
  }

  // On macOS, bun --compile inherits a hardened runtime signature that
  // becomes invalid after the binary is modified. Re-sign with ad-hoc to
  // prevent the kernel from killing it on launch.
  if (bt.target.includes("darwin")) {
    try {
      execSync(`codesign --force --sign - ${bt.outfile}`, { stdio: "pipe" });
    } catch {
      // Non-fatal: codesign may not exist on cross-compile hosts
    }
  }

  const elapsed = ((performance.now() - start) / 1000).toFixed(1);
  const stat = Bun.file(bt.outfile);
  const sizeMB = ((await stat.size) / 1024 / 1024).toFixed(1);
  console.log(`  ${bt.target} → ${bt.outfile} (${sizeMB} MB, ${elapsed}s)`);
}

async function main(): Promise<void> {
  const targets = resolveTargets();
  console.log(`Building Jeriko (${targets.length} target${targets.length > 1 ? "s" : ""})...\n`);

  for (const bt of targets) {
    await buildOne(bt);
  }

  console.log("\nDone.");
}

await main();
