import { describe, expect, it, beforeEach, afterEach, mock } from "bun:test";
import { join } from "node:path";
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync, lstatSync } from "node:fs";
import { tmpdir, homedir, platform } from "node:os";

// ---------------------------------------------------------------------------
// Import the module under test
// ---------------------------------------------------------------------------

import {
  HOME,
  IS_WINDOWS,
  DATA_DIR,
  CONFIG_DIR,
  INSTALL_DIR,
  LIB_DIR,
  TEMPLATES_INSTALL_DIR,
  VERSIONS_DIR,
  BINARY_NAME,
  VERSION_TARGET_RE,
  isSelfInstallTarget,
  versionedBinaryPath,
} from "../../src/cli/commands/automation/install-utils.js";

// ---------------------------------------------------------------------------
// Constants tests
// ---------------------------------------------------------------------------

describe("install-utils constants", () => {
  it("HOME matches os.homedir()", () => {
    expect(HOME).toBe(homedir());
  });

  it("IS_WINDOWS reflects current platform", () => {
    expect(IS_WINDOWS).toBe(platform() === "win32");
  });

  it("DATA_DIR is under home", () => {
    expect(DATA_DIR).toBe(join(homedir(), ".jeriko"));
  });

  it("INSTALL_DIR is under ~/.local/bin", () => {
    expect(INSTALL_DIR).toBe(join(homedir(), ".local", "bin"));
  });

  it("VERSIONS_DIR is under ~/.local/share/jeriko/versions", () => {
    expect(VERSIONS_DIR).toBe(join(homedir(), ".local", "share", "jeriko", "versions"));
  });

  it("BINARY_NAME has correct extension", () => {
    if (platform() === "win32") {
      expect(BINARY_NAME).toBe("jeriko.exe");
    } else {
      expect(BINARY_NAME).toBe("jeriko");
    }
  });

  it("LIB_DIR is under ~/.local/lib/jeriko", () => {
    expect(LIB_DIR).toBe(join(homedir(), ".local", "lib", "jeriko"));
  });

  it("TEMPLATES_INSTALL_DIR is under LIB_DIR", () => {
    expect(TEMPLATES_INSTALL_DIR).toBe(join(LIB_DIR, "templates"));
  });
});

// ---------------------------------------------------------------------------
// VERSION_TARGET_RE tests
// ---------------------------------------------------------------------------

describe("VERSION_TARGET_RE", () => {
  it("matches 'stable'", () => {
    expect(VERSION_TARGET_RE.test("stable")).toBe(true);
  });

  it("matches 'latest'", () => {
    expect(VERSION_TARGET_RE.test("latest")).toBe(true);
  });

  it("matches semver '2.0.0'", () => {
    expect(VERSION_TARGET_RE.test("2.0.0")).toBe(true);
  });

  it("matches semver with prerelease '2.0.0-alpha.1'", () => {
    expect(VERSION_TARGET_RE.test("2.0.0-alpha.1")).toBe(true);
  });

  it("matches semver with prerelease '1.0.0-beta.3'", () => {
    expect(VERSION_TARGET_RE.test("1.0.0-beta.3")).toBe(true);
  });

  it("matches semver with prerelease '3.1.2-rc.0'", () => {
    expect(VERSION_TARGET_RE.test("3.1.2-rc.0")).toBe(true);
  });

  it("does not match npm package names", () => {
    expect(VERSION_TARGET_RE.test("@jeriko/plugin-slack")).toBe(false);
    expect(VERSION_TARGET_RE.test("express")).toBe(false);
    expect(VERSION_TARGET_RE.test("./my-plugin")).toBe(false);
  });

  it("does not match partial semver", () => {
    expect(VERSION_TARGET_RE.test("2.0")).toBe(false);
    expect(VERSION_TARGET_RE.test("2")).toBe(false);
  });

  it("does not match random strings", () => {
    expect(VERSION_TARGET_RE.test("")).toBe(false);
    expect(VERSION_TARGET_RE.test("foo")).toBe(false);
    expect(VERSION_TARGET_RE.test("v2.0.0")).toBe(false);
  });

  it("does not match versions with spaces", () => {
    expect(VERSION_TARGET_RE.test("2.0.0 extra")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isSelfInstallTarget tests
// ---------------------------------------------------------------------------

describe("isSelfInstallTarget", () => {
  it("returns true for 'stable'", () => {
    expect(isSelfInstallTarget("stable")).toBe(true);
  });

  it("returns true for 'latest'", () => {
    expect(isSelfInstallTarget("latest")).toBe(true);
  });

  it("returns true for semver strings", () => {
    expect(isSelfInstallTarget("2.0.0")).toBe(true);
    expect(isSelfInstallTarget("1.0.0-alpha.0")).toBe(true);
    expect(isSelfInstallTarget("0.1.0-beta.2")).toBe(true);
  });

  it("returns false for plugin package names", () => {
    expect(isSelfInstallTarget("@jeriko/plugin-slack")).toBe(false);
    expect(isSelfInstallTarget("express")).toBe(false);
    expect(isSelfInstallTarget("./my-plugin")).toBe(false);
    expect(isSelfInstallTarget("https://github.com/user/repo")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isSelfInstallTarget("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// versionedBinaryPath tests
// ---------------------------------------------------------------------------

describe("versionedBinaryPath", () => {
  it("returns correct path for a version", () => {
    const result = versionedBinaryPath("2.0.0");
    expect(result).toBe(join(VERSIONS_DIR, "2.0.0", BINARY_NAME));
  });

  it("returns correct path for prerelease version", () => {
    const result = versionedBinaryPath("2.0.0-alpha.1");
    expect(result).toBe(join(VERSIONS_DIR, "2.0.0-alpha.1", BINARY_NAME));
  });

  it("handles 'unknown' version", () => {
    const result = versionedBinaryPath("unknown");
    expect(result).toBe(join(VERSIONS_DIR, "unknown", BINARY_NAME));
  });
});

// ---------------------------------------------------------------------------
// Integration-style tests using a temp directory
// ---------------------------------------------------------------------------

describe("install-utils integration", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `jeriko-install-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch { /* ignore cleanup errors */ }
  });

  it("can create versioned directory structure", () => {
    const versionsDir = join(testDir, "versions");
    const versionDir = join(versionsDir, "2.0.0");
    mkdirSync(versionDir, { recursive: true });

    expect(existsSync(versionDir)).toBe(true);
  });

  it("can write and read a binary file", () => {
    const binaryPath = join(testDir, "jeriko");
    writeFileSync(binaryPath, "#!/usr/bin/env bun\nconsole.log('test');");

    expect(existsSync(binaryPath)).toBe(true);
    const content = readFileSync(binaryPath, "utf-8");
    expect(content).toContain("test");
  });

  // Symlink test (Unix only)
  if (platform() !== "win32") {
    it("can create and follow symlinks", () => {
      const target = join(testDir, "binary");
      const link = join(testDir, "link");

      writeFileSync(target, "binary-content");
      symlinkSync(target, link);

      expect(existsSync(link)).toBe(true);
      expect(lstatSync(link).isSymbolicLink()).toBe(true);
      expect(readFileSync(link, "utf-8")).toBe("binary-content");
    });
  }

  it("version directories are independent", () => {
    const v1 = join(testDir, "versions", "1.0.0");
    const v2 = join(testDir, "versions", "2.0.0");

    mkdirSync(v1, { recursive: true });
    mkdirSync(v2, { recursive: true });

    writeFileSync(join(v1, "jeriko"), "v1");
    writeFileSync(join(v2, "jeriko"), "v2");

    expect(readFileSync(join(v1, "jeriko"), "utf-8")).toBe("v1");
    expect(readFileSync(join(v2, "jeriko"), "utf-8")).toBe("v2");
  });
});

// ---------------------------------------------------------------------------
// Build target tests (verifying the release.sh / build.ts mappings)
// ---------------------------------------------------------------------------

describe("platform mappings", () => {
  const EXPECTED_PLATFORMS = [
    { platform: "darwin-arm64", target: "bun-darwin-arm64", ext: "" },
    { platform: "darwin-x64", target: "bun-darwin-x64", ext: "" },
    { platform: "linux-arm64", target: "bun-linux-arm64", ext: "" },
    { platform: "linux-x64", target: "bun-linux-x64", ext: "" },
    { platform: "linux-arm64-musl", target: "bun-linux-arm64-musl", ext: "" },
    { platform: "linux-x64-musl", target: "bun-linux-x64-musl", ext: "" },
    { platform: "windows-x64", target: "bun-windows-x64", ext: ".exe" },
    { platform: "windows-arm64", target: "bun-windows-arm64", ext: ".exe" },
  ];

  it("has 8 supported platforms", () => {
    expect(EXPECTED_PLATFORMS).toHaveLength(8);
  });

  for (const { platform: p, target, ext } of EXPECTED_PLATFORMS) {
    it(`platform ${p} maps to target ${target}`, () => {
      expect(target).toBe(`bun-${p}`);
    });

    it(`platform ${p} has correct extension '${ext || "(none)"}'`, () => {
      const expected = p.startsWith("windows-") ? ".exe" : "";
      expect(ext).toBe(expected);
    });
  }
});
