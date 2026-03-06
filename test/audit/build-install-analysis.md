# Build & Install System Audit

**Date:** 2026-03-06
**Scope:** build.ts, release.sh, upload-release.sh, install.sh, unix-install.sh, update.ts, self-install.ts

---

## 1. Build Flow (`scripts/build.ts`)

**Entry:** `bun run scripts/build.ts [--target <platform>] [--all] [--no-minify] [--sourcemap]`

- Uses `Bun.build()` with `compile` option to produce standalone binaries.
- Entry point: `src/index.ts`.
- Bakes public OAuth client IDs via `define` (21 providers).
- Dev-shim plugin replaces `react-devtools-core` with no-op at bundle time.
- External packages: qrcode-terminal, link-preview-js, jimp, sharp, playwright-core, electron.

**Supported Targets (8):**
```
bun-darwin-arm64, bun-darwin-x64,
bun-linux-arm64, bun-linux-x64,
bun-linux-arm64-musl, bun-linux-x64-musl,
bun-windows-x64, bun-windows-arm64
```

**Output naming:**
- `--all`: `dist/jeriko-<platform>[.exe]` (e.g., `dist/jeriko-darwin-arm64`)
- `--target <platform>`: `dist/jeriko-<platform>[.exe]`
- No flags: `./jeriko` (project root, current platform)

**Post-build:** macOS targets get ad-hoc codesign (`codesign --force --sign -`).

---

## 2. Release Script (`scripts/release.sh`)

**Entry:** `bash scripts/release.sh [platform]`

- Reads version from `package.json` (regex on `"version"` line).
- Delegates to `build.ts` (`--all` or `--target`).
- Packages `templates/` as `dist/templates.tar.gz`.
- Copies `AGENT.md` to `dist/agent.md`.
- Generates `dist/manifest.json` with per-platform SHA-256 checksums and file sizes.
- Checksum: `shasum -a 256` (macOS) or `sha256sum` (Linux) fallback.
- Size: `stat -f%z` (macOS) or `stat -c%s` (Linux) fallback.

**Manifest format:**
```json
{
  "version": "2.0.0-alpha.1",
  "platforms": {
    "darwin-arm64": { "checksum": "abc...", "size": 69000000, "filename": "jeriko-darwin-arm64" }
  }
}
```

---

## 3. Upload Script (`scripts/upload-release.sh`)

**Entry:** `bash scripts/upload-release.sh [--cdn-only] [--gh-only] [--stable]`

**CDN (Cloudflare R2):**
- Bucket: `jeriko-releases` (env `JERIKO_R2_BUCKET`).
- Key pattern: `releases/{VERSION}/{filename}`.
- Uploads: binaries, manifest.json, templates.tar.gz, agent.md.
- Updates `releases/latest` pointer (text file containing version).
- Optionally updates `releases/stable` pointer (with `--stable`).

**GitHub Release:**
- Repo: `etheonai/jeriko`.
- Tag: `v{VERSION}` (prefixed).
- Prerelease detection: `*-alpha*`, `*-beta*`, `*-rc*`.
- Creates or updates existing release.

---

## 4. Install Script (`scripts/install.sh`)

**Entry:** `curl -fsSL https://jeriko.ai/install.sh | bash [-s -- VERSION]`

**Platform Detection:**
- OS: `uname -s` -> darwin, linux. Windows -> redirects to PowerShell installer.
- Arch: `uname -m` -> x64 (x86_64, amd64), arm64 (arm64, aarch64).
- Rosetta 2 detection: `sysctl -n sysctl.proc_translated` -> prefer arm64.
- Musl detection: checks `/lib/libc.musl-*.so.1` or `ldd /bin/ls | grep musl`.

**Version Resolution (3 fallbacks):**
1. CDN `releases/latest` or `releases/stable` (text file).
2. `gh release list` (gh CLI).
3. GitHub API `repos/etheonai/jeriko/releases/latest`.

**Download (3 fallbacks per asset):**
1. CDN: `https://releases.jeriko.ai/releases/{VERSION}/{filename}`.
2. `gh release download`.
3. Direct GitHub URL: `https://github.com/etheonai/jeriko/releases/download/v{VERSION}/{filename}`.

**Checksum Verification:**
- Downloads `manifest.json`.
- Extracts checksum via `jq` or bash regex fallback (`get_checksum_from_manifest`).
- Computes: `shasum -a 256` (darwin) or `sha256sum` (linux).
- HARD FAIL if no manifest or mismatch.

**Installation:**
- Runs `./downloaded-binary install {VERSION}` (delegates to self-install).
- Downloads `agent.md` to `~/.config/jeriko/agent.md`.
- First install: runs `jeriko onboard` if interactive terminal.

---

## 5. Update Command (`src/cli/commands/automation/update.ts`)

**Entry:** `jeriko update [VERSION] [--check] [--force] [--channel stable|latest]`

**Platform Detection:** TypeScript version mirrors install.sh:
- `os.platform()` -> darwin, linux, windows (win32 mapped).
- `os.arch()` -> x64, arm64.
- Musl: checks `ldd /bin/ls` and `/lib/libc.musl-*.so.1`.

**Version Resolution:** Same CDN-then-GitHub pattern.

**Download + Verify:** Same 3-fallback pattern. Uses `Bun.CryptoHasher("sha256")`.

**Installation:**
- Versioned: `~/.local/share/jeriko/versions/{VERSION}/jeriko`.
- Symlink: `~/.local/bin/jeriko` -> versioned binary.
- Windows: copy instead of symlink.
- Downloads updated `agent.md`.
- Verifies new binary runs.

---

## 6. Source Install (`scripts/unix-install.sh`)

**Entry:** `./scripts/unix-install.sh [PREFIX]`

- Requires Bun >= 1.1.
- Runs `bun install` + `bun run scripts/build.ts` (default target).
- Copies binary to `{PREFIX}/bin/jeriko`.
- Installs: AGENT.md, templates, config.json, bash/zsh completions, man page.
- Creates launchd plist (macOS) or systemd service (Linux).
- PATH warning if prefix/bin not in PATH.

---

## 7. Bugs & Issues Found

### BUG 1: Inconsistent GitHub repo references
- `scripts/upload-release.sh`, `scripts/install.sh`, `src/cli/commands/automation/update.ts` use `etheonai/jeriko`.
- `package.json` uses `khaleel737/jeriko` (line 90: `"url": "https://github.com/khaleel737/jeriko.git"`).
- `apps/website/app/page.tsx` uses `EtheonAI/jerikoai`.
- `apps/website/app/docs/quickstart/page.tsx` uses `EtheonAI/jerikoai`.
- `apps/website/app/docs/installation/page.tsx` uses `EtheonAI/jerikoai`.

The canonical repo for releases is `etheonai/jeriko`. The package.json and website references are wrong.

### BUG 2: release.sh manifest regex in upload-release.sh may miss musl platforms
- `upload-release.sh` line 82: `grep -oE '"[a-z]+-[a-z0-9]+(-(musl))?"'`
- This regex does NOT match `windows-arm64` (no digits in arm) -- wait, `arm64` has digits. Let me re-check.
- Actually `[a-z0-9]+` matches `arm64`, `x64`, `x64` fine. And `(-(musl))?` handles the optional musl suffix.
- However: `windows-arm64` would not match because `windows` has no digit in first part but `[a-z]+` handles it. Actually the pattern is `[a-z]+-[a-z0-9]+` which matches `windows-arm64`. The optional `(-(musl))?` handles musl. This appears correct.

### BUG 3: install.sh cleanup trap removes BINARY_PATH
- Line 58: `cleanup() { rm -f "${BINARY_PATH:-}" ... }` runs on exit.
- But install.sh calls `"$BINARY_PATH" install "$VERSION"` at line 328, which itself copies the binary to the versioned directory.
- The self-install reads from `process.execPath`, not from the file at `BINARY_PATH`. So this is safe: by the time cleanup runs, the binary has already been copied.
- NOT a bug.

### BUG 4: No `windows-arm64` in release.sh ALL_PLATFORMS but build.ts has it
- `release.sh` line 31: `ALL_PLATFORMS` includes `windows-arm64`.
- `build.ts` line 125: `ALL_TARGETS` includes `bun-windows-arm64`.
- These match. Not a bug.

### OBSERVATION: Version source is fragile
- Both `release.sh` and `upload-release.sh` use `grep '"version"' package.json | head -1 | sed` to extract version. This works but would break on unusual JSON formatting.

### OBSERVATION: No templates download in update command
- `install.sh` downloads `agent.md` but not `templates.tar.gz` during install (relies on self-install to handle templates from bundled resources).
- `update.ts` downloads `agent.md` but not templates. Templates must be updated separately.

---

## 8. Summary

| Step | Script | Status |
|------|--------|--------|
| Build | build.ts | Solid. 8 platforms, compile + codesign. |
| Release | release.sh | Solid. Checksums, manifest, templates. |
| Upload | upload-release.sh | Solid. CDN + GitHub dual upload. |
| Install | install.sh | Solid. 3-fallback download, checksum verification, platform detection. |
| Update | update.ts | Solid. Mirrors install.sh logic in TypeScript. |
| Source Install | unix-install.sh | Solid. Full setup including services and completions. |
| Repo References | Mixed | **BUG**: package.json says `khaleel737/jeriko`, scripts say `etheonai/jeriko`, website says `EtheonAI/jerikoai`. |
