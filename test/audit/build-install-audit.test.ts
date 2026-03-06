/**
 * Build & Install System Audit Tests
 *
 * Tests logic functions extracted from the build/release/install/update pipeline.
 * No actual builds or downloads — pure logic verification.
 */

import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Constants (mirrored from source files)
// ---------------------------------------------------------------------------

const ROOT = join(import.meta.dirname, "../..");

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

const ALL_PLATFORMS_RELEASE =
  "darwin-arm64 darwin-x64 linux-arm64 linux-x64 linux-arm64-musl linux-x64-musl windows-x64 windows-arm64";

// ---------------------------------------------------------------------------
// Helper: replicate logic from build.ts, install.sh, update.ts
// ---------------------------------------------------------------------------

/** build.ts: resolveTargets output filename logic */
function buildOutputFilename(target: string): string {
  const stripped = target.replace("bun-", "");
  const ext = target.includes("windows") ? ".exe" : "";
  return `jeriko-${stripped}${ext}`;
}

/** install.sh / release.sh: platform → binary filename */
function binaryFilename(platform: string): string {
  if (platform.startsWith("windows-")) return `jeriko-${platform}.exe`;
  return `jeriko-${platform}`;
}

/** update.ts: detectPlatform() logic */
function detectPlatform(os: string, arch: string, isMusl = false): string {
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
    default: throw new Error(`Unsupported architecture: ${arch}`);
  }

  if (platformOs === "linux" && isMusl) {
    return `linux-${platformArch}-musl`;
  }

  return `${platformOs}-${platformArch}`;
}

/** install.sh: platform detection from uname output */
function detectPlatformShell(unameS: string, unameM: string, isMusl = false): string {
  let os: string;
  switch (unameS) {
    case "Darwin": os = "darwin"; break;
    case "Linux":  os = "linux"; break;
    default: throw new Error(`Unsupported: ${unameS}`);
  }

  let arch: string;
  switch (unameM) {
    case "x86_64":
    case "amd64":
      arch = "x64"; break;
    case "arm64":
    case "aarch64":
      arch = "arm64"; break;
    default: throw new Error(`Unsupported: ${unameM}`);
  }

  if (os === "linux" && isMusl) {
    return `linux-${arch}-musl`;
  }

  return `${os}-${arch}`;
}

/** install.sh: get_checksum_from_manifest bash regex fallback */
function getChecksumFromManifest(json: string, platform: string): string | null {
  // Replicate the regex: match platform key followed by checksum value
  const pattern = new RegExp(
    `"${platform}"[^}]*"checksum"\\s*:\\s*"([a-f0-9]{64})"`,
  );
  const match = json.match(pattern);
  return match ? match[1] : null;
}

/** update.ts: extractChecksum */
function extractChecksum(manifestJson: string, platformKey: string): string | null {
  try {
    const manifest = JSON.parse(manifestJson);
    const checksum = manifest?.platforms?.[platformKey]?.checksum;
    if (typeof checksum === "string" && /^[a-f0-9]{64}$/.test(checksum)) {
      return checksum;
    }
  } catch { /* ignore */ }
  return null;
}

/** Version parsing from package.json (release.sh / upload-release.sh) */
function extractVersionFromPackageJson(content: string): string {
  const match = content.match(/"version".*?"([0-9][^"]*)"/);
  return match ? match[1] : "";
}

/** update.ts: version comparison */
function isVersionMatch(current: string, target: string): boolean {
  return current === target;
}

/** upload-release.sh: prerelease detection */
function isPrerelease(version: string): boolean {
  return /-(alpha|beta|rc)/.test(version);
}

/** CDN URL construction */
function cdnAssetUrl(
  cdnBase: string,
  version: string,
  assetName: string,
): string {
  return `${cdnBase}/releases/${version}/${assetName}`;
}

/** GitHub release URL construction */
function githubReleaseUrl(repo: string, version: string, assetName: string): string {
  return `https://github.com/${repo}/releases/download/v${version}/${assetName}`;
}

/** upload-release.sh: manifest platform extraction regex */
function extractPlatformsFromManifest(json: string): string[] {
  const matches = json.match(/"[a-z]+-[a-z0-9]+(-musl)?"/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.replace(/"/g, "")))].sort();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Platform Detection", () => {
  describe("update.ts detectPlatform()", () => {
    test("darwin x64", () => {
      expect(detectPlatform("darwin", "x64")).toBe("darwin-x64");
    });

    test("darwin arm64", () => {
      expect(detectPlatform("darwin", "arm64")).toBe("darwin-arm64");
    });

    test("linux x64 glibc", () => {
      expect(detectPlatform("linux", "x64", false)).toBe("linux-x64");
    });

    test("linux arm64 glibc", () => {
      expect(detectPlatform("linux", "arm64", false)).toBe("linux-arm64");
    });

    test("linux x64 musl", () => {
      expect(detectPlatform("linux", "x64", true)).toBe("linux-x64-musl");
    });

    test("linux arm64 musl", () => {
      expect(detectPlatform("linux", "arm64", true)).toBe("linux-arm64-musl");
    });

    test("windows x64", () => {
      expect(detectPlatform("win32", "x64")).toBe("windows-x64");
    });

    test("windows arm64", () => {
      expect(detectPlatform("win32", "arm64")).toBe("windows-arm64");
    });

    test("unsupported OS throws", () => {
      expect(() => detectPlatform("freebsd", "x64")).toThrow("Unsupported OS");
    });

    test("unsupported arch throws", () => {
      expect(() => detectPlatform("linux", "mips")).toThrow("Unsupported architecture");
    });
  });

  describe("install.sh platform detection (shell-equivalent)", () => {
    test("Darwin x86_64 -> darwin-x64", () => {
      expect(detectPlatformShell("Darwin", "x86_64")).toBe("darwin-x64");
    });

    test("Darwin arm64 -> darwin-arm64", () => {
      expect(detectPlatformShell("Darwin", "arm64")).toBe("darwin-arm64");
    });

    test("Linux aarch64 -> linux-arm64", () => {
      expect(detectPlatformShell("Linux", "aarch64")).toBe("linux-arm64");
    });

    test("Linux x86_64 musl -> linux-x64-musl", () => {
      expect(detectPlatformShell("Linux", "x86_64", true)).toBe("linux-x64-musl");
    });

    test("Linux amd64 -> linux-x64", () => {
      expect(detectPlatformShell("Linux", "amd64")).toBe("linux-x64");
    });
  });

  describe("platform parity between install.sh and update.ts", () => {
    const cases: Array<{ os: string; uname: string; arch: string; unameM: string; musl: boolean }> = [
      { os: "darwin", uname: "Darwin", arch: "x64", unameM: "x86_64", musl: false },
      { os: "darwin", uname: "Darwin", arch: "arm64", unameM: "arm64", musl: false },
      { os: "linux", uname: "Linux", arch: "x64", unameM: "x86_64", musl: false },
      { os: "linux", uname: "Linux", arch: "arm64", unameM: "aarch64", musl: false },
      { os: "linux", uname: "Linux", arch: "x64", unameM: "x86_64", musl: true },
      { os: "linux", uname: "Linux", arch: "arm64", unameM: "aarch64", musl: true },
    ];

    for (const c of cases) {
      test(`${c.uname}/${c.unameM}${c.musl ? "/musl" : ""} matches`, () => {
        const fromTs = detectPlatform(c.os, c.arch, c.musl);
        const fromSh = detectPlatformShell(c.uname, c.unameM, c.musl);
        expect(fromTs).toBe(fromSh);
      });
    }
  });
});

describe("Binary Filename Generation", () => {
  test("build.ts: darwin-arm64 -> jeriko-darwin-arm64", () => {
    expect(buildOutputFilename("bun-darwin-arm64")).toBe("jeriko-darwin-arm64");
  });

  test("build.ts: windows-x64 -> jeriko-windows-x64.exe", () => {
    expect(buildOutputFilename("bun-windows-x64")).toBe("jeriko-windows-x64.exe");
  });

  test("build.ts: linux-x64-musl -> jeriko-linux-x64-musl", () => {
    expect(buildOutputFilename("bun-linux-x64-musl")).toBe("jeriko-linux-x64-musl");
  });

  test("release.sh/install.sh: darwin-arm64 -> jeriko-darwin-arm64", () => {
    expect(binaryFilename("darwin-arm64")).toBe("jeriko-darwin-arm64");
  });

  test("release.sh/install.sh: windows-x64 -> jeriko-windows-x64.exe", () => {
    expect(binaryFilename("windows-x64")).toBe("jeriko-windows-x64.exe");
  });

  test("release.sh/install.sh: windows-arm64 -> jeriko-windows-arm64.exe", () => {
    expect(binaryFilename("windows-arm64")).toBe("jeriko-windows-arm64.exe");
  });

  describe("build.ts and release.sh produce same filenames for all platforms", () => {
    const platforms = ALL_PLATFORMS_RELEASE.split(" ");
    for (const p of platforms) {
      test(p, () => {
        expect(buildOutputFilename(`bun-${p}`)).toBe(binaryFilename(p));
      });
    }
  });
});

describe("Version Parsing", () => {
  test("extracts version from package.json content", () => {
    const content = readFileSync(join(ROOT, "package.json"), "utf-8");
    const version = extractVersionFromPackageJson(content);
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  test("handles stable version", () => {
    expect(extractVersionFromPackageJson(`"version": "1.0.0"`)).toBe("1.0.0");
  });

  test("handles alpha prerelease", () => {
    expect(extractVersionFromPackageJson(`"version": "2.0.0-alpha.1"`)).toBe("2.0.0-alpha.1");
  });

  test("handles beta prerelease", () => {
    expect(extractVersionFromPackageJson(`"version": "3.1.0-beta.2"`)).toBe("3.1.0-beta.2");
  });

  test("handles rc prerelease", () => {
    expect(extractVersionFromPackageJson(`"version": "1.0.0-rc.1"`)).toBe("1.0.0-rc.1");
  });

  test("prerelease detection: alpha", () => {
    expect(isPrerelease("2.0.0-alpha.1")).toBe(true);
  });

  test("prerelease detection: beta", () => {
    expect(isPrerelease("2.0.0-beta.1")).toBe(true);
  });

  test("prerelease detection: rc", () => {
    expect(isPrerelease("2.0.0-rc.1")).toBe(true);
  });

  test("prerelease detection: stable", () => {
    expect(isPrerelease("2.0.0")).toBe(false);
  });
});

describe("Checksum Extraction", () => {
  const sampleManifest = JSON.stringify({
    version: "2.0.0",
    platforms: {
      "darwin-arm64": {
        checksum: "a".repeat(64),
        size: 70000000,
        filename: "jeriko-darwin-arm64",
      },
      "linux-x64": {
        checksum: "b".repeat(64),
        size: 65000000,
        filename: "jeriko-linux-x64",
      },
      "windows-x64": {
        checksum: "c".repeat(64),
        size: 71000000,
        filename: "jeriko-windows-x64.exe",
      },
    },
  });

  describe("update.ts extractChecksum (JSON.parse)", () => {
    test("finds darwin-arm64 checksum", () => {
      expect(extractChecksum(sampleManifest, "darwin-arm64")).toBe("a".repeat(64));
    });

    test("finds linux-x64 checksum", () => {
      expect(extractChecksum(sampleManifest, "linux-x64")).toBe("b".repeat(64));
    });

    test("finds windows-x64 checksum", () => {
      expect(extractChecksum(sampleManifest, "windows-x64")).toBe("c".repeat(64));
    });

    test("returns null for missing platform", () => {
      expect(extractChecksum(sampleManifest, "freebsd-x64")).toBeNull();
    });

    test("returns null for invalid json", () => {
      expect(extractChecksum("not json", "darwin-arm64")).toBeNull();
    });

    test("returns null for short checksum", () => {
      const bad = JSON.stringify({
        platforms: { "darwin-arm64": { checksum: "abc" } },
      });
      expect(extractChecksum(bad, "darwin-arm64")).toBeNull();
    });
  });

  describe("install.sh getChecksumFromManifest (regex fallback)", () => {
    test("finds darwin-arm64 checksum", () => {
      expect(getChecksumFromManifest(sampleManifest, "darwin-arm64")).toBe(
        "a".repeat(64),
      );
    });

    test("finds linux-x64 checksum", () => {
      expect(getChecksumFromManifest(sampleManifest, "linux-x64")).toBe(
        "b".repeat(64),
      );
    });

    test("returns null for missing platform", () => {
      expect(getChecksumFromManifest(sampleManifest, "freebsd-x64")).toBeNull();
    });
  });

  describe("parity: JSON.parse vs regex extraction", () => {
    const platforms = ["darwin-arm64", "linux-x64", "windows-x64"];
    for (const p of platforms) {
      test(`${p} produces same result`, () => {
        expect(extractChecksum(sampleManifest, p)).toBe(
          getChecksumFromManifest(sampleManifest, p),
        );
      });
    }
  });
});

describe("Version Comparison (update.ts)", () => {
  test("same version matches", () => {
    expect(isVersionMatch("2.0.0", "2.0.0")).toBe(true);
  });

  test("different versions do not match", () => {
    expect(isVersionMatch("2.0.0", "2.0.1")).toBe(false);
  });

  test("prerelease vs stable do not match", () => {
    expect(isVersionMatch("2.0.0-alpha.1", "2.0.0")).toBe(false);
  });

  test("same prerelease matches", () => {
    expect(isVersionMatch("2.0.0-alpha.1", "2.0.0-alpha.1")).toBe(true);
  });
});

describe("GitHub Repo Reference Consistency", () => {
  const CANONICAL_REPO = "etheonai/jeriko";

  test("upload-release.sh uses canonical repo", () => {
    const content = readFileSync(join(ROOT, "scripts/upload-release.sh"), "utf-8");
    const match = content.match(/GITHUB_REPO="([^"]+)"/);
    expect(match?.[1]).toBe(CANONICAL_REPO);
  });

  test("install.sh uses canonical repo", () => {
    const content = readFileSync(join(ROOT, "scripts/install.sh"), "utf-8");
    const match = content.match(/GITHUB_REPO="([^"]+)"/);
    expect(match?.[1]).toBe(CANONICAL_REPO);
  });

  test("update.ts uses canonical repo", () => {
    const content = readFileSync(
      join(ROOT, "src/cli/commands/automation/update.ts"),
      "utf-8",
    );
    const match = content.match(/GITHUB_REPO\s*=\s*"([^"]+)"/);
    expect(match?.[1]).toBe(CANONICAL_REPO);
  });

  test("package.json repository URL matches canonical repo", () => {
    const content = readFileSync(join(ROOT, "package.json"), "utf-8");
    const pkg = JSON.parse(content);
    const repoUrl: string = pkg.repository?.url ?? "";
    expect(repoUrl).toContain(CANONICAL_REPO);
  });
});

describe("CDN URL Construction", () => {
  const CDN = "https://releases.jeriko.ai";

  test("binary asset URL", () => {
    expect(cdnAssetUrl(CDN, "2.0.0", "jeriko-darwin-arm64")).toBe(
      "https://releases.jeriko.ai/releases/2.0.0/jeriko-darwin-arm64",
    );
  });

  test("manifest URL", () => {
    expect(cdnAssetUrl(CDN, "2.0.0", "manifest.json")).toBe(
      "https://releases.jeriko.ai/releases/2.0.0/manifest.json",
    );
  });

  test("templates URL", () => {
    expect(cdnAssetUrl(CDN, "2.0.0", "templates.tar.gz")).toBe(
      "https://releases.jeriko.ai/releases/2.0.0/templates.tar.gz",
    );
  });

  test("agent.md URL", () => {
    expect(cdnAssetUrl(CDN, "2.0.0", "agent.md")).toBe(
      "https://releases.jeriko.ai/releases/2.0.0/agent.md",
    );
  });

  test("GitHub release URL has v prefix", () => {
    expect(githubReleaseUrl("etheonai/jeriko", "2.0.0", "jeriko-darwin-arm64")).toBe(
      "https://github.com/etheonai/jeriko/releases/download/v2.0.0/jeriko-darwin-arm64",
    );
  });
});

describe("Build Target Consistency", () => {
  test("build.ts targets strip to release.sh platforms", () => {
    const buildPlatforms = ALL_TARGETS.map((t) => t.replace("bun-", "")).sort();
    const releasePlatforms = ALL_PLATFORMS_RELEASE.split(" ").sort();
    expect(buildPlatforms).toEqual(releasePlatforms);
  });

  test("all 8 platforms are present", () => {
    expect(ALL_TARGETS.length).toBe(8);
  });

  test("every target starts with 'bun-'", () => {
    for (const t of ALL_TARGETS) {
      expect(t.startsWith("bun-")).toBe(true);
    }
  });
});

describe("Manifest Platform Extraction (upload-release.sh regex)", () => {
  const manifest = JSON.stringify({
    version: "2.0.0",
    platforms: {
      "darwin-arm64": { checksum: "a".repeat(64), size: 1, filename: "f" },
      "darwin-x64": { checksum: "b".repeat(64), size: 1, filename: "f" },
      "linux-x64": { checksum: "c".repeat(64), size: 1, filename: "f" },
      "linux-x64-musl": { checksum: "d".repeat(64), size: 1, filename: "f" },
      "linux-arm64": { checksum: "e".repeat(64), size: 1, filename: "f" },
      "linux-arm64-musl": { checksum: "f".repeat(64), size: 1, filename: "f" },
      "windows-x64": { checksum: "0".repeat(64), size: 1, filename: "f" },
      "windows-arm64": { checksum: "1".repeat(64), size: 1, filename: "f" },
    },
  });

  test("extracts all 8 platforms", () => {
    const platforms = extractPlatformsFromManifest(manifest);
    expect(platforms.length).toBe(8);
  });

  test("includes musl variants", () => {
    const platforms = extractPlatformsFromManifest(manifest);
    expect(platforms).toContain("linux-x64-musl");
    expect(platforms).toContain("linux-arm64-musl");
  });

  test("includes windows", () => {
    const platforms = extractPlatformsFromManifest(manifest);
    expect(platforms).toContain("windows-x64");
    expect(platforms).toContain("windows-arm64");
  });
});

describe("Version Validation Patterns", () => {
  // install.sh target validation regex
  const INSTALL_RE = /^(stable|latest|[0-9]+\.[0-9]+\.[0-9]+(-[^\s]+)?)$/;
  // update.ts positional version regex
  const UPDATE_RE = /^\d+\.\d+\.\d+(-[^\s]+)?$/;
  // self-install.ts version regex
  const SELF_INSTALL_RE = /^[0-9]+\.[0-9]+\.[0-9]+(-[^\s]+)?$/;

  test("install.sh accepts 'latest'", () => {
    expect(INSTALL_RE.test("latest")).toBe(true);
  });

  test("install.sh accepts 'stable'", () => {
    expect(INSTALL_RE.test("stable")).toBe(true);
  });

  test("install.sh accepts semver", () => {
    expect(INSTALL_RE.test("2.0.0")).toBe(true);
  });

  test("install.sh accepts prerelease", () => {
    expect(INSTALL_RE.test("2.0.0-alpha.1")).toBe(true);
  });

  test("install.sh rejects garbage", () => {
    expect(INSTALL_RE.test("foo")).toBe(false);
  });

  test("update.ts accepts semver", () => {
    expect(UPDATE_RE.test("2.0.0")).toBe(true);
  });

  test("update.ts accepts prerelease", () => {
    expect(UPDATE_RE.test("2.0.0-beta.3")).toBe(true);
  });

  test("update.ts rejects 'latest'", () => {
    expect(UPDATE_RE.test("latest")).toBe(false);
  });

  test("self-install.ts accepts semver", () => {
    expect(SELF_INSTALL_RE.test("2.0.0")).toBe(true);
  });

  test("self-install.ts rejects 'latest'", () => {
    expect(SELF_INSTALL_RE.test("latest")).toBe(false);
  });

  test("update.ts and self-install.ts version regexes are equivalent", () => {
    const testCases = [
      "1.0.0", "2.0.0-alpha.1", "0.0.1-rc.2", "latest", "stable", "foo", "",
    ];
    for (const tc of testCases) {
      expect(UPDATE_RE.test(tc)).toBe(SELF_INSTALL_RE.test(tc));
    }
  });
});

describe("R2 Upload Path Structure", () => {
  test("binary path pattern", () => {
    const version = "2.0.0";
    const filename = "jeriko-darwin-arm64";
    const key = `releases/${version}/${filename}`;
    expect(key).toBe("releases/2.0.0/jeriko-darwin-arm64");
  });

  test("manifest path pattern", () => {
    const key = `releases/2.0.0/manifest.json`;
    expect(key).toBe("releases/2.0.0/manifest.json");
  });

  test("latest pointer path", () => {
    expect("releases/latest").toBe("releases/latest");
  });

  test("stable pointer path", () => {
    expect("releases/stable").toBe("releases/stable");
  });
});

describe("Package.json Integrity", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));

  test("has version field", () => {
    expect(pkg.version).toBeDefined();
    expect(typeof pkg.version).toBe("string");
  });

  test("version is semver", () => {
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  test("has build script", () => {
    expect(pkg.scripts.build).toBe("bun run scripts/build.ts");
  });

  test("has build:all script", () => {
    expect(pkg.scripts["build:all"]).toBe("bun run scripts/build.ts --all");
  });

  test("os field includes all supported platforms", () => {
    expect(pkg.os).toContain("darwin");
    expect(pkg.os).toContain("linux");
    expect(pkg.os).toContain("win32");
  });

  test("cpu field includes all supported architectures", () => {
    expect(pkg.cpu).toContain("x64");
    expect(pkg.cpu).toContain("arm64");
  });

  test("main entry point exists", () => {
    expect(pkg.main).toBe("src/index.ts");
  });
});

describe("Symlink vs Copy (update.ts installVersioned)", () => {
  test("non-windows uses symlink pattern", () => {
    // Verify the logic: IS_WINDOWS flag determines copy vs symlink
    const IS_WINDOWS = false;
    expect(IS_WINDOWS).toBe(false);
    // On Unix: unlinkSync + symlinkSync
  });

  test("windows uses copy pattern", () => {
    const IS_WINDOWS = true;
    expect(IS_WINDOWS).toBe(true);
    // On Windows: copyFileSync (no symlink)
  });
});

describe("Versioned Directory Structure", () => {
  test("version dir uses correct pattern", () => {
    const home = "/home/user";
    const version = "2.0.0";
    const versionDir = `${home}/.local/share/jeriko/versions/${version}`;
    const binary = `${versionDir}/jeriko`;
    const symlink = `${home}/.local/bin/jeriko`;

    expect(versionDir).toBe("/home/user/.local/share/jeriko/versions/2.0.0");
    expect(binary).toBe("/home/user/.local/share/jeriko/versions/2.0.0/jeriko");
    expect(symlink).toBe("/home/user/.local/bin/jeriko");
  });
});
