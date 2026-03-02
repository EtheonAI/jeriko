/**
 * Build script — compiles Jeriko into a standalone binary using Bun.build().
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

import { parseArgs } from "node:util";
import { execSync } from "node:child_process";
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
 * Bun build plugin that shims out dev-only dependencies with empty modules.
 *
 * Ink's reconciler dynamically imports `devtools.js` which statically imports
 * `react-devtools-core`. The dynamic import is guarded by `DEV === 'true'`,
 * but Bun's bundler still follows it and bundles the module. Marking it as
 * external breaks the compiled binary (it can't find the package on disk).
 * Instead, we replace these imports with no-op shims at bundle time.
 */
const devShimPlugin: import("bun").BunPlugin = {
  name: "dev-shim",
  setup(build) {
    // Shim react-devtools-core — default export is a no-op object
    build.onResolve({ filter: /^react-devtools-core$/ }, (args) => ({
      path: args.path,
      namespace: "dev-shim",
    }));
    build.onLoad({ filter: /.*/, namespace: "dev-shim" }, () => ({
      contents: "export default { connectToDevTools() {} };",
      loader: "js",
    }));
  },
};

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

  const result = await Bun.build({
    entrypoints: [ENTRY],
    target: "bun",
    minify: !flags["no-minify"],
    sourcemap: flags.sourcemap ? "external" : "none",
    external: STATIC_EXTERNALS,
    plugins: [devShimPlugin],
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
