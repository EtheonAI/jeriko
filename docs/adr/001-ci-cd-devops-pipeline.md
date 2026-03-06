# ADR-001: CI/CD, DevOps Pipeline, and Cross-Platform Installation

## Status: Accepted

## Date: 2026-03-06

## Context

Jeriko is a cross-platform CLI toolkit (Mac, Linux, Windows) compiled to standalone
binaries via Bun. We have installation scripts (install.sh, install.ps1, install.cmd),
a build system (8-platform cross-compilation), and a release pipeline (R2 CDN + GitHub
Releases). However, we have **zero CI/CD automation** — no GitHub Actions, no automated
testing on any platform, no automated releases.

### What Exists
- `scripts/install.sh` — Unix installer (CDN fallback, checksum verification, Rosetta 2, musl)
- `scripts/install.ps1` — Windows PowerShell installer (proper arch detection)
- `scripts/install.cmd` — Windows CMD fallback
- `scripts/unix-install.sh` — From-source installer (launchd, systemd, man pages, completions)
- `src/cli/commands/automation/self-install.ts` — Binary self-install (versioned storage, PATH)
- `scripts/build.ts` — Cross-compilation to 8 targets
- `scripts/release.sh` — Multi-platform build + manifest.json
- `scripts/upload-release.sh` — CDN (R2) + GitHub Release upload
- 1883 unit/integration tests across 72 files

### What's Missing
1. No GitHub Actions workflows at all
2. No cross-platform CI testing (Mac, Linux, Windows)
3. No automated release pipeline
4. Docker "Windows test" runs PowerShell on Debian (not real Windows)
5. No install script smoke testing
6. No build verification for all 8 platforms

### Research: Claude Code's Approach (Reference Architecture)
Claude Code uses the exact same installation pattern we already implement:
- **Mac/Linux**: `curl -fsSL https://claude.ai/install.sh | bash` → `~/.local/bin/claude`
- **Windows PS**: `irm https://claude.ai/install.ps1 | iex` → `~/.local/bin/claude.exe`
- **Windows CMD**: `curl -fsSL ... -o install.cmd && install.cmd`
- **Storage**: `~/.local/share/claude/` (versions)
- **Checksums**: manifest.json with SHA256 per platform
- **Auto-updates**: Background update check, channel config (latest/stable)
- **CI/CD**: GitHub Actions with `anthropics/claude-code-action@v1`

Our installation layout already mirrors this:
- Binary: `~/.local/bin/jeriko`
- Versions: `~/.local/share/jeriko/versions/{version}/jeriko`
- Config: `~/.config/jeriko/`
- Data: `~/.jeriko/`

## Decision

### 1. GitHub Actions CI Pipeline (5 workflows)

```
.github/workflows/
  ci.yml              — Unit tests + typecheck (Ubuntu, on every push/PR)
  build.yml           — Cross-platform build matrix (on release tags)
  install-test.yml    — Install script smoke tests (Mac, Linux, Windows)
  release.yml         — Automated release (build → sign → upload → publish)
  integration.yml     — Integration tests (relay, connectors, channels)
```

### 2. CI Matrix Strategy

| Workflow | Runners | Triggers |
|----------|---------|----------|
| ci.yml | ubuntu-latest | push, PR |
| build.yml | ubuntu-latest (cross-compile), macos-latest (verify), windows-latest (verify) | release tags, manual |
| install-test.yml | macos-latest, ubuntu-latest, windows-latest | release tags, manual |
| release.yml | ubuntu-latest | version tags (v*) |
| integration.yml | ubuntu-latest | push to main, weekly |

### 3. Install Script Testing Strategy

**Real Windows testing** via GitHub Actions `windows-latest` runner:
- PowerShell script execution test
- CMD script execution test
- Binary launch verification
- PATH modification verification

**Mac/Linux** via `macos-latest` and `ubuntu-latest`:
- install.sh with mock CDN (local HTTP server serving dist/)
- unix-install.sh from source
- Verify binary, completions, PATH, agent prompt

### 4. Release Automation

Tag-driven: `git tag v2.0.0 && git push --tags` triggers:
1. `bun test` (gate)
2. `tsc --noEmit` (gate)
3. `bun run scripts/build.ts --all` (8 binaries)
4. macOS: `codesign` ad-hoc (GitHub runner)
5. Generate manifest.json with SHA256 checksums
6. Upload to R2 CDN via wrangler
7. Create GitHub Release with all assets
8. Smoke test: download and run on each platform

## Consequences

### Positive
- Every PR is tested before merge
- Builds verified on all 3 OS families
- Install scripts tested on real Windows (not emulated)
- Release process is fully automated and repeatable
- Matches industry standard (Claude Code, Bun, Deno all use similar pipelines)

### Negative
- GitHub Actions minutes cost (mitigated: only build on tags, cache deps)
- Cross-compilation cannot fully verify all binaries (mitigated: smoke tests)
- macOS code signing requires Apple Developer cert for production (ad-hoc for now)

### Risk Mitigation
- Cache `~/.bun/install/cache` between runs
- Only run build matrix on release tags (not every PR)
- Integration tests run weekly + on main push (not every PR)
- Install tests run on release + manual trigger
