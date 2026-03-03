<#
.SYNOPSIS
    Jeriko Installer for Windows (PowerShell)

.DESCRIPTION
    Downloads and installs the Jeriko CLI binary.

.PARAMETER Target
    Version target: "stable", "latest", or a specific semver (e.g. "2.0.0").
    Defaults to "latest".

.EXAMPLE
    irm https://jeriko.ai/install.ps1 | iex
    .\install.ps1 -Target 2.0.0
#>

[CmdletBinding()]
param(
    [ValidatePattern('^(stable|latest|[0-9]+\.[0-9]+\.[0-9]+(-[^\s]+)?)$')]
    [string]$Target = "latest"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Config ───────────────────────────────────────────────────────

$GitHubRepo   = "khaleel737/jeriko"
$ReleasesUrl  = "https://github.com/$GitHubRepo/releases"
if ($env:JERIKO_CDN_URL) { $CdnUrl = $env:JERIKO_CDN_URL } else { $CdnUrl = "https://releases.jeriko.ai" }
$DownloadDir  = Join-Path $HOME ".jeriko" "downloads"

# ── Helpers ──────────────────────────────────────────────────────

function Write-Info  { param([string]$Msg) Write-Host "  → " -ForegroundColor Blue -NoNewline; Write-Host $Msg }
function Write-Ok    { param([string]$Msg) Write-Host "  ✓ " -ForegroundColor Green -NoNewline; Write-Host $Msg }
function Write-Warn  { param([string]$Msg) Write-Host "  ! " -ForegroundColor Yellow -NoNewline; Write-Host $Msg }
function Write-Err   { param([string]$Msg) Write-Host "  ✗ " -ForegroundColor Red -NoNewline; Write-Host $Msg }

function Invoke-Download {
    param(
        [string]$Url,
        [string]$OutFile
    )
    try {
        if ($OutFile) {
            Invoke-WebRequest -Uri $Url -OutFile $OutFile -UseBasicParsing -ErrorAction Stop
        } else {
            return (Invoke-RestMethod -Uri $Url -ErrorAction Stop)
        }
        return $true
    } catch {
        return $false
    }
}

function Get-ChecksumFromManifest {
    param(
        [PSObject]$Manifest,
        [string]$Platform
    )
    if ($Manifest.platforms.PSObject.Properties.Name -contains $Platform) {
        return $Manifest.platforms.$Platform.checksum
    }
    return $null
}

# ── Architecture detection ───────────────────────────────────────

if (-not [Environment]::Is64BitOperatingSystem) {
    Write-Err "Jeriko requires a 64-bit operating system."
    exit 1
}

$Arch = switch ($env:PROCESSOR_ARCHITECTURE) {
    "AMD64"  { "x64" }
    "ARM64"  { "arm64" }
    default  { $null }
}

if (-not $Arch) {
    Write-Err "Unsupported architecture: $env:PROCESSOR_ARCHITECTURE"
    exit 1
}

$Platform   = "windows-$Arch"
$BinaryName = "jeriko-$Platform.exe"

# ── Header ───────────────────────────────────────────────────────

Write-Host ""
Write-Host "  ╦╔═╗╦═╗╦╦╔═╔═╗" -ForegroundColor White
Write-Host "  ║║╣ ╠╦╝║╠╩╗║ ║" -ForegroundColor White
Write-Host "  ╩╚═╝╩╚═╩╩ ╩╚═╝" -ForegroundColor White
Write-Host "  Unix-first CLI toolkit for AI agents" -ForegroundColor DarkGray
Write-Host ""

# ── Resolve version ──────────────────────────────────────────────

Write-Info "Platform: $Platform"

$Version = $null

if ($Target -eq "latest" -or $Target -eq "stable") {
    Write-Info "Fetching $Target version..."

    # Try CDN
    try {
        $Version = (Invoke-RestMethod -Uri "$CdnUrl/releases/$Target" -ErrorAction Stop).Trim()
    } catch {}

    # Fallback to GitHub API
    if (-not $Version) {
        try {
            $Release = Invoke-RestMethod -Uri "https://api.github.com/repos/$GitHubRepo/releases/latest" -ErrorAction Stop
            $Version = $Release.tag_name -replace '^v', ''
        } catch {}
    }

    if (-not $Version) {
        Write-Err "Could not detect latest version. Check: $ReleasesUrl"
        exit 1
    }
} else {
    $Version = $Target
}

Write-Info "Version: $Version"

# ── Download ─────────────────────────────────────────────────────

if (-not (Test-Path $DownloadDir)) {
    New-Item -ItemType Directory -Path $DownloadDir -Force | Out-Null
}

$BinaryPath = Join-Path $DownloadDir "jeriko-$Version-$Platform.exe"

Write-Info "Downloading $BinaryName..."

$Downloaded = $false

# Try CDN
$CdnBinaryUrl = "$CdnUrl/releases/$Version/$BinaryName"
if (Invoke-Download -Url $CdnBinaryUrl -OutFile $BinaryPath) {
    $Downloaded = $true
}

# Fallback to GitHub Release
if (-not $Downloaded) {
    $GhUrl = "$ReleasesUrl/download/v$Version/$BinaryName"
    if (Invoke-Download -Url $GhUrl -OutFile $BinaryPath) {
        $Downloaded = $true
    }
}

if (-not $Downloaded) {
    $GhUrl = "$ReleasesUrl/download/$Version/$BinaryName"
    if (Invoke-Download -Url $GhUrl -OutFile $BinaryPath) {
        $Downloaded = $true
    }
}

if (-not $Downloaded) {
    Write-Err "Download failed. Check: $ReleasesUrl"
    exit 1
}

# ── Checksum verification ────────────────────────────────────────

Write-Info "Verifying checksum..."

$ManifestPath = Join-Path $DownloadDir "manifest-$Version.json"
$Manifest = $null

# Try CDN manifest
try {
    Invoke-WebRequest -Uri "$CdnUrl/releases/$Version/manifest.json" -OutFile $ManifestPath -UseBasicParsing -ErrorAction Stop
    $Manifest = Get-Content $ManifestPath -Raw | ConvertFrom-Json
    Remove-Item $ManifestPath -Force -ErrorAction SilentlyContinue
} catch {}

# Fallback to GitHub manifest
if (-not $Manifest) {
    try {
        $GhManifestUrl = "$ReleasesUrl/download/v$Version/manifest.json"
        Invoke-WebRequest -Uri $GhManifestUrl -OutFile $ManifestPath -UseBasicParsing -ErrorAction Stop
        $Manifest = Get-Content $ManifestPath -Raw | ConvertFrom-Json
        Remove-Item $ManifestPath -Force -ErrorAction SilentlyContinue
    } catch {}
}

if (-not $Manifest) {
    Remove-Item $BinaryPath -Force -ErrorAction SilentlyContinue
    Write-Err "No manifest found — cannot verify binary integrity"
    exit 1
}

$ExpectedHash = Get-ChecksumFromManifest -Manifest $Manifest -Platform $Platform

if (-not $ExpectedHash -or $ExpectedHash.Length -ne 64) {
    Remove-Item $BinaryPath -Force -ErrorAction SilentlyContinue
    Write-Err "Platform $Platform not found in manifest"
    exit 1
}

$ActualHash = (Get-FileHash -Path $BinaryPath -Algorithm SHA256).Hash.ToLower()

if ($ActualHash -ne $ExpectedHash) {
    Remove-Item $BinaryPath -Force -ErrorAction SilentlyContinue
    Write-Err "Checksum verification failed (expected $ExpectedHash, got $ActualHash)"
    exit 1
}

Write-Ok "Checksum verified"

# ── Download agent system prompt ──────────────────────────────────

$AgentMdPath = Join-Path $DownloadDir "agent.md"
Write-Info "Downloading agent system prompt..."

$AgentDownloaded = $false
try {
    Invoke-WebRequest -Uri "$CdnUrl/releases/$Version/agent.md" -OutFile $AgentMdPath -UseBasicParsing -ErrorAction Stop
    $AgentDownloaded = $true
} catch {}

if (-not $AgentDownloaded) {
    try {
        Invoke-WebRequest -Uri "$ReleasesUrl/download/v$Version/agent.md" -OutFile $AgentMdPath -UseBasicParsing -ErrorAction Stop
        $AgentDownloaded = $true
    } catch {}
}

if ($AgentDownloaded) {
    if ($env:XDG_CONFIG_HOME) { $ConfDir = Join-Path $env:XDG_CONFIG_HOME "jeriko" } else { $ConfDir = Join-Path $HOME ".config" "jeriko" }
    if (-not (Test-Path $ConfDir)) { New-Item -ItemType Directory -Path $ConfDir -Force | Out-Null }
    Copy-Item $AgentMdPath (Join-Path $ConfDir "agent.md") -Force
    Write-Ok "Agent prompt installed"
} else {
    Write-Warn "Could not download agent.md — run 'jeriko init' to configure"
}

# ── Self-install via binary ──────────────────────────────────────

Write-Info "Running self-install..."
& $BinaryPath install $Version
$InstallExit = $LASTEXITCODE

# ── Cleanup ──────────────────────────────────────────────────────

Remove-Item $BinaryPath -Force -ErrorAction SilentlyContinue
Remove-Item $AgentMdPath -Force -ErrorAction SilentlyContinue

if ($InstallExit -ne 0) {
    Write-Err "Self-install failed (exit code $InstallExit)"
    exit $InstallExit
}

Write-Host ""
Write-Host "  Installation complete!" -ForegroundColor Green
Write-Host ""
Write-Host "  Documentation: " -NoNewline; Write-Host "https://jeriko.ai/docs" -ForegroundColor Blue
Write-Host ""
