/**
 * `jeriko update` — Self-update to the latest (or specified) version.
 *
 * Flow:
 *   1. Detect current version and platform
 *   2. Resolve target version (CDN → GitHub API fallback)
 *   3. Compare versions — exit early if already up-to-date
 *   4. Download binary + manifest from CDN/GitHub
 *   5. Verify SHA-256 checksum against manifest
 *   6. Install to versioned directory, repoint symlink
 *   7. Download and install updated agent system prompt
 *   8. Verify the new binary runs
 *   9. Print success with upgrade summary
 *
 * Mirrors install.sh logic but runs inside the binary — no shell script needed.
 * Inspired by `claude update` (Claude Code) and `bun upgrade` (Bun).
 */

import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool, flagStr } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  chmodSync,
  unlinkSync,
  symlinkSync,
  copyFileSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { homedir, platform, arch as osArch } from "node:os";
import { execSync } from "node:child_process";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GITHUB_REPO = "etheonai/jeriko";
const CDN_URL = process.env.JERIKO_CDN_URL ?? "https://releases.jeriko.ai";
const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

const HOME = homedir();
const VERSIONS_DIR = join(HOME, ".local", "share", "jeriko", "versions");
const INSTALL_DIR = join(HOME, ".local", "bin");
const CONFIG_DIR = join(process.env.XDG_CONFIG_HOME ?? join(HOME, ".config"), "jeriko");
const DOWNLOAD_DIR = join(HOME, ".jeriko", "downloads");
const IS_WINDOWS = platform() === "win32";
const BINARY_NAME = IS_WINDOWS ? "jeriko.exe" : "jeriko";

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

function detectPlatform(): string {
  const os = platform();
  const arch = osArch();

  let platformOs: string;
  switch (os) {
    case "darwin": platformOs = "darwin"; break;
    case "linux":  platformOs = "linux"; break;
    case "win32":  platformOs = "windows"; break;
    default: throw new Error(`Unsupported OS: ${os}`);
  }

  let platformArch: string;
  switch (arch) {
    case "x64":   platformArch = "x64"; break;
    case "arm64": platformArch = "arm64"; break;
    case "arm":   throw new Error(`32-bit ARM is not supported. Jeriko requires a 64-bit system (x64 or arm64).`);
    default:      throw new Error(`Unsupported architecture: ${arch}. Jeriko supports x64 and arm64.`);
  }

  // Detect musl on Linux
  if (platformOs === "linux") {
    try {
      const lddOutput = execSync("ldd /bin/ls 2>&1", { encoding: "utf-8", timeout: 5000 });
      if (lddOutput.includes("musl")) {
        return `linux-${platformArch}-musl`;
      }
    } catch { /* ignore — assume glibc */ }

    // Check for musl library files directly
    if (existsSync("/lib/libc.musl-x86_64.so.1") || existsSync("/lib/libc.musl-aarch64.so.1")) {
      return `linux-${platformArch}-musl`;
    }
  }

  return `${platformOs}-${platformArch}`;
}

// ---------------------------------------------------------------------------
// Version detection
// ---------------------------------------------------------------------------

function getCurrentVersion(): string {
  try {
    const output = execSync(`"${process.execPath}" --version`, {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
    const match = output.match(/(\d+\.\d+\.\d+(-[^\s]+)?)/);
    if (match?.[1]) return match[1];
  } catch { /* ignore */ }
  return "unknown";
}

// ---------------------------------------------------------------------------
// Download helpers
// ---------------------------------------------------------------------------

/** Fetch text content from a URL. Returns null on failure. */
async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: { "User-Agent": "jeriko-update" },
    });
    if (!res.ok) return null;
    return (await res.text()).trim();
  } catch {
    return null;
  }
}

/** Fetch JSON from a URL. Returns null on failure. */
async function fetchJson(url: string): Promise<unknown> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: { "User-Agent": "jeriko-update", Accept: "application/json" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Download a binary file to disk. Returns true on success. */
async function downloadFile(url: string, outputPath: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(120000),
      headers: { "User-Agent": "jeriko-update" },
    });
    if (!res.ok || !res.body) return false;

    const buffer = await res.arrayBuffer();
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, Buffer.from(buffer));
    return true;
  } catch {
    return false;
  }
}

/**
 * Download a release asset — tries CDN first, then direct GitHub release URL.
 */
async function downloadAsset(version: string, assetName: string, outputPath: string): Promise<boolean> {
  // Try CDN
  const cdnUrl = `${CDN_URL}/releases/${version}/${assetName}`;
  if (await downloadFile(cdnUrl, outputPath)) return true;

  // Try GitHub release (with v prefix)
  const ghUrl = `https://github.com/${GITHUB_REPO}/releases/download/v${version}/${assetName}`;
  if (await downloadFile(ghUrl, outputPath)) return true;

  // Try GitHub release (without v prefix)
  const ghUrl2 = `https://github.com/${GITHUB_REPO}/releases/download/${version}/${assetName}`;
  if (await downloadFile(ghUrl2, outputPath)) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Version resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the latest version — CDN `latest` file, then GitHub API fallback.
 */
async function resolveLatestVersion(): Promise<string | null> {
  // Try CDN latest pointer
  const cdnVersion = await fetchText(`${CDN_URL}/releases/latest`);
  if (cdnVersion && /^\d+\.\d+\.\d+/.test(cdnVersion)) return cdnVersion;

  // Fallback to GitHub API
  const release = await fetchJson(GITHUB_API) as { tag_name?: string } | null;
  if (release?.tag_name) {
    return release.tag_name.replace(/^v/, "");
  }

  return null;
}

// ---------------------------------------------------------------------------
// Checksum verification
// ---------------------------------------------------------------------------

async function computeSha256(filePath: string): Promise<string> {
  const file = Bun.file(filePath);
  const buffer = await file.arrayBuffer();
  const hash = new Bun.CryptoHasher("sha256");
  hash.update(buffer);
  return hash.digest("hex");
}

function extractChecksum(manifestJson: string, platformKey: string): string | null {
  try {
    const manifest = JSON.parse(manifestJson);
    const checksum = manifest?.platforms?.[platformKey]?.checksum;
    if (typeof checksum === "string" && /^[a-f0-9]{64}$/.test(checksum)) {
      return checksum;
    }
  } catch { /* ignore parse errors */ }
  return null;
}

// ---------------------------------------------------------------------------
// Installation
// ---------------------------------------------------------------------------

function installVersioned(binaryPath: string, version: string): string {
  const versionDir = join(VERSIONS_DIR, version);
  const versionedBinary = join(versionDir, BINARY_NAME);
  const installTarget = join(INSTALL_DIR, BINARY_NAME);

  mkdirSync(versionDir, { recursive: true });
  copyFileSync(binaryPath, versionedBinary);

  if (!IS_WINDOWS) {
    chmodSync(versionedBinary, 0o755);
  }

  mkdirSync(INSTALL_DIR, { recursive: true });

  if (IS_WINDOWS) {
    copyFileSync(versionedBinary, installTarget);
  } else {
    try { unlinkSync(installTarget); } catch { /* doesn't exist yet */ }
    symlinkSync(versionedBinary, installTarget);
  }

  return versionedBinary;
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export const command: CommandHandler = {
  name: "update",
  description: "Update Jeriko to the latest version",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko update [VERSION] [options]");
      console.log("\nUpdate Jeriko to the latest or specified version.");
      console.log("\nArguments:");
      console.log("  VERSION             Target version (default: latest)");
      console.log("\nFlags:");
      console.log("  --check             Check for updates without installing");
      console.log("  --force             Force reinstall even if same version");
      console.log("  --channel <name>    Release channel (latest|stable)");
      console.log("  --help              Show this help");
      process.exit(0);
    }

    const checkOnly = flagBool(parsed, "check");
    const force = flagBool(parsed, "force");
    const channel = flagStr(parsed, "channel", "latest");
    const targetArg = parsed.positional[0];

    // 1. Current version
    const currentVersion = getCurrentVersion();
    const currentPlatform = detectPlatform();

    console.log(`\x1b[34m→\x1b[0m Current version: ${currentVersion}`);
    console.log(`\x1b[34m→\x1b[0m Platform: ${currentPlatform}`);

    // 2. Resolve target version
    let targetVersion: string;

    if (targetArg && /^\d+\.\d+\.\d+(-[^\s]+)?$/.test(targetArg)) {
      targetVersion = targetArg;
    } else {
      console.log(`\x1b[34m→\x1b[0m Checking for updates...`);

      // Try channel-specific resolution
      if (channel === "stable") {
        const stableVersion = await fetchText(`${CDN_URL}/releases/stable`);
        if (stableVersion && /^\d+\.\d+\.\d+/.test(stableVersion)) {
          targetVersion = stableVersion;
        } else {
          const latest = await resolveLatestVersion();
          if (!latest) {
            fail("Could not determine latest version. Check your network connection.", 2);
            return;
          }
          targetVersion = latest;
        }
      } else {
        const latest = await resolveLatestVersion();
        if (!latest) {
          fail("Could not determine latest version. Check your network connection.", 2);
          return;
        }
        targetVersion = latest;
      }
    }

    console.log(`\x1b[34m→\x1b[0m Latest version: ${targetVersion}`);

    // 3. Compare versions
    if (currentVersion === targetVersion && !force) {
      ok({ status: "up_to_date", version: currentVersion });
      console.log(`\x1b[32m✓\x1b[0m Already up-to-date (${currentVersion})`);
      return;
    }

    if (checkOnly) {
      ok({
        status: "update_available",
        current: currentVersion,
        latest: targetVersion,
      });
      console.log(`\x1b[33m!\x1b[0m Update available: ${currentVersion} → ${targetVersion}`);
      console.log(`  Run 'jeriko update' to install`);
      return;
    }

    console.log(`\x1b[34m→\x1b[0m Upgrading ${currentVersion} → ${targetVersion}`);

    // 4. Download binary
    mkdirSync(DOWNLOAD_DIR, { recursive: true });
    const binaryAsset = `jeriko-${currentPlatform}`;
    const binaryPath = join(DOWNLOAD_DIR, `jeriko-${targetVersion}-${currentPlatform}`);

    console.log(`\x1b[34m→\x1b[0m Downloading ${binaryAsset}...`);
    if (!await downloadAsset(targetVersion, binaryAsset, binaryPath)) {
      fail(`Download failed for ${binaryAsset}. Check: https://github.com/${GITHUB_REPO}/releases`, 2);
      return;
    }

    // 5. Download manifest and verify checksum
    const manifestPath = join(DOWNLOAD_DIR, `manifest-${targetVersion}.json`);
    console.log(`\x1b[34m→\x1b[0m Verifying checksum...`);

    if (!await downloadAsset(targetVersion, "manifest.json", manifestPath)) {
      // Cleanup
      try { unlinkSync(binaryPath); } catch { /* ignore */ }
      fail("No manifest found — cannot verify binary integrity", 2);
      return;
    }

    const manifestJson = await Bun.file(manifestPath).text();
    const expected = extractChecksum(manifestJson, currentPlatform);

    if (!expected) {
      try { unlinkSync(binaryPath); unlinkSync(manifestPath); } catch { /* ignore */ }
      fail(`Platform ${currentPlatform} not found in release manifest`, 2);
      return;
    }

    const actual = await computeSha256(binaryPath);
    if (actual !== expected) {
      try { unlinkSync(binaryPath); unlinkSync(manifestPath); } catch { /* ignore */ }
      fail(`Checksum verification failed (expected ${expected}, got ${actual})`, 1);
      return;
    }

    console.log(`\x1b[32m✓\x1b[0m Checksum verified`);

    // 6. Install
    console.log(`\x1b[34m→\x1b[0m Installing...`);
    chmodSync(binaryPath, 0o755);
    const installedPath = installVersioned(binaryPath, targetVersion);

    // 7. Download agent system prompt
    const agentMdPath = join(DOWNLOAD_DIR, "agent.md");
    if (await downloadAsset(targetVersion, "agent.md", agentMdPath)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
      copyFileSync(agentMdPath, join(CONFIG_DIR, "agent.md"));
      console.log(`\x1b[32m✓\x1b[0m Agent prompt updated`);
    }

    // 8. Verify
    try {
      const verifyOutput = execSync(`"${installedPath}" --version`, {
        encoding: "utf-8",
        timeout: 10000,
      }).trim();
      console.log(`\x1b[32m✓\x1b[0m Verified: ${verifyOutput}`);
    } catch {
      console.log(`\x1b[33m!\x1b[0m Binary installed but verification skipped`);
    }

    // Cleanup
    try { unlinkSync(binaryPath); } catch { /* ignore */ }
    try { unlinkSync(manifestPath); } catch { /* ignore */ }
    try { unlinkSync(agentMdPath); } catch { /* ignore */ }

    // 9. Success
    ok({
      status: "updated",
      from: currentVersion,
      to: targetVersion,
      path: installedPath,
    });

    console.log();
    console.log(`\x1b[32m\x1b[1m  Update complete!\x1b[0m`);
    console.log();
    console.log(`  ${currentVersion} → ${targetVersion}`);
    console.log();
  },
};
